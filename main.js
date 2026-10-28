const { app, BrowserWindow, Menu, ipcMain, screen, Tray, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

let castWin = null;
let overlayWins = [];
let tray = null;
let quitting = false;
let displayDebounce = 0;

/* ---------- 16x16 tray icon drawn from raw BGRA pixels ---------- */
function makeTrayIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = (x + y) / (size * 2 - 2);
      buf[i] = Math.round(255 * (0.35 + 0.25 * t));
      buf[i + 1] = Math.round(200 * (0.4 + 0.3 * t));
      buf[i + 2] = Math.round(140 + 100 * t);
      buf[i + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function createTray() {
  try {
    tray = new Tray(makeTrayIcon());
    tray.setToolTip("AURA 双屏工坊");
    const menu = Menu.buildFromTemplate([
      { label: "显示控制台", click: function () { showStudio(); } },
      { label: "显示所有桌面小组件", click: function () { createOverlays(); } },
      { label: "隐藏桌面小组件", click: function () { hideOverlays(); } },
      { label: "重新应用壁纸", click: function () { notifyDisplaysChanged(); } },
      { type: "separator" },
      { label: "退出", click: function () { quitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(menu);
    tray.on("click", function () { showStudio(); });
  } catch (e) { /* tray unavailable */ }
}

function showStudio() {
  const wins = BrowserWindow.getAllWindows().filter(function (w) {
    return !w.isDestroyed() && w.webContents.getURL().indexOf("index.html") >= 0;
  });
  if (wins.length) { wins[0].show(); wins[0].focus(); return; }
  createWindow();
}

/* ---------- main studio window ---------- */
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
  win.on("close", function (e) {
    if (!quitting && tray) { e.preventDefault(); win.hide(); }
  });
}

/* ---------- transparent widget overlays on EVERY display ---------- */
function createOverlays() {
  hideOverlays();
  overlayWins = [];
  screen.getAllDisplays().forEach(function (d, i) {
    const w = new BrowserWindow({
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      backgroundColor: "#00000000",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "preload.js")
      }
    });
    w.setIgnoreMouseEvents(true, { forward: true });
    w.loadFile(path.join(__dirname, "widgets.html"), { query: { display: String(i) } });
    w.on("closed", function () {
      overlayWins = overlayWins.filter(function (o) { return o !== w; });
    });
    overlayWins.push(w);
  });
}

function hideOverlays() {
  overlayWins.forEach(function (w) { if (!w.isDestroyed()) w.close(); });
  overlayWins = [];
}

/* ---------- second-screen dashboard ---------- */
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
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  castWin.loadFile(path.join(__dirname, "dashboard.html"));
  castWin.on("closed", function () { castWin = null; });
}

/* ---------- real desktop wallpaper ---------- */
function applyRealWallpaper(dataUrl, callback) {
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  const file = path.join(app.getPath("userData"), "aura-wallpaper.png");
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
  const script = [
    "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class WP { [DllImport(\"user32.dll\", CharSet=CharSet.Auto)] public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni); }'",
    "[WP]::SystemParametersInfo(20, 0, '" + file.replace(/'/g, "''") + "', 3)",
    "Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value 22",
    "Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper -Value 0"
  ].join("; ");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], function (err) {
    callback(err);
  });
}

function notifyDisplaysChanged() {
  BrowserWindow.getAllWindows().forEach(function (w) {
    try { w.webContents.send("aura:displays-changed"); } catch (e) {}
  });
}

/* ---------- ipc ---------- */
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

ipcMain.handle("aura:get-displays", function () {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map(function (d) {
    return { bounds: d.bounds, scaleFactor: d.scaleFactor, primary: d.id === primary.id };
  });
});

ipcMain.handle("aura:apply-wallpaper", function (e, dataUrl) {
  return new Promise(function (resolve) {
    applyRealWallpaper(dataUrl, function (err) {
      resolve({ ok: !err, msg: err ? err.message : "" });
    });
  });
});

ipcMain.handle("aura:set-ignore-mouse", function (e, flag, opts) {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.setIgnoreMouseEvents(!!flag, opts || { forward: true });
  return true;
});

ipcMain.handle("aura:hide-overlays", function () { hideOverlays(); return true; });
ipcMain.handle("aura:show-overlays", function () { createOverlays(); return true; });

/* ---------- display hot-plug / resolution change ---------- */
function onDisplayChanged() {
  clearTimeout(displayDebounce);
  displayDebounce = setTimeout(function () {
    createOverlays();
    notifyDisplaysChanged();
  }, 600);
}
["display-added", "display-removed", "display-metrics-changed"].forEach(function (ev) {
  screen.on(ev, onDisplayChanged);
});

/* ---------- lifecycle ---------- */
app.whenReady().then(function () {
  createWindow();
  createOverlays();
  createTray();
  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().filter(function (w) { return w.isVisible(); }).length === 0) showStudio();
  });
});

app.on("before-quit", function () { quitting = true; });

app.on("window-all-closed", function () {
  if (!tray) app.quit();
});
