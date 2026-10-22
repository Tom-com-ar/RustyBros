# RustyBros

Editor de video de escritorio con Tauri 2, Rust, React y Vite.

## Estado actual

- RB1: ventana principal con preview, timeline, panel de efectos y panel de exportacion.
- RB2: importacion de MP4, MOV, AVI y MKV con nombre, formato, tamano, duracion y resolucion.
- RB3: seleccion de inicio y fin sobre la timeline, reproduccion limitada y command Rust `trim_video`.
- RB4: grayscale, sepia, blur, sharpen, pixelate y glitch con previsualizacion y command Rust `apply_video_effect`.
- RB5: exportacion MP4, WebM y GIF con calidad, resolucion y FPS configurables dentro de `exports/`.
- RB6: barra de progreso en tiempo real mediante eventos Rust `export-progress` durante FFmpeg.
- Tauri: commands Rust para metadatos, preparacion de archivos, recorte, efectos y exportacion; FFmpeg instalado para el procesamiento local.
- Fallback web: selector HTML y arrastrar/soltar.

## Preparar el entorno

Instalar Node.js, Rust mediante rustup, Visual Studio Build Tools con MSVC y Windows SDK. Para los metadatos completos, tener FFmpeg/FFprobe en el PATH.

```bash
npm install
npm run dev
npm run tauri dev
```

Los videos seleccionados desde el navegador se copian a una carpeta temporal de RustyBros para que RB3, RB4 y RB5 puedan procesarlos con Rust aunque el selector no exponga la ruta original. Las exportaciones se guardan en `RustyBros/exports/` y la interfaz muestra una confirmacion verde al finalizar.
