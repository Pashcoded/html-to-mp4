# HTML → Video Converter  
**Desktop app — Electron + FFmpeg + Chromium rendering**

---

## Requirements

| Tool    | Version | Download |
|---------|---------|----------|
| Node.js | 18 +    | https://nodejs.org |
| Git     | any     | optional |

---

## Install & Run

```bash
# 1. Enter the project folder
cd html2video

# 2. Install all dependencies (takes ~2 min first time)
npm install

# 3. Run in dev mode (live reload)
npm run dev
```

---

## Build installer (.exe)

```bash
# Windows — produces dist/HTML to Video Setup 1.0.0.exe
npm run build:win

# macOS — produces dist/HTML to Video-1.0.0.dmg
npm run build:mac

# Linux — produces dist/HTML to Video-1.0.0.AppImage
npm run build:linux
```

The installer is self-contained. No extra software needed on the target machine.

---

## How the rendering works

1. You write HTML/CSS/JS in the editor  
2. Click **⏺ Render Video** — choose where to save  
3. Electron opens a **hidden Chromium window** at the exact resolution you chose  
4. It loads your HTML and calls `capturePage()` for every frame  
5. All frames are saved as PNGs to a temp folder  
6. **Bundled FFmpeg** encodes them into MP4 (H.264) or WebM (VP9)  
7. Temp frames are deleted, final video is saved to your chosen path  
8. The video plays back inside the app for preview  

This approach is **frame-perfect** — it captures actual rendered pixels,
not a screen recording, so animations render correctly even faster than real-time.

---

## Features

- Live HTML preview (before rendering)  
- Resolutions: 360p / 480p / 720p HD / 1080p FHD  
- Frame rates: 24 / 30 / 60 fps  
- Durations: 3 – 60 seconds  
- Output: MP4 (H.264) or WebM (VP9)  
- Real-time render progress (frame counter + %)  
- Native save dialog  
- In-app video playback after render  
- "Show in Folder" button  
- Console log panel  

---

## Troubleshooting

**`npm install` fails on ffmpeg-static**  
→ Make sure Node.js 18+ is installed and you have internet access.

**Black frames in output**  
→ Add `animation-delay` to your CSS or increase duration.  
→ Make sure your `body` has explicit `width` and `height` matching the chosen resolution.

**App won't open after install**  
→ On Windows, right-click the installer → "Run as administrator".  
→ On macOS, go to System Settings → Privacy → allow the app.
