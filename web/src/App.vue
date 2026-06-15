<template>
  <div class="flex h-full w-full flex-col bg-slate-100 text-neutral-950">
    <Toolbar
      v-model:tool="tool"
      v-model:color="color"
      v-model:stroke-width="strokeWidth"
      :zoom="zoom"
      :can-export="Boolean(activeScreenshot)"
      @zoom="changeZoom"
      @upload="triggerUpload"
      @copy="copyImage"
      @download="downloadImage"
    />

    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <ScreenshotRail
        :screenshots="screenshots"
        :active-id="activeScreenshot?.id ?? null"
        @open="openScreenshot"
        @upload="triggerUpload"
      />

      <CanvasEditor
        ref="editorRef"
        :annotations="annotations"
        :selected-id="selectedId"
        :screenshot="activeScreenshot"
        :tool="tool"
        :color="color"
        :stroke-width="strokeWidth"
        :font-size="fontSize"
        :zoom="zoom"
        @update:annotations="setAnnotations"
        @update:selected-id="selectedId = $event"
        @edit-start="beginAnnotationEdit"
        @edit-end="finishAnnotationEdit"
        @fit-zoom="setZoom"
        @status="setStatus"
        @upload="triggerUpload"
      />

      <Inspector
        :annotation="selectedAnnotation"
        :screenshot="activeScreenshot"
        :annotation-count="annotations.length"
        @patch="patchSelected"
        @delete="deleteSelected"
      />
    </div>

    <StatusBar :message="statusMessage" :dimensions="dimensions" :save-state="saveState" />

    <input ref="fileInputRef" class="hidden" type="file" accept="image/png,image/jpeg,image/gif" @change="onFilePicked" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { createScreenshot, getScreenshot, listScreenshots, updateAnnotations } from './api';
import CanvasEditor from './components/CanvasEditor.vue';
import Inspector from './components/Inspector.vue';
import ScreenshotRail from './components/ScreenshotRail.vue';
import StatusBar from './components/StatusBar.vue';
import Toolbar from './components/Toolbar.vue';
import {
  annotationsEqual,
  createAnnotationSnapshot,
  createEmptyAnnotationHistory,
  pushUndoSnapshot,
  redoAnnotationHistory,
  undoAnnotationHistory,
} from './lib/annotationHistory';
import { patchAnnotation } from './lib/editor';
import { normalizeZoom } from './lib/zoom';
import type { AnnotationHistorySnapshot, AnnotationHistoryState } from './lib/annotationHistory';
import type { Annotation, AnnotationPatch, ScreenshotDetail, ScreenshotSummary, Tool } from './types';

const screenshots = ref<ScreenshotSummary[]>([]);
const activeScreenshot = ref<ScreenshotDetail | null>(null);
const annotations = ref<Annotation[]>([]);
const selectedId = ref<string | null>(null);
const tool = ref<Tool>('select');
const color = ref('#ef4444');
const strokeWidth = ref(3);
const fontSize = ref(24);
const zoom = ref(1);
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const statusMessage = ref('Ready');
const editorRef = ref<InstanceType<typeof CanvasEditor> | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const annotationHistory = ref<AnnotationHistoryState>(createEmptyAnnotationHistory());

let saveTimer: number | undefined;
let suppressSave = false;
let pendingAnnotationSnapshot: AnnotationHistorySnapshot | null = null;
let restoringAnnotationHistory = false;

const dimensions = computed(() => {
  if (!activeScreenshot.value) return 'No image';
  return `${activeScreenshot.value.width} x ${activeScreenshot.value.height}`;
});

const selectedAnnotation = computed(() => annotations.value.find((item) => item.id === selectedId.value) ?? null);

watch(
  annotations,
  () => {
    if (suppressSave || !activeScreenshot.value) return;
    saveState.value = 'saving';
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void persistAnnotations();
    }, 350);
  },
  { deep: true },
);

onMounted(async () => {
  window.addEventListener('popstate', onPopState);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('paste', onPaste);
  await refreshScreenshots();
  const id = idFromPath();
  if (id) {
    await openScreenshot(id, false);
  }
});

onUnmounted(() => {
  window.removeEventListener('popstate', onPopState);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('paste', onPaste);
  window.clearTimeout(saveTimer);
});

