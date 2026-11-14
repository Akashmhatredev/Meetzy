<script setup>
import { computed } from 'vue'
import {
  Coffee,
  Utensils,
  Soup,
  Wine,
  CakeSlice,
  IceCreamCone,
  Clapperboard,
  Target,
  Gamepad2,
  Flag,
  Joystick,
  KeyRound,
  Trees,
  Mountain,
  Trophy,
  Footprints,
  Bike,
  ShoppingBag,
  Store,
  ShoppingBasket,
  Sparkles,
} from 'lucide-vue-next'

// Icon names stored in public.activities.icon
const ICONS = {
  coffee: Coffee,
  utensils: Utensils,
  soup: Soup,
  wine: Wine,
  'cake-slice': CakeSlice,
  'ice-cream-cone': IceCreamCone,
  clapperboard: Clapperboard,
  target: Target,
  'gamepad-2': Gamepad2,
  flag: Flag,
  joystick: Joystick,
  'key-round': KeyRound,
  trees: Trees,
  mountain: Mountain,
  trophy: Trophy,
  footprints: Footprints,
  bike: Bike,
  'shopping-bag': ShoppingBag,
  store: Store,
  'shopping-basket': ShoppingBasket,
  sparkles: Sparkles,
}
const props = defineProps({ name: { type: String, default: 'sparkles' }, size: { type: Number, default: 20 } })
const icon = computed(() => ICONS[props.name] ?? Sparkles)
</script>

<template>
  <component :is="icon" :size="size" aria-hidden="true" />
</template>
