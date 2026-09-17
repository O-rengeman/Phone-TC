package com.phone.tc;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Foreground service that keeps the process (and therefore the WebView's
 * AudioWorklet LTC output) alive while the app is backgrounded or the device is
 * locked. Declared as {@code mediaPlayback} type in the manifest, which is the
 * Android 14+ requirement for audio that must not be suspended.
 */
public class TimecodeForegroundService extends Service {

    public static final String CHANNEL_ID = "ltc_timecode_channel";
    public static final int NOTIFICATION_ID = 4711;
    public static final String EXTRA_TIMECODE = "timecode";
    public static final String EXTRA_RUNNING = "running";

    @Nullable
    private static TimecodeForegroundService instance;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String tc = intent != null ? intent.getStringExtra(EXTRA_TIMECODE) : "00:00:00:00";
        boolean running = intent == null || intent.getBooleanExtra(EXTRA_RUNNING, true);
        Notification notification = buildNotification(tc == null ? "00:00:00:00" : tc, running);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        // Restart if the OS kills us while LTC should still be running.
        return START_STICKY;
    }

    /** Updates the ongoing notification with the latest timecode / state. */
    public static void updateStatus(boolean running, String timecode) {
        TimecodeForegroundService service = instance;
        if (service == null) {
            return;
        }
        NotificationManager nm = (NotificationManager) service.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, service.buildNotification(timecode, running));
        }
    }

    private Notification buildNotification(String timecode, boolean running) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(running ? "LTC OUTPUT ACTIVE" : "LTC STANDBY")
                .setContentText("TC " + timecode)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Timecode Output",
                        NotificationManager.IMPORTANCE_LOW
                );
                channel.setShowBadge(false);
                channel.setSound(null, null);
                nm.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
