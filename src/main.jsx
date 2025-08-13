import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

const root = createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Fade out preloader after all resources (and fonts) are loaded
function hidePreloader() {
  const el = document.getElementById('preloader')
  if (!el) return
  el.classList.add('hide')
  setTimeout(() => { try { el.remove() } catch {} }, 600)
}

async function waitForFonts(timeout = 4000) {
  try {
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      const t = new Promise((resolve) => setTimeout(resolve, timeout))
      await Promise.race([document.fonts.ready, t])
    }
  } catch {}
}

async function onAllLoaded() {
  await waitForFonts()
  hidePreloader()
}

if (document.readyState === 'complete') {
  onAllLoaded()
} else {
  window.addEventListener('load', onAllLoaded, { once: true })
}
