const { app, BrowserWindow, Menu, ipcMain, screen } = require("electron");
const path = require("path");

let castWin = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 640,
    minHeight: 480,
    autoHideMenuBar: true,
    backgroundColor: "#0c0e16",
    title: "AURA 双屏工坊",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "index.html"));
}

function createDashboard(second) {
  castWin = new BrowserWindow({
    x: second.bounds.x,
    y: second.bounds.y,
    width: second.bounds.width,
    height: second.bounds.height,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: "#10131c",
    title: "AURA 副屏仪表盘",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  castWin.loadFile(path.join(__dirname, "dashboard.html"));
  castWin.on("closed", function () { castWin = null; });
}

ipcMain.handle("aura:cast-second", function () {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const second = displays.find(function (d) { return d.id !== primary.id; });
  if (!second) return { ok: false, msg: "未检测到第二块屏幕" };
  if (castWin && !castWin.isDestroyed()) { castWin.focus(); return { ok: true }; }
  createDashboard(second);
  return { ok: true };
});

ipcMain.handle("aura:get-login-item", function () {
  return app.getLoginItemSettings();
});

ipcMain.handle("aura:set-login-item", function (e, v) {
  app.setLoginItemSettings({ openAtLogin: !!v });
  return app.getLoginItemSettings();
});

app.whenReady().then(function () {
  createWindow();
  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  app.quit();
});
