import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CreatorReadyRail } from './CreatorReadyRail';

const baseProps = {
  isRunning: false,
  isPreparing: false,
  fpsLabel: '25',
  syncMode: 'network',
  syncLatency: 4.2,
  cameraCount: 2,
  outputMode: 'stereo' as const,
  outputOffset: 0,
  lang: 'ja' as const,
  onOpenPro: vi.fn(),
};

describe('CreatorReadyRail', () => {
  it('summarizes the shoot essentials', () => {
    render(<CreatorReadyRail {...baseProps} />);
    expect(screen.getByText('撮影準備OK')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
    expect(screen.getByText('Network')).toBeTruthy();
    expect(screen.getByText('4.2 ms')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Stereo TC')).toBeTruthy();
  });

  it('shows the recording state while timecode is running', () => {
    render(<CreatorReadyRail {...baseProps} isRunning />);
    expect(screen.getByText('収録中')).toBeTruthy();
    expect(screen.getByText('TCを送出しています')).toBeTruthy();
  });

  it('opens pro controls from the readiness rail', () => {
    const onOpenPro = vi.fn();
    render(<CreatorReadyRail {...baseProps} onOpenPro={onOpenPro} />);
    fireEvent.click(screen.getByRole('button', { name: 'Proコントロール' }));
    expect(onOpenPro).toHaveBeenCalledOnce();
  });
});
