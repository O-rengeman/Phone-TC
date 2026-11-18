import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MarkerTimeline } from './MarkerTimeline';
import type { Marker } from '../utils/export';

const FPS_24 = { fps: 24, drop: false };

const tr = (key: string, vars?: Record<string, string | number>) =>
  key === 'tl.dotLabel'
    ? `${vars?.tc} Scene ${vars?.scene} Take ${vars?.take}${vars?.comment ?? ''}`
    : key === 'tl.aria' ? 'marker timeline' : key;

const makeMarker = (overrides: Partial<Marker> = {}): Marker => ({
  id: 1,
  tc: '00:00:05:00',
  time: '10:00:05',
  color: 'Red',
  reelName: 'A001',
  take: 1,
  sceneName: '001',
  comment: 'tail slate',
  ...overrides,
});

const markers: Marker[] = [
  makeMarker({ id: 2, tc: '00:00:10:00', color: 'Blue', take: 2, comment: '' }),
  makeMarker({ id: 1, tc: '00:00:05:00', color: 'Red', take: 1 }),
];

describe('MarkerTimeline', () => {
  it('renders nothing when there are no markers', () => {
    const { container } = render(
      <MarkerTimeline markers={[]} {...FPS_24} onRecall={vi.fn()} tr={tr} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when every TC is unparseable', () => {
    const { container } = render(
      <MarkerTimeline markers={[makeMarker({ tc: 'bogus' })]} {...FPS_24} onRecall={vi.fn()} tr={tr} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one button per marker with a localized label and calls onRecall', () => {
    const onRecall = vi.fn();
    render(<MarkerTimeline markers={markers} {...FPS_24} onRecall={onRecall} tr={tr} />);

    const red = screen.getByRole('button', { name: '00:00:05:00 Scene 001 Take 1 — tail slate' });
    const blue = screen.getByRole('button', { name: '00:00:10:00 Scene 001 Take 2' });
    expect(red).toBeTruthy();
    expect(blue).toBeTruthy();

    fireEvent.click(red);
    expect(onRecall).toHaveBeenCalledWith('00:00:05:00');
    fireEvent.click(blue);
    expect(onRecall).toHaveBeenCalledWith('00:00:10:00');
  });

  it('positions dots by timecode order and colours them by marker color', () => {
    const { container } = render(
      <MarkerTimeline markers={markers} {...FPS_24} onRecall={vi.fn()} tr={tr} />,
    );
    const dots = [...container.querySelectorAll<HTMLButtonElement>('.mtl-dot')];
    expect(dots).toHaveLength(2);
    const lefts = dots.map(d => parseFloat(d.style.left));
    expect(lefts[0]).toBeLessThan(lefts[1]);
    const fills = [...container.querySelectorAll<HTMLElement>('.mtl-dot-fill')];
    expect(fills[0].style.backgroundColor).toBe('rgb(255, 59, 64)'); // MARKER_HEX.Red
    expect(fills[1].style.backgroundColor).toBe('rgb(59, 130, 246)'); // MARKER_HEX.Blue
  });

  it('shows the playhead only when currentTc parses inside the range', () => {
    const { container, rerender } = render(
      <MarkerTimeline markers={markers} {...FPS_24} onRecall={vi.fn()} tr={tr} currentTc="00:00:07:00" />,
    );
    const playhead = container.querySelector<HTMLElement>('.mtl-playhead');
    expect(playhead).toBeTruthy();
    const left = parseFloat(playhead!.style.left);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(100);

    rerender(<MarkerTimeline markers={markers} {...FPS_24} onRecall={vi.fn()} tr={tr} currentTc="bogus" />);
    expect(container.querySelector('.mtl-playhead')).toBeNull();
  });

  it('clamps an out-of-range playhead to the strip ends', () => {
    const { container } = render(
      <MarkerTimeline markers={markers} {...FPS_24} onRecall={vi.fn()} tr={tr} currentTc="23:00:00:00" />,
    );
    const playhead = container.querySelector<HTMLElement>('.mtl-playhead');
    expect(playhead).toBeTruthy();
    expect(parseFloat(playhead!.style.left)).toBe(100);
  });
});
