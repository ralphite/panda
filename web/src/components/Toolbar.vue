<template>
  <header class="relative z-20 flex min-h-14 shrink-0 flex-col border-b border-slate-200 bg-white lg:h-14 lg:flex-row lg:items-stretch">
    <div class="flex h-12 min-w-0 items-center gap-2 border-b border-slate-200 px-4 lg:h-auto lg:border-b-0 lg:border-r xl:w-72">
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-950 text-sm font-semibold text-white">P</div>
      <div class="min-w-0">
        <div class="truncate text-sm font-semibold leading-4 text-neutral-950">Panda Screenshot</div>
      </div>
    </div>

    <div class="flex flex-1 flex-wrap items-center gap-2 px-3 py-2 lg:flex-nowrap lg:gap-3 lg:px-4 lg:py-0">
      <div class="relative flex items-center">
      <nav class="flex items-center gap-1" aria-label="Tools">
      <button
        v-for="item in tools"
        :key="item.id"
        class="tool-button relative"
        :class="{ 'tool-button-active': tool === item.id }"
        :title="`${item.label} (${item.shortcut})`"
        type="button"
        @click="$emit('update:tool', item.id)"
      >
        <component :is="item.icon" :size="18" :stroke-width="2" />
        <span v-if="showShortcuts" class="kbd-bubble">{{ item.shortcut }}</span>
      </button>
      </nav>
      <div v-if="showShortcuts" class="kbd-legend">
        <kbd v-for="entry in shortcutLegend" :key="entry.label" class="kbd-cap" :title="entry.label">{{ entry.keys }}</kbd>
      </div>
      </div>

    <div class="h-7 w-px bg-slate-200" />

    <div class="flex items-center gap-2">
      <div ref="colorPickerRef" class="relative">
        <button
          class="inline-flex h-9 min-w-20 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          :aria-expanded="isColorPickerOpen"
          aria-haspopup="menu"
          aria-label="Color"
          title="Color"
          type="button"
          @click="toggleColorPicker"
        >
          <span class="h-5 w-5 rounded border border-slate-300 shadow-sm" :style="{ backgroundColor: color }" />
          <ChevronDown :size="16" :stroke-width="2" />
        </button>

        <div
          v-if="isColorPickerOpen"
          class="absolute left-0 top-full z-50 mt-2 w-64 rounded-md border border-slate-200 bg-white p-2 shadow-xl"
          role="menu"
          @keydown.esc.stop.prevent="closeColorPicker"
        >
          <div v-if="recentStyles.length" class="mb-2 border-b border-slate-100 pb-2">
            <div class="mb-1 px-1 text-[11px] font-semibold uppercase text-slate-500">Recent</div>
            <div class="grid grid-cols-3 gap-1">
              <button
                v-for="style in recentStyles"
                :key="`${style.color}-${style.strokeWidth}`"
                class="flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-neutral-800 hover:border-neutral-950 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                :title="`${style.strokeWidth} px`"
                type="button"
                @click="chooseStyle(style)"
              >
                <span class="h-4 w-4 rounded border border-slate-300 shadow-sm" :style="{ backgroundColor: style.color }" />
                {{ style.strokeWidth }} px
              </button>
            </div>
          </div>

          <div class="mb-2 grid grid-cols-5 gap-1">
            <button
              v-for="item in popularColors"
              :key="item.value"
              class="h-8 rounded-md border shadow-sm transition hover:border-neutral-950 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              :class="isSelectedColor(item.value) ? 'border-neutral-950 ring-2 ring-neutral-950 ring-offset-1' : 'border-slate-200'"
              :style="{ backgroundColor: item.value }"
              :aria-label="item.label"
              :title="item.label"
              type="button"
              @click="chooseColor(item.value)"
            />
          </div>

          <label class="relative flex h-9 cursor-pointer items-center gap-2 overflow-hidden rounded-md border border-slate-200 bg-white px-2 text-sm font-medium text-neutral-800 hover:border-neutral-950 hover:bg-slate-50">
            <span class="h-5 w-5 rounded border border-slate-300 shadow-sm" :style="customColorStyle" />
            Custom
            <input class="absolute inset-0 cursor-pointer opacity-0" type="color" :value="color" @change="chooseCustomColor" />
          </label>
        </div>
      </div>
      <div class="relative">
        <select class="h-9 w-20 cursor-pointer appearance-none rounded-md border border-slate-200 bg-white pl-2 pr-7 text-sm text-neutral-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" :value="strokeWidth" title="Stroke width" @change="$emit('update:strokeWidth', Number(($event.target as HTMLSelectElement).value))">
          <option :value="2">2 px</option>
          <option :value="3">3 px</option>
          <option :value="5">5 px</option>
          <option :value="8">8 px</option>
          <option :value="12">12 px</option>
        </select>
        <ChevronDown class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" :size="16" :stroke-width="2" />
      </div>
    </div>

    <div class="flex w-full items-center gap-2 overflow-x-auto sm:gap-3 lg:ml-auto lg:w-auto lg:overflow-visible">
      <div class="flex shrink-0 items-center gap-1 px-1 text-slate-600 sm:gap-3">
        <button class="tool-button relative" type="button" title="Zoom out (-)" @click="$emit('zoom', -0.1)">
          <ZoomOut :size="18" :stroke-width="2" />
          <span v-if="showShortcuts" class="kbd-bubble">−</span>
        </button>
        <button class="tool-button relative" type="button" title="Zoom in (+)" @click="$emit('zoom', 0.1)">
          <ZoomIn :size="18" :stroke-width="2" />
          <span v-if="showShortcuts" class="kbd-bubble">+</span>
        </button>
        <button class="tool-button" type="button" title="Fit to screen" @click="$emit('fit')">
          <Maximize2 :size="18" :stroke-width="2" />
        </button>
        <button class="tool-button" type="button" title="Actual size" @click="$emit('actualSize')">
          <Minimize2 :size="18" :stroke-width="2" />
        </button>
        <span class="w-12 text-center text-sm font-medium text-slate-600">{{ Math.round(zoom * 100) }}%</span>
      </div>
      <button class="tool-button" type="button" title="Import image" @click="$emit('upload')">
        <Upload :size="18" />
      </button>
      <button class="tool-button relative" type="button" title="Keyboard shortcuts (?)" :class="{ 'tool-button-active': showShortcuts }" @click="$emit('toggle-help')">
        <CircleHelp :size="18" />
        <span v-if="showShortcuts" class="kbd-bubble">?</span>
      </button>
      <button class="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-neutral-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" type="button" title="Copy image address (.png link)" :disabled="!canExport" @click="$emit('copy-link')">
        <Link :size="16" />
        Link
      </button>
      <button class="relative inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-neutral-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" type="button" title="Copy image (C)" :disabled="!canExport" @click="$emit('copy')">
        <Copy :size="16" />
        Copy
        <span v-if="showShortcuts" class="kbd-bubble">C</span>
      </button>
      <button class="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40" type="button" :disabled="!canExport" @click="$emit('download')">
        <Download :size="16" />
        Save
      </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ArrowRight, ChevronDown, Circle, CircleHelp, Copy, Download, Link, Maximize2, Minimize2, Minus, MousePointer2, Pencil, Square, Type, Upload, ZoomIn, ZoomOut } from '@lucide/vue';
