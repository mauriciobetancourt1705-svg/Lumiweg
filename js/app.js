/* ============================================================================
   Lumiweg — UI + orquestación
   ----------------------------------------------------------------------------
   Antes: AI_ENDPOINT='' → askAI() devolvía null siempre → todo caía en brain(),
   un matcher de regex con respuestas fijas. No había IA.
   Ahora: la UI habla con LumiCore (cerebro multi-proveedor) y LumiDevice
   (control del teléfono).
   ========================================================================== */

const Lumi = (() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem('lumi_' + k)) ?? d; } catch { return d; } };
  const set = (k, v) => { try { localStorage.setItem('lumi_' + k, JSON.stringify(v)); } catch {} };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const now = () => new Date();
  const hm = () => now().toTimeString().slice(0, 5);
  const pad = n => String(n).padStart(2, '0');

  /* ---------------- estado ---------------- */
  let cfg = get('cfg', { name: '', accent: '#7fe3ff', memory: true, voiceReplies: false, notify: true });
  if (!cfg || typeof cfg !== 'object') cfg = {};
  cfg = {
    name: typeof cfg.name === 'string' ? cfg.name : '',
    accent: typeof cfg.accent === 'string' ? cfg.accent : '#7fe3ff',
    memory: cfg.memory !== false,
    voiceReplies: cfg.voiceReplies === true,
    notify: cfg.notify !== false
  };
  let tasks = get('tasks', []); if (!Array.isArray(tasks)) tasks = [];
  let events = get('events', []); if (!Array.isArray(events)) events = [];
  let chat = get('chat', []); if (!Array.isArray(chat)) chat = [];
  let month = 0, day = null, ocupado = false;

  const name = () => cfg.name || 'Mau';

  /* ---------------- utilidades de UI ---------------- */
  function toast(m) {
    const t = $('#toast'); if (!t) return;
    t.textContent = m; t.classList.add('show');
    clearTimeout(t._x); t._x = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function apply() {
    document.documentElement.style.setProperty('--accent', cfg.accent);
    if ($('#homeName')) $('#homeName').textContent = name();
    if ($('#setName')) $('#setName').value = cfg.name || '';
    $$('.sw').forEach(x => x.classList.toggle('on', !!cfg[x.dataset.k]));
  }

  function go(id) {
    $$('.screen').forEach(x => x.classList.remove('active'));
    const e = $('#' + id); if (e) e.classList.add('active');
    $$('.navbar button').forEach(b => b.classList.toggle('active', b.dataset.s === id));
    if (id === 's-chat') renderChat(true);
    if (id === 's-tasks') renderTasks();
    if (id === 's-cal') renderCal();
    if (id === 's-media') renderPlaylist();
    if (id === 's-well') renderMood();
    if (id === 's-ai') renderAI();
    if (id === 's-perms') renderPerms();
    if (id === 's-voice') loadVoices();
    const sc = $('#' + id); if (sc) sc.scrollTop = 0;
  }

  /* ================================================================
     CHAT — aquí vive la IA de verdad
     ================================================================ */
  function push(who, text, extra) {
    chat.push({ who, text: String(text || ''), t: hm(), extra: extra || null });
    if (cfg.memory) set('chat', chat);
  }

  function burbuja(m) {
    const d = document.createElement('div');
    d.className = 'msg ' + m.who;
    let html = esc(m.text).replace(/\n/g, '<br>');
    if (m.extra && m.extra.herramientas && m.extra.herramientas.length) {
      html += '<div class="tools">' + m.extra.herramientas.map(h =>
        '<span class="toolchip ' + (h.ok ? 'ok' : 'bad') + '">' + (h.ok ? '✓' : '✕') + ' ' + esc(h.nombre) + '</span>'
      ).join('') + '</div>';
    }
    if (m.extra && m.extra.local) html += '<div class="aviso">Sin conexión con los motores de IA · respuesta local</div>';
    d.innerHTML = html + '<span class="t">' + esc(m.t) + '</span>';
    return d;
  }

  function renderChat(scroll) {
    const b = $('#chatbox'); if (!b) return;
    b.innerHTML = '';
    if (!chat.length) {
      push('lumi', '¡Hola ' + name() + '! ✨ Soy Lumi. Puedo conversar, ayudarte con el estudio, acompañarte, y también hacer cosas en tu teléfono: mandar mensajes, poner alarmas, abrir apps, leer tus notificaciones. ¿Qué necesitas?');
    }
    chat.forEach(m => b.appendChild(burbuja(m)));
    if (scroll) b.scrollTop = b.scrollHeight;
  }

  function burbujaTrabajando(texto) {
    const b = $('#chatbox'); if (!b) return null;
    const d = document.createElement('div');
    d.className = 'msg lumi trabajando';
    d.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> ' + esc(texto);
    b.appendChild(d); b.scrollTop = b.scrollHeight;
    return d;
  }

  async function send() {
    const i = $('#chatIn');
    const t = i && i.value.trim();
    if (!t || ocupado) return;
    ocupado = true;
    push('user', t);
    if (i) i.value = '';
    renderChat(true);
    const aviso = burbujaTrabajando('Conectando con Lumi…');
    let res;
    try {
      res = await LumiCore.preguntar(t, chat.slice(0, -1), {
        herramientas: LumiDevice.esquemas(),
        ejecutarHerramienta: LumiDevice.ejecutar,
        contexto: LumiDevice.contexto(),
        contextoUsuario: contextoPersonal(),
        onIntento: (prov, model) => {
          if (aviso) aviso.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> ' + esc('Consultando ' + prov + ' (' + model + ')…');
        }
      });
    } catch (e) {
      console.error('[Lumi send]', e);
      res = {
        texto: 'Tuve un problema al conectar con los motores de IA. Revisa Motores de IA → Estado de cada motor y prueba de nuevo. Detalle: ' + String(e && e.message || e).slice(0, 140),
        local: true, rastro: []
      };
    } finally {
      if (aviso) aviso.remove();
      ocupado = false;
    }
    if (!res || !res.texto) {
      res = { texto: 'No recibí una respuesta del motor. Abre Motores de IA y revisa la salud del proveedor seleccionado.', local: true, rastro: [] };
    }
    if (callMode) setCallVisualState('speaking', 'Lumi está respondiendo…');
    const herramientas = (res.rastro || []).map(r => ({
      nombre: r.herramienta,
      ok: !(r.resultado && r.resultado.ok === false)
    }));
    push('lumi', res.texto, {
      herramientas, local: !!res.local,
      proveedor: res.proveedor || null, modelo: res.modelo || null
    });
    renderChat(true);
    if ((cfg.voiceReplies || callMode) && res.texto) speak(res.texto);
  }

  function contextoPersonal() {
    const pend = tasks.filter(t => !t.done).map(t => t.text).slice(0, 10);
    const prox = events.slice(0, 6).map(e => e.d + ' ' + e.time + ' ' + e.text);
    const partes = ['Nombre: ' + name() + '.', 'Fecha y hora: ' + now().toLocaleString('es-ES') + '.'];
    if (pend.length) partes.push('Tareas pendientes: ' + pend.join('; ') + '.');
    if (prox.length) partes.push('Próximos eventos: ' + prox.join('; ') + '.');
    return partes.join(' ');
  }

  function clearChat() {
    chat = []; set('chat', chat); renderChat(true); toast('Conversación limpiada ✨');
  }

  /* ================================================================
     VOZ
     ================================================================ */
  let rec = null;
  let callMode = false;
  let voiceCatalog = [];
  function toggleVoice() {
    if (callMode) { stopCall(); return; }
    // En el APK la voz usa el reconocedor nativo de Android: el WebView no
    // implementa la Web Speech API, así que la ruta web solo sirve en Chrome.
    if (LumiDevice.hayNativo()) {
      const r = LumiDevice.invocar('startListening');
      if (r && r.ok) { const v = $('#voiceState'); if (v) v.textContent = 'Escuchando…'; return; }
      if (r && r.error === 'permiso') { toast('Falta el permiso de micrófono'); return; }
    }
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) { toast('La voz necesita Chrome o el APK'); return; }
    if (rec) { try { rec.stop(); } catch {} return; }
    try { rec = new R(); } catch { rec = null; toast('No se pudo iniciar la voz'); return; }
    rec.lang = 'es-ES'; rec.continuous = false; rec.interimResults = true;
    rec.onstart = () => { const v = $('#voiceState'); if (v) v.textContent = 'Escuchando…'; };
    rec.onresult = e => {
      const txt = [...e.results].map(r => r[0].transcript).join('');
      const vt = $('#voiceText'); if (vt) vt.textContent = txt;
      if (e.results[e.results.length - 1].isFinal) {
        if ($('#chatIn')) $('#chatIn').value = txt;
        go('s-chat'); setTimeout(send, 120);
      }
    };
    rec.onerror = e => toast('La voz falló: ' + (e && e.error ? e.error : 'error'));
    rec.onend = () => { rec = null; const v = $('#voiceState'); if (v) v.textContent = 'Toca el orbe para hablar'; };
    try { rec.start(); } catch { rec = null; toast('El navegador bloqueó el micrófono'); }
  }

  function startDictation() { go('s-voice'); setTimeout(toggleVoice, 350); }

  function startCall() {
    if (callMode) return;
    callMode = true;
    document.body.classList.add('call-active');
    setCallVisualState('listening', 'Lumi está escuchando. Habla con naturalidad.');
    cfg.voiceReplies = true;
    set('cfg', cfg);
    const v = $('#voiceState'); if (v) v.textContent = 'Preparando llamada…';
    const b = $('#callBtn'); if (b) b.textContent = '⏹ Terminar llamada';
    go('s-voice');
    if (LumiDevice.hayNativo()) {
      const r = LumiDevice.invocar('startListening');
      if (r && r.ok) { onVoiceState('Lumi está escuchando. Habla con naturalidad.'); return; }
      callMode = false;
      if (b) b.textContent = '📞 Iniciar llamada con Lumi';
      toast(r && r.error === 'permiso' ? 'Concede el permiso de micrófono' : 'No se pudo iniciar la escucha');
      return;
    }
    callMode = false;
    if (b) b.textContent = '📞 Iniciar llamada con Lumi';
    toast('La llamada continua necesita el APK de Android');
  }

  function stopCall() {
    callMode = false;
    document.body.classList.remove('call-active', 'listening', 'thinking', 'speaking');
    try { if (LumiDevice.hayNativo()) LumiDevice.invocar('stopListening'); } catch {}
    try { if (LumiDevice.hayNativo()) LumiDevice.invocar('stopSpeaking'); } catch {}
    const b = $('#callBtn'); if (b) b.textContent = '📞 Iniciar llamada con Lumi';
    onVoiceState('Llamada finalizada');
  }

  function onSpeechFinished() {
    if (!callMode) return;
    setCallVisualState('listening', 'Lumi te escucha');
    // El TTS terminó: reabrir el micrófono para el siguiente turno.
    setTimeout(() => {
      if (!callMode || ocupado) return;
      const r = LumiDevice.invocar('startListening');
      if (!r || !r.ok) onVoiceState('No pude reactivar el micrófono. Toca para reintentar.');
    }, 350);
  }

  function onVoiceRecognitionError() {
    if (!callMode) return;
    onVoiceState('No te escuché; vuelvo a intentarlo…');
    setTimeout(() => {
      if (!callMode || ocupado) return;
      const r = LumiDevice.invocar('startListening');
      if (!r || !r.ok) onVoiceState('No pude reactivar el micrófono.');
    }, 900);
  }

  function loadVoices() {
    const select = $('#voiceSelect');
    if (!select) return;
    if (!LumiDevice.hayNativo() || !window.LumiNative || typeof window.LumiNative.getVoices !== 'function') {
      select.innerHTML = '<option value="">Voces del sistema disponibles en el APK</option>';
      return;
    }
    try {
      const raw = window.LumiNative.getVoices();
      voiceCatalog = JSON.parse(raw || '[]');
      if (!voiceCatalog.length) {
        select.innerHTML = '<option value="">No se encontraron voces españolas instaladas</option>';
        return;
      }
      const saved = localStorage.getItem('lumi_tts_voice') || '';
      select.innerHTML = voiceCatalog.map(v => '<option value="' + esc(v.name) + '">' +
        esc(v.name) + (v.network ? ' · online' : ' · local') + '</option>').join('');
      if (saved && voiceCatalog.some(v => v.name === saved)) select.value = saved;
      select.onchange = () => {
        const ok = window.LumiNative.setVoice(select.value);
        if (ok) { localStorage.setItem('lumi_tts_voice', select.value); toast('Voz de Lumi actualizada'); }
        else toast('Android no pudo cambiar la voz');
      };
    } catch { select.innerHTML = '<option value="">No se pudieron cargar las voces</option>'; }
  }

  /* Llamadas desde el lado nativo (MainActivity.java) */
  function setCallVisualState(state, label) {
    document.body.classList.remove('listening', 'thinking', 'speaking');
    if (callMode) document.body.classList.add(state);
    const s = $('#avatarStatus'); if (s) s.textContent = label || state;
  }

  function onVoiceState(txt) {
    const low = String(txt || '').toLowerCase();
    if (callMode) {
      if (/escuch|micrófono|microfono|reintentar/.test(low)) setCallVisualState('listening', txt);
      else if (/pensando|consultando|procesando/.test(low)) setCallVisualState('thinking', txt);
      else setCallVisualState('listening', txt);
    }
    const v = $('#voiceState'); if (v) v.textContent = String(txt || '');
    const t = $('#voiceText'); if (t) t.textContent = String(txt || '');
  }
  function onVoiceResult(txt) {
    const limpio = String(txt || '').trim();
    if (!limpio) { onVoiceState('No entendí nada'); return; }
    onVoiceState(limpio);
    if ($('#chatIn')) $('#chatIn').value = limpio;
    if (!callMode) go('s-chat');
    setTimeout(send, 150);
  }

  function speak(t) {
    if (callMode) setCallVisualState('speaking', 'Lumi está hablando…');
    if (LumiDevice.hayNativo()) { LumiDevice.invocar('speak', String(t || '')); return; }
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(String(t || ''));
    u.lang = 'es-ES';
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }

  function speakTest() { speak('Hola ' + name() + '. Soy Lumi, tu asistente personal total.'); }

  /* ================================================================
     TAREAS
     ================================================================ */
  function renderTasks() {
    const e = $('#taskList'); if (!e) return;
    e.innerHTML = tasks.length ? '' : '<p class="sub">Sin tareas. ¡Todo bajo control! 🎉</p>';
    tasks.forEach((t, i) => {
      if (!t || typeof t !== 'object') return;
      e.insertAdjacentHTML('beforeend',
        '<div class="task' + (t.done ? ' done' : '') + '"><div class="ck" onclick="Lumi.checkTask(' + i + ')">✔</div>' +
        '<span>' + esc(t.text || '') + '</span><button class="del" onclick="Lumi.delTask(' + i + ')">✕</button></div>');
    });
  }
  function addTask() { const i = $('#taskIn'); if (!i || !i.value.trim()) return; addTaskFrom(i.value.trim()); i.value = ''; toast('Tarea agregada ✅'); }
  function addTaskFrom(t) { t = String(t == null ? '' : t).trim(); if (!t) return; tasks.push({ text: t, done: false }); set('tasks', tasks); renderTasks(); }
  function checkTask(i) { if (!tasks[i]) return; tasks[i].done = !tasks[i].done; set('tasks', tasks); renderTasks(); }
  function delTask(i) { tasks.splice(i, 1); set('tasks', tasks); renderTasks(); }

  /* ================================================================
     CALENDARIO
     ================================================================ */
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function shiftMonth(n) { month += n; renderCal(); }

  function renderCal() {
    const g = $('#calGrid'); if (!g) return;
    const base = new Date(now().getFullYear(), now().getMonth() + month, 1);
    const y = base.getFullYear(), mo = base.getMonth();
    if ($('#calTitle')) $('#calTitle').textContent = MONTHS[mo] + ' ' + y;
    g.innerHTML = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => '<div class="hd">' + x + '</div>').join('');
    const first = (new Date(y, mo, 1).getDay() + 6) % 7;
    const days = new Date(y, mo + 1, 0).getDate();
    const hoy = now().getFullYear() + '-' + pad(now().getMonth() + 1) + '-' + pad(now().getDate());
    for (let i = 0; i < first; i++) g.insertAdjacentHTML('beforeend', '<div class="d"></div>');
    for (let d = 1; d <= days; d++) {
      const k = y + '-' + pad(mo + 1) + '-' + pad(d);
      const el = document.createElement('div');
      el.className = 'd' + (k === hoy && month === 0 ? ' today' : '') + (events.some(v => v.d === k) ? ' has' : '') + (day === k ? ' sel' : '');
      el.textContent = d;
      el.onclick = () => { day = day === k ? null : k; renderCal(); };
      g.appendChild(el);
    }
    const l = $('#eventList'); if (!l) return;
    l.innerHTML = '';
    const lista = day
      ? events.map((e, i) => ({ e, i })).filter(x => x.e.d === day)
      : events.map((e, i) => ({ e, i })).filter(x => String(x.e.d).startsWith(y + '-' + pad(mo + 1)));
    lista.forEach(x => l.insertAdjacentHTML('beforeend',
      '<div class="event"><button class="del" onclick="Lumi.delEvent(' + x.i + ')">✕</button><b>' + esc(x.e.time) + '</b> · ' + esc(x.e.text) + '</div>'));
    if (!lista.length) l.insertAdjacentHTML('beforeend', '<p class="sub">Sin eventos. ¡Agenda algo bonito! 📅</p>');
  }

  function addEvent() {
    const i = $('#eventIn'); if (!i) return;
    const v = i.value.trim();
    const m = v.match(/(\d{1,2})\s+(\d{1,2}:\d{2}|todo el día)\s+(.+)/i) || v.match(/(\d{1,2})\s+(.+)/);
    if (!m) { toast('Formato: 15 18:00 Gimnasio'); return; }
    const base = new Date(now().getFullYear(), now().getMonth() + month, 1);
    const dia = Number(m[1]);
    const max = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    if (dia < 1 || dia > max) { toast('Ese día no existe en el mes seleccionado'); return; }
    events.push({
      d: base.getFullYear() + '-' + pad(base.getMonth() + 1) + '-' + pad(dia),
      time: m.length === 4 ? m[2] : 'todo el día',
      text: m.length === 4 ? m[3] : m[2]
    });
    set('events', events); i.value = ''; renderCal(); toast('Evento agendado 📅');
  }
  function delEvent(i) { events.splice(i, 1); set('events', events); renderCal(); }

  /* ================================================================
     MULTIMEDIA
     ================================================================ */
  const TRACKS = [
    ['🎵', 'Música para concentrarte', 'Focus · 24 min'],
    ['🌙', 'Música relajante para dormir', 'Ambient · 42 min'],
    ['🌲', 'Lo mejor de la naturaleza', 'Sonidos · 31 min'],
    ['✨', 'Playlist motivacional', 'Playlist · 18 min']
  ];
  let cur = 0, playing = false, prog = 0, timer = null;
  function renderPlaylist() {
    if (!$('#playlist')) return;
    $('#playerTitle').textContent = TRACKS[cur][1];
    $('#playerArt').textContent = TRACKS[cur][0];
    $('#playlist').innerHTML = TRACKS.map((t, i) =>
      '<div class="track' + (i === cur ? ' playing' : '') + '"><span>' + t[0] + '</span><div class="ti">' + t[1] + '<small>' + t[2] + '</small></div><span>▶️</span></div>').join('');
    $$('.track').forEach((e, i) => e.onclick = () => { cur = i; prog = 0; renderPlaylist(); });
  }
  function togglePlay() {
    playing = !playing;
    if ($('#playBtn')) $('#playBtn').textContent = playing ? '⏸️' : '▶️';
    clearInterval(timer);
    if (playing) timer = setInterval(() => { prog = Math.min(100, prog + 1); if ($('#pbar')) $('#pbar').style.width = prog + '%'; if (prog >= 100) nextTrack(); }, 1000);
  }
  function nextTrack() { cur = (cur + 1) % TRACKS.length; prog = 0; renderPlaylist(); }
  function prevTrack() { cur = (cur - 1 + TRACKS.length) % TRACKS.length; prog = 0; renderPlaylist(); }

  /* ================================================================
     BIENESTAR
     ================================================================ */
  let breathing = false, bTimer = null;
  function toggleBreath() {
    breathing = !breathing;
    if ($('#breathBtn')) $('#breathBtn').textContent = breathing ? 'Detener' : 'Comenzar respiración guiada';
    clearTimeout(bTimer);
    if (!breathing) { $('#breathCircle').classList.remove('in'); return; }
    const ciclo = () => {
      if (!breathing) return;
      $('#breathCircle').classList.add('in'); $('#breathLabel').textContent = 'Inhala…';
      bTimer = setTimeout(() => {
        $('#breathCircle').classList.remove('in'); $('#breathLabel').textContent = 'Exhala…';
        bTimer = setTimeout(ciclo, 4000);
      }, 4000);
    };
    ciclo();
  }

  function mood(m) {
    const l = get('bienestar', { checkins: [] });
    const hoy = now().toISOString().slice(0, 10);
    l.checkins = (l.checkins || []).filter(x => x.date !== hoy);
    l.checkins.push({ date: hoy, emoji: m, nota: '' });
    set('bienestar', l);
    renderMood();
    toast('Registré tu ánimo ' + m + ' 💜');
  }
  function renderMood() {
    const l = get('bienestar', { checkins: [] });
    const c = (l.checkins || []);
    const el = $('#moodLog'); if (!el) return;
    if (!c.length) { el.textContent = 'Aún no registras tu ánimo hoy.'; return; }
    const ult = c[c.length - 1];
    const prom = k => { const v = c.slice(-14).map(x => Number(x[k])).filter(Number.isFinite); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—'; };
    el.textContent = 'Último registro: ' + (ult.emoji || '') + ' · ' + ult.date + '  |  Media 14 días → ánimo ' + prom('animo') + ' · estrés ' + prom('estres');
  }
  function wellMsg(k) {
    const m = {
      'Escucha activa': 'Te escucho sin juzgar, ' + name() + '. Cuéntame lo que necesites.',
      'Consejos personalizados': 'Divide tus metas en pasos pequeños. Cada paso cuenta.',
      'Motivación diaria': 'El éxito es la suma de pequeños esfuerzos repetidos cada día.'
    };
    toast(m[k] || 'Estoy aquí para ti 💜');
    speak(m[k] || '');
  }

  /* ================================================================
     ACCIONES RÁPIDAS / APPS
     ================================================================ */
  const EXTERNAL_APPS = {
    WhatsApp: 'https://wa.me/', YouTube: 'https://www.youtube.com/', Correo: 'https://mail.google.com/',
    Navegador: 'https://www.google.com/', Instagram: 'https://www.instagram.com/', TikTok: 'https://www.tiktok.com/',
    Facebook: 'https://www.facebook.com/', Gmail: 'https://mail.google.com/', Telegram: 'https://t.me/',
    Spotify: 'https://open.spotify.com/', Netflix: 'https://www.netflix.com/', Maps: 'https://maps.google.com/',
    'Play Store': 'https://play.google.com/store', Drive: 'https://drive.google.com/', Noticias: 'https://news.google.com/'
  };

  function openExternal(label) {
    // En Android intenta abrir la app real; si no, cae a la URL.
    if (LumiDevice.hayNativo()) {
      const r = LumiDevice.invocar('openApp', label);
      if (r && r.ok) return;
    }
    const url = EXTERNAL_APPS[label];
    if (!url) { toast('No tengo configurado ' + label); return; }
    if (LumiDevice.hayNativo()) { LumiDevice.invocar('openExternalApp', url, ''); return; }
    const w = window.open(url, '_blank'); if (!w) location.href = url;
  }

  function grid(id, items) {
    const e = $(id); if (!e) return;
    e.innerHTML = '';
    items.forEach(([ic, l]) => {
      const d = document.createElement('div');
      d.className = 'card';
      d.innerHTML = '<div class="ci">' + ic + '</div><p>' + esc(l) + '</p>';
      d.onclick = () => {
        const m = { Apps: 's-apps', Multimedia: 's-media', Calendario: 's-cal', Tareas: 's-tasks', Recordatorios: 's-tasks', Ajustes: 's-set', 'IA': 's-ai', Permisos: 's-perms' };
        if (m[l]) go(m[l]); else openExternal(l);
      };
      e.appendChild(d);
    });
  }

  const ACTIONS = [
    ['💬', 'WhatsApp'], ['▶️', 'YouTube'], ['✉️', 'Correo'], ['🌐', 'Navegador'],
    ['📱', 'Apps'], ['🎵', 'Multimedia'], ['📅', 'Calendario'], ['⏰', 'Recordatorios'],
    ['✅', 'Tareas'], ['🧠', 'IA'], ['🛡️', 'Permisos'], ['⚙️', 'Ajustes']
  ];
  const APPS = [
    ['💬', 'WhatsApp'], ['📸', 'Instagram'], ['🎵', 'TikTok'], ['👥', 'Facebook'],
    ['✉️', 'Gmail'], ['✈️', 'Telegram'], ['🎧', 'Spotify'], ['🎬', 'Netflix'],
    ['🗺️', 'Maps'], ['🛒', 'Play Store'], ['📁', 'Drive'], ['📖', 'Noticias']
  ];

  /* ================================================================
     AJUSTES · PROVEEDORES DE IA
     ================================================================ */
  const PROVIDER_LABELS = { kimi: 'Kimi · Moonshot', claude: 'Claude · Anthropic', openai: 'OpenAI', xai: 'Grok · xAI', gemini: 'Google Gemini', groq: 'Groq', deepseek: 'DeepSeek', openrouter: 'OpenRouter', cerebras: 'Cerebras', mistral: 'Mistral', together: 'Together AI', huggingface: 'Hugging Face' };
  function renderProviderOrder() {
    const el = $('#providerOrderList'); if (!el) return;
    const c = LumiCore.cfg();
    const defaults = LumiCore.DEFAULT_PROVIDER_ORDER || Object.keys(PROVIDER_LABELS);
    const order = [...(c.providerOrder || defaults)].filter((id, i, a) => PROVIDER_LABELS[id] && a.indexOf(id) === i);
    defaults.forEach(id => { if (!order.includes(id)) order.push(id); });
    c.providerOrder = order;
    LumiCore.guardarCfg(c);
    el.innerHTML = order.map((id, i) => '<div class="provider-order-item"><span class="order-num">' + (i + 1) + '</span><div class="order-name">' + esc(PROVIDER_LABELS[id]) + '<small class="order-note">' + (i === 0 ? 'Prioridad principal' : 'Respaldo ' + i) + '</small></div><button aria-label="Subir ' + esc(PROVIDER_LABELS[id]) + '" onclick="Lumi.moveProvider(\'' + id + '\',-1)" ' + (i === 0 ? 'disabled' : '') + '>↑</button><button aria-label="Bajar ' + esc(PROVIDER_LABELS[id]) + '" onclick="Lumi.moveProvider(\'' + id + '\',1)" ' + (i === order.length - 1 ? 'disabled' : '') + '>↓</button></div>').join('');
  }
  function moveProvider(id, delta) {
    const c = LumiCore.cfg();
    const order = [...(c.providerOrder || LumiCore.DEFAULT_PROVIDER_ORDER)];
    const i = order.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    c.providerOrder = order; LumiCore.guardarCfg(c); renderProviderOrder();
    toast('Prioridad actualizada: ' + PROVIDER_LABELS[order[0]]);
  }

  const PROVIDER_VAR = {
    groq:'GROQ_API_KEY', gemini:'GEMINI_API_KEY', openai:'OPENAI_API_KEY',
    claude:'ANTHROPIC_API_KEY', kimi:'MOONSHOT_API_KEY', deepseek:'DEEPSEEK_API_KEY',
    xai:'XAI_API_KEY', openrouter:'OPENROUTER_API_KEY', cerebras:'CEREBRAS_API_KEY',
    mistral:'MISTRAL_API_KEY', together:'TOGETHER_API_KEY', huggingface:'HF_TOKEN'
  };
  let backendProviders = [];
  let backendFetchBusy = false;

  function estadoTexto(p) {
    if (!p.configurado) return '<span class="health missing">● Falta clave en Railway</span>';
    const r = p.ultimoResultado;
    if (!r) return '<span class="health pending">● Configurada · sin prueba real</span>';
    if (r.estado === 'conectado') return '<span class="health good">● Conectado · ' + esc(r.latenciaMs || 0) + ' ms</span>';
    if (r.estado === 'sin_clave') return '<span class="health missing">● Falta clave en Railway</span>';
    if (r.estado === 'enfriamiento') return '<span class="health pending">● Última prueba reciente</span>';
    return '<span class="health bad">● Error ' + esc(r.codigoHttp || '') + ' · ' + esc(r.categoria || 'conexión') + '</span>';
  }

  function renderBackendProviderCards() {
    const cont = $('#backendProviderList'); if (!cont) return;
    const c = LumiCore.cfg();
    if (!backendProviders.length) {
      cont.innerHTML = '<p class="sub">Consultando los proveedores que reconoce Railway…</p>';
      return;
    }
    cont.innerHTML = backendProviders.map(p => {
      const id = String(p.id || '');
      const elegido = c.selectedProvider === id;
      const label = PROVIDER_LABELS[id] || id;
      const variable = p.variable || PROVIDER_VAR[id] || 'variable del proveedor';
      const r = p.ultimoResultado;
      const diagnostico = r ? '<div class="provider-diagnostic ' + (r.estado === 'conectado' ? 'diag-ok' : (r.estado === 'error' ? 'diag-error' : '')) + '">' +
        '<div class="diag-top"><b>' + (r.estado === 'conectado' ? 'Diagnóstico: conexión correcta' : r.estado === 'sin_clave' ? 'Diagnóstico: falta configuración' : 'Diagnóstico técnico') + '</b>' +
        (r.codigoHttp ? '<span class="diag-code">HTTP ' + esc(r.codigoHttp) + '</span>' : '') + '</div>' +
        '<p>' + esc(r.explicacion || r.estado || '') + '</p>' +
        (r.accion ? '<p class="diag-action"><b>Qué hacer:</b> ' + esc(r.accion) + '</p>' : '') +
        (r.modelo ? '<p class="diag-meta">Modelo probado: ' + esc(r.modelo) + '</p>' : '') +
        (r.comprobadoEn ? '<p class="diag-meta">Última prueba: ' + esc(new Date(r.comprobadoEn).toLocaleString('es-ES')) + '</p>' : '') +
        (r.latenciaMs != null ? '<p class="diag-meta">Tiempo de respuesta: ' + esc(r.latenciaMs) + ' ms</p>' : '') + '</div>' : '';
      return '<div class="prov' + (elegido ? ' on' : '') + '">' +
        '<div class="provhead"><div><b>' + esc(label) + '</b>' +
        (p.configurado ? '<span class="pill">clave detectada</span>' : '<span class="pill missing-pill">sin clave</span>') +
        '</div>' + estadoTexto(p) + '</div>' +
        '<p class="sub">Variable de Railway: <code>' + esc(variable) + '</code></p>' +
        '<p class="sub">Modelos sugeridos: ' + esc((p.modelosSugeridos || []).slice(0, 4).join(', ') || 'Se detectan desde la API') + '</p>' +
        diagnostico +
        '<div class="provrow">' +
        '<button class="btn small" onclick="Lumi.testBackendProvider(\'' + esc(id) + '\')">Probar salud real</button>' +
        '<button class="btn small ' + (elegido ? '' : 'ghost') + '" onclick="Lumi.selectBackendProvider(\'' + esc(id) + '\')" ' + (!p.configurado ? 'disabled' : '') + '>' + (elegido ? '✓ Motor elegido' : 'Usar este motor') + '</button>' +
        '</div></div>';
    }).join('');
  }

  async function refreshBackendProviders() {
    if (backendFetchBusy) return;
    backendFetchBusy = true;
    try {
      const data = await LumiCore.obtenerEstadoBackend();
      backendProviders = data.proveedores || [];
      const cfgNow = LumiCore.cfg();
      const select = $('#selectedBackendProvider');
      if (select) select.innerHTML = '<option value="auto">Automático · permitir respaldo</option>' +
        backendProviders.filter(p => p.configurado).map(p => '<option value="' + esc(p.id) + '">' + esc(PROVIDER_LABELS[p.id] || p.id) + '</option>').join('');
      if (select) select.value = cfgNow.selectedProvider || 'auto';
      const configured = backendProviders.filter(p => p.configurado).length;
      const selected = cfgNow.selectedProvider || 'auto';
      const resumen = $('#aiResumen');
      if (resumen) resumen.innerHTML = '<b>Backend conectado.</b> ' + configured + '/' + backendProviders.length +
        ' proveedores tienen clave configurada en Railway. Selección actual: ' +
        esc(selected === 'auto' ? 'Automático (con respaldo)' : (PROVIDER_LABELS[selected] || selected)) +
        '. Configurada no significa que ya haya superado una prueba real.';
      renderBackendProviderCards();
    } catch (e) {
      const cont = $('#backendProviderList');
      if (cont) cont.innerHTML = '<p class="sub bad">No pude consultar Railway: ' + esc(String(e && e.message || e)) + '</p><button class="btn small" onclick="Lumi.refreshBackendProviders()">Reintentar conexión</button>';
      const resumen = $('#aiResumen');
      if (resumen) resumen.textContent = 'No se pudo consultar el backend. Comprueba la URL y que el despliegue esté activo.';
    } finally { backendFetchBusy = false; }
  }

  function renderAI() {
    renderProviderOrder();
    const cont = $('#aiList'); if (!cont) return;
    const c = LumiCore.cfg();
    const lista = LumiCore.estado().filter(p => p.id === 'proxy');
    cont.innerHTML = lista.map(p => {
      const tiene = p.configurado;
      return '<div class="prov' + (tiene && p.activo ? ' on' : '') + '">' +
        '<div class="provhead"><div><b>' + esc(p.nombre) + '</b><span class="pill">GRATIS</span></div>' +
        '<span class="health ' + (tiene ? 'pending' : 'missing') + '">' + (tiene ? '● URL guardada' : '● Falta URL') + '</span></div>' +
        '<p class="sub">Las claves de cada motor permanecen en Railway, nunca en el teléfono.</p>' +
        '<input class="kin" id="url_proxy" inputmode="url" autocomplete="url" placeholder="https://tu-backend.up.railway.app" value="' + esc(c.proxyUrl || '') + '">' +
        '<div class="provrow"><button class="btn small" onclick="Lumi.setProxy(document.getElementById(\'url_proxy\').value);Lumi.refreshBackendProviders()">Guardar URL y consultar</button>' +
        '<button class="btn small ghost" onclick="Lumi.openLink(\'https://railway.com/project/2988aa13-56ed-4160-871d-d15ace444396/service/ea3c7282-80b5-4ed1-ae18-b13b460cf07d?environmentId=19723073-5f06-4b6b-b193-73e443e74a7e\')">Abrir Railway</button></div>' +
        '</div>';
    }).join('') +
    '<div class="sec">Motores disponibles en Railway</div>' +
    '<p class="sub">Cada motor tiene su propio estado y botón de prueba. Selecciona uno para usarlo; Automático permite que Lumi recurra a otros motores configurados si falla.</p>' +
    '<div class="prov"><div class="provhead"><b>Selección de motor</b><span class="health pending">Preferencia de chat</span></div>' +
    '<select class="kin" id="selectedBackendProvider" onchange="Lumi.selectBackendProvider(this.value)">' +
    '<option value="auto" ' + ((c.selectedProvider || 'auto') === 'auto' ? 'selected' : '') + '>Automático · permitir respaldo</option>' +
    backendProviders.filter(p => p.configurado).map(p => '<option value="' + esc(p.id) + '" ' + (c.selectedProvider === p.id ? 'selected' : '') + '>' + esc(PROVIDER_LABELS[p.id] || p.id) + '</option>').join('') +
    '</select></div>' +
    '<div id="backendProviderList"><p class="sub">Consultando los proveedores que reconoce Railway…</p></div>';
    renderBackendProviderCards();
    refreshBackendProviders();
  }

  function selectBackendProvider(id) {
    const c = LumiCore.cfg();
    c.selectedProvider = id || 'auto';
    LumiCore.guardarCfg(c);
    const select = $('#selectedBackendProvider');
    if (select) select.value = c.selectedProvider;
    renderBackendProviderCards();
    toast(c.selectedProvider === 'auto' ? 'Lumi usará el modo automático con respaldo.' : 'Motor seleccionado: ' + (PROVIDER_LABELS[c.selectedProvider] || c.selectedProvider));
  }

  async function testBackendProvider(id) {
    const el = $('#backendProviderList');
    const p = backendProviders.find(x => x.id === id);
    if (!p) { toast('No encuentro ese motor en Railway. Actualiza la lista.'); return; }
    if (!p.configurado) {
      toast('Falta ' + (p.variable || PROVIDER_VAR[id] || 'la clave') + ' en Railway.');
      return;
    }
    const idx = backendProviders.findIndex(x => x.id === id);
    backendProviders[idx] = { ...p, ultimoResultado: { estado: 'probando', explicacion: 'Enviando una petición real al proveedor…' } };
    renderBackendProviderCards();
    const result = await LumiCore.probarProveedorBackend(id);
    const nowP = backendProviders.find(x => x.id === id);
    if (nowP) nowP.ultimoResultado = {
      estado: result.estado || (result.ok ? 'conectado' : 'error'),
      explicacion: result.ok ? 'La API aceptó la clave y generó una respuesta real.' : (result.error || 'La prueba falló.'),
      accion: result.accion || '',
      categoria: result.categoria || '',
      codigoHttp: result.codigoHttp || 0,
      latenciaMs: result.ms || 0,
      comprobadoEn: result.comprobadoEn || new Date().toISOString(),
      modelo: result.modelo || ''
    };
    renderBackendProviderCards();
    const resumen = $('#aiResumen');
    if (resumen) resumen.innerHTML = '<b>' + esc(PROVIDER_LABELS[id] || id) + ':</b> ' +
      (result.ok ? 'conectado; respondió en ' + esc(result.ms) + ' ms.' : 'no respondió correctamente: ' + esc(result.error));
    toast(result.ok ? (PROVIDER_LABELS[id] || id) + ' funciona ✓' : 'Fallo de ' + (PROVIDER_LABELS[id] || id));
  }

  async function probarTodo() {
    const resumen = $('#aiResumen');
    if (resumen) resumen.textContent = 'Probando cada proveedor con una petición real. Esto puede tardar…';
    toast('Probando motores configurados…');
    for (const p of backendProviders.filter(x => x.configurado)) {
      await testBackendProvider(p.id);
    }
    if (!backendProviders.length) await refreshBackendProviders();
  }

  function saveKey(id) {
    const inp = $('#key_' + id);
    if (!inp || !inp.value.trim()) { toast('Escribe la clave primero'); return; }
    const c = LumiCore.cfg();
    c.keys[id] = inp.value.trim();
    c.enabled[id] = true;
    LumiCore.guardarCfg(c);
    inp.value = '';
    renderAI();
    toast('Clave guardada. Pulsa Probar para verificar.');
  }
  function toggleProvider(id) {
    const c = LumiCore.cfg();
    c.enabled[id] = !(c.enabled[id] !== false);
    LumiCore.guardarCfg(c);
    renderAI();
  }
  function setAccount(v) { const c = LumiCore.cfg(); c.accountId = String(v || '').trim(); LumiCore.guardarCfg(c); }
  function setProxy(v) {
    const c = LumiCore.cfg();
    c.proxyUrl = String(v || '').trim().replace(/\/+$/, '');
    c.enabled.proxy = true;
    LumiCore.guardarCfg(c);
    toast(c.proxyUrl ? 'URL del backend guardada en este teléfono (sin claves API).' : 'URL del backend eliminada.');
  }
  function openLink(u) {
    if (!u) return;
    if (LumiDevice.hayNativo()) LumiDevice.invocar('openExternalApp', u, '');
    else window.open(u, '_blank');
  }

  async function testProvider(id) {
    const st = $('#st_' + id);
    if (st) st.textContent = 'Probando…';
    const r = await LumiCore.probar(id);
    if (st) {
      st.textContent = r.ok
        ? '✓ Funciona · ' + r.modelo + ' · ' + r.ms + ' ms · ' + r.modelos_disponibles + ' modelos disponibles'
        : '✕ ' + (r.error || 'error');
      st.className = 'sub ' + (r.ok ? 'ok' : 'bad');
    }
    toast(r.ok ? 'Motor operativo ✓' : 'Falló: ' + (r.error || 'error'));
  }

  async function probarTodo() {
    const resumen = $('#aiResumen');
    if (resumen) resumen.textContent = 'Comprobando Railway y enviando peticiones reales a cada proveedor configurado…';
    toast('Probando conexiones reales…');
    const r = await LumiCore.probarBackendTodos();
    if (!r.backend) {
      if (resumen) resumen.textContent = '✕ Backend: ' + (r.error || 'no disponible');
      toast('No se pudo conectar con el backend');
      return;
    }
    const resultados = r.resultados || [];
    const correctos = resultados.filter(x => x.ok).length;
    const lineas = resultados.map(x => (x.ok ? '✓ ' : '✕ ') + (PROVIDER_LABELS[x.id] || x.id) + (x.ok ? ' · ' + x.ms + ' ms' : ' · ' + x.error));
    const faltanClaude = !r.proveedoresConfigurados.includes('claude');
    if (faltanClaude) lineas.push('○ Claude · falta añadir ANTHROPIC_API_KEY en Railway');
    if (resumen) resumen.innerHTML = '<b>Backend conectado.</b> Motores que respondieron: ' + correctos + '/' + resultados.length + '<br>' + lineas.map(esc).join('<br>');
    toast(correctos + '/' + resultados.length + ' motores respondieron');
  }

  /* ================================================================
     AJUSTES · PERMISOS Y CONTROL
     ================================================================ */
  function renderPerms() {
    const cont = $('#permList'); if (!cont) return;
    if (!LumiDevice.hayNativo()) {
      cont.innerHTML = '<p class="sub">Estás en el navegador. El control del teléfono solo funciona dentro del APK de Android. Instálalo y aquí verás el estado de cada permiso.</p>';
      return;
    }
    const c = LumiDevice.capacidades();
    const faltan = new Set(c.faltantes || []);
    const filas = [
      ['SMS', 'Enviar mensajes de texto'],
      ['CONTACTOS', 'Buscar contactos por nombre'],
      ['LLAMADAS', 'Hacer llamadas'],
      ['NOTIFICACIONES', 'Mostrar notificaciones de Lumi'],
      ['CALENDARIO', 'Crear eventos en tu calendario'],
      ['MICROFONO', 'Hablar por voz'],
      ['CAMARA', 'Usar la linterna']
    ];
    cont.innerHTML =
      '<div class="permcard' + (c.accesibilidad ? ' ok' : '') + '"><div><b>Servicio de accesibilidad</b>' +
      '<p class="sub">' + (c.accesibilidad ? 'Activo. Lumi puede controlar la pantalla y otras apps.' : 'Inactivo. Necesario para controlar la pantalla y otras apps.') + '</p></div>' +
      '<button class="btn small" onclick="Lumi.openSetting(\'accesibilidad\')">' + (c.accesibilidad ? 'Abrir' : 'Activar') + '</button></div>' +
      '<div class="permcard' + (c.notificaciones ? ' ok' : '') + '"><div><b>Acceso a notificaciones</b>' +
      '<p class="sub">' + (c.notificaciones ? 'Activo. Lumi puede leer y resumir tus avisos.' : 'Inactivo. Necesario para leer tus notificaciones.') + '</p></div>' +
      '<button class="btn small" onclick="Lumi.openSetting(\'notificaciones_acceso\')">' + (c.notificaciones ? 'Abrir' : 'Activar') + '</button></div>' +
      '<div class="permcard ok"><div><b>Batería</b><p class="sub">' + (c.bateria != null ? c.bateria + '%' : '—') + ' · ' + (c.modelo || 'Android') + ' ' + (c.android || '') + '</p></div>' +
      '<button class="btn small" onclick="Lumi.openSetting(\'bateria\')">Optimizar</button></div>' +
      filas.map(([k, d]) => {
        const falta = faltan.has(k);
        return '<div class="permcard' + (falta ? '' : ' ok') + '"><div><b>' + k + '</b><p class="sub">' + d + '</p></div>' +
          (falta ? '<button class="btn small" onclick="Lumi.askPermission(\'' + k + '\')">Conceder</button>' : '<span class="pill okpill">concedido</span>') + '</div>';
      }).join('');
  }

  function askPermission(p) {
    const r = LumiDevice.invocar('requestPermission', String(p || ''));
    toast(r && r.ok ? 'Solicitado' : 'No se pudo solicitar');
    setTimeout(renderPerms, 900);
  }
  function openSetting(d) {
    if (!LumiDevice.hayNativo()) { toast('Solo en el APK'); return; }
    const r = LumiDevice.invocar('openSettings', String(d || 'ajustes'));
    if (!r || r.ok === false) toast('No se pudo abrir Ajustes');
  }

  /* ================================================================
     CONFIGURACIÓN GENERAL
     ================================================================ */
  function saveName() {
    const v = $('#nameInput').value.trim();
    if (!v) { toast('Escribe tu nombre para comenzar ✦'); return; }
    cfg.name = v; set('cfg', cfg);
    $('#onboarding').classList.add('hidden');
    apply(); go('s-home');
    setTimeout(() => speak('Hola ' + v + '. Soy Lumi.'), 300);
  }
  function rename(v) { if (v.trim()) { cfg.name = v.trim(); set('cfg', cfg); apply(); } }
  function accent(c) { cfg.accent = c; set('cfg', cfg); apply(); }
  function toggle(sw) { cfg[sw.dataset.k] = !cfg[sw.dataset.k]; set('cfg', cfg); apply(); }
  function wipe() {
    if (!confirm('¿Borrar todos los datos de Lumi? Esto incluye la conversación, las tareas y las claves de IA.')) return;
    const claves = LumiCore.cfg();
    localStorage.clear();
    LumiCore.guardarCfg(claves); // conserva las claves para no obligar a reconfigurar
    location.reload();
  }

  function setMode(m) {
    const c = LumiCore.cfg();
    c.mode = LumiCore.MODOS[m] ? m : 'total';
    LumiCore.guardarCfg(c);
    $$('.modebtn').forEach(b => b.classList.toggle('active', b.dataset.m === c.mode));
    toast('Modo: ' + LumiCore.MODOS[c.mode].etiqueta);
  }

  /* ================================================================
     ARRANQUE
     ================================================================ */
  function init() {
    try {
      const tick = () => { const c = $('#clock'); if (c) c.textContent = hm(); };
      tick(); setInterval(tick, 15000);
      apply();

      if (!cfg.name && $('#onboarding')) $('#onboarding').classList.remove('hidden');

      grid('#actionsGrid', ACTIONS);
      grid('#appsGrid', APPS);
      renderChat(false); renderTasks(); renderCal(); renderPlaylist(); renderMood(); renderAI(); renderPerms();

      const c = LumiCore.cfg();
      $$('.modebtn').forEach(b => b.classList.toggle('active', b.dataset.m === c.mode));

      if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }

      // Diagnóstico silencioso: si no hay ningún motor, avisamos una vez.
      const activos = LumiCore.estado().filter(p => p.configurado).length;
      if (!activos) {
        setTimeout(() => toast('Lumi está en modo local. Configura un motor de IA en Ajustes → IA.'), 1400);
      }
    } catch (e) {
      console.error('Lumi init error', e);
      toast('Lumi tuvo un problema al iniciar. Recarga la app.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  const API = {
    go, send, clearChat, toggleVoice, startDictation, speakTest, speak,
    togglePlay, nextTrack, prevTrack, toggleBreath, mood, wellMsg,
    addTask, addTaskFrom, checkTask, delTask, shiftMonth, addEvent, delEvent,
    saveName, rename, accent, toggle, wipe, openExternal,
    renderAI, saveKey, toggleProvider, setAccount, setProxy, testProvider, probarTodo, openLink, moveProvider, selectBackendProvider, testBackendProvider, refreshBackendProviders,
    renderPerms, askPermission, openSetting, setMode,
    onVoiceResult, onVoiceState, startCall, stopCall, onSpeechFinished, onVoiceRecognitionError, loadVoices
  };
  window.Lumi = API;
  return API;
})();
