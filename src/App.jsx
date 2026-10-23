import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import PlatformGame from "./game/PlatformGame";
import "./App.css";

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
const ACCEPTED_EXTENSIONS = [".mp4", ".mov", ".avi", ".mkv"];
const MIN_TRIM_GAP = 0.1;
const EFFECTS = [
  { key: "original", label: "Original", filter: "none" },
  { key: "grayscale", label: "Grayscale", filter: "grayscale(1)" },
  { key: "sepia", label: "Sepia", filter: "sepia(1)" },
  { key: "blur", label: "Blur", filter: "blur(2px)" },
  { key: "sharpen", label: "Sharpen", filter: "contrast(1.16) saturate(1.08)" },
  { key: "pixelate", label: "Pixelate", filter: "contrast(1.12)" },
  { key: "glitch", label: "Glitch", filter: "hue-rotate(24deg) saturate(1.7) contrast(1.15)" },
];

const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
};
const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return "00:00";
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
};

function Icon({ name, size = 18 }) {
  const paths = {
    logo: <><path d="M5 5.5 9 3l4 2.5V10l-4 2.5L5 10V5.5Z" /><path d="m9 12.5 4 2.5v4l-4 2.5L5 19v-4l4-2.5Z" /><path d="m13 5.5 4-2.5 4 2.5V10l-4 2.5-4-2.5" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>,
    play: <path d="m9 5 10 7-10 7V5Z" />,
    pause: <><path d="M8 5v14" /><path d="M16 5v14" /></>,
    video: <><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
    film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5M16 4v5M8 15v5M16 15v5" /></>,
    sliders: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></>,
    export: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    settings: <><circle cx="12" cy="12" r="3.5" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.5V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.6-1H6.2v-2.5h.2A1.7 1.7 0 0 0 8 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h2.5V5a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.6 1h.2v2.5H21a1.7 1.7 0 0 0-1.6 1.5Z" /></>,
    folder: <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v8A1.5 1.5 0 0 1 19.5 18h-15A1.5 1.5 0 0 1 3 16.5v-10Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    game: <><rect x="3" y="8" width="18" height="9" rx="4" /><path d="M8 12v4M6 14h4M16 12h.01M19 14h.01" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function App() {
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const [videoFile, setVideoFile] = useState(null);
  const [nativeInputPath, setNativeInputPath] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [metadata, setMetadata] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTool, setActiveTool] = useState("media");
  const [selectedEffect, setSelectedEffect] = useState("original");
  const [status, setStatus] = useState("Listo para importar");
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [exportFormat, setExportFormat] = useState("mp4");
  const [exportQuality, setExportQuality] = useState("high");
  const [exportResolution, setExportResolution] = useState("original");
  const [exportFps, setExportFps] = useState("30");
  const [exportProgress, setExportProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportedPath, setExportedPath] = useState("");
  const timelineMarkers = useMemo(() => [0, 25, 50, 75, 100], []);
  const duration = metadata?.duration || 0;
  const progress = duration ? Math.min((currentTime / duration) * 100, 100) : 0;
  const startPercent = duration ? (trimStart / duration) * 100 : 0;
  const endPercent = duration ? (trimEnd / duration) * 100 : 100;
  const effectData = EFFECTS.find((effect) => effect.key === selectedEffect) || EFFECTS[0];
  useEffect(() => () => videoUrl && URL.revokeObjectURL(videoUrl), [videoUrl]);
  useEffect(() => { if (duration && trimEnd === 0) setTrimEnd(duration); }, [duration, trimEnd]);
  useEffect(() => {
    let unsubscribe;
    listen("export-progress", (event) => {
      const payload = event.payload || {};
      if (typeof payload.progress === "number") setExportProgress(Math.round(payload.progress * 100));
      if (payload.status) setStatus(payload.status);
    }).then((removeListener) => { unsubscribe = removeListener; }).catch(() => {});
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const readMetadataWithRust = async (file) => {
    if (!file?.path) return null;
    try { return await invoke("get_video_metadata", { path: file.path }); } catch { return null; }
  };
  const importVideo = async (file) => {
    if (!file) return;
    const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXTENSIONS.includes(extension)) { setStatus("Formato no compatible. Usa MP4, MOV, AVI o MKV."); return; }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(file); setNativeInputPath(file.path || null); setVideoUrl(URL.createObjectURL(file)); setCurrentTime(0); setTrimStart(0); setTrimEnd(0); setSelectedEffect("original"); setExportProgress(0); setExportSuccess(false); setExportedPath(""); setStatus("Leyendo metadatos...");
    const native = await readMetadataWithRust(file);
    setMetadata({ name: file.name, format: extension.replace(".", "").toUpperCase(), size: formatBytes(file.size), duration: native?.duration || null, width: native?.width || null, height: native?.height || null, source: native ? "Rust + FFprobe" : "WebView" });
    setStatus("Video importado correctamente");
  };
  const handleVideoLoaded = () => {
    const element = videoRef.current; if (!element) return;
    setMetadata((current) => ({ ...current, duration: current?.duration || element.duration, width: current?.width || element.videoWidth, height: current?.height || element.videoHeight }));
    setTrimEnd((current) => current || element.duration);
  };
  const syncVideoTime = () => {
    const next = videoRef.current?.currentTime || 0;
    if (trimEnd > trimStart && next >= trimEnd) { videoRef.current.pause(); videoRef.current.currentTime = trimEnd; setIsPlaying(false); setCurrentTime(trimEnd); } else setCurrentTime(next);
  };
  const seek = (value) => { const next = Math.max(0, Math.min(Number(value), duration || Number(value))); setCurrentTime(next); if (videoRef.current) videoRef.current.currentTime = next; };
  const togglePlayback = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { if (currentTime < trimStart || currentTime >= trimEnd) { videoRef.current.currentTime = trimStart; setCurrentTime(trimStart); } videoRef.current.play(); setIsPlaying(true); }
    else { videoRef.current.pause(); setIsPlaying(false); }
  };
  const updateTrimStart = (value) => { const next = Math.max(0, Math.min(Number(value), Math.max(trimEnd - MIN_TRIM_GAP, 0))); setTrimStart(next); if (currentTime < next) seek(next); };
  const updateTrimEnd = (value) => { const next = Math.min(duration, Math.max(Number(value), trimStart + MIN_TRIM_GAP)); setTrimEnd(next); if (currentTime > next) seek(next); };
  const resetTrim = () => { setTrimStart(0); setTrimEnd(duration); setStatus("Recorte restablecido"); };
  const ensureNativeInput = async () => {
    if (!videoFile) return null;
    if (nativeInputPath) return nativeInputPath;
    setStatus("Preparando el video para Rust...");
    const bytes = Array.from(new Uint8Array(await videoFile.arrayBuffer()));
    const preparedPath = await invoke("prepare_video_file", { name: videoFile.name, data: bytes });
    setNativeInputPath(preparedPath);
    return preparedPath;
  };
  const getOutputPath = (suffix, extension = "mp4", sourcePath = null) => {
    const inputPath = sourcePath || nativeInputPath || videoFile?.path;
    return inputPath ? inputPath.replace(/\.[^/.]+$/, `_${suffix}.${extension}`) : null;
  };
  const processTrim = async () => {
    if (!duration) return;
    setIsProcessing(true);
    try { const input = await ensureNativeInput(); const output = getOutputPath("trimmed", "mp4", input); const result = await invoke("trim_video", { input, output, start: trimStart, end: trimEnd }); setStatus(`Recorte procesado con Rust: ${formatTime(trimEnd - trimStart)} · ${result}`); }
    catch (error) { setStatus(`Error en recorte: ${error}`); } finally { setIsProcessing(false); }
  };
  const selectEffect = async (effect) => {
    setSelectedEffect(effect.key);
    if (effect.key === "original") { setStatus("Efecto original restaurado"); return; }
    setIsProcessing(true);
    try { const input = await ensureNativeInput(); const output = getOutputPath(effect.key, "mp4", input); const result = await invoke("apply_video_effect", { input, output, effect: effect.key }); setStatus(`${effect.label} procesado con Rust + FFmpeg · ${result}`); }
    catch (error) { setStatus(`Error aplicando ${effect.label}: ${error}`); } finally { setIsProcessing(false); }
  };
  const exportVideo = async () => {
    if (!videoFile || !duration) { setStatus("Importa un video antes de exportar."); return; }
    setIsExporting(true); setExportProgress(0); setExportSuccess(false); setExportedPath(""); setStatus("Preparando exportación...");
    try {
      const input = await ensureNativeInput();
      const extension = exportFormat === "gif" ? "gif" : exportFormat;
      const output = await invoke("get_export_path", { name: videoFile.name, suffix: "exported", extension });
      const quality = exportQuality === "high" ? 85 : exportQuality === "medium" ? 65 : 45;
      const width = exportResolution === "original" ? null : Number(exportResolution);
      const result = await invoke("export_video", { input, output, format: exportFormat, quality, width, fps: Number(exportFps), start: trimStart, end: trimEnd });
      setExportProgress(100); setExportSuccess(true); setExportedPath(result); setStatus("Exportación completada correctamente");
    } catch (error) { setStatus(`Error exportando: ${error}`); }
    finally { setIsExporting(false); }
  };
  const onDrop = (event) => { event.preventDefault(); setIsDragging(false); importVideo(event.dataTransfer.files?.[0]); };

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Icon name="logo" size={22} /></span><span>Rusty<span className="brand-accent">Bros</span></span></div><div className="project-name"><span className="live-dot" />Proyecto sin título <span className="saved-label"><Icon name="check" size={13} /> Guardado</span></div><div className="top-actions"><button className="icon-button" aria-label="Configuración"><Icon name="settings" /></button><button className="avatar">TB</button></div></header>
    <div className="workspace"><aside className="sidebar"><div className="sidebar-section-label">PROYECTO</div><nav className="tool-nav"><button className={`tool-item ${activeTool === "media" ? "active" : ""}`} onClick={() => setActiveTool("media")}><Icon name="film" /><span>Medios</span><span className="tool-count">{videoFile ? 1 : 0}</span></button><button className={`tool-item ${activeTool === "effects" ? "active" : ""}`} onClick={() => setActiveTool("effects")}><Icon name="sliders" /><span>Efectos</span><span className="tool-count">RB4</span></button><button className={`tool-item ${activeTool === "export" ? "active" : ""}`} onClick={() => setActiveTool("export")}><Icon name="export" /><span>Exportar</span></button><button className={`tool-item ${activeTool === "game" ? "active" : ""}`} onClick={() => setActiveTool("game")}><Icon name="game" /><span>Juego</span><span className="tool-count">RB7-9</span></button></nav><div className="sidebar-divider" /><div className="sidebar-section-label">ARCHIVOS</div>{videoFile ? <div className="file-row"><span className="file-icon"><Icon name="video" size={15} /></span><span className="file-info"><strong>{videoFile.name}</strong><small>Video importado</small></span><Icon name="more" size={17} /></div> : <div className="empty-files">Todavía no hay archivos</div>}<div className="sidebar-footer"><div className="rust-badge"><span className="rust-spark">✦</span><span><strong>Potenciado por Rust</strong><small>Procesamiento local y seguro</small></span></div></div></aside>
      <main className="editor-area"><div className="editor-header"><div><span className="eyebrow">{activeTool === "game" ? "VIDEOJUEGO · PHASER" : "EDITOR DE VIDEO"}</span><h1>{activeTool === "game" ? "RustyBros: nivel 1" : "Tu espacio creativo"}</h1></div><div className="header-actions">{activeTool !== "game" && <><button className="secondary-button"><Icon name="folder" size={16} /> Abrir proyecto</button><button className="primary-button" onClick={() => inputRef.current?.click()}><Icon name="upload" size={16} /> Importar video</button><input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.mov,.avi,.mkv" hidden onChange={(event) => importVideo(event.target.files?.[0])} /></>}</div></div>{activeTool === "game" && <PlatformGame />}
        <div className="editor-grid"><section className="main-column"><div className="preview-card"><div className="card-topline"><span>PREVIEW</span><span className="preview-status"><span className="status-dot" /> {isProcessing ? "Procesando con Rust..." : status}</span></div><div className={`video-stage ${isDragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>{videoUrl ? <video ref={videoRef} src={videoUrl} style={{ filter: effectData.filter }} onLoadedMetadata={handleVideoLoaded} onTimeUpdate={syncVideoTime} onEnded={() => setIsPlaying(false)} /> : <div className="empty-preview"><div className="empty-preview-icon"><Icon name="upload" size={26} /></div><h2>Arrastra tu video aquí</h2><p>o selecciónalo desde tu equipo</p><button className="outline-button" onClick={() => inputRef.current?.click()}>Seleccionar archivo</button><small>MP4, MOV, AVI o MKV · hasta 2 GB</small></div>}{videoUrl && <div className="video-overlay"><span>{metadata?.format || "VIDEO"}</span><span>{metadata?.width && metadata?.height ? `${metadata.width} × ${metadata.height}` : "Analizando..."}</span></div>}</div><div className="transport"><button className="transport-button" onClick={() => seek(Math.max(currentTime - 5, trimStart))}>−5</button><button className="play-button" onClick={togglePlayback}><Icon name={isPlaying ? "pause" : "play"} size={19} /></button><button className="transport-button" onClick={() => seek(Math.min(currentTime + 5, trimEnd || currentTime + 5))}>+5</button><span className="time-readout">{formatTime(currentTime)} <span>/</span> {formatTime(duration)}</span><div className="transport-spacer" /><span className="zoom-label">100%</span><button className="icon-button"><Icon name="more" /></button></div></div>
        <div className="timeline-card"><div className="timeline-header"><div><span className="eyebrow">SECUENCIA · RB3</span><strong>{videoFile ? videoFile.name : "Sin medios en la secuencia"}</strong></div><span className="timeline-duration"><Icon name="clock" size={14} /> Selección {formatTime(Math.max(trimEnd - trimStart, 0))}</span></div><div className="timeline-ruler">{timelineMarkers.map((marker) => <span key={marker} style={{ left: `${marker}%` }}>{formatTime(duration * marker / 100)}</span>)}</div><div className="timeline-track"><div className="track-label"><span className="track-color video-color" /><span>Video 1</span></div><div className="track-content trim-content">{videoFile ? <div className="clip" style={{ width: "100%" }}><span>{videoFile.name}</span><i /><i /><i /></div> : <div className="track-placeholder">Importa un video para comenzar</div>}<div className="trim-selection" style={{ left: `${startPercent}%`, width: `${Math.max(endPercent - startPercent, 0)}%` }} /><div className="playhead" style={{ left: `${progress}%` }} /></div></div><div className="trim-controls"><div><span>IN</span><strong>{formatTime(trimStart)}</strong></div><div className="trim-range-wrap"><input aria-label="Inicio del recorte" className="trim-range trim-range-start" type="range" min="0" max={duration || 1} step="0.01" value={trimStart} onChange={(event) => updateTrimStart(event.target.value)} /><input aria-label="Fin del recorte" className="trim-range trim-range-end" type="range" min="0" max={duration || 1} step="0.01" value={trimEnd || duration || 0} onChange={(event) => updateTrimEnd(event.target.value)} /></div><div><span>OUT</span><strong>{formatTime(trimEnd)}</strong></div><button className="secondary-button compact-button" onClick={resetTrim}>Restablecer</button><button className="primary-button compact-button" disabled={isProcessing || !videoFile} onClick={processTrim}>Procesar recorte</button></div><div className="timeline-track audio-track"><div className="track-label"><span className="track-color audio-color" /><span>Audio 1</span></div><div className="track-content"><div className="audio-placeholder" /></div></div><input className="timeline-scrubber" type="range" min="0" max={duration || 1} step="0.01" value={currentTime} onChange={(event) => seek(event.target.value)} /></div></section>
          <aside className="inspector"><div className="inspector-tabs"><button className={activeTool === "effects" ? "active" : ""} onClick={() => setActiveTool("effects")}>Efectos</button><button className={activeTool === "export" ? "active" : ""} onClick={() => setActiveTool("export")}>Exportar</button></div>{activeTool === "export" ? <ExportPanel format={exportFormat} setFormat={setExportFormat} quality={exportQuality} setQuality={setExportQuality} resolution={exportResolution} setResolution={setExportResolution} fps={exportFps} setFps={setExportFps} progress={exportProgress} exporting={isExporting} success={exportSuccess} exportedPath={exportedPath} disabled={!videoFile || !duration} onExport={exportVideo} /> : <><div className="inspector-heading"><div><span className="eyebrow">EFECTOS · RB4</span><h2>Procesa tu video</h2></div><span className="pro-pill">RUST</span></div><div className="effect-grid">{EFFECTS.map((effect) => <button key={effect.key} className={`effect-button ${selectedEffect === effect.key ? "selected" : ""}`} onClick={() => selectEffect(effect)}><span className="effect-preview" style={{ filter: effect.filter }} /><span>{effect.label}</span>{selectedEffect === effect.key && <Icon name="check" size={14} />}</button>)}</div><div className="effect-footer"><span>{isProcessing ? "Procesando..." : "Previsualización instantánea"}</span><span className="metadata-ok"><Icon name="check" size={13} /> FFmpeg</span></div><div className="inspector-divider" /><div className="metadata-heading"><span className="eyebrow">METADATOS · RB2</span>{metadata && <span className="metadata-ok"><Icon name="check" size={13} /> Leído</span>}</div>{metadata ? <div className="metadata-list"><div><span>Archivo</span><strong title={metadata.name}>{metadata.name}</strong></div><div><span>Formato</span><strong>{metadata.format}</strong></div><div><span>Resolución</span><strong>{metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : "Pendiente"}</strong></div><div><span>Duración</span><strong>{formatTime(metadata.duration)}</strong></div><div><span>Tamaño</span><strong>{metadata.size}</strong></div><div><span>Origen</span><strong>{metadata.source}</strong></div></div> : <div className="metadata-empty"><Icon name="video" size={18} /><span>Importa un video para ver sus datos técnicos.</span></div>}</>}</aside></div></main></div>
  </div>;
}

function ExportPanel({ format, setFormat, quality, setQuality, resolution, setResolution, fps, setFps, progress, exporting, success, exportedPath, disabled, onExport }) { return <div className="export-panel"><div className="inspector-heading"><div><span className="eyebrow">SALIDA</span><h2>Exportar proyecto</h2></div><span className="pro-pill">RB5 · RB6</span></div><label>Formato<select value={format} onChange={(event) => setFormat(event.target.value)}><option value="mp4">MP4</option><option value="webm">WebM</option><option value="gif">GIF</option></select></label><label>Calidad<select value={quality} onChange={(event) => setQuality(event.target.value)}><option value="high">Alta</option><option value="medium">Media</option><option value="low">Rápida</option></select></label><label>Resolución<select value={resolution} onChange={(event) => setResolution(event.target.value)}><option value="original">Original</option><option value="1080">1080p</option><option value="720">720p</option></select></label><label>FPS<select value={fps} onChange={(event) => setFps(event.target.value)}><option value="24">24 FPS</option><option value="30">30 FPS</option><option value="60">60 FPS</option></select></label>{(exporting || progress > 0) && <div className="export-progress"><div className="export-progress-head"><span>RB6 · Progreso en tiempo real</span><strong>{progress}%</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div></div>}{success && <div className="export-success"><div className="export-success-title"><Icon name="check" size={15} /> Exportación correcta</div><small>Guardado en la carpeta <strong>exports</strong></small><span title={exportedPath}>{exportedPath}</span></div>}<button className="primary-button export-button" disabled={disabled || exporting} onClick={onExport}><Icon name="export" size={16} /> {exporting ? "Exportando..." : "Exportar video"}</button><p className="panel-note">MP4, WebM o GIF · se guarda dentro de RustyBros/exports.</p></div>; }

export default App;
