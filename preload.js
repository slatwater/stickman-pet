const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  dragWindow: (dx, dy) => ipcRenderer.send('window-drag', { dx, dy }),
  aiDecide: (context) => ipcRenderer.invoke('ai-decide', context),
  showContextMenu: () => ipcRenderer.invoke('show-context-menu'),
});
