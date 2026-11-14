<script setup>
defineProps({
  icon: { type: [Object, Function], default: null },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  tone: { type: String, default: 'mint' },
  compact: { type: Boolean, default: false },
})
const TONES = {
  mint: 'bg-mint-100 text-mint-700 dark:bg-mint-900/50 dark:text-mint-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-700/30 dark:text-sky-200',
  lavender: 'bg-lavender-100 text-lavender-700 dark:bg-lavender-700/30 dark:text-lavender-200',
  sun: 'bg-sun-100 text-sun-700 dark:bg-sun-700/30 dark:text-sun-200',
}
</script>

<template>
  <div class="flex flex-col items-center text-center" :class="compact ? 'px-4 py-8' : 'px-6 py-14'">
    <div v-if="icon || $slots.art" class="relative mb-4">
      <slot name="art">
        <div class="flex h-16 w-16 rotate-[-6deg] items-center justify-center rounded-3xl" :class="TONES[tone] ?? TONES.mint">
          <component :is="icon" :size="30" stroke-width="2" aria-hidden="true" />
        </div>
      </slot>
    </div>
    <h3 class="text-lg font-bold">{{ title }}</h3>
    <p v-if="description" class="mt-1.5 max-w-sm text-sm text-ink-soft">{{ description }}</p>
    <div v-if="$slots.default" class="mt-5 flex flex-wrap items-center justify-center gap-2">
      <slot />
    </div>
  </div>
</template>
