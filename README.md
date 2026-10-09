# Lumiweg — Asistente personal total para Android

Lumi vive en tu teléfono, conversa contigo y **actúa**: manda mensajes, llama,
abre apps, pone alarmas, crea eventos, lee tus notificaciones, controla la
música, la linterna y la pantalla.

Antes esta app no tenía IA. De verdad: `js/app.js` traía `AI_ENDPOINT = ''`, así
que `askAI()` devolvía `null` siempre y **todo** caía en `brain()`, quince líneas
de expresiones regulares con respuestas fijas. El backend pedía el modelo
`gpt-6-luna`, que no existe en ningún proveedor. Nunca hubo conversación real.
Esto es lo que hay ahora en su lugar.

---

## Qué cambió

| Antes | Ahora |
|---|---|
| `AI_ENDPOINT = ''` → sin IA | `js/lumi-core.js`: 9 motores con capa gratuita, enrutados con fallback |
| Respuestas por regex | Personas reales (bienestar, tutor, oráculo) trasplantadas del núcleo de Education |
| Modelo `gpt-6-luna` (inexistente) | Descubrimiento de modelos en runtime vía `/models` + defaults verificados |
| WebView que solo abría URLs | 27 herramientas nativas: SMS, llamadas, contactos, apps, alarmas, calendario, notificaciones, accesibilidad |
| Sin voz en el APK | STT nativo de Android (el WebView no implementa la Web Speech API) + TTS |
| Sin permisos | Permisos en runtime con pantalla de estado real |
| Sin icono | Iconos mipmap + icono adaptativo |

---

## Arquitectura

```
index.html          UI (una sola página, pantallas por secciones)
css/style.css
js/lumi-core.js     CEREBRO — personas + router multi-proveedor + agent loop
js/lumi-device.js   MANOS   — 27 herramientas que actúan sobre Android
js/app.js           UI      — conecta pantalla, voz, tareas, calendario y bienestar
sw.js               Service worker (PWA)

app/                Android: WebView + puente nativo
  MainActivity.java              contenedor, permisos, TTS, STT
  LumiBridge.java                puente JS -> Android (window.LumiNative)
  LumiAccessibilityService.java  acciones globales (atrás, inicio, bloquear…)
  LumiNotificationService.java   lectura de notificaciones
backend/            Opcional: proxy compatible con OpenAI, sin claves en el móvil
```

### Cómo se hablan las tres capas

1. `lumi-device.js` declara cada herramienta con su esquema JSON (formato de
   *function calling* de OpenAI) y sabe cómo ejecutarla.
2. `lumi-core.js` envía esos esquemas al modelo. Si el modelo pide una
   herramienta, se ejecuta y el resultado **real** vuelve al modelo (agent loop,
   4 pasos máximo). Después el modelo redacta la respuesta final.
3. La interfaz dibuja cada herramienta ejecutada como una etiqueta verde (✓) o
   roja (✕), así se ve de un vistazo qué se hizo de verdad.

**Regla de oro, escrita en el prompt del sistema:** Lumi solo afirma que hizo
algo si una herramienta devolvió éxito. Si falla o falta un permiso, lo dice y
explica qué falta. Nunca inventa que envió un mensaje o puso una alarma.

---

## Los 9 motores de IA (todos con capa gratuita)

| Motor | Modelo por defecto | Clave gratuita |
|---|---|---|
| Groq | `llama-3.3-70b-versatile` | https://console.groq.com/keys |
| Google Gemini | `gemini-3.8-flash` | https://aistudio.google.com/apikey |
| OpenRouter | `nvidia/nemotron-3.5-lightning:free` | https://openrouter.ai/keys |
| Cerebras | `gpt-oss-120b` | https://cloud.cerebras.ai |
| Mistral | `mistral-small-latest` | https://console.mistral.ai/api-keys |
| Together AI | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | https://api.together.ai/settings/api-keys |
| Hugging Face | `meta-llama/Llama-3.3-70B-Instruct` | https://huggingface.co/settings/tokens |
| Cloudflare Workers AI | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Necesita Account ID |
| Backend propio | `auto` | `backend/README.md` |

