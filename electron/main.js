const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path  = require("path");
const fs    = require("fs-extra");
const { spawn } = require("child_process");

const isDev = !app.isPackaged;

// ── Resolve bundled ffmpeg ───────────────────────────────────────────────────
function getFfmpegPath() {
  if (isDev) {
    try { return require("ffmpeg-static"); } catch { return "ffmpeg"; }
  }
  const base = path.join(process.resourcesPath, "ffmpeg-static", "ffmpeg");
  return process.platform === "win32" ? base + ".exe" : base;
}

// ── Resolve Electron's own Chromium for Puppeteer ───────────────────────────
function getChromiumPath() {
  // Electron bundles Chromium — we point Puppeteer at it
  return process.execPath; // This IS the Electron/Chromium binary
}

let mainWindow;

// ── Create main window ───────────────────────────────────────────────────────
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
    mainWindow.loadFile(path.join(__dirname, "../build/index.html"));
  }

  mainWindow.once("ready-to-show", () => mainWindow.show());
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── IPC: Window controls ─────────────────────────────────────────────────────
ipcMain.on("win-minimize", () => mainWindow?.minimize());
ipcMain.on("win-maximize", () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on("win-close",    () => mainWindow?.close());

// ── IPC: Save dialog ─────────────────────────────────────────────────────────
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

// ── IPC: Open in explorer ─────────────────────────────────────────────────────
ipcMain.on("show-in-folder", (_, p) => shell.showItemInFolder(p));
ipcMain.handle("get-temp-path", () => app.getPath("temp"));
ipcMain.handle("get-app-path",  () => app.getPath("userData"));

// ── IPC: Main render-to-video pipeline ───────────────────────────────────────
// Uses Puppeteer-core pointed at Electron's Chromium to capture frames,
// then encodes them with ffmpeg.
ipcMain.handle("render-video", async (event, opts) => {
  const {
    html,
    width, height,
    fps, durationSec,
    outputFormat,   // "webm" | "mp4"
    outputPath,
  } = opts;

  const send = (type, payload) => event.sender.send("render-progress", { type, ...payload });
  const totalFrames = Math.ceil(fps * durationSec);
  const tmpDir = path.join(app.getPath("temp"), `h2v_${Date.now()}`);
  await fs.ensureDir(tmpDir);

  send("status", { msg: "Launching headless browser…" });

  let puppeteer;
  try { puppeteer = require("puppeteer-core"); }
  catch (e) { return { success: false, error: "puppeteer-core not found: " + e.message }; }

  // Launch a hidden Electron BrowserWindow as headless renderer
  const rendererWin = new BrowserWindow({
    width, height,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    frame: false,
    enableLargerThanScreen: true,
  });

  try {
    // Load the HTML
    const tmpHtml = path.join(tmpDir, "index.html");
    await fs.writeFile(tmpHtml, html, "utf-8");
    await rendererWin.loadFile(tmpHtml);

    // Wait for page to settle
    await new Promise(r => setTimeout(r, 500));

    send("status", { msg: `Capturing ${totalFrames} frames at ${fps}fps…` });

    const msPerFrame = 1000 / fps;

    for (let i = 0; i < totalFrames; i++) {
      if (event.sender.isDestroyed()) throw new Error("Window closed");

      // Advance CSS/JS time by ticking the frame
      await rendererWin.webContents.executeJavaScript(
        `window.__frameTime = ${i * msPerFrame};`
      );

      const img = await rendererWin.webContents.capturePage({
        x: 0, y: 0, width, height,
      });

      const framePath = path.join(tmpDir, `frame_${String(i).padStart(6, "0")}.png`);
      await fs.writeFile(framePath, img.toPNG());

      const pct = Math.round(((i + 1) / totalFrames) * 70); // 0-70% = capture phase
      send("progress", { pct, msg: `Frame ${i + 1}/${totalFrames}` });
    }

    send("status", { msg: "Encoding video with FFmpeg…" });

    // ── FFmpeg encode ─────────────────────────────────────────────────────────
    const ffmpegPath = getFfmpegPath();
    const framePattern = path.join(tmpDir, "frame_%06d.png");

    await new Promise((resolve, reject) => {
      const args = outputFormat === "mp4"
        ? [
            "-framerate", String(fps),
            "-i", framePattern,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-y", outputPath,
          ]
        : [
            "-framerate", String(fps),
            "-i", framePattern,
            "-c:v", "libvpx-vp9",
            "-b:v", "0",
            "-crf", "30",
            "-y", outputPath,
          ];

      const proc = spawn(ffmpegPath, args);
      let stderr = "";

      proc.stderr.on("data", d => {
        stderr += d.toString();
        // Parse ffmpeg frame progress
        const m = stderr.match(/frame=\s*(\d+)/g);
        if (m) {
          const framesDone = parseInt(m[m.length - 1].split("=")[1]);
          const pct = 70 + Math.round((framesDone / totalFrames) * 30);
          send("progress", { pct: Math.min(pct, 99), msg: `Encoding frame ${framesDone}/${totalFrames}` });
        }
      });

      proc.on("close", code => {
        if (code === 0) resolve();
        else reject(new Error("FFmpeg failed:\n" + stderr.slice(-1000)));
      });
      proc.on("error", reject);
    });

    send("progress", { pct: 100, msg: "Done!" });
    return { success: true, outputPath };

  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    rendererWin.destroy();
    // Clean up temp frames
    try { await fs.remove(tmpDir); } catch (_) {}
  }
});
