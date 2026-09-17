# LTC SYNC PRO

A Capacitor + React + TypeScript app that generates SMPTE LTC (Linear Timecode) audio
directly from a phone's headphone/line output, and keeps multiple devices in sync via
NTP time servers or a peer-to-peer (PeerJS) connection. Built for multi-camera film/video
shoots where a hardware timecode generator isn't available.

## Features

- SMPTE LTC audio generation via `AudioWorklet` (23.976 / 24 / 25 / 29.97 / 29.97 DF / 30 fps,
  drop-frame support, SMPTE 12M biphase-mark polarity correction bit)
- Time sync via NTP-style time servers, or direct device-to-device P2P (PeerJS)
- Take/marker logging with scene, take, and comment fields; EDL and ALE export
- Battery monitoring, wake lock, and native background-audio support (iOS/Android via
  Capacitor plugins)

Tally-lamp control (with OBS scene linking) and the multi-camera video switcher/return
monitor used to live here; they've moved out into a separate, standalone app so this one
stays focused on timecode. See [docs/TALLY_DESIGN.md](docs/TALLY_DESIGN.md) and
[docs/OBS_DESIGN.md](docs/OBS_DESIGN.md) in that project for their design notes.

## Stack

- React 19 + TypeScript, built with Vite
- Capacitor 8 for iOS/Android native shells (`@capacitor/status-bar`,
  `@capacitor/screen-orientation`, `@capacitor/filesystem`, `@capacitor/preferences`,
  plus a custom `TimecodeNativeBridge` plugin for background audio, lock-screen
  timecode display, and torch control)
- `smpte-timecode` for timecode math, `peerjs` for P2P sync
- Vitest + jsdom for unit tests, ESLint (flat config) for linting

## Development

```bash
npm install
npm run dev        # start the Vite dev server
npm run lint        # eslint .
npm run test        # vitest (watch mode)
npm run test:cov    # vitest run --coverage (80% threshold on src/utils/**)
npm run build        # tsc -b && vite build
```

CI (`.github/workflows/ci.yml`) runs `lint` → `test:cov` → `build` on every push/PR.

## Native builds

This is a Capacitor project — after building the web bundle, sync and open the native
project as usual:

```bash
npm run build
npx cap sync
npx cap open ios       # or: npx cap open android
```

The native layer provides background audio (so LTC keeps playing when the screen locks
or the app backgrounds), lock-screen timecode display, and torch control for tally. See
[docs/BACKGROUND_DESIGN.md](docs/BACKGROUND_DESIGN.md) for the background-mode
architecture.

## Design docs

- [docs/BACKGROUND_DESIGN.md](docs/BACKGROUND_DESIGN.md) — background audio / native
  bridge architecture (iOS `AVAudioSession`, Android foreground service)
- [Log/](Log/) — dated work logs from past development sessions
