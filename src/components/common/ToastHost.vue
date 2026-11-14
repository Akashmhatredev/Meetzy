<script setup>
import { CircleCheck, CircleAlert, Info, X } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const ICONS = { success: CircleCheck, error: CircleAlert, default: Info }
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
    aria-live="polite"
    aria-atomic="false"
  >
    <TransitionGroup name="toast">
      <div
        v-for="t in ui.toasts"
        :key="t.id"
        class="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-lift"
        :class="t.tone === 'error' ? 'bg-navy-900 text-white ring-1 ring-rose-400/40' : 'bg-navy-900 text-white dark:bg-surface-2 dark:text-ink'"
        :role="t.tone === 'error' ? 'alert' : 'status'"
      >
        <component
          :is="ICONS[t.tone] ?? Info"
          :size="18"
          class="mt-px shrink-0"
          :class="t.tone === 'error' ? 'text-rose-400' : 'text-mint-400'"
          aria-hidden="true"
        />
        <p class="flex-1 leading-snug">{{ t.message }}</p>
        <button
          v-if="t.action"
          type="button"
          class="font-semibold text-mint-300 hover:underline"
          @click="t.action.run(), ui.dismiss(t.id)"
        >
          {{ t.action.label }}
        </button>
        <button type="button" class="-mr-1 opacity-60 hover:opacity-100" aria-label="Dismiss" @click="ui.dismiss(t.id)">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.22s var(--ease-out-soft),
    transform 0.22s var(--ease-out-soft);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
