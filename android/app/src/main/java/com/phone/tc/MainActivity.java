package com.phone.tc;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the app-local native bridge before the WebView bridge starts.
        registerPlugin(TimecodeNativeBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
