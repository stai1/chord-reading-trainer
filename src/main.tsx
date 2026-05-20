import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Register the PWA service worker (configured in vite.config.ts).
// `registerType: 'autoUpdate'` means the SW auto-installs and activates new
// versions; this call is just the runtime kick-off.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
