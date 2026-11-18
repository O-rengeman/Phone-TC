import { useEffect } from 'react';

interface GuideOverlayProps {
  showGuide: boolean;
  setShowGuide: (v: boolean) => void;
  tr: (key: string) => string;
}

export function GuideOverlay({ showGuide, setShowGuide, tr }: GuideOverlayProps) {
  useEffect(() => {
    if (!showGuide) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowGuide(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showGuide, setShowGuide]);

  if (!showGuide) return null;
  return (
    <div className="guide-overlay" onClick={() => setShowGuide(false)} role="presentation">
      <div
        className="guide-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={tr('guide.title')}
      >
        <div className="guide-head">
          <span className="guide-title">{tr('guide.title')}</span>
          <button type="button" className="guide-x" onClick={() => setShowGuide(false)} aria-label={tr('help.close')}>✕</button>
        </div>
        <ol className="guide-steps">
          <li>{tr('guide.step1')}</li>
          <li>{tr('guide.step2')}</li>
          <li>{tr('guide.step3')}</li>
          <li>{tr('guide.step4')}</li>
          <li>{tr('guide.step5')}</li>
        </ol>
        <div className="guide-tip">{tr('guide.tip')}</div>
        <button type="button" className="guide-done" onClick={() => setShowGuide(false)}>{tr('btn.gotIt')}</button>
      </div>
    </div>
  );
}
