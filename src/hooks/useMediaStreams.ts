import { useEffect, useState } from 'react';

// A simple global store for MediaStreams to avoid React re-renders on mutable objects.
const streamStore = new Map<string, MediaStream>();
const listeners = new Set<() => void>();

const notifyListeners = () => {
  listeners.forEach(l => l());
};

export const mediaStreamActions = {
  addStream: (peerId: string, stream: MediaStream) => {
    streamStore.set(peerId, stream);
    notifyListeners();
  },
  removeStream: (peerId: string) => {
    if (streamStore.has(peerId)) {
      streamStore.delete(peerId);
      notifyListeners();
    }
  },
  clearStreams: () => {
    streamStore.clear();
    notifyListeners();
  },
  getStream: (peerId: string) => {
    return streamStore.get(peerId) || null;
  },
  getAllStreams: () => {
    return new Map(streamStore);
  }
};

/**
 * Hook to access the current map of peer streams.
 * Triggers a re-render only when streams are added or removed.
 */
export function useMediaStreams() {
  const [streams, setStreams] = useState<Map<string, MediaStream>>(new Map());

  useEffect(() => {
    const update = () => setStreams(mediaStreamActions.getAllStreams());
    listeners.add(update);
    // Initial populate
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  return streams;
}

/**
 * Hook for getting a specific peer's stream without subscribing to all stream changes.
 */
export function usePeerStream(peerId: string | null) {
  const [stream, setStream] = useState<MediaStream | null>(peerId ? mediaStreamActions.getStream(peerId) : null);

  useEffect(() => {
    const update = () => {
      if (peerId) {
        setStream(mediaStreamActions.getStream(peerId));
      } else {
        setStream(null);
      }
    };
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, [peerId]);

  return stream;
}
