export interface ResolvedReturnFeed {
  peerId: string | null;
  stream: MediaStream | null;
}

export function resolveReturnFeed(
  targetId: string,
  streams: Map<string, MediaStream>,
): ResolvedReturnFeed {
  if (targetId) {
    const targetStream = streams.get(targetId) ?? null;
    if (targetStream) {
      return { peerId: targetId, stream: targetStream };
    }
  }

  const firstEntry = streams.entries().next();
  if (firstEntry.done) {
    return { peerId: null, stream: null };
  }

  const [peerId, stream] = firstEntry.value;
  return { peerId, stream };
}

export interface AutoSwitcherAssignment {
  programId: string | null;
  previewId: string | null;
}

export function getAutoSwitcherAssignment(
  clientIds: string[],
  currentProgramId: string | null,
  currentPreviewId: string | null,
): AutoSwitcherAssignment {
  const uniqueIds = Array.from(new Set(clientIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { programId: null, previewId: null };
  }

  const hasId = (id: string | null) => Boolean(id && uniqueIds.includes(id));

  const programId = hasId(currentProgramId)
    ? currentProgramId
    : hasId(currentPreviewId)
      ? currentPreviewId
      : uniqueIds[0];

  const previewId = hasId(currentPreviewId) && currentPreviewId !== programId
    ? currentPreviewId
    : uniqueIds.find((id) => id !== programId) ?? null;

  return { programId, previewId };
}
