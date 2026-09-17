import { describe, it, expect } from 'vitest';
import { buildIceServers, parseTurnConfig, DEFAULT_ICE_SERVERS, ICE_SERVERS } from './iceServers';

describe('buildIceServers', () => {
  it('returns the public defaults when no custom TURN is configured', () => {
    expect(buildIceServers()).toEqual(DEFAULT_ICE_SERVERS);
    expect(buildIceServers(null)).toEqual(DEFAULT_ICE_SERVERS);
    expect(buildIceServers({})).toEqual(DEFAULT_ICE_SERVERS);
  });

  it('ignores a blank or whitespace-only url list', () => {
    expect(buildIceServers({ urls: '   ' })).toEqual(DEFAULT_ICE_SERVERS);
    expect(buildIceServers({ urls: ',,' })).toEqual(DEFAULT_ICE_SERVERS);
  });

  it('puts a custom TURN server ahead of the public defaults', () => {
    const servers = buildIceServers({
      urls: 'turn:turn.example.com:3478',
      username: 'crew',
      credential: 'secret',
    });

    expect(servers[0]).toEqual({
      urls: ['turn:turn.example.com:3478'],
      username: 'crew',
      credential: 'secret',
    });
    expect(servers.slice(1)).toEqual(DEFAULT_ICE_SERVERS);
  });

  it('splits and trims a comma-separated url list', () => {
    const servers = buildIceServers({ urls: 'turn:a.example.com:3478 , turns:b.example.com:5349' });
    expect(servers[0].urls).toEqual(['turn:a.example.com:3478', 'turns:b.example.com:5349']);
  });

  it('omits empty credentials rather than sending blank ones', () => {
    const servers = buildIceServers({ urls: 'stun:stun.example.com:3478', username: '  ', credential: '' });
    expect(servers[0]).toEqual({ urls: ['stun:stun.example.com:3478'] });
  });

  it('never mutates the shared defaults array', () => {
    const before = [...DEFAULT_ICE_SERVERS];
    buildIceServers({ urls: 'turn:turn.example.com:3478' });
    expect(DEFAULT_ICE_SERVERS).toEqual(before);
  });
});

describe('parseTurnConfig', () => {
  it('returns null for missing or empty input', () => {
    expect(parseTurnConfig(null)).toBeNull();
    expect(parseTurnConfig(undefined)).toBeNull();
    expect(parseTurnConfig('')).toBeNull();
  });

  it('returns null for malformed JSON instead of throwing', () => {
    expect(parseTurnConfig('{ not json')).toBeNull();
  });

  it('returns null when urls is missing, blank, or the wrong type', () => {
    expect(parseTurnConfig('{"username":"crew"}')).toBeNull();
    expect(parseTurnConfig('{"urls":"   "}')).toBeNull();
    expect(parseTurnConfig('{"urls":42}')).toBeNull();
    expect(parseTurnConfig('"turn:example.com"')).toBeNull();
  });

  it('reads a full configuration object', () => {
    expect(parseTurnConfig('{"urls":"turn:t.example.com:3478","username":"crew","credential":"pw"}'))
      .toEqual({ urls: 'turn:t.example.com:3478', username: 'crew', credential: 'pw' });
  });

  it('drops non-string credentials but keeps the urls', () => {
    expect(parseTurnConfig('{"urls":"turn:t.example.com:3478","username":7}'))
      .toEqual({ urls: 'turn:t.example.com:3478', username: undefined, credential: undefined });
  });
});

describe('ICE_SERVERS', () => {
  it('falls back to the public defaults when nothing is configured', () => {
    // No VITE_TURN_* vars and no localStorage override under test.
    expect(ICE_SERVERS).toEqual(DEFAULT_ICE_SERVERS);
  });
});
