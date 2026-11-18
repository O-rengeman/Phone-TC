import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MobilePager } from './MobilePager';
import { t } from '../../utils/i18n';

const tr = (key: string, vars?: Record<string, string | number>) => t(key, 'en', vars);

describe('MobilePager', () => {
  it('renders nothing when there is at most one page', () => {
    const { container, rerender } = render(
      <MobilePager page={0} pageCount={1} onPage={vi.fn()} tr={tr} />,
    );
    expect(container.firstChild).toBeNull();
    rerender(<MobilePager page={0} pageCount={0} onPage={vi.fn()} tr={tr} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the localized "page / total" status', () => {
    render(<MobilePager page={1} pageCount={5} onPage={vi.fn()} tr={tr} />);
    expect(screen.getByRole('status').textContent).toBe('2 / 5');
  });

  it('disables prev on the first page and next on the last page', () => {
    const { rerender } = render(<MobilePager page={0} pageCount={3} onPage={vi.fn()} tr={tr} />);
    expect(screen.getByLabelText('PREV').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('NEXT').hasAttribute('disabled')).toBe(false);
    rerender(<MobilePager page={2} pageCount={3} onPage={vi.fn()} tr={tr} />);
    expect(screen.getByLabelText('PREV').hasAttribute('disabled')).toBe(false);
    expect(screen.getByLabelText('NEXT').hasAttribute('disabled')).toBe(true);
  });

  it('calls onPage with the neighbouring page', () => {
    const onPage = vi.fn();
    render(<MobilePager page={1} pageCount={3} onPage={onPage} tr={tr} />);
    fireEvent.click(screen.getByLabelText('PREV'));
    expect(onPage).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByLabelText('NEXT'));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('merges an extra className onto .mobile-pager', () => {
    const { container } = render(
      <MobilePager page={0} pageCount={2} onPage={vi.fn()} tr={tr} className="extra" />,
    );
    const pager = container.querySelector('.mobile-pager');
    expect(pager).toBeTruthy();
    expect(pager!.classList.contains('extra')).toBe(true);
  });
});
