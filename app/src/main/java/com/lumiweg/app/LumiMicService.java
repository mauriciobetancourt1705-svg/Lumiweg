package com.lumiweg.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import java.util.ArrayList;
import java.util.Locale;

public class LumiMicService extends Service {
    public static final String ACTION_SPEECH = "com.lumiweg.app.LUMI_SPEECH";
    public static final String ACTION_STATUS = "com.lumiweg.app.LUMI_STATUS";
    private static final String CHANNEL_ID = "lumi_assistant";
    private static final int NOTIFICATION_ID = 701;
    private SpeechRecognizer recognizer;
    private boolean running = false;
    private boolean restarting = false;

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        Notification.Builder nb = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        Notification notification = nb
            .setContentTitle("Lumi está activa")
            .setContentText("Lumi puede escucharte mientras usas otras aplicaciones.")
            .setSmallIcon(R.drawable.lumi_original)
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(
                CHANNEL_ID, "Lumi — asistente por voz",
                NotificationManager.IMPORTANCE_LOW
            );
            c.setDescription("Escucha continua de Lumi cuando el usuario la activa.");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(c);
        }
    }

    private void startRecognition() {
        if (!running) return;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            broadcastError("recognition_unavailable");
            return;
        }
        try {
            if (recognizer != null) recognizer.destroy();
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onPartialResults(Bundle partialResults) {}
                @Override public void onEvent(int eventType, Bundle params) {}
                @Override public void onError(int error) { broadcastStatus("error:" + error); scheduleRestart(); }
                @Override public void onResults(Bundle results) {
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty()) {
                        String spoken = matches.get(0).trim();
                        getSharedPreferences("lumi", MODE_PRIVATE).edit().putString("pending_speech", spoken).putLong("pending_speech_at", System.currentTimeMillis()).apply();
                        Intent i = new Intent(ACTION_SPEECH);
                        i.setPackage(getPackageName());
                        i.putExtra("text", spoken);
                        sendBroadcast(i);
                    }
                    scheduleRestart();
                }
            });
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES");
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "es-ES");
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            recognizer.startListening(intent);
        } catch (Exception e) {
            scheduleRestart();
        }
    }

    private void scheduleRestart() {
        if (!running || restarting) return;
        restarting = true;
        new android.os.Handler(getMainLooper()).postDelayed(() -> {
            restarting = false;
            if (running) startRecognition();
        }, 650);
    }

    private void broadcastStatus(String value) {
        Intent i = new Intent(ACTION_STATUS);
        i.setPackage(getPackageName());
        i.putExtra("status", value);
        sendBroadcast(i);
    }

    private void broadcastError(String value) {
        Intent i = new Intent(ACTION_SPEECH);
        i.setPackage(getPackageName());
        i.putExtra("error", value);
        sendBroadcast(i);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        running = true;
        if (recognizer == null) startRecognition();
        broadcastStatus("listening");
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        running = false;
        restarting = false;
        if (recognizer != null) {
            try { recognizer.stopListening(); } catch (Exception ignored) {}
            recognizer.destroy();
            recognizer = null;
        }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
