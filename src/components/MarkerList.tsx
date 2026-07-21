interface MarkerListProps {
  markers: Array<{
    id: string;
    color: string;
    tc: string;
    time: string;
    take: number;
    sceneName?: string;
    comment?: string;
  }>;
  addMarker: (color: string) => void;
  removeMarker: (id: string) => void;
  updateMarkerComment: (id: string, comment: string) => void;
  exportToEDL: () => void;
  exportToALE: () => void;
  isMobile: boolean;
  tr: (key: string) => string;
}

export function MarkerList({
  markers,
  addMarker,
  removeMarker,
  updateMarkerComment,
  exportToEDL,
  exportToALE,
  isMobile,
  tr,
}: MarkerListProps) {
  return (
    <>
      {isMobile && (
        <section className="tool-section-shell tool-section-shell-marks">
          <div className="control-section mobile-marker-section">
            <label className="section-label">{tr('label.quickMark')}</label>
            <div className="marker-buttons-grid">
              <button className="btn-mark-large red" onClick={() => addMarker('Red')}>{tr('color.red')}</button>
              <button className="btn-mark-large blue" onClick={() => addMarker('Blue')}>{tr('color.blue')}</button>
              <button className="btn-mark-large green" onClick={() => addMarker('Green')}>{tr('color.green')}</button>
              <button className="btn-mark-large yellow" onClick={() => addMarker('Yellow')}>{tr('color.yellow')}</button>
            </div>
          </div>
        </section>
      )}

      <section className="tool-section-shell marker-section-pro">
        <div className="marker-header">
          <label>{tr('label.loggedTakes')}</label>
          <div className="export-group">
            <button className="btn-export-pro" onClick={exportToEDL} disabled={markers.length === 0}>EDL</button>
            <button className="btn-export-pro" onClick={exportToALE} disabled={markers.length === 0}>ALE</button>
          </div>
        </div>
        <div className="marker-scroll">
          {markers.length === 0 ? (
            <div className="empty-msg">{tr('markers.none')}</div>
          ) : (
            markers.map(m => (
              <div key={m.id} className="marker-row-pro">
                <div className="marker-row-top">
                  <div className="marker-row-left">
                    <div className={`color-dot ${m.color.toLowerCase()}`}>{m.color.charAt(0)}</div>
                    <span className="m-tc">{m.tc}</span>
                    <span className="m-take">
                      Sc.{m.sceneName || '001'} Tk.{m.take}
                    </span>
                  </div>
                  <div className="marker-row-right">
                    <span className="m-time">{m.time}</span>
                    <button className="btn-delete-marker" onClick={() => removeMarker(m.id)}>✕</button>
                  </div>
                </div>
                <div className="marker-comment-row">
                  <input
                    type="text"
                    className="marker-comment-input"
                    value={m.comment || ''}
                    onChange={(e) => updateMarkerComment(m.id, e.target.value)}
                    placeholder={tr('placeholder.comment')}
                    maxLength={100}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}