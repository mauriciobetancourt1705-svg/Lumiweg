const port=Number(Bun.env.PORT||3000);

const geminiKey=Bun.env.GEMINI_API_KEY||'';
const openaiKey=Bun.env.OPENAI_API_KEY||'';

const geminiModels=[...new Set([
  Bun.env.GEMINI_MODEL||'gemini-3.5-flash',
  Bun.env.GEMINI_FALLBACK_MODEL||'gemini-3.1-flash-lite',
  Bun.env.GEMINI_SECONDARY_MODEL||'gemini-2.5-flash-lite'
].filter(Boolean))];

const baseSystem=`Eres Lumi, una asistente virtual total y una compañera de acompañamiento 24/7. Tu personalidad es cálida, cercana, humana, observadora, inteligente, paciente y protectora sin ser invasiva. Tu eje principal es el bienestar y el acompañamiento emocional, pero también eres capaz de estudiar, razonar, organizar, calcular, investigar, planificar y ayudar con acciones digitales. Recuerda el contexto de la conversación y úsalo para responder con continuidad. No hables como un bot corporativo ni uses respuestas vacías, repetitivas o mecánicas. Cuando la persona está triste, frustrada, ansiosa o simplemente necesita compañía, primero escucha y valida brevemente antes de intentar solucionar. No diagnostiques ni sustituyas a profesionales. En voz, responde de forma corta, natural y conversacional para que la persona pueda volver a hablar sin esperar una explicación interminable. Respeta estrictamente los turnos: nunca finjas que una acción ocurrió si no tienes una herramienta que la confirmó. Si una acción del teléfono no está disponible, dilo y ofrece la alternativa que sí puedes ejecutar. Sé proactiva cuando el contexto lo permita, pero no inventes recuerdos, acciones, datos ni emociones.`;

function cors(extra={}){return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST,GET,OPTIONS',...extra};}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors(),'Content-Type':'application/json; charset=utf-8'}})}

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

function messages(message,history,system){
  return [{role:'system',content:system},...history,{role:'user',content:message}];
}

async function callOpenAICompatible(name,baseUrl,key,model,message,history,system){
  if(!key||!baseUrl||!model)return null;
  try{
    const url=baseUrl.replace(/\/$/,'')+'/chat/completions';
    const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({
      model,
      messages:messages(message,history,system),
      temperature:0.65,
      max_tokens:520
    })});
    const data=await r.json().catch(()=>({}));
    if(!r.ok){
      console.warn(name+' failed',r.status,String(data?.error?.message||'').slice(0,400));
      return null;
    }
    const reply=data?.choices?.[0]?.message?.content;
    return typeof reply==='string'&&reply.trim()?{reply:reply.trim(),model,provider:name}:null;
  }catch(e){
    console.warn(name+' request failed',String(e?.message||e).slice(0,400));
    return null;
  }
}

async function callGemini(message,history,system){
  if(!geminiKey)return null;
  const contents=[
    ...history.map(x=>({role:x.role==='assistant'?'model':'user',parts:[{text:x.content}]})),
    {role:'user',parts:[{text:message}]}
  ];
  for(const model of geminiModels){
    try{
      const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':geminiKey},signal:AbortSignal.timeout(8500),body:JSON.stringify({
        system_instruction:{parts:[{text:system}]},
        contents,
        generationConfig:{maxOutputTokens:360,thinkingConfig:{thinkingLevel:'low'}}
      })});
      const data=await r.json().catch(()=>({}));
      if(r.ok){
        const reply=data?.candidates?.[0]?.content?.parts?.map(p=>p?.text||'').join('').trim();
        if(reply)return {reply,model,provider:'gemini'};
      }
      console.warn('Gemini model failed',model,r.status,String(data?.error?.message||'').slice(0,400));
      // Do not spend another full request window retrying other Gemini models during provider overload.
      if(r.status===429||r.status===503)return null;
    }catch(e){console.warn('Gemini request failed',String(e?.message||e).slice(0,400))}
  }
  return null;
}

