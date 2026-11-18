import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GuideOverlay } from './GuideOverlay';

describe('GuideOverlay', () => {
  const baseProps = {
    showGuide: true,
    setShowGuide: vi.fn(),
    tr: (key: string) => key,
  };

  it('renders when showGuide is true', () => {
    render(<GuideOverlay {...baseProps} />);
    expect(screen.getByText('guide.title')).toBeTruthy();
  });

  it('does not render when showGuide is false', () => {
    const { container } = render(<GuideOverlay {...baseProps} showGuide={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('displays guide title', () => {
    render(<GuideOverlay {...baseProps} />);
    expect(screen.getByText('guide.title')).toBeTruthy();
  });

  it('displays all 5 guide steps', () => {
    render(<GuideOverlay {...baseProps} />);
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(5);
  });

  it('displays guide tip', () => {
    render(<GuideOverlay {...baseProps} />);
    expect(screen.getByText('guide.tip')).toBeTruthy();
  });

  it('calls setShowGuide(false) when done button is clicked', () => {
    render(<GuideOverlay {...baseProps} />);
    const doneBtn = screen.getByText('btn.gotIt');
    doneBtn.click();
    expect(baseProps.setShowGuide).toHaveBeenCalledWith(false);
  });

  it('calls setShowGuide(false) when close button is clicked', () => {
    render(<GuideOverlay {...baseProps} />);
    const closeBtn = screen.getByLabelText('help.close');
    closeBtn.click();
    expect(baseProps.setShowGuide).toHaveBeenCalledWith(false);
  });

  it('calls setShowGuide(false) when Escape is pressed', () => {
    render(<GuideOverlay {...baseProps} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(baseProps.setShowGuide).toHaveBeenCalledWith(false);
  });

  it('calls setShowGuide(false) when overlay background is clicked', () => {
    render(<GuideOverlay {...baseProps} />);
    const overlay = screen.getByText('guide.title').closest('.guide-overlay');
    if (overlay) {
      (overlay as HTMLElement).click();
      expect(baseProps.setShowGuide).toHaveBeenCalledWith(false);
    }
  });

  it('does not close when guide card is clicked', () => {
    render(<GuideOverlay {...baseProps} />);
    vi.clearAllMocks();
    const guideCard = screen.getByText('guide.title').closest('.guide-card');
    if (guideCard) {
      (guideCard as HTMLElement).click();
      expect(baseProps.setShowGuide).not.toHaveBeenCalled();
    }
  });

  it('adds the v2 sheet classes only on mobile', () => {
    const { container, rerender } = render(<GuideOverlay {...baseProps} />);
    expect(container.querySelector('.guide-overlay-v2')).toBeNull();
    expect(container.querySelector('.guide-card-v2')).toBeNull();
    rerender(<GuideOverlay {...baseProps} isMobile />);
    expect(container.querySelector('.guide-overlay-v2')).toBeTruthy();
    expect(container.querySelector('.guide-card-v2')).toBeTruthy();
  });

  it('splits the steps into two pager pages on mobile (1-3 / 4-5 + tip)', () => {
    const { container } = render(<GuideOverlay {...baseProps} isMobile />);
    expect(container.querySelector('.guide-card-v3')).toBeTruthy();
    expect(container.querySelector('.mobile-pager')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('guide.tip')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'pager.next' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('guide.tip')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'pager.next' }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'pager.prev' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('guide.tip')).toBeNull();
  });
});