<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { LoaderCircle } from 'lucide-vue-next'

const props = defineProps({
  variant: { type: String, default: 'primary' }, // primary | secondary | ghost | danger | dark | link
  size: { type: String, default: 'md' }, // sm | md | lg
  to: { type: [String, Object], default: null },
  href: { type: String, default: null },
  type: { type: String, default: 'button' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
  icon: { type: [Object, Function], default: null },
  iconRight: { type: [Object, Function], default: null },
})

const VARIANTS = {
  primary:
    'bg-accent text-on-accent shadow-[inset_0_-2px_0_rgb(16_24_39/0.12)] hover:bg-mint-300 active:bg-mint-500 dark:hover:bg-mint-300',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2 hover:border-navy-300 dark:hover:border-navy-600',
  ghost: 'text-ink-soft hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger-soft text-danger hover:brightness-95 border border-transparent',
  dark: 'bg-navy-900 text-white hover:bg-navy-800 dark:bg-white dark:text-navy-900 dark:hover:bg-navy-100',
  link: 'text-accent-ink hover:underline underline-offset-4 !px-0 !h-auto',
}
const SIZES = {
  sm: 'h-9 px-3.5 text-sm gap-1.5 rounded-xl',
  md: 'h-11 px-5 text-[0.9375rem] gap-2 rounded-2xl',
  lg: 'h-13 px-6 text-base gap-2.5 rounded-2xl',
}

const tag = computed(() => (props.to ? RouterLink : props.href ? 'a' : 'button'))
const classes = computed(() => [
  'inline-flex select-none items-center justify-center font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out active:scale-[0.98] disabled:opacity-55 disabled:active:scale-100',
  VARIANTS[props.variant] ?? VARIANTS.primary,
  SIZES[props.size] ?? SIZES.md,
  props.block && 'w-full',
  (props.disabled || props.loading) && 'pointer-events-none opacity-60',
])
const iconSize = computed(() => (props.size === 'sm' ? 16 : 18))
</script>

<template>
  <component
    :is="tag"
    :to="to || undefined"
    :href="href || undefined"
    :type="tag === 'button' ? type : undefined"
    :disabled="tag === 'button' ? disabled || loading : undefined"
    :aria-disabled="disabled || loading ? 'true' : undefined"
    :aria-busy="loading ? 'true' : undefined"
    :class="classes"
  >
    <LoaderCircle v-if="loading" :size="iconSize" class="animate-spin" aria-hidden="true" />
    <component :is="icon" v-else-if="icon" :size="iconSize" aria-hidden="true" stroke-width="2.25" />
    <slot />
    <component :is="iconRight" v-if="iconRight && !loading" :size="iconSize" aria-hidden="true" stroke-width="2.25" />
  </component>
</template>
