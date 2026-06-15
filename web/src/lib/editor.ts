import type {
  Annotation,
  AnnotationPatch,
  Bounds,
  Point,
  TextAnnotation,
  Tool,
} from '../types';

export function annotationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `a_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function normalizeBounds(start: Point, end: Point): Bounds {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  };
}

export function createAnnotation(tool: Exclude<Tool, 'select' | 'text'>, start: Point, end: Point, color: string, strokeWidth: number): Annotation {
  if (tool === 'line' || tool === 'arrow') {
    return {
      id: annotationId(),
      type: tool,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      color,
      strokeWidth,
    };
  }

  if (tool === 'pencil') {
    return {
      id: annotationId(),
      type: 'pencil',
      points: [start, end],
      color,
      strokeWidth,
    };
  }

  const bounds = normalizeBounds(start, end);
  return {
    id: annotationId(),
    type: tool,
    ...bounds,
    color,
    strokeWidth,
  };
}

export function createTextAnnotation(point: Point, text: string, color: string, strokeWidth: number, fontSize: number): TextAnnotation {
  return {
    id: annotationId(),
    type: 'text',
    x: point.x,
    y: point.y,
    text,
    color,
    strokeWidth,
    fontSize,
  };
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  annotations: Annotation[],
  selectedId: string | null,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(image, 0, 0);
  for (const annotation of annotations) {
    drawAnnotation(ctx, annotation);
  }
  if (selectedId) {
    const selected = annotations.find((item) => item.id === selectedId);
    if (selected) {
      drawSelection(ctx, selected);
    }
  }
}

export function drawAnnotation(ctx: CanvasRenderingContext2D, annotation: Annotation): void {
  ctx.save();
  ctx.strokeStyle = annotation.color;
  ctx.fillStyle = annotation.color;
  ctx.lineWidth = annotation.strokeWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (annotation.type === 'rect') {
    ctx.strokeRect(annotation.x, annotation.y, annotation.w, annotation.h);
  } else if (annotation.type === 'oval') {
    ctx.beginPath();
    ctx.ellipse(annotation.x + annotation.w / 2, annotation.y + annotation.h / 2, Math.abs(annotation.w / 2), Math.abs(annotation.h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (isEndpointAnnotation(annotation)) {
    ctx.beginPath();
    ctx.moveTo(annotation.x1, annotation.y1);
    ctx.lineTo(annotation.x2, annotation.y2);
    ctx.stroke();
    if (annotation.type === 'arrow') {
      drawArrowHead(ctx, annotation);
    }
  } else if (annotation.type === 'pencil') {
    drawPencilPath(ctx, annotation.points);
  } else {
    ctx.font = `600 ${annotation.fontSize}px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.lineWidth = Math.max(3, annotation.strokeWidth + 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    const lines = textLines(annotation.text);
    const lineHeight = textLineHeight(annotation.fontSize);
    for (const [index, line] of lines.entries()) {
      ctx.strokeText(line, annotation.x, annotation.y + index * lineHeight);
    }
    ctx.fillStyle = annotation.color;
    for (const [index, line] of lines.entries()) {
      ctx.fillText(line, annotation.x, annotation.y + index * lineHeight);
    }
  }
  ctx.restore();
}

export function drawSelection(ctx: CanvasRenderingContext2D, annotation: Annotation): void {
  const bounds = annotationBounds(annotation);
  ctx.save();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
  ctx.setLineDash([]);
  ctx.fillStyle = '#2563eb';
  const handles = [
    [bounds.x - 4, bounds.y - 4],
    [bounds.x + bounds.w + 4, bounds.y - 4],
    [bounds.x - 4, bounds.y + bounds.h + 4],
    [bounds.x + bounds.w + 4, bounds.y + bounds.h + 4],
  ];
  for (const [x, y] of handles) {
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }
  ctx.restore();
}

export function annotationBounds(annotation: Annotation): Bounds {
  if (isEndpointAnnotation(annotation)) {
    return normalizeBounds({ x: annotation.x1, y: annotation.y1 }, { x: annotation.x2, y: annotation.y2 });
  }
  if (annotation.type === 'pencil') {
    return pathBounds(annotation.points);
  }
  if (annotation.type === 'text') {
    const lines = textLines(annotation.text);
    const longestLine = Math.max(...lines.map((line) => line.length));
    return {
      x: annotation.x,
      y: annotation.y,
      w: Math.max(24, longestLine * annotation.fontSize * 0.62),
      h: Math.max(annotation.fontSize * 1.2, lines.length * textLineHeight(annotation.fontSize)),
    };
  }
  return { x: annotation.x, y: annotation.y, w: annotation.w, h: annotation.h };
}

