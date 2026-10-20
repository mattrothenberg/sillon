<img src="apps/site/public/favicon.svg" width="64" height="64" alt="">

# sillon

Headless waveform components for React. sillon draws the shape of the bars; what fills them, and everything you place on them, is your own HTML and CSS.

```sh
npm install @sillon/react
```

```tsx
import { Waveform, useAudio, usePlayerState } from '@sillon/react'

function Episode({ src }: { src: string }) {
  const { peaks, player } = useAudio(src)
  const { playing } = usePlayerState(player)
  return (
    <div>
      <button onClick={player.toggle}>{playing ? 'Pause' : 'Play'}</button>
      <Waveform.Root peaks={peaks} player={player} className="h-16">
        <Waveform.Shape>
          <Waveform.Track className="bg-stone-300" />
          <Waveform.Progress className="bg-stone-900" />
        </Waveform.Shape>
        <Waveform.Cursor className="w-0.5 bg-orange-600" />
      </Waveform.Root>
    </div>
  )
}
```

The parts have no colors or sizes; the classes here are Tailwind. [A table](packages/react/README.md#coming-from-wavesurferjs) maps wavesurfer.js options to sillon.

**Live demos: [sillon.mattrothenberg.com](https://sillon.mattrothenberg.com)**. The full reference is in [`packages/react`](packages/react/README.md).

> *Sillon* is French for the groove cut into a record.

## What's here

| Path | What | Published |
|---|---|---|
| [`packages/react`](packages/react/README.md) | The components and hooks | `@sillon/react` on npm |
| [`packages/core`](packages/core/README.md) | Peaks: decoding audio in the browser, streaming long MP3s, `.peaks` files. No framework | `@sillon/core` on npm |
| `apps/site` | The landing page and live demos (Astro) | No |
| [`apps/bench`](apps/bench/README.md) | Benchmarks against wavesurfer.js and peaks.js, for regression checks | No |
| `scripts` | Asset generation: the demo music, test audio and `.peaks` files | No |

`@sillon/react` depends on `@sillon/core` and re-exports what React apps need from it, so apps install only `@sillon/react`.

## Develop

Needs Node 22.18 or later (CI uses 24) and pnpm 12.

```sh
pnpm install
pnpm dev          # the site, on http://localhost:5180
pnpm test         # Node tests for core, browser tests (headless Chromium) for React
pnpm typecheck    # every package and app
pnpm build        # both packages: dist/ (ESM and types)
pnpm build:site   # the static site, in apps/site/dist
```

The site and the bench run the packages' TypeScript source through Vite aliases (`packages/source.mjs`), so edits to the library hot-reload with no build step. The package builds run [publint](https://publint.dev) and [are-the-types-wrong](https://arethetypeswrong.github.io) and fail on packaging problems.

The React tests run in real Chromium. The first time, install it with `pnpm --filter @sillon/react exec playwright install chromium`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the code is organized, the rules the components follow, and how the audio and benchmarks are made.

## Releasing

Releases use [Changesets](https://github.com/changesets/changesets). `@sillon/core` and `@sillon/react` share one version number and are always released together.

1. Run `pnpm changeset` with your change, pick the bump and write one changelog line.
2. Merge to `main`. The release workflow opens (or updates) a "Version packages" PR.
3. Merge that PR. The release workflow's `stage` job then waits for approval of the `npm` environment in GitHub.
4. Approve it. The job builds both packages and stages them on npm, core first.
5. Approve each staged version on npmjs.com (or `npx npm@11.21.0 stage approve <id>`) with 2FA, `@sillon/core` first; that publishes them. npm reviews staged versions for a few minutes first; if approval is refused, check `npm stage view <id>` and retry.

Publishing uses npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) with [staged publishing](https://docs.npmjs.com/staged-publishing); see [SECURITY.md](SECURITY.md).

### The first release

npm attaches a trusted publisher only to a package that already exists, so each package is created once by hand, with a placeholder that holds no code. Every version with code is built and published by the release workflow.

1. Create the `sillon` organization on npmjs.com (the `@sillon` scope).
2. Publish the placeholders from `scripts/npm-placeholders` with your own login and 2FA (`npm login`, then `npm publish --access public` in `core/` and in `react/`). They're `0.0.0`, with a README and nothing else; no token is created.
3. For each package on npmjs.com, under Settings → Trusted publishing, add GitHub Actions with repository `mattrothenberg/sillon`, workflow `release.yml` and environment `npm`, allowing staged publishing only (or `npm trust github … --env npm --allow-stage-publish`). Then set Publishing access to require 2FA and disallow tokens.
4. In the GitHub repository, the `npm` environment requires a maintainer's approval and only deploys from `main`; `main` and the `@sillon/*` tags are protected by rulesets.
5. Within two days (npm expires a trusted publisher that hasn't published), push to `main`. The release workflow stages 0.1.0 of both packages: approve the `npm` environment in GitHub, then each staged version on npm, `@sillon/core` first.
6. Deprecate the placeholders: `npm deprecate @sillon/core@0.0.0 "Placeholder"` and the same for `@sillon/react`.

## Credits

- The demo song is Aphex Twin's *Avril 14th*, with notes after Nicola Ariutti's [SuperCollider transcription](https://sccode.org/1-5d0), played by [Strudel](https://strudel.cc) and recorded with `scripts/strudel/render.mjs`. Strudel is only used to make the recording; none of it ships.
- Fonts: [Instrument Sans](https://fonts.google.com/specimen/Instrument+Sans), [Schibsted Grotesk](https://fonts.google.com/specimen/Schibsted+Grotesk) and [Paper Mono](https://github.com/paper-design/paper-mono), under the SIL Open Font License (`apps/site/public/fonts`).

## License

[MIT](LICENSE)
