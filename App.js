import { useState, useRef, useEffect, useCallback } from "react";

const eAPI = window.electronAPI || null;

// ─── Default HTML ─────────────────────────────────────────────────────────────
const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1280px; height: 720px; overflow: hidden;
    background: #060612;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Segoe UI', sans-serif;
  }

  /* Animated gradient mesh background */
  body::before {
    content: '';
    position: fixed; inset: 0;
    background:
      radial-gradient(ellipse 60% 50% at 20% 40%, #1a0533 0%, transparent 60%),
      radial-gradient(ellipse 50% 60% at 80% 60%, #001f40 0%, transparent 60%),
      radial-gradient(ellipse 80% 40% at 50% 100%, #0a2010 0%, transparent 70%);
    animation: meshShift 8s ease-in-out infinite alternate;
  }
  @keyframes meshShift {
    0%   { filter: hue-rotate(0deg); }
    100% { filter: hue-rotate(40deg); }
  }

  .scene { position: relative; text-align: center; z-index: 1; }

  /* Glowing rings */
  .ring {
    position: absolute; border-radius: 50%;
    border: 1px solid transparent;
    animation: ringPulse 3s ease-in-out infinite;
    left: 50%; top: 50%; transform: translate(-50%, -50%);
  }
  .ring1 { width: 280px; height: 280px; border-color: #7c3aed44; animation-delay: 0s; }
  .ring2 { width: 380px; height: 380px; border-color: #2563eb33; animation-delay: .5s; }
  .ring3 { width: 480px; height: 480px; border-color: #059669222; animation-delay: 1s; }
  @keyframes ringPulse {
    0%,100% { transform: translate(-50%,-50%) scale(1); opacity: .6; }
    50%      { transform: translate(-50%,-50%) scale(1.05); opacity: 1; }
  }

  /* Title */
  .title {
    font-size: 68px; font-weight: 800; letter-spacing: -2px;
    background: linear-gradient(135deg, #e879f9, #818cf8, #34d399);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    animation: titleIn 1.2s cubic-bezier(.16,1,.3,1) forwards;
    opacity: 0;
  }
  @keyframes titleIn {
    from { opacity: 0; transform: translateY(40px) scale(.9); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .sub {
    margin-top: 18px;
    font-size: 16px; letter-spacing: 6px; text-transform: uppercase;
    color: #64748b;
    animation: titleIn 1.2s .3s cubic-bezier(.16,1,.3,1) both;
  }

  /* Floating particles */
  .particle {
    position: absolute; border-radius: 50%;
    animation: particleFloat linear infinite;
  }
  @keyframes particleFloat {
    0%   { transform: translateY(100vh) scale(0); opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { transform: translateY(-100px) scale(1); opacity: 0; }
  }
</style>
</head>
<body>
  <div class="scene">
    <div class="ring ring1"></div>
    <div class="ring ring2"></div>
    <div class="ring ring3"></div>
    <div class="title">HTML to Video</div>
    <div class="sub">Powered by Electron + FFmpeg</div>
  </div>

  <script>
    // Spawn floating particles
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = Math.random() * 6 + 2;
      const colors = ['#7c3aed', '#2563eb', '#059669', '#e879f9', '#f59e0b'];
      p.style.cssText = \`
        width:\${size}px; height:\${size}px;
        background:\${colors[Math.floor(Math.random()*colors.length)]};
        left:\${Math.random()*100}%;
        animation-duration:\${4+Math.random()*8}s;
        animation-delay:\${Math.random()*6}s;
        box-shadow: 0 0 \${size*2}px currentColor;
      \`;
      document.body.appendChild(p);
    }
  </script>
</body>
</html>`;

// ─── Config ───────────────────────────────────────────────────────────────────
const RESOLUTIONS = [
  { label: "1280 × 720  (HD)",  w: 1280, h: 720  },
  { label: "1920 × 1080 (FHD)", w: 1920, h: 1080 },
  { label: "854 × 480   (SD)",  w: 854,  h: 480  },
  { label: "640 × 360   (Low)", w: 640,  h: 360  },
];
const DURATIONS  = [3, 5, 10, 15, 30, 60];
const FRAMERATES = [24, 30, 60];

// ─── Tiny design system ───────────────────────────────────────────────────────
const C = {
  bg:      "#0d0d14",
  panel:   "#0b0b13",
  toolbar: "#0f0f1a",
  border:  "#1a1a2e",
  accent:  "#7c3aed",
  accentL: "#a78bfa",
  success: "#10b981",
  danger:  "#ef4444",
  warn:    "#f59e0b",
  muted:   "#475569",
  dim:     "#334155",
  text:    "#e2e8f0",
  sub:     "#64748b",
};

const s = {
  row:    { display:"flex", alignItems:"center" },
  col:    { display:"flex", flexDirection:"column" },
  fill:   { flex: 1 },
  nowrap: { whiteSpace:"nowrap" },
};

function TitleBar() {
  return (
    <div style={{ height:38, background:"#111118", borderBottom:`1px solid ${C.border}`,
      ...s.row, padding:"0 16px", flexShrink:0, WebkitAppRegion:"drag" }}>
      <div style={{ ...s.row, gap:7, WebkitAppRegion:"no-drag" }}>
        {[["#ff5f57", ()=>eAPI?.close()],
          ["#febc2e", ()=>eAPI?.minimize()],
          ["#28c840", ()=>eAPI?.maximize()]].map(([c,fn],i) => (
          <div key={i} onClick={fn} title={["Close","Minimize","Maximize"][i]}
            style={{ width:13, height:13, borderRadius:"50%", background:c,
              cursor:"pointer", transition:"filter .15s",
            }}
            onMouseEnter={e=>e.target.style.filter="brightness(1.3)"}
            onMouseLeave={e=>e.target.style.filter=""} />
        ))}
      </div>
      <div style={{ ...s.fill, textAlign:"center", fontSize:11, color:C.sub, letterSpacing:4 }}>
        HTML → VIDEO CONVERTER
      </div>
      <div style={{ fontSize:10, color:C.dim }}>v2.0</div>
    </div>
  );
}

function Btn({ children, onClick, color="#1e293b", fg="#94a3b8", disabled, style={} }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding:"5px 14px", fontSize:11, letterSpacing:1,
      background: disabled ? "#111" : color,
      color: disabled ? "#334155" : fg,
      border:`1px solid ${disabled ? "#222" : fg+"33"}`,
      borderRadius:4, cursor: disabled ? "not-allowed" : "pointer",
      fontFamily:"inherit", transition:"opacity .15s", ...style,
    }}>{children}</button>
  );
}

function Tag({ children, color=C.accent }) {
  return (
    <span style={{ display:"inline-block", padding:"1px 8px", borderRadius:3,
      background:color+"22", color, border:`1px solid ${color}44`, fontSize:10, letterSpacing:1 }}>
      {children}
    </span>
  );
}

function RadioOpt({ label, sub, selected, onClick }) {
  return (
    <button onClick={onClick} style={{ ...s.row, gap:9, background:"transparent",
      border:"none", cursor:"pointer", padding:"5px 0", color: selected ? C.accentL : C.sub,
      fontFamily:"inherit", fontSize:11, textAlign:"left", width:"100%" }}>
      <div style={{ width:12, height:12, borderRadius:"50%", flexShrink:0,
        border:`2px solid ${selected ? C.accent : C.dim}`,
        background: selected ? C.accent : "transparent" }} />
      <span>{label}</span>
      {sub && <span style={{ color:C.dim, fontSize:10 }}>{sub}</span>}
    </button>
  );
}

function Chip({ label, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:"4px 11px", fontSize:11,
      background: selected ? "#4c1d95" : "#0f0f1a",
      color: selected ? "#c4b5fd" : C.sub,
      border:`1px solid ${selected ? C.accent : C.border}`,
      borderRadius:3, cursor:"pointer", fontFamily:"inherit", transition:"all .15s",
    }}>{label}</button>
  );
}

function SectionHead({ label }) {
  return <div style={{ fontSize:9, color:C.muted, letterSpacing:3, marginBottom:8 }}>{label}</div>;
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [html, setHtml]         = useState(DEFAULT_HTML);
  const [res,  setRes]          = useState(RESOLUTIONS[0]);
  const [dur,  setDur]          = useState(5);
  const [fps,  setFps]          = useState(30);
  const [fmt,  setFmt]          = useState("mp4");
  const [tab,  setTab]          = useState("editor");
  const [previewKey, setPK]     = useState(0);

  // Pipeline state
  const [phase,    setPhase]    = useState("idle");
  // idle | rendering | done | error
  const [pct,      setPct]      = useState(0);
  const [statusMsg,setStatus]   = useState("");
  const [savedPath,setSaved]    = useState(null);
  const [errMsg,   setErr]      = useState("");
  const [log,      setLog]      = useState([]);

  // Preview video blob url
  const [previewUrl, setPreviewUrl] = useState(null);

  const iframeRef = useRef(null);

  const addLog = (msg, type="info") =>
    setLog(p => [...p.slice(-100), { msg, type, t: Date.now() }]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    if (!eAPI) return;
    const off = eAPI.onRenderProgress(data => {
      if (data.type === "progress") {
        setPct(data.pct);
        setStatus(data.msg);
        addLog(data.msg, "info");
      } else if (data.type === "status") {
        setStatus(data.msg);
        addLog(data.msg, "info");
      }
    });
    return off;
  }, []);

  // ── Refresh preview ───────────────────────────────────────────────────────
  const refresh = () => {
    setPK(k => k + 1);
    setPreviewUrl(null);
    setSaved(null);
    setPhase("idle");
    setPct(0);
    addLog("Preview refreshed", "info");
  };

  // ── Render video ──────────────────────────────────────────────────────────
  const renderVideo = useCallback(async () => {
    if (phase === "rendering") return;
    if (!eAPI) {
      addLog("Electron API not available — run as desktop app", "error");
      return;
    }

    setPhase("rendering");
    setPct(0);
    setErr("");
    setSaved(null);
    setPreviewUrl(null);
    addLog(`Starting render: ${res.label} @ ${fps}fps, ${dur}s → ${fmt.toUpperCase()}`, "info");

    // Ask where to save
    const defaultName = `html-export-${Date.now()}.${fmt}`;
    const outputPath = await eAPI.saveDialog({ defaultName, format: fmt });
    if (!outputPath) {
      setPhase("idle");
      addLog("Save cancelled", "warn");
      return;
    }

    setStatus("Initialising renderer…");
    addLog(`Output: ${outputPath}`, "info");

    const result = await eAPI.renderVideo({
      html,
      width:        res.w,
      height:       res.h,
      fps,
      durationSec:  dur,
      outputFormat: fmt,
      outputPath,
    });

    if (result.success) {
      setSaved(result.outputPath);
      setPhase("done");
      setPct(100);
      addLog(`✓ Saved: ${result.outputPath}`, "success");

      // Load into preview player via file:// url
      setPreviewUrl(`file://${result.outputPath.replace(/\\/g, "/")}`);
    } else {
      setPhase("error");
      setErr(result.error || "Unknown error");
      addLog(`✗ Error: ${result.error}`, "error");
    }
  }, [phase, html, res, fps, dur, fmt]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isRendering = phase === "rendering";
  const isDone      = phase === "done";
  const isError     = phase === "error";
  const isBusy      = isRendering;

  const accentNow = isRendering ? C.warn : isDone ? C.success : isError ? C.danger : C.accent;

  // Preview scale to fit 800px wide
  const previewScale = 800 / res.w;

  return (
    <div style={{ width:"100vw", height:"100vh", background:C.bg,
      ...s.col, overflow:"hidden", color:C.text }}>

      <TitleBar />

      {/* Toolbar */}
      <div style={{ height:44, background:C.toolbar, borderBottom:`1px solid ${C.border}`,
        ...s.row, padding:"0 12px", gap:6, flexShrink:0 }}>
        {[["editor","⌨  Editor"],["settings","⚙  Settings"]].map(([id,lbl]) => (
          <Btn key={id} onClick={()=>setTab(id)}
            color={tab===id ? "#1e1e2e" : "transparent"}
            fg={tab===id ? C.accentL : C.sub}
            style={{ border: tab===id ? `1px solid ${C.accent}44` : "1px solid transparent" }}>
            {lbl}
          </Btn>
        ))}
        <div style={s.fill} />
        <Btn onClick={refresh} disabled={isBusy}>↺  Refresh Preview</Btn>
        {!isRendering
          ? <Btn onClick={renderVideo} disabled={isBusy} color="#4c1d95" fg="#c4b5fd">
              ⏺  Render Video
            </Btn>
          : <Btn onClick={() => {}} color="#7f1d1d" fg="#fca5a5" disabled>
              <span style={{ display:"inline-block", animation:"spin 1s linear infinite",
                marginRight:6 }}>◌</span>Rendering…
            </Btn>
        }
        {isDone && savedPath && (
          <Btn onClick={() => eAPI?.showInFolder(savedPath)} color="#064e3b" fg="#6ee7b7">
            📁  Show File
          </Btn>
        )}
      </div>

      {/* Body */}
      <div style={{ ...s.fill, ...s.row, overflow:"hidden" }}>

        {/* ── Left panel ── */}
        <div style={{ width:330, background:C.panel, borderRight:`1px solid ${C.border}`,
          ...s.col, flexShrink:0, overflow:"hidden" }}>

          {tab === "editor" ? (
            <>
              <div style={{ padding:"8px 12px", borderBottom:`1px solid ${C.border}`,
                ...s.row, gap:8 }}>
                <span style={{ fontSize:10, color:C.muted, letterSpacing:2 }}>HTML SOURCE</span>
                <div style={s.fill}/>
                <Tag color={C.accentL}>{html.length} chars</Tag>
              </div>
              <textarea value={html} onChange={e=>setHtml(e.target.value)}
                style={{ flex:1, background:"transparent", border:"none", outline:"none",
                  color:"#7dd3fc", fontFamily:"'Courier New', monospace",
                  fontSize:12, lineHeight:1.7, padding:"12px 14px", resize:"none" }}
                spellCheck={false} />
            </>
          ) : (
            <div style={{ flex:1, overflowY:"auto", padding:"16px 14px" }}>

              <div style={{ marginBottom:22 }}>
                <SectionHead label="RESOLUTION" />
                {RESOLUTIONS.map(r => (
                  <RadioOpt key={r.label} label={r.label}
                    selected={res.label===r.label} onClick={()=>setRes(r)} />
                ))}
              </div>

              <div style={{ marginBottom:22 }}>
                <SectionHead label="DURATION" />
                <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                  {DURATIONS.map(d => (
                    <Chip key={d} label={`${d}s`} selected={dur===d} onClick={()=>setDur(d)} />
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:22 }}>
                <SectionHead label="FRAME RATE" />
                <div style={{ display:"flex", gap:5 }}>
                  {FRAMERATES.map(f => (
                    <Chip key={f} label={`${f} fps`} selected={fps===f} onClick={()=>setFps(f)} />
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:22 }}>
                <SectionHead label="OUTPUT FORMAT" />
                <RadioOpt label="MP4  (H.264)" sub="— universal, recommended"
                  selected={fmt==="mp4"} onClick={()=>setFmt("mp4")} />
                <RadioOpt label="WebM (VP9)"   sub="— open format, smaller"
                  selected={fmt==="webm"} onClick={()=>setFmt("webm")} />
              </div>

              <div style={{ padding:12, background:"#0f0f1a", borderRadius:6,
                border:`1px solid ${C.border}`, fontSize:10, color:C.sub, lineHeight:1.8 }}>
                <div style={{ color:C.accentL, marginBottom:4 }}>ℹ How it works</div>
                Electron renders your HTML in a hidden Chromium window,
                captures each frame with <code style={{color:"#7dd3fc"}}>capturePage()</code>,
                then encodes with bundled FFmpeg. Frame-perfect, no browser recording limits.
              </div>
            </div>
          )}

          {/* Console */}
          <div style={{ height:160, borderTop:`1px solid ${C.border}`,
            background:"#070710", padding:"6px 10px", overflowY:"auto", flexShrink:0 }}>
            <div style={{ ...s.row, gap:6, marginBottom:5 }}>
              <span style={{ fontSize:9, color:C.dim, letterSpacing:2 }}>CONSOLE</span>
              <div style={s.fill}/>
              {log.length > 0 && (
                <button onClick={()=>setLog([])} style={{ background:"transparent",
                  border:"none", color:C.dim, cursor:"pointer", fontSize:10 }}>clear</button>
              )}
            </div>
            {log.length === 0
              ? <div style={{ fontSize:10, color:C.dim }}>No output yet.</div>
              : log.map((l,i) => (
                <div key={i} style={{ fontSize:10, lineHeight:1.8,
                  color: l.type==="success" ? C.success
                       : l.type==="error"   ? C.danger
                       : l.type==="warn"    ? C.warn : "#94a3b8" }}>
                  <span style={{ color:C.dim }}>[{new Date(l.t).toLocaleTimeString()}] </span>
                  {l.msg}
                </div>
              ))
            }
          </div>
        </div>

        {/* ── Preview / output ── */}
        <div style={{ ...s.fill, ...s.col, overflow:"hidden" }}>

          {/* Preview header */}
          <div style={{ height:38, background:C.toolbar, borderBottom:`1px solid ${C.border}`,
            ...s.row, padding:"0 14px", gap:10, flexShrink:0 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:accentNow,
              boxShadow:`0 0 8px ${accentNow}`,
              animation: isRendering ? "blink 1s ease-in-out infinite" : "none" }} />
            <span style={{ fontSize:10, color:C.sub, letterSpacing:2 }}>
              {isRendering ? statusMsg || "RENDERING…"
               : isDone    ? "DONE — PREVIEW"
               : isError   ? "RENDER ERROR"
               : "LIVE PREVIEW"}
            </span>
            <div style={s.fill} />
            <Tag color={C.sub}>{res.w}×{res.h}</Tag>
            <Tag color={C.sub}>{fps} fps</Tag>
            <Tag color={C.sub}>{dur}s</Tag>
            <Tag color={fmt==="mp4" ? "#ef4444" : C.accent}>{fmt.toUpperCase()}</Tag>
          </div>

          {/* Progress bar */}
          <div style={{ height:3, background:C.border, flexShrink:0 }}>
            <div style={{ height:"100%", width:`${pct}%`,
              background:`linear-gradient(90deg,${C.accent},${accentNow})`,
              transition:"width 0.2s ease", borderRadius:2 }} />
          </div>

          {/* Canvas area */}
          <div style={{ ...s.fill, alignItems:"center", justifyContent:"center",
            background:"#07070e", overflow:"hidden", position:"relative", ...s.row }}>

            {/* Dot grid */}
            <div style={{ position:"absolute", inset:0, opacity:.3,
              backgroundImage:"radial-gradient(circle,#1e1e35 1px,transparent 1px)",
              backgroundSize:"28px 28px", pointerEvents:"none" }} />

            {/* Error state */}
            {isError && (
              <div style={{ position:"relative", maxWidth:560, padding:24, borderRadius:8,
                background:"#1a0808", border:`1px solid ${C.danger}44`, animation:"fadeUp .3s ease" }}>
                <div style={{ color:C.danger, marginBottom:8, fontSize:13 }}>✗ Render Failed</div>
                <pre style={{ color:"#fca5a5", fontSize:11, lineHeight:1.6,
                  whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{errMsg}</pre>
                <Btn onClick={()=>{setPhase("idle");setErr("");}} style={{ marginTop:12 }}>
                  Dismiss
                </Btn>
              </div>
            )}

            {/* Video preview after render */}
            {!isError && isDone && previewUrl && (
              <video key={previewUrl} src={previewUrl} controls autoPlay loop
                style={{ maxWidth:"90%", maxHeight:"90%", borderRadius:6, position:"relative",
                  boxShadow:`0 0 60px ${C.success}33`,
                  border:`1px solid ${C.success}44` }} />
            )}

            {/* Live HTML preview (before render) */}
            {!isError && !isDone && (
              <div style={{ position:"relative",
                width: Math.min(window.innerWidth - 380, 800),
                height: Math.min(window.innerWidth - 380, 800) * (res.h / res.w),
                boxShadow:`0 0 40px ${accentNow}22`,
                border:`1px solid ${accentNow}33`,
                borderRadius:6, overflow:"hidden",
              }}>
                {isRendering && (
                  <div style={{ position:"absolute", inset:0, zIndex:10,
                    background:"#00000088", display:"flex", flexDirection:"column",
                    alignItems:"center", justifyContent:"center", gap:14 }}>
                    <div style={{ width:48, height:48, borderRadius:"50%",
                      border:`3px solid ${C.accent}44`, borderTopColor:C.accent,
                      animation:"spin 0.8s linear infinite" }} />
                    <div style={{ fontSize:13, color:C.accentL }}>{pct}%</div>
                    <div style={{ fontSize:11, color:C.sub, maxWidth:260, textAlign:"center" }}>
                      {statusMsg}
                    </div>
                  </div>
                )}
                <iframe key={previewKey} ref={iframeRef}
                  srcDoc={html} sandbox="allow-scripts"
                  title="live preview"
                  style={{ width:res.w, height:res.h, border:"none",
                    transform:`scale(${(Math.min(window.innerWidth - 380, 800)) / res.w})`,
                    transformOrigin:"top left", pointerEvents:"none" }} />
              </div>
            )}
          </div>

          {/* Status bar */}
          <div style={{ height:26, background:"#111118", borderTop:`1px solid ${C.border}`,
            ...s.row, padding:"0 14px", gap:18,
            fontSize:10, color:C.dim, flexShrink:0 }}>
            <span>Frames: {fps * dur}</span>
            <span>Est. size: ~{Math.round(fps * dur * res.w * res.h * 3 / 1024 / 1024 / (fmt==="mp4"?15:8))} MB</span>
            <div style={s.fill} />
            {isRendering && <span style={{ color:C.warn }}>⟳ {statusMsg}</span>}
            {isDone && savedPath && (
              <span style={{ color:C.success, maxWidth:400,
                overflow:"hidden", textOverflow:"ellipsis", ...s.nowrap }}>
                ✓ {savedPath}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
