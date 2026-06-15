<template>
  <header class="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 lg:h-14 lg:flex-nowrap lg:gap-3 lg:px-4 lg:py-0">
    <div class="flex min-w-0 items-center gap-2 pr-2">
      <div class="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-950 text-sm font-semibold text-white">P</div>
      <div class="min-w-0">
        <div class="text-sm font-semibold leading-4 text-neutral-950">Panda Screenshot</div>
      </div>
    </div>

    <div class="h-7 w-px bg-slate-200" />

    <nav class="flex items-center gap-1" aria-label="Tools">
      <button
        v-for="item in tools"
        :key="item.id"
        class="tool-button"
        :class="{ 'tool-button-active': tool === item.id }"
        :title="`${item.label} (${item.shortcut})`"
        type="button"
        @click="$emit('update:tool', item.id)"
      >
        <component :is="item.icon" :size="18" :stroke-width="2" />
      </button>
    </nav>

    <div class="h-7 w-px bg-slate-200" />

    <div class="flex items-center gap-2">
      <label class="relative h-8 w-8 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm" title="Color">
        <input
          class="absolute inset-0 h-10 w-10 -translate-x-1 -translate-y-1 cursor-pointer border-0 p-0"
          type="color"
          :value="color"
          @input="$emit('update:color', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <select class="panel-field w-20" :value="strokeWidth" title="Stroke width" @change="$emit('update:strokeWidth', Number(($event.target as HTMLSelectElement).value))">
        <option :value="2">2 px</option>
        <option :value="3">3 px</option>
        <option :value="5">5 px</option>
        <option :value="8">8 px</option>
        <option :value="12">12 px</option>
      </select>
    </div>

    <div class="flex w-full items-center gap-2 overflow-x-auto lg:ml-auto lg:w-auto lg:overflow-visible">
      <button class="tool-button" type="button" title="Zoom out" @click="$emit('zoom', -0.1)">
        <ZoomOut :size="18" />
      </button>
      <span class="w-12 text-center text-xs font-medium text-slate-600">{{ Math.round(zoom * 100) }}%</span>
      <button class="tool-button" type="button" title="Zoom in" @click="$emit('zoom', 0.1)">
        <ZoomIn :size="18" />
      </button>
      <button class="tool-button" type="button" title="Import image" @click="$emit('upload')">
        <Upload :size="18" />
      </button>
      <button class="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-neutral-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" type="button" title="Copy image (C)" :disabled="!canExport" @click="$emit('copy')">
        <Copy :size="16" />
        Copy
      </button>
      <button class="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40" type="button" :disabled="!canExport" @click="$emit('download')">
        <Download :size="16" />
        Save
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ArrowRight, Circle, Copy, Download, Minus, MousePointer2, Pencil, Square, Type, Upload, ZoomIn, ZoomOut } from '@lucide/vue';
import type { Tool } from '../types';

defineProps<{
  tool: Tool;
  color: string;
  strokeWidth: number;
  zoom: number;
  canExport: boolean;
}>();

defineEmits<{
  'update:tool': [Tool];
  'update:color': [string];
  'update:strokeWidth': [number];
  zoom: [number];
  upload: [];
  copy: [];
  download: [];
}>();

const tools = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2 },
  { id: 'rect', label: 'Rectangle', shortcut: 'R', icon: Square },
  { id: 'oval', label: 'Oval', shortcut: 'O', icon: Circle },
  { id: 'line', label: 'Line', shortcut: 'L', icon: Minus },
  { id: 'arrow', label: 'Arrow', shortcut: 'A', icon: ArrowRight },
  { id: 'pencil', label: 'Pencil', shortcut: 'P', icon: Pencil },
  { id: 'text', label: 'Text', shortcut: 'T', icon: Type },
] satisfies Array<{ id: Tool; label: string; shortcut: string; icon: unknown }>;
</script>
