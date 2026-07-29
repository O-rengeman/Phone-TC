import { describe, it, expect } from 'vitest';
import {
  OBS_DEFAULT_URL,
  autoMapObsScenes,
  normalizeObsUrl,
  obsMixedContentWarning,
  pruneObsMapping,
  resolveObsBuses,
  setObsSceneCamera,
} from './obsTally';

describe('resolveObsBuses', () => {
  const mapping = { 'CAM A': 'peer-a', 'CAM B': 'peer-b' };

  it('maps the program and preview scenes to their cameras', () => {
    expect(resolveObsBuses('CAM A', 'CAM B', mapping))
      .toEqual({ programId: 'peer-a', previewId: 'peer-b' });
  });

  it('leaves both buses empty when the scenes have no camera behind them', () => {
    // A titles or slate scene must not light anyone's lamp.
    expect(resolveObsBuses('Intro', 'Outro', mapping))
      .toEqual({ programId: null, previewId: null });
  });

  it('drops preview when it resolves to the camera already on program', () => {
    expect(resolveObsBuses('CAM A', 'CAM A', mapping))
      .toEqual({ programId: 'peer-a', previewId: null });
  });

  it('handles a missing preview scene (studio mode off)', () => {
    expect(resolveObsBuses('CAM B', null, mapping))
      .toEqual({ programId: 'peer-b', previewId: null });
  });

  it('still assigns a camera that is not currently connected', () => {
    // Assignments are addressed by peer id; a phone that dropped Wi-Fi picks
    // its tally back up on reconnect rather than being cleared here.
    expect(resolveObsBuses('CAM A', null, mapping).programId).toBe('peer-a');
  });
});

describe('pruneObsMapping', () => {
  it('drops entries for scenes OBS no longer has', () => {
    expect(pruneObsMapping({ A: '1', B: '2' }, ['A']))
      .toEqual({ A: '1' });
  });

  it('returns the same object when nothing changed', () => {
    const mapping = { A: '1' };
    expect(pruneObsMapping(mapping, ['A', 'B'])).toBe(mapping);
  });
});

describe('autoMapObsScenes', () => {
  it('pairs scenes with cameras in order', () => {
    expect(autoMapObsScenes(['S1', 'S2'], ['a', 'b']))
      .toEqual({ S1: 'a', S2: 'b' });
  });

  it('keeps existing assignments and only fills the gaps', () => {
    expect(autoMapObsScenes(['S1', 'S2', 'S3'], ['a', 'b', 'c'], { S2: 'a' }))
      .toEqual({ S2: 'a', S1: 'b', S3: 'c' });
  });

  it('stops when the cameras run out', () => {
    expect(autoMapObsScenes(['S1', 'S2', 'S3'], ['a']))
      .toEqual({ S1: 'a' });
  });

  it('leaves the mapping alone when there are no cameras', () => {
    expect(autoMapObsScenes(['S1'], [])).toEqual({});
  });
});

describe('setObsSceneCamera', () => {
  it('assigns a camera to a scene', () => {
    expect(setObsSceneCamera({}, 'S1', 'a')).toEqual({ S1: 'a' });
  });

  it('clears a scene when passed null', () => {
    expect(setObsSceneCamera({ S1: 'a', S2: 'b' }, 'S1', null)).toEqual({ S2: 'b' });
  });

  it('releases the camera from whichever scene held it before', () => {
    // Two scenes claiming CAM1 would make the live lamp depend on scene order.
    expect(setObsSceneCamera({ S1: 'a' }, 'S2', 'a')).toEqual({ S2: 'a' });
  });
});

describe('obsMixedContentWarning', () => {
  it('says nothing on an http page', () => {
    expect(obsMixedContentWarning('ws://192.168.1.20:4455', 'http:')).toBeNull();
  });

  it('allows loopback hosts from an https page', () => {
    expect(obsMixedContentWarning('ws://localhost:4455', 'https:')).toBeNull();
    expect(obsMixedContentWarning('ws://127.0.0.1:4455', 'https:')).toBeNull();
    expect(obsMixedContentWarning('ws://[::1]:4455', 'https:')).toBeNull();
  });

  it('flags a LAN host from an https page', () => {
    expect(obsMixedContentWarning('ws://192.168.1.20:4455', 'https:')).toBe('mixedContent');
  });

  it('allows wss from an https page', () => {
    expect(obsMixedContentWarning('wss://obs.example:4455', 'https:')).toBeNull();
  });

  it('says nothing about an unparseable url', () => {
    expect(obsMixedContentWarning('not a url', 'https:')).toBeNull();
  });
});

describe('normalizeObsUrl', () => {
  it('adds the scheme and default port', () => {
    expect(normalizeObsUrl('localhost')).toBe('ws://localhost:4455');
  });

  it('keeps an explicit port', () => {
    expect(normalizeObsUrl('192.168.1.20:5000')).toBe('ws://192.168.1.20:5000');
  });

  it('keeps wss and strips any path', () => {
    expect(normalizeObsUrl('wss://obs.example:4455/socket')).toBe('wss://obs.example:4455');
  });

  it('falls back to the default for empty or unparseable input', () => {
    expect(normalizeObsUrl('   ')).toBe(OBS_DEFAULT_URL);
    expect(normalizeObsUrl('ws://')).toBe(OBS_DEFAULT_URL);
  });
});
