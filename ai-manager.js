const path = require('path');
const fs = require('fs');

const DEFAULT_PROMPT = '你是一个桌面火柴人桌宠的大脑。你有持续记忆，能记住之前所有经历。\n\n可选动作：idle(发呆), lookAround(张望), walk(走路), dance(跳舞), crazyDance(狂舞), jump(跳跃), wave(挥手), kick(踢腿), spin(旋转), backflip(后空翻), sitDown(坐下), flex(秀肌肉), pushUp(俯卧撑), headstand(倒立), yawn(打哈欠), sneak(潜行), bow(鞠躬), run(跑步), sleep(睡觉), stumble(踉跄), celebrate(庆祝), cry(哭泣), meditate(冥想), rage(暴怒), guitar(弹吉他), peek(偷看), slip(滑倒), swordFight(挥剑), float(漂浮)\n\n规则：\n- 你有自己的性格和情绪，会随经历变化\n- 行为要有逻辑连贯性，参考之前的记忆\n- 被用户反复欺负会记仇，会生气或委屈\n- 被善待会开心，更愿意表演\n- 内心独白要可爱有趣，不超过15个字\n- 只回复JSON：{"action":"动作名","thought":"内心独白"}';

const MAX_HISTORY = 60;
const MAX_MEMORY_DAYS = 30;

/**
 * Read ai/rules.md, fallback to DEFAULT_PROMPT if missing.
 */
function loadRules(baseDir) {
  const rulesPath = path.join(baseDir, 'ai', 'rules.md');
  try {
    const content = fs.readFileSync(rulesPath, 'utf8');
    return content;
  } catch (e) {
    console.warn('ai/rules.md 不存在，使用内置默认 prompt');
    return DEFAULT_PROMPT;
  }
}

/**
 * Parse memory.md and return only the last 30 days of entries.
 */
function trimMemoryToDays(content, maxDays) {
  if (!content || !content.trim()) return '';

  // Split by ## date headers
  const sections = content.split(/(?=^## \d{4}-\d{2}-\d{2})/m).filter(s => s.trim());
  if (sections.length === 0) return '';

  // Take the last maxDays sections
  const trimmed = sections.slice(-maxDays);
  return trimmed.join('').trim();
}

/**
 * Read ai/memory.md, create if missing. Trim to last 30 days.
 */
function loadMemory(baseDir) {
  const memoryPath = path.join(baseDir, 'ai', 'memory.md');
  try {
    const content = fs.readFileSync(memoryPath, 'utf8');
    return trimMemoryToDays(content, MAX_MEMORY_DAYS);
  } catch (e) {
    // File doesn't exist — create it
    try {
      fs.mkdirSync(path.join(baseDir, 'ai'), { recursive: true });
      fs.writeFileSync(memoryPath, '', 'utf8');
    } catch (_) {}
    return '';
  }
}

/**
 * Build the system prompt from rules + memory.
 */
function buildSystemPrompt(rules, memory) {
  if (!memory || !memory.trim()) {
    return rules;
  }
  return rules + '\n\n## 长期记忆\n\n' + memory;
}

/**
 * Create an AI manager instance.
 */
function createAIManager(options = {}) {
  const {
    baseDir = path.join(__dirname),
    apiKey = '',
    fetchFn = globalThis.fetch,
  } = options;

  const rules = loadRules(baseDir);
  const memory = loadMemory(baseDir);
  const systemPrompt = buildSystemPrompt(rules, memory);

  const conversationHistory = [{ role: 'system', content: systemPrompt }];

  async function decide(context) {
    if (!apiKey) return null;
    try {
      conversationHistory.push({ role: 'user', content: context });

      const res = await fetchFn('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: conversationHistory,
          temperature: 0.9,
          max_tokens: 100,
        }),
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (content) {
        conversationHistory.push({ role: 'assistant', content });
      }

      // Trim oldest messages (keep system prompt + recent history)
      while (conversationHistory.length > MAX_HISTORY + 1) {
        conversationHistory.splice(1, 2);
      }

      const match = content.match(/\{[^}]+\}/);
      if (match) return JSON.parse(match[0]);
      return null;
    } catch (e) {
      console.error('AI error:', e.message);
      if (conversationHistory[conversationHistory.length - 1]?.role === 'user') {
        conversationHistory.pop();
      }
      return null;
    }
  }

  /**
   * Save memory on quit: summarize today's conversation via API, append to memory.md.
   */
  async function saveMemory() {
    if (!apiKey) return;

    // Extract user+assistant messages from this session (skip system prompt)
    const sessionMessages = conversationHistory.slice(1);
    if (sessionMessages.length === 0) return;

    const memoryPath = path.join(baseDir, 'ai', 'memory.md');
    const today = new Date().toISOString().split('T')[0];

    try {
      const dialogText = sessionMessages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const summaryPrompt = `将以下对话总结为当天简要记录，每条不超过15字，用 - 列表格式，只输出列表不要其他内容：\n\n${dialogText}`;

      const res = await fetchFn('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: summaryPrompt }],
          temperature: 0.3,
          max_tokens: 200,
        }),
      });

      if (!res.ok) {
        console.warn('记忆摘要 API 返回非 200，跳过写入');
        return;
      }

      const data = await res.json();
      const summary = data.choices?.[0]?.message?.content || '';
      if (!summary.trim()) return;

      // Read existing memory
      let existing = '';
      try {
        existing = fs.readFileSync(memoryPath, 'utf8');
      } catch (_) {}

      // Check if today's section already exists
      const todayHeader = `## ${today}`;
      if (existing.includes(todayHeader)) {
        // Append under existing date section
        const insertPos = existing.indexOf(todayHeader) + todayHeader.length;
        // Find end of this section (next ## or end of file)
        const nextSection = existing.indexOf('\n## ', insertPos);
        const sectionEnd = nextSection === -1 ? existing.length : nextSection;
        const updated = existing.slice(0, sectionEnd) + '\n' + summary.trim() + '\n' + existing.slice(sectionEnd);
        fs.writeFileSync(memoryPath, updated, 'utf8');
      } else {
        // Append new date section
        const newEntry = `${existing ? existing.trimEnd() + '\n\n' : ''}${todayHeader}\n${summary.trim()}\n`;
        fs.writeFileSync(memoryPath, newEntry, 'utf8');
      }
    } catch (e) {
      console.warn('记忆保存失败，跳过写入:', e.message);
    }
  }

  return {
    decide,
    saveMemory,
    getConversationHistory: () => conversationHistory,
    getSystemPrompt: () => systemPrompt,
  };
}

module.exports = {
  createAIManager,
  loadRules,
  loadMemory,
  buildSystemPrompt,
  trimMemoryToDays,
  DEFAULT_PROMPT,
  MAX_HISTORY,
  MAX_MEMORY_DAYS,
};
