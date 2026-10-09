package com.lumiweg.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PowerManager;
import android.provider.AlarmClock;
import android.provider.CalendarContract;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.telephony.SmsManager;
import android.text.TextUtils;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * LumiBridge — el puente real entre la web de Lumi y Android.
 *
 * El JavaScript de la app (js/lumi-device.js) llama a estos métodos y espera
 * SIEMPRE una cadena JSON: {"ok":true,...} o {"ok":false,"error":"..."}.
 * Nunca se miente al modelo: si algo falla, se devuelve el fallo.
 *
 * Se expone como window.LumiNative.
 */
public class LumiBridge {

    private final MainActivity activity;

    public LumiBridge(MainActivity activity) {
        this.activity = activity;
    }

    /* ================================================================== *
     * Utilidades
     * ================================================================== */

    private static String json(String... kv) {
        JSONObject o = new JSONObject();
        try {
            for (int i = 0; i + 1 < kv.length; i += 2) o.put(kv[i], kv[i + 1]);
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    private static String fail(String error, String detalle) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", false);
            o.put("error", error);
            if (detalle != null) o.put("detalle", detalle);
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    private boolean tiene(String permiso) {
        return Build.VERSION.SDK_INT < 23
                || activity.checkSelfPermission(permiso) == PackageManager.PERMISSION_GRANTED;
    }

    private static String texto(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    /* ================================================================== *
     * 1. RED — evita el CORS del WebView haciendo la petición en Java
     * ================================================================== */

    @JavascriptInterface
    public String httpRequest(String url, String method, String headersJson, String body, int timeoutMs) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod(TextUtils.isEmpty(method) ? "POST" : method);
            c.setConnectTimeout(timeoutMs > 0 ? timeoutMs : 30000);
            c.setReadTimeout(timeoutMs > 0 ? timeoutMs : 45000);
            c.setRequestProperty("User-Agent", "Lumiweg/" + BuildConfig.VERSION_NAME);
            try {
                JSONObject h = new JSONObject(TextUtils.isEmpty(headersJson) ? "{}" : headersJson);
                for (java.util.Iterator<String> it = h.keys(); it.hasNext(); ) {
                    String k = it.next();
                    c.setRequestProperty(k, h.optString(k));
                }
            } catch (Exception ignored) {
            }
            boolean env = body != null && body.length() > 0;
            c.setDoOutput(env);
            c.setDoInput(true);
            if (env) {
                byte[] bytes = body.getBytes("UTF-8");
                c.setFixedLengthStreamingMode(bytes.length);
                OutputStream os = c.getOutputStream();
                os.write(bytes);
                os.flush();
                os.close();
            }
            int status = c.getResponseCode();
            InputStream is = status >= 400 ? c.getErrorStream() : c.getInputStream();
            String cuerpo = leer(is);
            JSONObject o = new JSONObject();
            o.put("ok", status >= 200 && status < 300);
            o.put("status", status);
            o.put("body", cuerpo);
            return o.toString();
        } catch (Exception e) {
            return json("networkError", texto(e.getMessage()));
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String leer(InputStream is) throws Exception {
        if (is == null) return "";
        BufferedReader r = new BufferedReader(new InputStreamReader(is, "UTF-8"));
        StringBuilder sb = new StringBuilder();
        String l;
        while ((l = r.readLine()) != null) sb.append(l).append('\n');
        r.close();
        return sb.toString().trim();
    }

    /* ================================================================== *
     * 2. CAPACIDADES Y ESTADO DEL TELÉFONO
     * ================================================================== */

    @JavascriptInterface
    public String getCapabilities() {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", true);
            o.put("plataforma", "android");
            o.put("android", Build.VERSION.RELEASE);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("modelo", Build.MANUFACTURER + " " + Build.MODEL);
            o.put("bateria", nivelBateria());
            o.put("accesibilidad", LumiAccessibilityService.activo());
            o.put("notificaciones", LumiNotificationService.conectado());
            o.put("apps", contarApps());
            o.put("control_total", true);
            JSONArray faltan = new JSONArray();
            for (String[] par : PERMISOS) {
                if (!tiene(par[1])) faltan.put(par[0]);
            }
            o.put("faltantes", faltan);
            return o.toString();
        } catch (Exception e) {
            return fail("error", texto(e.getMessage()));
        }
    }

    private static final String[][] PERMISOS = {
            {"SMS", Manifest.permission.SEND_SMS},
            {"CONTACTOS", Manifest.permission.READ_CONTACTS},
            {"LLAMADAS", Manifest.permission.CALL_PHONE},
            {"MICROFONO", Manifest.permission.RECORD_AUDIO},
            {"CALENDARIO", Manifest.permission.WRITE_CALENDAR},
            {"CAMARA", Manifest.permission.CAMERA},
            {"UBICACION", Manifest.permission.ACCESS_FINE_LOCATION}
    };

    private int nivelBateria() {
        try {
            BatteryManager bm = (BatteryManager) activity.getSystemService(Context.BATTERY_SERVICE);
            if (bm != null) return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
        } catch (Exception ignored) {
        }
        return -1;
    }

    private int contarApps() {
        try {
            return appsInstaladas().size();
        } catch (Exception e) {
            return -1;
        }
    }

    @JavascriptInterface
    public String getBattery() {
        try {
            JSONObject o = new JSONObject();
            Intent b = activity.registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            int nivel = b != null ? b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) : -1;
            int escala = b != null ? b.getIntExtra(BatteryManager.EXTRA_SCALE, 100) : 100;
            int pct = (nivel >= 0 && escala > 0) ? Math.round(nivel * 100f / escala) : nivelBateria();
            int estado = b != null ? b.getIntExtra(BatteryManager.EXTRA_STATUS, -1) : -1;
            o.put("ok", true);
            o.put("nivel", pct);
            o.put("cargando", estado == BatteryManager.BATTERY_STATUS_CHARGING
                    || estado == BatteryManager.BATTERY_STATUS_FULL);
            return o.toString();
        } catch (Exception e) {
            return fail("error", texto(e.getMessage()));
        }
    }

    @JavascriptInterface
    public String getDeviceInfo() {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", true);
            o.put("plataforma", "android");
            o.put("modelo", Build.MANUFACTURER + " " + Build.MODEL);
            o.put("android", Build.VERSION.RELEASE);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("bateria", nivelBateria());
            o.put("accesibilidad", LumiAccessibilityService.activo());
            o.put("notificaciones", LumiNotificationService.conectado());
            JSONObject concedidos = new JSONObject();
            for (String[] par : PERMISOS) concedidos.put(par[0], tiene(par[1]));
            o.put("permisos", concedidos);
            return o.toString();
        } catch (Exception e) {
            return fail("error", texto(e.getMessage()));
        }
    }

