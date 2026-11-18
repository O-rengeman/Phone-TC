import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PreflightScreen } from './PreflightScreen';
import { healthyPreflight } from '../test/preflightFixture';
import { t } from '../utils/i18n';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
});
afterEach(() => vi.restoreAllMocks());

describe('PreflightScreen', () => {
  it('shows an all-green Japanese screen and updates live when battery drops', () => {
    const props = { state: healthyPreflight, outputLevel: 'line' as const, batteryEta: 45, tr: (key: string, vars?: Record<string, string | number>) => t(key, 'ja', vars), onClose: vi.fn() };
    const { rerender } = render(<PreflightScreen {...props} />);
    expect(screen.getByRole('dialog', { name: '撮影前チェック' })).toBeTruthy();
    expect(screen.getByText('撮影準備OK')).toBeTruthy();
    expect(screen.getAllByText('OK')).toHaveLength(5);
    expect(screen.getByText('LINE · 50% · -6.0 dBFS')).toBeTruthy();
    expect(screen.getByText('80% · 残り約 45m')).toBeTruthy();
    rerender(<PreflightScreen {...props} state={{ ...healthyPreflight, batteryLevel: 0.1, wakeLockStatus: 'released' }} />);
    expect(screen.getByText('撮影前に確認が必要です')).toBeTruthy();
    expect(screen.getAllByText('要確認')).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toContain('3 / 5');
  });

  it('renders English unknown states as problems and supports close, Escape and focus restoration', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const { unmount } = render(<PreflightScreen state={{ ...healthyPreflight, isRunning: false, volume: 0, batteryLevel: null, syncStatus: null, wakeLockStatus: 'unsupported' }} outputLevel="mic" batteryEta={null} tr={(k, vars) => t(k, 'en', vars)} onClose={onClose} />);
    expect(screen.getByText('Check before rolling')).toBeTruthy();
    expect(screen.getAllByText('CHECK')).toHaveLength(5);
    expect(screen.getByText('MIC · 0% · −∞ dBFS')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to controls' }));
    fireEvent(screen.getByRole('dialog'), new Event('cancel'));
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('shows one check per pager page on mobile and reaches all five', () => {
    render(<PreflightScreen state={healthyPreflight} outputLevel="line" batteryEta={45} tr={(k, vars) => t(k, 'en', vars)} onClose={vi.fn()} isMobile />);
    expect(document.querySelector('.preflight-v3')).toBeTruthy();
    expect(document.querySelector('.mobile-pager')).toBeTruthy();
    expect(document.querySelectorAll('.preflight-check')).toHaveLength(1);
    expect(screen.getByText('Output level')).toBeTruthy();
    expect(document.querySelector('.mobile-page-status')!.textContent).toBe('1 / 5');

    fireEvent.click(screen.getByRole('button', { name: 'NEXT' }));
    expect(screen.getByText('Clipping')).toBeTruthy();
    expect(document.querySelectorAll('.preflight-check')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'NEXT' }));
    fireEvent.click(screen.getByRole('button', { name: 'NEXT' }));
    fireEvent.click(screen.getByRole('button', { name: 'NEXT' }));
    expect(screen.getByText('Keep screen awake')).toBeTruthy();
    expect(document.querySelector('.mobile-page-status')!.textContent).toBe('5 / 5');
    expect(screen.getByRole('button', { name: 'NEXT' }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'PREV' }));
    expect(screen.getByText('Sync state')).toBeTruthy();
  });
});
