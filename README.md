# NULLSHELL

A scroll-scrubbed cinematic landing page in a dark terminal-green theme.

The "3D" is not WebGL — it's a **canvas image-sequence scrub**: two Higgsfield-generated
clips are exported to 180 numbered JPGs each, preloaded, and the frame painted to a
`<canvas>` is picked from scroll progress. Lenis smooth scroll + scroll-synced overlay
copy does the rest. Plain HTML/CSS/JS, no build step.

## Layout

```
index.html              markup + SCRUB_SECTIONS config (bottom of the file)
styles.css              theme: phosphor green on near-black, CRT scanlines
scroll-cinematic.js     the scrub engine (preload, draw, reveal, counters)
build.js                build step — minifies + emits dist/
server.js               Express static server (pm2 entrypoint)
ecosystem.config.js     pm2 process definition — 127.0.0.1:3099
frames/orbit/           180 frames — 360° orbit of the code monolith
frames/dive/            180 frames — fly-through of the server hall
dist/                   build output, git-ignored (what pm2 + nginx serve)
deploy/deploy.sh        pull + hard-reset + install + build + pm2 reload
deploy/install-nginx.sh one-shot nginx install/repair + verification
deploy/nginx/           nginx site config (pure reverse proxy)
clips/, img/            source media (git-ignored, see "Source media")
```

## Dependencies

Runtime: `express`, `compression`, `helmet`, `morgan`.
Build-time: `esbuild`, `html-minifier-terser` (devDependencies — pruned on the VPS
after the build runs).

## Local

```bash
npm install
npm run dev        # http://localhost:8099, binds 0.0.0.0, serves raw sources
```

`server.js` serves `dist/` when it exists and falls back to the source tree when it
doesn't, so `dev` needs no build. `GET /healthz` returns the mode, git rev, asset
hashes and frame count.

## Build

```bash
npm run build      # → dist/
```

Minifies CSS/JS with esbuild and HTML with html-minifier-terser, rewrites the asset
URLs to `?v=<content-hash>` for cache-busting, **hardlinks** `frames/` into
`dist/frames/` (no 35 MB duplicate on disk), and writes `dist/build.json`.

## VPS deploy

Node 18+, pm2, and nginx on the box. First time:

```bash
git clone <your-remote> /var/www/nullshell
cd /var/www/nullshell
npm run pm2:start                  # npm ci + build + pm2 start + pm2 save
pm2 startup                        # print the systemd hook, run what it says
```

nginx — one command, from inside the checkout:

```bash
sudo bash deploy/install-nginx.sh your-domain.com
sudo certbot --nginx -d your-domain.com
```

The installer checks the app is healthy on 3099 first, backs up any existing config,
writes and enables the site, tests, reloads (rolling back if the test fails), then
curls every asset through nginx and reports pass/fail per path.

**nginx is a pure reverse proxy** — no `root`, no `alias`, no filesystem paths and no
directory permissions involved. The pm2 process serves HTML, CSS, JS and all 360
frames with the right cache headers (`no-cache` on HTML, 7d on assets, 1y immutable on
frames) and gzips text itself. This is deliberate: path/permission mistakes in nginx
were previously turning into hard 404s on the styling and frames.

An optional off-disk fast path for `/frames/` is documented at the bottom of
`deploy/nginx/nullshell.conf`. Only add it once the proxy is confirmed working, and
keep its `try_files … @app` fallback.

### If an asset 404s

```bash
curl -sI https://your-domain.com/styles.css | grep -i -e '^HTTP' -e x-served-by
```

- `X-Served-By: node-dist` → the app answered; a 404 here is a real missing file
  (run `npm run build`).
- `X-Served-By: node-source` → running unbuilt; run `npm run build` and reload pm2.
- **no `X-Served-By` header at all** → nginx answered without reaching the app, so the
  running config is not this one. Re-run the installer, then
  `sudo tail -30 /var/log/nginx/nullshell.error.log`.

## Updating

```bash
npm run deploy            # full cycle
BRANCH=main npm run deploy
```

`deploy` runs: `git fetch` → `git reset --hard origin/<branch>` → `git clean` →
`npm ci` (full tree, the build needs devDeps) → `npm run build` →
`npm prune --omit=dev` → `pm2 reload` (or `start`) → `pm2 save` → `GET /healthz`
check, exiting non-zero if it isn't 200.

It hard-resets the checkout — **uncommitted changes on the VPS are discarded**.
Treat the server as a mirror of the remote, not an editing surface. `logs/`, `clips/`,
`img/`, `node_modules/` and `dist/` survive the clean.

Other helpers: `npm run pm2:reload`, `npm run pm2:logs`.

## Source media

Generated with the Higgsfield MCP:

| asset | model | spec |
|---|---|---|
| hero keyframe (`img/hero.png`) | `nano_banana_pro` | 2752×1536, 16:9 |
| orbit clip (`clips/orbit.mp4`) | `grok_video_v15` | 1080p, 6s, start_image = keyframe |
| fly-through (`clips/dive.mp4`) | `grok_video_v15` | 720p, 6s, start_image = keyframe |

`clips/` and `img/` are git-ignored — only `frames/` is needed to serve the site.
Keep a local backup of both; they are the only way to re-slice the frames.

Re-slicing (needs ffmpeg):

```bash
bash ~/.claude/skills/scroll-cinematic/scripts/extract-frames.sh clips/orbit.mp4 frames/orbit 180
bash ~/.claude/skills/scroll-cinematic/scripts/compress-frames.sh frames/orbit 1440 72
```

Frame counts live in `index.html` (`ORBIT_FRAMES` / `DIVE_FRAMES`) — keep them in sync
with what `extract-frames.sh` reports.

## Re-theming

Palette is CSS variables at the top of `styles.css` (`--accent`, `--bg`, `--panel`, …).
Swap the `frames/` folders and the overlay copy in `index.html` and the whole thing
re-skins without touching the engine.
