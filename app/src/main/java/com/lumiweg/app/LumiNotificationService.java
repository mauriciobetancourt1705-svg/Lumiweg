package com.lumiweg.app;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * LumiNotificationService — deja que Lumi lea los avisos del teléfono
 * ("¿qué me ha llegado?") sin abrir cada app.
 *
 * Guarda las últimas notificaciones en memoria, con tope, para no crecer.
 * El usuario lo activa a mano en Ajustes > Notificaciones > Acceso a notificaciones.
 */
public class LumiNotificationService extends NotificationListenerService {

    private static final int MAX = 60;
    private static LumiNotificationService instancia;
    private static final LinkedHashMap<String, JSONObject> ULTIMAS = new LinkedHashMap<>();

    public static boolean conectado() {
        return instancia != null;
    }

    public static JSONArray ultimas(int limite) {
        JSONArray a = new JSONArray();
        List<JSONObject> copia;
        synchronized (ULTIMAS) {
            copia = new ArrayList<>(ULTIMAS.values());
        }
        int desde = Math.max(0, copia.size() - Math.max(1, limite));
        for (int i = copia.size() - 1; i >= desde; i--) a.put(copia.get(i));
        return a;
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        instancia = this;
        try {
            StatusBarNotification[] activas = getActiveNotifications();
            if (activas != null) for (StatusBarNotification s : activas) guardar(s);
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onListenerDisconnected() {
        instancia = null;
        super.onListenerDisconnected();
    }

    @Override
    public void onDestroy() {
        instancia = null;
        super.onDestroy();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        guardar(sbn);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (sbn == null) return;
        synchronized (ULTIMAS) {
            ULTIMAS.remove(clave(sbn));
        }
    }

    private static String clave(StatusBarNotification sbn) {
        return sbn.getPackageName() + "#" + sbn.getId() + "#" + sbn.getTag();
    }

    private void guardar(StatusBarNotification sbn) {
        if (sbn == null) return;
        try {
            if (sbn.getPackageName().equals(getPackageName())) return;
            Notification n = sbn.getNotification();
            if (n == null) return;
            Bundle ex = n.extras;
            String titulo = ex != null ? String.valueOf(ex.getCharSequence(Notification.EXTRA_TITLE)) : "";
            String texto = ex != null ? String.valueOf(ex.getCharSequence(Notification.EXTRA_TEXT)) : "";
            if ((titulo == null || titulo.equals("null")) && (texto == null || texto.equals("null"))) return;

            String app = sbn.getPackageName();
            try {
                android.content.pm.PackageManager pm = getPackageManager();
                app = String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(sbn.getPackageName(), 0)));
            } catch (Exception ignored) {
            }

            JSONObject o = new JSONObject();
            o.put("app", app);
            o.put("paquete", sbn.getPackageName());
            o.put("titulo", titulo == null || titulo.equals("null") ? "" : titulo);
            o.put("texto", texto == null || texto.equals("null") ? "" : texto);
            o.put("cuando", sbn.getPostTime());
            o.put("hora", new java.text.SimpleDateFormat("HH:mm", java.util.Locale.US)
                    .format(new java.util.Date(sbn.getPostTime())));

            synchronized (ULTIMAS) {
                ULTIMAS.remove(clave(sbn));
                ULTIMAS.put(clave(sbn), o);
                while (ULTIMAS.size() > MAX) {
                    Map.Entry<String, JSONObject> primero = ULTIMAS.entrySet().iterator().next();
                    ULTIMAS.remove(primero.getKey());
                }
            }
        } catch (Exception ignored) {
        }
    }
}
