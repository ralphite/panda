<template>
  <label class="text-xs text-slate-500">
    {{ label }}
    <input class="panel-field mt-1 w-full" type="number" :value="Math.round(value)" @input="$emit('change', Number(($event.target as HTMLInputElement).value))" />
  </label>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  value: number;
}>();

defineEmits<{
  change: [number];
}>();
</script>

