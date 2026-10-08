const port=Number(Bun.env.PORT||3000);
const apiKey=Bun.env.OPENAI_API_KEY||'';
const model=Bun.env.OPENAI_MODEL||'gpt-6-luna';
const system=`Eres Lumi, un asistente virtual total en español. Responde de forma natural, útil, clara y cálida. Puedes ayudar con estudio, trabajo, organización, ideas, cálculos y conversación. No afirmes haber ejecutado una acción del teléfono si no recibiste una herramienta que la confirme. Si falta información, pregunta lo necesario. Mantén respuestas prácticas y no excesivamente largas.`;

function cors(extra={}){
  return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST,GET,OPTIONS',...extra};
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors(),'Content-Type':'application/json; charset=utf-8'}})}

Bun.serve({
  port,
  async fetch(req){
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors()});
    const url=new URL(req.url);
    if(url.pathname==='/health')return json({ok:true,service:'lumiweg-ai'});
    if(url.pathname!=='/chat'||req.method!=='POST')return json({error:'Not found'},404);
    if(!apiKey)return json({error:'AI backend is not configured'},503);
    let body;
    try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
    const message=typeof body?.message==='string'?body.message.trim():'';
    if(!message)return json({error:'message is required'},400);
    const history=Array.isArray(body?.history)?body.history.slice(-12).filter(x=>x&&typeof x.content==='string'&&['user','assistant'].includes(x.role)):[];

    const input=[
      {role:'system',content:system},
      ...history.map(x=>({role:x.role,content:x.content})),
      {role:'user',content:message}
    ];

    try{
      const r=await fetch('https://api.openai.com/v1/responses',{
        method:'POST',
        headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
        body:JSON.stringify({model,input})
      });
      const raw=await r.text();
      if(!r.ok){
        console.error('OpenAI error',r.status,raw.slice(0,1000));
        return json({error:'AI provider error'},502);
      }
      const data=JSON.parse(raw);
      const reply=typeof data.output_text==='string'?data.output_text.trim():'';
      if(!reply)return json({error:'AI returned no text'},502);
      return json({reply});
    }catch(e){
      console.error('Backend error',e);
      return json({error:'AI backend unavailable'},502);
    }
  }
});
