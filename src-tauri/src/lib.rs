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

/// Reads technical metadata locally when FFprobe is available.
/// The UI also has a WebView fallback so importing remains useful before
/// the native video toolchain is installed.
#[tauri::command]
fn get_video_metadata(path: String) -> Result<VideoMetadata, String> {
    let file_path = Path::new(&path);
    let file = std::fs::metadata(file_path).map_err(|error| error.to_string())?;
    let format = file_path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("video")
        .to_uppercase();
    let name = file_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("video")
        .to_string();

    let mut metadata = VideoMetadata {
        name,
        format,
        size: file.len(),
        duration: None,
        width: None,
        height: None,
        source: "Rust".to_string(),
    };

    if let Ok(output) = Command::new("ffprobe")
        .args([
            "-v", "error", "-select_streams", "v:0", "-show_entries",
            "stream=width,height,duration", "-of", "csv=p=0", &path,
        ])
        .output()
    {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_video_metadata])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
