const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aura", {
  isDesktop: true,
  castSecond: function () { return ipcRenderer.invoke("aura:cast-second"); },
  getLoginItem: function () { return ipcRenderer.invoke("aura:get-login-item"); },
  setLoginItem: function (v) { return ipcRenderer.invoke("aura:set-login-item", v); }
});
