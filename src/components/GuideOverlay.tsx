interface GuideOverlayProps {
  showGuide: boolean;
  setShowGuide: (v: boolean) => void;
  tr: (key: string) => string;
}

export function GuideOverlay({ showGuide, setShowGuide, tr }: GuideOverlayProps) {
  if (!showGuide) return null;
  return (
    <div className="guide-overlay" onClick={() => setShowGuide(false)}>
      <div className="guide-card" onClick={(e) => e.stopPropagation()}>
        <div className="guide-head">
          <span className="guide-title">{tr('guide.title')}</span>
          <button type="button" className="guide-x" onClick={() => setShowGuide(false)} aria-label="Close">✕</button>
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
