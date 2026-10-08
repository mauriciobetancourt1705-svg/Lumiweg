# ✦ Lumi — Asistente Virtual Total

Tu vida, más fácil, más inteligente.
Bienestar 24/7 · Voz · Memoria · Acciones · Todo en uno.

## Características

- 💬 Chat conversacional con comandos inteligentes (tareas, recordatorios, eventos, bienestar)
- 🎙️ Voz real en el navegador: reconocimiento de voz (STT) y síntesis (TTS) en español
- 🧠 Memoria persistente: chat, tareas, eventos, ánimo y configuración (localStorage)
- ✅ Tareas y recordatorios con check
- 📅 Calendario mensual con eventos (prueba decirle a Lumi: "evento 15 18:00 Gimnasio")
- 🎵 Reproductor multimedia con playlist
- 🌿 Modo Bienestar: respiración guiada animada y registro de ánimo
- 🎨 Personalización: nombre y color de acento
- 📲 PWA instalable y funciona offline

## Cómo probarla localmente

```bash
cd lumi-web
python -m http.server 8080
# abre http://localhost:8080
```

> Nota: la voz (STT/TTS) requiere Chrome/Edge y servirse por http/https (no file://).

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (público).
2. Sube todo el contenido de esta carpeta (`index.html` en la raíz).
3. En el repo: **Settings → Pages → Source: rama `main` → carpeta `/ (root)` → Save**.
4. En 1-2 minutos estará en `https://tuusuario.github.io/turepo/`

## Convertir a app Android (opcional)

Este PWA ya es instalable. Para Play Store puedes empaquetarlo con:
- **Bubblewrap** o **PWABuilder** (pwabuilder.com) — genera el AAB desde la URL de GitHub Pages.
- O reescribir la UI en **Kotlin + Jetpack Compose** reutilizando esta lógica como referencia.

## Estructura

```
lumi-web/
├── index.html        # Pantallas de la app (SPA)
├── css/style.css     # Estética neón azul/morada
├── js/app.js         # Cerebro de Lumi: chat, voz, tareas, calendario...
├── manifest.json     # PWA
├── sw.js             # Service worker (offline)
├── icons/            # Íconos de la app
└── README.md
```

---
Hecho con ✦ por Lumi