package com.lumiweg.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;
import org.json.JSONArray;

import java.util.ArrayList;
import java.util.Locale;
import java.util.Set;

/**
 * MainActivity — el contenedor de Lumi.
 *
 * Antes esto era un WebView que solo sabía abrir URLs. Ahora monta el puente
 * completo (LumiNative -> LumiBridge) y resuelve lo que el WebView de Android
 * no puede hacer por sí solo: hablar (TTS), escuchar (STT nativo, porque el
 * WebView no implementa la Web Speech API) y pedir permisos en runtime.
 */
public class MainActivity extends Activity {

    private static final int CODE_PERMISOS = 2001;

    private WebView webView;
    private LumiBridge bridge;
    private TextToSpeech tts;
    private SpeechRecognizer stt;
    private boolean escuchando = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        bridge = new LumiBridge(this);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Los enlaces externos se abren en el navegador, no dentro de Lumi.
                if (url != null && url.startsWith("file://")) return false;
                if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)));
                        return true;
                    } catch (Exception ignored) {
                    }
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    for (String recurso : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(recurso)) {
                            if (Build.VERSION.SDK_INT < 23
                                    || checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                                    == PackageManager.PERMISSION_GRANTED) {
                                request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                            } else {
                                request.deny();
                            }
                            return;
                        }
                    }
                    request.deny();
                });
            }
        });

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        // Los assets son locales: permitimos que el JS pueda pedir cosas fuera.
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(false);

        webView.addJavascriptInterface(bridge, "LumiNative");
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);

        setContentView(webView);

        iniciarVoz();
        loadLumi();
        pedirPermisosBasicos();
    }

    private void loadLumi() {
        webView.loadUrl("file:///android_asset/index.html");
    }

    /** Se llama desde el bridge: pedir permisos siempre en el hilo de UI. */
    public void pedirPermisos(final String[] permisos) {
        runOnUiThread(() -> {
            try {
                requestPermissions(permisos, CODE_PERMISOS);
            } catch (Exception ignored) {
            }
        });
    }

    private void pedirPermisosBasicos() {
        if (Build.VERSION.SDK_INT < 23) return;
        ArrayList<String> faltan = new ArrayList<>();
        String[] basicos = {
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.SEND_SMS,
                Manifest.permission.READ_CONTACTS,
                Manifest.permission.CALL_PHONE,
                Manifest.permission.READ_CALENDAR,
                Manifest.permission.WRITE_CALENDAR
        };
        for (String p : basicos) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) faltan.add(p);
        }
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            faltan.add("android.permission.POST_NOTIFICATIONS");
        }
        if (!faltan.isEmpty()) {
            requestPermissions(faltan.toArray(new String[0]), CODE_PERMISOS);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        // La interfaz de permisos se redibuja con el estado real.
        evaluarJs("window.Lumi&&window.Lumi.renderPerms&&window.Lumi.renderPerms();");
    }

    /** Ejecuta JavaScript en la página, siempre en el hilo de UI. */
    public void evaluarJs(final String js) {
        runOnUiThread(() -> {
            try {
                if (webView != null) webView.evaluateJavascript(js, null);
            } catch (Exception ignored) {
            }
        });
    }

    /* ================================================================== *
     * VOZ: TTS (hablar) y STT nativo (escuchar)
     * ================================================================== */

    private void iniciarVoz() {
        try {
            tts = new TextToSpeech(this, status -> {
                if (status == TextToSpeech.SUCCESS && tts != null) {
                    try {
                        tts.setLanguage(new Locale("es", "ES"));
                        tts.setSpeechRate(1.0f);
                        String savedVoice = getPreferences(MODE_PRIVATE).getString("lumi_tts_voice", "");
                        if (!savedVoice.isEmpty() && tts.getVoices() != null) {
                            for (Voice voice : tts.getVoices()) {
                                if (savedVoice.equals(voice.getName())) { tts.setVoice(voice); break; }
                            }
                        }
                        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                            @Override public void onStart(String utteranceId) { }
                            @Override public void onDone(String utteranceId) {
                                if ("lumi".equals(utteranceId)) evaluarJs("window.Lumi&&Lumi.onSpeechFinished&&Lumi.onSpeechFinished();");
                            }
                            @Override public void onError(String utteranceId) {
                                if ("lumi".equals(utteranceId)) evaluarJs("window.Lumi&&Lumi.onSpeechFinished&&Lumi.onSpeechFinished();");
                            }
                        });
                    } catch (Exception ignored) {
                    }
                }
            });
        } catch (Exception ignored) {
        }
    }

    public void decir(final String texto) {
        if (texto == null || texto.trim().isEmpty()) return;
        runOnUiThread(() -> {
            try {
                if (tts == null) iniciarVoz();
                if (tts != null) tts.speak(texto, TextToSpeech.QUEUE_FLUSH, null, "lumi");
            } catch (Exception ignored) {
            }
        });
    }

    public String vocesDisponibles() {
        JSONArray out = new JSONArray();
        try {
            if (tts == null || tts.getVoices() == null) return out.toString();
            for (Voice v : tts.getVoices()) {
                Locale locale = v.getLocale();
                if (locale == null || !"es".equalsIgnoreCase(locale.getLanguage())) continue;
                JSONObject item = new JSONObject();
                item.put("name", v.getName());
                item.put("locale", locale.toLanguageTag());
                item.put("network", v.isNetworkConnectionRequired());
                out.put(item);
            }
        } catch (Exception ignored) { }
        return out.toString();
    }

    public boolean seleccionarVoz(String voiceName) {
        if (tts == null || voiceName == null) return false;
        try {
            Set<Voice> voices = tts.getVoices();
            if (voices != null) for (Voice v : voices) {
                if (voiceName.equals(v.getName()) && v.getLocale() != null
                        && "es".equalsIgnoreCase(v.getLocale().getLanguage())) {
                    if (tts.setVoice(v) == TextToSpeech.SUCCESS) {
                        getPreferences(MODE_PRIVATE).edit().putString("lumi_tts_voice", v.getName()).apply();
                        return true;
                    }
                }
            }
        } catch (Exception ignored) { }
        return false;
    }

    public void detenerVoz() {
        runOnUiThread(() -> { try { if (tts != null) tts.stop(); } catch (Exception ignored) { } });
    }

    /** STT nativo: el WebView de Android no tiene SpeechRecognition. */
    public void escuchar() {
        runOnUiThread(() -> {
            try {
                if (escuchando) {
                    if (stt != null) stt.stopListening();
                    return;
                }
                if (stt == null) {
                    stt = SpeechRecognizer.createSpeechRecognizer(this);
                    stt.setRecognitionListener(new RecognitionListener() {
                        @Override public void onReadyForSpeech(Bundle params) {
                            evaluarJs("window.Lumi&&Lumi.onVoiceState&&Lumi.onVoiceState('Escuchando…');");
                        }
                        @Override public void onBeginningOfSpeech() { }
                        @Override public void onRmsChanged(float rmsdB) { }
                        @Override public void onBufferReceived(byte[] buffer) { }
                        @Override public void onEndOfSpeech() { }
                        @Override public void onError(int error) {
                            escuchando = false;
                            evaluarJs("window.Lumi&&Lumi.onVoiceState&&Lumi.onVoiceState('No te escuché, prueba otra vez');");
                        }
                        @Override public void onResults(Bundle results) {
                            escuchando = false;
                            String texto = "";
                            try {
                                ArrayList<String> r = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                                if (r != null && !r.isEmpty()) texto = r.get(0);
                            } catch (Exception ignored) {
                            }
                            if (!texto.isEmpty()) {
                                evaluarJs("window.Lumi&&Lumi.onVoiceResult&&Lumi.onVoiceResult("
                                        + JSONObject.quote(texto) + ");");
                            } else {
                                evaluarJs("window.Lumi&&Lumi.onVoiceState&&Lumi.onVoiceState('No entendí nada');");
                            }
                        }
                        @Override public void onPartialResults(Bundle partialResults) {
                            try {
                                ArrayList<String> r = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                                if (r != null && !r.isEmpty()) {
                                    evaluarJs("window.Lumi&&Lumi.onVoiceState&&Lumi.onVoiceState("
                                            + JSONObject.quote(r.get(0)) + ");");
                                }
                            } catch (Exception ignored) {
                            }
                        }
                        @Override public void onEvent(int eventType, Bundle params) { }
                    });
                }
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES");
                i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                escuchando = true;
                stt.startListening(i);
            } catch (Exception e) {
                escuchando = false;
                evaluarJs("window.Lumi&&Lumi.onVoiceState&&Lumi.onVoiceState('La voz falló en este teléfono');");
            }
        });
    }

    /* ================================================================== *
     * Ciclo de vida
     * ================================================================== */

    @Override
    public void onBackPressed() {
        // Dentro de Lumi, atrás vuelve a Inicio; desde Inicio, minimiza la app.
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        try {
            webView.evaluateJavascript(
                    "(function(){var a=document.querySelector('.screen.active');"
                            + "if(a&&a.id!=='s-home'){Lumi.go('s-home');return 'inicio';}return 'salir';})()",
                    value -> {
                        if (value == null || value.contains("salir")) moveTaskToBack(true);
                    });
        } catch (Exception e) {
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onDestroy() {
        try {
            if (tts != null) { tts.stop(); tts.shutdown(); }
            if (stt != null) { stt.destroy(); }
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }
}
