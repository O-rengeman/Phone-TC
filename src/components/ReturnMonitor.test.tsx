import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReturnMonitor } from './ReturnMonitor';

describe('ReturnMonitor', () => {
  it('shows the disconnected state and opens the full-screen tally view', () => {
    const onOpenFullscreen = vi.fn();

    render(
      <ReturnMonitor
        stream={null}
        sourceId={null}
        connected={false}
        onOpenFullscreen={onOpenFullscreen}
        pipEnabled={false}
        setPipEnabled={() => undefined}
      />,
    );

    expect(screen.getByText('OFFLINE')).toBeTruthy();
    expect(screen.getByText('CONNECT TO DIRECTOR')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open tally full screen' }));
    expect(onOpenFullscreen).toHaveBeenCalledOnce();
  });

  it('distinguishes a connected client that is waiting for a PGM source', () => {
    render(
      <ReturnMonitor
        stream={null}
        sourceId={null}
        connected={true}
        onOpenFullscreen={() => undefined}
        pipEnabled={false}
        setPipEnabled={() => undefined}
      />,
    );

    expect(screen.getByText('WAITING')).toBeTruthy();
    expect(screen.getByText('NO PROGRAM SIGNAL')).toBeTruthy();
  });
});
