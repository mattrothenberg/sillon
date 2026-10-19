import { useEffect, useState } from 'react'
import { Hero } from './sections/Hero'
import { Bench } from './sections/Bench'
import { Themes } from './sections/Themes'
import { Radial } from './sections/Radial'
import { Zoom } from './sections/Zoom'
import { Review } from './sections/Review'
import { Comments } from './sections/Comments'
import { Api } from './sections/Api'
import { Parts } from './sections/Parts'
import { ThemeSwitch } from './ui'

// Sections, in page order, for the sidebar.
const CHAPTERS = [
  { id: 'usage', label: 'Usage' },
  { id: 'parts', label: 'Components' },
  { id: 'styling', label: 'Styling' },
  { id: 'visualizer', label: 'Visualizer' },
  { id: 'regions', label: 'Regions' },
  { id: 'comments', label: 'Comments' },
  { id: 'zoom', label: 'Long files' },
  { id: 'performance', label: 'Performance' },
]

/** The chapter whose heading most recently crossed the upper third of the screen. */
function useCurrentChapter() {
  const [current, setCurrent] = useState<string | null>(null)
  useEffect(() => {
    const els = CHAPTERS.map((c) => document.getElementById(c.id)).filter((e): e is HTMLElement => !!e)
    const pick = () => {
      let id: string | null = null
      for (const el of els) if (el.getBoundingClientRect().top < innerHeight / 3) id = el.id
      setCurrent(id)
    }
    // Scroll events are cheap here: one rect read per chapter, and state only changes at a boundary.
    pick()
    addEventListener('scroll', pick, { passive: true })
    addEventListener('resize', pick)
    return () => { removeEventListener('scroll', pick); removeEventListener('resize', pick) }
  }, [])
  return current
}

function Sidebar() {
  const current = useCurrentChapter()
  return (
    <aside className="side">
      <div className="side-inner">
        <a className="wordmark" href="#top">sillon</a>
        <p className="side-note">French for the groove cut into a record.</p>
        <nav className="chapters" aria-label="Sections">
          <ol>
            {CHAPTERS.map((c, i) => (
              <li key={c.id}>
                <a href={`#${c.id}`} aria-current={current === c.id ? 'true' : undefined}>
                  <span className="chapter-n" aria-hidden>
                    {current === c.id ? (
                      <svg viewBox="0 0 10 10" width="9" height="9"><path d="M2 1.2v7.6a.6.6 0 0 0 .9.5l6-3.8a.6.6 0 0 0 0-1L2.9.7a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>
                    ) : String(i + 1).padStart(2, '0')}
                  </span>
                  {c.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="side-foot">
          <span className="meta">MIT · React 19</span>
          <ThemeSwitch />
        </div>
      </div>
    </aside>
  )
}

export function App() {
  return (
    <div className="layout" id="top">
      <Sidebar />
      <div className="frame">
        <main>
          <Hero />
          <Api />
          <Parts />
          <Themes />
          <Radial />
          <Review />
          <Comments />
          <Zoom />
          <Bench />
        </main>
        <footer className="foot meta">
          <span>sillon</span>
          <span>MIT</span>
        </footer>
      </div>
    </div>
  )
}
