import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { t } from '../utils/i18n';
import { HelpButton } from './HelpButton';

const tr = (key: string) => t(key, 'ja');

describe('HelpButton', () => {
  it('shows nothing until it is pressed', () => {
    render(<HelpButton topic="obs" tr={tr} />);
    expect(document.querySelector('.fhelp-overlay')).toBeNull();
  });

  it('opens the sheet for its own topic', () => {
    render(<HelpButton topic="obs" tr={tr} />);
    fireEvent.click(screen.getByRole('button', { name: /使い方/ }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(t('help.obs.title', 'ja'))).toBeTruthy();
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
    render(<HelpButton topic="tally" tr={tr} />);
    fireEvent.click(screen.getByRole('button', { name: /使い方/ }));
    fireEvent.click(screen.getByRole('button', { name: t('help.close', 'ja') }));

    expect(document.querySelector('.fhelp-overlay')).toBeNull();
  });

  it('closes on a click outside the sheet', () => {
    render(<HelpButton topic="tally" tr={tr} />);
    fireEvent.click(screen.getByRole('button', { name: /使い方/ }));
    fireEvent.click(document.querySelector('.fhelp-overlay')!);

    expect(document.querySelector('.fhelp-overlay')).toBeNull();
  });

  it('keeps the sheet open when the sheet itself is clicked', () => {
    render(<HelpButton topic="tally" tr={tr} />);
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
});