    /* ================================================================== *
     * 3. SMS Y LLAMADAS
     * ================================================================== */

    @JavascriptInterface
    public String sendSms(String numero, String mensaje) {
        if (TextUtils.isEmpty(numero)) return fail("numero_vacio", null);
        if (!tiene(Manifest.permission.SEND_SMS)) return fail("permiso", "Falta el permiso de SMS.");
        try {
            SmsManager sm = SmsManager.getDefault();
            ArrayList<String> partes = sm.divideMessage(texto(mensaje));
            if (partes.size() > 1) sm.sendMultipartTextMessage(numero, null, partes, null, null);
            else sm.sendTextMessage(numero, null, texto(mensaje), null, null);
            return json("ok", "true", "numero", numero, "partes", String.valueOf(partes.size()));
        } catch (Exception e) {
            return fail("fallo_sms", texto(e.getMessage()));
        }
    }

    @JavascriptInterface
    public String makeCall(String numero) {
        if (TextUtils.isEmpty(numero)) return fail("numero_vacio", null);
        try {
            Intent i;
            if (tiene(Manifest.permission.CALL_PHONE)) {
                i = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(numero)));
            } else {
                i = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(numero)));
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            boolean directa = tiene(Manifest.permission.CALL_PHONE);
            return json("ok", "true", "modo", directa ? "llamada_directa" : "marcador",
                    "detalle", directa ? "Llamando." : "Falta el permiso de llamadas: se abrió el marcador.");
        } catch (Exception e) {
            return fail("fallo_llamada", texto(e.getMessage()));
        }
    }

    @JavascriptInterface
    public String findContacts(String nombre) {
        if (!tiene(Manifest.permission.READ_CONTACTS)) return fail("permiso", "Falta el permiso de contactos.");
        ContentResolver cr = activity.getContentResolver();
        JSONArray lista = new JSONArray();
        android.database.Cursor c = null;
        try {
            String sel = TextUtils.isEmpty(nombre) ? null
                    : ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?";
            String[] args = TextUtils.isEmpty(nombre) ? null : new String[]{"%" + nombre + "%"};
            c = cr.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                    new String[]{ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                            ContactsContract.CommonDataKinds.Phone.NUMBER}, sel, args,
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC");
            Set<String> vistos = new LinkedHashSet<>();
            while (c != null && c.moveToNext() && lista.length() < 25) {
                String n = c.getString(0);
                String num = c.getString(1);
                if (n == null || num == null || !vistos.add(n + "|" + num)) continue;
                JSONObject o = new JSONObject();
                o.put("nombre", n);
                o.put("numero", num);
                lista.put(o);
            }
            JSONObject o = new JSONObject();
            o.put("ok", true);
            o.put("total", lista.length());
            o.put("contactos", lista);
            return o.toString();
        } catch (Exception e) {
            return fail("fallo_contactos", texto(e.getMessage()));
        } finally {
            if (c != null) c.close();
        }
    }

    /* ================================================================== *
     * 4. APPS
     * ================================================================== */

    private List<ResolveInfo> appsInstaladas() {
        Intent main = new Intent(Intent.ACTION_MAIN, null);
        main.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> r = activity.getPackageManager().queryIntentActivities(main, 0);
        java.util.Collections.sort(r, new java.util.Comparator<ResolveInfo>() {
            public int compare(ResolveInfo a, ResolveInfo b) {
                return etiqueta(a).compareToIgnoreCase(etiqueta(b));
            }
        });
        return r;
    }

    private String etiqueta(ResolveInfo r) {
        try {
            return String.valueOf(r.loadLabel(activity.getPackageManager()));
        } catch (Exception e) {
            return r.activityInfo.packageName;
        }
    }

    @JavascriptInterface
    public String listApps() {
        try {
            JSONArray lista = new JSONArray();
            for (ResolveInfo r : appsInstaladas()) lista.put(etiqueta(r));
            JSONObject o = new JSONObject();
            o.put("ok", true);
            o.put("total", lista.length());
            o.put("apps", lista);
            return o.toString();
        } catch (Exception e) {
            return fail("error", texto(e.getMessage()));
        }
    }

    @JavascriptInterface
    public String openApp(String nombre) {
        String q = texto(nombre).toLowerCase(Locale.ROOT).trim();
        if (q.isEmpty()) return fail("nombre_vacio", null);
        try {
            List<ResolveInfo> apps = appsInstaladas();
            ResolveInfo exacta = null, parcial = null;
            for (ResolveInfo r : apps) {
                String l = etiqueta(r).toLowerCase(Locale.ROOT);
                if (l.equals(q)) { exacta = r; break; }
                if (parcial == null && (l.contains(q) || q.contains(l))) parcial = r;
            }
            ResolveInfo elegida = exacta != null ? exacta : parcial;
            if (elegida == null) {
                JSONArray cand = new JSONArray();
                for (int i = 0; i < apps.size() && cand.length() < 12; i++) {
                    String l = etiqueta(apps.get(i));
                    if (l.toLowerCase(Locale.ROOT).contains(q.substring(0, Math.min(3, q.length())))) cand.put(l);
                }
                JSONObject o = new JSONObject();
                o.put("ok", false);
                o.put("error", "app_no_encontrada");
                o.put("candidatas", cand);
                return o.toString();
            }
            Intent i = activity.getPackageManager()
                    .getLaunchIntentForPackage(elegida.activityInfo.packageName);
            if (i == null) return fail("sin_lanzador", elegida.activityInfo.packageName);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            return json("ok", "true", "app", etiqueta(elegida),
                    "paquete", elegida.activityInfo.packageName);
        } catch (Exception e) {
            return fail("fallo_abrir_app", texto(e.getMessage()));
        }
    }

    @JavascriptInterface
    public String openExternalApp(String url, String paquete) {
        if (TextUtils.isEmpty(url)) return fail("url_vacia", null);
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            if (!TextUtils.isEmpty(paquete)) i.setPackage(paquete);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (i.resolveActivity(activity.getPackageManager()) == null) {
                // El paquete concreto no existe: se intenta sin paquete.
                i.setPackage(null);
                if (i.resolveActivity(activity.getPackageManager()) == null) {
                    return fail("sin_app", "Ninguna app puede abrir: " + url);
                }
            }
            activity.startActivity(i);
            return json("ok", "true", "url", url);
        } catch (Exception e) {
            return fail("fallo_intent", texto(e.getMessage()));
        }
    }

    @JavascriptInterface
    public String youtubeSearch(String consulta) {
        String q = Uri.encode(texto(consulta));
        if (q.isEmpty()) return fail("consulta_vacia", null);
        String enApp = "vnd.youtube://www.youtube.com/results?search_query=" + q;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(enApp));
            i.setPackage("com.google.android.youtube");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (i.resolveActivity(activity.getPackageManager()) != null) {
                activity.startActivity(i);
                return json("ok", "true", "modo", "app_youtube", "consulta", texto(consulta));
            }
        } catch (Exception ignored) {
        }
        return openExternalApp("https://www.youtube.com/results?search_query=" + q, null);
    }

    /* ================================================================== *
     * 5. MULTIMEDIA, LINTERNA, ALARMAS
     * ================================================================== */

    @JavascriptInterface
    public String mediaControl(String accion) {
        String a = texto(accion).toLowerCase(Locale.ROOT);
        try {
            AudioManager am = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return fail("sin_audio", null);
            switch (a) {
                case "pausar":
                case "reproducir":
                    pulsar(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE);
                    return json("ok", "true", "accion", a);
                case "siguiente":
                    pulsar(KeyEvent.KEYCODE_MEDIA_NEXT);
                    return json("ok", "true", "accion", a);
                case "anterior":
                    pulsar(KeyEvent.KEYCODE_MEDIA_PREVIOUS);
                    return json("ok", "true", "accion", a);
                case "subir_volumen":
                    am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE,
                            AudioManager.FLAG_SHOW_UI);
                    return json("ok", "true", "accion", a, "volumen", String.valueOf(vol(am)));
                case "bajar_volumen":
                    am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER,
                            AudioManager.FLAG_SHOW_UI);
                    return json("ok", "true", "accion", a, "volumen", String.valueOf(vol(am)));
                case "silenciar":
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, 0, AudioManager.FLAG_SHOW_UI);
                    return json("ok", "true", "accion", a, "volumen", "0");
                case "maximo_volumen":
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, am.getStreamMaxVolume(AudioManager.STREAM_MUSIC),
                            AudioManager.FLAG_SHOW_UI);
                    return json("ok", "true", "accion", a, "volumen", String.valueOf(vol(am)));
                default:
                    return fail("accion_desconocida", a);
            }
        } catch (Exception e) {
            return fail("fallo_multimedia", texto(e.getMessage()));
        }
    }

    private int vol(AudioManager am) {
        return am.getStreamVolume(AudioManager.STREAM_MUSIC);
    }

    private void pulsar(int code) {
        AudioManager am = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        long t = android.os.SystemClock.uptimeMillis();
        am.dispatchMediaKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, code, 0));
        am.dispatchMediaKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_UP, code, 0));
    }

    @JavascriptInterface
    public String torch(String encender) {
        boolean on = "true".equalsIgnoreCase(texto(encender)) || "1".equals(texto(encender));
        try {
            CameraManager cm = (CameraManager) activity.getSystemService(Context.CAMERA_SERVICE);
            if (cm == null) return fail("sin_camara", null);
            String objetivo = null;
            for (String id : cm.getCameraIdList()) {
                Boolean flash = cm.getCameraCharacteristics(id)
                        .get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (flash != null && flash) { objetivo = id; break; }
            }
            if (objetivo == null) return fail("sin_linterna", "Este teléfono no tiene flash trasero.");
            cm.setTorchMode(objetivo, on);
            return json("ok", "true", "encendida", String.valueOf(on));
        } catch (Exception e) {
            return fail("fallo_linterna", texto(e.getMessage()));
        }
    }

    @JavascriptInterface
    public String setAlarm(String hora, String minuto, String etiqueta) {
        try {
            int h = (int) Double.parseDouble(texto(hora).replaceAll("[^0-9.]", ""));
            int m = (int) Double.parseDouble(texto(minuto).replaceAll("[^0-9.]", ""));
            if (h < 0 || h > 23 || m < 0 || m > 59) return fail("hora_invalida", h + ":" + m);
            Intent i = new Intent(AlarmClock.ACTION_SET_ALARM);
            i.putExtra(AlarmClock.EXTRA_HOUR, h);
            i.putExtra(AlarmClock.EXTRA_MINUTES, m);
            i.putExtra(AlarmClock.EXTRA_MESSAGE, texto(etiqueta));
            i.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (i.resolveActivity(activity.getPackageManager()) == null) return fail("sin_reloj", null);
            activity.startActivity(i);
            return json("ok", "true", "hora", String.format(Locale.US, "%02d:%02d", h, m));
        } catch (Exception e) {
            return fail("fallo_alarma", texto(e.getMessage()));
        }
    }

    /* ================================================================== *
     * 6. CALENDARIO
     * ================================================================== */

    @JavascriptInterface
    public String createCalendarEvent(String titulo, String inicio, String duracionMin) {
        if (!tiene(Manifest.permission.WRITE_CALENDAR)) {
            return fail("permiso", "Falta el permiso de calendario.");
        }
        try {
            long t0 = parseFecha(texto(inicio));
            int dur = 60;
            try { dur = (int) Double.parseDouble(texto(duracionMin)); } catch (Exception ignored) { }
            if (dur <= 0) dur = 60;
            long t1 = t0 + dur * 60000L;

            Long calId = null;
            android.database.Cursor c = activity.getContentResolver().query(
                    CalendarContract.Calendars.CONTENT_URI,
                    new String[]{CalendarContract.Calendars._ID, CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL},
                    CalendarContract.Calendars.VISIBLE + "=1", null,
                    CalendarContract.Calendars.IS_PRIMARY + " DESC");
            if (c != null) {
                if (c.moveToFirst()) calId = c.getLong(0);
                c.close();
            }
            if (calId == null) return fail("sin_calendario", "No hay ninguna cuenta de calendario en el teléfono.");

            ContentValues v = new ContentValues();
            v.put(CalendarContract.Events.CALENDAR_ID, calId);
            v.put(CalendarContract.Events.TITLE, texto(titulo));
            v.put(CalendarContract.Events.DESCRIPTION, "Creado por Lumi");
            v.put(CalendarContract.Events.DTSTART, t0);
            v.put(CalendarContract.Events.DTEND, t1);
            v.put(CalendarContract.Events.EVENT_TIMEZONE, java.util.TimeZone.getDefault().getID());
            Uri u = activity.getContentResolver().insert(CalendarContract.Events.CONTENT_URI, v);
            if (u == null) return fail("no_insertado", null);
            return json("ok", "true", "evento", texto(titulo),
                    "inicio", new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(new Date(t0)));
        } catch (Exception e) {
            return fail("fallo_calendario", texto(e.getMessage()));
        }
    }

    private static long parseFecha(String s) {
        String[] patrones = {"yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd HH:mm", "yyyy-MM-dd"};
        for (String p : patrones) {
            try {
                SimpleDateFormat f = new SimpleDateFormat(p, Locale.US);
                f.setLenient(false);
                Date d = f.parse(s.trim());
                if (d != null) return d.getTime();
            } catch (Exception ignored) {
            }
        }
        return System.currentTimeMillis() + 3600000L;
    }

    /* ================================================================== *
     * 7. NOTIFICACIONES
     * ================================================================== */

    @JavascriptInterface
    public String getNotifications(String limite) {
        if (!LumiNotificationService.conectado()) {
            return fail("permiso", "Falta activar el acceso a notificaciones de Lumiweg en Ajustes.");
        }
        int n = 15;
        try { n = (int) Double.parseDouble(texto(limite)); } catch (Exception ignored) { }
        try {
            JSONArray lista = LumiNotificationService.ultimas(n);
            JSONObject o = new JSONObject();
            o.put("ok", true);
            o.put("total", lista.length());
            o.put("notificaciones", lista);
            return o.toString();
        } catch (Exception e) {
            return fail("error", texto(e.getMessage()));
        }
    }

    /* ================================================================== *
     * 8. PERMISOS Y AJUSTES
     * ================================================================== */

    @JavascriptInterface
    public String requestPermission(String nombre) {
        final String pedido = texto(nombre).toUpperCase(Locale.ROOT).trim();
        final List<String> aPedir = new ArrayList<>();
        for (String[] par : PERMISOS) {
            if (par[0].equals(pedido) && !tiene(par[1])) aPedir.add(par[1]);
        }
        if (pedido.equals("NOTIFICACIONES") && Build.VERSION.SDK_INT >= 33
                && !tiene("android.permission.POST_NOTIFICATIONS")) {
            aPedir.add("android.permission.POST_NOTIFICATIONS");
        }
        if (aPedir.isEmpty()) {
            // Permisos que no se conceden con un diálogo: se abre Ajustes.
            if (pedido.equals("ACCESIBILIDAD")) { openSettings("accesibilidad"); return json("ok", "true", "modo", "ajustes"); }
            if (pedido.equals("NOTIFICACIONES")) { openSettings("notificaciones_acceso"); return json("ok", "true", "modo", "ajustes"); }
            return json("ok", "true", "detalle", "Ya estaba concedido o no requiere diálogo.");
        }
        activity.pedirPermisos(aPedir.toArray(new String[0]));
        return json("ok", "true", "solicitados", String.valueOf(aPedir.size()));
    }

    @JavascriptInterface
    public String openSettings(String destino) {
        String d = texto(destino).toLowerCase(Locale.ROOT);
        try {
            Intent i;
            switch (d) {
                case "accesibilidad":
                case "accessibility":
                    i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                    break;
                case "notificaciones_acceso":
                case "notificaciones":
                case "notification_listener":
                    i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
                    break;
                case "bateria":
                    i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    break;
                case "apps":
                    i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:" + activity.getPackageName()));
                    break;
                case "wifi":
                    i = new Intent(Settings.ACTION_WIFI_SETTINGS);
                    break;
                case "bluetooth":
                    i = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                    break;
                case "sonido":
                    i = new Intent(Settings.ACTION_SOUND_SETTINGS);
                    break;
                case "pantalla":
                    i = new Intent(Settings.ACTION_DISPLAY_SETTINGS);
                    break;
                case "ubicacion":
                    i = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                    break;
                default:
                    i = new Intent(Settings.ACTION_SETTINGS);
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            return json("ok", "true", "destino", d);
        } catch (Exception e) {
            return fail("fallo_ajustes", texto(e.getMessage()));
        }
    }

    /* ================================================================== *
     * 9. ACCESIBILIDAD — control de pantalla
     * ================================================================== */

    @JavascriptInterface
    public String globalAction(String accion) {
        String a = texto(accion).toLowerCase(Locale.ROOT);
        if (!LumiAccessibilityService.activo()) {
            return fail("accesibilidad_inactiva",
                    "Activa Lumiweg en Ajustes > Accesibilidad para controlar la pantalla.");
        }
        int code;
        switch (a) {
            case "atras":
            case "atras_rapido":
                code = android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK;
                break;
            case "inicio":
            case "home":
                code = android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME;
                break;
            case "recientes":
                code = android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_RECENTS;
                break;
            case "panel_notificaciones":
                code = android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS;
                break;
            case "bloquear":
                if (Build.VERSION.SDK_INT < 28) return fail("no_soportado", "Bloquear pantalla requiere Android 9+.");
                code = android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN;
                break;
            default:
                return fail("accion_desconocida", a);
        }
        boolean ok = LumiAccessibilityService.ejecutar(code);
        return ok ? json("ok", "true", "accion", a) : fail("fallo_accion", a);
    }

    /* ================================================================== *
     * 10. VOZ, PORTAPAPELES, COMPARTIR
     * ================================================================== */

    @JavascriptInterface
    public String speak(String texto) {
        activity.decir(texto(texto));
        return json("ok", "true");
    }

    @JavascriptInterface
    public String startListening() {
        if (!tiene(Manifest.permission.RECORD_AUDIO)) {
            return fail("permiso", "Falta el permiso de micrófono.");
        }
        if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
            return fail("sin_stt", "Este teléfono no tiene reconocimiento de voz.");
        }
        activity.escuchar();
        return json("ok", "true", "detalle", "Escuchando…");
    }

    @JavascriptInterface
    public String copyToClipboard(String texto) {
        final String t = texto(texto);
        activity.runOnUiThread(new Runnable() {
            public void run() {
                ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Lumi", t));
            }
        });
        return json("ok", "true");
    }

    @JavascriptInterface
    public String shareText(String texto) {
        final String t = texto(texto);
        activity.runOnUiThread(new Runnable() {
            public void run() {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, t);
                Intent chooser = Intent.createChooser(i, "Compartir con…");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { activity.startActivity(chooser); } catch (Exception ignored) { }
            }
        });
        return json("ok", "true");
    }

    /* ================================================================== *
     * 11. NOTIFICACIÓN LOCAL DE LUMI
     * ================================================================== */

    @JavascriptInterface
    public String notifyLocal(String titulo, String cuerpo) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && !tiene("android.permission.POST_NOTIFICATIONS")) {
                return fail("permiso", "Falta el permiso de notificaciones.");
            }
            NotificationManager nm = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return fail("sin_notificaciones", null);
            if (Build.VERSION.SDK_INT >= 26) {
                android.app.NotificationChannel ch = new android.app.NotificationChannel(
                        "lumi", "Lumi", NotificationManager.IMPORTANCE_DEFAULT);
                nm.createNotificationChannel(ch);
            }
            android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26
                    ? new android.app.Notification.Builder(activity, "lumi")
                    : new android.app.Notification.Builder(activity);
            b.setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle(texto(titulo))
                    .setContentText(texto(cuerpo))
                    .setAutoCancel(true);
            nm.notify((int) (System.currentTimeMillis() % 100000), b.build());
            return json("ok", "true");
        } catch (Exception e) {
            return fail("fallo_notificacion", texto(e.getMessage()));
        }
    }
}
