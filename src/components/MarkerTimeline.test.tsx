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

  it('shows the playhead when currentTc parses and none when it does not', () => {
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
    // Legacy path still renders the static dots.
    expect(container.querySelectorAll('.mtl-dot')).toHaveLength(2);
  });

  it('pins the playhead at ~75% in live mode, independent of marker positions', () => {
    const { container, rerender } = render(
      <MarkerTimeline markers={markers} {...FPS_24} onRecall={vi.fn()} tr={tr} currentTc="00:00:07:00" />,
    );
    const playhead = container.querySelector<HTMLElement>('.mtl-playhead');
    expect(playhead).toBeTruthy();
    expect(parseFloat(playhead!.style.left)).toBeCloseTo(75, 0);

    // Even far past the last take the head stays at its anchor — the window
    // slides instead of the head clamping to the right edge.
    rerender(
      <MarkerTimeline markers={markers} {...FPS_24} onRecall={vi.fn()} tr={tr} currentTc="23:00:00:00" />,
    );
    const moved = container.querySelector<HTMLElement>('.mtl-playhead');
    expect(moved).toBeTruthy();
    expect(parseFloat(moved!.style.left)).toBeCloseTo(75, 0);
  });

  it('keeps the playhead fixed while visible dots flow left as currentTc advances', () => {
    const { container, rerender } = render(
      <MarkerTimeline markers={markers} {...FPS_24} onRecall={vi.fn()} tr={tr} currentTc="00:00:30:00" />,
    );
    const leftsBefore = [...container.querySelectorAll<HTMLButtonElement>('.mtl-dot')]
      .map(d => parseFloat(d.style.left));
    const playheadBefore = parseFloat(
      container.querySelector<HTMLElement>('.mtl-playhead')!.style.left,
    );
    expect(leftsBefore).toHaveLength(2);

    rerender(
      <MarkerTimeline markers={markers} {...FPS_24} onRecall={vi.fn()} tr={tr} currentTc="00:00:40:00" />,
    );

    const leftsAfter = [...container.querySelectorAll<HTMLButtonElement>('.mtl-dot')]
      .map(d => parseFloat(d.style.left));
    const playheadAfter = parseFloat(
      container.querySelector<HTMLElement>('.mtl-playhead')!.style.left,
    );

    expect(playheadAfter).toBe(playheadBefore);
    expect(leftsAfter).toHaveLength(leftsBefore.length);
    leftsAfter.forEach((left, i) => expect(left).toBeLessThan(leftsBefore[i]));
  });

  it('does not render buttons for markers outside the follow window', () => {
    const liveMarkers: Marker[] = [
      makeMarker({ id: 2, tc: '00:02:30:00', color: 'Blue', take: 2, comment: '' }), // 30 s behind — inside the 120 s past window
      makeMarker({ id: 1, tc: '00:00:05:00' }), // ~175 s behind — outside
    ];
    const { container } = render(
      <MarkerTimeline markers={liveMarkers} {...FPS_24} onRecall={vi.fn()} tr={tr} currentTc="00:03:00:00" />,
    );
    const dots = container.querySelectorAll('.mtl-dot');
    expect(dots).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: '00:02:30:00 Scene 001 Take 2' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /00:00:05:00/ })).toBeNull();
  });

  it('renders the strip with a pinned playhead even when there are no markers', () => {
    const { container } = render(
      <MarkerTimeline markers={[]} {...FPS_24} onRecall={vi.fn()} tr={tr} currentTc="00:00:07:00" />,
    );
    expect(container.querySelector('.mtl-track')).toBeTruthy();
    expect(container.querySelectorAll('.mtl-dot')).toHaveLength(0);
    const playhead = container.querySelector<HTMLElement>('.mtl-playhead');
    expect(playhead).toBeTruthy();
    expect(parseFloat(playhead!.style.left)).toBeCloseTo(75, 0);
  });

  it('falls back to the legacy layout with no playhead when currentTc does not parse', () => {
    const { container } = render(
      <MarkerTimeline markers={markers} {...FPS_24} onRecall={vi.fn()} tr={tr} currentTc="bogus" />,
    );
    expect(container.querySelector('.mtl-playhead')).toBeNull();
    expect(container.querySelectorAll('.mtl-dot')).toHaveLength(2);
  });
});
