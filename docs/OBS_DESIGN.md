# OBS link — driving tally from OBS scenes

The desktop console can follow OBS's program and preview scenes and turn them
into the same tally the built-in switcher produces. A director who is already
cutting in OBS gets working camera tally lamps without touching a second
switcher.

## Shape of the integration

```
OBS (obs-websocket 5.x)          this app
┌────────────────────┐           ┌──────────────────────────────────────────┐
│ CurrentProgramScene│──ws://───▶│ ObsWebSocketClient   (utils/ObsWebSocket)│
│ CurrentPreviewScene│           │   scene names, studio-mode flag          │
│ scene list         │           ├──────────────────────────────────────────┤
└────────────────────┘           │ scene → peer id      (utils/obsTally)    │
                                 ├──────────────────────────────────────────┤
                                 │ useObsTally          → {programId,       │
                                 │                          previewId}      │
                                 ├──────────────────────────────────────────┤
                                 │ App.tsx: the switcher's own program /    │
                                 │ preview state                            │
                                 ├──────────────────────────────────────────┤
                                 │ handleSwitcherBusChange → tally payload  │
                                 │ → P2P broadcast → lamps, torch, log      │
                                 └──────────────────────────────────────────┘
```

The only new concept is the **scene → camera map**. Everything after it is the
existing switcher path: OBS feeds the same `effectivePgmSourceId` /
`effectivePreviewSourceId` the manual buses write, so the tally broadcast, the
action log, and the PGM return feed are unchanged code. There is deliberately
no second way for a camera to go live.

## Where it runs

The link lives in the **desktop console on the machine running OBS**, and only
on the device hosting the session (`isHost`). Two reasons:

- Only the master broadcasts tally, so a client that learned OBS's state could
  not do anything with it.
- `ws://` from an `https://` page is mixed content and the browser kills it —
  except for `localhost` / `127.0.0.1` / `::1`, which count as potentially
  trustworthy. OBS on the same machine as the console is therefore the one
  configuration that works from the deployed HTTPS build.

`obsMixedContentWarning` catches the other case before a socket is opened,
because the browser's own failure is an indistinguishable "connection closed".
To reach OBS on a *different* machine, serve the console over `http://` on the
local network (`npm run dev -- --config vite.browser.config.ts`).

## Protocol client

`utils/ObsWebSocket.ts` is a hand-rolled obs-websocket 5.x client rather than
`obs-websocket-js`: the app needs two requests and four events, and this bundle
loads on phones over field networks.

Handshake:

| op | direction | purpose |
| -- | --------- | ------- |
| 0 `Hello` | in | carries the auth challenge when OBS has a password set |
| 1 `Identify` | out | answers the challenge, subscribes to General + Scenes + Ui |
| 2 `Identified` | in | handshake complete |
| 5 `Event` | in | `CurrentProgramSceneChanged`, `CurrentPreviewSceneChanged`, `StudioModeStateChanged`, scene-list changes |
| 6 / 7 `Request` / `RequestResponse` | out / in | `GetSceneList`, `GetStudioModeEnabled` |

Auth answer is `base64(sha256(base64(sha256(password + salt)) + challenge))`,
computed with Web Crypto (secure context only — same requirement as everything
else here).

**Reconnect policy.** Authentication failures (close 4009), a missing password
(4008) and an unsupported RPC version (4011) are terminal: retrying produces
the identical failure and buries the real error. Every other drop — OBS not
started yet, OBS restarted mid-shoot — retries forever with the shared
`computeBackoffDelay`, because the console is typically left running unattended
on set.

**Baseline fetch.** Events carry only what changed, so the client pulls
`GetSceneList` + `GetStudioModeEnabled` on every (re)connect. Without it, a
console attached to an already-running OBS would show nothing until the
director happened to cut.

## Scene → camera mapping

`utils/obsTally.ts` holds the rules, DOM-free and socket-free:

- **One camera, one scene.** Assigning a camera to a scene releases it from
  whichever scene held it before. Two scenes claiming CAM1 would make the live
  lamp depend on OBS's scene order.
- **An unmapped program scene lights nothing.** This is the one place the OBS
  path deliberately diverges from the built-in switcher: it bypasses
  `getAutoSwitcherAssignment`'s "pick some camera" fallback. Titles, a slate, or
  a screen share on program must leave every lamp dark — a red lamp on an
  operator who is not on air is the single failure a tally must not have.
- **Disconnected cameras keep their assignment.** Tally is addressed by peer id,
  so a phone that drops Wi-Fi picks its lamp back up on reconnect instead of
  being cleared and re-lit as a "change".
- **Deleted scenes are hidden, not forgotten.** A mapping whose scene vanished
  is filtered out of the display but stays in storage, so renaming a scene back
  — or reloading a different scene collection — restores it.

Studio Mode off means OBS has no preview bus at all; the client clears the
preview scene in that case rather than leaving a camera stuck on green.

## While OBS is linked

OBS *is* the switcher. The director panel stays a live readout of what OBS is
doing (bus lamps, multiview, PGM/PVW monitors) but its own controls — the
buses, quick select, CUT/AUTO, the T-bar, and the keyboard shortcuts — are
locked out and dimmed, with an `OBS` badge in the header. Leaving them live
would let a director "cut" and see the next OBS event overwrite it immediately.

## Settings and storage

Persisted in `localStorage`: `ltc-obs-enabled`, `ltc-obs-url`,
`ltc-obs-password`, `ltc-obs-mapping`. The password is the obs-websocket
password for a server on the operator's own machine, stored the same way the
rest of the console's settings are; it is not sent anywhere except to OBS.

## Setup

1. OBS → **Tools → WebSocket Server Settings** → enable the server. Note the
   port (4455) and, if authentication is on, **Show Connect Info** for the
   password.
2. Open this console in a browser on the same machine, host the session, and go
   to the **OBS** tab (Alt+5).
3. Tick *Follow OBS scenes*, then map each OBS scene to a connected camera —
   **AUTO MAP** pairs them in order.
