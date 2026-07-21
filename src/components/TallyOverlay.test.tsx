import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TallyOverlay } from './TallyOverlay';
import type { TallyState } from '../utils/tally';

describe('TallyOverlay', () => {
  const baseProps = {
    tallyState: 'off' as TallyState,
    tallyTime: '01:00:00:00',
    tallyDimmerOpacity: 1,
    tallyTcSize: 'md' as const,
    tallyStyle: 'full' as const,
    tallyBorderSize: 'medium' as const,
    isTallyConnected: true,
    p2pRole: 'master' as const,
    returnStream: null,
    peerId: 'camera-1',
    cameraLabels: {},
    batteryLevel: 0.8,
    isCharging: false,
    tr: (key: string) => key,
    playHapticFeedback: vi.fn(),
    handleDimmerCycle: vi.fn(),
    handleTorchToggle: vi.fn(),
    handleTallyExit: vi.fn(),
    setTallyStyle: vi.fn(),
    setTallyBorderSize: vi.fn(),
    setTallyTcSize: vi.fn(),
    tallyTorchEnabled: false,
  };

  it('renders tally time', () => {
    render(<TallyOverlay {...baseProps} />);
    expect(screen.getByText('01:00:00:00')).toBeTruthy();
  });

  it('renders tally state label', () => {
    render(<TallyOverlay {...baseProps} />);
    expect(screen.getByText('tally.off')).toBeTruthy();
  });

  it('renders camera label when peerId provided', () => {
    render(<TallyOverlay {...baseProps} cameraLabels={{ 'camera-1': 'CAM-A' }} />);
    expect(screen.getByText('CAM-A')).toBeTruthy();
  });

  it('renders battery level', () => {
    render(<TallyOverlay {...baseProps} />);
    expect(screen.getByText(/80%/)).toBeTruthy();
  });

  it('shows charging indicator when charging', () => {
    render(<TallyOverlay {...baseProps} isCharging />);
    expect(screen.getByText(/⚡/)).toBeTruthy();
  });

  it('shows disconnected banner when not connected', () => {
    render(<TallyOverlay {...baseProps} p2pRole="client" isTallyConnected={false} />);
    expect(screen.getByText('tally.conn.lost')).toBeTruthy();
  });

  it('shows connected banner when connected', () => {
    render(<TallyOverlay {...baseProps} p2pRole="client" isTallyConnected={true} />);
    expect(screen.getByText('tally.conn.ok')).toBeTruthy();
  });

  it('renders dimmer with opacity', () => {
    const { container } = render(<TallyOverlay {...baseProps} tallyDimmerOpacity={0.5} />);
    const dimmer = container.querySelector('.tally-dimmer');
    expect(dimmer).toBeTruthy();
  });

  it('renders control bar buttons', () => {
    render(<TallyOverlay {...baseProps} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('applies correct style class based on tallyStyle', () => {
    const { container } = render(<TallyOverlay {...baseProps} tallyStyle="border" />);
    expect(container.querySelector('.style-border')).toBeTruthy();
  });

  it('applies correct border size class', () => {
    const { container } = render(<TallyOverlay {...baseProps} tallyBorderSize="thick" />);
    expect(container.querySelector('.border-thick')).toBeTruthy();
  });

  it('applies correct timecode size class', () => {
    const { container } = render(<TallyOverlay {...baseProps} tallyTcSize="lg" />);
    expect(container.querySelector('.size-lg')).toBeTruthy();
  });
});