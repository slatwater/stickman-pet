const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createAIManager } = require('./ai-manager');

let win;
let aiManager;

// Load AI config
let AI_CONFIG = { apiKey: '', apiBaseUrl: '', modelId: '' };
try {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  AI_CONFIG.apiKey = config.apiKey || config.deepseekApiKey || '';
  AI_CONFIG.apiBaseUrl = config.apiBaseUrl || 'https://api.deepseek.com';
  AI_CONFIG.modelId = config.modelId || 'deepseek-chat';
} catch (e) {}

function createWindow() {
  const { x: wx, y: wy, width: sw, height: sh } = screen.getPrimaryDisplay().workArea;

  win = new BrowserWindow({
    width: sw,
    height: sh,
    x: wx,
    y: wy,
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

  // 全屏点击穿透，forward: true 保证 mousemove 仍被转发
  win.setIgnoreMouseEvents(true, { forward: true });

  // 渲染进程控制点击穿透开关
  ipcMain.on('set-ignore-mouse', (_, ignore) => {
    if (win && !win.isDestroyed()) {
      if (ignore) {
        win.setIgnoreMouseEvents(true, { forward: true });
      } else {
        win.setIgnoreMouseEvents(false);
      }
    }
  });

  // Initialize AI manager with external config files
  aiManager = createAIManager({
    baseDir: __dirname,
    apiKey: AI_CONFIG.apiKey,
    apiBaseUrl: AI_CONFIG.apiBaseUrl,
    modelId: AI_CONFIG.modelId,
  });

  // 加载行为规则文件
  ipcMain.handle('load-behaviors', async () => {
    try {
      const data = fs.readFileSync(path.join(__dirname, 'ai', 'behaviors.json'), 'utf8');
      return JSON.parse(data);
    } catch (_) {
      return null;
    }
  });

  // 加载组合动作
  ipcMain.handle('load-combos', async () => {
    try {
      const data = fs.readFileSync(path.join(__dirname, 'ai', 'combos.json'), 'utf8');
      return JSON.parse(data);
    } catch (_) {
      return {};
    }
  });

  // 加载性格参数
  ipcMain.handle('load-personality', async () => {
    try {
      const data = fs.readFileSync(path.join(__dirname, 'ai', 'personality.json'), 'utf8');
      return JSON.parse(data);
    } catch (_) {
      return null;
    }
  });

  // 用户交互上报（点击、拖拽等）
  ipcMain.on('report-interaction', (_, type) => {
    if (aiManager) aiManager.reportInteraction(type);
  });

  // 用户聊天
  ipcMain.handle('send-chat', async (_, message) => {
    if (!aiManager) return { thought: '我还没准备好...' };
    try {
      return await aiManager.chat(message);
    } catch (e) {
      console.error('[聊天] 失败:', e.message);
      return { thought: '脑子短路了...' };
    }
  });

  // 每20分钟触发一次自我进化
  const EVOLVE_INTERVAL = 20 * 60 * 1000;
  setTimeout(() => {
    console.log('[进化] 触发首次进化...');
    aiManager.evolve().then(() => console.log('[进化] 首次进化完成')).catch(e => console.error('[进化] 首次进化失败:', e.message));
  }, 10000);
  setInterval(() => {
    aiManager.evolve().catch(e => console.error('[进化] 失败:', e.message));
  }, EVOLVE_INTERVAL);

  // 30秒定时器：osascript 获取前台应用信息
  setInterval(() => {
    const script = 'tell application "System Events" to set frontApp to name of first application process whose frontmost is true\ntell application "System Events" to tell process frontApp to set winTitle to name of front window\nreturn frontApp & "|" & winTitle';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      execFile('osascript', ['-e', script], { signal: controller.signal, timeout: 5000 }, (err, stdout) => {
        clearTimeout(timeout);
        if (err) return; // 静默跳过
        const parts = stdout.trim().split('|');
        if (parts.length >= 2 && win && !win.isDestroyed()) {
          win.webContents.send('screen-info', { app: parts[0], title: parts.slice(1).join('|') });
        }
      });
    } catch (e) {
      clearTimeout(timeout);
      // 静默跳过
    }
  }, 30000);
}

app.whenReady().then(createWindow);

// Save memory before quitting
app.on('before-quit', async (e) => {
  if (aiManager) {
    e.preventDefault();
    try {
      await aiManager.saveMemory();
    } catch (_) {}
    app.exit();
  }
});

app.on('window-all-closed', () => app.quit());
