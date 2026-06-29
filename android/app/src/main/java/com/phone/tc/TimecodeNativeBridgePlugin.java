package com.phone.tc;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor bridge that starts/stops the {@link TimecodeForegroundService} and
 * keeps its notification in sync with the current timecode. Method names and
 * parameters mirror the TypeScript interface in src/utils/TimecodeNativeBridge.ts.
 */
@CapacitorPlugin(name = "TimecodeNativeBridge")
public class TimecodeNativeBridgePlugin extends Plugin {

    @PluginMethod
    public void startBackgroundMode(PluginCall call) {
        Intent intent = new Intent(getContext(), TimecodeForegroundService.class);
        intent.putExtra(TimecodeForegroundService.EXTRA_TIMECODE, call.getString("timecode", "00:00:00:00"));
        intent.putExtra(TimecodeForegroundService.EXTRA_RUNNING, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopBackgroundMode(PluginCall call) {
        Intent intent = new Intent(getContext(), TimecodeForegroundService.class);
        getContext().stopService(intent);
        call.resolve();
    }

    @PluginMethod
    public void updatePlaybackStatus(PluginCall call) {
        boolean running = Boolean.TRUE.equals(call.getBoolean("isRunning", false));
        String timecode = call.getString("timecode", "00:00:00:00");
        TimecodeForegroundService.updateStatus(running, timecode);
        call.resolve();
    }
}
