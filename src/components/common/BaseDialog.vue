<script setup>
/**
 * Native <dialog> with modal semantics (focus trap, Esc, inert page).
 * On phones it docks to the bottom as a sheet.
 */
import { ref, watch, onBeforeUnmount, useId } from 'vue'
import { X } from 'lucide-vue-next'

const open = defineModel('open', { type: Boolean, default: false })
const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  size: { type: String, default: 'md' }, // sm | md | lg
  dismissible: { type: Boolean, default: true },
})
const emit = defineEmits(['close'])

const dialog = ref(null)
const titleId = useId()

watch(
  open,
  (value) => {
    const el = dialog.value
    if (!el) return
    if (value && !el.open) el.showModal()
    if (!value && el.open) el.close()
  },
  { flush: 'post' },
)

function onClose() {
  open.value = false
  emit('close')
}

function onCancel(event) {
  if (!props.dismissible) event.preventDefault()
}

function onBackdrop(event) {
  if (props.dismissible && event.target === dialog.value) dialog.value.close()
}

onBeforeUnmount(() => dialog.value?.open && dialog.value.close())
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    class="mz-dialog m-0 mt-auto w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-navy-950/45 backdrop:backdrop-blur-[2px] sm:m-auto"
    :class="{ 'sm:max-w-md': size === 'sm', 'sm:max-w-lg': size === 'md', 'sm:max-w-2xl': size === 'lg' }"
    @close="onClose"
    @cancel="onCancel"
    @click="onBackdrop"
  >
    <div
      v-if="open"
      class="safe-bottom max-h-[88dvh] overflow-y-auto rounded-t-3xl border border-line bg-surface shadow-lift sm:rounded-3xl"
    >
      <div class="sticky top-0 z-10 flex items-start gap-3 bg-surface px-5 pt-5 pb-3 sm:px-6">
        <div class="min-w-0 flex-1">
          <h2 :id="titleId" class="text-lg font-bold">{{ title }}</h2>
          <p v-if="description" class="mt-1 text-sm text-ink-soft">{{ description }}</p>
        </div>
        <button
          v-if="dismissible"
          type="button"
          class="-mt-1 -mr-2 flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
          aria-label="Close"
          @click="dialog.close()"
        >
          <X :size="20" aria-hidden="true" />
        </button>
      </div>
      <div class="px-5 pb-5 sm:px-6 sm:pb-6">
        <slot />
      </div>
      <div v-if="$slots.footer" class="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <slot name="footer" />
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.mz-dialog[open] > div {
  animation: sheet-in 0.28s var(--ease-out-soft) both;
}
@media (min-width: 640px) {
  .mz-dialog[open] > div {
    animation-name: dialog-in;
  }
}
@keyframes sheet-in {
  from {
    transform: translateY(24px);
    opacity: 0;
  }
}
@keyframes dialog-in {
  from {
    transform: translateY(6px) scale(0.98);
    opacity: 0;
  }
}
</style>
