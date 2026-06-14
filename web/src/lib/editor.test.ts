import { describe, expect, it } from 'vitest';
import { createAnnotation, hitTest, moveAnnotation } from './editor';

describe('editor geometry', () => {
  it('creates normalized rectangles and hit tests them', () => {
    const rect = createAnnotation('rect', { x: 50, y: 60 }, { x: 10, y: 20 }, '#ef4444', 3);
    expect(rect).toMatchObject({ x: 10, y: 20, w: 40, h: 40 });
    expect(hitTest([rect], { x: 20, y: 30 })).toBe(rect.id);
  });

  it('moves line annotations', () => {
    const line = createAnnotation('line', { x: 0, y: 0 }, { x: 10, y: 10 }, '#2563eb', 2);
    const moved = moveAnnotation(line, 5, 6);
    expect(moved).toMatchObject({ x1: 5, y1: 6, x2: 15, y2: 16 });
  });
});

