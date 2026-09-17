# App icon platform policy

`ICON.png` is the single source artwork. Its transparent canvas is preserved for
platforms that permit free-form icons. Platform-specific opaque or masked assets
are intentionally handled separately because no single icon file can preserve
transparency everywhere.

## Current behavior

| Surface | Asset strategy | Transparency behavior |
| --- | --- | --- |
| Windows browser, desktop shortcut, taskbar | Multi-size 32-bit ICO plus transparent PNGs | Preserved where the shell/browser supports it |
| Installed PWA on Windows | Manifest icons with `purpose: "any"` | Preserved; exact-size PNGs reduce scaling artifacts |
| Android native app | Transparent legacy launcher PNG, no `roundIcon` override | Preserved by launchers that allow free-form legacy icons; OEM launchers may still add a plate |
| Android installed PWA | Transparent `purpose: "any"` PNG | Android/Chromium can place it on a white or other solid plate; this cannot be disabled by the app |
| iOS/iPadOS native app and Home Screen web clip | Opaque platform asset | iOS masks icons and does not support transparent Home Screen icon regions |

The PWA manifest deliberately does not label the transparent artwork as
`maskable`. The Web App Manifest specification requires a user agent to composite
transparent pixels in a maskable icon onto a solid fill. Google also documents
that Android places ordinary transparent PWA icons on a white background, while
maskable icons must be opaque and are cropped to an OS-selected shape.

The Android manifest deliberately omits `android:roundIcon`. Android documents
that launchers using this attribute must apply a circular mask. The regular
`android:icon` therefore gives compatible launchers the unmasked, alpha-preserving
bitmap.

The iOS icon stays opaque by design. Apple documents that transparent regions can
produce black borders or backgrounds and that the Home Screen applies its own
rounded mask.

## Regenerating assets

Run this from the repository root after replacing `ICON.png`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-app-icons.ps1
```

The script:

- verifies that the source is square and its four corners are transparent;
- resizes the full source canvas without trimming its transparent padding;
- produces exact-size PNGs for web/PWA and Android density buckets;
- creates a Windows-compatible 32-bit ICO with common shell scale sizes and an
  explicit 1-bit transparency mask.

Do not generate the web icons by trimming the alpha bounds: doing so scales the
rounded artwork to the square canvas edges and makes the transparent surround
effectively disappear.

## Primary references

- Android adaptive icon masks and launcher behavior:
  <https://developer.android.com/develop/ui/compose/system/icon_design_adaptive>
- Web App Manifest icon masking and transparent-pixel compositing:
  <https://www.w3.org/TR/appmanifest/#icon-masks>
- Chromium guidance for ordinary and maskable PWA icons:
  <https://web.dev/articles/maskable-icon>
- Windows icon sizes and transparent background guidance:
  <https://learn.microsoft.com/windows/apps/design/iconography/app-icon-construction>
- Microsoft Edge PWA icon size guidance:
  <https://learn.microsoft.com/microsoft-edge/progressive-web-apps/how-to/icon-theme-color>
- Apple icon transparency limitations:
  <https://developer.apple.com/library/archive/qa/qa1686/_index.html>
