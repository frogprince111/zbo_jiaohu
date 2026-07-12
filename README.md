# Gesture Visual Feedback System

Realtime camera-based hand gesture visual feedback system using MediaPipe Hands and Three.js.

## Local Preview

```bash
cd outputs/gesture-visual-feedback-system
python3 -m http.server 5173
```

Open:

```text
http://127.0.0.1:5173
```

## Render Deploy

This repo includes `render.yaml` for Render Blueprint deployment.

- Service type: Static Site
- Publish path: `outputs/gesture-visual-feedback-system`
- Build command: empty

Render provides HTTPS, which is required for camera access on mobile browsers.

## Features

- Camera gesture recognition via MediaPipe Hands
- Three.js particle field
- Fist: particles and photos cluster at center
- Open palm / both hands: particles spread into a 3D field
- One finger: clockwise 3D particle rotation
- Two fingers: counter-clockwise rotation with vertical control
- Thumb: 3D heart particle shape
- Pinch: randomly focus one uploaded photo in the center
- Mobile responsive layout and reduced particle load
- A second mobile-ready hand-gesture module with a transparent 3D cube and eight detailed object models
- Front-camera support on iOS and Android, including portrait/landscape resizing and an in-page fullscreen fallback

## Mobile Use

Open the deployed HTTPS address in Safari or Chrome, enter the second module, tap `开启摄像头`, and allow camera access. Camera APIs are blocked on ordinary HTTP addresses, so mobile testing must use the Render HTTPS deployment rather than a LAN IP address.
