const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");

const DEFAULT_PORT = process.env.OPENMAIL_PORT || "3000";
const SERVER_URL =
  process.env.ELECTRON_START_URL || `http://127.0.0.1:${DEFAULT_PORT}`;

let nextChild = null;

function appRootDir() {
  return path.join(__dirname, "..");
}

function nextCliPath(root) {
  return path.join(root, "node_modules", "next", "dist", "bin", "next");
}

function waitForServer(url, { retries = 50, ms = 300 } = {}) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        i += 1;
        if (i >= retries) {
          reject(new Error("OpenMail: Next server did not become ready in time."));
        } else {
          setTimeout(tick, ms);
        }
      });
    };
    tick();
  });
}

function startPackagedNextServer() {
  if (app.isPackaged !== true) return null;
  const root = appRootDir();
  const nextCli = nextCliPath(root);
  if (!fs.existsSync(nextCli)) {
    return null;
  }
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: DEFAULT_PORT,
    HOSTNAME: "127.0.0.1",
  };
  try {
    const child = spawn(process.execPath, [nextCli, "start"], {
      cwd: root,
      env,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => {});
    return child;
  } catch {
    return null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const isDev = !app.isPackaged;
  const staticIndex = path.join(__dirname, "..", "out", "index.html");

  if (isDev) {
    win.loadURL(SERVER_URL);
    return;
  }

  if (fs.existsSync(staticIndex)) {
    win.loadFile(staticIndex);
    return;
  }

  nextChild = startPackagedNextServer();
  if (nextChild) {
    waitForServer(SERVER_URL)
      .then(() => {
        win.loadURL(SERVER_URL);
      })
      .catch(() => {
        win.loadURL(SERVER_URL);
      });
    return;
  }

  win.loadURL(SERVER_URL);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextChild && !nextChild.killed) {
    try {
      nextChild.kill();
    } catch {
      /* ignore */
    }
    nextChild = null;
  }
});
