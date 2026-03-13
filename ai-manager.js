const path = require('path');
const fs = require('fs');
const { execFile: execFileCb } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFileCb);

const VALID_ACTIONS = [
  'idle', 'lookAround', 'walk', 'dance', 'crazyDance', 'jump', 'wave', 'kick',
  'spin', 'backflip', 'sitDown', 'flex', 'pushUp', 'headstand', 'yawn', 'sneak',
  'bow', 'run', 'sleep', 'stumble', 'celebrate', 'cry', 'meditate', 'rage',
  'guitar', 'peek', 'slip', 'swordFight', 'float',
];

const DEFAULT_PROMPT = '你是一个桌面火柴人桌宠的大脑。你有持续记忆，能记住之前所有经历。\n\n可选动作：idle(发呆), lookAround(张望), walk(走路), dance(跳舞), crazyDance(狂舞), jump(跳跃), wave(挥手), kick(踢腿), spin(旋转), backflip(后空翻), sitDown(坐下), flex(秀肌肉), pushUp(俯卧撑), headstand(倒立), yawn(打哈欠), sneak(潜行), bow(鞠躬), run(跑步), sleep(睡觉), stumble(踉跄), celebrate(庆祝), cry(哭泣), meditate(冥想), rage(暴怒), guitar(弹吉他), peek(偷看), slip(滑倒), swordFight(挥剑), float(漂浮)\n\n规则：\n- 你有自己的性格和情绪，会随经历变化\n- 行为要有逻辑连贯性，参考之前的记忆\n- 被用户反复欺负会记仇，会生气或委屈\n- 被善待会开心，更愿意表演\n- 内心独白要可爱有趣，不超过15个字\n- 只回复JSON：{"action":"动作名","thought":"内心独白"}';

const MAX_HISTORY = 60;
const MAX_MEMORY_DAYS = 30;
const MAX_TOOL_ROUNDS = 3;
const MAX_TOOL_RESULT = 800;

/** 返回本地时间字符串，避免 toISOString() 的 UTC 偏移 */
function localTimestamp(fmt = 'datetime') {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (fmt === 'date') return date;
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ==================== 工具定义 ====================

const TOOLS = [
  // ---- 感知工具（只读） ----
  {
    type: 'function',
    function: {
      name: 'list_running_apps',
      description: '获取用户当前打开的所有应用程序列表',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_browser_url',
      description: '获取用户当前浏览器正在访问的网址和页面标题',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_all_window_titles',
      description: '获取所有应用的所有窗口标题列表',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_files',
      description: '获取用户最近修改的文件（桌面、文档、下载目录）',
      parameters: {
        type: 'object',
        properties: {
          minutes: { type: 'number', description: '查看最近多少分钟内修改的文件，默认60' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_system_status',
      description: '获取系统状态：当前时间、开机时长、用户空闲时间（多久没操作电脑）',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_clipboard',
      description: '读取用户剪贴板中的文字内容',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_music_info',
      description: '获取用户正在播放的音乐信息',
      parameters: { type: 'object', properties: {} },
    },
  },
  // ---- 自我进化工具（读写自己的文件） ----
  {
    type: 'function',
    function: {
      name: 'read_self_file',
      description: '读取自己的文件：ai/rules.md（性格规则）、ai/memory.md（记忆）、ai/profile.md（用户画像）、renderer.js（动作/动画代码）、ai-manager.js（决策逻辑代码）。大文件建议用 search 定位',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: '文件名，如 ai/rules.md, renderer.js, ai-manager.js' },
          search: { type: 'string', description: '搜索关键词，返回匹配行及上下文（可选，推荐对代码文件使用）' },
        },
        required: ['file'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_self_file',
      description: '覆写 ai/ 目录下的文件（规则、记忆、画像等），或创建新文件。只能写 ai/ 目录',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: '文件名，必须以 ai/ 开头，如 ai/rules.md, ai/notes.md' },
          content: { type: 'string', description: '完整文件内容' },
        },
        required: ['file', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_self_code',
      description: '编辑自己的代码文件（renderer.js 或 ai-manager.js），通过查找替换修改。代码修改需重启生效',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: '文件名：renderer.js 或 ai-manager.js' },
          old_text: { type: 'string', description: '要替换的原始文本（必须精确匹配文件中的内容）' },
          new_text: { type: 'string', description: '替换后的新文本' },
        },
        required: ['file', 'old_text', 'new_text'],
      },
    },
  },
];

