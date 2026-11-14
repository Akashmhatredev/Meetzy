<script setup>
/**
 * Accessible menu button: Esc and outside-click close it, arrow keys move
 * between items. Items: [{ label, icon?, danger?, to?, onSelect? }].
 */
import { nextTick, onBeforeUnmount, ref, useId } from 'vue'
import { useRouter } from 'vue-router'
import { EllipsisVertical } from 'lucide-vue-next'

const props = defineProps({
  items: { type: Array, required: true },
  label: { type: String, default: 'More actions' },
  align: { type: String, default: 'right' },
  placement: { type: String, default: 'bottom' }, // bottom | top
})

const open = ref(false)
const root = ref(null)
const menu = ref(null)
const id = useId()
const router = useRouter()

function focusItem(index) {
  const items = menu.value?.querySelectorAll('[role="menuitem"]')
  if (!items?.length) return
  items[(index + items.length) % items.length].focus()
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    focusItem(0)
    document.addEventListener('pointerdown', onOutside)
  } else {
    document.removeEventListener('pointerdown', onOutside)
  }
}

function close(returnFocus = true) {
  open.value = false
  document.removeEventListener('pointerdown', onOutside)
  if (returnFocus) root.value?.querySelector('button')?.focus()
}

function onOutside(event) {
  if (!root.value?.contains(event.target)) close(false)
}

function onKey(event) {
  const items = [...(menu.value?.querySelectorAll('[role="menuitem"]') ?? [])]
  const index = items.indexOf(document.activeElement)
  if (event.key === 'Escape') close()
  else if (event.key === 'ArrowDown') (event.preventDefault(), focusItem(index + 1))
  else if (event.key === 'ArrowUp') (event.preventDefault(), focusItem(index - 1))
  else if (event.key === 'Tab') close(false)
}

function select(item) {
  close()
  if (item.to) router.push(item.to)
  item.onSelect?.()
}

onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div ref="root" class="relative" @keydown="onKey">
    <slot name="trigger" :toggle="toggle" :open="open" :id="id">
      <button
        type="button"
        class="flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft hover:bg-surface-2 hover:text-ink"
        :aria-label="label"
        aria-haspopup="menu"
        :aria-expanded="open"
        :aria-controls="id"
        @click="toggle"
      >
        <EllipsisVertical :size="20" aria-hidden="true" />
      </button>
    </slot>
    <Transition name="menu">
      <div
        v-if="open"
        :id="id"
        ref="menu"
        role="menu"
        class="absolute z-40 min-w-52 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lift"
        :class="[
          placement === 'top' ? 'bottom-full mb-2' : 'mt-2',
          align === 'right' ? 'right-0' : 'left-0',
          placement === 'top' ? (align === 'right' ? 'origin-bottom-right' : 'origin-bottom-left') : align === 'right' ? 'origin-top-right' : 'origin-top-left',
        ]"
      >
        <button
          v-for="item in props.items"
          :key="item.label"
          type="button"
          role="menuitem"
          tabindex="-1"
          class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium outline-none hover:bg-surface-2 focus:bg-surface-2"
          :class="item.danger ? 'text-danger' : 'text-ink'"
          @click="select(item)"
        >
          <component :is="item.icon" v-if="item.icon" :size="17" aria-hidden="true" />
          {{ item.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.menu-enter-active,
.menu-leave-active {
  transition:
    opacity 0.14s ease-out,
    transform 0.14s var(--ease-out-soft);
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
}
</style>
