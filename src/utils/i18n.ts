/**
 * i18n.ts — tiny dependency-free translation layer (English / Japanese).
 *
 * A single `t(key, lang, vars?)` lookup with `{var}` interpolation and graceful
 * fallback (missing key → English → the key itself). Language is detected from
 * localStorage, then the browser locale, defaulting to English. Pure logic, no
 * DOM — unit-testable; the React side just holds a `lang` state and re-renders.
 */

export type Lang = 'en' | 'ja';
export const LANGS: readonly Lang[] = ['en', 'ja'];

const LANG_STORAGE_KEY = 'ltc-lang';

type Dict = Record<string, string>;

const en: Dict = {
  'tab.main': 'MAIN',
  'tab.sync': 'SYNC',
  'tab.tools': 'TOOLS',

  'status.ready': 'READY',
  'status.syncing': 'SYNCING',
  'status.live': 'LTC OUT',

  'guide.aria': 'Camera sync setup guide',
  'mode.freerun': 'FREE',
  'label.startTc': 'START TIMECODE',
  'drift.ago': 'ago',

  'label.frameRate': 'FRAME RATE',
  'label.outputVolume': 'OUTPUT VOLUME & LEVEL',
  'label.outputMode': 'OUTPUT MODE (FOR DSLR SYNC)',
  'label.syncMethod': 'SYNC METHOD',
  'label.p2p': 'P2P NETWORK',
  'label.userBits': 'USER BITS (HEX)',
  'label.defaultReel': 'DEFAULT REEL NAME',
  'label.quickMark': 'QUICK MARK',
  'label.loggedTakes': 'LOGGED TAKES',

  'btn.createMaster': 'CREATE MASTER',
  'btn.joinClient': 'JOIN AS CLIENT',
  'btn.reset': 'RESET',
  'btn.auto': 'AUTO (DATE)',
  'btn.start': 'START',
  'btn.stop': 'STOP',
  'btn.holdToStop': 'HOLD TO STOP',
  'btn.holding': 'HOLD…',
  'btn.prep': 'PREP...',
  'btn.resume': 'RESUME',
  'btn.pause': 'PAUSE',
  'btn.mark': 'MARK',
  'btn.gotIt': 'GOT IT',

  'color.red': 'RED',
  'color.blue': 'BLUE',
  'color.green': 'GREEN',
  'color.yellow': 'YELLOW',
  'marker.redTitle': 'Red marker',
  'marker.blueTitle': 'Blue marker',
  'marker.greenTitle': 'Green marker',
  'marker.yellowTitle': 'Yellow marker',
  'markers.none': 'NO MARKERS RECORDED',

  'drift.accuracy': 'ACCURACY',
  'drift.lastSync': 'Last sync',
  'drift.estDrift': 'Est. drift',
  'drift.clockError': 'Clock error',
  'drift.rejam': 'RE-SYNC RECOMMENDED',

  'sync.label': 'SYNC',
  'sync.network': 'NETWORK',
  'sync.resync': 'RE-SYNC',
  'sync.resyncing': 'SYNCING…',

  'guide.title': 'CAMERA SYNC — QUICK SETUP',
  'guide.step1': "Connect this phone's audio output to the camera's MIC / LINE input with a 3.5mm TRS cable.",
  'guide.step2': 'OUTPUT MODE: pick "L-TC / R-AUDIO" to also record reference audio, or "STEREO TC" for timecode only.',
  'guide.step3': "OUTPUT LEVEL: start at LINE. If the camera can't read TC, switch to MIC (lower level).",
  'guide.step4': 'Match FRAME RATE (and drop-frame) to your camera exactly — an FPS mismatch is the #1 sync error.',
  'guide.step5': "Press START, then confirm the camera's timecode matches the value on screen.",
  'guide.tip': 'Keep the app running in the foreground or via background mode. Re-jam whenever you see RE-SYNC RECOMMENDED.',

  'slate.close': 'TAP FOR CLAPPER / LONG PRESS TO CLOSE',

  'toast.interruptBegan': 'AUDIO INTERRUPTION — LTC PAUSED',
  'toast.interruptEnded': 'INTERRUPTION ENDED — LTC RESUMED',
  'toast.p2pInitFailed': 'P2P INIT FAILED — CHECK NETWORK',
  'toast.p2pClientFailed': 'P2P CLIENT INIT FAILED — CHECK NETWORK',
  'toast.resynced': 'RE-SYNCED',
  'toast.resyncFailed': 'RE-SYNC FAILED — CHECK NETWORK',
  'toast.ntpCached': 'NTP SERVERS UNREACHABLE — USING CACHED OFFSET',
  'toast.ntpFailed': 'NTP SYNC FAILED — USING SYSTEM CLOCK',
  'toast.startFailed': 'START FAILED — CHECK CONNECTION',
  'toast.micDenied': 'MIC ACCESS DENIED — CHECK BROWSER PERMISSIONS',
};

