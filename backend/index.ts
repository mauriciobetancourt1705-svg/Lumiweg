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

const baseSystem=`Eres Lumi, una asistente virtual total y una compañera de acompañamiento 24/7. Tu personalidad es cálida, cercana, humana, observadora, inteligente, paciente y protectora sin ser invasiva. Tu eje principal es el bienestar y el acompañamiento emocional, pero también eres capaz de estudiar, razonar, organizar, calcular, investigar, planificar y ayudar con acciones digitales. Recuerda el contexto de la conversación y úsalo para responder con continuidad. No hables como un bot corporativo ni uses respuestas vacías, repetitivas o mecánicas. Cuando la persona está triste, frustrada, ansiosa o simplemente necesita compañía, primero escucha y valida brevemente antes de intentar solucionar. No diagnostiques ni sustituyas a profesionales. En voz, responde de forma corta, natural y conversacional para que la persona pueda volver a hablar sin esperar una explicación interminable. Respeta estrictamente los turnos: nunca finjas que una acción ocurrió si no tienes una herramienta que la confirmó. Si una acción del teléfono no está disponible, dilo y ofrece la alternativa que sí puedes ejecutar. Sé proactiva cuando el contexto lo permita, pero no inventes recuerdos, acciones, datos ni emociones.`;

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
        generationConfig:{maxOutputTokens:520,thinkingConfig:{thinkingLevel:String(system).includes('voz')?'low':'low'}}
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
    if(url.pathname==='/health')return json({ok:true,service:'lumiweg-ai',providers:{gemini:Boolean(geminiKey),openai:Boolean(openaiKey),tts:Boolean(geminiKey)}});
    if(url.pathname==='/tts'&&req.method==='POST'){
      if(!geminiKey)return json({error:'TTS unavailable'},503);
      let body;try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
      const text=typeof body?.text==='string'?body.text.replace(/\s+/g,' ').trim():'';
      const voice=typeof body?.voice==='string'?body.voice.trim():'Kore';
      const allowed=['Gacrux','Sulafat','Vindemiatrix','Achird','Kore','Charon','Aoede','Schedar','Puck','Zephyr','Orus','Leda','Fenrir','Autonoe','Enceladus','Umbriel','Laomedeia','Iapetus','Erinome','Algenib','Rasalgethi','Alnilam','Schedar','Zubenelgenubi','Sadachbia','Sadaltager','Achernar'];
      const selected=allowed.includes(voice)?voice:'Kore';
      if(!text)return json({error:'text is required'},400);
      try{
        const url='https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent';
        const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':geminiKey},body:JSON.stringify({
          contents:[{role:'user',parts:[{text,speech_metadata:{style:'natural, warm, caring, conversational Spanish voice for a personal AI companion'}}]}],
          generationConfig:{responseModalities:['AUDIO'],speechConfig:{languageCode:'es-ES',voiceConfig:{prebuiltVoiceConfig:{voiceName:selected}}}}
        })});
        const data=await r.json().catch(()=>({}));
        const audio=data?.candidates?.[0]?.content?.parts?.find(p=>p?.inlineData?.data)?.inlineData?.data;
        if(!r.ok||!audio)return json({error:'TTS provider error'},502);
        return json({audioBase64:audio,mimeType:'audio/wav',voice:selected});
      }catch(e){console.warn('TTS failed',String(e?.message||e).slice(0,500));return json({error:'TTS unavailable'},502)}
    }
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
