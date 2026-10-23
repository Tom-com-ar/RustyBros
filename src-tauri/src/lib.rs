use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize)]
struct VideoMetadata {
    name: String,
    format: String,
    size: u64,
    duration: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    source: String,
}

#[derive(Clone, Debug, Serialize)]
struct ExportProgress {
    progress: f64,
    status: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct GameState {
    score: i32,
    lives: i32,
    coins: i32,
    time: f64,
    level_progress: i32,
    editor_rewards: i32,
    status: String,
    completed: bool,
    game_over: bool,
}

impl Default for GameState {
    fn default() -> Self {
        Self {
            score: 0,
            lives: 3,
            coins: 0,
            time: 0.0,
            level_progress: 0,
            editor_rewards: 0,
            status: "Preparado".to_string(),
            completed: false,
            game_over: false,
        }
    }
}

#[tauri::command]
fn get_game_state(state: tauri::State<'_, Mutex<GameState>>) -> Result<GameState, String> {
    state.lock().map(|current| current.clone()).map_err(|_| "No se pudo leer el estado compartido del juego".to_string())
}

#[tauri::command]
fn update_game_state(next_state: GameState, state: tauri::State<'_, Mutex<GameState>>) -> Result<GameState, String> {
    let mut current = state.lock().map_err(|_| "No se pudo actualizar el estado compartido del juego".to_string())?;
    *current = next_state.clone();
    Ok(next_state)
}

fn run_ffmpeg(args: &[&str]) -> Result<(), String> {
    let status = Command::new("ffmpeg")
        .args(args)
        .status()
        .map_err(|error| format!("No se pudo iniciar FFmpeg: {error}"))?;
    if status.success() { Ok(()) } else { Err("FFmpeg terminó con error".to_string()) }
}

fn safe_file_name(name: &str) -> String {
    let cleaned: String = name.chars().filter(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_')).collect();
    if cleaned.is_empty() { "input.mp4".to_string() } else { cleaned }
}

fn project_exports_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap_or(Path::new(".")).join("exports")
}

#[tauri::command]
fn get_export_path(name: String, suffix: String, extension: String) -> Result<String, String> {
    let folder = project_exports_dir();
    std::fs::create_dir_all(&folder).map_err(|error| format!("No se pudo crear la carpeta de exportaciones: {error}"))?;
    let safe_name = safe_file_name(&name);
    let stem = Path::new(&safe_name).file_stem().and_then(|value| value.to_str()).unwrap_or("video");
    let safe_suffix = safe_file_name(&suffix);
    let safe_extension = safe_file_name(&extension);
    Ok(folder.join(format!("{stem}_{safe_suffix}.{safe_extension}")).to_string_lossy().into_owned())
}

#[tauri::command]
fn get_video_metadata(path: String) -> Result<VideoMetadata, String> {
    let file_path = Path::new(&path);
    let file = std::fs::metadata(file_path).map_err(|error| error.to_string())?;
    let format = file_path.extension().and_then(|extension| extension.to_str()).unwrap_or("video").to_uppercase();
    let name = file_path.file_name().and_then(|name| name.to_str()).unwrap_or("video").to_string();
    let mut metadata = VideoMetadata { name, format, size: file.len(), duration: None, width: None, height: None, source: "Rust".to_string() };
    if let Ok(output) = Command::new("ffprobe").args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,duration", "-of", "csv=p=0", &path]).output() {
        if output.status.success() {
            let values = String::from_utf8_lossy(&output.stdout);
            let fields: Vec<&str> = values.trim().split(',').collect();
            metadata.width = fields.first().and_then(|value| value.parse().ok());
            metadata.height = fields.get(1).and_then(|value| value.parse().ok());
            metadata.duration = fields.get(2).and_then(|value| value.parse().ok());
            metadata.source = "Rust + FFprobe".to_string();
        }
    }
    Ok(metadata)
}

