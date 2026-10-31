// 시안 폴더를 http://localhost:4173/ 으로 보여 준다(봇 브라우저는 localhost 4173·5173·8080 만 연다).
// 사용: node serve.mjs <폴더>  — 백그라운드로 띄운다
// 10분 동안 아무도 안 보면 스스로 꺼진다. 봇은 끄는 명령을 쓸 수 없어서 서버가 남던 문제(10/29)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const PORT = Number(process.env.SERVE_PORT ?? 4173);
const IDLE_MS = Number(process.env.SERVE_IDLE_MS ?? 10 * 60 * 1000);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };

let idle;
const rest = () => {
  clearTimeout(idle);
  idle = setTimeout(() => server.close(() => process.exit(0)), IDLE_MS);
};

const server = createServer(async (req, res) => {
  rest();
  let p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (relative(root, p).startsWith("..")) return res.writeHead(403).end();
  if (p === root || p.endsWith("\\") || p.endsWith("/")) p = join(p, "index.html");
  const body = await readFile(p).catch(() => null);
  if (!body) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream", connection: "close" }).end(body);
}).listen(PORT, "localhost", () => {
  console.log(`http://localhost:${PORT}/ ← ${root} (${Math.round(IDLE_MS / 60000)}분 동안 안 보면 꺼짐)`);
  rest();
});
