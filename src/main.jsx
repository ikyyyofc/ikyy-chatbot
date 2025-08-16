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

// Subtle 3D tilt for preloader based on pointer
function enablePreloaderTilt() {
  try {
    const pre = document.getElementById('preloader')
    const loader = pre?.querySelector('.loader')
    if (!pre || !loader) return
    let raf = 0
    const onMove = (e) => {
      // Respect prefers-reduced-motion
      try {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      } catch {}
      const rect = pre.getBoundingClientRect()
      const relX = (e.clientX - rect.left) / rect.width - 0.5
      const relY = (e.clientY - rect.top) / rect.height - 0.5
      const max = 10
      const rx = (relY * max)
      const ry = (-relX * max)
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        loader.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`
      })
    }
    const onLeave = () => { loader.style.transform = '' }
    pre.addEventListener('pointermove', onMove)
    pre.addEventListener('pointerleave', onLeave)
    // Cleanup when preloader is removed
    window.addEventListener('app:ready', () => {
      try {
        pre.removeEventListener('pointermove', onMove)
        pre.removeEventListener('pointerleave', onLeave)
      } catch {}
    }, { once: true })
  } catch {}
}

enablePreloaderTilt()

// Fade out and remove the page preloader
function hidePreloader() {
  const el = document.getElementById('preloader')
  if (!el) return
  el.classList.add('hide')
  setTimeout(() => { try { el.remove() } catch {} }, 600)
}

// Hide preloader when the app signals it's ready (first greeting chunk)
window.addEventListener('app:ready', hidePreloader, { once: true })

// Fallbacks: if something goes wrong, ensure the preloader fades eventually
// 1) Hard timeout after 8s
setTimeout(hidePreloader, 8000)
// 2) If fonts are ready much earlier, we still keep preloader visible
//    to avoid flashing the empty chat; we only use it as a soft hint to start the timer.
