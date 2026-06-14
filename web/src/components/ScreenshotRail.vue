<template>
  <aside class="flex h-44 w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:h-auto lg:w-72 lg:border-b-0 lg:border-r">
    <div class="flex h-12 items-center justify-between border-b border-slate-200 px-3">
      <h2 class="text-sm font-semibold text-neutral-950">Screenshots</h2>
      <button class="tool-button h-8 w-8" type="button" title="Import image" @click="$emit('upload')">
        <Plus :size="17" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-2">
      <button
        v-for="shot in screenshots"
        :key="shot.id"
        class="mb-2 flex w-full gap-3 rounded-md border p-2 text-left transition hover:bg-slate-50"
        :class="shot.id === activeId ? 'border-blue-300 bg-blue-50' : 'border-transparent'"
        type="button"
        @click="$emit('open', shot.id)"
      >
        <img class="h-16 w-20 rounded border border-slate-200 bg-slate-100 object-cover" :src="shot.imageUrl" alt="" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-neutral-950">{{ titleFor(shot) }}</span>
          <span class="mt-1 block truncate text-xs text-slate-500">{{ shot.width }} x {{ shot.height }}</span>
          <span class="mt-1 block truncate text-xs text-slate-400">{{ relativeDate(shot.createdAt) }}</span>
        </span>
      </button>

      <div v-if="screenshots.length === 0" class="px-4 py-8 text-center">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-slate-500">
          <ImageIcon :size="22" />
        </div>
        <p class="mt-3 text-sm font-medium text-neutral-900">No screenshots</p>
        <button class="mt-4 inline-flex h-9 items-center rounded-md bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700" type="button" @click="$emit('upload')">
          Import
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ImageIcon, Plus } from '@lucide/vue';
import type { ScreenshotSummary } from '../types';

defineProps<{
  screenshots: ScreenshotSummary[];
  activeId: string | null;
}>();

defineEmits<{
  open: [string];
  upload: [];
}>();

function titleFor(shot: ScreenshotSummary): string {
  return shot.pageTitle || shot.sourceUrl || shot.id.slice(0, 8);
}

function relativeDate(value: string): string {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(delta / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(value).toLocaleDateString();
}
</script>
