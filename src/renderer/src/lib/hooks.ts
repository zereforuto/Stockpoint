import { useEffect, useRef, useState, type DependencyList } from 'react'

/**
 * Loads async data whenever `deps` change, exposing a `reload()` for after
 * mutations. Errors are kept (not thrown) so pages can render them inline.
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: DependencyList): {
  data: T | null
  loading: boolean
  error: unknown
  reload: () => void
} {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [version, setVersion] = useState(0)

  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    loaderRef
      .current()
      .then((result) => {
        if (!active) return
        setData(result)
        setLoading(false)
      })
      .catch((caught) => {
        if (!active) return
        setError(caught)
        setLoading(false)
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the caller's inputs
  }, [...deps, version])

  return { data, loading, error, reload: () => setVersion((value) => value + 1) }
}
