<template>
  <main class="relative flex min-w-0 flex-1 flex-col bg-slate-100">
    <div ref="viewportRef" class="min-h-0 flex-1 overflow-auto p-3 lg:p-8">
      <div v-if="!screenshot" class="flex h-full min-h-[420px] items-center justify-center">
        <div class="max-w-sm text-center">
          <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm">
            <ImagePlus :size="26" />
          </div>
          <h1 class="mt-4 text-lg font-semibold text-neutral-950">Open a screenshot</h1>
          <p class="mt-2 text-sm leading-6 text-slate-500">Import an image or use the Chrome extension to capture a page.</p>
          <button class="mt-5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700" type="button" @click="$emit('upload')">
            Import image
          </button>
        </div>
      </div>

      <div
        v-else
        class="relative mx-auto bg-white shadow-panel"
        :style="stageStyle"
      >
        <canvas
          ref="canvasRef"
          class="absolute inset-0 cursor-crosshair select-none"
          :class="{ 'cursor-default': tool === 'select' }"
          :width="canvasSize.width"
          :height="canvasSize.height"
          :style="canvasStyle"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        />
        <textarea
          v-if="textDraft"
          ref="textInputRef"
          v-model="textDraft.value"
          class="absolute resize-none overflow-hidden rounded-md border border-blue-300 bg-white px-2 py-1 font-semibold text-neutral-950 shadow-lg outline-none ring-2 ring-blue-100"
          placeholder="Text"
          spellcheck="false"
          wrap="off"
          :style="textDraftStyle"
          @keydown.esc.prevent="commitText"
          @blur="commitText"
        />
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import { ImagePlus } from '@lucide/vue';
import {
  createAnnotation,
  createTextAnnotation,
  drawScene,
  hitTest,
  isRenderableSize,
  moveAnnotation,
  normalizeBounds,
} from '../lib/editor';
import { fitZoomForBounds } from '../lib/zoom';
import type { Annotation, Point, ScreenshotDetail, Tool } from '../types';

const props = defineProps<{
  screenshot: ScreenshotDetail | null;
  annotations: Annotation[];
  selectedId: string | null;
  tool: Tool;
  color: string;
  strokeWidth: number;
  fontSize: number;
  zoom: number;
}>();

const emit = defineEmits<{
  'update:annotations': [Annotation[]];
  'update:selectedId': [string | null];
  'edit-start': [];
  'edit-end': [];
  'fit-zoom': [number];
  status: [string];
  upload: [];
}>();

const viewportRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const textInputRef = ref<HTMLTextAreaElement | null>(null);
const imageRef = shallowRef<HTMLImageElement | null>(null);
const canvasSize = ref({ width: 1, height: 1 });
const textDraft = ref<{ point: Point; value: string } | null>(null);

type PointerState =
  | { mode: 'draw'; id: string; start: Point }
  | { mode: 'move'; id: string; start: Point; original: Annotation }
  | null;

const pointerState = ref<PointerState>(null);

const stageStyle = computed(() => ({
  width: `${canvasSize.value.width * props.zoom}px`,
  height: `${canvasSize.value.height * props.zoom}px`,
}));

const canvasStyle = computed(() => ({
  width: `${canvasSize.value.width * props.zoom}px`,
  height: `${canvasSize.value.height * props.zoom}px`,
}));

const textDraftStyle = computed(() => {
  if (!textDraft.value) return {};
  const lines = textDraft.value.value.split('\n');
  const longestLine = Math.max(4, ...lines.map((line) => line.length));
  const left = textDraft.value.point.x * props.zoom;
  const fontSize = props.fontSize * props.zoom;
  const lineHeight = props.fontSize * 1.22 * props.zoom;
  const desiredWidth = longestLine * props.fontSize * 0.62 * props.zoom + 24;
  const maxWidth = Math.max(120, canvasSize.value.width * props.zoom - left - 8);
  return {
    left: `${left}px`,
    top: `${textDraft.value.point.y * props.zoom}px`,
    width: `${clamp(desiredWidth, 120, maxWidth)}px`,
    height: `${Math.max(lineHeight + 10, lines.length * lineHeight + 10)}px`,
    fontSize: `${fontSize}px`,
    lineHeight: `${lineHeight}px`,
  };
});

watch(
  () => props.screenshot?.id,
  () => {
    loadImage();
  },
  { immediate: true },
);

watch(
  () => [props.annotations, props.selectedId],
  () => {
    render();
  },
  { deep: true },
);

async function loadImage(): Promise<void> {
  textDraft.value = null;
  pointerState.value = null;
  imageRef.value = null;
  if (!props.screenshot) {
    return;
  }

  const img = new Image();
  img.decoding = 'async';
  img.src = props.screenshot.imageUrl;
  await img.decode();
  imageRef.value = img;
  canvasSize.value = { width: img.naturalWidth, height: img.naturalHeight };
  await nextTick();
  emit('fit-zoom', fitZoomForBounds(canvasSize.value, availableViewportSize()));
  render();
  emit('status', 'Screenshot loaded');
}

