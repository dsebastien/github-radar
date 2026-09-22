import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { recordError } from './lib/diagnostics'
import './styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

// The app shell works offline once installed (see public/sw.js). Production only: in dev the
// service worker would serve stale modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
            .catch(() => {
                /* no offline shell: the app works the same online */
            })
    })
}

// Errors outside React rendering (event handlers, promises) land in the diagnostics log too.
window.addEventListener('error', (e) => recordError(e.message, 'unhandled'))
window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) =>
    recordError(e.reason instanceof Error ? e.reason.message : String(e.reason), 'unhandled')
)

createRoot(root).render(
    <StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </StrictMode>
)