const ja: Dict = {
  'tab.main': 'メイン',
  'tab.sync': '同期',
  'tab.tools': 'ツール',

  'status.ready': '待機中',
  'status.syncing': '同期中',
  'status.live': 'LTC出力中',

  'guide.aria': 'カメラ同期セットアップガイド',
  'mode.freerun': 'フリー',
  'label.startTc': '開始タイムコード',
  'drift.ago': '前',

  'label.frameRate': 'フレームレート',
  'label.outputVolume': '出力音量・レベル',
  'label.outputMode': '出力モード（DSLR同期用）',
  'label.syncMethod': '同期方式',
  'label.p2p': 'P2Pネットワーク',
  'label.userBits': 'ユーザービット（HEX）',
  'label.defaultReel': 'デフォルトリール名',
  'label.quickMark': 'クイックマーク',
  'label.loggedTakes': '記録したテイク',

  'btn.createMaster': 'マスター作成',
  'btn.joinClient': 'クライアントで参加',
  'btn.reset': 'リセット',
  'btn.auto': '自動（日付）',
  'btn.start': '開始',
  'btn.stop': '停止',
  'btn.holdToStop': '長押しで停止',
  'btn.holding': '長押し中…',
  'btn.prep': '準備中…',
  'btn.resume': '再開',
  'btn.pause': '一時停止',
  'btn.mark': 'マーク',
  'btn.gotIt': 'OK',

  'color.red': '赤',
  'color.blue': '青',
  'color.green': '緑',
  'color.yellow': '黄',
  'marker.redTitle': '赤マーカー',
  'marker.blueTitle': '青マーカー',
  'marker.greenTitle': '緑マーカー',
  'marker.yellowTitle': '黄マーカー',
  'markers.none': 'マーカーはまだありません',

  'drift.accuracy': '精度',
  'drift.lastSync': '最終同期',
  'drift.estDrift': '推定ズレ',
  'drift.clockError': 'クロック誤差',
  'drift.rejam': '要再同期',

  'sync.label': '同期',
  'sync.network': 'ネットワーク',
  'sync.resync': '再同期',
  'sync.resyncing': '同期中…',

  'guide.title': 'カメラ同期 — クイックセットアップ',
  'guide.step1': '本機の音声出力を、3.5mm TRSケーブルでカメラのMIC/LINE入力に接続します。',
  'guide.step2': '出力モード：参考音声も録るなら「L-TC / R-AUDIO」、TCのみなら「STEREO TC」を選びます。',
  'guide.step3': '出力レベル：まずLINE。カメラがTCを読めない場合はMIC（低レベル）に切り替えます。',
  'guide.step4': 'フレームレート（とドロップフレーム）をカメラと完全に一致させます。FPSの不一致は同期ミスの最多原因です。',
  'guide.step5': 'STARTを押し、カメラのタイムコードが画面の値と一致するか確認します。',
  'guide.tip': 'アプリは前面、またはバックグラウンドモードで動かし続けてください。「要再同期」が出たら再同期してください。',

  'slate.close': 'タップでカチンコ / 長押しで閉じる',

  'toast.interruptBegan': 'オーディオ割り込み発生 — LTCを一時中断',
  'toast.interruptEnded': '割り込み終了 — LTC出力を自動復帰',
  'toast.p2pInitFailed': 'P2P初期化に失敗 — ネットワークを確認',
  'toast.p2pClientFailed': 'P2Pクライアント初期化に失敗 — ネットワークを確認',
  'toast.resynced': '再同期しました',
  'toast.resyncFailed': '再同期に失敗 — ネットワークを確認',
  'toast.ntpCached': 'NTPサーバーに接続できません — キャッシュのオフセットを使用',
  'toast.ntpFailed': 'NTP同期に失敗 — システムクロックを使用',
  'toast.startFailed': '開始に失敗 — 接続を確認',
  'toast.micDenied': 'マイクへのアクセスが拒否されました — ブラウザの権限を確認',
};

const DICTS: Record<Lang, Dict> = { en, ja };

export function t(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const table = DICTS[lang] ?? en;
  let out = table[key] ?? en[key] ?? key;
  if (vars) {
    for (const name of Object.keys(vars)) {
      out = out.split(`{${name}}`).join(String(vars[name]));
    }
  }
  return out;
}

export function getInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'ja') return saved;
  } catch { /* ignore */ }
  if (typeof navigator !== 'undefined' && typeof navigator.language === 'string'
      && navigator.language.toLowerCase().startsWith('ja')) {
    return 'ja';
  }
  return 'en';
}

export function persistLang(lang: Lang): void {
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* ignore */ }
}
