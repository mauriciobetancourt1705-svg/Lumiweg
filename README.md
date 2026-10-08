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
python -m http.server 8080
# abre http://localhost:8080
```

> Nota: la voz (STT/TTS) requiere Chrome/Edge y servirse por http/https (no file://).

## Compilación Android

El flujo de GitHub Actions `.github/workflows/android.yml` compila el APK de depuración y lo publica como artefacto descargable cuando se actualiza la rama `lumi-only`. El APK se considera disponible únicamente después de que la ejecución termine correctamente y se verifique el artefacto.

## Estructura

```
index.html
css/style.css
js/app.js
manifest.json
sw.js
icons/
app/
.github/workflows/android.yml
```

---
Hecho con ✦ por Lumi