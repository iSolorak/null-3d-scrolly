/**
 * NULLSHELL — build step.
 *
 * Emits dist/ = what pm2 actually serves:
 *   - scroll-cinematic.js  minified + the inline <script> blocks minified
 *   - styles.css           minified
 *   - index.html           minified, asset URLs cache-busted with a content hash
 *   - frames/              hardlinked from the repo (no 35 MB duplicate on disk)
 *   - build.json           stamp: git rev, timestamp, frame counts
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const esbuild = require("esbuild");
const { minify: minifyHtml } = require("html-minifier-terser");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 8);

function gitRev() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "nogit";
  }
}

/** Hardlink a tree, falling back to a copy across filesystems. */
function linkTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      n += linkTree(from, to);
    } else {
      try {
        fs.linkSync(from, to);
      } catch (err) {
        if (err.code === "EEXIST") continue;
        fs.copyFileSync(from, to);
      }
      n++;
    }
  }
  return n;
}

async function build() {
  const t0 = Date.now();
  fs.mkdirSync(DIST, { recursive: true });

  // ---- css + js -----------------------------------------------------------
  const css = await esbuild.transform(read("styles.css"), { loader: "css", minify: true });
  const js = await esbuild.transform(read("scroll-cinematic.js"), {
    loader: "js",
    minify: true,
    target: "es2019"
  });

  const cssHash = hash(css.code);
  const jsHash = hash(js.code);

  fs.writeFileSync(path.join(DIST, "styles.css"), css.code);
  fs.writeFileSync(path.join(DIST, "scroll-cinematic.js"), js.code);

  // ---- html ---------------------------------------------------------------
  let html = read("index.html")
    .replace('href="styles.css"', `href="styles.css?v=${cssHash}"`)
    .replace('src="scroll-cinematic.js"', `src="scroll-cinematic.js?v=${jsHash}"`);

  html = await minifyHtml(html, {
    collapseWhitespace: true,
    conservativeCollapse: true, // keep one space — the overlay copy relies on it
    removeComments: true,
    minifyCSS: true,
    minifyJS: true,
    keepClosingSlash: true
  });

  fs.writeFileSync(path.join(DIST, "index.html"), html);

  // ---- frames -------------------------------------------------------------
  const framesSrc = path.join(ROOT, "frames");
  let frameCount = 0;
  if (fs.existsSync(framesSrc)) {
    frameCount = linkTree(framesSrc, path.join(DIST, "frames"));
  } else {
    console.warn("! frames/ missing — the scrub sections will render empty");
  }

  // ---- stamp --------------------------------------------------------------
  const stamp = {
    builtAt: new Date().toISOString(),
    rev: gitRev(),
    assets: { css: cssHash, js: jsHash },
    frames: frameCount
  };
  fs.writeFileSync(path.join(DIST, "build.json"), JSON.stringify(stamp, null, 2));

  const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + " kB";
  console.log(`  css    ${kb(css.code)}   (${cssHash})`);
  console.log(`  js     ${kb(js.code)}   (${jsHash})`);
  console.log(`  html   ${kb(html)}`);
  console.log(`  frames ${frameCount} files (hardlinked)`);
  console.log(`✓ built dist/ @ ${stamp.rev} in ${Date.now() - t0}ms`);
}

build().catch((err) => {
  console.error("✗ build failed:", err.message);
  process.exit(1);
});
