import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HeaderBar } from './HeaderBar';

describe('HeaderBar', () => {
  const baseProps = {
    isRunning: false,
    isPreparing: false,
    syncMode: 'ltc' as const,
    fpsIndex: 0,
    batteryLevel: null,
    isCharging: false,
    batteryEta: null,
    tallyOpen: false,
    tallyState: 'off' as const,
    isHost: true,
    lang: 'en' as const,
    setLang: vi.fn(),
    setShowGuide: vi.fn(),
    setDirectorPanelOpen: vi.fn(),
    setIsVisualSlate: vi.fn(),
    setTallyOpen: vi.fn(),
    tr: (key: string) => key,
  };

  it('renders the logo and version', () => {
    render(<HeaderBar {...baseProps} />);
    expect(screen.getByText('LTC SYNC PRO')).toBeTruthy();
    expect(screen.getByText('v1.3')).toBeTruthy();
  });

  it('shows the live status pill when running', () => {
    render(<HeaderBar {...baseProps} isRunning />);
    expect(screen.getByText('status.live')).toBeTruthy();
  });

  it('shows the syncing status pill when preparing', () => {
    render(<HeaderBar {...baseProps} isPreparing />);
    expect(screen.getByText('status.syncing')).toBeTruthy();
  });

  it('shows the ready status pill when idle', () => {
    render(<HeaderBar {...baseProps} />);
    expect(screen.getByText('status.ready')).toBeTruthy();
  });

  it('displays battery level when provided', () => {
    render(<HeaderBar {...baseProps} batteryLevel={0.75} />);
    expect(screen.getByText('75%')).toBeTruthy();
  });

  it('shows charging indicator', () => {
    render(<HeaderBar {...baseProps} batteryLevel={0.5} isCharging />);
    expect(screen.getByText((content) => content.includes('CHG'))).toBeTruthy();
  });

  it('toggles tally open when TALLY button is clicked', () => {
    const setTallyOpen = vi.fn();
    render(<HeaderBar {...baseProps} setTallyOpen={setTallyOpen} />);
    fireEvent.click(screen.getByText('TALLY'));
    expect(setTallyOpen).toHaveBeenCalledOnce();
  });

  it('opens director panel when DIR button is clicked', () => {
    const setDirectorPanelOpen = vi.fn();
    render(<HeaderBar {...baseProps} setDirectorPanelOpen={setDirectorPanelOpen} />);
    fireEvent.click(screen.getByText('DIR'));
    expect(setDirectorPanelOpen).toHaveBeenCalledOnce();
  });

  it('toggles language when language button is clicked', () => {
    const setLang = vi.fn();
    render(<HeaderBar {...baseProps} lang="en" setLang={setLang} />);
    fireEvent.click(screen.getByText('日本語'));
    expect(setLang).toHaveBeenCalledWith(expect.any(Function));
    // Verify the function works correctly
    const fn = setLang.mock.calls[0][0] as (l: string) => string;
    expect(fn('en')).toBe('ja');
  });

  it('opens guide when help button is clicked', () => {
    const setShowGuide = vi.fn();
    render(<HeaderBar {...baseProps} setShowGuide={setShowGuide} />);
    fireEvent.click(screen.getByText('?'));
    expect(setShowGuide).toHaveBeenCalledOnce();
  });

  it('hides DIR button when not host', () => {
    render(<HeaderBar {...baseProps} isHost={false} />);
    expect(screen.queryByText('DIR')).toBeNull();
  });
});
