<script setup>
/**
 * Debounced address search (Places API (New) autocomplete) as an ARIA
 * combobox. Emits `select` with { placeId, name, address, lat, lng }.
 */
import { ref, watch, useId, onBeforeUnmount } from 'vue'
import { Search, MapPin, LoaderCircle } from 'lucide-vue-next'
import { fetchSuggestions, resolveSuggestion, createSessionToken } from '@/services/places/autocomplete'
import { isMapsConfigured } from '@/services/config'
import { errorMessage } from '@/utils/errors'

const props = defineProps({
  label: { type: String, default: 'Search for an address' },
  placeholder: { type: String, default: 'Search an address or place' },
  near: { type: Object, default: null },
})
const emit = defineEmits(['select'])

const id = useId()
const query = ref('')
const suggestions = ref([])
const active = ref(-1)
const open = ref(false)
const loading = ref(false)
const error = ref('')
let token = null
let timer = null
let requestSeq = 0

watch(query, (value) => {
  clearTimeout(timer)
  error.value = ''
  if (value.trim().length < 3) {
    suggestions.value = []
    open.value = false
    return
  }
  timer = setTimeout(() => search(value), 300)
})

async function search(value) {
  const seq = ++requestSeq
  loading.value = true
  try {
    token ??= await createSessionToken()
    const result = await fetchSuggestions(value, { sessionToken: token, near: props.near })
    if (seq !== requestSeq) return
    suggestions.value = result
    active.value = result.length ? 0 : -1
    open.value = true
  } catch (e) {
    if (seq === requestSeq) error.value = errorMessage(e)
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

async function choose(s) {
  open.value = false
  loading.value = true
  try {
    const place = await resolveSuggestion(s)
    token = null // a session ends with the place lookup
    query.value = ''
    emit('select', place)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

function onKey(event) {
  if (!open.value || !suggestions.value.length) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = (active.value + 1) % suggestions.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = (active.value - 1 + suggestions.value.length) % suggestions.value.length
  } else if (event.key === 'Enter' && active.value >= 0) {
    event.preventDefault()
    choose(suggestions.value[active.value])
  } else if (event.key === 'Escape') {
    open.value = false
  }
}

function onBlur() {
  setTimeout(() => (open.value = false), 150)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="relative">
    <label :for="id" class="sr-only">{{ label }}</label>
    <div class="relative">
      <Search :size="18" class="pointer-events-none absolute top-3.5 left-4 text-muted" aria-hidden="true" />
      <input
        :id="id"
        v-model="query"
        type="search"
        role="combobox"
        autocomplete="off"
        :aria-expanded="open"
        :aria-controls="`${id}-list`"
        :aria-activedescendant="open && active >= 0 ? `${id}-opt-${active}` : undefined"
        aria-autocomplete="list"
        :placeholder="isMapsConfigured ? placeholder : 'Address search needs a Google Maps key'"
        :disabled="!isMapsConfigured"
        class="h-12 w-full rounded-2xl border border-line-strong bg-surface pr-10 pl-11 text-[0.9375rem] text-ink outline-none placeholder:text-muted focus:border-mint-500 focus:shadow-ring disabled:opacity-60"
        @keydown="onKey"
        @focus="open = suggestions.length > 0"
        @blur="onBlur"
      />
      <LoaderCircle v-if="loading" :size="18" class="absolute top-3.5 right-4 animate-spin text-muted" aria-hidden="true" />
    </div>
    <p v-if="error" class="mt-1.5 text-sm text-danger" role="alert">{{ error }}</p>
    <div
      v-show="open"
      class="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
    >
      <ul :id="`${id}-list`" role="listbox" :aria-label="label">
        <li
          v-for="(s, i) in suggestions"
          :id="`${id}-opt-${i}`"
          :key="s.id"
          role="option"
          :aria-selected="i === active"
          class="flex cursor-pointer items-start gap-3 px-4 py-3"
          :class="i === active ? 'bg-surface-2' : ''"
          @mousedown.prevent="choose(s)"
          @mouseenter="active = i"
        >
          <MapPin :size="18" class="mt-0.5 shrink-0 text-accent-ink" aria-hidden="true" />
          <span class="min-w-0">
            <span class="block truncate font-semibold">{{ s.primary }}</span>
            <span class="block truncate text-sm text-muted">{{ s.secondary }}</span>
          </span>
        </li>
        <li v-if="!suggestions.length" class="px-4 py-3 text-sm text-muted">No matches. Try a different spelling.</li>
      </ul>
      <p class="border-t border-line px-4 py-2 text-right text-[11px] font-medium text-muted">Powered by Google</p>
    </div>
  </div>
</template>
