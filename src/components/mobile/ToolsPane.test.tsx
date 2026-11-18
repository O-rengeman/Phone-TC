import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Marker } from '../../utils/export';

// ToolsPane and PresetsPanel both read the context — mock it with a mutable
// fixture so each test can shape the session (clients, markers, host, ...).
const ltc = vi.hoisted<{ current: Record<string, unknown> }>(() => ({ current: {} }));
vi.mock('../../LTCSyncContext', () => ({
  useLTC: () => ltc.current,
}));

import { MobileToolsPane } from './ToolsPane';

const makeMarker = (overrides: Partial<Marker> = {}): Marker => ({
  id: 1,
  tc: '01:00:00:00',
  time: '12:00',
  color: 'Red',
  reelName: 'AX',
  take: 1,
  sceneName: '001',
  comment: '',
  ...overrides,
});

const makeClients = (n: number) =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      `cam-${i + 1}`,
      { lastSeen: 1000, rtt: 50, drift: 0.1 },
    ]),
  );

beforeEach(() => {
  ltc.current = {
    isRunning: false,
    isMobile: true,
    fpsIndex: 2,
    userBits: '00000000',
    setUserBits: vi.fn(),
    autoUserBits: true,
    setAutoUserBits: vi.fn(),
    defaultReelName: 'A001',
    setDefaultReelName: vi.fn(),
    sceneName: '001',
    setSceneName: vi.fn(),
    markers: [] as Marker[],
    isHost: false,
    clients: {},
    nowTick: 1000,
    tr: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}(${Object.values(vars).join(',')})` : key,
    addMarker: vi.fn(),
    removeMarker: vi.fn(),
    updateMarkerComment: vi.fn(),
    exportToEDL: vi.fn(),
    exportToALE: vi.fn(),
    exportToFCPXML: vi.fn(),
    exportToResolve: vi.fn(),
    exportToCSV: vi.fn(),
    exportToOTIO: vi.fn(),
    recallTimecode: vi.fn(),
    engineRef: { current: null },
    currentTcRef: { current: '00:00:00:00' },
    // PresetsPanel mounts when the PRESETS tab is selected.
    volume: 0.5,
    outputLevel: 'line',
    outputMode: 'stereo',
    outputOffset: 0,
    syncMode: 'network',
    setFpsIndex: vi.fn(),
    setVolume: vi.fn(),
    setOutputLevel: vi.fn(),
    setOutputMode: vi.fn(),
    setOutputOffset: vi.fn(),
    setSyncMode: vi.fn(),
    addToast: vi.fn(),
  };
});

const tabs = () =>
  [...document.querySelectorAll<HTMLButtonElement>('.mobile-pane-tab')].map((b) => b.textContent);

describe('MobileToolsPane', () => {
  it('renders MARK/TAKES/PRESETS/META tabs and hides CAMERAS without clients', () => {
    render(<MobileToolsPane />);
    expect(tabs()).toEqual(['btn.mark', 'dtab.markers', 'preset.title', 'dt.metadata']);
  });

  it('shows quick marks on the default MARK section', () => {
    render(<MobileToolsPane />);
    expect(screen.getByText('color.red')).toBeTruthy();
    expect(screen.getByText('color.yellow')).toBeTruthy();
  });

  it('switching to TAKES shows export chips and paged marker rows', () => {
    ltc.current.markers = [1, 2, 3].map((id) => makeMarker({ id, tc: `01:00:0${id}:00` }));
    render(<MobileToolsPane />);
    fireEvent.click(screen.getByText('dtab.markers'));

    expect(screen.getByText('EDL')).toBeTruthy();
    expect(screen.getByText('OTIO')).toBeTruthy();
    // Two rows per page — the third take is behind the pager.
    expect(document.querySelectorAll('.marker-row-pro')).toHaveLength(2);
    expect(screen.getByText('01:00:01:00')).toBeTruthy();
    expect(screen.queryByText('01:00:03:00')).toBeNull();
    expect(document.querySelector('.mobile-page-status')?.textContent).toContain('pager.status');

    fireEvent.click(document.querySelector<HTMLButtonElement>('.mobile-page-next')!);
    expect(screen.getByText('01:00:03:00')).toBeTruthy();
    expect(screen.queryByText('01:00:01:00')).toBeNull();
  });

  it('switching to PRESETS mounts the preset panel', () => {
    render(<MobileToolsPane />);
    fireEvent.click(screen.getByText('preset.title'));
    expect(document.querySelector('.preset-panel')).toBeTruthy();
    expect(screen.getByPlaceholderText('preset.namePlaceholder')).toBeTruthy();
  });

  it('switching to META shows the user bits / reel / scene cards', () => {
    render(<MobileToolsPane />);
    fireEvent.click(screen.getByText('dt.metadata'));
    expect(screen.getByText('label.userBits')).toBeTruthy();
    expect(screen.getByText('label.defaultReel')).toBeTruthy();
    expect(screen.getByText('label.defaultScene')).toBeTruthy();
    expect(screen.getByText('btn.auto')).toBeTruthy();
  });

  it('shows CAMERAS while hosting clients and pages them four at a time', () => {
    ltc.current.isHost = true;
    ltc.current.clients = makeClients(5);
    render(<MobileToolsPane />);
    expect(tabs()).toContain('dt.clients');

    fireEvent.click(screen.getByText('dt.clients'));
    expect(document.querySelectorAll('.client-card')).toHaveLength(4);
    expect(screen.getByText('cam-1')).toBeTruthy();
    expect(screen.queryByText('cam-5')).toBeNull();

    fireEvent.click(document.querySelector<HTMLButtonElement>('.mobile-page-next')!);
    expect(screen.getByText('cam-5')).toBeTruthy();
  });

  it('falls back to MARK when the last client disappears from CAMERAS', () => {
    ltc.current.isHost = true;
    ltc.current.clients = makeClients(1);
    const { rerender } = render(<MobileToolsPane />);
    fireEvent.click(screen.getByText('dt.clients'));
    expect(screen.getByText('cam-1')).toBeTruthy();

    ltc.current.clients = {};
    rerender(<MobileToolsPane />);
    expect(tabs()).not.toContain('dt.clients');
    expect(screen.getByText('color.red')).toBeTruthy();
  });
});
