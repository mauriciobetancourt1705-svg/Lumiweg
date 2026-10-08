const port=Number(Bun.env.PORT||3000);

const geminiKey=Bun.env.GEMINI_API_KEY||'';
const geminiModels=[...new Set([
  Bun.env.GEMINI_MODEL||'gemini-3.8-flash',
  Bun.env.GEMINI_FALLBACK_MODEL||'gemini-3.5-flash-lite',
  Bun.env.GEMINI_SECONDARY_MODEL||'gemini-3.1-flash-lite'
].filter(Boolean))];
const openaiKey=Bun.env.OPENAI_API_KEY||'';
const openaiModel=Bun.env.OPENAI_MODEL||'gpt-6-luna';

function cors(extra={}){return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST,GET,OPTIONS',...extra};}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors(),'Content-Type':'application/json; charset=utf-8'}})}

const baseSystem=`Eres Lumi, un asistente virtual total en español. Eres natural, cálida, inteligente y práctica. Puedes ayudar con conversación, estudio, trabajo, organización, cálculos, ideas, bienestar y planificación. Usa el historial para mantener continuidad y no respondas como un chatbot que olvida lo anterior. Si el usuario pide una acción del teléfono que no tienes una herramienta real para ejecutar, dilo con honestidad y ofrece la alternativa disponible. No inventes acciones ejecutadas, datos ni resultados. Responde en español claro y directo. Evita respuestas genéricas y frases vacías como "Listo, ya lo tengo en cuenta" cuando la petición requiere una acción o explicación.`;

function buildSystem(mode){
  const m=String(mode||'').toLowerCase();
  if(m==='bienestar'||m==='private')return baseSystem+' En esta conversación de voz actúas como una acompañante cercana y conversacional: escucha lo último que dice la persona, responde directamente y mantén el diálogo abierto. No diagnostiques ni te presentes como profesional de salud.';
  return baseSystem+' Prioriza entender la intención real del usuario. Si una pregunta necesita razonamiento, razona y explica lo necesario; si es simple, responde simple.';
}

function normalizeHistory(history){
  return Array.isArray(history)?history.slice(-12).map(x=>{
    const role=x?.role==='assistant'||x?.role==='model'?'assistant':'user';
    const text=typeof x?.content==='string'?x.content:typeof x?.text==='string'?x.text:'';
    return text.trim()?{role,content:text.slice(0,4000)}:null;
  }).filter(Boolean):[];
}

async function callGemini(message,history,system){
  if(!geminiKey)return null;
  const contents=[
    ...history.map(x=>({role:x.role==='assistant'?'model':'user',parts:[{text:x.content}]})),
    {role:'user',parts:[{text:message}]}
  ];
  let lastStatus=0,lastError='';
  for(const model of geminiModels){
    try{
      const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':geminiKey},body:JSON.stringify({
        system_instruction:{parts:[{text:system}]},
        contents,
        generationConfig:{temperature:0.35,maxOutputTokens:900}
      })});
      const data=await r.json().catch(()=>({}));
      if(r.ok){
        const reply=data?.candidates?.[0]?.content?.parts?.map(p=>p?.text||'').join('').trim();
        if(reply)return {reply,model};
      }
      lastStatus=r.status;
      lastError=String(data?.error?.message||'');
      console.warn('Gemini model failed',model,lastStatus,lastError.slice(0,500));
      if(![429,500,502,503,504].includes(r.status))break;
    }catch(e){
      lastError=String(e?.message||e);
      console.warn('Gemini request failed',lastError.slice(0,500));
    }
  }
  return null;
}

async function callOpenAI(message,history,system){
  if(!openaiKey)return null;
  try{
    const input=[
      {role:'system',content:system},
      ...history,
      {role:'user',content:message}
    ];
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:'Bearer '+openaiKey,'Content-Type':'application/json'},
      body:JSON.stringify({model:openaiModel,input})
    });
    const raw=await r.text();
    if(!r.ok){
      console.warn('OpenAI provider failed',r.status,raw.slice(0,700));
      return null;
    }
    const data=JSON.parse(raw);
    const reply=typeof data.output_text==='string'?data.output_text.trim():'';
    return reply?{reply,model:openaiModel}:null;
  }catch(e){
    console.warn('OpenAI request failed',String(e?.message||e).slice(0,500));
    return null;
  }
}

Bun.serve({
  port,
  async fetch(req){
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors()});
    const url=new URL(req.url);
    if(url.pathname==='/health')return json({ok:true,service:'lumiweg-ai',providers:{gemini:Boolean(geminiKey),openai:Boolean(openaiKey)}});
    if(url.pathname!=='/chat'||req.method!=='POST')return json({error:'Not found'},404);
    let body;
    try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
    const message=typeof body?.message==='string'?body.message.trim():'';
    if(!message)return json({error:'message is required'},400);
    const history=normalizeHistory(body?.history);
    const system=buildSystem(body?.mode||'');
    const gemini=await callGemini(message,history,system);
    if(gemini)return json({reply:gemini.reply,model:gemini.model,provider:'gemini'});
    const openai=await callOpenAI(message,history,system);
    if(openai)return json({reply:openai.reply,model:openai.model,provider:'openai'});
    return json({error:'AI providers unavailable'},502);
  }
});
