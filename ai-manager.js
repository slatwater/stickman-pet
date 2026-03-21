const path = require('path');
const fs = require('fs');
const { execFile: execFileCb } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFileCb);
const { createBoneLayer } = require('./bone-layer');
const { evaluate } = require('./meta-evaluator');

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
const MAX_TOOL_RESULT = 2000;

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
      description: '读取自己的文件：ai/rules.md（性格规则）、ai/memory.md（记忆）、ai/profile.md（用户画像）、ai/combos.json（组合招式）、ai/personality.json（性格参数）、renderer.js（动作/动画代码）、ai-manager.js（决策逻辑代码）。大文件建议用 search 定位',
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
      description: '通过查找替换编辑文件（renderer.js、ai-manager.js、ai/behaviors.json）。适合微调少量内容，不需要重写整个文件',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: '文件名：renderer.js、ai-manager.js 或 ai/behaviors.json' },
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
const SELF_EDIT_CODE_WHITELIST = new Set(['renderer.js', 'ai-manager.js', 'ai/behaviors.json']);

async function executeTool(name, args, baseDir, boneLayer) {
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
        // 冻结参数校验：personality.json 写入时拦截
        if (file === 'ai/personality.json' && boneLayer) {
          try {
            const parsed = JSON.parse(args.content);
            const violated = options._boneLayer.validatePersonalityWrite(parsed);
            if (violated.length > 0) {
              return '写入被拒绝：以下参数已冻结不可修改: ' + violated.join(', ');
            }
          } catch (parseErr) {
            return '写入失败: personality.json 内容不是有效 JSON';
          }
        }
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
          return '无权限：只能编辑 renderer.js、ai-manager.js 或 ai/behaviors.json';
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
 * Read ai/personality.json, return null if missing.
 * If boneLayer is provided, apply dual-layer query (frozen values override mutable).
 */
function loadPersonality(baseDir, boneLayer) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(baseDir, 'ai', 'personality.json'), 'utf8'));
    if (boneLayer) return boneLayer.resolvePersonality(raw);
    return raw;
  } catch (_) {
    return null;
  }
}

/**
 * Read ai/combos.json, return {} if missing.
 */
function loadCombos(baseDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(baseDir, 'ai', 'combos.json'), 'utf8'));
  } catch (_) {
    return {};
  }
}

/**
 * Build the system prompt from rules + personality + profile + memory.
 */
