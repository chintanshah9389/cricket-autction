const { URL } = require("url");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req, limit) {
  const raw = await readBody(req, limit);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch (_) {
    throw new Error("Invalid JSON body");
  }
}

function parseUrl(req) {
  return new URL(req.url, `http://${req.headers.host || "localhost"}`);
}

async function serveStatic(req, res, pathname) {
  let relative = decodeURIComponent(pathname || "/");
  if (relative === "/") relative = "/index.html";
  if (relative.endsWith("/")) relative += "index.html";
  const filePath = path.normalize(path.join(ROOT, relative.replace(/^\//, "")));
  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  try {
    const data = await fsp.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(data);
  } catch (_) {
    if (!res.headersSent) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  }
}

function fileExists(relativePath) {
  try {
    return fs.existsSync(path.join(ROOT, relativePath));
  } catch (_) {
    return false;
  }
}

module.exports = {
  ROOT,
  sendJson,
  readBody,
  readJson,
  parseUrl,
  serveStatic,
  fileExists
};
