# Lumiweg — Backend de IA (opcional)

Este backend **no es obligatorio**. La app funciona sola: guardas tus claves
gratuitas en Ajustes → Motores de IA y Lumi habla directo con cada proveedor
desde el teléfono.

Sirve para lo contrario: **no llevar ninguna clave dentro del APK**. El backend
guarda las claves en variables de entorno del servidor y expone una API
compatible con OpenAI. En la app se configura como proveedor «Backend propio».

## Antes estaba roto

Pedía el modelo `gpt-6-luna`, que no existe en ningún proveedor, y no tenía
`package.json` ni `Dockerfile`. Nunca conectó. Ahora enruta entre varios
motores gratuitos y descubre los modelos en runtime.

## Endpoints

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/health` | Estado y qué proveedores tienen clave |
| GET | `/models` | Modelos disponibles (formato OpenAI) |
| POST | `/chat/completions` | Igual que la API de OpenAI, con soporte de `tools` |

### POST /chat/completions

```json
{
  "model": "auto",
  "messages": [
    {"role": "system", "content": "Eres Lumi…"},
    {"role": "user", "content": "Ponme una alarma a las 7"}
  ],
  "temperature": 0.35,
  "max_tokens": 1200,
  "tools": [{"type": "function", "function": {"name": "poner_alarma", "parameters": {}}}]
}
```

`model: "auto"` deja que el backend elija el mejor modelo del primer proveedor
con clave. Si un proveedor falla (401, 429, 503…), pasa al siguiente y, al
final, informa en `error.fallos` qué probó y con qué error.

La respuesta es la de OpenAI tal cual, con un campo extra `lumiweg_proveedor`
que dice quién respondió de verdad.

## Variables de entorno

Basta con **una** para que funcione. Cuantas más, más resistente.

| Variable | Proveedor | Dónde se obtiene |
|---|---|---|
| `GROQ_API_KEY` | Groq | https://console.groq.com/keys |
| `GEMINI_API_KEY` | Google Gemini | https://aistudio.google.com/apikey |
| `OPENROUTER_API_KEY` | OpenRouter | https://openrouter.ai/keys |
| `CEREBRAS_API_KEY` | Cerebras | https://cloud.cerebras.ai |
| `MISTRAL_API_KEY` | Mistral | https://console.mistral.ai/api-keys |
| `TOGETHER_API_KEY` | Together AI | https://api.together.ai/settings/api-keys |
| `HF_TOKEN` | Hugging Face | https://huggingface.co/settings/tokens |
| `PORT` | — | Puerto, por defecto 3000 |

## Ejecutar

```bash
cd backend
bun run index.ts
# o
docker build -t lumiweg-ai . && docker run -p 3000:3000 -e GROQ_API_KEY=xxx lumiweg-ai
```

En Railway, Render o Fly.io: despliega la carpeta `backend/` y pega las
variables. La URL pública (`https://…`) se pega en la app, en
Ajustes → Motores de IA → Backend propio.