import type { DrawingStyle, Tool } from '../types';

const props = withDefaults(defineProps<{
  tool: Tool;
  color: string;
  strokeWidth: number;
  recentStyles?: DrawingStyle[];
  zoom: number;
  canExport: boolean;
  showShortcuts: boolean;
}>(), {
  recentStyles: () => [],
});

const emit = defineEmits<{
  'update:tool': [Tool];
  'update:color': [string];
  'update:strokeWidth': [number];
  'apply-style': [DrawingStyle];
  zoom: [number];
  fit: [];
  actualSize: [];
  upload: [];
  copy: [];
  'copy-link': [];
  download: [];
  'toggle-help': [];
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

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const shortcutLegend = isMac
  ? [
      { keys: '⌘Z', label: 'Undo' },
      { keys: '⇧⌘Z', label: 'Redo' },
      { keys: '⌫', label: 'Delete' },
      { keys: 'Esc', label: 'Deselect' },
    ]
  : [
      { keys: 'Ctrl+Z', label: 'Undo' },
      { keys: 'Ctrl+Shift+Z', label: 'Redo' },
      { keys: 'Del', label: 'Delete' },
      { keys: 'Esc', label: 'Deselect' },
    ];

const popularColors = [
  { label: 'Red', value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Black', value: '#111827' },
  { label: 'White', value: '#ffffff' },
] as const;

const colorPickerRef = ref<HTMLElement | null>(null);
const isColorPickerOpen = ref(false);
const presetColors = new Set<string>(popularColors.map((item) => item.value));

const customColorStyle = computed(() => {
  const color = props.color.toLowerCase();
  if (presetColors.has(color)) {
    return {
      background: 'conic-gradient(#ef4444, #f97316, #facc15, #22c55e, #06b6d4, #3b82f6, #a855f7, #ec4899, #ef4444)',
    };
  }
  return { backgroundColor: props.color };
});

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
});

function toggleColorPicker(): void {
  isColorPickerOpen.value = !isColorPickerOpen.value;
}

function closeColorPicker(): void {
  isColorPickerOpen.value = false;
}

function chooseColor(value: string): void {
  emit('update:color', value);
  closeColorPicker();
}

function chooseStyle(style: DrawingStyle): void {
  emit('apply-style', style);
  closeColorPicker();
}

function chooseCustomColor(event: Event): void {
  chooseColor((event.target as HTMLInputElement).value);
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (target instanceof Node && colorPickerRef.value?.contains(target)) return;
  closeColorPicker();
}

function isSelectedColor(value: string): boolean {
  return props.color.toLowerCase() === value;
}
</script>