async function refreshScreenshots(): Promise<void> {
  try {
    screenshots.value = await listScreenshots();
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function openScreenshot(id: string, push = true): Promise<void> {
  try {
    suppressSave = true;
    const shot = await getScreenshot(id);
    activeScreenshot.value = shot;
    annotations.value = Array.isArray(shot.annotations) ? shot.annotations : [];
    selectedId.value = null;
    resetAnnotationHistory();
    saveState.value = 'saved';
    statusMessage.value = 'Ready';
    if (push) {
      history.pushState(null, '', shot.pageUrl);
    }
  } catch (error) {
    setStatus(errorMessage(error));
  } finally {
    requestAnimationFrame(() => {
      suppressSave = false;
    });
  }
}

async function persistAnnotations(): Promise<void> {
  if (!activeScreenshot.value) return;
  try {
    const updated = await updateAnnotations(activeScreenshot.value.id, annotations.value);
    activeScreenshot.value = updated;
    saveState.value = 'saved';
  } catch (error) {
    saveState.value = 'error';
    setStatus(errorMessage(error));
  }
}

function patchSelected(patch: AnnotationPatch): void {
  const id = selectedId.value;
  if (!id) return;
  setAnnotations(annotations.value.map((annotation) => (annotation.id === id ? patchAnnotation(annotation, patch) : annotation)));
}

function deleteSelected(): void {
  const id = selectedId.value;
  if (!id) return;
  setAnnotations(annotations.value.filter((annotation) => annotation.id !== id));
  selectedId.value = null;
  statusMessage.value = 'Annotation deleted';
}

async function copyImage(): Promise<void> {
  try {
    await editorRef.value?.copyImage();
    setStatus('Copied image');
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function downloadImage(): Promise<void> {
  try {
    await editorRef.value?.downloadImage();
    setStatus('Saved image');
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

function triggerUpload(): void {
  fileInputRef.value?.click();
}

async function onFilePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  await uploadBlob(file, '', file.name);
}

async function onPaste(event: ClipboardEvent): Promise<void> {
  const items = Array.from(event.clipboardData?.items ?? []);
  const imageItem = items.find((item) => item.type.startsWith('image/'));
  if (!imageItem) return;
  const blob = imageItem.getAsFile();
  if (!blob) return;
  event.preventDefault();
  await uploadBlob(blob, '', 'Pasted image');
}

async function uploadBlob(blob: Blob, sourceUrl: string, pageTitle: string): Promise<void> {
  try {
    setStatus('Importing image');
    const imageData = await blobToDataURL(blob);
    const created = await createScreenshot({ imageData, sourceUrl, pageTitle });
    await refreshScreenshots();
    await openScreenshot(created.screenshot.id);
    setStatus('Screenshot imported');
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

function onKeyDown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

  if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key === 'Escape') {
    if (selectedId.value) {
      event.preventDefault();
      selectedId.value = null;
    }
    return;
  }

  if (pendingAnnotationSnapshot) return;

  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && !event.altKey && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) {
      redoAnnotationEdit();
    } else {
      undoAnnotationEdit();
    }
    return;
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'c') {
    event.preventDefault();
    void copyImage();
    return;
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectedId.value) {
      event.preventDefault();
      deleteSelected();
    }
    return;
  }

  const tools: Record<string, Tool> = { v: 'select', r: 'rect', o: 'oval', l: 'line', a: 'arrow', p: 'pencil', t: 'text' };
  if (tools[key]) {
    event.preventDefault();
    tool.value = tools[key];
  }
}

function setAnnotations(next: Annotation[]): void {
  if (!restoringAnnotationHistory && !pendingAnnotationSnapshot && !annotationsEqual(annotations.value, next)) {
    recordUndoSnapshot(currentAnnotationSnapshot());
  }
  annotations.value = next;
}

function beginAnnotationEdit(): void {
  if (restoringAnnotationHistory || pendingAnnotationSnapshot || !activeScreenshot.value) return;
  pendingAnnotationSnapshot = currentAnnotationSnapshot();
}

function finishAnnotationEdit(): void {
  const snapshot = pendingAnnotationSnapshot;
  pendingAnnotationSnapshot = null;
  if (!snapshot || annotationsEqual(snapshot.annotations, annotations.value)) return;
  recordUndoSnapshot(snapshot);
}

function undoAnnotationEdit(): void {
  finishAnnotationEdit();
  const result = undoAnnotationHistory(annotationHistory.value, currentAnnotationSnapshot());
  if (!result.snapshot) return;
  annotationHistory.value = result.history;
  restoreAnnotationSnapshot(result.snapshot);
  statusMessage.value = 'Undone';
}

function redoAnnotationEdit(): void {
  finishAnnotationEdit();
  const result = redoAnnotationHistory(annotationHistory.value, currentAnnotationSnapshot());
  if (!result.snapshot) return;
  annotationHistory.value = result.history;
  restoreAnnotationSnapshot(result.snapshot);
  statusMessage.value = 'Redone';
}

function recordUndoSnapshot(snapshot: AnnotationHistorySnapshot): void {
  annotationHistory.value = pushUndoSnapshot(annotationHistory.value, snapshot);
}

function restoreAnnotationSnapshot(snapshot: AnnotationHistorySnapshot): void {
  restoringAnnotationHistory = true;
  annotations.value = snapshot.annotations;
  selectedId.value = snapshot.selectedId && snapshot.annotations.some((annotation) => annotation.id === snapshot.selectedId) ? snapshot.selectedId : null;
  restoringAnnotationHistory = false;
}

function currentAnnotationSnapshot(): AnnotationHistorySnapshot {
  return createAnnotationSnapshot(annotations.value, selectedId.value);
}

function resetAnnotationHistory(): void {
  pendingAnnotationSnapshot = null;
  annotationHistory.value = createEmptyAnnotationHistory();
}

function changeZoom(delta: number): void {
  zoom.value = normalizeZoom(zoom.value + delta);
}

function setZoom(value: number): void {
  zoom.value = normalizeZoom(value);
}

function onPopState(): void {
  const id = idFromPath();
  if (id) {
    void openScreenshot(id, false);
  } else {
    activeScreenshot.value = null;
    annotations.value = [];
    selectedId.value = null;
    resetAnnotationHistory();
  }
}

function idFromPath(): string | null {
  const match = window.location.pathname.match(/^\/screenshot\/([^/]+)/);
  return match?.[1] ?? null;
}

function setStatus(message: string): void {
  statusMessage.value = message;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
</script>