#[tauri::command]
fn prepare_video_file(data: Vec<u8>, name: String) -> Result<String, String> {
    let folder = std::env::temp_dir().join("rustybros");
    std::fs::create_dir_all(&folder).map_err(|error| format!("No se pudo preparar la carpeta temporal: {error}"))?;
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_nanos();
    let path = folder.join(format!("{}_{}", timestamp, safe_file_name(&name)));
    std::fs::write(&path, data).map_err(|error| format!("No se pudo copiar el video para Rust: {error}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn trim_video(input: String, output: String, start: f64, end: f64) -> Result<String, String> {
    if start < 0.0 || end <= start { return Err("El rango de recorte no es válido".to_string()); }
    let start_value = format!("{start:.3}");
    let duration_value = format!("{:.3}", end - start);
    run_ffmpeg(&["-y", "-ss", &start_value, "-i", &input, "-t", &duration_value, "-c:v", "libx264", "-c:a", "aac", &output])?;
    Ok(output)
}

#[tauri::command]
fn apply_video_effect(input: String, output: String, effect: String) -> Result<String, String> {
    let filter = match effect.as_str() {
        "grayscale" => "hue=s=0",
        "sepia" => "colorchannelmixer=.393:.769:.189:.349:.686:.168:.272:.534:.131",
        "blur" => "boxblur=5:1",
        "sharpen" => "unsharp=5:5:1.0:5:5:0.0",
        "pixelate" => "scale=iw/12:ih/12:flags=neighbor,scale=iw*12:ih*12:flags=neighbor",
        "glitch" => "rgbashift=rh=5:rv=0:gh=-3:gv=0:bh=0:bv=3",
        _ => return Err(format!("Efecto desconocido: {effect}")),
    };
    run_ffmpeg(&["-y", "-i", &input, "-vf", filter, "-c:a", "copy", &output])?;
    Ok(output)
}

#[tauri::command]
fn export_video(app: AppHandle, input: String, output: String, format: String, quality: u8, width: Option<u32>, fps: u32, start: f64, end: f64) -> Result<String, String> {
    if start < 0.0 || end <= start { return Err("El rango de exportación no es válido".to_string()); }
    if !matches!(format.as_str(), "mp4" | "webm" | "gif") { return Err("Formato de exportación no compatible".to_string()); }
    if fps == 0 { return Err("Los FPS deben ser mayores que cero".to_string()); }

    let total_duration = (end - start).max(0.01);
    let crf = match quality {
        0..=50 => "30",
        51..=75 => "24",
        _ => "18",
    };
    let mut args: Vec<String> = vec!["-y".into(), "-ss".into(), format!("{start:.3}"), "-i".into(), input.clone(), "-t".into(), format!("{total_duration:.3}")];
    let mut filters = Vec::new();
    if format == "gif" || fps != 30 { filters.push(format!("fps={fps}")); }
    if let Some(video_width) = width { filters.push(format!("scale={video_width}:-2")); }
    if !filters.is_empty() { args.extend(["-vf".into(), filters.join(",")]); }

    match format.as_str() {
        "mp4" => args.extend(["-c:v".into(), "libx264".into(), "-preset".into(), "medium".into(), "-crf".into(), crf.into(), "-c:a".into(), "aac".into()]),
        "webm" => args.extend(["-c:v".into(), "libvpx-vp9".into(), "-crf".into(), crf.into(), "-b:v".into(), "0".into(), "-c:a".into(), "libopus".into()]),
        "gif" => args.extend(["-an".into(), "-f".into(), "gif".into()]),
        _ => unreachable!(),
    }
    args.extend(["-progress".into(), "pipe:1".into(), "-nostats".into(), output.clone().into()]);
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let mut child = Command::new("ffmpeg")
        .args(&arg_refs)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("No se pudo iniciar FFmpeg: {error}"))?;
    if let Some(stdout) = child.stdout.take() {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(value) = line.strip_prefix("out_time_ms=") {
                if let Ok(microseconds) = value.parse::<f64>() {
                    let progress = (microseconds / 1_000_000.0 / total_duration).clamp(0.0, 0.99);
                    let _ = app.emit("export-progress", ExportProgress { progress, status: format!("Exportando... {:.0}%", progress * 100.0) });
                }
            }
        }
    }
    let status = child.wait().map_err(|error| format!("No se pudo finalizar FFmpeg: {error}"))?;
    if !status.success() { return Err("FFmpeg terminó con error durante la exportación".to_string()); }
    let _ = app.emit("export-progress", ExportProgress { progress: 1.0, status: "Exportación completa".to_string() });
    Ok(output)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(GameState::default()))
        .invoke_handler(tauri::generate_handler![get_video_metadata, prepare_video_file, get_export_path, trim_video, apply_video_effect, export_video, get_game_state, update_game_state])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

