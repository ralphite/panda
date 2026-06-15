import { describe, expect, it } from 'vitest';
import { annotationBounds, createAnnotation, createTextAnnotation, hitTest, moveAnnotation } from './editor';

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

  it('moves and hit tests arrow annotations', () => {
    const arrow = createAnnotation('arrow', { x: 0, y: 0 }, { x: 20, y: 0 }, '#2563eb', 2);
    const moved = moveAnnotation(arrow, 5, 6);
    expect(moved).toMatchObject({ type: 'arrow', x1: 5, y1: 6, x2: 25, y2: 6 });
    expect(hitTest([arrow], { x: 10, y: 2 })).toBe(arrow.id);
  });

  it('bounds, moves, and hit tests pencil annotations', () => {
    const pencil = {
      ...createAnnotation('pencil', { x: 5, y: 5 }, { x: 5, y: 5 }, '#2563eb', 2),
      points: [
        { x: 5, y: 5 },
        { x: 10, y: 12 },
        { x: 20, y: 8 },
      ],
    };
    const bounds = annotationBounds(pencil);
    expect(bounds).toMatchObject({ x: 5, y: 5, w: 15, h: 7 });
    expect(hitTest([pencil], { x: 11, y: 10 })).toBe(pencil.id);
    expect(moveAnnotation(pencil, 5, 6)).toMatchObject({
      points: [
        { x: 10, y: 11 },
        { x: 15, y: 18 },
        { x: 25, y: 14 },
      ],
    });
  });

  it('bounds multiline text by longest line and line count', () => {
    const text = createTextAnnotation({ x: 10, y: 20 }, 'Short\nLonger line', '#ef4444', 3, 24);
    const bounds = annotationBounds(text);
    expect(bounds.x).toBe(10);
    expect(bounds.y).toBe(20);
    expect(bounds.w).toBeGreaterThan(120);
    expect(bounds.h).toBeGreaterThan(48);
  });
});
