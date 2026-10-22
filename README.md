# RustyBros

Editor de video de escritorio con Tauri 2, Rust, React y Vite.

## Estado actual

- RB1: ventana principal con preview, timeline, panel de efectos y panel de exportacion.
- RB2: importacion de MP4, MOV, AVI y MKV con nombre, formato, tamano, duracion y resolucion.
- Tauri: command Rust `get_video_metadata` preparado para el flujo nativo.
- Fallback web: selector HTML y arrastrar/soltar.

## Preparar el entorno

Instalar Node.js, Rust mediante rustup, Visual Studio Build Tools con MSVC y Windows SDK. Para los metadatos completos, tener FFmpeg/FFprobe en el PATH.

```bash
npm install
npm run dev
npm run tauri dev
```

El siguiente paso es RB3: recorte con inicio y fin sobre la timeline.
