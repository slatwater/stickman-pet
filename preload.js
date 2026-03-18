const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  dragWindow: (dx, dy) => ipcRenderer.send('window-drag', { dx, dy }),
  loadBehaviors: () => ipcRenderer.invoke('load-behaviors'),
  loadCombos: () => ipcRenderer.invoke('load-combos'),
  loadPersonality: () => ipcRenderer.invoke('load-personality'),
  loadPreferences: () => ipcRenderer.invoke('load-preferences'),
  savePreferences: (data) => ipcRenderer.invoke('save-preferences', data),
  onScreenInfo: (callback) => ipcRenderer.on('screen-info', (_, data) => callback(data)),
  reportInteraction: (type) => ipcRenderer.send('report-interaction', type),
  sendChat: (message) => ipcRenderer.invoke('send-chat', message),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  loadPressureState: () => ipcRenderer.invoke('load-pressure-state'),
  savePressureState: (data) => ipcRenderer.invoke('save-pressure-state', data),
});
