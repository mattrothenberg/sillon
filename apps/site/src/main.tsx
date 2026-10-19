import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { loadHighlighter } from './code'
import './styles.css'

// A few kilobytes of grammars; waiting for them means code never flashes from plain to coloured.
await loadHighlighter().catch(() => {})

// Show focus rings once someone moves focus with Tab; hide them again on the next click.
addEventListener('keydown', (e) => { if (e.key === 'Tab') document.documentElement.dataset.keyboard = '' })
addEventListener('pointerdown', () => { delete document.documentElement.dataset.keyboard })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
