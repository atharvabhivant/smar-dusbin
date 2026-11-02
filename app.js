const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const publicDirectory = path.join(__dirname, "public");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function createServer() {
  return http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end("Method not allowed");
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    if (pathname.includes("\0")) {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = path.resolve(publicDirectory, relativePath);
    const pathFromPublic = path.relative(publicDirectory, filePath);

    if (pathFromPublic.startsWith("..") || path.isAbsolute(pathFromPublic)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.stat(filePath, (statError, stats) => {
      if (statError) {
        if (statError.code !== "ENOENT" && statError.code !== "ENOTDIR") {
          console.error("Static file lookup failed:", statError);
          res.writeHead(500);
          res.end("Internal server error");
          return;
        }

        res.writeHead(404);
        res.end("Not found");
        return;
      }

      if (!stats.isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.writeHead(200, {
        "Cache-Control": "no-cache",
        "Content-Length": stats.size,
        "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff"
      });

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      const fileStream = fs.createReadStream(filePath);
      fileStream.on("error", error => {
        console.error("Static file read failed:", error);
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end("Internal server error");
      });
      fileStream.pipe(res);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Smart Dustbin dashboard listening on port ${port}`);
  });
}

module.exports = createServer;
