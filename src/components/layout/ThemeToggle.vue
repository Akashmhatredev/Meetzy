<script setup>
import { Moon, Sun } from 'lucide-vue-next'
import IconButton from '@/components/common/IconButton.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <IconButton
    :icon="ui.isDark ? Sun : Moon"
    :label="ui.isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="ui.setTheme(ui.isDark ? 'light' : 'dark')"
  />
</template>
