/**
 * AI 配置外部化测试
 *
 * 覆盖范围：
 * - ai/rules.md 读取与 fallback
 * - ai/memory.md 读取、写入、持久化
 * - main.js system prompt 注入
 * - 记忆写入机制（退出时摘要生成）
 * - 边界条件（文件缺失、体积过大、API 失败、无 Key）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Import the module under test
const {
  createAIManager,
  loadRules,
  loadMemory,
  buildSystemPrompt,
  trimMemoryToDays,
  DEFAULT_PROMPT,
  MAX_MEMORY_DAYS,
  MAX_HISTORY,
} = require('../ai-manager.js');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-config-test-'));
  fs.mkdirSync(path.join(tmpDir, 'ai'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================
//  1. ai/rules.md — 读取与 fallback
// ============================================================

describe('ai/rules.md 文件读取', () => {
  it('启动时读取 ai/rules.md 文件内容', () => {
    const rulesContent = '# 测试规则\n你是一个测试火柴人';
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), rulesContent, 'utf8');
    const rules = loadRules(tmpDir);
    expect(rules).toBe(rulesContent);
  });

  it('rules.md 内容作为 system prompt 的一部分注入 conversationHistory', () => {
    const rulesContent = '自定义规则内容';
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), rulesContent, 'utf8');
    const mgr = createAIManager({ baseDir: tmpDir });
    const history = mgr.getConversationHistory();
    expect(history[0].role).toBe('system');
    expect(history[0].content).toContain(rulesContent);
  });

  it('rules.md 不存在时使用内置默认 prompt（当前硬编码值）', () => {
    // Ensure no rules.md exists
    try { fs.unlinkSync(path.join(tmpDir, 'ai', 'rules.md')); } catch (_) {}
    const rules = loadRules(tmpDir);
    expect(rules).toBe(DEFAULT_PROMPT);
  });

  it('rules.md 不存在时打印警告日志', () => {
    try { fs.unlinkSync(path.join(tmpDir, 'ai', 'rules.md')); } catch (_) {}
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loadRules(tmpDir);
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('rules.md');
    warnSpy.mockRestore();
  });

  it('rules.md 内容变更后重启生效', () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '内容A', 'utf8');
    const mgr1 = createAIManager({ baseDir: tmpDir });
    expect(mgr1.getSystemPrompt()).toContain('内容A');

    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '内容B', 'utf8');
    const mgr2 = createAIManager({ baseDir: tmpDir });
    expect(mgr2.getSystemPrompt()).toContain('内容B');
  });
});

// ============================================================
//  2. ai/memory.md — 读取
// ============================================================

describe('ai/memory.md 启动时读取', () => {
  it('启动时读取 ai/memory.md 全文内容', () => {
    const memoryContent = '## 2026-03-10\n- 第一次启动';
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), memoryContent, 'utf8');
    const memory = loadMemory(tmpDir);
    expect(memory).toBe(memoryContent);
  });

  it('memory.md 内容拼接到 system prompt 后面作为长期记忆上下文', () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '基础规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '## 2026-03-10\n- 记忆条目', 'utf8');
    const mgr = createAIManager({ baseDir: tmpDir });
    const prompt = mgr.getSystemPrompt();
    expect(prompt).toContain('基础规则');
    expect(prompt).toContain('记忆条目');
  });

  it('memory.md 不存在时自动创建空文件', () => {
    const memPath = path.join(tmpDir, 'ai', 'memory.md');
    // Ensure it doesn't exist
    try { fs.unlinkSync(memPath); } catch (_) {}
    loadMemory(tmpDir);
    expect(fs.existsSync(memPath)).toBe(true);
    expect(fs.readFileSync(memPath, 'utf8')).toBe('');
  });

  it('memory.md 不存在时正常启动不报错', () => {
    try { fs.unlinkSync(path.join(tmpDir, 'ai', 'memory.md')); } catch (_) {}
    expect(() => {
      createAIManager({ baseDir: tmpDir });
    }).not.toThrow();
  });
});

// ============================================================
//  3. ai/memory.md — 体积过大截取
// ============================================================

describe('ai/memory.md 体积过大处理', () => {
  it('只读取最近 30 天的记录', () => {
    // Generate 60 days of entries
    const lines = [];
    for (let i = 60; i >= 1; i--) {
      const d = new Date(2026, 2, 11);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      lines.push(`## ${dateStr}\n- 第${i}天的记录`);
    }
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), lines.join('\n\n') + '\n', 'utf8');
    const memory = loadMemory(tmpDir);

    // Should only contain last 30 sections
    const sections = memory.split(/(?=^## \d{4}-\d{2}-\d{2})/m).filter(s => s.trim());
    expect(sections.length).toBe(30);
  });

  it('按 ## 日期 标题截取，不破坏条目完整性', () => {
    const lines = [];
    for (let i = 40; i >= 1; i--) {
      const d = new Date(2026, 2, 11);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      lines.push(`## ${dateStr}\n- 事件A\n- 事件B\n- 事件C`);
    }
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), lines.join('\n\n') + '\n', 'utf8');
    const memory = loadMemory(tmpDir);

    // The earliest section should be complete (has all 3 items)
    const sections = memory.split(/(?=^## \d{4}-\d{2}-\d{2})/m).filter(s => s.trim());
    const firstSection = sections[0];
    expect(firstSection).toContain('- 事件A');
    expect(firstSection).toContain('- 事件B');
    expect(firstSection).toContain('- 事件C');
  });

  it('不足 30 天的记录全部读取', () => {
    const lines = [];
    for (let i = 10; i >= 1; i--) {
      const d = new Date(2026, 2, 11);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      lines.push(`## ${dateStr}\n- 第${i}天记录`);
    }
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), lines.join('\n\n') + '\n', 'utf8');
    const memory = loadMemory(tmpDir);

    const sections = memory.split(/(?=^## \d{4}-\d{2}-\d{2})/m).filter(s => s.trim());
    expect(sections.length).toBe(10);
  });
});

// ============================================================
//  4. 运行时对话记忆（不变）
// ============================================================

describe('运行时短期对话记忆（行为不变）', () => {
  it('conversationHistory 仍在内存中维护', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"action":"idle","thought":"无聊"}' } }] }),
    });
    const mgr = createAIManager({ baseDir: tmpDir, apiKey: 'test-key', fetchFn: mockFetch });
    await mgr.decide('context1');
    await mgr.decide('context2');
    // system + 2*(user+assistant) = 5
    expect(mgr.getConversationHistory().length).toBe(5);
  });

  it('对话历史超过 MAX_HISTORY 时裁剪最旧条目', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"action":"idle","thought":"ok"}' } }] }),
    });
    const mgr = createAIManager({ baseDir: tmpDir, apiKey: 'test-key', fetchFn: mockFetch });
    // Fill beyond MAX_HISTORY
    for (let i = 0; i < MAX_HISTORY; i++) {
      await mgr.decide(`msg${i}`);
    }
    expect(mgr.getConversationHistory().length).toBeLessThanOrEqual(MAX_HISTORY + 1);
  });

  it('裁剪时保留 system prompt（index 0）不删除', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"action":"idle","thought":"ok"}' } }] }),
    });
    const mgr = createAIManager({ baseDir: tmpDir, apiKey: 'test-key', fetchFn: mockFetch });
    for (let i = 0; i < MAX_HISTORY; i++) {
      await mgr.decide(`msg${i}`);
    }
    expect(mgr.getConversationHistory()[0].role).toBe('system');
  });
});

// ============================================================
//  5. 退出时记忆写入
// ============================================================

describe('退出时记忆持久化', () => {
  it('app before-quit 事件触发记忆写入流程', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '', 'utf8');

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"action":"idle","thought":"hi"}' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '- 打了个招呼' } }] }),
      });

    const mgr = createAIManager({ baseDir: tmpDir, apiKey: 'test-key', fetchFn: mockFetch });
    await mgr.decide('你好');
    await mgr.saveMemory();

    // saveMemory should have called fetch a second time
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('从当次 conversationHistory 提取当天事件生成摘要', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '', 'utf8');

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"action":"dance","thought":"跳舞"}' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '- 跳了一支舞' } }] }),
      });

    const mgr = createAIManager({ baseDir: tmpDir, apiKey: 'test-key', fetchFn: mockFetch });
    await mgr.decide('跳个舞');
    await mgr.saveMemory();

    // The summary API call should include conversation content
    const summaryCall = mockFetch.mock.calls[1];
    const body = JSON.parse(summaryCall[1].body);
    expect(body.messages[0].content).toContain('跳个舞');
  });

  it('摘要生成调用 DeepSeek API，prompt 包含正确指令', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '', 'utf8');

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"action":"idle","thought":"ok"}' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '- 发呆了一会' } }] }),
      });

    const mgr = createAIManager({ baseDir: tmpDir, apiKey: 'test-key', fetchFn: mockFetch });
    await mgr.decide('test');
    await mgr.saveMemory();

    const summaryCall = mockFetch.mock.calls[1];
    const body = JSON.parse(summaryCall[1].body);
    expect(body.messages[0].content).toContain('将以下对话总结为当天简要记录');
  });

  it('摘要格式为 - 列表，每条不超过 15 字', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '', 'utf8');

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"action":"idle","thought":"ok"}' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '- 发呆' } }] }),
      });

    const mgr = createAIManager({ baseDir: tmpDir, apiKey: 'test-key', fetchFn: mockFetch });
    await mgr.decide('test');
    await mgr.saveMemory();

    const summaryCall = mockFetch.mock.calls[1];
    const body = JSON.parse(summaryCall[1].body);
    expect(body.messages[0].content).toContain('每条不超过15字');
    expect(body.messages[0].content).toContain('- 列表格式');
  });

  it('摘要追加到 ai/memory.md 末尾，带当天日期标题', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '## 2026-03-09\n- 旧记录\n', 'utf8');

    const today = new Date().toISOString().split('T')[0];
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"action":"idle","thought":"ok"}' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '- 新记录' } }] }),
      });

    const mgr = createAIManager({ baseDir: tmpDir, apiKey: 'test-key', fetchFn: mockFetch });
    await mgr.decide('test');
    await mgr.saveMemory();

    const content = fs.readFileSync(path.join(tmpDir, 'ai', 'memory.md'), 'utf8');
    expect(content).toContain('## 2026-03-09');
    expect(content).toContain(`## ${today}`);
    expect(content).toContain('- 新记录');
  });

  it('同一天多次启动退出，追加到同一日期段落下', async () => {
    const today = new Date().toISOString().split('T')[0];
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), `## ${today}\n- 早上的记录\n`, 'utf8');

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"action":"idle","thought":"ok"}' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '- 下午的记录' } }] }),
      });

    const mgr = createAIManager({ baseDir: tmpDir, apiKey: 'test-key', fetchFn: mockFetch });
    await mgr.decide('test');
    await mgr.saveMemory();

    const content = fs.readFileSync(path.join(tmpDir, 'ai', 'memory.md'), 'utf8');
    // Should not duplicate date header
    const headerCount = content.split(`## ${today}`).length - 1;
    expect(headerCount).toBe(1);
    expect(content).toContain('- 早上的记录');
    expect(content).toContain('- 下午的记录');
  });
});

// ============================================================
//  6. 退出时 API 调用失败
// ============================================================

describe('退出时 API 调用失败处理', () => {
  it('API 网络错误时跳过摘要写入', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '原始内容', 'utf8');

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"action":"idle","thought":"ok"}' } }] }),
      })
      .mockRejectedValueOnce(new Error('Network error'));

    const mgr = createAIManager({ baseDir: tmpDir, apiKey: 'test-key', fetchFn: mockFetch });
    await mgr.decide('test');
    await mgr.saveMemory();

    const content = fs.readFileSync(path.join(tmpDir, 'ai', 'memory.md'), 'utf8');
    expect(content).toBe('原始内容');
  });

  it('API 返回非 200 时跳过摘要写入', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '原始内容', 'utf8');

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"action":"idle","thought":"ok"}' } }] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

    const mgr = createAIManager({ baseDir: tmpDir, apiKey: 'test-key', fetchFn: mockFetch });
    await mgr.decide('test');
    await mgr.saveMemory();

    const content = fs.readFileSync(path.join(tmpDir, 'ai', 'memory.md'), 'utf8');
    expect(content).toBe('原始内容');
  });

  it('API 失败时不影响退出流程（不阻塞 quit）', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '', 'utf8');

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"action":"idle","thought":"ok"}' } }] }),
      })
      .mockRejectedValueOnce(new Error('fail'));

    const mgr = createAIManager({ baseDir: tmpDir, apiKey: 'test-key', fetchFn: mockFetch });
    await mgr.decide('test');
    // Should not throw
    await expect(mgr.saveMemory()).resolves.not.toThrow();
  });

  it('API 失败时打印警告日志', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '', 'utf8');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"action":"idle","thought":"ok"}' } }] }),
      })
      .mockRejectedValueOnce(new Error('Network error'));

    const mgr = createAIManager({ baseDir: tmpDir, apiKey: 'test-key', fetchFn: mockFetch });
    await mgr.decide('test');
    await mgr.saveMemory();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ============================================================
//  7. 无 API Key 场景
// ============================================================

describe('无 API Key 场景', () => {
  it('无 API Key 时 rules.md 仍正常读取', () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '自定义规则', 'utf8');
    const mgr = createAIManager({ baseDir: tmpDir, apiKey: '' });
    expect(mgr.getSystemPrompt()).toContain('自定义规则');
  });

  it('无 API Key 时 memory.md 不写入（无对话可总结）', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '', 'utf8');

    const mgr = createAIManager({ baseDir: tmpDir, apiKey: '' });
    await mgr.decide('test'); // returns null, no conversation
    await mgr.saveMemory();

    const content = fs.readFileSync(path.join(tmpDir, 'ai', 'memory.md'), 'utf8');
    expect(content).toBe('');
  });

  it('无 API Key 时 memory.md 已有内容仍可读取注入 prompt', () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '## 2026-03-10\n- 历史记录', 'utf8');

    const mgr = createAIManager({ baseDir: tmpDir, apiKey: '' });
    expect(mgr.getSystemPrompt()).toContain('历史记录');
  });
});

// ============================================================
//  8. 文件被用户手动编辑
// ============================================================

describe('用户手动编辑文件', () => {
  it('手动修改 rules.md 后重启，新内容生效', () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '内容A', 'utf8');
    const mgr1 = createAIManager({ baseDir: tmpDir });
    expect(mgr1.getSystemPrompt()).toContain('内容A');

    // Simulate manual edit
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '内容B', 'utf8');
    const mgr2 = createAIManager({ baseDir: tmpDir });
    expect(mgr2.getSystemPrompt()).toContain('内容B');
  });

  it('手动修改 memory.md 后重启，新记忆生效', () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '## 2026-03-10\n- 自动记忆', 'utf8');
    const mgr1 = createAIManager({ baseDir: tmpDir });
    expect(mgr1.getSystemPrompt()).toContain('自动记忆');

    // Manual edit
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '## 2026-03-10\n- 手动编辑的记忆', 'utf8');
    const mgr2 = createAIManager({ baseDir: tmpDir });
    expect(mgr2.getSystemPrompt()).toContain('手动编辑的记忆');
  });

  it('手动清空 memory.md 后重启，从空白记忆开始', () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '规则', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '', 'utf8');
    const mgr = createAIManager({ baseDir: tmpDir });
    // System prompt should be just the rules, no memory section
    expect(mgr.getSystemPrompt()).toBe('规则');
    expect(mgr.getSystemPrompt()).not.toContain('长期记忆');
  });
});

// ============================================================
//  9. 文件结构与路径
// ============================================================

describe('文件结构', () => {
  it('ai/ 目录位于项目根目录下', () => {
    const aiDir = path.join(tmpDir, 'ai');
    expect(fs.existsSync(aiDir)).toBe(true);
    expect(fs.statSync(aiDir).isDirectory()).toBe(true);
  });

  it('rules.md 路径为 ai/rules.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), 'test', 'utf8');
    const rules = loadRules(tmpDir);
    expect(rules).toBe('test');
  });

  it('memory.md 路径为 ai/memory.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '## 2026-03-10\n- test', 'utf8');
    const memory = loadMemory(tmpDir);
    expect(memory).toContain('test');
  });
});

// ============================================================
//  10. system prompt 拼接顺序
// ============================================================

describe('system prompt 组装', () => {
  it('system prompt 中 rules 内容在 memory 内容之前', () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), 'RULES_HERE', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '## 2026-03-10\n- MEMORY_HERE', 'utf8');
    const mgr = createAIManager({ baseDir: tmpDir });
    const prompt = mgr.getSystemPrompt();
    const rulesIdx = prompt.indexOf('RULES_HERE');
    const memIdx = prompt.indexOf('MEMORY_HERE');
    expect(rulesIdx).toBeLessThan(memIdx);
  });

  it('memory 为空时 system prompt 仅包含 rules 内容', () => {
    fs.writeFileSync(path.join(tmpDir, 'ai', 'rules.md'), '仅规则内容', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'ai', 'memory.md'), '', 'utf8');
    const mgr = createAIManager({ baseDir: tmpDir });
    expect(mgr.getSystemPrompt()).toBe('仅规则内容');
  });
});