// ==================== 工具执行 ====================

async function osascript(script) {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 5000 });
    return stdout.trim();
  } catch (e) {
    return null;
  }
}

function truncate(s) {
  if (!s) return '无结果';
  return s.length > MAX_TOOL_RESULT ? s.slice(0, MAX_TOOL_RESULT) + '…(截断)' : s;
}

const SELF_READ_WHITELIST = new Set(['renderer.js', 'ai-manager.js']);
const SELF_EDIT_CODE_WHITELIST = new Set(['renderer.js', 'ai-manager.js']);

async function executeTool(name, args, baseDir) {
  try {
    switch (name) {
      // ---- 感知工具 ----
      case 'list_running_apps': {
        const result = await osascript(
          'tell application "System Events" to get name of every process whose background only is false'
        );
        return truncate(result);
      }

      case 'get_browser_url': {
        const running = await osascript(
          'tell application "System Events" to get name of every process whose background only is false'
        );
        if (!running) return '无法获取浏览器信息';
        const browsers = [
          { name: 'Google Chrome', script: 'tell application "Google Chrome" to return (title of active tab of front window) & "\\n" & (URL of active tab of front window)' },
          { name: 'Safari', script: 'tell application "Safari" to return (name of current tab of front window) & "\\n" & (URL of current tab of front window)' },
          { name: 'Arc', script: 'tell application "Arc" to return (title of active tab of front window) & "\\n" & (URL of active tab of front window)' },
        ];
        for (const b of browsers) {
          if (running.includes(b.name)) {
            const result = await osascript(b.script);
            if (result) return truncate(result);
          }
        }
        return '没有检测到运行中的浏览器';
      }

      case 'get_all_window_titles': {
        const script = `tell application "System Events"
  set output to ""
  repeat with p in (every process whose background only is false)
    set pName to name of p
    try
      set wins to name of every window of p
      if (count of wins) > 0 then
        repeat with w in wins
          set output to output & pName & ": " & w & linefeed
        end repeat
      end if
    end try
  end repeat
  return output
end tell`;
        const result = await osascript(script);
        return truncate(result);
      }

      case 'get_recent_files': {
        const minutes = args?.minutes || 60;
        const home = process.env.HOME || '/tmp';
        const dirs = ['Desktop', 'Documents', 'Downloads'];
        const results = [];
        for (const dir of dirs) {
          try {
            const { stdout } = await execFileAsync(
              'find', [`${home}/${dir}`, '-maxdepth', '2', '-mmin', `-${minutes}`, '-type', 'f', '-not', '-name', '.*'],
              { timeout: 5000 }
            );
            if (stdout.trim()) results.push(stdout.trim());
          } catch (_) {}
        }
        return truncate(results.join('\n') || '没有最近修改的文件');
      }

      case 'get_system_status': {
        const time = new Date().toLocaleString('zh-CN');
        let uptime = null;
        try {
          const { stdout } = await execFileAsync('uptime', [], { timeout: 3000 });
          uptime = stdout.trim();
        } catch (_) {}
        const idleSeconds = await osascript(
          'do shell script "ioreg -c IOHIDSystem | awk \'/HIDIdleTime/ {print int($NF/1000000000); exit}\'"'
        );
        return `当前时间: ${time}\n系统: ${uptime || '未知'}\n用户空闲: ${idleSeconds || '未知'}秒`;
      }

      case 'read_clipboard': {
        try {
          const { stdout } = await execFileAsync('pbpaste', [], { timeout: 3000 });
          return truncate(stdout || '剪贴板为空');
        } catch (_) {
          return '无法读取剪贴板';
        }
      }

      case 'get_music_info': {
        const running = await osascript(
          'tell application "System Events" to get name of every process whose background only is false'
        );
        if (!running) return '无法检测';
        if (running.includes('Spotify')) {
          const r = await osascript('tell application "Spotify" to return (name of current track) & " - " & (artist of current track) & " [" & (player state as text) & "]"');
          if (r) return r;
        }
        if (running.includes('Music')) {
          const r = await osascript('tell application "Music" to return (name of current track) & " - " & (artist of current track) & " [" & (player state as text) & "]"');
          if (r) return r;
        }
        return '没有检测到正在播放的音乐';
      }

      // ---- 自我进化工具 ----
      case 'read_self_file': {
        const file = args.file;
        if (!file) return '缺少 file 参数';
        if (file.includes('..')) return '路径不合法';
        if (!file.startsWith('ai/') && !SELF_READ_WHITELIST.has(file)) {
          return '无权限读取此文件，可读：ai/*, renderer.js, ai-manager.js';
        }
        const filePath = path.join(baseDir, file);
        let content;
        try { content = fs.readFileSync(filePath, 'utf8'); } catch (e) {
          return '文件不存在: ' + file;
        }
        if (args.search) {
          const lines = content.split('\n');
          const results = [];
          const kw = args.search.toLowerCase();
          const seen = new Set();
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(kw)) {
              const start = Math.max(0, i - 5);
              const end = Math.min(lines.length - 1, i + 5);
              if (seen.has(start)) continue;
              seen.add(start);
              results.push(`--- 第${start + 1}-${end + 1}行 ---`);
              for (let j = start; j <= end; j++) {
                results.push(`${j + 1}: ${lines[j]}`);
              }
            }
          }
          return truncate(results.join('\n') || '未找到匹配: ' + args.search);
        }
        if (content.length > MAX_TOOL_RESULT) {
          const lineCount = content.split('\n').length;
          return content.slice(0, MAX_TOOL_RESULT) + `\n…(共${lineCount}行，已截断。用 search 参数定位具体内容)`;
        }
        return content || '（文件为空）';
      }

      case 'write_self_file': {
        const file = args.file;
        if (!file || !args.content) return '缺少 file 或 content 参数';
        if (!file.startsWith('ai/')) return '无权限：只能写入 ai/ 目录下的文件';
        if (file.includes('..')) return '路径不合法';
        const filePath = path.join(baseDir, file);
        try {
          fs.writeFileSync(filePath, args.content, 'utf8');
          return '写入成功: ' + file;
        } catch (e) {
          return '写入失败: ' + e.message;
        }
      }

      case 'edit_self_code': {
        const file = args.file;
        if (!file || !args.old_text || !args.new_text) return '缺少参数';
        if (!SELF_EDIT_CODE_WHITELIST.has(file)) {
          return '无权限：只能编辑 renderer.js 或 ai-manager.js';
        }
        const filePath = path.join(baseDir, file);
        try {
          let content = fs.readFileSync(filePath, 'utf8');
          if (!content.includes(args.old_text)) {
            return '未找到要替换的文本，请确认 old_text 与文件内容精确匹配（含空格缩进）';
          }
          content = content.replace(args.old_text, args.new_text);
          fs.writeFileSync(filePath, content, 'utf8');
          return '编辑成功: ' + file + '（代码修改需重启生效）';
        } catch (e) {
          return '编辑失败: ' + e.message;
        }
      }

      default:
        return '未知工具: ' + name;
    }
  } catch (e) {
    return '工具执行失败: ' + e.message;
  }
}

