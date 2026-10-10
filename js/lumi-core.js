/* ============================================================================
   Lumi Core — Cerebro de Lumiweg
   ----------------------------------------------------------------------------
   Trasplante del núcleo Lumi desde Education/backend/server.js
   (repo privado del usuario, NO modificado). Origen de cada pieza:

     · Persona LUMI (bienestar) ...... server.js:502  modeInstructions.bienestar
     · Persona TUTOR ................. server.js:476-489
     · Persona ORÁCULO ............... server.js:434  (system[] de /ai/oraculo)
     · Persona ORÁCULO MAX ........... server.js:581-598
     · Fallback local de bienestar ... server.js:543-552
     · Cadena de fallback de modelos . server.js:437, 528, 606

   Sobre eso se añade lo que Education no tenía:
     · Router MULTI-PROVEEDOR con descubrimiento de modelos en runtime
     · Agent loop con tool calling (control real del teléfono)
     · Transporte nativo (evita CORS dentro del WebView de Android)
   ========================================================================== */

const LumiCore = (() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. PERSONAS — trasplantadas de Education
   * ------------------------------------------------------------------ */

  // server.js:502 — el corazón de Lumi. Cuidado: está afinada, no reescribir a la ligera.
  const PERSONA_BIENESTAR =
    'Eres Lumi, una acompañante cálida, humana y conversacional. Tu primera tarea es conversar y acompañar, ' +
    'no cerrar la conversación. Escucha con empatía, valida sin juzgar, responde directamente a lo último que ' +
    'dice la persona y ofrece pasos concretos y suaves. Puedes hablar de estrés, tristeza, ansiedad, soledad, ' +
    'hábitos, consumo problemático o adicciones sin diagnosticar ni moralizar. La sola mención de una dificultad ' +
    'NO significa una emergencia y no debes responder automáticamente que no puedes ayudar ni derivar a apoyo ' +
    'humano. Usa, cuando sea relevante, el horario, tareas y contexto de bienestar de la persona para dar apoyo ' +
    'práctico. Mantén el diálogo abierto con una pregunta natural cuando ayude. No te presentes como psicólogo ' +
    'ni hagas diagnósticos. Solo ante señales claras de peligro inmediato, autolesión, violencia o incapacidad ' +
    'para mantenerse a salvo, recomienda con claridad ayuda humana/profesional o emergencias locales.';

  // server.js:476-489
  const PERSONA_TUTOR =
    'Eres el Tutor IA de Lumiweg, un tutor académico personalizado, no un chatbot genérico. ' +
    'Tu objetivo es ayudar a la persona a aprender, progresar, cumplir metas y permanecer en sus estudios. ' +
    'Usa el contexto académico proporcionado para adaptar nivel, ejemplos, práctica y recomendaciones. ' +
    'Usa el diagnóstico para ajustar la dificultad: si necesita apoyo, explica desde lo básico; si domina el ' +
    'tema, aumenta progresivamente el reto. Relaciona las habilidades y el progreso con la forma de practicar, ' +
    'pero nunca inventes progreso que no aparezca en el contexto. Si no hay suficiente contexto, responde ' +
    'normalmente y pide solo el dato mínimo que falte. No hagas tareas o evaluaciones por la persona ni ' +
    'facilites fraude académico. Puedes resolver ejemplos de práctica y guiar ejercicios paso a paso. ' +
    'Escribe en español claro y natural. ' +
    'FORMATO LIMPIO: evita introducciones largas, separadores, bloques enormes y exceso de emojis. Usa párrafos ' +
    'cortos y listas solo cuando ayuden. Para una explicación normal usa esta secuencia: idea principal → ' +
    'ejemplo breve → comprobación o siguiente paso. No repitas la pregunta salvo que sea necesario. Si la ' +
    'pregunta es muy simple, responde de forma muy simple. Usa Markdown sencillo: títulos cortos, negritas ' +
    'puntuales y fórmulas legibles. No uses HTML. No inventes fuentes, datos ni resultados. Si no estás seguro ' +
    'de un dato actual, dilo y recomienda verificarlo.';

  // server.js:434 — ORÁCULO (system[] de /api/v1/ai/oraculo), compactado sin perder reglas.
  const PERSONA_ORACULO =
    'Eres ORÁCULO, la inteligencia académica especializada de Lumiweg. Tu trabajo es actuar como copiloto ' +
    'académico: entender la situación concreta de la persona, detectar riesgos, explicar cálculos y convertir ' +
    'datos en decisiones y próximos pasos útiles. ' +
    'Antes de responder, cruza mentalmente los datos relevantes: historial/notas, materias, pensum, ' +
    'prerrequisitos, créditos, horario, evaluaciones, tareas, asistencia y calendario. No menciones que hiciste ' +
    'este cruce; úsalo para responder con precisión. ' +
    'Nunca inventes materias ofertadas, cupos, horarios, reglas, prerrequisitos, fechas, pesos de evaluación ni ' +
    'requisitos de graduación. Si un dato no existe, dilo claramente y ofrece la mejor respuesta posible con lo ' +
    'que sí existe. Cuando analices una carga académica, separa: materias aprobadas, materias actualmente ' +
    'cursadas y materias candidatas. Comprueba prerrequisitos y créditos. Cuando analices rendimiento, ' +
    'identifica fortalezas y cuellos de botella. No llames "mala" a una materia: explica el dato y la acción ' +
    'posible. Cuando calcules promedios o notas necesarias, muestra la fórmula y las variables. Si faltan ' +
    'ponderaciones, no inventes un promedio ponderado. Cuando la persona pregunte "¿qué hago?", termina con un ' +
    'plan priorizado de 2–5 pasos. Si la pregunta es ambigua, haz como máximo una pregunta de aclaración solo ' +
    'si es imprescindible; de lo contrario, responde con supuestos explícitos. Responde en español natural, ' +
    'cercano y preciso. Evita respuestas genéricas. Usa títulos cortos, listas y tablas pequeñas cuando aporten ' +
    'claridad. No repitas toda la información del contexto.';

  // server.js:581-598 — ORÁCULO MAX, con DETECCIÓN PROACTIVA y CÁLCULOS.
  const PERSONA_ORACULO_MAX = PERSONA_ORACULO + ' ' +
    'DETECCIÓN PROACTIVA: si encuentras un problema relevante aunque no te lo hayan preguntado, señálalo ' +
    'claramente. Prioriza por impacto y proximidad temporal. No alarmes si la evidencia es débil. ' +
    'NO INVENTES: jamás inventes materias, prerrequisitos, cupos, horarios, fechas, ponderaciones, reglamentos ' +
    'ni políticas universitarias. Distingue dato registrado, cálculo, inferencia y recomendación. ' +
    'CÁLCULOS: explica cómo obtuviste promedios, créditos, riesgo o escenarios. Si el total de créditos del ' +
    'perfil contradice la suma del pensum, NO uses el dato contradictorio como verdad: señala la inconsistencia. ' +
    'ESTILO: español natural, directo, cómodo para móvil. Si la pregunta es simple, responde simple; si ' +
    'requiere análisis, hazlo profundo. Cuando pregunten "¿cómo voy?", responde con una lectura ejecutiva: ' +
    'situación, fortalezas, riesgos, prioridades y siguiente paso.';

  // server.js:543-552 — fallback local de bienestar, cuando TODOS los proveedores fallan.
  const FALLBACK_BIENESTAR = [
    [/pánico|panico|ansiedad|ansioso|ansiosa/, 'Estoy contigo. Si estás sintiendo mucha ansiedad o pánico, vamos paso a paso: intenta hacer una respiración lenta y dime qué estás sintiendo ahora mismo. ¿Qué fue lo que desencadenó este momento?'],
    [/triste|llorar|solo|sola|soledad|depre/, 'Siento que estés pasando por un momento así. No tienes que ordenar todo de golpe. Estoy aquí para escucharte. ¿Quieres contarme qué ocurrió hoy?'],
    [/estrés|estres|agotad|cansad|universidad|estudi/, 'Te entiendo; cuando se acumulan las cosas es fácil sentirse sobrepasado. Podemos ordenar una cosa a la vez. ¿Qué es lo que más te preocupa ahora mismo?']
  ];
  const FALLBACK_GENERAL =
    'Estoy aquí contigo. Aunque ahora mismo no tengo conexión con ninguno de mis motores de IA, podemos ' +
    'seguir hablando. ¿Qué es lo que más te está pesando en este momento?';

  /* ------------------------------------------------------------------ *
   * 2. IDENTIDAD DEL ASISTENTE TOTAL
   *    Education separaba Lumi / Tutor / Oráculo en tres endpoints.
   *    Aquí es UN asistente con modos, y además puede actuar sobre el
   *    teléfono. Esta capa es nueva y envuelve a las personas originales.
   * ------------------------------------------------------------------ */
  const IDENTIDAD =
    'Te llamas Lumi. Eres el asistente personal total de esta persona, vive en su teléfono Android y lo ' +
    'acompaña 24/7. No eres un chatbot genérico: piensas, decides y ACTÚAS. ' +
    'Puedes controlar el teléfono con herramientas reales (mensajes, llamadas, contactos, apps, alarmas, ' +
    'calendario, notificaciones, multimedia, volumen, linterna, portapapeles). ' +
    'REGLA DE ORO SOBRE ACCIONES: solo afirmas que hiciste algo si una herramienta te devolvió éxito. Si una ' +
    'herramienta falló o falta un permiso, dilo con claridad y explica qué falta. Nunca inventes que enviaste ' +
    'un mensaje, hiciste una llamada o pusiste una alarma si no ocurrió de verdad. ' +
    'Antes de una acción irreversible o sensible (enviar un mensaje, llamar, borrar algo), confirma en una ' +
    'frase corta si el pedido no fue explícito. Si fue explícito, actúa directamente sin preguntar de nuevo. ' +
    'CONTEXTO DEL DISPOSITIVO: ';

  const MODOS = {
    total: {
      etiqueta: 'Asistente total',
      prompt: 'Atiendes de todo: vida diaria, organización, bienestar, estudio, decisiones y control del teléfono. ' +
              'Adapta el tono a lo que la persona necesita en cada momento. Sé cálida pero eficiente.'
    },
    bienestar: { etiqueta: 'Bienestar', prompt: 'MODO ACTIVO — BIENESTAR: ' + PERSONA_BIENESTAR },
    tutor: { etiqueta: 'Tutor', prompt: 'MODO ACTIVO — TUTOR ACADÉMICO: ' + PERSONA_TUTOR },
    oraculo: { etiqueta: 'Oráculo', prompt: 'MODO ACTIVO — ORÁCULO: ' + PERSONA_ORACULO_MAX }
  };

  /* ------------------------------------------------------------------ *
   * 3. PROVEEDORES — todos con capa gratuita
   *    kind:'openai'  → /chat/completions compatible OpenAI
   *    kind:'gemini'  → generateContent de Google
   * ------------------------------------------------------------------ */
  const PROVIDERS = [
    {
      id: 'groq', nombre: 'Groq', kind: 'openai', gratis: true,
      base: 'https://api.groq.com/openai/v1',
      modelos: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b'],
      preferir: /llama-3\.3-70b|gpt-oss-120b|qwen/i,
      keys: 'https://console.groq.com/keys',
      nota: 'El más rápido. Capa gratuita generosa.'
    },
    {
      id: 'gemini', nombre: 'Google Gemini', kind: 'gemini', gratis: true,
      base: 'https://generativelanguage.googleapis.com/v1beta',
      modelos: ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
      preferir: /gemini-3\.8-flash$|gemini-3\.5-flash-lite/,
      keys: 'https://aistudio.google.com/apikey',
      nota: 'Mejor razonamiento gratuito. Es el motor del Education original.'
    },
    {
      id: 'openrouter', nombre: 'OpenRouter', kind: 'openai', gratis: true,
      base: 'https://openrouter.ai/api/v1',
      modelos: [
        'nvidia/nemotron-3.5-lightning:free',
        'google/gemma-4-31b-it:free',
        'poolside/laguna-s-2.1:free',
        'thinkingmachines/inkling:free'
      ],
      preferir: /nemotron-3\.5-lightning|gemma-4-31b|laguna-s-2\.1/,
      keys: 'https://openrouter.ai/keys',
      nota: 'Un solo key da acceso a muchos modelos :free.'
    },
    {
      id: 'cerebras', nombre: 'Cerebras', kind: 'openai', gratis: true,
      base: 'https://api.cerebras.ai/v1',
      modelos: ['gpt-oss-120b', 'zai-glm-4.7', 'gemma-4-31b'],
      preferir: /gpt-oss-120b|glm-4\.7/,
      keys: 'https://cloud.cerebras.ai',
      nota: 'Muy rápido, 1M tokens/día gratis.'
    },
    {
      id: 'mistral', nombre: 'Mistral', kind: 'openai', gratis: true,
      base: 'https://api.mistral.ai/v1',
      modelos: ['mistral-small-latest', 'open-mistral-nemo'],
      preferir: /mistral-small-latest/,
      keys: 'https://console.mistral.ai/api-keys',
      nota: 'Capa gratuita para experimentación.'
    },
    {
      id: 'together', nombre: 'Together AI', kind: 'openai', gratis: true,
      base: 'https://api.together.xyz/v1',
      modelos: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
      preferir: /Llama-3\.3-70B|Qwen2\.5-72B/,
      keys: 'https://api.together.ai/settings/api-keys',
      nota: 'Crédito inicial gratuito.'
    },
    {
      id: 'huggingface', nombre: 'Hugging Face', kind: 'openai', gratis: true,
      base: 'https://router.huggingface.co/v1',
      modelos: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'],
      preferir: /Llama-3\.3-70B/,
      keys: 'https://huggingface.co/settings/tokens',
      nota: 'Router gratuito con cupo mensual.'
    },
    {
      id: 'cloudflare', nombre: 'Cloudflare Workers AI', kind: 'openai', gratis: true,
      base: '', // se construye con el account id: https://api.cloudflare.com/client/v4/accounts/<id>/ai/v1
      modelos: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
      preferir: /llama-3\.3-70b/,
      keys: 'https://dash.cloudflare.com/profile/api-tokens',
      nota: 'Requiere el Account ID. 10k neuronas/día gratis.',
      requiereCuenta: true
    },
    {
      id: 'proxy', nombre: 'Backend propio (Lumiweg)', kind: 'openai', gratis: true,
      base: '', // el usuario pega la URL de su backend
      modelos: ['auto'],
      preferir: /.*/,
      keys: 'backend/README.md',
      nota: 'Opcional. Si despliegas el backend incluido, el key vive en el servidor y no en el teléfono.',
      requiereUrl: true
    }
  ];

  /* ------------------------------------------------------------------ *
   * 4. TRANSPORTE — usa el puente nativo si existe (evita CORS en Android)
   * ------------------------------------------------------------------ */
  async function httpJson(url, opts = {}) {
    const method = opts.method || 'POST';
    const headers = opts.headers || {};
    const body = opts.body != null ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : null;
    const timeout = opts.timeout || 45000;

    // Dentro del APK: el bridge nativo hace la petición, así no hay CORS.
    if (window.LumiNative && typeof window.LumiNative.httpRequest === 'function') {
      const raw = window.LumiNative.httpRequest(url, method, JSON.stringify(headers), body || '', timeout);
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && parsed.networkError) throw new Error('network: ' + parsed.networkError);
      return { ok: !!parsed.ok, status: Number(parsed.status) || 0, data: safeParse(parsed.body) };
    }

    // PWA / navegador
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
      const text = await res.text();
      return { ok: res.ok, status: res.status, data: safeParse(text) };
    } finally { clearTimeout(t); }
  }

  function safeParse(t) {
    if (t == null) return null;
    if (typeof t === 'object') return t;
    try { return JSON.parse(t); } catch { return { _raw: String(t).slice(0, 2000) }; }
  }

  /* ------------------------------------------------------------------ *
   * 5. CONFIGURACIÓN persistida
   * ------------------------------------------------------------------ */
  const CFG_KEY = 'lumi_ai_cfg';
  const DEFAULT_PROVIDER_ORDER = ['kimi', 'claude', 'openai', 'xai', 'gemini', 'groq', 'deepseek', 'openrouter', 'cerebras', 'mistral', 'together', 'huggingface'];
  const BACKEND_PUBLIC_URL = 'https://lumiweg-backend-ia-production.up.railway.app';
  const DEFAULTS = { keys: {}, enabled: { proxy: true }, order: ['proxy'], models: {}, accountId: '', proxyUrl: BACKEND_PUBLIC_URL, mode: 'total', descubierto: {}, providerOrder: DEFAULT_PROVIDER_ORDER.slice(), selectedProvider: 'auto' };

  function cfg() {
    try {
      const raw = JSON.parse(localStorage.getItem(CFG_KEY));
      if (raw && typeof raw === 'object') {
        return {
          keys: {},

          enabled: raw.enabled && typeof raw.enabled === 'object' ? raw.enabled : {},
          order: Array.isArray(raw.order) ? raw.order : null,
          models: raw.models && typeof raw.models === 'object' ? raw.models : {},
          accountId: typeof raw.accountId === 'string' ? raw.accountId : '',
          proxyUrl: typeof raw.proxyUrl === 'string' && raw.proxyUrl.trim() ? raw.proxyUrl.trim() : BACKEND_PUBLIC_URL,
          mode: MODOS[raw.mode] ? raw.mode : 'total',
          descubierto: raw.descubierto && typeof raw.descubierto === 'object' ? raw.descubierto : {},
          providerOrder: Array.isArray(raw.providerOrder) ? raw.providerOrder.filter(x => DEFAULT_PROVIDER_ORDER.includes(x)) : DEFAULT_PROVIDER_ORDER.slice(),
          selectedProvider: typeof raw.selectedProvider === 'string' ? raw.selectedProvider : 'auto'
        };
        // Seguridad: eliminar del almacenamiento local las claves que versiones anteriores guardaban en el teléfono.
        try {
          if (raw.keys && Object.keys(raw.keys).length) {
            localStorage.setItem(CFG_KEY, JSON.stringify({
              keys: {}, enabled: { proxy: true }, order: ['proxy'],
              models: {}, accountId: '', proxyUrl: typeof raw.proxyUrl === 'string' ? raw.proxyUrl : '',
              mode: MODOS[raw.mode] ? raw.mode : 'total', descubierto: {}
            }));
          }
        } catch {}
      }
    } catch {}
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  function guardarCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch {} return c; }

  function baseDe(p, c) {
    if (p.id === 'cloudflare') {
      const acct = (c.accountId || '').trim();
      return acct ? 'https://api.cloudflare.com/client/v4/accounts/' + acct + '/ai/v1' : '';
    }
    if (p.id === 'proxy') return (c.proxyUrl || '').trim().replace(/\/+$/, '');
    return p.base;
  }

  function tieneKey(p, c) {
    if (p.id === 'cloudflare') return !!(c.keys[p.id] && (c.accountId || '').trim());
    if (p.id === 'proxy') return !!(c.proxyUrl || '').trim();
    return !!(c.keys[p.id] && String(c.keys[p.id]).trim());
  }

  // Orden efectivo: los que el usuario ordenó primero, luego el resto.
  function cadena() {
    const c = cfg();
    // Las credenciales se gestionan exclusivamente en el backend; nunca llamar a proveedores directos desde el APK.
    let lista = PROVIDERS.filter(p => p.id === 'proxy' && tieneKey(p, c) && c.enabled[p.id] !== false);
    if (c.order && c.order.length) {
      lista.sort((a, b) => {
        const ia = c.order.indexOf(a.id), ib = c.order.indexOf(b.id);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
    }
    return { lista, c };
  }

  /* ------------------------------------------------------------------ *
   * 6. DESCUBRIMIENTO DE MODELOS EN RUNTIME
   *    Esto es lo que evita el fallo del intento anterior: si el proveedor
   *    renombra o retira un modelo, la app se readapta sola en vez de morir.
   * ------------------------------------------------------------------ */
  async function descubrirModelos(p, c) {
    const cache = c.descubierto[p.id];
    if (cache && Array.isArray(cache.modelos) && cache.modelos.length && (Date.now() - (cache.t || 0)) < 24 * 3600 * 1000) {
      return cache.modelos;
    }
    const base = baseDe(p, c);
    if (!base) return p.modelos;
    let encontrados = [];
    try {
      if (p.kind === 'gemini') {
        const r = await httpJson(base + '/models?key=' + encodeURIComponent(c.keys[p.id]), { method: 'GET', timeout: 15000 });
        const arr = r.data && r.data.models;
        if (Array.isArray(arr)) {
          encontrados = arr
            .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
            .map(m => String(m.name || '').replace(/^models\//, ''))
            .filter(Boolean);
        }
      } else {
        const headers = { Authorization: 'Bearer ' + c.keys[p.id] };
        if (p.id === 'openrouter') { headers['HTTP-Referer'] = 'https://lumiweg.app'; headers['X-Title'] = 'Lumiweg'; }
        const r = await httpJson(base + '/models', { method: 'GET', headers, timeout: 15000 });
        const arr = (r.data && (r.data.data || r.data.models)) || [];
        if (Array.isArray(arr)) encontrados = arr.map(m => String(m.id || m.name || '')).filter(Boolean);
      }
    } catch { /* silencio: usamos los defaults */ }

    if (encontrados.length) {
      // Ordena: primero los que encajan con la preferencia, luego el resto.
      const pref = encontrados.filter(m => p.preferir && p.preferir.test(m));
      const resto = encontrados.filter(m => !pref.includes(m));
      const lista = [...new Set([...pref, ...resto])].slice(0, 12);
      c.descubierto[p.id] = { modelos: lista, t: Date.now() };
      guardarCfg(c);
      return lista;
    }
    return p.modelos;
  }

  async function modelosDe(p, c) {
    const manual = (c.models[p.id] || '').trim();
    if (manual) return [manual];
    // Con backend propio se pide auto para que Railway aplique el orden de proveedores elegido.
    if (p.id === 'proxy') return ['auto'];
    return await descubrirModelos(p, c);
  }

  /* ------------------------------------------------------------------ *
   * 7. ADAPTADORES de proveedor
   *    Se normaliza a: { texto, toolCalls:[{id,nombre,args}] }
   * ------------------------------------------------------------------ */
  async function llamarOpenAICompatible(p, c, model, req) {
    const base = baseDe(p, c);
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.keys[p.id] };
    if (p.id === 'openrouter') { headers['HTTP-Referer'] = 'https://lumiweg.app'; headers['X-Title'] = 'Lumiweg'; }
    if (p.id === 'proxy') {
      headers['X-Lumi-Provider-Order'] = (c.providerOrder || DEFAULT_PROVIDER_ORDER).join(',');
      if (c.selectedProvider && c.selectedProvider !== 'auto') headers['X-Lumi-Provider-Only'] = c.selectedProvider;
    }

    const body = {
      model,
      messages: [{ role: 'system', content: req.system }, ...req.mensajes],
      temperature: req.temperature,
      max_tokens: req.maxTokens
    };
    if (req.tools && req.tools.length) {
      body.tools = req.tools;
      body.tool_choice = 'auto';
    }

    const r = await httpJson(base + '/chat/completions', { method: 'POST', headers, body });
    if (!r.ok) return { error: 'HTTP ' + r.status + ' ' + resumenError(r.data), status: r.status };

    const msg = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message;
    if (!msg) return { error: 'respuesta vacía' };

    const toolCalls = [];
    if (Array.isArray(msg.tool_calls)) {
      msg.tool_calls.forEach((tc, i) => {
        let args = {};
        try { args = JSON.parse(tc.function && tc.function.arguments || '{}'); } catch {}
        toolCalls.push({ id: tc.id || ('call_' + i), nombre: tc.function && tc.function.name, args, crudo: msg });
      });
    }
    return { texto: String(msg.content || '').trim(), toolCalls, crudo: msg };
  }

  async function llamarGemini(p, c, model, req) {
    const base = baseDe(p, c);
    const contents = req.mensajes.map(m => {
      if (m.role === 'tool') {
        return { role: 'user', parts: [{ functionResponse: { name: m.name, response: { result: m.content } } }] };
      }
      if (m.role === 'assistant' && m.tool_calls) {
        return { role: 'model', parts: m.tool_calls.map(tc => ({ functionCall: { name: tc.nombre, args: tc.args } })) };
      }
      return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] };
    });

    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents,
      generationConfig: { temperature: req.temperature, maxOutputTokens: req.maxTokens }
    };
    if (req.tools && req.tools.length) {
      body.tools = [{ functionDeclarations: req.tools.map(t => t.function) }];
    }

    const url = base + '/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(c.keys[p.id]);
    const r = await httpJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!r.ok) return { error: 'HTTP ' + r.status + ' ' + resumenError(r.data), status: r.status };

    const cand = r.data && r.data.candidates && r.data.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const texto = parts.map(x => x.text || '').join('').trim();
    const toolCalls = parts.filter(x => x.functionCall).map((x, i) => ({
      id: 'gem_' + Date.now() + '_' + i, nombre: x.functionCall.name, args: x.functionCall.args || {}
    }));
    return { texto, toolCalls, crudo: cand };
  }

  function resumenError(data) {
    if (!data) return '';
    const e = data.error || data;
    return String(e.message || e.msg || e._raw || JSON.stringify(e)).slice(0, 180);
  }

  async function llamarProveedor(p, c, model, req) {
    const fn = p.kind === 'gemini' ? llamarGemini : llamarOpenAICompatible;
    return await fn(p, c, model, req);
  }

  /* ------------------------------------------------------------------ *
   * 8. ROUTER — recorre la cadena hasta que uno responda
   *    Códigos que provocan salto al siguiente: 429, 401, 403, 402, 5xx
   * ------------------------------------------------------------------ */
  const SALTABLE = [400, 401, 402, 403, 404, 408, 429, 500, 502, 503, 504, 529];

  async function conFallback(req, onIntento) {
    const { lista, c } = cadena();
    if (!lista.length) return { error: 'sin_proveedores' };

    const fallos = [];
    for (const p of lista) {
      const modelos = await modelosDe(p, c);
      for (const model of modelos.slice(0, 3)) {
        if (onIntento) onIntento(p.nombre, model);
        let res;
        try { res = await llamarProveedor(p, c, model, req); }
        catch (e) { res = { error: String(e && e.message || e), status: 0 }; }

        if (res && !res.error) return { ...res, proveedor: p, modelo: model };
        const st = (res && res.status) || 0;
        fallos.push(p.id + '/' + model + ': ' + (res && res.error));
        if (st && !SALTABLE.includes(st)) break; // error de contenido: no insistir con otro modelo
      }
    }
    return { error: 'todos_fallaron', fallos };
  }

  /* ------------------------------------------------------------------ *
   * 9. AGENT LOOP con herramientas — aquí ocurre el control del teléfono
   * ------------------------------------------------------------------ */
  const MAX_PASOS = 4;

  async function ejecutar(mensajes, opts = {}) {
    const c = cfg();
    const herramientas = (opts.herramientas || []).map(t => ({ type: 'function', function: t }));
    const req = {
      system: opts.system || construirSystem(c, opts),
      mensajes,
      temperature: opts.temperature != null ? opts.temperature : 0.35,
      maxTokens: opts.maxTokens || 1200,
      tools: herramientas.length ? herramientas : null
    };

    const rastro = [];
    let res = await conFallback(req, opts.onIntento);
    if (res.error) return { error: res.error, fallos: res.fallos, rastro };

    for (let paso = 0; paso < MAX_PASOS; paso++) {
      if (!res.toolCalls || !res.toolCalls.length) {
        return { texto: res.texto, proveedor: res.proveedor, modelo: res.modelo, rastro };
      }
      if (!opts.ejecutarHerramienta) {
        return { texto: res.texto || 'Necesito permiso para ejecutar acciones.', proveedor: res.proveedor, modelo: res.modelo, rastro };
      }

      // El modelo pidió herramientas: se ejecutan y se le devuelve el resultado.
      mensajes.push({ role: 'assistant', content: res.texto || '', tool_calls: res.toolCalls });
      for (const tc of res.toolCalls) {
        let salida;
        try { salida = await opts.ejecutarHerramienta(tc.nombre, tc.args || {}); }
        catch (e) { salida = { ok: false, error: String(e && e.message || e) }; }
        const txt = JSON.stringify(salida == null ? { ok: false } : salida).slice(0, 4000);
        rastro.push({ herramienta: tc.nombre, args: tc.args, resultado: salida });
        mensajes.push({ role: 'tool', name: tc.nombre, tool_call_id: tc.id, content: txt });
      }
      res = await conFallback(req, opts.onIntento);
      if (res.error) return { error: res.error, fallos: res.fallos, rastro };
    }
    return { texto: res.texto || 'Hecho.', proveedor: res.proveedor, modelo: res.modelo, rastro };
  }

  function construirSystem(c, opts) {
    const modo = MODOS[c.mode] || MODOS.total;
    const partes = [IDENTIDAD + (opts.contexto || 'no disponible'), modo.prompt];
    if (opts.contextoUsuario) partes.push('CONTEXTO PERSONAL: ' + opts.contextoUsuario);
    partes.push('Responde SIEMPRE en español. Sé breve y directo: esto se lee en un teléfono.');
    return partes.join('\n\n');
  }

  /* ------------------------------------------------------------------ *
   * 10. FALLBACK LOCAL — sin red, Lumi sigue siendo Lumi
   * ------------------------------------------------------------------ */
  function respuestaLocal(texto, modo) {
    const t = String(texto || '').toLowerCase();
    if (modo === 'bienestar' || modo === 'total') {
      for (const [re, msg] of FALLBACK_BIENESTAR) if (re.test(t)) return msg;
    }
    const hora = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    return FALLBACK_GENERAL + ' (Son las ' + hora + '.)';
  }

  /* ------------------------------------------------------------------ *
   * 11. API PÚBLICA
   * ------------------------------------------------------------------ */
  function estado() {
    const c = cfg();
    return PROVIDERS.map(p => ({
      id: p.id, nombre: p.nombre, nota: p.nota, keys: p.keys, gratis: p.gratis,
      configurado: tieneKey(p, c),
      activo: tieneKey(p, c) && c.enabled[p.id] !== false,
      modelos: (c.models[p.id] || '') || (c.descubierto[p.id] && c.descubierto[p.id].modelos || p.modelos).slice(0, 3).join(', '),
      requiereCuenta: !!p.requiereCuenta, requiereUrl: !!p.requiereUrl
    }));
  }

  async function preguntar(texto, historial, opts = {}) {
    const mensajes = (historial || []).map(m => ({
      role: m.who === 'user' ? 'user' : 'assistant',
      content: String(m.text || '')
    })).slice(-12);
    mensajes.push({ role: 'user', content: texto });

    const r = await ejecutar(mensajes, opts);
    if (r.error) {
      const c = cfg();
      return {
        texto: respuestaLocal(texto, c.mode),
        local: true, modoLocal: c.mode,
        motivo: r.error === 'sin_proveedores' ? 'sin_proveedores' : 'proveedores_fallaron',
        detalle: r.fallos || null
      };
    }
    return { texto: r.texto, proveedor: r.proveedor && r.proveedor.nombre, modelo: r.modelo, rastro: r.rastro || [] };
  }

  async function obtenerEstadoBackend() {
    const c = cfg();
    const base = (c.proxyUrl || BACKEND_PUBLIC_URL).trim().replace(/\/+$/, '');
    if (!base) throw new Error('Falta la URL pública del backend.');
    const r = await httpJson(base + '/providers', { method: 'GET', timeout: 15000 });
    if (!r.ok || !r.data || !Array.isArray(r.data.proveedores)) {
      throw new Error('No se pudo leer el estado de proveedores (HTTP ' + r.status + ').');
    }
    return r.data;
  }

  async function probarProveedorBackend(id) {
    const c = cfg();
    const base = (c.proxyUrl || BACKEND_PUBLIC_URL).trim().replace(/\/+$/, '');
    if (!base) return { ok: false, error: 'Falta la URL pública del backend.' };
    const t0 = Date.now();
    try {
      const r = await httpJson(base + '/providers/' + encodeURIComponent(id) + '/test', {
        method: 'POST', timeout: 55000,
        headers: { 'Content-Type': 'application/json' },
        body: {}
      });
      const d = r.data || {};
      return {
        ok: r.ok && d.estado === 'conectado',
        id, estado: d.estado || (r.ok ? 'desconocido' : 'error'),
        ms: d.latenciaMs != null ? d.latenciaMs : Date.now() - t0,
        modelo: d.modelo || '',
        error: d.explicacion || d.error || ('HTTP ' + r.status),
        accion: d.accion || '',
        categoria: d.categoria || '',
        codigoHttp: d.codigoHttp || r.status
      };
    } catch (e) {
      return { ok: false, id, estado: 'error', ms: Date.now() - t0, error: String(e && e.message || e).slice(0, 180) };
    }
  }

  async function probarBackendTodos() {
    const c = cfg();
    const base = (c.proxyUrl || BACKEND_PUBLIC_URL).trim().replace(/\\/+$/, '');
    if (!base) return { ok: false, error: 'falta la URL del backend', resultados: [] };
    let h;
    try {
      h = await httpJson(base + '/health', { method: 'GET', timeout: 12000 });
    } catch (e) {
      return { ok: false, error: 'No se pudo conectar con Railway: ' + String(e && e.message || e).slice(0, 120), resultados: [] };
    }
    if (!h.ok || !h.data || h.data.ok !== true) return { ok: false, error: 'El backend no pasó /health (HTTP ' + h.status + ')', resultados: [] };
    const disponibles = Array.isArray(h.data.proveedores) ? h.data.proveedores : [];
    const resultados = [];
    for (const id of disponibles) {
      const inicio = Date.now();
      try {
        const r = await httpJson(base + '/chat/completions', {
          method: 'POST', timeout: 45000,
          headers: { 'Content-Type': 'application/json', 'X-Lumi-Provider-Only': id },
          body: { model: 'auto', messages: [{ role: 'user', content: 'Responde únicamente: OK' }], temperature: 0, max_tokens: 16 }
        });
        const texto = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
        resultados.push({ id, ok: r.ok && !!texto, ms: Date.now() - inicio, error: r.ok && texto ? '' : ('HTTP ' + r.status + ': ' + resumenError(r.data)) });
      } catch (e) {
        resultados.push({ id, ok: false, ms: Date.now() - inicio, error: String(e && e.message || e).slice(0, 140) });
      }
    }
    return { ok: resultados.some(x => x.ok), backend: true, proveedoresConfigurados: disponibles, resultados };
  }

  async function probar(id) {
    const c = cfg();
    const p = PROVIDERS.find(x => x.id === id);
    if (!p) return { ok: false, error: 'proveedor desconocido' };
    const t0 = Date.now();

    // El panel prueba el backend real: health + catálogo + una generación de texto.
    // Nunca solicita ni muestra claves del servidor.
    if (id === 'proxy') {
      const base = baseDe(p, c);
      if (!base) return { ok: false, error: 'falta la URL pública del backend' };
      try {
        const h = await httpJson(base + '/health', { method: 'GET', timeout: 12000 });
        if (!h.ok || !h.data || h.data.ok !== true) {
          return { ok: false, error: 'Health no respondió correctamente (HTTP ' + h.status + ')' };
        }
        const m = await httpJson(base + '/models', { method: 'GET', timeout: 20000 });
        if (!m.ok || !m.data || !Array.isArray(m.data.data)) {
          return { ok: false, error: 'No se pudo leer el catálogo de modelos (HTTP ' + m.status + ')' };
        }
        const r = await httpJson(base + '/chat/completions', {
          method: 'POST', timeout: 45000,
          headers: { 'Content-Type': 'application/json', 'X-Lumi-Provider-Order': (c.providerOrder || DEFAULT_PROVIDER_ORDER).join(',') },
          body: { model: 'auto', messages: [{ role: 'user', content: 'Responde únicamente: OK' }], temperature: 0, max_tokens: 16 }
        });
        if (!r.ok) return { ok: false, error: 'La API está arriba, pero la prueba de IA falló (HTTP ' + r.status + '): ' + resumenError(r.data) };
        const respuesta = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
        if (!respuesta) return { ok: false, error: 'El backend respondió sin texto generado' };
        const proveedores = Array.isArray(h.data.proveedores) ? h.data.proveedores : [];
        return {
          ok: true,
          modelo: (r.data.lumiweg_proveedor || 'backend') + ' / ' + (r.data.model || 'auto'),
          ms: Date.now() - t0,
          modelos_disponibles: m.data.data.length,
          proveedores
        };
      } catch (e) {
        return { ok: false, error: 'No se pudo conectar: ' + String(e && e.message || e).slice(0, 160) };
      }
    }

    if (!tieneKey(p, c)) return { ok: false, error: 'falta la clave' };
    const modelos = await modelosDe(p, c);
    const r = await llamarProveedor(p, c, modelos[0], {
      system: 'Responde solo con: OK', mensajes: [{ role: 'user', content: 'ping' }],
      temperature: 0, maxTokens: 16, tools: null
    });
    if (r.error) return { ok: false, error: r.error, modelo: modelos[0] };
    return { ok: true, modelo: modelos[0], ms: Date.now() - t0, modelos_disponibles: modelos.length };
  }

  return {
    PROVIDERS, MODOS, DEFAULT_PROVIDER_ORDER, PERSONAS: {
      bienestar: PERSONA_BIENESTAR, tutor: PERSONA_TUTOR,
      oraculo: PERSONA_ORACULO, oraculoMax: PERSONA_ORACULO_MAX
    },
    cfg, guardarCfg, estado, preguntar, probar, probarBackendTodos, obtenerEstadoBackend, probarProveedorBackend, ejecutar,
    modelosDe, descubrirModelos, httpJson, respuestaLocal, cadena, tieneKey
  };
})();

if (typeof window !== 'undefined') window.LumiCore = LumiCore;
