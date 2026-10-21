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

## Deploying the site

The site is a Cloudflare Worker (`apps/site/wrangler.jsonc`) serving the built files at [sillon.mattrothenberg.com](https://sillon.mattrothenberg.com), with the security headers in `apps/site/public/_headers` and no workers.dev or preview URLs. Static assets don't answer byte ranges, which audio needs to start playing and to seek, so a small script (`apps/site/worker/index.js`) serves `/audio/*` with them.

Workers Builds deploys it from this repository: every push to `main` goes to production, and every other branch gets a Preview at `<branch>.sillon.mattrothenberg.com`, linked from its pull request. Build settings, in the Worker's Settings → Build: root directory `apps/site`, build command `pnpm install --frozen-lockfile --filter @sillon/site... && pnpm build`, deploy command `npx wrangler deploy`, preview command `npx wrangler preview`, and the build variable `PNPM_VERSION=12.3.4`.

By hand:

```sh
pnpm --filter @sillon/site preview   # build, then serve it locally with wrangler
pnpm --filter @sillon/site deploy    # build, then deploy (needs `wrangler login`)
```

## Releasing

Releases use [Changesets](https://github.com/changesets/changesets). `@sillon/core` and `@sillon/react` share one version number and are always released together.

1. Run `pnpm changeset` with your change, pick the bump and write one changelog line.
2. Merge to `main`. The release workflow opens (or updates) a "Version packages" PR.
3. Merge that PR. The release workflow's `stage` job then waits for approval of the `npm` environment in GitHub.
4. Approve it. The job builds both packages and stages them on npm, core first.
5. Approve each staged version on npmjs.com (or `npx npm@11.21.0 stage approve <id>`) with 2FA, `@sillon/core` first; that publishes them. npm reviews staged versions for a few minutes first; if approval is refused, check `npm stage view <id>` and retry.

Publishing uses npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) with [staged publishing](https://docs.npmjs.com/staged-publishing); see [SECURITY.md](SECURITY.md).

## Credits

- The demo song is Aphex Twin's *Avril 14th*, with notes after Nicola Ariutti's [SuperCollider transcription](https://sccode.org/1-5d0), played by [Strudel](https://strudel.cc) and recorded with `scripts/strudel/render.mjs`. Strudel is only used to make the recording; none of it ships.
- Fonts: [Instrument Sans](https://fonts.google.com/specimen/Instrument+Sans), [Schibsted Grotesk](https://fonts.google.com/specimen/Schibsted+Grotesk) and [Paper Mono](https://github.com/paper-design/paper-mono), under the SIL Open Font License (`apps/site/public/fonts`).

## License

[MIT](LICENSE)
