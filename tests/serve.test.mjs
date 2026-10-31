import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const SERVE = fileURLToPath(new URL("../plugin/skills/design-output/serve.mjs", import.meta.url));

test("시안 서버는 파일을 보여 주고, 아무도 안 보면 스스로 꺼진다", async () => {
  const dir = mkdtempSync(join(tmpdir(), "serve-"));
  writeFileSync(join(dir, "A.html"), "<p>시안 A</p>");
  const port = 41000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [SERVE, dir], { env: { ...process.env, SERVE_PORT: String(port), SERVE_IDLE_MS: "400" } });
  await once(child.stdout, "data"); // 떠서 주소를 알릴 때까지
  const res = await fetch(`http://localhost:${port}/A.html`);
  assert.equal(await res.text(), "<p>시안 A</p>");
  const started = Date.now();
  const [code] = await Promise.race([once(child, "exit"), new Promise((_, no) => setTimeout(() => no(new Error("꺼지지 않음")), 5000))]);
  assert.equal(code, 0);
  assert.ok(Date.now() - started >= 300, "요청 뒤 쉬는 시간을 다시 센다");
});
