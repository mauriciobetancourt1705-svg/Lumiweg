package com.lumiweg.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.os.Build;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int AUDIO_PERMISSION_REQUEST = 1001;
    private WebView webView;
    private TextToSpeech tts;
    private SharedPreferences prefs;
    private BroadcastReceiver speechReceiver;

    public class LumiBridge {
        @android.webkit.JavascriptInterface
        public void speak(String text) {
            if (text == null || text.trim().isEmpty()) return;
            runOnUiThread(() -> {
                if (tts == null) return;
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "lumi");
            });
        }

        @android.webkit.JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(() -> { if (tts != null) tts.stop(); });
        }

        @android.webkit.JavascriptInterface
        public String getVoices() {
            if (tts == null) return "[]";
            JSONArray out = new JSONArray();
            try {
                Set<Voice> voices = tts.getVoices();
                if (voices != null) {
                    for (Voice v : voices) {
                        Locale locale = v.getLocale();
                        if (locale == null || !"es".equalsIgnoreCase(locale.getLanguage())) continue;
                        JSONObject o = new JSONObject();
                        o.put("name", v.getName());
                        o.put("locale", locale.toLanguageTag());
                        o.put("network", v.isNetworkConnectionRequired());
                        out.put(o);
                    }
                }
            } catch (Exception ignored) {}
            return out.toString();
        }

        @android.webkit.JavascriptInterface
        public boolean setVoice(String voiceName) {
            if (tts == null || voiceName == null) return false;
            try {
                Set<Voice> voices = tts.getVoices();
                if (voices != null) {
                    for (Voice v : voices) {
                        if (voiceName.equals(v.getName())) {
                            tts.setVoice(v);
                            prefs.edit().putString("tts_voice", v.getName()).apply();
                            return true;
                        }
                    }
                }
            } catch (Exception ignored) {}
            return false;
        }

        @android.webkit.JavascriptInterface
        public void openExternal(String url) {
            if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {}
        }

        @android.webkit.JavascriptInterface
        public boolean openYouTubeSearch(String query) {
            String q = query == null ? "" : query.trim();
            String target = q.isEmpty() ? "https://www.youtube.com/" : "https://www.youtube.com/results?search_query=" + Uri.encode(q);
            try {
                Intent youtube = new Intent(Intent.ACTION_VIEW, Uri.parse(target));
                youtube.setPackage("com.google.android.youtube");
                startActivity(youtube);
                return true;
            } catch (Exception ignored) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(target)));
                    return true;
                } catch (Exception ignoredAgain) { return false; }
            }
        }

        @android.webkit.JavascriptInterface
        public void volumeUp() {
            AudioManager am = (AudioManager)getSystemService(AUDIO_SERVICE);
            if (am != null) am.adjustVolume(AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI);
        }

        @android.webkit.JavascriptInterface
        public void volumeDown() {
            AudioManager am = (AudioManager)getSystemService(AUDIO_SERVICE);
            if (am != null) am.adjustVolume(AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI);
        }

        @android.webkit.JavascriptInterface
        public void mediaNext() {
            sendMediaKey(android.view.KeyEvent.KEYCODE_MEDIA_NEXT);
        }

        @android.webkit.JavascriptInterface
        public void mediaPrevious() {
            sendMediaKey(android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS);
        }

        @android.webkit.JavascriptInterface
        public void mediaPlayPause() {
            sendMediaKey(android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE);
        }

        @android.webkit.JavascriptInterface public void openOverlaySettings() { MainActivity.this.openOverlaySettings(); }
        @android.webkit.JavascriptInterface public void openAccessibilitySettings() { MainActivity.this.openAccessibilitySettings(); }
        @android.webkit.JavascriptInterface public boolean isOverlayGranted() { return MainActivity.this.isOverlayGranted(); }
        @android.webkit.JavascriptInterface public void startAssistantMode() { MainActivity.this.startAssistantMode(); }
        @android.webkit.JavascriptInterface public void stopAssistantMode() { MainActivity.this.stopAssistantMode(); }
        @android.webkit.JavascriptInterface public void pauseAssistantMic() { MainActivity.this.pauseAssistantMic(); }
        @android.webkit.JavascriptInterface public void resumeAssistantMic() { MainActivity.this.resumeAssistantMic(); }
        @android.webkit.JavascriptInterface public void openBatterySettings() { MainActivity.this.openBatterySettings(); }
        @android.webkit.JavascriptInterface public boolean androidBack() { return LumiAccessibilityService.instance != null && LumiAccessibilityService.instance.goBack(); }
        @android.webkit.JavascriptInterface public boolean androidHome() { return LumiAccessibilityService.instance != null && LumiAccessibilityService.instance.goHome(); }
        @android.webkit.JavascriptInterface public boolean androidRecents() { return LumiAccessibilityService.instance != null && LumiAccessibilityService.instance.openRecents(); }
        @android.webkit.JavascriptInterface public boolean androidNotifications() { return LumiAccessibilityService.instance != null && LumiAccessibilityService.instance.openNotifications(); }
        @android.webkit.JavascriptInterface public boolean androidQuickSettings() { return LumiAccessibilityService.instance != null && LumiAccessibilityService.instance.openQuickSettings(); }
        @android.webkit.JavascriptInterface public boolean clickText(String text) { return LumiAccessibilityService.instance != null && LumiAccessibilityService.instance.clickText(text); }
        @android.webkit.JavascriptInterface public boolean setFocusedText(String text) { return LumiAccessibilityService.instance != null && LumiAccessibilityService.instance.setText(text); }
        @android.webkit.JavascriptInterface public boolean scrollForward() { return LumiAccessibilityService.instance != null && LumiAccessibilityService.instance.scrollForward(); }
        @android.webkit.JavascriptInterface public boolean scrollBackward() { return LumiAccessibilityService.instance != null && LumiAccessibilityService.instance.scrollBackward(); }
        @android.webkit.JavascriptInterface public boolean tapScreen(float x, float y) { return LumiAccessibilityService.instance != null && LumiAccessibilityService.instance.tap(x,y); }
        @android.webkit.JavascriptInterface public String readScreen() { return LumiAccessibilityService.instance == null ? "[]" : LumiAccessibilityService.instance.dumpUi(); }
        @android.webkit.JavascriptInterface public boolean launchApp(String packageName) {
            if (packageName == null || packageName.trim().isEmpty()) return false;
            try {
                Intent launch = getPackageManager().getLaunchIntentForPackage(packageName.trim());
                if (launch == null) return false;
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launch);
                return true;
            } catch (Exception e) { return false; }
        }
    }

    private void sendMediaKey(int keyCode) {
        AudioManager am = (AudioManager)getSystemService(AUDIO_SERVICE);
        if (am == null) return;
        am.dispatchMediaKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, keyCode));
        am.dispatchMediaKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, keyCode));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("lumi", MODE_PRIVATE);

        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                tts.setLanguage(new Locale("es", "ES"));
                tts.setSpeechRate(0.98f);
                tts.setPitch(1.02f);
                String savedVoice = prefs.getString("tts_voice", "");
                if (!savedVoice.isEmpty()) {
                    try {
                        for (Voice v : tts.getVoices()) {
                            if (savedVoice.equals(v.getName())) {
                                tts.setVoice(v);
                                break;
                            }
                        }
                    } catch (Exception ignored) {}
                }
            }
        });

        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) {}
            @Override public void onDone(String utteranceId) { notifySpeechDone(); }
            @Override public void onError(String utteranceId) { notifySpeechDone(); }
        });

        webView = new WebView(this);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            if (android.os.Build.VERSION.SDK_INT < 23 ||
                                    checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
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

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.addJavascriptInterface(new LumiBridge(), "AndroidLumi");
        setContentView(webView);
        registerLumiSpeechReceiver();

        if (android.os.Build.VERSION.SDK_INT >= 23 &&
                checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_REQUEST);
        } else {
            loadLumi();
        }
    }

    private void registerLumiSpeechReceiver() {
        speechReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                String text = intent.getStringExtra("text");
                if (text == null || text.trim().isEmpty() || webView == null) return;
                String js = "window.LumiNativeSpeech&&window.LumiNativeSpeech(" + org.json.JSONObject.quote(text.trim()) + ")";
                webView.evaluateJavascript(js, null);
            }
        };
        IntentFilter filter = new IntentFilter(LumiMicService.ACTION_SPEECH);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(speechReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(speechReceiver, filter);
    }

    private void notifySpeechDone() {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript(
                    "window.__lumiNativeSpeechDone&&window.__lumiNativeSpeechDone()", null);
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == AUDIO_PERMISSION_REQUEST) loadLumi();
    }

    @android.webkit.JavascriptInterface
    public void openOverlaySettings() {
        try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); }
        catch (Exception e) { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION)); }
    }

    @android.webkit.JavascriptInterface
    public void openAccessibilitySettings() {
        startActivity(new Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS));
    }

    @android.webkit.JavascriptInterface
    public boolean isOverlayGranted() {
        return Build.VERSION.SDK_INT < 23 || android.provider.Settings.canDrawOverlays(this);
    }

    @android.webkit.JavascriptInterface
    public boolean startAssistantMode() {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_REQUEST);
            return false;
        }
        try {
            prefs.edit().putBoolean("assistant_active", true).apply();
            Intent i = new Intent(this, LumiMicService.class);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
            webView.evaluateJavascript("window.LumiAssistantState&&window.LumiAssistantState(true)", null);
            return true;
        } catch (Exception e) {
            prefs.edit().putBoolean("assistant_active", false).apply();
            webView.evaluateJavascript("window.LumiAssistantState&&window.LumiAssistantState(false)", null);
            return false;
        }
    }

    @android.webkit.JavascriptInterface
    public void stopAssistantMode() {
        prefs.edit().putBoolean("assistant_active", false).apply();
        stopService(new Intent(this, LumiMicService.class));
        if (webView != null) webView.evaluateJavascript("window.LumiAssistantState&&window.LumiAssistantState(false)", null);
    }

    public void pauseAssistantMic() {
        stopService(new Intent(this, LumiMicService.class));
    }

    public void resumeAssistantMic() {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        try {
            Intent i = new Intent(this, LumiMicService.class);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
        } catch (Exception ignored) {}
    }

    @android.webkit.JavascriptInterface
    public void openBatterySettings() {
        try { startActivity(new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); }
        catch (Exception ignored) {}
    }

    private String readAssetText(String path) throws Exception {
        try (InputStream in = getAssets().open(path); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    private void loadLumi() {
        try {
            String html = readAssetText("index.html");
            html = html.replace("<script src=\"js/app.js\"></script>", "<script>" + readAssetText("js/app.js") + "</script>");
            html = html.replace("<script src=\"js/lumi-education-transplant.js\"></script>", "<script>" + readAssetText("js/lumi-education-transplant.js") + "</script>");
            String logoSvg = readAssetText("icons/icon-192.svg");
            html = html.replace("src=\"icons/icon-192.svg\"", "src=\"data:image/svg+xml;charset=UTF-8," + Uri.encode(logoSvg) + "\"");
            webView.loadDataWithBaseURL("https://lumi.local/", html, "text/html", "UTF-8", "https://lumi.local/");
        } catch (Exception e) {
            webView.loadUrl("file:///android_asset/index.html");
        }
    }

    @Override
    protected void onDestroy() {
        try { if (speechReceiver != null) unregisterReceiver(speechReceiver); } catch (Exception ignored) {}
        if (prefs == null || !prefs.getBoolean("assistant_active", false)) stopService(new Intent(this, LumiMicService.class));
        if (tts != null) { tts.stop(); tts.shutdown(); tts = null; }
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
