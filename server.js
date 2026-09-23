/**
 * NULLSHELL — static server (Express).
 *
 * Serves dist/ when it exists (production, after `npm run build`), otherwise the
 * project root so `npm run dev` works on the raw sources with no build step.
 * nginx sits in front and reverse-proxies; this only binds loopback by default.
 */
const path = require("path");
const fs = require("fs");
const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const morgan = require("morgan");

const PORT = Number(process.env.PORT) || 3099;
const HOST = process.env.HOST || "127.0.0.1";
const PROD = process.env.NODE_ENV === "production";

const DIST = path.join(__dirname, "dist");
const SERVE_BUILT = fs.existsSync(path.join(DIST, "index.html"));
const ROOT = SERVE_BUILT ? DIST : __dirname;

const app = express();
app.disable("x-powered-by");
app.set("etag", "strong");

// CSP: everything is self-hosted except the Google Fonts stylesheet and the
// Lenis CDN bundle that index.html pulls in.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: PROD ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// JPEG frames are already compressed — only spend CPU on text
app.use(
  compression({
    filter: (req, res) => {
      const type = res.getHeader("Content-Type") || "";
      if (/^(image|video)\//.test(String(type))) return false;
      return compression.filter(req, res);
    }
  })
);

app.use(morgan(PROD ? "combined" : "dev"));

// makes it obvious from `curl -sI` which layer answered a request
app.use((_req, res, next) => {
  res.setHeader("X-Served-By", SERVE_BUILT ? "node-dist" : "node-source");
  next();
});

// The frame sequences are content-final once generated — cache them hard.
app.use(
  "/frames",
  express.static(path.join(ROOT, "frames"), {
    immutable: true,
    maxAge: "1y",
    fallthrough: false
  })
);

app.use(
  express.static(ROOT, {
    index: "index.html",
    maxAge: PROD ? "7d" : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
    }
  })
);

app.get("/healthz", (_req, res) => {
  let build = null;
  try {
    build = JSON.parse(fs.readFileSync(path.join(ROOT, "build.json"), "utf8"));
  } catch {
    /* unbuilt / dev */
  }
  res.json({ ok: true, mode: SERVE_BUILT ? "dist" : "source", build, uptime: process.uptime() });
});

app.use((_req, res) => res.status(404).type("text/plain").send("404 — not found"));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const code = err.status || err.statusCode || 500;
  if (code === 404) return res.status(404).type("text/plain").send("404 — not found");
  console.error("[nullshell]", err);
  res.status(code).type("text/plain").send("500 — server error");
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[nullshell] serving ${SERVE_BUILT ? "dist/ (built)" : "source tree (unbuilt)"}`);
  console.log(`[nullshell] listening on http://${HOST}:${PORT}`);
  if (!SERVE_BUILT && PROD) {
    console.warn("[nullshell] NODE_ENV=production but dist/ is missing — run `npm run build`");
  }
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
