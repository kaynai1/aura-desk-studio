const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aura", {
  isDesktop: true,
  castSecond: function () { return ipcRenderer.invoke("aura:cast-second"); },
  getLoginItem: function () { return ipcRenderer.invoke("aura:get-login-item"); },
  setLoginItem: function (v) { return ipcRenderer.invoke("aura:set-login-item", v); },
  getDisplays: function () { return ipcRenderer.invoke("aura:get-displays"); },
  applyWallpaper: function (dataUrl) { return ipcRenderer.invoke("aura:apply-wallpaper", dataUrl); },
  setIgnoreMouseEvents: function (flag, opts) { return ipcRenderer.invoke("aura:set-ignore-mouse", flag, opts); },
  hideOverlays: function () { return ipcRenderer.invoke("aura:hide-overlays"); },
  showOverlays: function () { return ipcRenderer.invoke("aura:show-overlays"); },
  onDisplaysChanged: function (cb) { ipcRenderer.on("aura:displays-changed", cb); }
});
