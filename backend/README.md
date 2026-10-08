# Lumiweg AI Backend

Backend seguro para el cerebro de Lumiweg.

## Runtime
Railway Function / Bun.

## Endpoint
- GET `/health`
- POST `/chat`

### POST /chat
```json
{
  "message": "Hola Lumi",
  "history": [
    {"role":"user","content":"Hola"}
  ],
  "user": {"name":"Mau","locale":"es-ES"}
}
```

Respuesta:
```json
{"reply":"¡Hola! ¿En qué te ayudo?"}
```

## Variables
- `OPENAI_API_KEY`: clave privada del proveedor. **Nunca se coloca en la APK.**
- `OPENAI_MODEL`: opcional; por defecto `gpt-6-luna`.

El cliente Android/web solo conoce la URL pública del backend. El backend conserva la clave en variables privadas de Railway.
