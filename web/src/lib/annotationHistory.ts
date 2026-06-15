import type { Annotation } from '../types';

export interface AnnotationHistorySnapshot {
  annotations: Annotation[];
  selectedId: string | null;
}

export interface AnnotationHistoryState {
  redo: AnnotationHistorySnapshot[];
  undo: AnnotationHistorySnapshot[];
}

const DEFAULT_HISTORY_LIMIT = 100;

export function createAnnotationSnapshot(annotations: Annotation[], selectedId: string | null): AnnotationHistorySnapshot {
  return {
    annotations: cloneAnnotations(annotations),
    selectedId,
  };
}

export function createEmptyAnnotationHistory(): AnnotationHistoryState {
  return { redo: [], undo: [] };
}

export function annotationsEqual(left: Annotation[], right: Annotation[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function pushUndoSnapshot(
  history: AnnotationHistoryState,
  snapshot: AnnotationHistorySnapshot,
  limit = DEFAULT_HISTORY_LIMIT,
): AnnotationHistoryState {
  return {
    redo: [],
    undo: [...history.undo, cloneSnapshot(snapshot)].slice(-limit),
  };
}

export function undoAnnotationHistory(
  history: AnnotationHistoryState,
  current: AnnotationHistorySnapshot,
): { history: AnnotationHistoryState; snapshot: AnnotationHistorySnapshot | null } {
  const snapshot = history.undo[history.undo.length - 1];
  if (!snapshot) {
    return { history, snapshot: null };
  }

  return {
    history: {
      redo: [...history.redo, cloneSnapshot(current)],
      undo: history.undo.slice(0, -1),
    },
    snapshot: cloneSnapshot(snapshot),
  };
}

export function redoAnnotationHistory(
  history: AnnotationHistoryState,
  current: AnnotationHistorySnapshot,
): { history: AnnotationHistoryState; snapshot: AnnotationHistorySnapshot | null } {
  const snapshot = history.redo[history.redo.length - 1];
  if (!snapshot) {
    return { history, snapshot: null };
  }

  return {
    history: {
      redo: history.redo.slice(0, -1),
      undo: [...history.undo, cloneSnapshot(current)],
    },
    snapshot: cloneSnapshot(snapshot),
  };
}

function cloneSnapshot(snapshot: AnnotationHistorySnapshot): AnnotationHistorySnapshot {
  return {
    annotations: cloneAnnotations(snapshot.annotations),
    selectedId: snapshot.selectedId,
  };
}

function cloneAnnotations(annotations: Annotation[]): Annotation[] {
  return JSON.parse(JSON.stringify(annotations)) as Annotation[];
}
