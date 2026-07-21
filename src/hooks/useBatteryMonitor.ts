import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { estimateMinutesRemaining, trimSamples } from '../utils/battery';
import type { BatterySample } from '../utils/battery';
import { t as translate } from '../utils/i18n';
import type { Lang } from '../utils/i18n';

type BatteryLike = {
  level: number;
  charging: boolean;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
};

interface UseBatteryMonitorResult {
  batteryLevel: number | null;
  isCharging: boolean;
  batteryEta: number | null;
}

const SAMPLE_WINDOW_MS = 15 * 60_000;

/**
 * Tracks battery level/charging state via the (non-standard) Battery Status
 * API, estimates remaining runtime from a rolling sample window, and toasts
 * low/critical-battery and charging-state-change notifications.
 *
 * langRef is read (not lang state) so the toast messages always use the
 * current language without needing this effect to depend on `lang` and
 * re-subscribe to the battery events on every language change.
 */
export function useBatteryMonitor(langRef: React.RefObject<Lang>): UseBatteryMonitorResult {
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  const [batteryEta, setBatteryEta] = useState<number | null>(null);
  const batterySamplesRef = useRef<BatterySample[]>([]);
  const prevLevelRef = useRef<number | null>(null);
  const prevChargingRef = useRef<boolean | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (!nav.getBattery) return;
    let batt: BatteryLike | null = null;
    let cancelled = false;
    const onLevel = () => {
      if (!batt) return;
      setBatteryLevel(batt.level);
      setIsCharging(batt.charging);

      const p = prevLevelRef.current;
      const c = batt.level;
      if (p !== null && !batt.charging) {
        if (p > 0.20 && c <= 0.20 && c > 0.10) {
          toast(translate('toast.batteryLow', langRef.current, { level: Math.round(c * 100) }), { icon: 'BAT', style: { background: '#1d1d20', color: '#f4f4f5', border: '1px solid #5a5a60' } });
        } else if (p > 0.10 && c <= 0.10) {
          toast.error(translate('toast.batteryCritical', langRef.current, { level: Math.round(c * 100) }));
        }
      }
      prevLevelRef.current = c;
      prevChargingRef.current = batt.charging;

      if (batt.charging) {
        batterySamplesRef.current = [];
        setBatteryEta(null);
        return;
      }
      const now = Date.now();
      const buf = trimSamples([...batterySamplesRef.current, { level: batt.level, at: now }], now, SAMPLE_WINDOW_MS);
      batterySamplesRef.current = buf;
      setBatteryEta(estimateMinutesRemaining(buf));
    };
    const onCharging = () => {
      if (!batt) return;
      setIsCharging(batt.charging);

      const p = prevChargingRef.current;
      const c = batt.charging;
      if (p !== null && p !== c) {
        if (c) {
          toast.success(translate('toast.chargingStarted', langRef.current));
        } else {
          toast(translate('toast.chargingStopped', langRef.current), { icon: 'BAT' });
        }
      }
      prevChargingRef.current = c;

      if (batt.charging) {
        batterySamplesRef.current = [];
        setBatteryEta(null);
      }
    };
    nav.getBattery().then((b) => {
      if (cancelled) return;
      batt = b;
      setBatteryLevel(b.level);
      setIsCharging(b.charging);
      prevLevelRef.current = b.level;
      prevChargingRef.current = b.charging;
      b.addEventListener('levelchange', onLevel);
      b.addEventListener('chargingchange', onCharging);
    }).catch(() => { /* battery info unavailable */ });
    return () => {
      cancelled = true;
      if (batt) {
        batt.removeEventListener('levelchange', onLevel);
        batt.removeEventListener('chargingchange', onCharging);
      }
    };
  }, [langRef]);

  return { batteryLevel, isCharging, batteryEta };
}
