import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { t } from '../utils/i18n';
import { HelpButton } from './HelpButton';

const tr = (key: string) => t(key, 'ja');

describe('HelpButton', () => {
  it('shows nothing until it is pressed', () => {
    render(<HelpButton topic="sync" tr={tr} />);
    expect(document.querySelector('.fhelp-overlay')).toBeNull();
  });

  it('opens the sheet for its own topic', () => {
    render(<HelpButton topic="sync" tr={tr} />);
    fireEvent.click(screen.getByRole('button', { name: /使い方/ }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(t('help.sync.title', 'ja'))).toBeTruthy();
  });

  it('lists every step and tip of the topic', () => {
    render(<HelpButton topic="markers" tr={tr} />);
    fireEvent.click(screen.getByRole('button', { name: /使い方/ }));

    expect(document.querySelectorAll('.fhelp-steps li')).toHaveLength(6);
    expect(document.querySelectorAll('.fhelp-tip')).toHaveLength(2);
  });

  it('renders the named controls as chips, not as raw [[markup]]', () => {
    render(<HelpButton topic="markers" tr={tr} />);
    fireEvent.click(screen.getByRole('button', { name: /使い方/ }));

    const chips = Array.from(document.querySelectorAll('.fhelp-ctl')).map(el => el.textContent);
    expect(chips).toContain('EDL');
    expect(chips).toContain('ALE');
    expect(screen.getByRole('dialog').textContent).not.toContain('[[');
  });

  it('closes on the close button', () => {
    render(<HelpButton topic="sync" tr={tr} />);
    fireEvent.click(screen.getByRole('button', { name: /使い方/ }));
    fireEvent.click(screen.getByRole('button', { name: t('help.close', 'ja') }));

    expect(document.querySelector('.fhelp-overlay')).toBeNull();
  });

  it('closes on a click outside the sheet', () => {
    render(<HelpButton topic="sync" tr={tr} />);
    fireEvent.click(screen.getByRole('button', { name: /使い方/ }));
    fireEvent.click(document.querySelector('.fhelp-overlay')!);

    expect(document.querySelector('.fhelp-overlay')).toBeNull();
  });

  it('keeps the sheet open when the sheet itself is clicked', () => {
    render(<HelpButton topic="sync" tr={tr} />);
    fireEvent.click(screen.getByRole('button', { name: /使い方/ }));
    fireEvent.click(screen.getByRole('dialog'));

    expect(document.querySelector('.fhelp-overlay')).toBeTruthy();
  });

  it('closes on Escape', () => {
    render(<HelpButton topic="sync" tr={tr} />);
    fireEvent.click(screen.getByRole('button', { name: /使い方/ }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(document.querySelector('.fhelp-overlay')).toBeNull();
  });

  describe('mobile (no-scroll) sheet', () => {
    let innerWidth: number;
    beforeEach(() => {
      innerWidth = window.innerWidth;
      Object.defineProperty(window, 'innerWidth', { value: 390, writable: true, configurable: true });
    });
    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', { value: innerWidth, writable: true, configurable: true });
    });

    it('pages the steps three at a time and puts the tips on the last page', () => {
      render(<HelpButton topic="sync" tr={tr} />);
      fireEvent.click(screen.getByRole('button', { name: /使い方/ }));

      const sheet = document.querySelector('.fhelp-sheet-v3');
      expect(sheet).toBeTruthy();
      expect(document.querySelector('.mobile-pager')).toBeTruthy();
      // sync has 6 steps -> 2 pages of 3; tips only on the last page.
      expect(document.querySelectorAll('.fhelp-steps li')).toHaveLength(3);
      expect(document.querySelectorAll('.fhelp-tip')).toHaveLength(0);
      expect(document.querySelector('.fhelp-summary')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: t('pager.next', 'ja') }));
      expect(document.querySelectorAll('.fhelp-steps li')).toHaveLength(3);
      expect(document.querySelectorAll('.fhelp-tip')).toHaveLength(2);
    });

    it('still reaches every step and tip across the pages', () => {
      render(<HelpButton topic="timecode" tr={tr} />);
      fireEvent.click(screen.getByRole('button', { name: /使い方/ }));

      // timecode has 8 steps -> 3 pages (3 / 3 / 2).
      expect(document.querySelectorAll('.fhelp-steps li')).toHaveLength(3);
      fireEvent.click(screen.getByRole('button', { name: t('pager.next', 'ja') }));
      expect(document.querySelectorAll('.fhelp-steps li')).toHaveLength(3);
      fireEvent.click(screen.getByRole('button', { name: t('pager.next', 'ja') }));
      expect(document.querySelectorAll('.fhelp-steps li')).toHaveLength(2);
      expect(document.querySelectorAll('.fhelp-tip')).toHaveLength(2);
      expect(screen.getByRole('button', { name: t('pager.next', 'ja') }).hasAttribute('disabled')).toBe(true);
    });
  });
});