function availableViewportSize(): { width: number; height: number } {
  const viewport = viewportRef.value;
  if (!viewport) {
    return { width: canvasSize.value.width, height: canvasSize.value.height };
  }

  const style = getComputedStyle(viewport);
  const horizontalPadding = pixels(style.paddingLeft) + pixels(style.paddingRight);
  const verticalPadding = pixels(style.paddingTop) + pixels(style.paddingBottom);
  return {
    width: Math.max(1, viewport.clientWidth - horizontalPadding),
    height: Math.max(1, viewport.clientHeight - verticalPadding),
  };
}

function render(): void {
  const canvas = canvasRef.value;
  const img = imageRef.value;
  if (!canvas || !img) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  drawScene(ctx, img, props.annotations, props.selectedId);
}

function onPointerDown(event: PointerEvent): void {
  if (!props.screenshot || !imageRef.value || textDraft.value) return;
  const point = toCanvasPoint(event);

  if (props.tool === 'text') {
    textDraft.value = { point, value: 'Text' };
    emit('update:selectedId', null);
    nextTick(() => {
      textInputRef.value?.focus();
      textInputRef.value?.select();
    });
    return;
  }

  const canvas = canvasRef.value;
  canvas?.setPointerCapture(event.pointerId);

  if (props.tool === 'select') {
    const id = hitTest(props.annotations, point);
    emit('update:selectedId', id);
    if (!id) {
      pointerState.value = null;
      return;
    }
    const original = props.annotations.find((item) => item.id === id);
    if (original) {
      emit('edit-start');
      pointerState.value = { mode: 'move', id, start: point, original };
    }
    return;
  }

  const draft = createAnnotation(props.tool, point, point, props.color, props.strokeWidth);
  emit('edit-start');
  pointerState.value = { mode: 'draw', id: draft.id, start: point };
  emit('update:selectedId', draft.id);
  emit('update:annotations', [...props.annotations, draft]);
}

function onPointerMove(event: PointerEvent): void {
  const state = pointerState.value;
  if (!state) return;
  const point = toCanvasPoint(event);

  if (state.mode === 'draw') {
    const next = props.annotations.map((annotation) => {
      if (annotation.id !== state.id) return annotation;
      if (annotation.type === 'line' || annotation.type === 'arrow') {
        return { ...annotation, x2: point.x, y2: point.y };
      }
      if (annotation.type === 'pencil') {
        const last = annotation.points[annotation.points.length - 1];
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < 2) return annotation;
        return { ...annotation, points: [...annotation.points, point] };
      }
      if (annotation.type === 'rect' || annotation.type === 'oval') {
        return { ...annotation, ...normalizeBounds(state.start, point) };
      }
      return annotation;
    });
    emit('update:annotations', next);
    return;
  }

  const dx = point.x - state.start.x;
  const dy = point.y - state.start.y;
  const next = props.annotations.map((annotation) => (annotation.id === state.id ? moveAnnotation(state.original, dx, dy) : annotation));
  emit('update:annotations', next);
}

function onPointerUp(event: PointerEvent): void {
  const state = pointerState.value;
  if (!state) return;
  canvasRef.value?.releasePointerCapture(event.pointerId);
  pointerState.value = null;
  if (state.mode === 'draw') {
    const created = props.annotations.find((annotation) => annotation.id === state.id);
    if (created && !isRenderableSize(created)) {
      emit('update:annotations', props.annotations.filter((annotation) => annotation.id !== state.id));
      emit('update:selectedId', null);
      emit('edit-end');
      return;
    }
    emit('status', 'Annotation added');
  }
  emit('edit-end');
}

function toCanvasPoint(event: PointerEvent): Point {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / props.zoom;
  const y = (event.clientY - rect.top) / props.zoom;
  return {
    x: clamp(x, 0, canvasSize.value.width),
    y: clamp(y, 0, canvasSize.value.height),
  };
}

function commitText(): void {
  const draft = textDraft.value;
  if (!draft) return;
  const text = draft.value.trim();
  textDraft.value = null;
  if (!text) return;
  const annotation = createTextAnnotation(draft.point, text, props.color, props.strokeWidth, props.fontSize);
  emit('edit-start');
  emit('update:annotations', [...props.annotations, annotation]);
  emit('update:selectedId', annotation.id);
  emit('edit-end');
  emit('status', 'Text added');
}

async function exportBlob(): Promise<Blob> {
  render();
  const canvas = canvasRef.value;
  if (!canvas) {
    throw new Error('No canvas to export');
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('Could not render PNG');
  }
  return blob;
}

async function copyImage(): Promise<void> {
  const blob = await exportBlob();
  const ClipboardItemCtor = globalThis.ClipboardItem;
  if (!ClipboardItemCtor || !navigator.clipboard?.write) {
    throw new Error('Image clipboard is not available in this browser');
  }
  await navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': blob })]);
}

async function downloadImage(): Promise<void> {
  const blob = await exportBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${props.screenshot?.pageTitle || 'panda-screenshot'}.png`.replace(/[^\w.-]+/g, '-');
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

defineExpose({
  copyImage,
  downloadImage,
});
</script>
