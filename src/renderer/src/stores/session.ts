import { create } from 'zustand'
import { call, errorMessage } from '../api/client'
import type { AppInfo, SessionUser, Settings } from '@shared/types'

interface SessionStore {
  user: SessionUser | null
  settings: Settings | null
  appInfo: AppInfo | null
  initialized: boolean
  /** Re-reads the session (and settings when signed in). Never throws. */
  refresh: () => Promise<void>
  loadAppInfo: () => Promise<void>
  logout: () => Promise<void>
}

export const useSession = create<SessionStore>((set) => ({
  user: null,
  settings: null,
  appInfo: null,
  initialized: false,

  refresh: async () => {
    try {
      const user = await call('auth:session')
      // A first-time login is intentionally restricted to changing the
      // password. Loading settings at this point is rejected by the main
      // process, so avoid treating that expected restriction as a failed login.
      const settings = user && !user.mustChangePassword ? await call('settings:get') : null
      set({ user, settings, initialized: true })
    } catch (error) {
      console.error('session refresh failed:', errorMessage(error))
      set({ user: null, settings: null, initialized: true })
    }
  },

  loadAppInfo: async () => {
    try {
      set({ appInfo: await call('app:info') })
    } catch (error) {
      console.error('app info failed:', errorMessage(error))
    }
  },

  logout: async () => {
    try {
      await call('auth:logout')
    } finally {
      set({ user: null, settings: null })
    }
  }
}))
