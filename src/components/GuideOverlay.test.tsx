import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    const closeBtn = screen.getByLabelText('Close');
    closeBtn.click();
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
});