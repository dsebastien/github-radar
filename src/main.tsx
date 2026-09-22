import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
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

createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>
)
