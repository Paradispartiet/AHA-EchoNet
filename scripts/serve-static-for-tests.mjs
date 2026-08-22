import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.AHA_STATIC_TEST_PORT || 4177);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

http.createServer((request, response) => {
  let pathname = "/";
  try { pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname); }
  catch { response.writeHead(400).end("Bad request"); return; }
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = resolve(root, `.${requested}`);
  if (file !== root && !file.startsWith(`${root}${sep}`)) { response.writeHead(403).end("Forbidden"); return; }
  try {
    if (!statSync(file).isFile()) throw new Error("not_file");
    response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(404).end("Not found"); }
}).listen(port, "127.0.0.1", () => console.log(`AHA static test server listening on ${port}`));
