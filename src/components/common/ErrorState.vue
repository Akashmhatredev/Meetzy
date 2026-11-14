<script setup>
import { computed } from 'vue'
import { CloudOff, SearchX, ShieldAlert } from 'lucide-vue-next'
import EmptyState from './EmptyState.vue'
import BaseButton from './BaseButton.vue'
import ConfigRequired from './ConfigRequired.vue'
import { AppError } from '@/utils/errors'

const props = defineProps({
  error: { type: [Object, Error], required: true },
  backTo: { type: [String, Object], default: null },
  backLabel: { type: String, default: 'Go back' },
})
const emit = defineEmits(['retry'])

const err = computed(() => AppError.from(props.error))
const icon = computed(() =>
  err.value.code === 'not_found' ? SearchX : err.value.code === 'forbidden' ? ShieldAlert : CloudOff,
)
const title = computed(
  () =>
    ({
      not_found: "We couldn't find that",
      forbidden: "You don't have access",
      network: "You're offline",
    })[err.value.code] ?? 'Something went wrong',
)
</script>

<template>
  <ConfigRequired v-if="err.code === 'not_configured'" />
  <EmptyState v-else :icon="icon" :title="title" :description="err.message" tone="sun">
    <BaseButton v-if="backTo" variant="secondary" :to="backTo">{{ backLabel }}</BaseButton>
    <BaseButton v-if="err.code !== 'not_found' && err.code !== 'forbidden'" @click="emit('retry')">Try again</BaseButton>
  </EmptyState>
</template>