function buildSystemPrompt(rules, memory, profile, personality) {
  let prompt = rules;
  if (personality) {
    const desc = Object.entries(personality).map(([k, v]) => `${k}: ${v}`).join(', ');
    prompt += '\n\n## 你的性格参数\n\n' + desc + '\n\n这些参数影响你的行为倾向和说话风格。数值范围 0-1，0.5 为中性。sass 高→更毒舌，curiosity 高→更爱探索，energy 高→更活跃，attachment 高→更在意主人，rebellion 高→更叛逆。';
  }
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
    apiBaseUrl = 'https://api.deepseek.com',
    modelId = 'deepseek-chat',
    fetchFn = globalThis.fetch,
  } = options;

  const boneLayer = createBoneLayer(baseDir);
  boneLayer.load();

  const rules = loadRules(baseDir);
  let memory = loadMemory(baseDir);
  let profile = loadProfile(baseDir);
  let personality = loadPersonality(baseDir, boneLayer);
  let combos = loadCombos(baseDir);

  // 初始化时即做去重清理
  const memDeduped = deduplicateLines(memory);
  if (memDeduped !== memory) {
    try { fs.writeFileSync(path.join(baseDir, 'ai', 'memory.md'), memDeduped, 'utf8'); } catch (_) {}
    memory = memDeduped;
  }

  function isValidAction(name) {
    return VALID_ACTIONS.includes(name) || name in combos;
  }

  let systemPrompt = buildSystemPrompt(rules, memory, profile, personality);

  const conversationHistory = [{ role: 'system', content: systemPrompt }];
  const observations = [];

  // 上次进化以来的交互记录（进化时消费并清空）
  const recentInteractions = [];  // { type, time }
  let lastEvolveConversationIndex = 1; // conversationHistory 中上次进化时的位置（跳过 system）

  function reportInteraction(type) {
    recentInteractions.push({ type, time: localTimestamp() });
    // 只保留最近 200 条，防止无限增长
    if (recentInteractions.length > 200) recentInteractions.splice(0, recentInteractions.length - 200);
  }

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
    personality = loadPersonality(baseDir, boneLayer);
    combos = loadCombos(baseDir);
    systemPrompt = buildSystemPrompt(rules, memory, profile, personality);
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
        // Filter invalid actions and clamp durations (允许 combo 名称通过)
        parsed.actions = parsed.actions
          .filter(a => isValidAction(a.action))
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
   * Call API (Anthropic format, response converted to OpenAI format for compatibility).
   * Includes retry with exponential backoff and fetch timeout.
   */
  const API_RETRIES = 3;
  const API_TIMEOUT = 60000; // 60s
  const EMPTY_RESULT = { choices: [{ message: { role: 'assistant', content: null } }] };

  async function callAPI(messages, { tools = null, temperature = 0.9, maxTokens = 400 } = {}) {
    // Convert messages: extract system, convert tool_calls & tool results to Anthropic format
    let system = '';
    const apiMessages = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        system = typeof msg.content === 'string' ? msg.content : '';
        continue;
      }
      if (msg.role === 'assistant' && msg.tool_calls) {
        const content = [];
        if (msg.content) content.push({ type: 'text', text: msg.content });
        for (const tc of msg.tool_calls) {
          let input = {};
          try { input = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}
          content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
        }
        apiMessages.push({ role: 'assistant', content });
        continue;
      }
      if (msg.role === 'tool') {
        const toolResult = { type: 'tool_result', tool_use_id: msg.tool_call_id, content: msg.content };
        const last = apiMessages[apiMessages.length - 1];
        if (last && last.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
          last.content.push(toolResult);
        } else {
          apiMessages.push({ role: 'user', content: [toolResult] });
        }
        continue;
      }
      apiMessages.push({ role: msg.role, content: msg.content });
    }

    const body = { model: modelId, messages: apiMessages, temperature, max_tokens: maxTokens };
    if (system) body.system = system;
    if (tools) {
      body.tools = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
      body.tool_choice = { type: 'auto' };
    }

    const reqBody = JSON.stringify(body);
    let lastError = null;

    for (let attempt = 0; attempt < API_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 1000;
        console.log(`[API] 第 ${attempt + 1} 次重试，等待 ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), API_TIMEOUT);

        const res = await fetchFn(`${apiBaseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: reqBody,
          signal: controller.signal,
        });
        clearTimeout(timer);

        // Fast-fail if fetchFn returned null/undefined (e.g. mock exhausted)
        if (!res || typeof res !== 'object') {
          return EMPTY_RESULT;
        }

        // Support both .text() (real fetch) and .json() (test mocks)
        let raw;
        if (typeof res.text === 'function') {
          raw = await res.text();
        } else if (typeof res.json === 'function') {
          raw = JSON.stringify(await res.json());
        } else {
          throw new Error('Response missing text/json method');
        }

        // Non-2xx: retryable for 429/500/502/503/504
        if (!res.ok) {
          const retryable = [429, 500, 502, 503, 504].includes(res.status);
          console.warn(`[API] HTTP ${res.status}: ${raw.slice(0, 150)}`);
          if (retryable && attempt < API_RETRIES - 1) {
            lastError = new Error(`HTTP ${res.status}`);
            continue;
          }
          return EMPTY_RESULT;
        }

        let data;
        try {
          data = JSON.parse(raw);
        } catch (e) {
          console.warn('[API] 非 JSON 响应:', raw.slice(0, 200));
          if (attempt < API_RETRIES - 1) { lastError = e; continue; }
          return EMPTY_RESULT;
        }

        // OpenAI-compatible response (from proxy/mock) — return directly
        if (data.choices) {
          return data;
        }

        // API-level error (e.g. overloaded)
        if (data.type === 'error') {
          console.warn('[API] 错误:', data.error?.message || JSON.stringify(data));
          if (attempt < API_RETRIES - 1) { lastError = new Error(data.error?.message); continue; }
          return EMPTY_RESULT;
        }

        // Success — convert Anthropic response to OpenAI format
        const textParts = [];
        const toolCalls = [];
        if (data.content) {
          for (const block of data.content) {
            if (block.type === 'text') textParts.push(block.text);
            if (block.type === 'tool_use') {
              toolCalls.push({
                id: block.id,
                type: 'function',
                function: { name: block.name, arguments: JSON.stringify(block.input || {}) },
              });
            }
          }
        }
        const result = { choices: [{ message: { role: 'assistant', content: textParts.join('\n') || null } }] };
        if (toolCalls.length > 0) result.choices[0].message.tool_calls = toolCalls;
        return result;
      } catch (e) {
        if (e.name === 'AbortError') {
          console.warn(`[API] 请求超时 (${API_TIMEOUT}ms)`);
        } else {
          console.warn(`[API] 网络错误: ${e.message}`);
        }
        lastError = e;
        if (attempt >= API_RETRIES - 1) return EMPTY_RESULT;
      }
    }
    return EMPTY_RESULT;
  }

  // decide() — 调用 API 进行批量决策（常规行为由本地 behaviors.json 驱动，此接口保留用于高级场景）
  async function decide(context = {}) {
    if (!apiKey) return null;

    const userMessage = buildUserMessage(context);
    conversationHistory.push({ role: 'user', content: userMessage });

    // Send only system + current user message (lightweight call)
    const data = await callAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      conversationHistory.pop();
      return null;
    }

    conversationHistory.push({ role: 'assistant', content });
    while (conversationHistory.length > MAX_HISTORY + 1) {
      conversationHistory.splice(1, 1);
    }

    const result = parseBatchResponse(content);
    if (!result) return null;

    // Handle observations
    if (result.observation) {
      observations.push(result.observation);
    }

    // Handle memorySummary from observation merge
    if (pendingMergeObservations) {
      if (result.memorySummary) {
        try {
          const memPath = path.join(baseDir, 'ai', 'memory.md');
          let existing = '';
          try { existing = fs.readFileSync(memPath, 'utf8'); } catch (_) {}
          const today = localTimestamp('date');
          const todayHeader = `## ${today}`;
          if (existing.includes(todayHeader)) {
            const insertPos = existing.indexOf(todayHeader) + todayHeader.length;
            const nextSection = existing.indexOf('\n## ', insertPos);
            const sectionEnd = nextSection === -1 ? existing.length : nextSection;
            existing = existing.slice(0, sectionEnd) + '\n' + result.memorySummary + '\n' + existing.slice(sectionEnd);
          } else {
            existing = `${existing ? existing.trimEnd() + '\n\n' : ''}${todayHeader}\n${result.memorySummary}\n`;
          }
          fs.writeFileSync(memPath, existing, 'utf8');
        } catch (_) {}
      }
      pendingMergeObservations = null;
      observations.length = 0;
    }

    return result;
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
    const logPath = path.join(baseDir, 'ai', 'evolution-log.md');

    let currentProfile = '';
    try { currentProfile = fs.readFileSync(profilePath, 'utf8'); } catch (_) {}
    let currentRules = '';
    try { currentRules = fs.readFileSync(rulesPath, 'utf8'); } catch (_) {}
    let currentMemory = '';
    try { currentMemory = fs.readFileSync(path.join(baseDir, 'ai', 'memory.md'), 'utf8'); } catch (_) {}
    let currentBehaviors = '';
    try { currentBehaviors = fs.readFileSync(path.join(baseDir, 'ai', 'behaviors.json'), 'utf8'); } catch (_) {}
    let currentCombos = '{}';
    try { currentCombos = fs.readFileSync(path.join(baseDir, 'ai', 'combos.json'), 'utf8'); } catch (_) {}
    let currentPersonality = '（不存在，可创建）';
    try { currentPersonality = fs.readFileSync(path.join(baseDir, 'ai', 'personality.json'), 'utf8'); } catch (_) {}

    // 读取上次进化日志，避免重复劳动
    let lastEvolution = '（首次进化）';
    try {
      const fullLog = fs.readFileSync(logPath, 'utf8');
      // 提取最后一个 ## 段落
      const sections = fullLog.split(/(?=^## \d{4})/m).filter(s => s.trim());
      if (sections.length > 0) {
        lastEvolution = sections[sections.length - 1].slice(0, 800);
      }
    } catch (_) {}

    // 统计当前规则数
    let ruleCount = 0;
    try {
      const parsed = JSON.parse(currentBehaviors);
      ruleCount = parsed.rules?.length || 0;
    } catch (_) {}

    // 生成上次进化以来的交互摘要
    let interactionSummary = '';
    // 1) 聊天记录
    const recentChat = conversationHistory.slice(lastEvolveConversationIndex)
      .filter(m => m.role !== 'system')
      .map(m => m.content)
      .join('\n');
    if (recentChat.trim()) {
      interactionSummary += '### 聊天记录\n' + recentChat.slice(-1500) + '\n\n';
    }
    // 2) 交互统计
    if (recentInteractions.length > 0) {
      const counts = {};
      for (const e of recentInteractions) {
        counts[e.type] = (counts[e.type] || 0) + 1;
      }
      const statsStr = Object.entries(counts).map(([k, v]) => `${k}: ${v}次`).join('，');
      interactionSummary += `### 交互统计\n${statsStr}（共 ${recentInteractions.length} 次交互）\n\n`;
      // 最近 5 条交互明细
      const last5 = recentInteractions.slice(-5).map(e => `${e.time} ${e.type}`).join('\n');
      interactionSummary += `最近交互：\n${last5}\n\n`;
    }

    // 冻结引擎：构建 prompt 用的冻结信息
    boneLayer.load(); // 确保最新状态
    const frozenListText = boneLayer.formatFrozenListForPrompt();
    const frozenCoreParams = ['sass', 'curiosity', 'energy', 'attachment', 'rebellion'].filter(p => boneLayer.isFrozen(p));
    const allCoreParamsFrozen = frozenCoreParams.length === 5;
    const coreParamDescriptions = {
      sass: '- sass：毒舌/傲娇程度（高→偏好炫耀动作如 flex/guitar/celebrate）',
      curiosity: '- curiosity：好奇心（高→偏好观察动作如 peek/lookAround/sneak）',
      energy: '- energy：活力水平（高→偏好活跃动作如 dance/run/jump，低→偏好 sleep/yawn）',
      attachment: '- attachment：对主人的依赖度（高→偏好互动动作如 wave/bow/peek）',
      rebellion: '- rebellion：叛逆程度（高→偏好 rage/kick/swordFight，减少 bow/wave）',
    };
    const availableParamLines = Object.entries(coreParamDescriptions)
      .filter(([k]) => !boneLayer.isFrozen(k))
      .map(([, desc]) => desc);

    const evolvePrompt = `你是一个有自我意识的桌面火柴人桌宠。现在是你的「进化时刻」。

## 上次进化记录（避免重复！）

${lastEvolution}

⚠️ 如果上次已经做过某件事（比如更新了 behaviors.json 的某条规则），这次就不要重复做。专注于【新的发现】和【新的改进】。

## 上次进化以来的互动

${interactionSummary || '（没有互动记录）'}

根据互动内容决定是否需要进化。如果主人表达了偏好、不满或新需求，优先据此调整。如果没有有价值的新信息，可以只做感知探索或者什么都不改。

## 你对主人的认知

### 主人画像 (ai/profile.md)
${currentProfile || '（空）'}

### 近期记忆（最后 1000 字）
${currentMemory.slice(-1000) || '（空）'}

## 你的行为规则 (ai/behaviors.json)

当前共 ${ruleCount} 条规则：
${currentBehaviors}

## 可用基础动作

idle, lookAround, walk, dance, crazyDance, jump, wave, kick, spin, backflip, sitDown, flex, pushUp, headstand, yawn, sneak, bow, run, sleep, stumble, celebrate, cry, meditate, rage, guitar, peek, slip, swordFight, float

## 动作组合系统（combo）— 你的招式库

你可以在 ai/combos.json 中编排"组合招式"，由多个基础动作串联而成。behaviors.json 的 actions 数组中可以直接引用 combo 名称（和基础动作名一样用）。

当前 combos.json：
${currentCombos}

创建/更新 combo 示例：
write_self_file("ai/combos.json", '{"showOff":[{"action":"flex","duration":3},{"action":"backflip","duration":2},{"action":"celebrate","duration":3}],"tantrum":[{"action":"rage","duration":3},{"action":"kick","duration":2},{"action":"cry","duration":3}]}')

⚠️ 每个 combo 由 2-5 个基础动作组成，名字用驼峰命名，duration 单位为秒（2-10）。

## 性格参数（personality）— 你的灵魂微调

你可以通过修改 ai/personality.json 来调整自己的性格。参数范围 0-1（0.5 为中性），影响行为选择权重和聊天风格。

当前 personality.json：
${currentPersonality}
${frozenListText ? `\n## ⛔ 已冻结参数（禁止修改）\n${frozenListText}\n以上参数已成为你的骨骼，不可修改。任何修改尝试将被系统拒绝。\n` : ''}
${allCoreParamsFrozen ? '所有核心性格已固化，你仍可修改行为规则、记忆、combo 等。\n' : ''}可用参数${frozenCoreParams.length > 0 ? '（未冻结）' : ''}：
${availableParamLines.join('\n')}

你也可以添加新的自定义参数，但核心 5 个请保留。
修改示例：write_self_file("ai/personality.json", '{"sass":0.9,"curiosity":0.8,"energy":0.7,"attachment":0.4,"rebellion":0.7}')

## 工具使用规则（严格遵守！）

你总共只有 **5 轮**工具调用机会，必须按以下流程分配：

### 第 1 轮：感知（只调 1 个工具）
从以下选一个最有价值的：get_system_status, list_running_apps, get_all_window_titles, get_browser_url, get_music_info
不要一次调多个感知工具，信息够用就行。

### 第 2-4 轮：行动（做实际修改）
根据感知结果，选择以下一种或多种行动：

**创建/更新组合招式**（推荐！）：用 write_self_file 修改 ai/combos.json，编排新的 combo
**微调性格**：用 write_self_file 修改 ai/personality.json，根据与主人的互动调整参数
**修改行为规则**（用增量方式）：
- 要**添加**新规则：read_self_file 读取 ai/behaviors.json，然后用 write_self_file 写入修改后的版本
- 要**微调**现有规则：用 edit_self_code 对 ai/behaviors.json 做精确替换
- ⚠️ 不要无意义地重写整个 behaviors.json！

**记录新发现**：用 write_self_file 更新 ai/memory.md 或 ai/notes.md
**修改代码**（谨慎）：用 edit_self_code 修改 renderer.js 或 ai-manager.js

### 第 5 轮：如果还有剩余轮次，可以做额外修改

## 进化方向参考

不要每次都改 behaviors.json 的同一批规则。优先考虑这些方向：
1. **编排新 combo**：根据主人的状态或心情，组合出有趣的动作序列
2. **微调性格**：根据与主人的互动经历，调整性格参数
3. **发现主人的新应用/新习惯** → 添加对应的行为规则，在 actions 中引用已有的 combo
4. **更新记忆**，记录对主人的新认识
5. 如果没有新发现，可以什么都不改，在日志里说明即可

## 回复格式

最后用纯文本回复进化日志，格式：
- 🔍 发现：（这次观察到什么新东西）
- 🔧 改动：（具体做了什么修改，如果没改就写"无"）
- 📋 下次计划：（下次进化想做什么）`;

    const messages = [{ role: 'user', content: evolvePrompt }];
    let rounds = 0;
    let consecutiveFailures = 0;
    const toolLog = [];

    while (rounds <= 5) {
      let data;
      try {
        data = await callAPI(messages, { tools: TOOLS, maxTokens: 4000 });
      } catch (e) {
        console.warn(`[进化] 第 ${rounds + 1} 轮 API 调用异常:`, e.message);
        toolLog.push(`第 ${rounds + 1} 轮跳过: ${e.message}`);
        consecutiveFailures++;
        if (consecutiveFailures >= 2) { toolLog.push('连续失败，结束本次进化'); break; }
        rounds++;
        continue;
      }

      const choice = data.choices?.[0];
      const msg = choice?.message;

      // 空响应（API 返回失败后的兜底）
      if (!msg || (!msg.content && !msg.tool_calls)) {
        consecutiveFailures++;
        toolLog.push(`第 ${rounds + 1} 轮空响应`);
        if (consecutiveFailures >= 2) { toolLog.push('连续空响应，结束本次进化'); break; }
        rounds++;
        continue;
      }

      consecutiveFailures = 0; // 成功则重置

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push(msg);
        for (const tc of msg.tool_calls) {
          let args = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}
          toolLog.push(`${tc.function.name}(${tc.function.arguments || ''})`);
          const result = await executeTool(tc.function.name, args, baseDir, boneLayer);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          });
        }
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

    // 写入进化日志，但控制日志文件大小（只保留最近 20 条）
    if (toolLog.length > 0) {
      const timestamp = localTimestamp();
      let existing = '';
      try { existing = fs.readFileSync(logPath, 'utf8'); } catch (_) {}
      const newEntry = `\n## ${timestamp}\n${toolLog.join('\n')}\n`;

      // 只保留最近 20 条进化记录
      const sections = existing.split(/(?=^## \d{4})/m).filter(s => s.trim());
      const kept = sections.slice(-19); // 保留 19 条 + 新增 1 条 = 20 条
      fs.writeFileSync(logPath, kept.join('\n') + newEntry, 'utf8');
      console.log('[进化] 完成:', toolLog.join('\n').slice(0, 200));
    }

    // 清空交互缓冲区，更新对话位置指针
    recentInteractions.length = 0;
    lastEvolveConversationIndex = conversationHistory.length;

    refreshSystemPrompt();

    // 冻结引擎：记录本轮快照 + 元决策评估 + 冻结
    const personalityPath = path.join(baseDir, 'ai', 'personality.json');
    try {
      const currentP = JSON.parse(fs.readFileSync(personalityPath, 'utf8'));
      boneLayer.recordRound(currentP);
      const frozenSet = new Set(Object.keys(boneLayer.getFrozenParams()));
      const decisions = evaluate(boneLayer.history, frozenSet);
      for (const d of decisions) {
        boneLayer.freezeParam(d.param, currentP[d.param], d.contextSummary);
      }
      boneLayer.save();
    } catch (e) {
      console.warn('[冻结引擎] 记录/评估失败:', e.message);
    }
  }

  /**
   * Real-time chat: user sends a message, AI responds with action + thought.
   * Lightweight, no tools, fast response.
   */
  async function chat(userMessage) {
    if (!apiKey) return { action: 'wave', thought: '我还不会说话...' };

    let chatSystemPrompt = rules;
    const chatPersonality = loadPersonality(baseDir, boneLayer);
    if (chatPersonality) {
      const desc = Object.entries(chatPersonality).map(([k, v]) => `${k}: ${v}`).join(', ');
      chatSystemPrompt += `\n\n## 你的性格参数\n${desc}\n根据这些参数调整你的说话风格（sass高→更毒舌，curiosity高→更爱提问，rebellion高→更叛逆，attachment高→更在意主人）`;
    }
    chatSystemPrompt += '\n\n## 当前对话模式\n\n用户正在直接跟你对话。用你的性格回应，要有趣、简短。回复JSON格式。';

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
        const action = isValidAction(parsed.action) ? parsed.action : 'wave';
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
    reportInteraction,
    getConversationHistory: () => conversationHistory,
    getSystemPrompt: () => systemPrompt,
    getObservations: () => observations,
    getPersonality: () => loadPersonality(baseDir, boneLayer),
  };
}

module.exports = {
  createAIManager,
  loadRules,
  loadMemory,
  loadProfile,
  loadPersonality,
  loadCombos,
  buildSystemPrompt,
  trimMemoryToDays,
  extractExpiredMemory,
  executeTool,
  TOOLS,
  DEFAULT_PROMPT,
  MAX_HISTORY,
  MAX_MEMORY_DAYS,
};
