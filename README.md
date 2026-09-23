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
server.js               zero-dependency static server (pm2 entrypoint)
ecosystem.config.js     pm2 process definition — 127.0.0.1:3099
frames/orbit/           180 frames — 360° orbit of the code monolith
frames/dive/            180 frames — fly-through of the server hall
deploy/deploy.sh        pull + hard-reset + pm2 reload
deploy/nginx/           nginx site config
clips/, img/            source media (git-ignored, see "Source media")
```

## Local

```bash
npm run dev        # http://localhost:8099, binds 0.0.0.0
```

## VPS deploy

Node 18+, pm2, and nginx on the box. First time:

```bash
git clone <your-remote> /var/www/nullshell
cd /var/www/nullshell
npm run pm2:start                  # starts on 127.0.0.1:3099, pm2 save
pm2 startup                        # print the systemd hook, run what it says
```

nginx:

```bash
sudo cp deploy/nginx/nullshell.conf /etc/nginx/sites-available/nullshell
sudo sed -i 's#APP_ROOT#/var/www/nullshell#g; s#nullshell.example.com#your-domain.com#g' \
  /etc/nginx/sites-available/nullshell
sudo ln -s /etc/nginx/sites-available/nullshell /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

nginx serves `/frames/` straight off disk (35 MB across 360 files) and proxies
everything else to the pm2 process.

## Updating

```bash
npm run deploy            # fetch, reset --hard to origin/<branch>, pm2 reload, health check
BRANCH=main npm run deploy
```

`deploy` hard-resets the checkout — **uncommitted changes on the VPS are discarded**.
Treat the server as a mirror of the remote, not an editing surface. `logs/`, `clips/`
and `img/` survive the clean.

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
