export type Tool = 'select' | 'rect' | 'oval' | 'line' | 'arrow' | 'pencil' | 'text';

export interface DrawingStyle {
  color: string;
  strokeWidth: number;
}

export interface ScreenshotSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceUrl: string;
  pageTitle: string;
  filename: string;
  contentType: string;
  width: number;
  height: number;
  sizeBytes: number;
  annotations: Annotation[];
  imageUrl: string;
  pageUrl: string;
}

export type ScreenshotDetail = ScreenshotSummary;

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AnnotationBase {
  id: string;
  type: Tool;
  color: string;
  strokeWidth: number;
}

export interface RectAnnotation extends AnnotationBase, Bounds {
  type: 'rect';
}

export interface OvalAnnotation extends AnnotationBase, Bounds {
  type: 'oval';
}

export interface LineAnnotation extends AnnotationBase {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ArrowAnnotation extends AnnotationBase {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PencilAnnotation extends AnnotationBase {
  type: 'pencil';
  points: Point[];
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type ShapeAnnotation = RectAnnotation | OvalAnnotation | LineAnnotation | ArrowAnnotation | PencilAnnotation | TextAnnotation;
export type Annotation = ShapeAnnotation;

export type AnnotationPatch = Partial<{
  color: string;
  strokeWidth: number;
  x: number;
  y: number;
  w: number;
  h: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points: Point[];
  text: string;
  fontSize: number;
}>;