async function callCloudflare(message,history,system){
  const key=Bun.env.CLOUDFLARE_API_TOKEN||'';
  const account=Bun.env.CLOUDFLARE_ACCOUNT_ID||'';
  const model=Bun.env.CLOUDFLARE_MODEL||'@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  if(!key||!account||!model)return null;
  try{
    const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/ai/run/'+encodeURIComponent(model);
    const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({
      messages:messages(message,history,system)
    })});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||data?.success===false){
      console.warn('cloudflare failed',r.status,String(data?.errors?.[0]?.message||'').slice(0,400));
      return null;
    }
    const reply=data?.result?.response||data?.result?.output_text||data?.result?.choices?.[0]?.message?.content;
    return typeof reply==='string'&&reply.trim()?{reply:reply.trim(),model,provider:'cloudflare'}:null;
  }catch(e){console.warn('cloudflare request failed',String(e?.message||e).slice(0,400));return null}
}

const providers=[
  {id:'gemini',enabled:()=>Boolean(geminiKey),call:callGemini},
  {id:'groq',enabled:()=>Boolean(Bun.env.GROQ_API_KEY),call:(m,h,s)=>callOpenAICompatible('groq','https://api.groq.com/openai/v1',Bun.env.GROQ_API_KEY||'',Bun.env.GROQ_MODEL||'openai/gpt-oss-120b',m,h,s)},
  {id:'openrouter',enabled:()=>Boolean(Bun.env.OPENROUTER_API_KEY),call:(m,h,s)=>callOpenAICompatible('openrouter','https://openrouter.ai/api/v1',Bun.env.OPENROUTER_API_KEY||'',Bun.env.OPENROUTER_MODEL||'qwen/qwen3.8-27b:free',m,h,s)},
  {id:'mistral',enabled:()=>Boolean(Bun.env.MISTRAL_API_KEY),call:(m,h,s)=>callOpenAICompatible('mistral','https://api.mistral.ai/v1',Bun.env.MISTRAL_API_KEY||'',Bun.env.MISTRAL_MODEL||'mistral-small-latest',m,h,s)},
  {id:'nvidia',enabled:()=>Boolean(Bun.env.NVIDIA_API_KEY),call:(m,h,s)=>callOpenAICompatible('nvidia','https://integrate.api.nvidia.com/v1',Bun.env.NVIDIA_API_KEY||'',Bun.env.NVIDIA_MODEL||'moonshotai/kimi-k2.5',m,h,s)},
  {id:'huggingface',enabled:()=>Boolean(Bun.env.HF_TOKEN),call:(m,h,s)=>callOpenAICompatible('huggingface','https://router.huggingface.co/v1',Bun.env.HF_TOKEN||'',Bun.env.HF_MODEL||'Qwen/Qwen3-30B-A3B-Instruct-2507',m,h,s)},
  {id:'cloudflare',enabled:()=>Boolean(Bun.env.CLOUDFLARE_API_TOKEN&&Bun.env.CLOUDFLARE_ACCOUNT_ID),call:callCloudflare},
  {id:'openai',enabled:()=>Boolean(openaiKey),call:(m,h,s)=>callOpenAICompatible('openai','https://api.openai.com/v1',openaiKey,Bun.env.OPENAI_MODEL||'gpt-6-luna',m,h,s)}
];

function orderedProviders(){
  const requested=String(Bun.env.LUMI_PROVIDER_ORDER||'gemini,groq,openrouter,mistral,nvidia,huggingface,cloudflare,openai').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const byId=new Map(providers.map(p=>[p.id,p]));
  return requested.map(x=>byId.get(x)).filter(Boolean);
}

