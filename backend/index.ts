/* ============================================================================
   Lumiweg — Backend opcional (Bun)
   ----------------------------------------------------------------------------
   ¿Para qué sirve si la app ya habla directo con los proveedores?
   Para no llevar NINGUNA clave dentro del teléfono. El backend guarda las
   claves en variables de entorno del servidor y expone una API compatible
   con OpenAI, que es justo lo que espera el proveedor «Backend propio» de
   la app (js/lumi-core.js → base + /chat/completions).

   Antes este archivo pedía el modelo «gpt-6-luna», que no existe: nunca
   conectó. Ahora enruta entre varios proveedores gratuitos y elige el modelo
   en runtime, igual que hace la app.
   ========================================================================== */

const PORT = Number(Bun.env.PORT || 3000);

type Proveedor = {
  id: string;
  base: string;
  kind: 'openai' | 'gemini' | 'anthropic';
  key: string;
  modelos: string[];
  preferir: RegExp;
};

const PROVEEDORES: Proveedor[] = [
  {
    id: 'groq', base: 'https://api.groq.com/openai/v1', kind: 'openai',
    key: Bun.env.GROQ_API_KEY || '',
    modelos: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b'],
    preferir: /llama-3\.3-70b|gpt-oss-120b/
  },
  {
    id: 'xai', base: 'https://api.x.ai/v1', kind: 'openai',
    key: Bun.env.XAI_API_KEY || '',
    modelos: ['grok-4.7', 'grok-4.6'],
    preferir: /^grok-/i
  },
  {
    id: 'openai', base: 'https://api.openai.com/v1', kind: 'openai',
    key: Bun.env.OPENAI_API_KEY || '',
    modelos: ['gpt-5.5', 'gpt-4.1-mini'],
    preferir: /^gpt-/i
  },
  {
    id: 'claude', base: 'https://api.anthropic.com/v1', kind: 'anthropic',
    key: Bun.env.ANTHROPIC_API_KEY || Bun.env.CLAUDE_API_KEY || '',
    modelos: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5-20251001'],
    preferir: /^claude-/i
  },
  {
    id: 'kimi', base: 'https://api.moonshot.ai/v1', kind: 'openai',
    key: Bun.env.MOONSHOT_API_KEY || Bun.env.KIMI_API_KEY || '',
    modelos: ['kimi-k2.5', 'kimi-k2-thinking', 'kimi-k2-turbo-preview'],
    preferir: /^kimi-/i
  },
  {
    id: 'deepseek', base: 'https://api.deepseek.com', kind: 'openai',
    key: Bun.env.DEEPSEEK_API_KEY || '',
    modelos: ['deepseek-chat', 'deepseek-reasoner'],
    preferir: /^deepseek-/i
  },
  {
    id: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta', kind: 'gemini',
    key: Bun.env.GEMINI_API_KEY || Bun.env.GOOGLE_API_KEY || '',
    modelos: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'],
    preferir: /gemini-3\.8-flash/
  },
  {
    id: 'openrouter', base: 'https://openrouter.ai/api/v1', kind: 'openai',
    key: Bun.env.OPENROUTER_API_KEY || '',
    modelos: ['nvidia/nemotron-3.5-lightning:free', 'google/gemma-4-31b-it:free'],
    preferir: /nemotron-3\.5-lightning|gemma-4-31b/
  },
  {
    id: 'cerebras', base: 'https://api.cerebras.ai/v1', kind: 'openai',
    key: Bun.env.CEREBRAS_API_KEY || '',
    modelos: ['gpt-oss-120b'],
    preferir: /gpt-oss-120b/
  },
  {
    id: 'mistral', base: 'https://api.mistral.ai/v1', kind: 'openai',
    key: Bun.env.MISTRAL_API_KEY || '',
    modelos: ['mistral-small-latest'],
    preferir: /mistral-small/
  },
  {
    id: 'together', base: 'https://api.together.xyz/v1', kind: 'openai',
    key: Bun.env.TOGETHER_API_KEY || '',
    modelos: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'],
    preferir: /Llama-3\.3-70B/
  },
  {
    id: 'huggingface', base: 'https://router.huggingface.co/v1', kind: 'openai',
    key: Bun.env.HF_TOKEN || Bun.env.HUGGINGFACE_API_KEY || '',
    modelos: ['meta-llama/Llama-3.3-70B-Instruct'],
    preferir: /Llama-3\.3-70B/
  }
];

