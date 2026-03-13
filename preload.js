const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  dragWindow: (dx, dy) => ipcRenderer.send('window-drag', { dx, dy }),
  loadBehaviors: () => ipcRenderer.invoke('load-behaviors'),
  onScreenInfo: (callback) => ipcRenderer.on('screen-info', (_, data) => callback(data)),
  sendChat: (message) => ipcRenderer.invoke('send-chat', message),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
});
