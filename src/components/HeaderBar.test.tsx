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
    lang: 'en' as const,
    setLang: vi.fn(),
    setShowGuide: vi.fn(),
    tr: (key: string) => key,
  };

  it('renders the logo and version', () => {
    render(<HeaderBar {...baseProps} />);
    expect(screen.getByText('LTC SYNC PRO')).toBeTruthy();
    expect(screen.getByText('v1.3.0')).toBeTruthy();
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
    expect(screen.getByText((content) => content.includes('⚡'))).toBeTruthy();
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

  it('opens the pre-shoot checklist from the header', () => {
    const onOpenPreflight = vi.fn();
    render(<HeaderBar {...baseProps} onOpenPreflight={onOpenPreflight} />);
    fireEvent.click(screen.getByRole('button', { name: 'preflight.open' }));
    expect(onOpenPreflight).toHaveBeenCalledOnce();
  });
});
