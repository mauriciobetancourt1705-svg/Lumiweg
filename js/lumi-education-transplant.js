/* Lumi transplant from Education commit 8047eeb62f53039e70e09016342093aad6b5444d.
   Source commit is preserved; this wrapper only supplies Lumiweg adapters. */
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  let token='',mode='aprender',busy=false;
  const AI_ENDPOINT='https://education-bloque4-test-production.up.railway.app/chat';
  const state={
    messages:[],
    wellbeing:{checkins:[],messages:[]},
    media:{mood:'calma',favorites:[]},
    extras:{}
  };
  function sync(){
    try{localStorage.setItem('lumi_education_state',JSON.stringify(state))}catch{}
  }
  function toast(t){
    const e=$('#toast');
    if(e){e.textContent=String(t||'');e.classList.add('show');clearTimeout(window.__lumiEducationToast);window.__lumiEducationToast=setTimeout(()=>e.classList.remove('show'),2600)}
  }
  function render(v){
    const map={ia:'s-chat',bienestar:'s-well',media:'s-media'};
    if(window.Lumi?.go)window.Lumi.go(map[v]||'s-home');
  }
  function openExternal(url){
    if(window.Lumi?.openExternal)return window.Lumi.openExternal(url);
    openExternal(url);
  }
  window.__lumiEducation={state,sync,render,toast,openExternal};
