const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Window
  minimize:     ()     => ipcRenderer.send("win-minimize"),
  maximize:     ()     => ipcRenderer.send("win-maximize"),
  close:        ()     => ipcRenderer.send("win-close"),

  // Dialogs & paths
  saveDialog:   (opts) => ipcRenderer.invoke("save-dialog", opts),
  getTempPath:  ()     => ipcRenderer.invoke("get-temp-path"),
  getAppPath:   ()     => ipcRenderer.invoke("get-app-path"),
  showInFolder: (p)    => ipcRenderer.send("show-in-folder", p),

  // Render pipeline
  renderVideo: (opts)  => ipcRenderer.invoke("render-video", opts),

  // Progress events from main process
  onRenderProgress: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on("render-progress", handler);
    return () => ipcRenderer.removeListener("render-progress", handler);
  },

  platform: process.platform,
  isElectron: true,
});
