import { useState } from 'react';
import { useLTC } from '../LTCSyncContext';
import { FPS_OPTIONS } from '../constants';
import { PRESET_NAME_MAX, deletePreset, listPresets, savePreset } from '../utils/presets';
import type { Preset, PresetSettings } from '../utils/presets';
import './presets.css';

/**
 * Setup presets: named snapshots of the timecode/output/sync settings,
 * persisted under STORAGE_KEYS.presets by src/utils/presets.ts.
 *
 * Mounted twice — inside the mobile TOOLS tab (App.tsx) and inside a
 * DesktopSection on the desktop TIMECODE pane — so it owns its own section
 * chrome (tool-section-shell) and reads everything it needs from useLTC().
 * On desktop the section heading is supplied by the DesktopSection wrapper,
 * so presets.css hides this panel's duplicate title there.
 *
 * All apply/save controls lock while LTC is running, matching the other
 * settings controls. Delete stays available — dropping a snapshot does not
 * touch live output, same as removing a marker mid-take.
 */
export function PresetsPanel() {
  const {
    isRunning,
    isMobile,
    fpsIndex, volume, outputLevel, outputMode, outputOffset,
    autoUserBits, userBits, defaultReelName, sceneName, syncMode,
    setFpsIndex, setVolume, setOutputLevel, setOutputMode, setOutputOffset,
    setAutoUserBits, setUserBits, setDefaultReelName, setSceneName, setSyncMode,
    tr, addToast,
  } = useLTC();

  const [presets, setPresets] = useState<Preset[]>(() => listPresets());
  const [name, setName] = useState('');

  const refresh = () => setPresets(listPresets());

  const captureSettings = (): PresetSettings => ({
    fpsIndex, volume, outputLevel, outputMode, outputOffset,
    autoUserBits, userBits, defaultReelName, sceneName, syncMode,
  });

  const handleSave = () => {
    const saved = savePreset(name, captureSettings());
    if (!saved) return;
    setName('');
    refresh();
    addToast(tr('preset.saved', { name: saved.name }), 'info');
  };

  const handleApply = (preset: Preset) => {
    const s = preset.settings;
    setFpsIndex(s.fpsIndex);
    setVolume(s.volume);
    setOutputLevel(s.outputLevel);
    setOutputMode(s.outputMode);
    setOutputOffset(s.outputOffset);
    setAutoUserBits(s.autoUserBits);
    setUserBits(s.userBits);
    setDefaultReelName(s.defaultReelName);
    setSceneName(s.sceneName);
    // 'p2p' is session-bound: the role and peer link can't be restored from
    // a snapshot, so a preset saved in P2P keeps the current sync method and
    // applies everything else.
    const syncKept = s.syncMode === 'p2p';
    if (!syncKept) setSyncMode(s.syncMode);
    // Same caution the output-mode toggle shows: L/R audio on the headphone
    // bus feeds back if the operator isn't wearing headphones.
    if (s.outputMode === 'mono-l') {
      addToast(tr('toast.headphonesRequired'), 'warn');
    }
    addToast(
      tr(syncKept ? 'preset.appliedSyncKept' : 'preset.applied', { name: preset.name }),
      syncKept ? 'warn' : 'info',
    );
  };

  const handleDelete = (preset: Preset) => {
    if (deletePreset(preset.id)) {
      refresh();
      addToast(tr('preset.deleted', { name: preset.name }), 'info');
    }
  };

  const presetMeta = (preset: Preset): string => {
    const s = preset.settings;
    const fps = FPS_OPTIONS[s.fpsIndex]?.label ?? String(s.fpsIndex);
    const mode = s.syncMode === 'freerun' ? tr('mode.freerun') : s.syncMode.toUpperCase();
    return `${fps} FPS · ${mode}`;
  };

  return (
    <section className={`tool-section-shell preset-panel${isMobile ? ' preset-panel-v2' : ''}`}>
      <div className="tool-section-head preset-head">
        <label className="section-label">{tr('preset.title')}</label>
      </div>
      <form
        className="preset-save-row"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <input
          className="preset-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr('preset.namePlaceholder')}
          maxLength={PRESET_NAME_MAX}
          disabled={isRunning}
          aria-label={tr('preset.namePlaceholder')}
        />
        <button
          type="submit"
          className="btn-pill preset-save-btn"
          disabled={isRunning || name.trim().length === 0}
        >
          {tr('preset.save')}
        </button>
      </form>
      <div className="preset-list">
        {presets.length === 0 ? (
          <div className="empty-msg preset-empty">{tr('preset.empty')}</div>
        ) : (
          presets.map((preset) => (
            <div key={preset.id} className="preset-row">
              <div className="preset-row-info">
                <span className="preset-row-name">{preset.name}</span>
                <span className="preset-row-meta">{presetMeta(preset)}</span>
              </div>
              <div className="preset-row-actions">
                <button
                  type="button"
                  className="btn-pill preset-apply"
                  onClick={() => handleApply(preset)}
                  disabled={isRunning}
                >
                  {tr('preset.apply')}
                </button>
                <button
                  type="button"
                  className="btn-pill preset-delete"
                  onClick={() => handleDelete(preset)}
                >
                  {tr('preset.delete')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
