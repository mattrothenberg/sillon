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

export function App() {
  return (
    <>
      <header className="top">
        <a className="wordmark" href="/">sillon</a>
        <nav>
          <a href="#styling">Styling</a>
          <a href="#visualizer">Visualizer</a>
          <a href="#regions">Regions</a>
          <a href="#zoom">Long files</a>
          <a href="#performance">Performance</a>
          <a href="#usage">Usage</a>
        </nav>
        <ThemeSwitch />
      </header>
      <div className="frame">
        <main>
          <Hero />
          <Themes />
          <Radial />
          <Review />
          <Comments />
          <Zoom />
          <Bench />
          <Api />
          <Parts />
        </main>
        <footer className="foot meta">
          <span>sillon is French for the groove cut into a record.</span>
          <span>MIT</span>
        </footer>
      </div>
    </>
  )
}
