import { useEffect } from 'react'
import { Spinner } from './components/ui/Primitives'
import { ToastHost } from './components/ui/ToastHost'
import { AppShell } from './components/AppShell'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { LoginPage } from './pages/LoginPage'
import { useSession } from './stores/session'

export default function App() {
  const user = useSession((state) => state.user)
  const initialized = useSession((state) => state.initialized)
  const refresh = useSession((state) => state.refresh)
  const loadAppInfo = useSession((state) => state.loadAppInfo)

  useEffect(() => {
    void loadAppInfo()
    void refresh()
  }, [loadAppInfo, refresh])

  if (!initialized) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Starting StockPoint…" />
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <LoginPage />
        <ToastHost />
      </>
    )
  }

  if (user.mustChangePassword) {
    return (
      <>
        <ChangePasswordPage />
        <ToastHost />
      </>
    )
  }

  return (
    <>
      <AppShell />
      <ToastHost />
    </>
  )
}
