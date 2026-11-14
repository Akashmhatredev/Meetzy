<script setup>
/**
 * Marketing illustration (not map data): four friends in different parts
 * of a stylised city, routes converging on a meeting point. Routes draw in
 * once; reduced motion shows the finished picture.
 */
defineProps({
  variant: { type: String, default: 'light' }, // light | dark
})

const friends = [
  { x: 86, y: 92, color: '#7C5CE6', initial: 'M', name: 'Maya', time: '22 min', tx: 70, ty: 140 },
  { x: 432, y: 70, color: '#2F7FD8', initial: 'A', name: 'Arjun', time: '19 min', tx: 392, ty: 120 },
  { x: 470, y: 318, color: '#E07A16', initial: 'S', name: 'Sara', time: '24 min', tx: 418, ty: 276 },
  { x: 70, y: 330, color: '#D9466F', initial: 'K', name: 'Kabir', time: '21 min', tx: 98, ty: 286 },
]
const meet = { x: 268, y: 206 }
const routes = [
  'M86 92 C 120 150, 170 150, 196 176 S 240 200, 268 206',
  'M432 70 C 400 120, 360 120, 340 150 S 290 190, 268 206',
  'M470 318 C 420 300, 380 280, 340 250 S 290 220, 268 206',
  'M70 330 C 120 300, 160 280, 200 250 S 240 220, 268 206',
]
</script>

<template>
  <svg viewBox="0 0 540 400" class="h-auto w-full" role="img" aria-label="Illustration: four friends' routes meeting in the middle">
    <defs>
      <clipPath id="mz-ill-clip"><rect x="0" y="0" width="540" height="400" rx="28" /></clipPath>
      <filter id="mz-ill-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#101827" flood-opacity="0.18" />
      </filter>
    </defs>
    <g clip-path="url(#mz-ill-clip)">
      <rect width="540" height="400" :fill="variant === 'dark' ? '#16213a' : '#eef3f8'" />
      <!-- parks and water -->
      <path d="M-10 40 C 60 20, 120 60, 150 30 L 150 -10 L -10 -10 Z" :fill="variant === 'dark' ? '#1d3a36' : '#d5f6e7'" />
      <ellipse cx="360" cy="330" rx="70" ry="40" :fill="variant === 'dark' ? '#1d3a36' : '#d5f6e7'" />
      <path
        d="M-10 228 C 80 210, 150 250, 230 236 S 380 190, 550 214 L 550 246 C 380 222, 300 268, 230 270 S 80 246, -10 262 Z"
        :fill="variant === 'dark' ? '#1c3557' : '#c4defe'"
      />
      <!-- streets -->
      <g :stroke="variant === 'dark' ? '#24324d' : '#ffffff'" stroke-width="14" stroke-linecap="round" fill="none">
        <path d="M-10 120 H 550" />
        <path d="M-10 300 C 150 300, 300 330, 550 290" />
        <path d="M150 -10 V 410" />
        <path d="M390 -10 C 380 150, 420 260, 380 410" />
      </g>
      <g :stroke="variant === 'dark' ? '#202c45' : '#ffffff'" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.9">
        <path d="M-10 60 H 550" />
        <path d="M-10 180 H 550" />
        <path d="M-10 360 H 550" />
        <path d="M60 -10 V 410" />
        <path d="M250 -10 V 410" />
        <path d="M480 -10 V 410" />
      </g>
      <!-- routes -->
      <path
        v-for="(d, i) in routes"
        :key="d"
        :d="d"
        fill="none"
        :stroke="friends[i].color"
        stroke-width="4.5"
        stroke-linecap="round"
        stroke-dasharray="7 8"
        class="mz-route"
        :style="{ animationDelay: `${0.15 + i * 0.12}s` }"
      />
      <!-- meeting point -->
      <g :transform="`translate(${meet.x} ${meet.y})`" class="mz-meet">
        <circle r="44" fill="#65d6a4" opacity="0.22" />
        <circle r="44" fill="none" stroke="#27a36f" stroke-width="2" stroke-dasharray="5 6" />
        <g filter="url(#mz-ill-shadow)" transform="translate(0 -14)">
          <path d="M0 26C-2 23-20 8-20-4c0-11 9-20 20-20s20 9 20 20C20 8 2 23 0 26Z" fill="#65d6a4" stroke="#101827" stroke-width="3" />
          <circle cx="-5" cy="-4" r="6" fill="none" stroke="#101827" stroke-width="3" />
          <circle cx="5" cy="-4" r="6" fill="none" stroke="#101827" stroke-width="3" />
        </g>
      </g>
      <!-- friends -->
      <g v-for="f in friends" :key="f.name" :transform="`translate(${f.x} ${f.y})`" filter="url(#mz-ill-shadow)">
        <circle r="21" fill="#ffffff" :stroke="f.color" stroke-width="4" />
        <text y="6" text-anchor="middle" font-family="Plus Jakarta Sans Variable, sans-serif" font-weight="800" font-size="16" fill="#101827">
          {{ f.initial }}
        </text>
      </g>
      <!-- time chips -->
      <g v-for="(f, i) in friends" :key="`${f.name}-t`" :transform="`translate(${f.tx} ${f.ty})`" class="mz-chip" :style="{ animationDelay: `${0.7 + i * 0.1}s` }">
        <rect x="-30" y="-13" width="60" height="26" rx="13" :fill="variant === 'dark' ? '#0b111c' : '#101827'" />
        <text y="4.5" text-anchor="middle" font-family="Inter Variable, sans-serif" font-weight="700" font-size="12" fill="#ffffff">
          {{ f.time }}
        </text>
      </g>
      <!-- venue card -->
      <g transform="translate(292 146)" class="mz-chip" style="animation-delay: 1.1s" filter="url(#mz-ill-shadow)">
        <rect width="168" height="52" rx="16" :fill="variant === 'dark' ? '#1b2637' : '#ffffff'" />
        <rect x="10" y="10" width="32" height="32" rx="10" fill="#d5f6e7" />
        <text x="26" y="31" text-anchor="middle" font-size="16">☕</text>
        <text x="52" y="24" font-family="Plus Jakarta Sans Variable, sans-serif" font-weight="800" font-size="12.5" :fill="variant === 'dark' ? '#eef2f8' : '#172033'">
          Café in the middle
        </text>
        <text x="52" y="40" font-family="Inter Variable, sans-serif" font-weight="600" font-size="11" fill="#1e825a">
          Everyone ≤ 24 min
        </text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.mz-route {
  stroke-dashoffset: 0;
  animation: route-in 1.1s var(--ease-out-soft) both;
}
.mz-meet {
  animation: meet-in 0.5s var(--ease-spring) 0.9s both;
  transform-box: fill-box;
}
.mz-chip {
  animation: chip-in 0.4s var(--ease-out-soft) both;
}
@keyframes route-in {
  from {
    opacity: 0;
    stroke-dashoffset: 120;
  }
}
@keyframes meet-in {
  from {
    opacity: 0;
  }
}
@keyframes chip-in {
  from {
    opacity: 0;
  }
}
</style>
