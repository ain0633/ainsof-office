// 레퍼런스 자동 수집(D31). 캡처는 <폴더>에 저장하고, 봇은 모아 보기 한 장(sheet.png)만 본다 — 이미지 15장 대신 1장이라 토큰이 적게 든다.
// 사용: node capture.mjs <폴더> [--appstore "식물 관리"]... [--urls 주소목록.txt] [--mobile]
//   --appstore: Apple 공식 검색 API(iTunes Search, 국가 kr)로 앱을 찾아 앱마다 스크린샷 2장
//   --urls: 한 줄에 주소 하나. 페이지 첫 화면을 찍는다(--mobile 이면 390px 폭)
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [dir, ...args] = process.argv.slice(2);
const opt = (k) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const MAX = 15;

// 주소 목록을 먼저 담는다. 앱 검색은 검색어마다 앱 5개(10장)라 뒤에 두면 15장 상한에 주소가 밀려나지 않는다
const items = [];
for (const f of opt("--urls")) {
  for (const url of (await readFile(f, "utf8")).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) items.push({ url, label: new URL(url).hostname, source: url });
}
for (const term of opt("--appstore")) {
  const q = new URLSearchParams({ term, country: "kr", entity: "software", limit: "5" });
  const { results = [] } = await fetch(`https://itunes.apple.com/search?${q}`).then((r) => r.json());
  for (const app of results) for (const url of (app.screenshotUrls ?? []).slice(0, 2)) items.push({ url, label: app.trackName, source: app.trackViewUrl, image: true });
}
const list = items.slice(0, MAX);
if (!list.length) throw new Error("가져올 것이 없습니다. --appstore 검색어나 --urls 파일을 확인하세요");
await mkdir(dir, { recursive: true });

// 윈도 기본 Edge 를 쓴다. 브라우저를 따로 내려받지 않는다
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: args.includes("--mobile") ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
for (const [i, it] of list.entries()) {
  it.file = String(i + 1).padStart(2, "0") + (it.image ? (it.url.match(/\.(jpe?g|png|webp)$/i)?.[0] ?? ".jpg") : ".png");
  try {
    if (it.image) await writeFile(join(dir, it.file), Buffer.from(await (await fetch(it.url)).arrayBuffer()));
    else {
      await page.goto(it.url, { waitUntil: "load", timeout: 20000 });
      await page.screenshot({ path: join(dir, it.file) });
    }
  } catch (e) {
    it.error = String(e.message).slice(0, 100);
  }
}

// 모아 보기: 번호를 붙여 5칸씩. 봇은 번호로 "쓸 것 / 뺄 것"을 적는다
const ok = list.filter((it) => !it.error);
const tiles = await Promise.all(
  ok.map(async (it) => {
    const type = it.file.endsWith(".png") ? "png" : it.file.endsWith(".webp") ? "webp" : "jpeg";
    const b64 = (await readFile(join(dir, it.file))).toString("base64");
    return `<figure><img src="data:image/${type};base64,${b64}"><figcaption>${list.indexOf(it) + 1}. ${esc(it.label)}</figcaption></figure>`;
  }),
);
await page.setViewportSize({ width: 1600, height: 900 });
await page.setContent(`<style>body{margin:8px;font:16px sans-serif;display:grid;grid-template-columns:repeat(5,1fr);gap:8px}figure{margin:0}img{width:100%;height:420px;object-fit:contain;background:#eee}figcaption{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style>${tiles.join("")}`);
await page.screenshot({ path: join(dir, "sheet.png"), fullPage: true });
await writeFile(join(dir, "index.json"), JSON.stringify(list.map(({ file, label, source, error }) => ({ file, label, source, error })), null, 1));
await browser.close();
console.log(`${ok.length}/${list.length}장 → ${join(dir, "sheet.png")}`);
