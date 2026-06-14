<template>
  <aside class="flex h-56 w-full shrink-0 flex-col border-t border-slate-200 bg-white lg:h-auto lg:w-80 lg:border-l lg:border-t-0">
    <div class="flex h-12 items-center justify-between border-b border-slate-200 px-4">
      <h2 class="text-sm font-semibold text-neutral-950">Inspector</h2>
      <button v-if="annotation" class="tool-button h-8 w-8 text-red-600 hover:text-red-700" type="button" title="Delete" @click="$emit('delete')">
        <Trash2 :size="16" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <section v-if="annotation" class="space-y-5">
        <div>
          <div class="text-xs font-semibold uppercase text-slate-400">{{ annotation.type }}</div>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <label class="text-xs text-slate-500">
              Color
              <input class="panel-field mt-1 w-full p-1" type="color" :value="annotation.color" @input="patch({ color: ($event.target as HTMLInputElement).value })" />
            </label>
            <label class="text-xs text-slate-500">
              Stroke
              <input class="panel-field mt-1 w-full" type="number" min="1" max="24" :value="annotation.strokeWidth" @input="patch({ strokeWidth: numberValue($event) })" />
            </label>
          </div>
        </div>

        <div v-if="annotation.type === 'line'" class="grid grid-cols-2 gap-2">
          <NumberField label="X1" :value="annotation.x1" @change="patch({ x1: $event })" />
          <NumberField label="Y1" :value="annotation.y1" @change="patch({ y1: $event })" />
          <NumberField label="X2" :value="annotation.x2" @change="patch({ x2: $event })" />
          <NumberField label="Y2" :value="annotation.y2" @change="patch({ y2: $event })" />
        </div>

        <div v-else-if="annotation.type === 'text'" class="space-y-3">
          <label class="block text-xs text-slate-500">
            Text
            <textarea class="panel-field mt-1 h-20 w-full resize-none py-2" :value="annotation.text" @input="patch({ text: ($event.target as HTMLTextAreaElement).value })" />
          </label>
          <div class="grid grid-cols-2 gap-2">
            <NumberField label="X" :value="annotation.x" @change="patch({ x: $event })" />
            <NumberField label="Y" :value="annotation.y" @change="patch({ y: $event })" />
            <NumberField label="Size" :value="annotation.fontSize" @change="patch({ fontSize: $event })" />
          </div>
        </div>

        <div v-else class="grid grid-cols-2 gap-2">
          <NumberField label="X" :value="annotation.x" @change="patch({ x: $event })" />
          <NumberField label="Y" :value="annotation.y" @change="patch({ y: $event })" />
          <NumberField label="W" :value="annotation.w" @change="patch({ w: $event })" />
          <NumberField label="H" :value="annotation.h" @change="patch({ h: $event })" />
        </div>
      </section>

      <section v-else class="space-y-4">
        <div>
          <div class="text-xs font-semibold uppercase text-slate-400">Export</div>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <button class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white text-sm font-medium text-neutral-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" type="button" :disabled="!canExport" @click="$emit('copy')">
              <Copy :size="15" />
              Copy
            </button>
            <button class="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40" type="button" :disabled="!canExport" @click="$emit('download')">
              <Download :size="15" />
              Save
            </button>
          </div>
        </div>

        <div v-if="screenshot" class="space-y-2 border-t border-slate-200 pt-4 text-sm">
          <div class="flex justify-between gap-3">
            <span class="text-slate-500">Size</span>
            <span class="font-medium text-neutral-900">{{ screenshot.width }} x {{ screenshot.height }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-slate-500">Annotations</span>
            <span class="font-medium text-neutral-900">{{ annotationCount }}</span>
          </div>
          <a v-if="screenshot.sourceUrl" class="block truncate text-blue-600 hover:text-blue-700" :href="screenshot.sourceUrl" target="_blank" rel="noreferrer">{{ screenshot.sourceUrl }}</a>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Copy, Download, Trash2 } from '@lucide/vue';
import NumberField from './NumberField.vue';
import type { Annotation, AnnotationPatch, ScreenshotDetail } from '../types';

defineProps<{
  annotation: Annotation | null;
  screenshot: ScreenshotDetail | null;
  annotationCount: number;
  canExport: boolean;
}>();

const emit = defineEmits<{
  patch: [AnnotationPatch];
  delete: [];
  copy: [];
  download: [];
}>();

function patch(value: AnnotationPatch): void {
  emit('patch', value);
}

function numberValue(event: Event): number {
  return Number((event.target as HTMLInputElement).value);
}
</script>
