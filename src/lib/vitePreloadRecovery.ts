const PRELOAD_RELOAD_KEY = 'app:preload-reload-at'
const PRELOAD_RELOAD_COOLDOWN_MS = 30_000

/** Reload once when a lazy-loaded Vite chunk cannot be fetched. */
export function installVitePreloadRecovery(target: Window = window): () => void {
  const handlePreloadError = (event: Event) => {
    const now = Date.now()

    try {
      const lastReloadAt = Number(target.sessionStorage.getItem(PRELOAD_RELOAD_KEY))
      if (
        Number.isFinite(lastReloadAt) &&
        lastReloadAt > 0 &&
        now >= lastReloadAt &&
        now - lastReloadAt < PRELOAD_RELOAD_COOLDOWN_MS
      ) {
        return
      }
      target.sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(now))
    } catch {
      // Let the error boundary show recovery UI if storage is unavailable;
      // automatic retries without a persistent guard could cause a reload loop.
      return
    }

    // A missing/stale chunk cannot be recovered by React remounting the page.
    event.preventDefault()
    target.location.reload()
  }

  target.addEventListener('vite:preloadError', handlePreloadError)
  return () => target.removeEventListener('vite:preloadError', handlePreloadError)
}