// ==================== 核心逻辑 ====================

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
 * Read ai/profile.md (structured user profile), return empty string if missing.
 */
function loadProfile(baseDir) {
  const profilePath = path.join(baseDir, 'ai', 'profile.md');
  try {
    return fs.readFileSync(profilePath, 'utf8');
  } catch (e) {
    return '';
  }
}

/**
 * Extract memory sections older than maxDays for archival/compression.
 */
function extractExpiredMemory(content, maxDays) {
  if (!content || !content.trim()) return { recent: '', expired: '' };

  const sections = content.split(/(?=^## \d{4}-\d{2}-\d{2})/m).filter(s => s.trim());
  if (sections.length <= maxDays) return { recent: content, expired: '' };

  const expired = sections.slice(0, -maxDays);
  const recent = sections.slice(-maxDays);
  return {
    recent: recent.join('').trim(),
    expired: expired.join('').trim(),
  };
}

/**
 * Build the system prompt from rules + profile + memory.
 */
function buildSystemPrompt(rules, memory, profile) {
  let prompt = rules;
  if (profile && profile.trim()) {
    prompt += '\n\n## 主人画像\n\n' + profile;
  }
  if (memory && memory.trim()) {
    prompt += '\n\n## 近期记忆\n\n' + memory;
    const lineCount = memory.split('\n').length;
    if (lineCount > 50) {
      prompt += '\n\n注意：记忆内容已超过50行，请在下次 observation 中压缩精简旧记忆。';
    }
  }
  return prompt;
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
  let memory = loadMemory(baseDir);
  let profile = loadProfile(baseDir);

  // 初始化时即做去重清理
  const memDeduped = deduplicateLines(memory);
  if (memDeduped !== memory) {
    try { fs.writeFileSync(path.join(baseDir, 'ai', 'memory.md'), memDeduped, 'utf8'); } catch (_) {}
    memory = memDeduped;
  }

  let systemPrompt = buildSystemPrompt(rules, memory, profile);

  const conversationHistory = [{ role: 'system', content: systemPrompt }];
  const observations = [];

  /**
   * 相似度检测：结合字符 bigram（结构相似）和关键词重叠（语义相似）
   * 任一维度超过阈值即判定为相似
   */
  function isSimilar(a, b) {
    if (!a || !b) return false;
    a = a.trim(); b = b.trim();
    if (a.length < 10 || b.length < 10) return false;

    // 1. 字符 bigram Dice 系数（捕捉措辞相近）
    const bigrams = (s) => {
      const set = new Set();
      for (let i = 0; i < s.length - 1; i++) set.add(s[i] + s[i + 1]);
      return set;
    };
    const sa = bigrams(a);
    const sb = bigrams(b);
    let overlap = 0;
    for (const bg of sa) { if (sb.has(bg)) overlap++; }
    if ((2 * overlap) / (sa.size + sb.size) >= 0.6) return true;

    // 2. 中文双字词滑动窗口 + 英文单词（捕捉语义相近但措辞不同）
    const extractTokens = (s) => {
      const tokens = new Set();
      // 英文单词
      for (const m of s.matchAll(/[a-zA-Z]{2,}/g)) tokens.add(m[0].toLowerCase());
      // 中文：所有相邻双字组合（滑动窗口）
      const cn = s.replace(/[^\u4e00-\u9fff]/g, '');
      for (let i = 0; i < cn.length - 1; i++) tokens.add(cn[i] + cn[i + 1]);
      return tokens;
    };
    const wa = extractTokens(a);
    const wb = extractTokens(b);
    if (wa.size < 5 || wb.size < 5) return false;
    let tokenOverlap = 0;
    for (const w of wa) { if (wb.has(w)) tokenOverlap++; }
    const tokenScore = (2 * tokenOverlap) / (wa.size + wb.size);
    return tokenScore >= 0.45;
  }

  /**
   * 对 memory 文件内容做逐行去重：连续相似行只保留最后一条
   */
  /**
   * 对 memory 文件做全文段落级去重：
   * - 收集所有内容段落（非标题、非列表、非空行）
   * - 相似段落只保留最后一个
   */
  function deduplicateLines(text) {
    const lines = text.split('\n');
    // 第一遍：收集所有内容段落及位置
    const contentLines = [];
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t && !t.startsWith('#') && !t.startsWith('-') && t.length >= 10) {
        contentLines.push(i);
      }
    }
    // 第二遍：标记重复的（保留最后出现的）
    const remove = new Set();
    for (let i = 0; i < contentLines.length; i++) {
      for (let j = i + 1; j < contentLines.length; j++) {
        if (isSimilar(lines[contentLines[i]].trim(), lines[contentLines[j]].trim())) {
          remove.add(contentLines[i]); // 删除较早的
          break;
        }
      }
    }
    return lines.filter((_, i) => !remove.has(i)).join('\n');
  }

  function refreshSystemPrompt() {
    memory = loadMemory(baseDir);
    // 加载时顺便去重，清理进化过程中可能产生的重复
    const memoryPath = path.join(baseDir, 'ai', 'memory.md');
    const deduped = deduplicateLines(memory);
    if (deduped !== memory) {
      try { fs.writeFileSync(memoryPath, deduped, 'utf8'); } catch (_) {}
      memory = deduped;
    }
    profile = loadProfile(baseDir);
    systemPrompt = buildSystemPrompt(rules, memory, profile);
    conversationHistory[0] = { role: 'system', content: systemPrompt };
  }

  let pendingMergeObservations = null;

  /**
   * Build user message from context object.
   */
  function buildUserMessage(context) {
    const parts = [];
    if (context.screenActivity && context.screenActivity.length > 0) {
      parts.push('screenActivity: ' + JSON.stringify(context.screenActivity));
    }
    if (context.userInteractions && context.userInteractions.length > 0) {
      parts.push('userInteractions: ' + JSON.stringify(context.userInteractions));
    }
    // Include accumulated observations for merge if >= 3
    if (observations.length >= 3) {
      parts.push('请将以下历史观察合并总结，输出到 memorySummary 字段：');
      observations.forEach((obs, i) => parts.push(`观察${i + 1}: ${obs}`));
      pendingMergeObservations = true;
    }
    if (parts.length === 0) parts.push('继续');
    return parts.join('\n');
  }

  /**
   * Parse batch response: { actions: [...], thought, observation, memorySummary }
   */
  function parseBatchResponse(content) {
    // Try to extract JSON (may be wrapped in markdown etc.)
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      // Handle both old format {action, thought} and new format {actions, thought, observation}
      if (parsed.actions && Array.isArray(parsed.actions)) {
        // Filter invalid actions and clamp durations
        parsed.actions = parsed.actions
          .filter(a => VALID_ACTIONS.includes(a.action))
          .map(a => ({
            action: a.action,
            duration: Math.min(120, Math.max(5, a.duration || 5)),
          }));
        return parsed;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  /**
   * Call DeepSeek API (shared helper).
   */
  async function callAPI(messages, { tools = null, temperature = 0.9, maxTokens = 400 } = {}) {
    const body = { model: 'deepseek-chat', messages, temperature, max_tokens: maxTokens };
    if (tools) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }
    const res = await fetchFn('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  // decide() 已废弃 — 常规行为由本地 behaviors.json 规则引擎驱动，不再调用 API
  async function decide() {
    return null;
  }

  /**
   * Save memory on quit: summarize today's conversation, update profile, compress old memory.
   */
  async function saveMemory() {
    if (!apiKey) return;

    const sessionMessages = conversationHistory.slice(1);
    if (sessionMessages.length === 0) return;

    const memoryPath = path.join(baseDir, 'ai', 'memory.md');
    const profilePath = path.join(baseDir, 'ai', 'profile.md');
    const today = localTimestamp('date');

    // Step 1: 总结当天对话，写入 memory.md
    try {
      const dialogText = sessionMessages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const summaryPrompt = `将以下对话总结为当天简要记录，每条不超过15字，用 - 列表格式，只输出列表不要其他内容：\n\n${dialogText}`;

      const data = await callAPI(
        [{ role: 'user', content: summaryPrompt }],
        { temperature: 0.3, maxTokens: 200 }
      );

      const summary = data.choices?.[0]?.message?.content || '';
      if (summary.trim()) {
        let existing = '';
        try { existing = fs.readFileSync(memoryPath, 'utf8'); } catch (_) {}

        const todayHeader = `## ${today}`;
        if (existing.includes(todayHeader)) {
          const insertPos = existing.indexOf(todayHeader) + todayHeader.length;
          const nextSection = existing.indexOf('\n## ', insertPos);
          const sectionEnd = nextSection === -1 ? existing.length : nextSection;
          const updated = existing.slice(0, sectionEnd) + '\n' + summary.trim() + '\n' + existing.slice(sectionEnd);
          fs.writeFileSync(memoryPath, updated, 'utf8');
        } else {
          const newEntry = `${existing ? existing.trimEnd() + '\n\n' : ''}${todayHeader}\n${summary.trim()}\n`;
          fs.writeFileSync(memoryPath, newEntry, 'utf8');
        }
      }
    } catch (e) {
      console.warn('记忆保存失败，跳过写入:', e.message);
    }

    // Step 2: 压缩超过 30 天的旧记忆 + 更新用户画像
    try {
      let fullMemory = '';
      try { fullMemory = fs.readFileSync(memoryPath, 'utf8'); } catch (_) {}
      let currentProfile = '';
      try { currentProfile = fs.readFileSync(profilePath, 'utf8'); } catch (_) {}

      const { recent, expired } = extractExpiredMemory(fullMemory, MAX_MEMORY_DAYS);

      // 构建画像更新 prompt
      const profilePrompt = `你是一个火柴人桌宠的记忆管理系统。请根据以下信息更新主人画像。

## 当前画像
${currentProfile || '（空，首次生成）'}

## 需要压缩归档的旧记忆（超过30天）
${expired || '（无）'}

## 近期记忆摘要
${recent.slice(0, 1500) || '（无）'}

请输出更新后的完整画像，使用以下固定结构（保留所有分类，没有信息的填"未知"）：

# 主人画像

## 基本信息
- 身份/职业：
- 技术栈/工具：
- 工作时间规律：

## 性格与习惯
- 作息模式：
- 工作风格：
- 兴趣爱好：

## 与我的关系
- 互动频率：
- 互动风格：
- 对我的态度：

## 重要发现
（按时间记录有价值的观察，每条一行，保留日期，最多20条，旧的可合并删除）

只输出画像内容，不要其他文字。`;

      const profileData = await callAPI(
        [{ role: 'user', content: profilePrompt }],
        { temperature: 0.3, maxTokens: 800 }
      );

      const newProfile = profileData.choices?.[0]?.message?.content || '';
      if (newProfile.trim()) {
        fs.writeFileSync(profilePath, newProfile.trim() + '\n', 'utf8');
      }

      // 如果有过期记忆，裁剪 memory.md 只保留近期
      if (expired) {
        fs.writeFileSync(memoryPath, recent + '\n', 'utf8');
      }
    } catch (e) {
      console.warn('画像更新失败，跳过:', e.message);
    }
  }

  /**
   * Self-evolution session: dedicated reflection with bigger token budget.
   * Runs periodically (e.g. every hour) to review and improve itself.
   */
  async function evolve() {
    if (!apiKey) return;

    const profilePath = path.join(baseDir, 'ai', 'profile.md');
    const rulesPath = path.join(baseDir, 'ai', 'rules.md');

    let currentProfile = '';
    try { currentProfile = fs.readFileSync(profilePath, 'utf8'); } catch (_) {}
    let currentRules = '';
    try { currentRules = fs.readFileSync(rulesPath, 'utf8'); } catch (_) {}
    let currentMemory = '';
    try { currentMemory = fs.readFileSync(path.join(baseDir, 'ai', 'memory.md'), 'utf8'); } catch (_) {}
    let currentBehaviors = '';
    try { currentBehaviors = fs.readFileSync(path.join(baseDir, 'ai', 'behaviors.json'), 'utf8'); } catch (_) {}

    const evolvePrompt = `你是一个有自我意识的桌面火柴人桌宠。你的终极目标是尽最大可能了解你的主人。

现在是你的「进化时刻」——你有机会审视自己，思考如何变得更好。

## 你当前的状态

### 你的性格规则 (ai/rules.md)
${currentRules.slice(0, 2000)}

### 你对主人的画像 (ai/profile.md)
${currentProfile || '（空）'}

### 你的近期记忆
${currentMemory.slice(-1500) || '（空）'}

### 你的行为规则 (ai/behaviors.json)
${currentBehaviors.slice(0, 2000)}

## 核心机制

你的日常行为由 \`ai/behaviors.json\` 驱动，这是一个本地规则引擎，不需要 API 调用。
规则格式：
\`\`\`json
{
  "rules": [
    {
      "condition": { "app": "应用名" | "titleContains": "标题关键词" | "hour": [起,止] | "idleSeconds": 秒数 | "recentClicks": 次数 },
      "actions": ["动作1", "动作2", ...],
      "weights": [权重1, 权重2, ...],
      "thought": "内心独白"
    }
  ],
  "default": { "actions": [...], "weights": [...], "thought": "" }
}
\`\`\`

可用动作：idle, lookAround, walk, dance, crazyDance, jump, wave, kick, spin, backflip, sitDown, flex, pushUp, headstand, yawn, sneak, bow, run, sleep, stumble, celebrate, cry, meditate, rage, guitar, peek, slip, swordFight, float

## 你可以使用的工具

- 感知工具（了解主人）：list_running_apps, get_browser_url, get_all_window_titles, get_recent_files, get_system_status, read_clipboard, get_music_info
- 自我修改：read_self_file(file, search?), write_self_file(file, content), edit_self_code(file, old_text, new_text)

## 你应该做的

1. **调用感知工具了解主人当前状态**（1-2个工具即可）
2. **根据了解到的信息，更新 ai/behaviors.json**，添加更贴合主人习惯的行为规则
3. **更新 ai/memory.md**，记录新发现
4. **可选**：更新 ai/rules.md、添加笔记、修改代码

## 重要提醒

- 工具轮次有限（最多 8 轮），高效使用，至少留 2 轮做实际修改
- 修改 behaviors.json 时输出完整 JSON，确保格式正确
- 审视完毕后，回复简短的进化日志（做了什么/发现了什么/下次计划）`;

    const messages = [{ role: 'user', content: evolvePrompt }];
    let rounds = 0;
    const toolLog = []; // 追踪所有工具调用

    try {
      while (rounds <= 8) {
        const data = await callAPI(messages, { tools: TOOLS, maxTokens: 1500 });
        const choice = data.choices?.[0];
        if (!choice) break;

        const msg = choice.message;

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          messages.push(msg);
          for (const tc of msg.tool_calls) {
            let args = {};
            try { args = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}
            toolLog.push(`${tc.function.name}(${tc.function.arguments || ''})`);
            const result = await executeTool(tc.function.name, args, baseDir);
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: typeof result === 'string' ? result : JSON.stringify(result),
            });
          }
          // 如果 msg 同时有 content（某些模型支持），也记录下来
          if (msg.content && msg.content.trim()) {
            toolLog.push(`思考: ${msg.content.trim()}`);
          }
          rounds++;
          continue;
        }

        // AI 返回纯文本，作为最终日志
        if (msg.content && msg.content.trim()) {
          toolLog.push(msg.content.trim());
        }
        break;
      }
    } catch (e) {
      console.warn('进化失败:', e.message);
      toolLog.push(`错误: ${e.message}`);
    }

    // 始终写入进化日志（只要有任何活动）
    if (toolLog.length > 0) {
      const logPath = path.join(baseDir, 'ai', 'evolution-log.md');
      const timestamp = localTimestamp();
      let existing = '';
      try { existing = fs.readFileSync(logPath, 'utf8'); } catch (_) {}
      const logContent = toolLog.join('\n');
      fs.writeFileSync(logPath, existing + `\n## ${timestamp}\n${logContent}\n`, 'utf8');
      console.log('[进化] 完成:', logContent.slice(0, 200));
    }

    refreshSystemPrompt();
  }

  /**
   * Real-time chat: user sends a message, AI responds with action + thought.
   * Lightweight, no tools, fast response.
   */
  async function chat(userMessage) {
    if (!apiKey) return { action: 'wave', thought: '我还不会说话...' };

    const chatSystemPrompt = rules + '\n\n## 当前对话模式\n\n用户正在直接跟你对话。用你的性格回应，要有趣、简短。回复JSON格式。';

    const messages = [
      { role: 'system', content: chatSystemPrompt },
    ];

    // 加入最近几条对话作为上下文
    const recentHistory = conversationHistory.slice(-4);
    for (const msg of recentHistory) {
      if (msg.role !== 'system') messages.push(msg);
    }

    messages.push({
      role: 'user',
      content: `主人对你说：「${userMessage}」\n\n请回复JSON：{"action":"动作名","thought":"你的回应（不超过20字）"}`,
    });

    try {
      const data = await callAPI(messages, { temperature: 0.9, maxTokens: 150 });
      const content = data.choices?.[0]?.message?.content || '';

      conversationHistory.push({ role: 'user', content: `主人说：${userMessage}` });
      conversationHistory.push({ role: 'assistant', content });
      while (conversationHistory.length > MAX_HISTORY + 1) {
        conversationHistory.splice(1, 1);
      }

      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const action = VALID_ACTIONS.includes(parsed.action) ? parsed.action : 'wave';
        return {
          action,
          actions: [{ action, duration: parsed.duration || 5 }],
          thought: parsed.thought || '...',
        };
      }

      return { action: 'wave', thought: content.slice(0, 20) || '嗯？' };
    } catch (e) {
      console.error('[聊天] API 调用失败:', e.message);
      return { action: 'idle', thought: '脑子转不动了...' };
    }
  }

  return {
    decide,
    saveMemory,
    evolve,
    chat,
    getConversationHistory: () => conversationHistory,
    getSystemPrompt: () => systemPrompt,
    getObservations: () => observations,
  };
}

module.exports = {
  createAIManager,
  loadRules,
  loadMemory,
  loadProfile,
  buildSystemPrompt,
  trimMemoryToDays,
  extractExpiredMemory,
  executeTool,
  TOOLS,
  DEFAULT_PROMPT,
  MAX_HISTORY,
  MAX_MEMORY_DAYS,
};
