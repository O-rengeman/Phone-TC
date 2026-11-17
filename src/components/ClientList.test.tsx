import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClientList } from './ClientList';

describe('ClientList', () => {
  const baseProps = {
    clients: {} as Record<string, { lastSeen: number; rtt: number; drift: number }>,
    nowTick: 1000,
    isHost: true,
    tr: (key: string) => key,
  };

  it('returns null when not host', () => {
    const { container } = render(<ClientList {...baseProps} isHost={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when no clients', () => {
    const { container } = render(<ClientList {...baseProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders client cards with correct data', () => {
    const clients = {
      client1: { lastSeen: 1000, rtt: 50, drift: 0.1 },
    };
    render(<ClientList {...baseProps} clients={clients} />);
    expect(screen.getByText('client1')).toBeTruthy();
    expect(screen.getByText('RTT: 50ms')).toBeTruthy();
    expect(screen.getByText('δ: 0.10s')).toBeTruthy();
  });

  it('shows offline status for stale clients', () => {
    const clients = {
      client1: { lastSeen: 0, rtt: 50, drift: 0.1 },
    };
    render(<ClientList {...baseProps} clients={clients} nowTick={40000} />);
    const card = screen.getByText('client1').closest('.client-card');
    expect(card?.classList.contains('offline')).toBe(true);
  });

  it('shows drift warning for high drift', () => {
    const clients = {
      client1: { lastSeen: 1000, rtt: 50, drift: 0.8 },
    };
    render(<ClientList {...baseProps} clients={clients} />);
    const driftStat = screen.getByText('δ: 0.80s');
    expect(driftStat.classList.contains('drift-warn')).toBe(true);
  });

  it('renders multiple clients', () => {
    const clients = {
      client1: { lastSeen: 1000, rtt: 50, drift: 0.1 },
      client2: { lastSeen: 1000, rtt: 100, drift: 0.2 },
    };
    render(<ClientList {...baseProps} clients={clients} />);
    expect(screen.getByText('client1')).toBeTruthy();
    expect(screen.getByText('client2')).toBeTruthy();
  });
});
