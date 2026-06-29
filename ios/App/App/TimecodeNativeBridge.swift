import Foundation
import Capacitor
import AVFoundation
import MediaPlayer

/**
 * Native audio-session control for stable background LTC output on iOS.
 *
 * - Activates an EXCLUSIVE `.playback` session (no `mixWithOthers`) so system /
 *   notification sounds never bleed into the timecode signal.
 * - Listens for `AVAudioSession.interruptionNotification` (phone calls, etc.),
 *   notifies the web layer, and re-activates the session automatically when the
 *   interruption ends so LTC resumes safely.
 * - Mirrors the current timecode to the lock screen via `MPNowPlayingInfoCenter`.
 */
@objc(TimecodeNativeBridge)
public class TimecodeNativeBridge: CAPPlugin {

    private var interruptionObserver: NSObjectProtocol?

    @objc func startBackgroundMode(_ call: CAPPluginCall) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true, options: [])
            registerInterruptionHandler()
            call.resolve()
        } catch {
            call.reject("Failed to activate audio session: \(error.localizedDescription)")
        }
    }

    @objc func stopBackgroundMode(_ call: CAPPluginCall) {
        removeInterruptionHandler()
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        } catch {
            // Deactivation failures are non-fatal.
        }
        DispatchQueue.main.async {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        }
        call.resolve()
    }

    @objc func updatePlaybackStatus(_ call: CAPPluginCall) {
        let isRunning = call.getBool("isRunning") ?? false
        let timecode = call.getString("timecode") ?? "00:00:00:00"
        DispatchQueue.main.async {
            var info: [String: Any] = [:]
            info[MPMediaItemPropertyTitle] = "LTC " + timecode
            info[MPMediaItemPropertyArtist] = isRunning ? "Timecode running" : "Timecode standby"
            info[MPNowPlayingInfoPropertyPlaybackRate] = isRunning ? 1.0 : 0.0
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        }
        call.resolve()
    }

    private func registerInterruptionHandler() {
        removeInterruptionHandler()
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] notification in
            self?.handleInterruption(notification)
        }
    }

    private func removeInterruptionHandler() {
        if let observer = interruptionObserver {
            NotificationCenter.default.removeObserver(observer)
            interruptionObserver = nil
        }
    }

    private func handleInterruption(_ notification: Notification) {
        guard
            let userInfo = notification.userInfo,
            let rawType = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: rawType)
        else { return }

        switch type {
        case .began:
            notifyListeners("interruptionBegan", data: [:])
        case .ended:
            do {
                try AVAudioSession.sharedInstance().setActive(true, options: [])
            } catch {
                // If reactivation fails the web layer is still notified below.
            }
            notifyListeners("interruptionEnded", data: [:])
        @unknown default:
            break
        }
    }

    deinit {
        removeInterruptionHandler()
    }
}
