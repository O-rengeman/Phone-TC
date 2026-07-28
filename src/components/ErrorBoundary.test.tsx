import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ message = 'render exploded' }: { message?: string }): React.ReactNode {
  throw new Error(message);
}

beforeEach(() => {
  // React logs the caught error itself; silence it so a passing run stays readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('ErrorBoundary', () => {
  it('renders its children when nothing goes wrong', () => {
    render(
      <ErrorBoundary>
        <p>timecode running</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('timecode running')).toBeTruthy();
  });

  it('shows a recovery screen instead of a blank page when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('UNEXPECTED ERROR')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'RELOAD APP' })).toBeTruthy();
  });

  it('shows the failure detail so it can be reported', () => {
    render(
      <ErrorBoundary>
        <Boom message="worklet is gone" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('worklet is gone')).toBeTruthy();
  });

  it('logs the error with its component stack for diagnosis', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      '[ErrorBoundary] Unhandled render error',
      expect.any(Error),
      expect.anything(),
    );
  });

  it('reloads the app when the recovery button is pressed', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
    });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'RELOAD APP' }));

    expect(reload).toHaveBeenCalled();
  });

  it('speaks the language the operator selected', () => {
    localStorage.setItem('ltc-lang', 'ja');

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText('予期しないエラーが発生しました')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'アプリを再読み込み' })).toBeTruthy();
  });
});
