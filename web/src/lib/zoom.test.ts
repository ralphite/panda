import { describe, expect, it } from 'vitest';
import { fitZoomForBounds, normalizeZoom } from './zoom';

describe('zoom helpers', () => {
  it('does not enlarge an image when fitting by default', () => {
    expect(fitZoomForBounds({ width: 400, height: 300 }, { width: 1200, height: 900 })).toBe(1);
  });

  it('fits to the limiting viewport dimension', () => {
    expect(fitZoomForBounds({ width: 2585, height: 1850 }, { width: 1330, height: 1120 })).toBe(0.51);
  });

  it('keeps very large images within the zoom bounds', () => {
    expect(fitZoomForBounds({ width: 10000, height: 20000 }, { width: 300, height: 300 })).toBe(0.05);
  });

  it('normalizes manual zoom values', () => {
    expect(normalizeZoom(0.234)).toBe(0.23);
    expect(normalizeZoom(10)).toBe(2.5);
  });
});
