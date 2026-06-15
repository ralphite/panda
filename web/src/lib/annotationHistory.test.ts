import { describe, expect, it } from 'vitest';
import {
  createAnnotationSnapshot,
  createEmptyAnnotationHistory,
  pushUndoSnapshot,
  redoAnnotationHistory,
  undoAnnotationHistory,
} from './annotationHistory';
import type { Annotation } from '../types';

const base: Annotation[] = [
  {
    id: 'a',
    type: 'rect',
    x: 10,
    y: 20,
    w: 30,
    h: 40,
    color: '#ef4444',
    strokeWidth: 3,
  },
];

const next: Annotation[] = [
  {
    id: 'a',
    type: 'rect',
    x: 40,
    y: 20,
    w: 30,
    h: 40,
    color: '#ef4444',
    strokeWidth: 3,
  },
];

describe('annotation history', () => {
  it('undoes and redoes annotation snapshots', () => {
    let history = createEmptyAnnotationHistory();
    history = pushUndoSnapshot(history, createAnnotationSnapshot(base, 'a'));

    const undone = undoAnnotationHistory(history, createAnnotationSnapshot(next, 'a'));
    expect(undone.snapshot?.annotations).toEqual(base);

    const redone = redoAnnotationHistory(undone.history, undone.snapshot!);
    expect(redone.snapshot?.annotations).toEqual(next);
  });

  it('clears redo snapshots when a new edit is recorded', () => {
    let history = createEmptyAnnotationHistory();
    history = pushUndoSnapshot(history, createAnnotationSnapshot(base, 'a'));

    const undone = undoAnnotationHistory(history, createAnnotationSnapshot(next, 'a'));
    const updated = pushUndoSnapshot(undone.history, undone.snapshot!);

    expect(updated.redo).toEqual([]);
  });

  it('clones snapshots before storing them', () => {
    let history = createEmptyAnnotationHistory();
    const snapshot = createAnnotationSnapshot(base, 'a');
    history = pushUndoSnapshot(history, snapshot);
    snapshot.annotations[0].color = '#000000';

    expect(history.undo[0].annotations[0].color).toBe('#ef4444');
  });
});
