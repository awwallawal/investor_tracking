import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

window.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('splash-screen')
  const rootDiv = document.getElementById('root')

  if (splash && rootDiv) {
    setTimeout(() => {
      splash.style.opacity = '0'
      splash.style.visibility = 'hidden'
      rootDiv.style.display = 'block'
    }, 2000)
  }
})
