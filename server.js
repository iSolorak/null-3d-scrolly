/**
 * NULLSHELL — static file server.
 *
 * Zero dependencies on purpose: pm2 can run this straight from a clean clone,
 * no `npm install` step on the VPS. nginx sits in front and reverse-proxies.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const PORT = Number(process.env.PORT) || 3099;
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;

const stat = promisify(fs.stat);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

// The frame sequences never change once generated — cache them hard.
function cacheControl(ext, pathname) {
  if (pathname.startsWith("/frames/")) return "public, max-age=31536000, immutable";
  if (ext === ".html") return "no-cache";
  return "public, max-age=86400";
}

function resolveSafe(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const clean = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(ROOT, clean);
  // never escape the project root
  if (!filePath.startsWith(ROOT)) return null;
  if (clean === "/" || clean.endsWith("/")) filePath = path.join(filePath, "index.html");
  return filePath;
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end("Method Not Allowed");
  }

  const filePath = resolveSafe(req.url || "/");
  if (!filePath) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw Object.assign(new Error("EISDIR"), { code: "EISDIR" });

    const ext = path.extname(filePath).toLowerCase();
    const etag = `W/"${info.size}-${Number(info.mtimeMs).toString(16)}"`;

    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304);
      return res.end();
    }

    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": cacheControl(ext, req.url.split("?")[0]),
      ETag: etag,
      "X-Content-Type-Options": "nosniff"
    });

    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath)
      .on("error", () => res.destroy())
      .pipe(res);
  } catch (err) {
    const code = err.code === "ENOENT" || err.code === "EISDIR" ? 404 : 500;
    res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(code === 404 ? "404 — not found" : "500 — server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[nullshell] serving ${ROOT}`);
  console.log(`[nullshell] listening on http://${HOST}:${PORT}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