const conClave = () => PROVEEDORES.filter(p => p.key);

/* --------------------------------------------------------------------------
   Caché de modelos descubiertos: evita morir si un proveedor renombra algo.
   -------------------------------------------------------------------------- */
const cacheModelos = new Map<string, { modelos: string[]; t: number }>();
const UNA_HORA = 3600 * 1000;

async function descubrir(p: Proveedor): Promise<string[]> {
  const c = cacheModelos.get(p.id);
  if (c && Date.now() - c.t < UNA_HORA) return c.modelos;
  try {
    let encontrados: string[] = [];
    if (p.kind === 'gemini') {
      const r = await fetch(p.base + '/models?key=' + encodeURIComponent(p.key));
      const d: any = await r.json();
      encontrados = (d?.models || [])
        .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m: any) => String(m.name || '').replace(/^models\//, ''))
        .filter(Boolean);
    } else if (p.kind === 'anthropic') {
      const r = await fetch(p.base + '/models', { headers: { 'x-api-key': p.key, 'anthropic-version': '2023-06-01' } });
      const d: any = await r.json();
      encontrados = (d?.data || []).map((m: any) => String(m.id || '')).filter(Boolean);
    } else {
      const r = await fetch(p.base + '/models', { headers: { Authorization: 'Bearer ' + p.key } });
      const d: any = await r.json();
      encontrados = (d?.data || d?.models || []).map((m: any) => String(m.id || m.name || '')).filter(Boolean);
    }
    if (encontrados.length) {
      const pref = encontrados.filter(m => p.preferir.test(m));
      const resto = encontrados.filter(m => !pref.includes(m));
      const lista = [...new Set([...pref, ...resto])].slice(0, 12);
      cacheModelos.set(p.id, { modelos: lista, t: Date.now() });
      return lista;
    }
  } catch (e) {
    console.error('[modelos]', p.id, String(e));
  }
  return p.modelos;
}

/* --------------------------------------------------------------------------
   Adaptadores
   -------------------------------------------------------------------------- */
function normalizarMensajes(mensajes: any[]) {
  return mensajes.map((m: any) => {
    if (!m || typeof m !== 'object') return m;
    const copia: any = { ...m };
    if (copia.role === 'assistant' && Array.isArray(copia.tool_calls)) {
      copia.tool_calls = copia.tool_calls.map((tc: any) => ({
        ...tc,
        type: tc?.type || 'function',
        function: {
          name: String(tc?.function?.name || ''),
          arguments: typeof tc?.function?.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc?.function?.arguments ?? {})
        }
      }));
    }
    return copia;
  });
}

function aGemini(mensajes: any[]) {
  const sistema = mensajes.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const contents = mensajes
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }]
    }));
  return { sistema, contents };
}

