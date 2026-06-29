#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers the Swift plugin with the Capacitor runtime so the WebView bridge
// can discover it. Method names must match the @objc functions in
// TimecodeNativeBridge.swift and the TypeScript interface.
CAP_PLUGIN(TimecodeNativeBridge, "TimecodeNativeBridge",
    CAP_PLUGIN_METHOD(startBackgroundMode, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stopBackgroundMode, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(updatePlaybackStatus, CAPPluginReturnPromise);
)
