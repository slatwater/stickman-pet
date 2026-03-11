const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let win;

// Load DeepSeek API key
let DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
try {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  if (config.deepseekApiKey) DEEPSEEK_API_KEY = config.deepseekApiKey;
} catch (e) {}

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: 400,
    height: 500,
    x: sw - 430,
    y: sh - 520,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('index.html');
  win.setVisibleOnAllWorkspaces(true);

  // Allow dragging the window by right-click
  ipcMain.on('window-drag', (_, { dx, dy }) => {
    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);
  });

  // AI multi-turn conversation memory
  const AI_SYSTEM_PROMPT = '你是一个桌面火柴人桌宠的大脑。你有持续记忆，能记住之前所有经历。\n\n可选动作：idle(发呆), lookAround(张望), walk(走路), dance(跳舞), crazyDance(狂舞), jump(跳跃), wave(挥手), kick(踢腿), spin(旋转), backflip(后空翻), sitDown(坐下), flex(秀肌肉), pushUp(俯卧撑), headstand(倒立), yawn(打哈欠), sneak(潜行), bow(鞠躬), run(跑步), sleep(睡觉), stumble(踉跄), celebrate(庆祝), cry(哭泣), meditate(冥想), rage(暴怒), guitar(弹吉他), peek(偷看), slip(滑倒), swordFight(挥剑), float(漂浮)\n\n规则：\n- 你有自己的性格和情绪，会随经历变化\n- 行为要有逻辑连贯性，参考之前的记忆\n- 被用户反复欺负会记仇，会生气或委屈\n- 被善待会开心，更愿意表演\n- 内心独白要可爱有趣，不超过15个字\n- 只回复JSON：{"action":"动作名","thought":"内心独白"}';
  const conversationHistory = [{ role: 'system', content: AI_SYSTEM_PROMPT }];
  const MAX_HISTORY = 60; // 保留最近30轮对话

  ipcMain.handle('ai-decide', async (_, context) => {
    if (!DEEPSEEK_API_KEY) return null;
    try {
      conversationHistory.push({ role: 'user', content: context });

      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
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

      // Save assistant response to history
      if (content) {
        conversationHistory.push({ role: 'assistant', content });
      }

      // Trim oldest messages (keep system prompt + recent history)
      while (conversationHistory.length > MAX_HISTORY + 1) {
        conversationHistory.splice(1, 2); // Remove oldest user+assistant pair
      }

      const match = content.match(/\{[^}]+\}/);
      if (match) return JSON.parse(match[0]);
      return null;
    } catch (e) {
      console.error('AI error:', e.message);
      // Roll back the user message on failure
      if (conversationHistory[conversationHistory.length - 1]?.role === 'user') {
        conversationHistory.pop();
      }
      return null;
    }
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
