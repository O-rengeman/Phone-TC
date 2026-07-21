import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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