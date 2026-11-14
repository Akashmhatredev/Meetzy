<script setup>
import { MapPinOff } from 'lucide-vue-next'
import EmptyState from '@/components/common/EmptyState.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div class="page py-20">
    <EmptyState :icon="MapPinOff" title="This place isn't on the map" description="The page you're looking for doesn't exist or has moved.">
      <BaseButton :to="auth.isSignedIn ? '/home' : '/'">{{ auth.isSignedIn ? 'Back to home' : 'Go to Meetzy' }}</BaseButton>
    </EmptyState>
  </div>
</template>
