import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { isSupabaseConfigured } from '@/services/config'
import LandingPage from '@/pages/public/LandingPage.vue'
import { safeRedirect } from '@/utils/redirect'

// Every page except the landing page is lazy-loaded.
const page = (loader) => loader

const routes = [
  { path: '/', name: 'landing', component: LandingPage, meta: { layout: 'public', title: null } },
  {
    path: '/setup',
    name: 'setup',
    component: page(() => import('@/pages/public/SetupPage.vue')),
    meta: { layout: 'public', title: 'Setup' },
  },
  {
    path: '/login',
    name: 'login',
    component: page(() => import('@/pages/public/LoginPage.vue')),
    meta: { layout: 'auth', guestOnly: true, title: 'Sign in' },
  },
  {
    path: '/register',
    name: 'register',
    component: page(() => import('@/pages/public/RegisterPage.vue')),
    meta: { layout: 'auth', guestOnly: true, title: 'Create account' },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: page(() => import('@/pages/public/ForgotPasswordPage.vue')),
    meta: { layout: 'auth', title: 'Reset password' },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: page(() => import('@/pages/public/ResetPasswordPage.vue')),
    meta: { layout: 'auth', title: 'Choose a new password' },
  },
  {
    path: '/join/:code',
    name: 'join-invite',
    component: page(() => import('@/pages/public/JoinInvitePage.vue')),
    meta: { layout: 'auth', title: 'Join a group' },
  },

  // ---------------------------------------------------------------
  // Signed-in app
  // ---------------------------------------------------------------
  {
    path: '/home',
    name: 'home',
    component: page(() => import('@/pages/dashboard/HomePage.vue')),
    meta: { layout: 'app', requiresAuth: true, title: 'Home' },
  },
  {
    path: '/notifications',
    name: 'notifications',
    component: page(() => import('@/pages/dashboard/NotificationsPage.vue')),
    meta: { layout: 'app', requiresAuth: true, title: 'Notifications' },
  },
  {
    path: '/profile',
    name: 'profile',
    component: page(() => import('@/pages/profile/ProfilePage.vue')),
    meta: { layout: 'app', requiresAuth: true, title: 'Profile' },
  },
  {
    path: '/profile/edit',
    name: 'profile-edit',
    component: page(() => import('@/pages/profile/EditProfilePage.vue')),
    meta: { layout: 'app', requiresAuth: true, title: 'Edit profile' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: page(() => import('@/pages/settings/SettingsPage.vue')),
    meta: { layout: 'app', requiresAuth: true, title: 'Settings' },
  },
  {
    path: '/groups',
    name: 'groups',
    component: page(() => import('@/pages/groups/GroupsPage.vue')),
    meta: { layout: 'app', requiresAuth: true, title: 'Groups' },
  },
  {
    path: '/groups/new',
    name: 'group-new',
    component: page(() => import('@/pages/groups/CreateGroupPage.vue')),
    meta: { layout: 'app', requiresAuth: true, title: 'New group' },
  },
  {
    path: '/groups/join',
    name: 'group-join',
    component: page(() => import('@/pages/groups/JoinGroupPage.vue')),
    meta: { layout: 'app', requiresAuth: true, title: 'Join a group' },
  },
  {
    path: '/groups/:groupId',
    component: page(() => import('@/layouts/GroupLayout.vue')),
    meta: { layout: 'app', requiresAuth: true },
    children: [
      {
        path: '',
        name: 'group',
        component: page(() => import('@/pages/groups/GroupDashboardPage.vue')),
        meta: { title: 'Group' },
      },
      {
        path: 'members',
        name: 'group-members',
        component: page(() => import('@/pages/groups/GroupMembersPage.vue')),
        meta: { title: 'Members' },
      },
      {
        path: 'hangouts/new',
        name: 'hangout-new',
        component: page(() => import('@/pages/hangouts/CreateHangoutPage.vue')),
        meta: { title: 'New hangout' },
      },
    ],
  },
  {
    path: '/hangouts/:hangoutId',
    component: page(() => import('@/layouts/HangoutLayout.vue')),
    meta: { layout: 'app', requiresAuth: true },
    children: [
      {
        path: '',
        name: 'hangout',
        component: page(() => import('@/pages/hangouts/HangoutDashboardPage.vue')),
        meta: { title: 'Hangout' },
      },
      {
        path: 'location',
        name: 'hangout-location',
        component: page(() => import('@/pages/hangouts/LocationSharingPage.vue')),
        meta: { title: 'Share location' },
      },
      {
        path: 'map',
        name: 'hangout-map',
        component: page(() => import('@/pages/hangouts/GroupMapPage.vue')),
        meta: { title: 'Group map', wide: true },
      },
      {
        path: 'activities',
        name: 'hangout-activities',
        component: page(() => import('@/pages/hangouts/ActivitySelectionPage.vue')),
        meta: { title: 'Pick activities' },
      },
      {
        path: 'activities/vote',
        name: 'hangout-activity-vote',
        component: page(() => import('@/pages/hangouts/ActivityVotingPage.vue')),
        meta: { title: 'Activity vote' },
      },
      {
        path: 'meeting-point',
        name: 'hangout-meeting-point',
        component: page(() => import('@/pages/hangouts/MeetingPointPage.vue')),
        meta: { title: 'Meeting point' },
      },
      {
        path: 'venues',
        name: 'hangout-venues',
        component: page(() => import('@/pages/hangouts/VenueDiscoveryPage.vue')),
        meta: { title: 'Venues', wide: true },
      },
      {
        path: 'compare',
        name: 'hangout-compare',
        component: page(() => import('@/pages/hangouts/VenueComparisonPage.vue')),
        meta: { title: 'Compare venues' },
      },
      {
        path: 'vote',
        name: 'hangout-vote',
        component: page(() => import('@/pages/hangouts/FinalVotingPage.vue')),
        meta: { title: 'Vote' },
      },
      {
        path: 'confirmed',
        name: 'hangout-confirmed',
        component: page(() => import('@/pages/hangouts/HangoutConfirmationPage.vue')),
        meta: { title: "You're meeting here" },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: page(() => import('@/pages/public/NotFoundPage.vue')),
    meta: { layout: 'public', title: 'Not found' },
  },
]

export { safeRedirect }

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 80 }
    // Moving between steps of the same hangout keeps the header in view.
    if (to.params.hangoutId && to.params.hangoutId === from.params.hangoutId) return { top: 0 }
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()

  if (to.meta.requiresAuth && !auth.isSignedIn) {
    if (!isSupabaseConfigured) return { name: 'setup' }
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && auth.isSignedIn) {
    return safeRedirect(to.query.redirect)
  }
  // A password-recovery link signs the user in; keep them on the reset form.
  if (auth.recoveringPassword && to.name !== 'reset-password' && to.meta.requiresAuth) {
    return { name: 'reset-password' }
  }
  return true
})

router.afterEach((to) => {
  const title = [...to.matched].reverse().find((r) => r.meta.title !== undefined)?.meta.title
  document.title = title ? `${title} · Meetzy` : 'Meetzy · Less planning. More meeting.'
})

// A new deploy can remove old lazy chunks; reload once instead of breaking.
router.onError((error, to) => {
  if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(error?.message)) {
    window.location.assign(to.fullPath)
  }
})

export default router
