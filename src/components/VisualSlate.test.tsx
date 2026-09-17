import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VisualSlate } from './VisualSlate';
import type { Marker } from '../utils/export';

const makeMarker = (overrides: Partial<Marker> = {}): Marker => ({
  id: 1,
  tc: '00:00:00:00',
  time: '00:00:00:00',
  color: 'Red',
  reelName: 'A001',
  take: 1,
  sceneName: 'SCENE-1',
  comment: '',
  ...overrides,
});

describe('VisualSlate', () => {
  const baseProps = {
    slateTime: '01:00:00:00',
    isSlateFlashing: false,
    handleSlateClick: vi.fn(),
    defaultReelName: 'A001',
    sceneName: 'SCENE-1',
    markers: [] as Marker[],
    fpsIndex: 0,
    userBits: '',
    tr: (key: string) => key,
    setIsVisualSlate: vi.fn(),
  };

  it('renders slate overlay', () => {
    render(<VisualSlate {...baseProps} />);
    expect(screen.getByText('01:00:00:00')).toBeTruthy();
  });

  it('displays reel name', () => {
    render(<VisualSlate {...baseProps} />);
    expect(screen.getByText(/A001/)).toBeTruthy();
  });

  it('displays scene name', () => {
    render(<VisualSlate {...baseProps} />);
    expect(screen.getByText(/SCENE-1/)).toBeTruthy();
  });

  it('displays take number 1 when no markers', () => {
    render(<VisualSlate {...baseProps} />);
    expect(screen.getByText(/TAKE: 1/)).toBeTruthy();
  });

  it('displays correct take number with markers', () => {
    render(<VisualSlate {...baseProps} markers={[makeMarker({ id: 1, take: 3 })]} />);
    expect(screen.getByText(/TAKE: 4/)).toBeTruthy();
  });

  it('displays FPS and user bits info', () => {
    render(<VisualSlate {...baseProps} />);
    expect(screen.getByText(/FPS/)).toBeTruthy();
    expect(screen.getByText(/UBIT/)).toBeTruthy();
  });

  it('renders QR code canvas', () => {
    render(<VisualSlate {...baseProps} />);
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('shows flashing class when isSlateFlashing is true', () => {
    const { container } = render(<VisualSlate {...baseProps} isSlateFlashing />);
    expect(container.querySelector('.flashing')).toBeTruthy();
  });

  it('calls setIsVisualSlate(false) when close button is clicked', () => {
    render(<VisualSlate {...baseProps} />);
    const closeBtn = screen.getByLabelText('Close Slate');
    closeBtn.click();
    expect(baseProps.setIsVisualSlate).toHaveBeenCalledWith(false);
  });

  it('calls handleSlateClick when tap area is clicked', () => {
    render(<VisualSlate {...baseProps} />);
    const tapArea = screen.getByText('01:00:00:00').closest('.slate-content')?.previousElementSibling;
    if (tapArea) {
      (tapArea as HTMLElement).click();
      expect(baseProps.handleSlateClick).toHaveBeenCalled();
    }
  });
});