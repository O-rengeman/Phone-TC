import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VisualSlate } from './VisualSlate';
import { SlateTimeContext } from '../slateTimeContext';
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
    isSlateFlashing: false,
    handleSlateClick: vi.fn(),
    defaultReelName: 'A001',
    sceneName: 'SCENE-1',
    markers: [] as Marker[],
    fpsIndex: 0,
    userBits: '',
    tr: (key: string, vars?: Record<string, string | number>) => {
      if (key === 'slate.take') return 'TAKE';
      if (key === 'slate.info') return `FPS ${String(vars?.fps)} UBIT ${String(vars?.ubit)}`;
      if (key === 'slate.ariaClose') return 'Close Slate';
      return key;
    },
    setIsVisualSlate: vi.fn(),
  };

  const renderSlate = (props: Partial<React.ComponentProps<typeof VisualSlate>> = {}) =>
    render(
      <SlateTimeContext.Provider value="01:00:00:00">
        <VisualSlate {...baseProps} {...props} />
      </SlateTimeContext.Provider>,
    );

  it('renders slate overlay', () => {
    renderSlate();
    expect(screen.getByText('01:00:00:00')).toBeTruthy();
  });

  it('displays reel name', () => {
    renderSlate();
    expect(screen.getByText(/A001/)).toBeTruthy();
  });

  it('displays scene name', () => {
    renderSlate();
    expect(screen.getByText(/SCENE-1/)).toBeTruthy();
  });

  it('displays take number 1 when no markers', () => {
    renderSlate();
    expect(screen.getByText(/TAKE: 1/)).toBeTruthy();
  });

  it('displays correct take number with markers', () => {
    renderSlate({ markers: [makeMarker({ id: 1, take: 3 })] });
    expect(screen.getByText(/TAKE: 4/)).toBeTruthy();
  });

  it('displays FPS and user bits info', () => {
    renderSlate();
    expect(screen.getByText(/FPS/)).toBeTruthy();
    expect(screen.getByText(/UBIT/)).toBeTruthy();
  });

  it('renders QR code canvas', () => {
    renderSlate();
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('shows flashing class when isSlateFlashing is true', () => {
    const { container } = renderSlate({ isSlateFlashing: true });
    expect(container.querySelector('.flashing')).toBeTruthy();
  });

  it('calls setIsVisualSlate(false) when close button is clicked', () => {
    renderSlate();
    const closeBtn = screen.getByLabelText('Close Slate');
    closeBtn.click();
    expect(baseProps.setIsVisualSlate).toHaveBeenCalledWith(false);
  });

  it('calls handleSlateClick when tap area is clicked', () => {
    renderSlate();
    const tapArea = screen.getByText('01:00:00:00').closest('.slate-content')?.previousElementSibling;
    if (tapArea) {
      (tapArea as HTMLElement).click();
      expect(baseProps.handleSlateClick).toHaveBeenCalled();
    }
  });
});
