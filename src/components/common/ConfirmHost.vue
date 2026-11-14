<script setup>
import { computed } from 'vue'
import BaseDialog from './BaseDialog.vue'
import BaseButton from './BaseButton.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const open = computed({
  get: () => !!ui.confirmState,
  set: (v) => !v && ui.settleConfirm(false),
})
</script>

<template>
  <BaseDialog v-model:open="open" :title="ui.confirmState?.title ?? ''" size="sm">
    <p v-if="ui.confirmState?.message" class="text-sm text-ink-soft">{{ ui.confirmState.message }}</p>
    <template #footer>
      <BaseButton variant="secondary" @click="ui.settleConfirm(false)">{{ ui.confirmState?.cancelLabel }}</BaseButton>
      <BaseButton :variant="ui.confirmState?.danger ? 'danger' : 'primary'" @click="ui.settleConfirm(true)">
        {{ ui.confirmState?.confirmLabel }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
