/* ============================================================================
   Lumi Device — Puente de control del teléfono
   ----------------------------------------------------------------------------
   Cada herramienta aquí es una acción REAL sobre Android. El modelo decide
   cuál invocar; este archivo la ejecuta y devuelve un resultado verificable.

   El puente nativo de Android se inyecta como window.LumiNative (LumiBridge.java).
   Si no existe (PWA en navegador), las herramientas caen a
   su equivalente web y lo declaran, en vez de mentir diciendo que actuaron.
   ========================================================================== */

const LumiDevice = (() => {
  'use strict';

  const nativo = () => (typeof window !== 'undefined' && window.LumiNative && typeof window.LumiNative === 'object') ? window.LumiNative : null;
  const hayNativo = () => !!nativo();

  function invocar(metodo, ...args) {
    const d = nativo();
    if (!d || typeof d[metodo] !== 'function') return { ok: false, error: 'no_nativo', detalle: 'Esta acción necesita la app Android instalada.' };
    try {
      const raw = d[metodo](...args);
      if (raw == null || raw === '') return { ok: true };
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return { ok: false, error: 'excepcion_nativa', detalle: String(e && e.message || e) };
    }
  }

  /* ------------------------------------------------------------------ *
   * Capacidades reales del dispositivo
   * ------------------------------------------------------------------ */
  function capacidades() {
    if (!hayNativo()) {
      return { plataforma: 'web', control_total: false, nota: 'Modo navegador: sin control del teléfono. Instala el APK para el control total.' };
    }
    const r = invocar('getCapabilities');
    return (r && r.ok !== false) ? r : { plataforma: 'android', control_total: false, nota: 'Puente nativo sin respuesta.' };
  }

  /* ------------------------------------------------------------------ *
   * Herramientas — esquema + ejecución
   * ------------------------------------------------------------------ */
  const HERRAMIENTAS = [

    /* ---------- Mensajería y llamadas ---------- */
    {
      nombre: 'enviar_sms',
      desc: 'Envía un mensaje de texto (SMS) real a un número. Úsalo cuando pidan mandar un mensaje, un texto o un SMS.',
      params: {
        type: 'object',
        properties: {
          numero: { type: 'string', description: 'Número de teléfono con código de país si es posible.' },
          texto: { type: 'string', description: 'Contenido exacto del mensaje.' }
        },
        required: ['numero', 'texto']
      },
      run: ({ numero, texto }) => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo', detalle: 'Enviar SMS requiere la app Android.' };
        return invocar('sendSms', String(numero || ''), String(texto || ''));
      }
    },
    {
      nombre: 'enviar_whatsapp',
      desc: 'Abre WhatsApp con un chat y el mensaje ya escrito. La persona solo tiene que pulsar enviar. No envíes por WhatsApp sin que lo hayan pedido explícitamente.',
      params: {
        type: 'object',
        properties: {
          numero: { type: 'string', description: 'Número con código de país, solo dígitos.' },
          texto: { type: 'string', description: 'Mensaje que quedará redactado.' }
        },
        required: ['numero', 'texto']
      },
      run: ({ numero, texto }) => {
        const url = 'https://wa.me/' + String(numero || '').replace(/\D/g, '') + (texto ? '?text=' + encodeURIComponent(texto) : '');
        if (hayNativo()) return invocar('openExternalApp', url, 'com.whatsapp');
        window.open(url, '_blank');
        return { ok: true, modo: 'navegador', detalle: 'WhatsApp abierto en el navegador con el texto redactado.' };
      }
    },
    {
      nombre: 'llamar',
      desc: 'Realiza una llamada telefónica a un número.',
      params: { type: 'object', properties: { numero: { type: 'string', description: 'Número a marcar.' } }, required: ['numero'] },
      run: ({ numero }) => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo', detalle: 'Llamar requiere la app Android.' };
        return invocar('makeCall', String(numero || ''));
      }
    },
    {
      nombre: 'buscar_contacto',
      desc: 'Busca contactos guardados en el teléfono por nombre. Devuelve nombre y número. Úsalo antes de enviar un mensaje si solo te dan el nombre.',
      params: { type: 'object', properties: { nombre: { type: 'string', description: 'Nombre o parte del nombre.' } }, required: ['nombre'] },
      run: ({ nombre }) => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo', detalle: 'Leer contactos requiere la app Android.' };
        return invocar('findContacts', String(nombre || ''));
      }
    },

    /* ---------- Apps y pantalla ---------- */
    {
      nombre: 'abrir_app',
      desc: 'Abre una aplicación instalada en el teléfono por su nombre (YouTube, WhatsApp, Instagram, Spotify, Cámara, Ajustes...).',
      params: { type: 'object', properties: { nombre: { type: 'string', description: 'Nombre de la app.' } }, required: ['nombre'] },
      run: ({ nombre }) => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo', detalle: 'Abrir apps requiere la app Android.' };
        return invocar('openApp', String(nombre || ''));
      }
    },
    {
      nombre: 'listar_apps',
      desc: 'Lista las aplicaciones instaladas en el teléfono. Úsalo cuando no sepas si una app existe o cómo se llama exactamente.',
      params: { type: 'object', properties: {}, required: [] },
      run: () => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo', detalle: 'Requiere la app Android.' };
        return invocar('listApps');
      }
    },
    {
      nombre: 'abrir_url',
      desc: 'Abre una página web en el navegador del teléfono.',
      params: { type: 'object', properties: { url: { type: 'string', description: 'URL completa, con https://' } }, required: ['url'] },
      run: ({ url }) => {
        const u = String(url || '');
        if (!/^https?:\/\//i.test(u)) return { ok: false, error: 'url_invalida' };
        if (hayNativo()) return invocar('openExternalApp', u, '');
        window.open(u, '_blank');
        return { ok: true, modo: 'navegador' };
      }
    },
    {
      nombre: 'buscar_youtube',
      desc: 'Abre YouTube y busca un tema, o reproduce un video directamente. Úsalo para "pon X en YouTube".',
      params: {
        type: 'object',
        properties: { consulta: { type: 'string', description: 'Qué buscar o reproducir.' } },
        required: ['consulta']
      },
      run: ({ consulta }) => {
        const q = encodeURIComponent(String(consulta || ''));
        if (hayNativo()) {
          const r = invocar('youtubeSearch', String(consulta || ''));
          if (r && r.ok !== false) return r;
        }
        window.open('https://www.youtube.com/results?search_query=' + q, '_blank');
        return { ok: true, modo: 'navegador' };
      }
    },
    {
      nombre: 'control_multimedia',
      desc: 'Controla la reproducción de música o video que esté sonando: pausar, reproducir, siguiente, anterior, subir o bajar volumen, silenciar.',
      params: {
        type: 'object',
        properties: {
          accion: { type: 'string', enum: ['pausar', 'reproducir', 'siguiente', 'anterior', 'subir_volumen', 'bajar_volumen', 'silenciar', 'maximo_volumen'] }
        },
        required: ['accion']
      },
      run: ({ accion }) => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo', detalle: 'Control multimedia requiere la app Android.' };
        return invocar('mediaControl', String(accion || ''));
      }
    },
    {
      nombre: 'linterna',
      desc: 'Enciende o apaga la linterna del teléfono.',
      params: { type: 'object', properties: { encender: { type: 'boolean', description: 'true para encender, false para apagar.' } }, required: ['encender'] },
      run: ({ encender }) => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo', detalle: 'La linterna requiere la app Android.' };
        return invocar('torch', encender ? 'true' : 'false');
      }
    },

    /* ---------- Organización ---------- */
    {
      nombre: 'poner_alarma',
      desc: 'Pone una alarma en la app de reloj del teléfono.',
      params: {
        type: 'object',
        properties: {
          hora: { type: 'integer', description: 'Hora 0-23' },
          minuto: { type: 'integer', description: 'Minuto 0-59' },
          etiqueta: { type: 'string', description: 'Texto de la alarma.' }
        },
        required: ['hora', 'minuto']
      },
      run: ({ hora, minuto, etiqueta }) => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo', detalle: 'Poner alarmas requiere la app Android.' };
        return invocar('setAlarm', String(hora), String(minuto), String(etiqueta || 'Lumi'));
      }
    },
    {
      nombre: 'crear_recordatorio',
      desc: 'Crea un recordatorio dentro de Lumi, que aparece en la lista de tareas de la app.',
      params: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'Qué recordar.' },
          cuando: { type: 'string', description: 'Cuándo, en texto libre (ej: "mañana 9:00"). Opcional.' }
        },
        required: ['texto']
      },
      run: ({ texto, cuando }) => {
        if (typeof window.Lumi !== 'undefined' && window.Lumi.addTaskFrom) {
          window.Lumi.addTaskFrom(cuando ? texto + ' (' + cuando + ')' : texto);
          return { ok: true, guardado: true, detalle: 'Recordatorio añadido a tus tareas.' };
        }
        return { ok: false, error: 'app_no_lista' };
      }
    },
    {
      nombre: 'listar_tareas',
      desc: 'Devuelve las tareas y recordatorios pendientes de la persona.',
      params: { type: 'object', properties: {}, required: [] },
      run: () => {
        try {
          const t = JSON.parse(localStorage.getItem('lumi_tasks') || '[]');
          return { ok: true, total: t.length, pendientes: t.filter(x => !x.done).map(x => x.text).slice(0, 30) };
        } catch { return { ok: true, pendientes: [] }; }
      }
    },
    {
      nombre: 'crear_evento_calendario',
      desc: 'Crea un evento en el calendario de Android del teléfono.',
      params: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Título del evento.' },
          inicio: { type: 'string', description: 'Fecha y hora ISO 8601, por ejemplo 2026-10-15T18:00:00' },
          duracion_minutos: { type: 'integer', description: 'Duración en minutos. Por defecto 60.' }
        },
        required: ['titulo', 'inicio']
      },
      run: ({ titulo, inicio, duracion_minutos }) => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo', detalle: 'Crear eventos requiere la app Android.' };
        return invocar('createCalendarEvent', String(titulo || ''), String(inicio || ''), String(duracion_minutos || 60));
      }
    },
    {
      nombre: 'leer_notificaciones',
      desc: 'Lee las notificaciones recientes del teléfono (mensajes, correos, apps). Úsalo para "¿qué me ha llegado?" o para resumir avisos.',
      params: {
        type: 'object',
        properties: { limite: { type: 'integer', description: 'Cuántas notificaciones leer. Por defecto 15.' } },
        required: []
      },
      run: ({ limite }) => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo', detalle: 'Leer notificaciones requiere la app Android y el permiso de acceso a notificaciones.' };
        return invocar('getNotifications', String(limite || 15));
      }
    },
    {
      nombre: 'estado_bateria',
      desc: 'Consulta el nivel de batería y si el teléfono está cargando.',
      params: { type: 'object', properties: {}, required: [] },
      run: () => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo' };
        return invocar('getBattery');
      }
    },
    {
      nombre: 'info_dispositivo',
      desc: 'Devuelve modelo, versión de Android y qué permisos están concedidos. Úsalo si algo falla por permisos.',
      params: { type: 'object', properties: {}, required: [] },
      run: () => {
        if (!hayNativo()) return { ok: true, plataforma: 'navegador', userAgent: navigator.userAgent };
        return invocar('getDeviceInfo');
      }
    },
    {
      nombre: 'pedir_permiso',
      desc: 'Pide al usuario que conceda un permiso que falta. Usa el nombre técnico: SMS, CONTACTOS, LLAMADAS, MICROFONO, NOTIFICACIONES, CALENDARIO, UBICACION, CAMARA.',
      params: { type: 'object', properties: { permiso: { type: 'string', description: 'Nombre del permiso.' } }, required: ['permiso'] },
      run: ({ permiso }) => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo' };
        return invocar('requestPermission', String(permiso || ''));
      }
    },
    {
      nombre: 'abrir_ajustes_sistema',
      desc: 'Abre una pantalla de ajustes de Android. Destinos: accesibilidad, notificaciones, bateria, apps, ajustes, wifi, bluetooth.',
      params: { type: 'object', properties: { destino: { type: 'string', description: 'Qué ajuste abrir.' } }, required: ['destino'] },
      run: ({ destino }) => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo' };
        return invocar('openSettings', String(destino || 'ajustes'));
      }
    },
    {
      nombre: 'controlar_pantalla',
      desc: 'Ejecuta una acción global del sistema mediante accesibilidad: atras, inicio, recientes, bloquear, notificaciones, atras_rapido. Requiere que el servicio de accesibilidad esté activado.',
      params: {
        type: 'object',
        properties: { accion: { type: 'string', enum: ['atras', 'inicio', 'recientes', 'bloquear', 'panel_notificaciones', 'atras_rapido'] } },
        required: ['accion']
      },
      run: ({ accion }) => {
        if (!hayNativo()) return { ok: false, error: 'no_nativo' };
        return invocar('globalAction', String(accion || ''));
      }
    },

    /* ---------- Comunicación ---------- */
    {
      nombre: 'decir_en_voz_alta',
      desc: 'Lee un texto en voz alta con la voz de Lumi.',
      params: { type: 'object', properties: { texto: { type: 'string', description: 'Lo que se dirá en voz alta.' } }, required: ['texto'] },
      run: ({ texto }) => {
        if (hayNativo()) return invocar('speak', String(texto || ''));
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(String(texto || ''));
          u.lang = 'es-ES';
          speechSynthesis.cancel();
          speechSynthesis.speak(u);
          return { ok: true, modo: 'navegador' };
        }
        return { ok: false, error: 'sin_tts' };
      }
    },
    {
      nombre: 'enviar_correo',
      desc: 'Abre la app de correo con destinatario, asunto y cuerpo ya redactados.',
      params: {
        type: 'object',
        properties: {
          para: { type: 'string', description: 'Correo destinatario.' },
          asunto: { type: 'string' },
          cuerpo: { type: 'string' }
        },
        required: ['para']
      },
      run: ({ para, asunto, cuerpo }) => {
        const url = 'mailto:' + encodeURIComponent(para) + '?subject=' + encodeURIComponent(asunto || '') + '&body=' + encodeURIComponent(cuerpo || '');
        if (hayNativo()) return invocar('openExternalApp', url, '');
        window.location.href = url;
        return { ok: true, modo: 'navegador' };
      }
    },
    {
      nombre: 'navegar_a',
      desc: 'Abre el mapa con una ruta o búsqueda de un lugar.',
      params: { type: 'object', properties: { destino: { type: 'string', description: 'Lugar o dirección.' } }, required: ['destino'] },
      run: ({ destino }) => {
        const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(String(destino || ''));
        if (hayNativo()) return invocar('openExternalApp', url, 'com.google.android.apps.maps');
        window.open(url, '_blank');
        return { ok: true, modo: 'navegador' };
      }
    },
    {
      nombre: 'copiar_portapapeles',
      desc: 'Copia un texto al portapapeles del teléfono.',
      params: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
      run: ({ texto }) => {
        if (hayNativo()) return invocar('copyToClipboard', String(texto || ''));
        if (navigator.clipboard) { navigator.clipboard.writeText(String(texto || '')); return { ok: true }; }
        return { ok: false, error: 'sin_portapapeles' };
      }
    },
    {
      nombre: 'compartir',
      desc: 'Abre el menú de compartir de Android con un texto.',
      params: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
      run: ({ texto }) => {
        if (hayNativo()) return invocar('shareText', String(texto || ''));
        return { ok: false, error: 'no_nativo' };
      }
    },

    /* ---------- Bienestar (cerebro trasplantado) ---------- */
    {
      nombre: 'registrar_animo',
      desc: 'Registra cómo se siente la persona hoy en el módulo de bienestar.',
      params: {
        type: 'object',
        properties: {
          animo: { type: 'integer', description: '1 a 5.' },
          estres: { type: 'integer', description: '1 a 5.' },
          energia: { type: 'integer', description: '1 a 5.' },
          sueno: { type: 'integer', description: '1 a 5.' },
          nota: { type: 'string' }
        },
        required: ['animo']
      },
      run: (a) => {
        try {
          const l = JSON.parse(localStorage.getItem('lumi_bienestar') || '{"checkins":[]}');
          const hoy = new Date().toISOString().slice(0, 10);
          l.checkins = (l.checkins || []).filter(x => x.date !== hoy);
          l.checkins.push({ date: hoy, animo: a.animo, estres: a.estres, energia: a.energia, sueno: a.sueno, nota: a.nota || '' });
          l.checkins = l.checkins.slice(-90);
          localStorage.setItem('lumi_bienestar', JSON.stringify(l));
          return { ok: true, guardado: true };
        } catch { return { ok: false, error: 'no_guardado' }; }
      }
    },
    {
      nombre: 'leer_bienestar',
      desc: 'Lee los registros de bienestar guardados para responder con contexto real.',
      params: { type: 'object', properties: {}, required: [] },
      run: () => {
        try {
          const l = JSON.parse(localStorage.getItem('lumi_bienestar') || '{"checkins":[]}');
          const c = (l.checkins || []).slice(-14);
          const prom = k => { const v = c.map(x => Number(x[k])).filter(Number.isFinite); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null; };
          return { ok: true, registros: c.length, animo: prom('animo'), estres: prom('estres'), energia: prom('energia'), sueno: prom('sueno'), ultimo: c[c.length - 1] || null };
        } catch { return { ok: true, registros: 0 }; }
      }
    }
  ];

  /* ------------------------------------------------------------------ *
   * Esquemas para el modelo (formato OpenAI tools)
   * ------------------------------------------------------------------ */
  const esquemas = () => HERRAMIENTAS.map(h => ({
    name: h.nombre, description: h.desc, parameters: h.params
  }));

  /* ------------------------------------------------------------------ *
   * Ejecutor
   * ------------------------------------------------------------------ */
  async function ejecutar(nombre, args) {
    const h = HERRAMIENTAS.find(x => x.nombre === nombre);
    if (!h) return { ok: false, error: 'herramienta_desconocida', nombre };
    try {
      const r = await h.run(args || {});
      return r && typeof r === 'object' ? r : { ok: true, resultado: r };
    } catch (e) {
      return { ok: false, error: 'fallo_ejecucion', detalle: String(e && e.message || e) };
    }
  }

  /* ------------------------------------------------------------------ *
   * Contexto del dispositivo para el prompt
   * ------------------------------------------------------------------ */
  function contexto() {
    const c = capacidades();
    if (c.plataforma === 'web') return 'Navegador web (sin control del teléfono).';
    const p = [];
    p.push('Android ' + (c.android || '?') + ', ' + (c.modelo || 'dispositivo') + '.');
    if (Array.isArray(c.faltantes) && c.faltantes.length) {
      p.push('Permisos que FALTAN: ' + c.faltantes.join(', ') + '. Si necesitas uno, pídelo con pedir_permiso.');
    } else {
      p.push('Todos los permisos principales concedidos.');
    }
    p.push('Accesibilidad: ' + (c.accesibilidad ? 'ACTIVA (puedes controlar pantalla y apps).' : 'INACTIVA (para controlar la pantalla necesitas pedir que la activen en Ajustes > Accesibilidad > Lumiweg).'));
    p.push('Lectura de notificaciones: ' + (c.notificaciones ? 'ACTIVA.' : 'INACTIVA.'));
    p.push('Batería: ' + (c.bateria != null ? c.bateria + '%' : 'desconocida') + '.');
    p.push('Apps instaladas: ' + (c.apps != null ? c.apps : 'desconocido') + '.');
    return p.join(' ');
  }

  return { HERRAMIENTAS, esquemas, ejecutar, capacidades, contexto, hayNativo, invocar };
})();

if (typeof window !== 'undefined') window.LumiDevice = LumiDevice;
