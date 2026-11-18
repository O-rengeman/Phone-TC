import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// The pane reads everything through useLTC(); the heavy children
// (canvas RAF loop, analyser RAF loop) are stubbed so the spec stays a
// pure view-switching contract test.
const { ltcState } = vi.hoisted(() => {
  const state: { value: Record<string, unknown> } = { value: {} };
  return { ltcState: state };
});

vi.mock('../../LTCSyncContext', () => ({
  useLTC: () => ltcState.value,
}));

vi.mock('../../VideoPlayer', () => ({
  VideoPlayer: () => <div data-testid="video-player" />,
}));

vi.mock('../VuMeter', () => ({
  VuMeter: () => <div data-testid="vu-meter" />,
}));

import { MobileMainPane } from './MainPane';

const makeCtx = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  isRunning: false,
  fpsIndex: 2,
  setFpsIndex: vi.fn(),
  syncMode: 'system',
  p2pRole: null,
  outputMode: 'stereo',
  outputOffset: 0,
  setOutputOffset: vi.fn(),
  driftStatus: null,
  isResyncing: false,
  handleManualResync: vi.fn(() => Promise.resolve()),
  tr: (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}(${JSON.stringify(vars)})` : key,
  ...overrides,
});

const TIMECODE_TAB = 'dtab.timecode';
const CONTROL_TAB = 'dt.control';

const openControls = () => {
  fireEvent.click(screen.getByRole('tab', { name: CONTROL_TAB }));
};

describe('MobileMainPane', () => {
  beforeEach(() => {
    ltcState.value = makeCtx();
  });

  it('defaults to the timecode view with both pane tabs', () => {
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    expect(screen.getByTestId('video-player')).toBeTruthy();
    const tcTab = screen.getByRole('tab', { name: TIMECODE_TAB });
    const controlTab = screen.getByRole('tab', { name: CONTROL_TAB });
    expect(tcTab.getAttribute('aria-current')).toBe('page');
    expect(tcTab.getAttribute('aria-selected')).toBe('true');
    expect(controlTab.getAttribute('aria-current')).toBeNull();
    expect(controlTab.getAttribute('aria-selected')).toBe('false');
  });

  it('shows all three settings sections on the control view', () => {
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    openControls();
    expect(screen.getByText('label.frameRate')).toBeTruthy();
    expect(screen.getByText('label.outputMode')).toBeTruthy();
    expect(screen.getByText('cm.tcOffset')).toBeTruthy();
    // The TC surface leaves the screen while controls are shown.
    expect(screen.queryByTestId('video-player')).toBeNull();
    expect(screen.getByRole('tab', { name: CONTROL_TAB }).getAttribute('aria-current')).toBe('page');
  });

  it('switches back to the timecode view', () => {
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    openControls();
    fireEvent.click(screen.getByRole('tab', { name: TIMECODE_TAB }));
    expect(screen.getByTestId('video-player')).toBeTruthy();
    expect(screen.queryByText('label.frameRate')).toBeNull();
  });

  it('forwards output mode selection to onOutputModeChange', () => {
    const onOutputModeChange = vi.fn();
    render(<MobileMainPane onOutputModeChange={onOutputModeChange} />);
    openControls();
    fireEvent.click(screen.getByText('out.ltcRaudio'));
    expect(onOutputModeChange).toHaveBeenCalledWith('mono-l');
    fireEvent.click(screen.getByText('out.stereoTc'));
    expect(onOutputModeChange).toHaveBeenCalledWith('stereo');
  });

  it('locks the output mode buttons while running', () => {
    ltcState.value = makeCtx({ isRunning: true });
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    openControls();
    const btn = screen.getByText('out.stereoTc').closest('button');
    expect(btn && btn.getAttribute('disabled')).not.toBeNull();
  });

  it('renders the network sync strip only in network mode and triggers resync', () => {
    const handleManualResync = vi.fn(() => Promise.resolve());
    ltcState.value = makeCtx({ syncMode: 'network', handleManualResync });
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    expect(screen.getByText('sync.label')).toBeTruthy();
    fireEvent.click(screen.getByText('sync.resync'));
    expect(handleManualResync).toHaveBeenCalledOnce();
  });

  it('hides the sync strip outside network mode', () => {
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    expect(screen.queryByText('sync.resync')).toBeNull();
  });

  it('shows the resyncing label and disables resync while resyncing', () => {
    ltcState.value = makeCtx({ syncMode: 'network', isResyncing: true });
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    const btn = screen.getByText('sync.resyncing').closest('button');
    expect(btn && btn.getAttribute('disabled')).not.toBeNull();
  });

  it('shows the mono-L VU meter on the timecode view only while running', () => {
    ltcState.value = makeCtx({ isRunning: true, outputMode: 'mono-l' });
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    expect(screen.getByTestId('vu-meter')).toBeTruthy();
  });

  it('keeps the VU meter hidden when idle or in stereo', () => {
    const { unmount } = render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    expect(screen.queryByTestId('vu-meter')).toBeNull();
    unmount();
    ltcState.value = makeCtx({ isRunning: true, outputMode: 'stereo' });
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    expect(screen.queryByTestId('vu-meter')).toBeNull();
  });

  it('calls setFpsIndex from the FPS grid', () => {
    const setFpsIndex = vi.fn();
    ltcState.value = makeCtx({ setFpsIndex });
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    openControls();
    fireEvent.click(screen.getByText('29.97 DF'));
    expect(setFpsIndex).toHaveBeenCalledWith(4);
  });

  it('disables the FPS grid while running', () => {
    ltcState.value = makeCtx({ isRunning: true });
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    openControls();
    const btn = screen.getByText('25').closest('button');
    expect(btn && btn.getAttribute('disabled')).not.toBeNull();
  });

  it('disables the FPS grid for a p2p client', () => {
    ltcState.value = makeCtx({ syncMode: 'p2p', p2pRole: 'client' });
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    openControls();
    const btn = screen.getByText('25').closest('button');
    expect(btn && btn.getAttribute('disabled')).not.toBeNull();
  });

  it('updates the TC offset through setOutputOffset', () => {
    const setOutputOffset = vi.fn();
    ltcState.value = makeCtx({ setOutputOffset });
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    openControls();
    fireEvent.change(screen.getByLabelText('cm.tcOffset'), { target: { value: '3' } });
    expect(setOutputOffset).toHaveBeenCalledWith(3);
  });

  it('shows a + sign for a positive TC offset', () => {
    ltcState.value = makeCtx({ outputOffset: 4 });
    render(<MobileMainPane onOutputModeChange={vi.fn()} />);
    openControls();
    expect(screen.getByText('+4')).toBeTruthy();
  });
});
