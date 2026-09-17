import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FloatingPip } from './FloatingPip';

// Mock VideoRenderer since it requires a real MediaStream
vi.mock('./VideoRenderer', () => ({
  VideoRenderer: ({ className, stream }: { className: string; stream: MediaStream }) => (
    <div data-testid="video-renderer" className={className}>
      {stream ? 'VideoRenderer' : null}
    </div>
  ),
}));

describe('FloatingPip', () => {
  const mockStream = { id: 'mock-stream' } as MediaStream;
  const baseProps = {
    stream: mockStream,
    onClose: vi.fn(),
  };

  it('renders pip container', () => {
    const { container } = render(<FloatingPip {...baseProps} />);
    expect(container.querySelector('.floating-pip')).toBeTruthy();
  });

  it('displays RETURN OUT header', () => {
    render(<FloatingPip {...baseProps} />);
    expect(screen.getByText('RETURN OUT')).toBeTruthy();
  });

  it('renders close button', () => {
    render(<FloatingPip {...baseProps} />);
    expect(screen.getByText('✕')).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    render(<FloatingPip {...baseProps} />);
    const closeBtn = screen.getByText('✕');
    closeBtn.click();
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it('renders VideoRenderer with stream', () => {
    const { container } = render(<FloatingPip {...baseProps} />);
    expect(container.querySelector('[data-testid="video-renderer"]')).toBeTruthy();
  });

  it('has fixed position styling', () => {
    const { container } = render(<FloatingPip {...baseProps} />);
    const pip = container.querySelector('.floating-pip');
    expect(pip?.getAttribute('style')).toContain('position: fixed');
  });

  it('has high z-index', () => {
    const { container } = render(<FloatingPip {...baseProps} />);
    const pip = container.querySelector('.floating-pip');
    expect(pip?.getAttribute('style')).toContain('z-index: 9999');
  });

  it('renders resize handle', () => {
    const { container } = render(<FloatingPip {...baseProps} />);
    expect(container.querySelector('.pip-resize-handle')).toBeTruthy();
  });
});

describe('FloatingPip pointer capture', () => {
  const mockStream = { id: 'mock-stream' } as MediaStream;
  const baseProps = { stream: mockStream, onClose: vi.fn() };

  // jsdom ships no pointer-capture implementation, so model it: a set of the
  // pointer ids currently captured, which is exactly what a leak would show up in.
  const captured = new Set<number>();

  beforeEach(() => {
    captured.clear();
    Element.prototype.setPointerCapture = vi.fn((id: number) => { captured.add(id); });
    Element.prototype.hasPointerCapture = vi.fn((id: number) => captured.has(id));
    Element.prototype.releasePointerCapture = vi.fn((id: number) => { captured.delete(id); });
  });

  function renderPip() {
    const { container } = render(<FloatingPip {...baseProps} />);
    return container.querySelector('.floating-pip') as HTMLElement;
  }

  const left = (pip: HTMLElement) => pip.style.left;

  it('captures the pointer when a drag starts', () => {
    const pip = renderPip();
    fireEvent.pointerDown(pip, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(captured.has(1)).toBe(true);
  });

  it('releases the pointer when the drag ends normally', () => {
    const pip = renderPip();
    fireEvent.pointerDown(pip, { pointerId: 1, clientX: 100, clientY: 100 });

    fireEvent.pointerUp(pip, { pointerId: 1 });

    expect(captured.has(1)).toBe(false);
  });

  it('releases the pointer when the gesture is cancelled by the browser', () => {
    const pip = renderPip();
    fireEvent.pointerDown(pip, { pointerId: 1, clientX: 100, clientY: 100 });

    // Fired when the OS takes the gesture over — a system swipe, an incoming
    // call, the app being backgrounded mid-drag.
    fireEvent.pointerCancel(pip, { pointerId: 1 });

    expect(captured.has(1)).toBe(false);
  });

  it('stops dragging after a cancelled gesture', () => {
    const pip = renderPip();
    fireEvent.pointerDown(pip, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerCancel(pip, { pointerId: 1 });
    const parked = left(pip);

    fireEvent.pointerMove(pip, { pointerId: 1, clientX: 300, clientY: 300 });

    expect(left(pip)).toBe(parked);
  });

  it('accepts a fresh drag after the previous one was cancelled', () => {
    const pip = renderPip();
    fireEvent.pointerDown(pip, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerCancel(pip, { pointerId: 1 });
    const before = left(pip);

    fireEvent.pointerDown(pip, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(pip, { pointerId: 2, clientX: 60, clientY: 100 });

    expect(captured.has(2)).toBe(true);
    expect(left(pip)).not.toBe(before);
  });

  it('ignores a second finger instead of jumping to it', () => {
    const pip = renderPip();
    fireEvent.pointerDown(pip, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(pip, { pointerId: 1, clientX: 60, clientY: 100 });
    const afterFirstDrag = left(pip);

    // A second finger lands far away; without the guard its pointerdown would
    // reset the drag origin and the next move would teleport the PiP.
    fireEvent.pointerDown(pip, { pointerId: 2, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(pip, { pointerId: 2, clientX: 510, clientY: 500 });

    expect(captured.has(2)).toBe(false);
    expect(left(pip)).toBe(afterFirstDrag);
  });

  it('keeps following the pointer that owns the gesture', () => {
    const pip = renderPip();
    fireEvent.pointerDown(pip, { pointerId: 1, clientX: 100, clientY: 100 });

    fireEvent.pointerMove(pip, { pointerId: 1, clientX: 60, clientY: 100 });

    expect(left(pip)).toBe('788px'); // 828 initial - 40 travelled
  });
});