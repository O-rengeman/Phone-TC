import { useEffect, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { useLTC } from '../LTCSyncContext';

export function PwaRegister() {
  const { isRunning, tr } = useLTC();
  const isRunningRef = useRef(isRunning);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      return;
    }

    const updateSW = registerSW({
      onNeedRefresh() {
        if (isRunningRef.current) {
          return;
        }

        toast(
          (t) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span>{tr('pwa.updateAvailable')}</span>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  style={{
                    background: '#ff2222',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                  onClick={() => {
                    toast.dismiss(t.id);
                    void updateSW(true);
                  }}
                >
                  {tr('pwa.update')}
                </button>
                <button
                  type="button"
                  style={{
                    background: '#444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                  onClick={() => toast.dismiss(t.id)}
                >
                  {tr('pwa.close')}
                </button>
              </div>
            </div>
          ),
          { duration: Infinity, id: 'pwa-update-toast' }
        );
      },
      onOfflineReady() {},
    });
  }, [tr]);

  return null;
}
