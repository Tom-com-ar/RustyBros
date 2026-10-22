use serde::Serialize;
use std::path::Path;
use std::process::Command;

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

fn run_ffmpeg(args: &[&str]) -> Result<(), String> {
    let status = Command::new("ffmpeg").args(args).status().map_err(|error| format!("No se pudo iniciar FFmpeg: {error}"))?;
    if status.success() { Ok(()) } else { Err("FFmpeg terminó con error".to_string()) }
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
            let fields: Vec<&str> = values.trim().split(",").collect();
            metadata.width = fields.first().and_then(|value| value.parse().ok());
            metadata.height = fields.get(1).and_then(|value| value.parse().ok());
            metadata.duration = fields.get(2).and_then(|value| value.parse().ok());
            metadata.source = "Rust + FFprobe".to_string();
        }
    }
    Ok(metadata)
}

#[tauri::command]
fn trim_video(input: String, output: String, start: f64, end: f64) -> Result<(), String> {
    if start < 0.0 || end <= start { return Err("El rango de recorte no es válido".to_string()); }
    let start_value = format!("{start:.3}");
    let duration_value = format!("{:.3}", end - start);
    run_ffmpeg(&["-y", "-ss", &start_value, "-i", &input, "-t", &duration_value, "-c:v", "libx264", "-c:a", "aac", &output])
}

#[tauri::command]
fn apply_video_effect(input: String, output: String, effect: String) -> Result<(), String> {
    let filter = match effect.as_str() {
        "grayscale" => "hue=s=0",
        "sepia" => "colorchannelmixer=.393:.769:.189:.349:.686:.168:.272:.534:.131",
        "blur" => "boxblur=5:1",
        "sharpen" => "unsharp=5:5:1.0:5:5:0.0",
        "pixelate" => "scale=iw/12:ih/12:flags=neighbor,scale=iw*12:ih*12:flags=neighbor",
        "glitch" => "rgbashift=rh=5:rv=0:gh=-3:gv=0:bh=0:bv=3",
        _ => return Err(format!("Efecto desconocido: {effect}")),
    };
    run_ffmpeg(&["-y", "-i", &input, "-vf", filter, "-c:a", "copy", &output])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_video_metadata, trim_video, apply_video_effect])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
