import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FooterControls } from './FooterControls';

describe('FooterControls', () => {
  const baseProps = {
    isRunning: false,
    isPreparing: false,
    isPaused: false,
    stopHoldPct: 0,
    holdStoppedRef: { current: false },
    handleStartStop: vi.fn(),
    beginStopHold: vi.fn(),
    cancelStopHold: vi.fn(),
    handlePause: vi.fn(),
    addMarker: vi.fn(),
    syncMode: 'ltc' as const,
    p2pRole: null as 'master' | 'client' | null,
    tr: (key: string) => key,
  };

  it('shows start button when idle', () => {
    render(<FooterControls {...baseProps} />);
    expect(screen.getByText('btn.start')).toBeTruthy();
  });

  it('shows hold to stop text when running', () => {
    render(<FooterControls {...baseProps} isRunning />);
    expect(screen.getByText('btn.holdToStop')).toBeTruthy();
  });

  it('shows preparing text when preparing', () => {
    render(<FooterControls {...baseProps} isPreparing />);
    expect(screen.getByText('btn.prep')).toBeTruthy();
  });

  it('shows resume text when paused', () => {
    render(<FooterControls {...baseProps} isPaused />);
    expect(screen.getByText('btn.resume')).toBeTruthy();
  });

  it('calls handleStartStop when start button is clicked', () => {
    const handleStartStop = vi.fn();
    render(<FooterControls {...baseProps} handleStartStop={handleStartStop} />);
    fireEvent.click(screen.getByText('btn.start'));
    expect(handleStartStop).toHaveBeenCalledOnce();
  });

  it('calls beginStopHold on pointer down when running', () => {
    const beginStopHold = vi.fn();
    render(<FooterControls {...baseProps} isRunning beginStopHold={beginStopHold} />);
    fireEvent.pointerDown(screen.getByText('btn.holdToStop'));
    expect(beginStopHold).toHaveBeenCalledOnce();
  });

  it('calls cancelStopHold on pointer up when running', () => {
    const cancelStopHold = vi.fn();
    render(<FooterControls {...baseProps} isRunning cancelStopHold={cancelStopHold} />);
    fireEvent.pointerUp(screen.getByText('btn.holdToStop'));
    expect(cancelStopHold).toHaveBeenCalledOnce();
  });

  it('shows pause button when running', () => {
    render(<FooterControls {...baseProps} isRunning />);
    expect(screen.getByText('btn.pause')).toBeTruthy();
  });

  it('calls handlePause when pause button is clicked', () => {
    const handlePause = vi.fn();
    render(<FooterControls {...baseProps} isRunning handlePause={handlePause} />);
    fireEvent.click(screen.getByText('btn.pause'));
    expect(handlePause).toHaveBeenCalledOnce();
  });

  it('calls addMarker with correct color when marker buttons are clicked', () => {
    const addMarker = vi.fn();
    render(<FooterControls {...baseProps} addMarker={addMarker} />);
    fireEvent.click(screen.getByText('R'));
    expect(addMarker).toHaveBeenCalledWith('Red');
    fireEvent.click(screen.getByText('B'));
    expect(addMarker).toHaveBeenCalledWith('Blue');
    fireEvent.click(screen.getByText('G'));
    expect(addMarker).toHaveBeenCalledWith('Green');
    fireEvent.click(screen.getByText('Y'));
    expect(addMarker).toHaveBeenCalledWith('Yellow');
  });

  it('disables start button when preparing', () => {
    render(<FooterControls {...baseProps} isPreparing />);
    const btn = screen.getByText('btn.prep').closest('button');
    expect(btn && btn.getAttribute('disabled')).not.toBeNull();
  });

  it('disables start button when p2p client', () => {
    render(<FooterControls {...baseProps} syncMode="p2p" p2pRole="client" />);
    const btn = screen.getByText('btn.start').closest('button');
    expect(btn && btn.getAttribute('disabled')).not.toBeNull();
  });
});