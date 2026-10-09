package com.lumiweg.app;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;

/**
 * LumiAccessibilityService — le da a Lumi las manos para tocar el sistema.
 *
 * Con esto puede: volver atrás, ir al inicio, abrir recientes, desplegar el
 * panel de notificaciones y bloquear la pantalla. El usuario lo activa a mano
 * en Ajustes > Accesibilidad > Lumiweg (Android no permite hacerlo por código).
 */
public class LumiAccessibilityService extends AccessibilityService {

    private static LumiAccessibilityService instancia;

    public static boolean activo() {
        return instancia != null;
    }

    public static boolean ejecutar(int accionGlobal) {
        LumiAccessibilityService s = instancia;
        if (s == null) return false;
        try {
            return s.performGlobalAction(accionGlobal);
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instancia = this;
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        instancia = null;
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        instancia = null;
        super.onDestroy();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // Lumi no espía la pantalla en segundo plano: solo actúa cuando se lo piden.
    }

    @Override
    public void onInterrupt() {
    }
}
