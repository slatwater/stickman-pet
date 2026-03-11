const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { createAIManager } = require('./ai-manager');

let win;
let aiManager;

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

  // Initialize AI manager with external config files
  aiManager = createAIManager({
    baseDir: __dirname,
    apiKey: DEEPSEEK_API_KEY,
  });

  ipcMain.handle('ai-decide', async (_, context) => {
    return aiManager.decide(context);
  });
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