const LUMI_VOICES=[
{id:'Gacrux',name:'Lumi Serena',desc:'Madura y tranquila'},
{id:'Sulafat',name:'Lumi Cálida',desc:'Cálida y acogedora'},
{id:'Vindemiatrix',name:'Lumi Suave',desc:'Suave y gentil'},
{id:'Achird',name:'Lumi Amigable',desc:'Cercana y natural'},
{id:'Kore',name:'Lumi Firme',desc:'Serena y motivadora'},
{id:'Charon',name:'Lumi Informativa',desc:'Clara y estable'},
{id:'Aoede',name:'Lumi Breezy',desc:'Ligera y relajada'},
{id:'Schedar',name:'Lumi Equilibrada',desc:'Equilibrada para todo momento'}
];
function currentLumiVoice(){return state.extras?.lumiVoice||localStorage.getItem('lumi_voice_v1')||'Gacrux'}
function setLumiVoice(id,preview=true){const valid=LUMI_VOICES.some(v=>v.id===id)?id:'Gacrux';state.extras={...(state.extras||{}),lumiVoice:valid};localStorage.setItem('lumi_voice_v1',valid);sync();render('bienestar');if(preview)setTimeout(()=>speakLumi('Hola, soy Lumi. Esta es la voz que seleccionaste.'),80)}
function chooseLumiVoice(){const current=currentLumiVoice();const options=LUMI_VOICES.map((v,i)=>(i+1)+'. '+v.name+' — '+v.desc).join('\\n');const raw=prompt('Elige la voz de Lumi:\\n\\n'+options+'\\n\\nVoz actual: '+(LUMI_VOICES.find(v=>v.id===current)?.name||current),String(LUMI_VOICES.findIndex(v=>v.id===current)+1));if(raw===null)return;const v=LUMI_VOICES[Number(raw)-1];if(!v){toast('Opción de voz no válida.');return}setLumiVoice(v.id,true)}
function lumiMediaCommand(message){
  const raw=String(message||'').trim();
  const t=raw.toLowerCase();
  if(!t)return false;
  const movieIntent=/(pel[ií]cula|serie|episodio|documental|trailer|tráiler|filme|film|s[eé]rie)/i.test(t);
  const musicIntent=/(m[uú]sica|canci[oó]n|tema|artista|[aá]lbum|playlist|spotify|youtube\s*music)/i.test(t);
  const playIntent=/(?:^|\s)(?:lumi[,.]?\s+)?(?:pon|poner|reproduce|reproducir|reprod[uú]ceme|ponme|escucha|escuchar|dale|play|haz\s+sonar|quiero\s+escuchar|quiero\s+ver|ponme\s+a\s+ver|busca|buscar|abre|abrir)(?:\s|$)/i.test(t);
  const youtubeIntent=/(youtube|youtube\s+music|en\s+yt|en\s+youtube|video|videoclip)/i.test(t);
  const explicitMedia=movieIntent||musicIntent||playIntent||youtubeIntent;
  if(!explicitMedia)return false;

  let q=raw
    .replace(/^(?:lumi[,.]?\s*)?(?:por\s+favor\s+)?(?:quiero\s+que\s+)?(?:me\s+)?(?:pongas?|ponme|pon|reproduce|reproducir|reprod[uú]ceme|escucha|escuchar|play|dale|haz\s+sonar|busca|buscar|abre|abrir)(?:\s+en)?/i,'')
    .replace(/\b(?:en\s+)?(?:youtube\s+music|youtube|yt)\b/gi,'')
    .replace(/\b(?:por\s+favor|please)\b/gi,'')
    .replace(/\s+/g,' ').trim();
  q=q.replace(/^(?:la|el|los|las|un|una)\s+/i,'').trim();

  if(!q){
    speakLumi(movieIntent?'Claro. Dime el nombre de la película o serie que quieres buscar en YouTube.':'Claro. Dime qué quieres escuchar y lo busco en YouTube.');
    return true;
  }

  const searchTerm=movieIntent && !/pel[ií]cula|serie|trailer|episodio|documental/i.test(q) ? q+' película' : q;
  const url='https://www.youtube.com/results?search_query='+encodeURIComponent(searchTerm);
  window.open(url,'_blank','noopener');
  const label=movieIntent?'Te abrí YouTube con la búsqueda de '+q+'.':'Te abrí YouTube con '+q+' para que puedas reproducirlo.';
  speakLumi(label);
  return true;
}
function setMood(mood){state.media={...(state.media||{}),mood};sync();render('media')}
function openMedia(kind){const q=prompt(kind==='music'?'¿Qué música quieres escuchar?':'¿Qué película o serie quieres buscar?','');if(!q)return;const mood=state.media?.mood||'calma';const url=kind==='music'?'https://music.youtube.com/search?q='+encodeURIComponent(q+' '+mood):'https://www.justwatch.com/us/search?q='+encodeURIComponent(q);window.open(url,'_blank','noopener')}
async function captureAcademicWithLumi(){
  const message=window.prompt('¿Qué dato académico quieres que Lumi registre? Ejemplo: Aprobé Contabilidad con 17.');
  if(!message)return;
  try{
    const response=await fetch('/api/v1/ai/academic-update',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({message:String(message).trim()})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.update){alert('Lumi no pudo identificar un dato académico claro.');return;}
    const u=data.update; state.profile=state.profile||{};
    if(u.university)state.profile.university=u.university;
    if(u.campus)state.profile.campus=u.campus;
    if(u.career)state.profile.career=u.career;
    if(u.semester)state.profile.semester=u.semester;
    if(u.creditsCompleted!=null)state.profile.creditsCompleted=Number(u.creditsCompleted);
    if(u.creditsTotal!=null)state.profile.creditsTotal=Number(u.creditsTotal);
    if(Array.isArray(u.grades))u.grades.forEach(g=>{const rawMax=Number(g?.max||10),rawGrade=Number(g?.grade);const targetMax=Number(state.profile?.gradingScale)||10;state.grades.push({subject:String(g?.subject||'').trim(),grade:rawMax>targetMax?Math.round((rawGrade/rawMax)*targetMax*100)/100:rawGrade,max:targetMax,date:new Date().toISOString().slice(0,10)});});
    await sync(); render('academica'); alert('Lumi actualizó tu vida académica.');
  }catch(e){alert('No se pudo actualizar la vida académica.');}
}
function markdown(s){let x=esc(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/^### (.+)$/gm,'<strong>$1</strong>').replace(/^- (.+)$/gm,'• $1');return x.split(/\n\n+/).map(p=>'<p>'+p.replace(/\n/g,'<br>')+'</p>').join('')}
async function ask(message,which='ia',fromVoice=false,privateCall=false){
  const m=String(message||'').trim();
  if(!m||busy)return;
  if(which==='bienestar'&&lumiMediaCommand(m))return;
  if(which==='bienestar'&&!privateCall){state.wellbeing.messages.push({role:'user',text:m});render('bienestar')}
  else if(which!=='bienestar'){state.messages=state.messages||[];state.messages.push({role:'user',text:m});render('ia')}
  try{
    if(privateCall){
      const hist=(window.__lumiPrivateHistory||[]).slice(-12).map(x=>({role:x?.role==='model'||x?.role==='assistant'?'assistant':'user',content:String(x?.text||x?.content||'').slice(0,4000)})).filter(x=>x.content);
      const r=await fetch(AI_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:m,history:hist,mode:'private',user:{locale:navigator.language||'es-ES'}})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.reply)throw new Error('private_ai_failed');
      window.__lumiPrivateHistory=hist.concat([{role:'user',text:m},{role:'model',text:d.reply}]).slice(-12);
      await speakLumi(d.reply);
      return;
    }
    const hist=(which==='bienestar'?state.wellbeing.messages:state.messages).slice(-12);
    const r=await fetch('/api/v1/ai/tutor',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({message:m,history:hist,mode:which==='bienestar'?'bienestar':mode,privateCall:false})});
    const d=await r.json();
    if(!r.ok)throw 0;
    if(which==='bienestar'){state.wellbeing.messages.push({role:'model',text:d.reply});sync();render(which);if(fromVoice)speakLumi(d.reply)}
    else{state.messages.push({role:'model',text:d.reply});sync();render(which)}
  }catch{
    const t=which==='bienestar'?'Estoy aquí contigo. En este momento no pude obtener la respuesta completa, pero podemos intentarlo de nuevo. ¿Qué es lo que más te está pesando en este momento?':'No pude conectar con el Tutor IA. Comprueba tu conexión y vuelve a intentarlo.';
    if(privateCall){window.__lumiPrivateHistory=(window.__lumiPrivateHistory||[]).concat([{role:'user',text:m},{role:'model',text:t}]).slice(-12);await speakLumi(t);return}
    if(which==='bienestar'){state.wellbeing.messages.push({role:'model',text:t});render(which);if(fromVoice)speakLumi(t)}
    else{state.messages.push({role:'model',text:t});render(which)}
  }
}
function checkin(t){state.wellbeing.checkins.push({text:t,date:new Date().toISOString()});ask(t,'bienestar')}
async function requestSupport(topic){const detail=prompt('¿Qué necesitas?')||'';if(!detail)return;try{const r=await fetch('/api/v1/support/request',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({topic,detail})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error('support_failed');state.support.requests.push({topic,detail,status:d.status||'recibida',response:d.response||'',date:new Date().toISOString()});sync();toast('Solicitud recibida');render('apoyo');}catch{state.support.requests.push({topic,detail,status:'pendiente',date:new Date().toISOString()});sync();toast('Solicitud guardada localmente');render('apoyo');}}
function normSpeech(t){return String(t||'').toLowerCase().replace(new RegExp('[^\\p{L}\\p{N}]+','gu'),' ').replace(/\\s+/g,' ').trim()} function collapseSpeech(t){const w=String(t||'').trim().split(/\\s+/).filter(Boolean);if(w.length<2)return String(t||'').trim();const o=[];for(let i=0;i<w.length;){let n=1;for(let z=1;z<=Math.floor((w.length-i)/2);z++){let a=w.slice(i,i+z).map(normSpeech),j=i+z,r=1;while(j+z<=w.length&&w.slice(j,j+z).map(normSpeech).every((x,k)=>x===a[k])){r++;j+=z}if(r>1)n=Math.max(n,z*r)}o.push(w.slice(i,i+n).join(' '));i+=n}return o.join(' ').replace(/\\s+/g,' ').trim()} function mergeSpeech(a,b){a=String(a||'').trim();b=String(b||'').trim();if(!a)return b;if(!b)return a;const an=normSpeech(a),bn=normSpeech(b);if(an===bn||an.includes(bn))return a;if(bn.includes(an))return b;const aw=an.split(' '),bw=bn.split(' ');let k=0;for(let n=1;n<=Math.min(aw.length,bw.length);n++)if(aw.slice(-n).join(' ')===bw.slice(0,n).join(' '))k=n;return(a+' '+b.split(/\\s+/).slice(k).join(' ')).trim()} async function speakLumi(t){
  const x=String(t||'').replace(/[*#_]/g,'').replace(/\s+/g,' ').trim();
  if(!x)return;
  const resumeNative=()=>{if(window.__lumiAssistantActive&&window.AndroidLumi?.resumeAssistantMic)setTimeout(()=>window.AndroidLumi.resumeAssistantMic(),220)};
  voiceSpeaking=true;updateLumiCallUI();
  try{
    const r=await fetch(AI_ENDPOINT.replace(/\/chat$/,'/tts'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:x,voice:currentLumiVoice()})});
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.audioBase64){
      const bytes=Uint8Array.from(atob(d.audioBase64),c=>c.charCodeAt(0));
      const audio=new Audio(URL.createObjectURL(new Blob([bytes],{type:d.mimeType||'audio/wav'})));
      audio.onended=()=>{voiceSpeaking=false;updateLumiCallUI();URL.revokeObjectURL(audio.src);resumeNative();if(window.__lumiPrivateCallActive)setTimeout(startPrivateVoiceLoop,180);else if(voiceConversation)setTimeout(startVoiceLoop,180)};
      audio.onerror=()=>{voiceSpeaking=false;updateLumiCallUI();URL.revokeObjectURL(audio.src);resumeNative();if(window.__lumiPrivateCallActive)setTimeout(startPrivateVoiceLoop,120)};
      await audio.play();return;
    }
  }catch{}
  if(window.AndroidLumi&&typeof window.AndroidLumi.speak==='function'){try{window.AndroidLumi.speak(x);resumeNative();return}catch{}}
  try{
    if(window.speechSynthesis){
      speechSynthesis.cancel();
      const voices=speechSynthesis.getVoices();
      const v=voices.find(v=>/^es(-|_)/i.test(v.lang)&&/(Google|Microsoft|Natural|Neural)/i.test(v.name))||voices.find(v=>/^es(-|_)/i.test(v.lang));
      const u=new SpeechSynthesisUtterance(x);u.lang='es-ES';u.voice=v||null;u.rate=.90;u.pitch=.88;
      u.onend=()=>{voiceSpeaking=false;updateLumiCallUI();resumeNative();if(window.__lumiPrivateCallActive)setTimeout(startPrivateVoiceLoop,200);else if(voiceConversation)setTimeout(startVoiceLoop,150)};
      u.onerror=()=>{voiceSpeaking=false;updateLumiCallUI();resumeNative();if(window.__lumiPrivateCallActive)setTimeout(startPrivateVoiceLoop,150);else if(voiceConversation)setTimeout(startVoiceLoop,150)};
      speechSynthesis.speak(u);return;
    }
  }catch{}
  voiceSpeaking=false;updateLumiCallUI();resumeNative();if(window.__lumiPrivateCallActive)setTimeout(startPrivateVoiceLoop,200);else if(voiceConversation)setTimeout(startVoiceLoop,150)
}
function stopVoice(){voiceConversation=false;voiceActive=false;try{voiceSession?.stop()}catch{};voiceSession=null;try{speechSynthesis?.cancel()}catch{};voiceSpeaking=false} async function ensureLumiMic(){if(window.SpeechRecognition||window.webkitSpeechRecognition)return true;if(!navigator.mediaDevices?.getUserMedia)return true;try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(t=>t.stop());return true}catch(e){toast('Lumi necesita permiso para usar el micrófono. Revisa el permiso del sitio.');return false}}
function scheduleLumiVoiceRestart(privateMode=false,delay=260){clearTimeout(voiceRestartTimer);voiceRestartTimer=setTimeout(()=>{voiceRestartTimer=null;if(privateMode)startPrivateVoiceLoop();else startVoiceLoop()},delay)}
async function startVoiceLoop(){if(!voiceConversation||voiceSpeaking||voiceActive)return;const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast('Este navegador no admite reconocimiento de voz para Lumi.');voiceConversation=false;return}const r=new SR();voiceSession=r;r.lang='es-ES';r.continuous=false;r.interimResults=false;r.maxAlternatives=1;let text='',ended=false;voiceActive=true;updateLumiCallUI();r.onstart=()=>{updateLumiCallUI();toast('Lumi te escucha… habla ahora')};r.onresult=e=>{text=collapseSpeech(e.results?.[0]?.[0]?.transcript||'')};r.onerror=e=>{if(voiceSession!==r)return;ended=true;voiceActive=false;updateLumiCallUI();if(e?.error==='not-allowed'||e?.error==='service-not-allowed'){toast('El micrófono de Lumi no tiene permiso.');voiceConversation=false;return}if(e?.error==='audio-capture')toast('El navegador perdió la entrada de audio. Reintentando…')};r.onend=()=>{if(voiceSession!==r)return;voiceSession=null;voiceActive=false;updateLumiCallUI();const m=collapseSpeech(text);text='';if(m&&voiceConversation&&!voiceSpeaking){$('#wellmsg').value='';ask(m,'bienestar',true)}else if(voiceConversation&&!voiceSpeaking)scheduleLumiVoiceRestart(false,ended?500:250)};try{r.start()}catch{voiceActive=false;voiceSession=null;if(voiceConversation&&!voiceSpeaking)scheduleLumiVoiceRestart(false,600)}}
function startVoice(){if(voiceConversation||voiceActive){stopVoice();toast('He dejado de escuchar.');render('bienestar');return}voiceConversation=true;startVoiceLoop();render('bienestar')}
function resumeLumiAfterVisibility(){if(document.visibilityState!=='visible')return;if(window.__lumiPrivateCallActive&&!window.__lumiCallMuted&&!voiceSpeaking&&!voiceActive)setTimeout(startPrivateVoiceLoop,250);else if(voiceConversation&&!voiceSpeaking&&!voiceActive)setTimeout(startVoiceLoop,250)}
document.addEventListener('visibilitychange',resumeLumiAfterVisibility);window.addEventListener('pageshow',resumeLumiAfterVisibility);window.addEventListener('focus',resumeLumiAfterVisibility);
function privateCallStyle(){if($('#lumiCallStyle'))return;const s=document.createElement('style');s.id='lumiCallStyle';s.textContent='.lumi-call{position:fixed;inset:0;z-index:9999;background:rgba(7,15,28,.96);display:flex;align-items:center;justify-content:center;padding:24px}.lumi-call.hidden{display:none}.lumi-call-card{width:min(520px,100%);min-height:78vh;border-radius:28px;padding:28px 22px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;background:linear-gradient(180deg,#18304a,#0b1727);color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.45)}.lumi-call-badge{font-size:13px;opacity:.78;letter-spacing:.04em}.lumi-call-avatar{width:116px;height:116px;border-radius:50%;display:grid;place-items:center;font-size:52px;background:radial-gradient(circle at 35% 30%,#d9fff1,#78d8ba 45%,#317f70);box-shadow:0 0 0 10px rgba(120,216,186,.10),0 0 55px rgba(120,216,186,.35);transition:transform .25s,box-shadow .25s}.lumi-call-avatar.speaking{transform:scale(1.06);box-shadow:0 0 0 16px rgba(120,216,186,.12),0 0 70px rgba(120,216,186,.55)}.lumi-call-status{text-align:center;font-size:17px;margin-top:18px}.lumi-call-privacy{text-align:center;max-width:390px;font-size:13px;line-height:1.45;opacity:.72}.lumi-call-controls{display:flex;gap:16px;align-items:center}.lumi-call-btn{border:0;border-radius:999px;padding:14px 20px;font-size:15px;cursor:pointer}.lumi-call-end{background:#d9535f;color:#fff;min-width:120px}.lumi-call-mute{background:rgba(255,255,255,.12);color:#fff}.lumi-call-time{font-variant-numeric:tabular-nums;opacity:.72;font-size:13px}.lumi-call-live{animation:lumiPulse 1.35s ease-in-out infinite}@keyframes lumiPulse{50%{transform:scale(1.03)}}';
document.head.appendChild(s)}
function openLumiCall(){if(voiceConversation)stopVoice();privateCallStyle();let el=$('#lumiCall');if(!el){el=document.createElement('div');el.id='lumiCall';el.className='lumi-call hidden';el.innerHTML='<div class="lumi-call-card"><div><div class="lumi-call-badge">LUMI · CONVERSACIÓN PRIVADA</div><div id="lumiCallTime" class="lumi-call-time">00:00</div></div><div style="text-align:center"><div id="lumiCallAvatar" class="lumi-call-avatar">💚</div><div id="lumiCallStatus" class="lumi-call-status">Conectando con Lumi…</div></div><div class="lumi-call-privacy">Esta conversación no se muestra como mensajes ni se guarda como transcripción en tu historial de Education. El audio se procesa para generar las respuestas.</div><div class="lumi-call-controls"><button class="lumi-call-btn lumi-call-mute" id="lumiCallMute">🎙️ Silenciar</button><button class="lumi-call-btn lumi-call-end" id="lumiCallEnd">☎ Finalizar</button></div></div>';document.body.appendChild(el);$('#lumiCallEnd').onclick=endLumiCall;$('#lumiCallMute').onclick=toggleLumiCallMute}el.classList.remove('hidden');window.__lumiPrivateCallActive=true;window.__lumiPrivateHistory=[];window.__lumiCallStartedAt=Date.now();window.__lumiCallMuted=false;updateLumiCallUI();startPrivateVoiceLoop();const timer=setInterval(()=>{if(!window.__lumiPrivateCallActive){clearInterval(timer);return}const sec=Math.floor((Date.now()-window.__lumiCallStartedAt)/1000),m=String(Math.floor(sec/60)).padStart(2,'0'),s=String(sec%60).padStart(2,'0');if($('#lumiCallTime'))$('#lumiCallTime').textContent=m+':'+s},1000)}
function updateLumiCallUI(){const st=$('#lumiCallStatus'),av=$('#lumiCallAvatar'),mute=$('#lumiCallMute');if(!st||!av)return;if(window.__lumiPrivateCallActive){st.textContent=voiceSpeaking?'Lumi está hablando…':voiceActive?'Lumi te escucha…':'Lumi está pensando…';av.classList.toggle('speaking',voiceSpeaking);av.classList.toggle('lumi-call-live',voiceActive||voiceSpeaking)}if(mute)mute.textContent=window.__lumiCallMuted?'🔇 Activar micrófono':'🎙️ Silenciar'}
function toggleLumiCallMute(){if(!window.__lumiPrivateCallActive)return;window.__lumiCallMuted=!window.__lumiCallMuted;if(window.__lumiCallMuted){try{voiceSession?.stop()}catch{};voiceSession=null;voiceActive=false}else startPrivateVoiceLoop();updateLumiCallUI()}
function endLumiCall(){window.__lumiPrivateCallActive=false;window.__lumiPrivateHistory=[];window.__lumiCallMuted=false;try{voiceSession?.stop()}catch{};voiceSession=null;voiceActive=false;try{speechSynthesis?.cancel()}catch{};voiceSpeaking=false;const el=$('#lumiCall');if(el)el.classList.add('hidden');updateLumiCallUI();toast('Llamada con Lumi finalizada.')}
async function startPrivateVoiceLoop(){if(!window.__lumiPrivateCallActive||window.__lumiCallMuted||voiceSpeaking||voiceActive)return;const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast('Este navegador no admite llamadas de voz.');endLumiCall();return}const r=new SR();voiceSession=r;r.lang='es-ES';r.continuous=false;r.interimResults=false;r.maxAlternatives=1;let text='',ended=false;voiceActive=true;updateLumiCallUI();r.onstart=()=>{updateLumiCallUI();toast('Lumi te escucha…')};r.onresult=e=>{text=collapseSpeech(e.results?.[0]?.[0]?.transcript||'')};r.onerror=e=>{if(voiceSession!==r)return;ended=true;voiceActive=false;updateLumiCallUI();if(e?.error==='not-allowed'||e?.error==='service-not-allowed'){toast('El micrófono de la llamada no tiene permiso.');return}if(e?.error==='audio-capture')toast('La entrada de audio se perdió. Recuperando micrófono…')};r.onend=()=>{if(voiceSession!==r)return;voiceSession=null;voiceActive=false;updateLumiCallUI();const m=collapseSpeech(text);text='';if(m&&window.__lumiPrivateCallActive&&!window.__lumiCallMuted&&!voiceSpeaking)ask(m,'bienestar',false,true);else if(window.__lumiPrivateCallActive&&!window.__lumiCallMuted&&!voiceSpeaking)scheduleLumiVoiceRestart(true,ended?700:250)};try{r.start()}catch{voiceActive=false;voiceSession=null;updateLumiCallUI();if(window.__lumiPrivateCallActive&&!window.__lumiCallMuted)scheduleLumiVoiceRestart(true,700)}}
function startVoice(){if(voiceConversation||voiceActive){stopVoice();toast('He dejado de escuchar.');render('bienestar');return}voiceConversation=true;startVoiceLoop();render('bienestar')}
  window.__lumiEducation.startVoice=startVoice;
  window.__lumiEducation.stopVoice=stopVoice;
  window.__lumiEducation.openLumiCall=openLumiCall;
  window.__lumiEducation.endLumiCall=endLumiCall;
  window.__lumiEducation.toggleLumiCallMute=toggleLumiCallMute;
  window.__lumiEducation.chooseLumiVoice=chooseLumiVoice;
  window.__lumiEducation.setLumiVoice=setLumiVoice;
  window.__lumiEducation.speakLumi=speakLumi;
  window.__lumiEducation.openMedia=openMedia;
  window.__lumiEducation.setMood=setMood;
  window.__lumiEducation.ask=ask;
  window.__lumiEducation.lumiMediaCommand=lumiMediaCommand;
})();