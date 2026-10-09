# Lumiweg — Backend de IA

Este backend es la única ruta de inteligencia artificial que debe utilizar el APK. Las claves de los proveedores **no se escriben en la aplicación ni en GitHub**: se guardan como variables de entorno privadas del servicio desplegado (por ejemplo, Railway).

## Configuración en Railway

1. Despliega el servicio usando la carpeta `backend/` de este repositorio.
2. En el servicio, abre **Variables** y agrega una o más claves de la tabla inferior.
3. Despliega/reinicia el servicio y comprueba que `https://TU-DOMINIO/health` devuelve `ok: true` y `listo: true`.
4. En Lumi Android abre **Motores de IA → Backend propio** y pega solo la URL pública del servicio. No pegues claves en la aplicación.
5. Pulsa **Guardar y probar**.

## Variables de entorno privadas

Solo necesitas una clave para empezar; puedes añadir más como respaldo.

| Variable | Proveedor |
|---|---|
| `GEMINI_API_KEY` | Google Gemini |
| `GROQ_API_KEY` | Groq |
| `OPENROUTER_API_KEY` | OpenRouter |
| `CEREBRAS_API_KEY` | Cerebras |
| `MISTRAL_API_KEY` | Mistral |
| `TOGETHER_API_KEY` | Together AI |
| `HF_TOKEN` | Hugging Face |
| `GOOGLE_API_KEY` | Alternativa para Gemini |
| `HUGGINGFACE_API_KEY` | Alternativa para Hugging Face |
| `PORT` | Puerto; Railway suele inyectarlo automáticamente |

No escribas estas claves en archivos del repositorio, en commits, capturas de pantalla ni en el chat. Configúralas directamente en el panel del proveedor de despliegue.

## Endpoints

| Método | Ruta | Uso |
|---|---|---|
| GET | `/` o `/health` | Estado y proveedores configurados |
| GET | `/models` | Modelos disponibles |
| POST | `/chat/completions` | Chat compatible con OpenAI y herramientas |

La aplicación envía las solicitudes a `/chat/completions`; el backend selecciona el proveedor configurado y puede pasar al siguiente si uno falla.

## Despliegue

Configura el directorio raíz del servicio como `backend/` en Railway y utiliza el comando de inicio compatible con Bun del proyecto. Después, copia el dominio HTTPS asignado por Railway y úsalo en la configuración de Lumi. El dominio es una URL pública, no una clave secreta.