export function hitTest(annotations: Annotation[], point: Point): string | null {
  for (const annotation of [...annotations].reverse()) {
    if (containsPoint(annotation, point)) {
      return annotation.id;
    }
  }
  return null;
}

export function containsPoint(annotation: Annotation, point: Point): boolean {
  const tolerance = Math.max(8, annotation.strokeWidth + 4);
  if (isEndpointAnnotation(annotation)) {
    return distanceToSegment(point, { x: annotation.x1, y: annotation.y1 }, { x: annotation.x2, y: annotation.y2 }) <= tolerance;
  }
  if (annotation.type === 'pencil') {
    return pathContainsPoint(annotation.points, point, tolerance);
  }

  const bounds = annotationBounds(annotation);
  if (annotation.type === 'oval') {
    const rx = Math.max(bounds.w / 2, 1);
    const ry = Math.max(bounds.h / 2, 1);
    const nx = (point.x - (bounds.x + rx)) / rx;
    const ny = (point.y - (bounds.y + ry)) / ry;
    return nx * nx + ny * ny <= 1.08;
  }

  return point.x >= bounds.x - tolerance &&
    point.y >= bounds.y - tolerance &&
    point.x <= bounds.x + bounds.w + tolerance &&
    point.y <= bounds.y + bounds.h + tolerance;
}

export function moveAnnotation(annotation: Annotation, dx: number, dy: number): Annotation {
  if (isEndpointAnnotation(annotation)) {
    return { ...annotation, x1: annotation.x1 + dx, y1: annotation.y1 + dy, x2: annotation.x2 + dx, y2: annotation.y2 + dy };
  }
  if (annotation.type === 'pencil') {
    return { ...annotation, points: annotation.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  }
  if (annotation.type === 'text') {
    return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
  }
  return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
}

export function patchAnnotation(annotation: Annotation, patch: AnnotationPatch): Annotation {
  return Object.assign({}, annotation, patch) as Annotation;
}

export function isRenderableSize(annotation: Annotation): boolean {
  if (isEndpointAnnotation(annotation)) {
    return Math.hypot(annotation.x2 - annotation.x1, annotation.y2 - annotation.y1) > 4;
  }
  if (annotation.type === 'pencil') {
    return pathLength(annotation.points) > 4;
  }
  if (annotation.type === 'text') {
    return annotation.text.trim().length > 0;
  }
  return annotation.w > 4 && annotation.h > 4;
}

function isEndpointAnnotation(annotation: Annotation): annotation is Extract<Annotation, { type: 'line' | 'arrow' }> {
  return annotation.type === 'line' || annotation.type === 'arrow';
}

function drawArrowHead(ctx: CanvasRenderingContext2D, annotation: Extract<Annotation, { type: 'arrow' }>): void {
  const angle = Math.atan2(annotation.y2 - annotation.y1, annotation.x2 - annotation.x1);
  const size = Math.max(10, annotation.strokeWidth * 4);
  ctx.beginPath();
  ctx.moveTo(annotation.x2, annotation.y2);
  ctx.lineTo(annotation.x2 - Math.cos(angle - Math.PI / 6) * size, annotation.y2 - Math.sin(angle - Math.PI / 6) * size);
  ctx.moveTo(annotation.x2, annotation.y2);
  ctx.lineTo(annotation.x2 - Math.cos(angle + Math.PI / 6) * size, annotation.y2 - Math.sin(angle + Math.PI / 6) * size);
  ctx.stroke();
}

function drawPencilPath(ctx: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
}

function pathBounds(points: Point[]): Bounds {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function pathContainsPoint(points: Point[], point: Point, tolerance: number): boolean {
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(point, points[index - 1], points[index]) <= tolerance) {
      return true;
    }
  }
  return false;
}

function pathLength(points: Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return length;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function textLines(text: string): string[] {
  return text.split('\n');
}

function textLineHeight(fontSize: number): number {
  return fontSize * 1.22;
}
