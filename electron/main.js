const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path  = require("path");
const fs    = require("fs-extra");
const { spawn } = require("child_process");

const isDev = !app.isPackaged;

function getFfmpegPath() {
  if (isDev) {
    try { return require("ffmpeg-static"); } catch { return "ffmpeg"; }
  }
  const base = path.join(process.resourcesPath, "ffmpeg-static", "ffmpeg");
  return process.platform === "win32" ? base + ".exe" : base;
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    frame: false,
    backgroundColor: "#0d0d14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hidden",
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
  } else {
    mainWindow.loadFile(path.join(__dirname, "index.html"));
  }

  mainWindow.once("ready-to-show", () => mainWindow.show());
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.on("win-minimize", () => mainWindow?.minimize());
ipcMain.on("win-maximize", () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on("win-close",    () => mainWindow?.close());

ipcMain.handle("save-dialog", async (_, { defaultName, format }) => {
  const filters = format === "mp4"
    ? [{ name: "MP4 Video", extensions: ["mp4"] }]
    : [{ name: "WebM Video", extensions: ["webm"] }, { name: "MP4 Video", extensions: ["mp4"] }];
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "Save Video",
    defaultPath: defaultName,
    filters,
  });
  return filePath || null;
});

ipcMain.on("show-in-folder", (_, p) => shell.showItemInFolder(p));
ipcMain.handle("get-temp-path", () => app.getPath("temp"));
ipcMain.handle("get-app-path",  () => app.getPath("userData"));

ipcMain.handle("render-video", async (event, opts) => {
  const { html, width, height, fps, durationSec, outputFormat, outputPath } = opts;
  const send = (type, payload) => event.sender.send("render-progress", { type, ...payload });
  const totalFrames = Math.ceil(fps * durationSec);
  const tmpDir = path.join(app.getPath("temp"), `h2v_${Date.now()}`);
  await fs.ensureDir(tmpDir);

  send("status", { msg: "Capturing frames…" });

  const rendererWin = new BrowserWindow({
    width, height, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    frame: false, enableLargerThanScreen: true,
  });

  try {
    const tmpHtml = path.join(tmpDir, "index.html");
    await fs.writeFile(tmpHtml, html, "utf-8");
    await rendererWin.loadFile(tmpHtml);

    // Wait for page to fully load and animations to initialize
    await new Promise(r => setTimeout(r, 800));

    // Pause all CSS animations immediately
    await rendererWin.webContents.executeJavaScript(`
      document.querySelectorAll('*').forEach(el => {
        el.style.animationPlayState = 'paused';
      });
    `);

    const msPerFrame = 1000 / fps;

    for (let i = 0; i < totalFrames; i++) {
      if (event.sender.isDestroyed()) throw new Error("Window closed");

      const timeSec = (i * msPerFrame) / 1000;

      // Seek all CSS animations to this frame's timestamp using negative delay trick
      await rendererWin.webContents.executeJavaScript(`
        document.querySelectorAll('*').forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.animationName && style.animationName !== 'none') {
            el.style.animationDelay = '-' + ${timeSec} + 's';
            el.style.animationPlayState = 'paused';
          }
        });
        // Support JS-driven animations via __frameTime
        window.__frameTime = ${i * msPerFrame};
        if (typeof window.__onFrameTick === 'function') window.__onFrameTick(${i * msPerFrame});
      `);

      // Wait for repaint
      await new Promise(r => setTimeout(r, 50));

      const img = await rendererWin.webContents.capturePage({ x: 0, y: 0, width, height });
      await fs.writeFile(path.join(tmpDir, `frame_${String(i).padStart(6, "0")}.png`), img.toPNG());
      send("progress", { pct: Math.round(((i + 1) / totalFrames) * 70), msg: `Frame ${i + 1}/${totalFrames}` });
    }

    send("status", { msg: "Encoding with FFmpeg…" });
    const ffmpegPath = getFfmpegPath();
    const framePattern = path.join(tmpDir, "frame_%06d.png");

    await new Promise((resolve, reject) => {
      const args = outputFormat === "mp4"
        ? ["-framerate", String(fps), "-i", framePattern, "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-y", outputPath]
        : ["-framerate", String(fps), "-i", framePattern, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-y", outputPath];

      const proc = spawn(ffmpegPath, args);
      let stderr = "";
      proc.stderr.on("data", d => {
        stderr += d.toString();
        const m = stderr.match(/frame=\s*(\d+)/g);
        if (m) {
          const framesDone = parseInt(m[m.length - 1].split("=")[1]);
          send("progress", { pct: Math.min(70 + Math.round((framesDone / totalFrames) * 30), 99), msg: `Encoding frame ${framesDone}/${totalFrames}` });
        }
      });
      proc.on("close", code => code === 0 ? resolve() : reject(new Error("FFmpeg failed:\n" + stderr.slice(-1000))));
      proc.on("error", reject);
    });

    send("progress", { pct: 100, msg: "Done!" });
    return { success: true, outputPath };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    rendererWin.destroy();
    try { await fs.remove(tmpDir); } catch (_) {}
  }
});
