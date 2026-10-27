// 시안 폴더를 http://localhost:4173/ 으로 보여 준다(봇 브라우저는 localhost 4173·5173·8080 만 연다).
// 사용: node serve.mjs <폴더>  — 백그라운드로 띄운다
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };

createServer(async (req, res) => {
  let p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (relative(root, p).startsWith("..")) return res.writeHead(403).end();
  if (p === root || p.endsWith("\\") || p.endsWith("/")) p = join(p, "index.html");
  const body = await readFile(p).catch(() => null);
  if (!body) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" }).end(body);
}).listen(4173, "localhost", () => console.log(`http://localhost:4173/ ← ${root}`));
