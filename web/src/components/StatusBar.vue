<template>
  <footer class="flex h-8 shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 text-xs text-slate-500">
    <div class="truncate">{{ message }}</div>
    <div class="flex items-center gap-3">
      <span>{{ dimensions }}</span>
      <span :class="stateClass">{{ saveLabel }}</span>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  message: string;
  dimensions: string;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
}>();

const saveLabel = computed(() => {
  if (props.saveState === 'saving') return 'Saving';
  if (props.saveState === 'saved') return 'Saved';
  if (props.saveState === 'error') return 'Save failed';
  return 'Idle';
});

const stateClass = computed(() => ({
  'text-emerald-600': props.saveState === 'saved',
  'text-amber-600': props.saveState === 'saving',
  'text-red-600': props.saveState === 'error',
}));
</script>

