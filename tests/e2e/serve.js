// A throwaway static server for app/src/main/assets, on a free local port: the suites (run.js) and the store
// screenshots (../media.js) open the app through it.

const fs = require("fs");
const http = require("http");
const path = require("path");

const ASSETS = path.resolve(__dirname, "../../app/src/main/assets");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(ASSETS, rel === "/" ? "index.html" : rel);
    if (!file.startsWith(ASSETS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}

module.exports = { serve };
