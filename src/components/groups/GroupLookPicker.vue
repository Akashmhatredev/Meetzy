<script setup>
import { GROUP_COLORS, GROUP_EMOJIS } from '@/utils/domain'

const emoji = defineModel('emoji', { type: String, default: '👋' })
const color = defineModel('color', { type: String, default: 'mint' })
</script>

<template>
  <div class="space-y-4">
    <fieldset>
      <legend class="mb-2 text-sm font-semibold">Emoji</legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="e in GROUP_EMOJIS"
          :key="e"
          type="button"
          class="flex h-11 w-11 items-center justify-center rounded-2xl border text-xl transition-[border-color,transform] active:scale-95"
          :class="emoji === e ? 'border-mint-500 bg-mint-50 dark:bg-mint-900/30' : 'border-line hover:border-line-strong'"
          :aria-pressed="emoji === e"
          :aria-label="`Use ${e}`"
          @click="emoji = e"
        >
          {{ e }}
        </button>
      </div>
    </fieldset>
    <fieldset>
      <legend class="mb-2 text-sm font-semibold">Colour</legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="(c, name) in GROUP_COLORS"
          :key="name"
          type="button"
          class="h-9 w-9 rounded-full ring-offset-2 ring-offset-surface transition-[box-shadow]"
          :class="color === name ? 'ring-2 ring-ink' : ''"
          :style="{ background: c.hex }"
          :aria-pressed="color === name"
          :aria-label="`${name} colour`"
          @click="color = name"
        />
      </div>
    </fieldset>
  </div>
</template>
