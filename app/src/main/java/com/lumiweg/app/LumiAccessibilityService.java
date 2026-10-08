package com.lumiweg.app;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;

public class LumiAccessibilityService extends AccessibilityService {
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        // Lumi no necesita leer el contenido de otras apps para funcionar.
        // Este servicio queda reservado para acciones globales explícitas.
    }

    @Override public void onInterrupt() {}

    public static LumiAccessibilityService instance;

    @Override protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override public boolean onUnbind(android.content.Intent intent) {
        instance = null;
        return super.onUnbind(intent);
    }

    public boolean goBack() { return performGlobalAction(GLOBAL_ACTION_BACK); }
    public boolean goHome() { return performGlobalAction(GLOBAL_ACTION_HOME); }
    public boolean openRecents() { return performGlobalAction(GLOBAL_ACTION_RECENTS); }
}
