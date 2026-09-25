<p align="center"><img src="public/logo.svg" width="96" height="96" alt="dogfood app icon"></p>

<h1 align="center">dogfood</h1>

<p align="center">An AI QA system. A local workspace that lists every page of a product, the criteria each page must meet, the evidence you have, and what is still unproven.</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
  <img src="docs/screenshot-light.png" alt="dogfood showing the Book a lesson page of the Tidepool demo with two open issues">
</picture>

## Why

"Did we QA it?" usually means someone clicked around. dogfood makes the answer specific, page by page:

- **Every page, one status.** The sidebar lists each page with a status dot: untested, in review, passed, needs work, or blocked.
- **Criteria, not vibes.** Each page carries its features, five quality questions (functionality, speed, design fit, excess, clarity), and security, scraping, and search checklists. A verdict of Pass or Needs work requires a written evidence note.
- **Real evidence.** A full-page screenshot per page, focused test runs from your own repo, and an optional AI read of the screenshot.
- **Honest gaps.** Each page states what remains untested. Passing tests never become an overall score, and an AI rating never changes a verdict.

## Try the demo

Requires Node 20 or newer. There are no dependencies to install.

```sh
git clone https://github.com/ali-abassi/dogfood.git
cd dogfood
npm run demo
```

Open <http://127.0.0.1:4321>. The demo is **Tidepool**, a fictional swim school whose five pages show every state, including two real layout issues on the booking page.

## Use it on your project

1. Create `data/projects/<id>.json`. Copy the shape of [`demo/projects/tidepool.json`](demo/projects/tidepool.json): one entry per page with its route, screenshot, features, checks, and gaps.
2. Save full-page PNG screenshots to `data/captures/<id>/<page>.png`. Any tool works; for example `agent-browser screenshot --full`.
3. Run `node scripts/check-projects.mjs` to validate the manifest, then `npm start`.

`data/` is git-ignored, so your projects, screenshots, runs, and reviews stay on your machine. Set `DOGFOOD_DATA` to keep them elsewhere, and `DOGFOOD_PORT` to change the port.

### Focused test runs

List a page's test files under `qa.tests` in the manifest, and point `source.checkout` at your repository. **Run checks** then runs only those files with your project's installed Vitest (`node_modules/.bin/vitest`, `src/**/*.test.ts(x)`) and stores each report under `data/runs/`.

### AI screenshot review

**See page → Ask AI to review image** sends the saved screenshot to Gemini 3.8 Flash through OpenRouter and saves a page description, a provisional 1–10 clarity estimate, reasons, and suggestions. Set `OPENROUTER_API_KEY` in the server's environment. Each review costs a small amount of provider usage and is tied to the screenshot's hash, so it is marked stale when the screenshot changes.

## How it works

- `server.mjs` is a dependency-free Node server bound to `127.0.0.1`. It rejects cross-origin writes and serves the app and its API.
- `lib/` holds everything the server and agents share: `schema.mjs` (the manifest vocabulary), `store.mjs` (every validated read and write), `completion.mjs` (when a page's QA is complete), `capture.mjs` (screenshot validity), `test-runs.mjs`, and `visual-review.mjs`.
- `public/` is the interface: plain HTML, CSS, and JavaScript with light and dark themes.
- `npm test` runs the store, server, and review tests; `npm run check` validates syntax and the demo manifest.

### When is a page's QA complete?

A page is complete only when every applicable requirement has evidence: a validated full-page screenshot, a verdict for every feature, all five quality questions, the security, copying, and search checklists, at least one mapped connection, passing focused tests (when the page has any), an AI review of the current screenshot, and no open P0 or P1 issue. A page passes only when its QA is complete and every verdict is Pass.

## License

[MIT](LICENSE)