async function llamar(p: Proveedor, model: string, body: any) {
  if (p.kind === 'anthropic') {
    const mensajes = (body.messages || []).filter((m: any) => m.role !== 'system')
      .map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
    const sistema = (body.messages || []).filter((m: any) => m.role === 'system').map((m: any) => String(m.content || '')).join('\n\n');
    const payload: any = { model, max_tokens: body.max_tokens ?? 1200, messages: mensajes, ...(sistema ? { system: sistema } : {}) };
    if (body.temperature !== undefined && !/claude-(opus|sonnet)-5|claude-opus-4-7/i.test(model)) payload.temperature = body.temperature;
    const r = await fetch(p.base + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': p.key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload)
    });
    const d: any = await r.json();
    if (!r.ok) throw Object.assign(new Error(JSON.stringify(d).slice(0, 400)), { status: r.status });
    const texto = (d?.content || []).filter((x: any) => x.type === 'text').map((x: any) => x.text).join('');
    return { id: d.id, object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: texto }, finish_reason: d.stop_reason || 'stop' }], lumiweg_proveedor: p.id };
  }
  if (p.kind === 'gemini') {
    const { sistema, contents } = aGemini(body.messages || []);
    const gen: any = { temperature: body.temperature ?? 0.35, maxOutputTokens: body.max_tokens ?? 1200 };
    const tools = body.tools?.length ? [{ functionDeclarations: body.tools.map((t: any) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }] : undefined;
    const r = await fetch(
      `${p.base}/models/${model}:generateContent?key=${encodeURIComponent(p.key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(sistema ? { systemInstruction: { parts: [{ text: sistema }] } } : {}), contents, ...(tools ? { tools } : {}), generationConfig: gen })
      }
    );
    const d: any = await r.json();
    if (!r.ok) throw Object.assign(new Error(JSON.stringify(d).slice(0, 400)), { status: r.status });
    const cand = d?.candidates?.[0];
    const texto = (cand?.content?.parts || []).filter((x: any) => x.text).map((x: any) => x.text).join('').trim();
    const toolCalls = (cand?.content?.parts || []).filter((x: any) => x.functionCall)
      .map((x: any, i: number) => ({
        id: 'call_' + i, type: 'function',
        function: { name: x.functionCall.name, arguments: JSON.stringify(x.functionCall.args || {}) }
      }));
    return {
      choices: [{ message: { role: 'assistant', content: texto, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, finish_reason: 'stop' }],
      model, lumiweg_proveedor: p.id
    };
  }

  const r = await fetch(p.base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.key },
    body: JSON.stringify({ ...body, model })
  });
  const texto = await r.text();
  if (!r.ok) throw Object.assign(new Error(texto.slice(0, 400)), { status: r.status });
  const d = JSON.parse(texto);
  d.lumiweg_proveedor = p.id;
  return d;
}

/* --------------------------------------------------------------------------
   Servidor compatible con OpenAI (lo que espera la app)
   -------------------------------------------------------------------------- */
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });


/* --------------------------------------------------------------------------
   Diagnóstico por proveedor: estado de configuración + prueba real aislada.
   No devuelve claves ni mensajes crudos que pudieran contener datos sensibles.
   -------------------------------------------------------------------------- */
type ResultadoSalud = {
  proveedor: string;
  estado: 'conectado' | 'error' | 'sin_clave' | 'enfriamiento';
  comprobadoEn: string;
  latenciaMs?: number;
  codigoHttp?: number;
  categoria?: string;
  explicacion: string;
  accion: string;
  modelo?: string;
};
const ultimosResultados = new Map<string, ResultadoSalud>();
const ultimaPrueba = new Map<string, number>();
const ENFRIAMIENTO_MS = 15000;

function explicarFallo(status: number, mensaje: string) {
  const m = mensaje.toLowerCase();
  if (status === 521)
    return { categoria: 'servidor_origen_inaccesible', explicacion: 'HTTP 521 significa que el intermediario o proxy no logra establecer conexión con el servidor de origen del proveedor. No demuestra por sí solo que tu clave sea incorrecta.', accion: 'Comprueba la página de estado del proveedor, su URL base y si el servicio de origen está disponible. Vuelve a probar en unos minutos.' };
  if (status === 401 || status === 403 || /invalid api key|authentication|unauthorized|api key/i.test(m))
    return { categoria: 'autenticacion', explicacion: 'El proveedor rechazó la clave. Puede estar mal copiada, revocada o no tener permisos.', accion: 'Revisa la variable de entorno de este proveedor en Railway y confirma que la clave siga activa.' };
  if (status === 402 || /payment required|billing|insufficient balance|credit/i.test(m))
    return { categoria: 'saldo_o_facturacion', explicacion: 'La cuenta del proveedor no tiene saldo disponible o necesita configurar la facturación.', accion: 'Revisa el saldo, el método de pago y el estado de facturación en el panel del proveedor.' };
  if (status === 429 || /quota|rate.?limit|resource exhausted|too many requests/i.test(m))
    return { categoria: 'cuota_o_limite', explicacion: 'El proveedor limitó la solicitud por cuota agotada o demasiadas peticiones. No significa necesariamente que la clave esté dañada.', accion: 'Revisa la cuota, los límites por minuto y el proyecto asociado a la clave; espera y vuelve a probar.' };
  if (status === 400 || /invalid.*(model|argument|request)|unsupported parameter/i.test(m))
    return { categoria: 'solicitud_o_modelo', explicacion: 'El proveedor no aceptó la solicitud. El modelo puede no existir para tu cuenta o el formato enviado puede no ser compatible.', accion: 'Comprueba el identificador exacto del modelo y sus parámetros compatibles.' };
  if (status === 404 || /model.*not found|not_found/i.test(m))
    return { categoria: 'modelo_no_disponible', explicacion: 'La API respondió, pero no encontró el modelo solicitado o esa ruta no está disponible.', accion: 'Actualiza el identificador del modelo desde la lista oficial de modelos de tu proveedor.' };
  if (status === 408 || status === 504 || /timeout|timed out|aborted/i.test(m))
    return { categoria: 'tiempo_agotado', explicacion: 'El proveedor tardó demasiado en responder y se agotó el tiempo de espera.', accion: 'Vuelve a probar en unos segundos y revisa si el proveedor tiene una incidencia.' };
  if (status >= 500 || status === 502 || status === 503 || status === 529)
    return { categoria: 'proveedor_no_disponible', explicacion: 'El servicio remoto reportó un error interno o está temporalmente saturado.', accion: 'Espera unos minutos y vuelve a probar; revisa la página de estado oficial del proveedor.' };
  return { categoria: 'error_de_conexion', explicacion: 'No se pudo completar la prueba. Puede ser un fallo de red, una respuesta inesperada o una incompatibilidad de la API.', accion: 'Revisa los detalles técnicos resumidos y vuelve a ejecutar la prueba.' };
}

async function probarProveedor(p: Proveedor): Promise<ResultadoSalud> {
  const ahora = Date.now();
  const anterior = ultimaPrueba.get(p.id) || 0;
  if (ahora - anterior < ENFRIAMIENTO_MS) {
    const guardado = ultimosResultados.get(p.id);
    if (guardado) return { ...guardado, estado: 'enfriamiento', explicacion: 'La prueba se ejecutó hace poco; se muestra el último resultado para evitar consumir cuota innecesaria.', accion: 'Espera unos segundos antes de volver a probar.' };
  }
  ultimaPrueba.set(p.id, ahora);
  const inicio = Date.now();
  if (!p.key) {
    const resultado: ResultadoSalud = { proveedor: p.id, estado: 'sin_clave', comprobadoEn: new Date().toISOString(), categoria: 'clave_no_configurada', explicacion: 'Railway no tiene una clave configurada para este proveedor.', accion: 'Añade la variable de entorno indicada para este proveedor en Railway y vuelve a desplegar.', modelo: p.modelos[0] };
    ultimosResultados.set(p.id, resultado);
    return resultado;
  }
  let modelo = p.modelos[0];
  try {
    const modelosDisponibles = await descubrir(p);
    modelo = modelosDisponibles[0] || modelo;
    const respuesta = await llamar(p, modelo, {
      model: modelo,
      messages: [{ role: 'user', content: 'Responde únicamente: OK' }],
      max_tokens: 12,
      temperature: 0
    });
    const resultado: ResultadoSalud = {
      proveedor: p.id, estado: 'conectado', comprobadoEn: new Date().toISOString(),
      latenciaMs: Date.now() - inicio, categoria: 'correcto',
      explicacion: 'La clave fue aceptada y el proveedor devolvió una respuesta real de prueba.',
      accion: 'No se requiere ninguna acción.', modelo
    };
    ultimosResultados.set(p.id, resultado);
    return resultado;
  } catch (e: any) {
    const status = Number(e?.status) || 0;
    const detalle = String(e?.message || e).slice(0, 500);
    const info = explicarFallo(status, detalle);
    const resultado: ResultadoSalud = {
      proveedor: p.id, estado: 'error', comprobadoEn: new Date().toISOString(),
      latenciaMs: Date.now() - inicio, ...(status ? { codigoHttp: status } : {}),
      ...info, modelo
    };
    ultimosResultados.set(p.id, resultado);
    console.error('[diagnostico]', p.id, status, info.categoria, detalle.slice(0, 180));
    return resultado;
  }
}

Bun.serve({
  port: PORT,
  idleTimeout: 120,
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);

    if (url.pathname === '/providers' && req.method === 'GET') {
      return json({
        servicio: 'lumiweg-ai',
        comprobadoEn: new Date().toISOString(),
        resumen: { total: PROVEEDORES.length, configurados: conClave().length, sinClave: PROVEEDORES.length - conClave().length },
        proveedores: PROVEEDORES.map(p => ({
          id: p.id, configurado: Boolean(p.key), modelosSugeridos: p.modelos,
          variable: p.id === 'gemini' ? 'GEMINI_API_KEY o GOOGLE_API_KEY'
            : p.id === 'claude' ? 'ANTHROPIC_API_KEY o CLAUDE_API_KEY'
            : p.id === 'kimi' ? 'MOONSHOT_API_KEY o KIMI_API_KEY'
            : p.id === 'huggingface' ? 'HF_TOKEN o HUGGINGFACE_API_KEY'
            : ({ groq:'GROQ_API_KEY', xai:'XAI_API_KEY', openai:'OPENAI_API_KEY', deepseek:'DEEPSEEK_API_KEY', openrouter:'OPENROUTER_API_KEY', cerebras:'CEREBRAS_API_KEY', mistral:'MISTRAL_API_KEY', together:'TOGETHER_API_KEY' } as Record<string,string>)[p.id] || 'variable del proveedor',
          ultimoResultado: ultimosResultados.get(p.id) || null
        }))
      });
    }

    if (url.pathname === '/health/providers' && req.method === 'GET') {
      const resultados = PROVEEDORES.map(p => ({
        proveedor: p.id, configurado: Boolean(p.key),
        resultado: ultimosResultados.get(p.id) || null
      }));
      return json({
        ok: true, comprobadoEn: new Date().toISOString(),
        resumen: {
          total: resultados.length,
          conClave: resultados.filter(x => x.configurado).length,
          pruebasExitosas: resultados.filter(x => x.resultado?.estado === 'conectado').length,
          errores: resultados.filter(x => x.resultado?.estado === 'error').length,
          sinClave: resultados.filter(x => !x.configurado).length
        },
        proveedores: resultados
      });
    }

    const routeParts = url.pathname.split('/');
    const testMatch = routeParts.length === 4 && routeParts[1] === 'providers' && routeParts[3] === 'test' && /^[a-z0-9_-]+$/i.test(routeParts[2]) ? routeParts : null;
    if (testMatch && req.method === 'POST') {
      const proveedor = PROVEEDORES.find(p => p.id === testMatch[2].toLowerCase());
      if (!proveedor) return json({ error: { message: 'Proveedor desconocido. Consulta GET /providers para ver los identificadores válidos.' } }, 404);
      const resultado = await probarProveedor(proveedor);
      return json(resultado, resultado.estado === 'error' ? 502 : resultado.estado === 'sin_clave' ? 503 : 200);
    }

    if (url.pathname === '/health' || url.pathname === '/') {
      const lista = conClave();
      return json({
        ok: true,
        servicio: 'lumiweg-ai',
        proveedores: lista.map(p => p.id),
        listo: lista.length > 0
      });
    }

    // Descubrimiento de modelos: la app lo consulta igual que a los demás.
    if (url.pathname === '/models' && req.method === 'GET') {
      const lista = conClave();
      if (!lista.length) return json({ error: { message: 'sin proveedores configurados' } }, 503);
      const data: any[] = [];
      for (const p of lista) {
        for (const m of await descubrir(p)) {
          data.push({ id: m, object: 'model', owned_by: p.id });
        }
      }
      return json({ object: 'list', data });
    }

    if (url.pathname !== '/chat/completions' || req.method !== 'POST') {
      return json({ error: { message: 'Not found' } }, 404);
    }

    let body: any;
    try { body = await req.json(); } catch { return json({ error: { message: 'JSON inválido' } }, 400); }
    if (!Array.isArray(body?.messages) || !body.messages.length) {
      return json({ error: { message: 'messages es obligatorio' } }, 400);
    }

    const disponibles = conClave();
    if (!disponibles.length) {
      return json({ error: { message: 'El backend no tiene ninguna clave configurada (OPENAI_API_KEY, ANTHROPIC_API_KEY, MOONSHOT_API_KEY, DEEPSEEK_API_KEY, XAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, etc.)' } }, 503);
    }

    // El modelo pedido decide el proveedor; «auto» o desconocido → cadena completa.
    // Normaliza llamadas a herramientas que algunas versiones del cliente envían
    // sin tool_calls[].type; proveedores OpenAI-compatible rechazan ese formato.
    body.messages = normalizarMensajes(body.messages);
    const pedido = String(body.model || 'auto');
    const ordenPreferido = (req.headers.get('X-Lumi-Provider-Order') || '')
      .split(',').map((x: string) => x.trim().toLowerCase()).filter(Boolean);
    const ordenarPorPreferencia = (lista: Proveedor[]) => {
      if (!ordenPreferido.length) return lista;
      return [...lista].sort((a, b) => {
        const ia = ordenPreferido.indexOf(a.id), ib = ordenPreferido.indexOf(b.id);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
    };
    const soloProveedor = (req.headers.get('X-Lumi-Provider-Only') || '').trim().toLowerCase();
    let cadena = ordenarPorPreferencia(soloProveedor ? disponibles.filter(p => p.id === soloProveedor) : disponibles);
    if (soloProveedor && !cadena.length) return json({ error: { message: 'Proveedor no configurado: ' + soloProveedor } }, 404);
    if (pedido !== 'auto') {
      const exacto = disponibles.filter(p => p.modelos.includes(pedido));
      const porPrefijo = disponibles.filter(p => {
        if (p.id === 'openrouter') return pedido.includes('/');
        if (p.id === 'gemini') return pedido.startsWith('gemini');
        if (p.id === 'xai') return /^grok-/i.test(pedido);
        if (p.id === 'openai') return /^gpt-/i.test(pedido);
        if (p.id === 'deepseek') return /^deepseek-/i.test(pedido);
        if (p.id === 'claude') return /^claude-/i.test(pedido);
        if (p.id === 'kimi') return /^kimi-/i.test(pedido);
        if (p.id === 'groq') return /llama|gpt-oss|qwen/i.test(pedido);
        if (p.id === 'cerebras') return /gpt-oss|glm|gemma/i.test(pedido);
        if (p.id === 'mistral') return /mistral|nemo/i.test(pedido);
        if (p.id === 'together' || p.id === 'huggingface') return /llama|qwen|deepseek|meta-/i.test(pedido);
        return false;
      });
      const elegidos = [...exacto, ...porPrefijo];
      if (elegidos.length) cadena = elegidos;
    }

    const fallos: any[] = [];
    for (const p of cadena) {
      const modelos = pedido !== 'auto' ? [pedido] : await descubrir(p);
      for (const model of modelos.slice(0, 2)) {
        try {
          const res = await llamar(p, model, body);
          return json(res);
        } catch (e: any) {
          const status = Number(e?.status) || 0;
          fallos.push({ proveedor: p.id, modelo: model, status, error: String(e?.message || e).slice(0, 200) });
          console.error('[fallo]', p.id, model, status, String(e?.message || e).slice(0, 200));
          // Solo se salta de proveedor con errores de disponibilidad o clave.
          if (![400, 401, 402, 403, 404, 408, 429, 500, 502, 503, 504, 529].includes(status)) break;
        }
      }
    }

    return json({
      error: { message: 'Ningún proveedor pudo responder', fallos }
    }, 502);
  }
});

console.log(`Lumiweg AI backend escuchando en :${PORT} · proveedores: ${conClave().map(p => p.id).join(', ') || 'ninguno'}`);