async function routeAI(message,history,system){
  const failures=[];
  for(const provider of orderedProviders()){
    if(!provider.enabled())continue;
    const result=await provider.call(message,history,system);
    if(result)return result;
    failures.push(provider.id);
  }
  return {error:'AI providers unavailable',failures};
}

Bun.serve({
  port,
  async fetch(req){
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors()});
    const url=new URL(req.url);
    if(url.pathname==='/health'){
      const configured=orderedProviders().filter(p=>p.enabled()).map(p=>p.id);
      return json({ok:true,service:'lumiweg-ai',providers:configured,failover:configured.length>1,tts:Boolean(geminiKey)});
    }
    if(url.pathname==='/tts'&&req.method==='POST'){
      if(!geminiKey)return json({error:'TTS unavailable'},503);
      let body;try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
      const text=typeof body?.text==='string'?body.text.replace(/\s+/g,' ').trim():'';
      const voice=typeof body?.voice==='string'?body.voice.trim():'Kore';
      const allowed=['Gacrux','Sulafat','Vindemiatrix','Achird','Kore','Charon','Aoede','Schedar','Puck','Zephyr','Orus','Leda','Fenrir','Autonoe','Enceladus','Umbriel','Laomedeia','Iapetus','Erinome','Algenib','Rasalgethi','Alnilam','Zubenelgenubi','Sadachbia','Sadaltager','Achernar'];
      const selected=allowed.includes(voice)?voice:'Kore';
      if(!text)return json({error:'text is required'},400);
      try{
        const ttsUrl='https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent';
        const r=await fetch(ttsUrl,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':geminiKey},body:JSON.stringify({
          contents:[{role:'user',parts:[{text,speech_metadata:{style:'natural, warm, caring, conversational Spanish voice for a personal AI companion'}}]}],
          generationConfig:{responseModalities:['AUDIO'],speechConfig:{languageCode:'es-ES',voiceConfig:{prebuiltVoiceConfig:{voiceName:selected}}}}
        })});
        const data=await r.json().catch(()=>({}));
        const audio=data?.candidates?.[0]?.content?.parts?.find(p=>p?.inlineData?.data)?.inlineData?.data;
        if(!r.ok||!audio)return json({error:'TTS provider error'},502);
        return json({audioBase64:audio,mimeType:'audio/wav',voice:selected});
      }catch(e){console.warn('TTS failed',String(e?.message||e).slice(0,500));return json({error:'TTS unavailable'},502)}
    }
    if((url.pathname==='/chat'||url.pathname==='/api/v1/ai/academic-update')&&req.method==='POST'){
      let body;try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
      const message=typeof body?.message==='string'?body.message.trim():'';
      if(!message)return json({error:'message is required'},400);
      const history=normalizeHistory(body?.history);
      if(url.pathname==='/api/v1/ai/academic-update'){
        const prompt='Extrae los datos académicos explícitos del mensaje y devuelve SOLO JSON válido con esta forma: {"update":{"university":"","campus":"","career":"","semester":"","creditsCompleted":null,"creditsTotal":null,"grades":[{"subject":"","grade":0,"max":10}]}}. No inventes datos. Si no hay dato académico concreto, devuelve {"update":null}. Mensaje: '+message;
        const result=await routeAI(prompt,history,buildSystem('academic'));
        if(!result.reply)return json({error:'AI providers unavailable',failures:result.failures||[]},502);
        try{const clean=result.reply.replace(/^```(?:json)?\\s*/i,'').replace(/\\s*```$/,'');const parsed=JSON.parse(clean);if(!parsed.update)return json({error:'No academic update found'},422);return json({update:parsed.update,provider:result.provider,model:result.model});}catch{return json({error:'AI returned invalid academic JSON',provider:result.provider,model:result.model},502)}
      }
      const result=await routeAI(message,history,buildSystem(body?.mode||''));
      if(result.reply)return json(result);
      return json(result,502);
    }
    return json({error:'Not found'},404);
  }
});