Configura los que quieras en **Ajustes → Motores de IA**. Lumi usa el primero
disponible y salta al siguiente cuando uno falla o se agota (401, 402, 429, 5xx).
Las claves se guardan **solo en tu teléfono** (almacenamiento local de la app):
no viajan a ningún servidor nuestro y no están dentro del APK.

Si no configuras ninguno, Lumi sigue funcionando en **modo local** con el
fallback de bienestar trasplantado, y te avisa de que está en ese modo.

### Por qué el descubrimiento de modelos importa

Los proveedores renombran y retiran modelos constantemente. La app pregunta a
`/models` de cada proveedor (con caché de 24 h) y elige el primero que encaje
con su preferencia; si eso falla, usa la lista por defecto. Por eso el intento
anterior se murió y este no: no depende de un nombre escrito a mano.

---

## Las 27 herramientas del teléfono

**Mensajería y llamadas** · `enviar_sms` `enviar_whatsapp` `llamar` `buscar_contacto`

**Apps y pantalla** · `abrir_app` `listar_apps` `abrir_url` `buscar_youtube`

**Multimedia y hardware** · `control_multimedia` `linterna`

**Organización** · `poner_alarma` `crear_recordatorio` `listar_tareas` `crear_evento_calendario` `leer_notificaciones`

**Sistema** · `estado_bateria` `info_dispositivo` `pedir_permiso` `abrir_ajustes_sistema` `controlar_pantalla`

**Comunicación** · `decir_en_voz_alta` `enviar_correo` `navegar_a` `copiar_portapapeles` `compartir`

**Bienestar** · `registrar_animo` `leer_bienestar`

---

## Permisos

La app los pide al arrancar y muestra su estado en **Ajustes → Permisos y control**.

| Permiso | Para qué |
|---|---|
| SMS | Enviar mensajes |
| Contactos | Buscar por nombre antes de escribir |
| Teléfono | Llamar |
| Calendario | Crear eventos reales |
| Micrófono | Voz |
| Cámara | Linterna |
| Notificaciones | Avisos de Lumi |
| **Accesibilidad** (manual) | Controlar la pantalla y otras apps |
| **Acceso a notificaciones** (manual) | Leer y resumir tus avisos |

Los dos últimos **no se pueden conceder por código**: Android obliga a activarlos
a mano. La app te lleva directo a la pantalla correcta.

> Este APK es de **uso personal**. Los permisos de SMS y llamadas son legítimos
> para ti, pero Google Play los restringe: si algún día quieres publicarlo, hay
> que quitarlos o justificarlos ante la tienda.

---

## Compilar el APK

El APK se compila en GitHub Actions, no hace falta Android Studio:

```bash
git push origin main
```

El flujo `.github/workflows/android.yml` valida la estructura, comprueba la
sintaxis del JavaScript, compila con Gradle 8.9 / JDK 17 / android-35 y sube el
artefacto **`Lumiweg-debug-apk`**. Se descarga desde la pestaña *Actions* del
repositorio.

Para probar la interfaz en el navegador sin compilar nada:

```bash
python3 -m http.server 8000
```

---

## Del núcleo de Education a Lumiweg

El cerebro viene del repositorio privado `Education` (que **no** se modificó).
De ahí salen las personas, y encima se añadió lo que allí no existía:

| Pieza | Origen |
|---|---|
| Persona LUMI (bienestar) | `Education/backend/server.js:502` |
| Persona TUTOR | `server.js:476-489` |
| Persona ORÁCULO / ORÁCULO-MAX | `server.js:434`, `581-598` |
| Fallback local de bienestar | `server.js:543-552` |
| Lógica de contexto y check-ins | `Education/backend/public/wellbeing.js` |
| Router multi-proveedor | **nuevo** |
| Agent loop con herramientas | **nuevo** |
| Transporte nativo (sin CORS) | **nuevo** |

---

## Modos de Lumi

Cuatro personalidades, las mismas capacidades:

- **✦ Total** — de todo: vida diaria, organización, bienestar, control del teléfono.
- **🌿 Bienestar** — acompañamiento emocional, sin diagnosticar ni moralizar.
- **📚 Tutor** — explicar, practicar, corregir sin dar la respuesta de golpe.
- **🔮 Oráculo** — lectura simbólica y reflexiva.

Se cambian desde **Ajustes → Motores de IA → Modo de Lumi**.
