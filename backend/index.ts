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
  kind: 'openai' | 'gemini';
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
  if (p.kind === 'gemini') {
    const { sistema, contents } = aGemini(body.messages || []);
    const gen: any = { temperature: body.temperature ?? 0.35, maxOutputTokens: body.max_tokens ?? 1200 };
    if (body.tools?.length) {
      gen.tools = [{
        functionDeclarations: body.tools.map((t: any) => ({
          name: t.function.name, description: t.function.description, parameters: t.function.parameters
        }))
      }];
    }
    const r = await fetch(
      `${p.base}/models/${model}:generateContent?key=${encodeURIComponent(p.key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(sistema ? { systemInstruction: { parts: [{ text: sistema }] } } : {}), contents, generationConfig: gen })
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

Bun.serve({
  port: PORT,
  idleTimeout: 120,
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);

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
      return json({ error: { message: 'El backend no tiene ninguna clave configurada (XAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, etc.)' } }, 503);
    }

    // El modelo pedido decide el proveedor; «auto» o desconocido → cadena completa.
    const pedido = String(body.model || 'auto');
    let cadena = disponibles;
    if (pedido !== 'auto') {
      const exacto = disponibles.filter(p => p.modelos.includes(pedido));
      const porPrefijo = disponibles.filter(p => {
        if (p.id === 'openrouter') return pedido.includes('/');
        if (p.id === 'gemini') return pedido.startsWith('gemini');
        if (p.id === 'xai') return /^grok-/i.test(pedido);
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
