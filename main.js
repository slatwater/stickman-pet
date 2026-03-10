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

  // AI decision via DeepSeek API
  ipcMain.handle('ai-decide', async (_, context) => {
    if (!DEEPSEEK_API_KEY) return null;
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: '你是一个桌面火柴人桌宠的大脑。根据情境决定下一步动作，给出简短内心独白。\n\n可选动作：idle(发呆), lookAround(张望), walk(走路), dance(跳舞), crazyDance(狂舞), jump(跳跃), wave(挥手), kick(踢腿), spin(旋转), backflip(后空翻), sitDown(坐下), flex(秀肌肉), pushUp(俯卧撑), headstand(倒立), yawn(打哈欠), sneak(潜行), bow(鞠躬), run(跑步), sleep(睡觉), stumble(踉跄), celebrate(庆祝)\n\n规则：\n- 行为要有逻辑连贯性，比如累了就休息，开心就跳舞\n- 被用户欺负后要有情绪反应\n- 内心独白要可爱有趣，不超过15个字\n- 只回复JSON：{"action":"动作名","thought":"内心独白"}',
            },
            { role: 'user', content: context },
          ],
          temperature: 0.9,
          max_tokens: 100,
        }),
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      const match = content.match(/\{[^}]+\}/);
      if (match) return JSON.parse(match[0]);
      return null;
    } catch (e) {
      console.error('AI error:', e.message);
      return null;
    }
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
