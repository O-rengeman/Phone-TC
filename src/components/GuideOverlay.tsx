import { useEffect, useRef } from 'react';

interface GuideOverlayProps {
  showGuide: boolean;
  setShowGuide: (v: boolean) => void;
  tr: (key: string) => string;
  /** Mobile renders the guide as a bottom sheet (v2 chrome). */
  isMobile?: boolean;
}

export function GuideOverlay({ showGuide, setShowGuide, tr, isMobile = false }: GuideOverlayProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!showGuide) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowGuide(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prevFocusRef.current?.focus();
    };
  }, [showGuide, setShowGuide]);

  if (!showGuide) return null;
  return (
    <div className={`guide-overlay${isMobile ? ' guide-overlay-v2' : ''}`} onClick={() => setShowGuide(false)} role="presentation">
      <div
        ref={cardRef}
        className={`guide-card${isMobile ? ' guide-card-v2' : ''}`}
        tabIndex={-1}
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
