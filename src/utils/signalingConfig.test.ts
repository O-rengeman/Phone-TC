import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_KEYS } from './storage';
import {
  clearPeerServerConfig,
  loadPeerServerConfig,
  peerJsOptionsFromConfig,
  savePeerServerConfig,
} from './signalingConfig';

const KEY = STORAGE_KEYS.peerServer;

const FULL_CONFIG = {
  host: 'peer.example.com',
  port: 9000,
  path: '/peerjs',
  secure: true,
  key: 'crew-key',
};

beforeEach(() => localStorage.clear());

describe('loadPeerServerConfig', () => {
  it('returns null when nothing is stored', () => {
    expect(loadPeerServerConfig()).toBeNull();
  });

  it('returns null for malformed JSON instead of throwing', () => {
    localStorage.setItem(KEY, '{ not json');
    expect(loadPeerServerConfig()).toBeNull();
  });

  it('returns null for JSON that is not a config object', () => {
    for (const raw of ['null', '42', '"peer.example.com"', '[1,2]', '{}']) {
      localStorage.setItem(KEY, raw);
      expect(loadPeerServerConfig()).toBeNull();
    }
  });

  it('returns null when host is missing, blank, or not a string', () => {
    const base = { port: 9000, path: '/', secure: false };
    for (const host of [undefined, '', '   ', 42]) {
      localStorage.setItem(KEY, JSON.stringify({ ...base, host }));
      expect(loadPeerServerConfig()).toBeNull();
    }
  });

  it('rejects out-of-range and non-integer ports', () => {
    for (const port of [0, -1, 65536, 1.5, 'abc', null, true]) {
      localStorage.setItem(KEY, JSON.stringify({ host: 'h.example.com', port, path: '/', secure: false }));
      expect(loadPeerServerConfig()).toBeNull();
    }
  });

  it('accepts the boundary ports 1 and 65535', () => {
    for (const port of [1, 65535]) {
      localStorage.setItem(KEY, JSON.stringify({ host: 'h.example.com', port, path: '/', secure: false }));
      expect(loadPeerServerConfig()?.port).toBe(port);
    }
  });

  it('normalizes missing path/secure/key to PeerJS-friendly defaults', () => {
    localStorage.setItem(KEY, JSON.stringify({ host: 'h.example.com', port: 9000 }));
    expect(loadPeerServerConfig()).toEqual({
      host: 'h.example.com',
      port: 9000,
      path: '/',
      secure: false,
    });
  });

  it('trims host and path and drops a blank key', () => {
    localStorage.setItem(KEY, JSON.stringify({
      host: '  peer.example.com  ', port: 9000, path: ' /peerjs ', secure: true, key: '  ',
    }));
    expect(loadPeerServerConfig()).toEqual({
      host: 'peer.example.com',
      port: 9000,
      path: '/peerjs',
      secure: true,
    });
  });
});

describe('savePeerServerConfig / clearPeerServerConfig', () => {
  it('round-trips a full config', () => {
    savePeerServerConfig(FULL_CONFIG);
    expect(loadPeerServerConfig()).toEqual(FULL_CONFIG);
  });

  it('round-trips a minimal config without a key', () => {
    const cfg = { host: 'peer.local', port: 1, path: '/', secure: false };
    savePeerServerConfig(cfg);
    expect(loadPeerServerConfig()).toEqual(cfg);
    expect(loadPeerServerConfig()).not.toHaveProperty('key');
  });

  it('stores null as the cloud default', () => {
    savePeerServerConfig(FULL_CONFIG);
    savePeerServerConfig(null);
    expect(loadPeerServerConfig()).toBeNull();
  });

  it('coerces an invalid config to null rather than persisting it', () => {
    // port 70000 is a valid `number` type-wise — rejection happens at runtime.
    savePeerServerConfig({ host: 'h.example.com', port: 70000, path: '/', secure: false });
    expect(loadPeerServerConfig()).toBeNull();
  });

  it('clearPeerServerConfig removes a previously saved override', () => {
    savePeerServerConfig(FULL_CONFIG);
    clearPeerServerConfig();
    expect(loadPeerServerConfig()).toBeNull();
    expect(peerJsOptionsFromConfig(loadPeerServerConfig())).toEqual({});
  });
});

describe('peerJsOptionsFromConfig', () => {
  it('returns an empty object for null so PeerJS defaults apply', () => {
    expect(peerJsOptionsFromConfig(null)).toEqual({});
  });

  it('returns an empty object for invalid input', () => {
    expect(peerJsOptionsFromConfig({ host: '', port: 9000, path: '/', secure: false })).toEqual({});
    expect(peerJsOptionsFromConfig({ host: 'h', port: 0, path: '/', secure: false })).toEqual({});
  });

  it('maps host, port, path and secure without a key', () => {
    expect(peerJsOptionsFromConfig({ host: 'peer.example.com', port: 9000, path: '/peerjs', secure: false }))
      .toEqual({ host: 'peer.example.com', port: 9000, path: '/peerjs', secure: false });
  });

  it('includes key only when configured', () => {
    expect(peerJsOptionsFromConfig(FULL_CONFIG))
      .toEqual({ host: 'peer.example.com', port: 9000, path: '/peerjs', secure: true, key: 'crew-key' });
    expect(peerJsOptionsFromConfig({ ...FULL_CONFIG, key: undefined }))
      .not.toHaveProperty('key');
  });
});
