#!/usr/bin/env node
// 잠금 묶음 설치. 관리자 PowerShell에서 실행한다:
//   node company-lock/install.mjs --webhook <디스코드 웹후크 URL> [--repo <작업 저장소 이름>]
// --dry-run 이면 할 일만 출력하고 아무것도 바꾸지 않는다.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { userInfo } from "node:os";

// fs.cpSync 는 Node 22.18 Windows 에서 한글 경로를 만나면 오류 없이 프로세스가 죽는다(Segmentation fault).
// 그래서 파일을 하나씩 복사한다.
export function copyTree(src, dst) {
  if (!statSync(src).isDirectory()) return copyFileSync(src, dst);
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) copyTree(join(src, name), join(dst, name));
}

// secrets.json 은 설치 때마다 덮지 않고 합친다. 바꿀 게 없으면 null
export function mergeSecrets(existingText, { webhook, ceoId }) {
  const s = existingText ? JSON.parse(existingText) : {};
  const next = { ...s, ...(webhook && { discordWebhook: webhook }), ...(ceoId && { ceoDiscordId: ceoId }) };
  return JSON.stringify(next) === JSON.stringify(s) ? null : JSON.stringify(next);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const opt = (name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : null);
const webhook = opt("--webhook");
const REPO = opt("--repo") ?? "app"; // 작업 저장소 이름: C:\ainsof\work\<이름>, 넘김 저장소 C:\ainsof\handoff\<이름>.git

const BOT = "ainsof-bot";
const CEO = userInfo().username;
const GATE = "C:\\Program Files\\ainsof\\gate";
// 승인 요청 알림에서 CEO 를 멘션할 ID. 안 주면 봇의 디스코드 허용 목록(페어링한 CEO)에서 읽는다
const ACCESS = `C:\\Users\\${BOT}\\.claude\\channels\\discord\\access.json`;
const ceoId = opt("--ceo") ?? (existsSync(ACCESS) ? JSON.parse(readFileSync(ACCESS, "utf8")).allowFrom?.[0] ?? null : null);
const SECRETS = join(GATE, "secrets.json");
const MANAGED_DIR = "C:\\Program Files\\ClaudeCode";
const ADMINS = "*S-1-5-32-544";
const SYSTEM = "*S-1-5-18";

const steps = [
  { mkdir: GATE },
  { copy: join(HERE, "..", "plugin", "gate"), to: GATE },
  { secrets: true, label: `secrets.json 합치기 (웹후크 주소${webhook ? " 새로" : " 유지"}, CEO 디스코드 ID ${ceoId ? "있음" : "없음 — 멘션 안 함"})` },
  { mkdir: MANAGED_DIR },
  { copy: join(HERE, "managed-settings.json"), to: join(MANAGED_DIR, "managed-settings.json") },
  ...["log", "memory", "handoff", "work", "plugin"].map((d) => ({ mkdir: `C:\\ainsof\\${d}` })),
  { copy: join(HERE, "..", "plugin"), to: "C:\\ainsof\\plugin\\ainsof-office" },
  { copy: join(HERE, "..", "scripts", "start-office.cmd"), to: "C:\\ainsof\\plugin\\start-office.cmd" }, // 봇은 읽기만 → 실행 옵션을 못 바꾼다
  { run: ["icacls", "C:\\ainsof", "/inheritance:r", "/grant:r", `${ADMINS}:(OI)(CI)F`, `${SYSTEM}:(OI)(CI)F`, `${CEO}:(OI)(CI)M`, `${BOT}:RX`] },
  ...["log", "handoff", "work"].map((d) => ({ run: ["icacls", `C:\\ainsof\\${d}`, "/grant", `${BOT}:(OI)(CI)M`] })),
  ...["memory", "plugin"].map((d) => ({ run: ["icacls", `C:\\ainsof\\${d}`, "/grant", `${BOT}:(OI)(CI)RX`] })),
  ...(existsSync("C:\\data") ? [{ run: ["icacls", "C:\\data", "/inheritance:r", "/grant:r", `${ADMINS}:(OI)(CI)F`, `${SYSTEM}:(OI)(CI)F`, `${CEO}:(OI)(CI)F`] }] : []),
  { run: ["git", "init", "--bare", `C:\\ainsof\\handoff\\${REPO}.git`] },
  // Codex 시스템 설정 폴더: 기본 권한으로는 일반 사용자(봇 포함)도 만들 수 있다. 관리자만 쓰고 나머지는 읽기만(CVE-2026-35603)
  { mkdir: "C:\\ProgramData\\openai\\codex" },
  { run: ["icacls", "C:\\ProgramData\\openai", "/inheritance:r", "/grant:r", `${ADMINS}:(OI)(CI)F`, `${SYSTEM}:(OI)(CI)F`, "*S-1-5-32-545:(OI)(CI)RX"] },
];

const describe = (s) =>
  s.mkdir ? `폴더 만들기: ${s.mkdir}` : s.copy ? `복사: ${s.copy} → ${s.to}` : s.secrets ? s.label : `실행: ${s.run.join(" ")}`;

const check = (cmd, argv, msg) => {
  try {
    execFileSync(cmd, argv, { stdio: "ignore" });
  } catch {
    console.error(msg);
    process.exit(1);
  }
};

// 테스트가 copyTree 를 가져다 쓸 때는 설치를 돌리지 않는다
if (/(^|[\\/])install\.mjs$/i.test(process.argv[1] ?? "")) {
  if (dry) {
    for (const s of steps) console.log(describe(s));
    process.exit(0);
  }
  check("net", ["session"], "관리자 PowerShell에서 실행해 주세요.");
  check("net", ["user", BOT], `먼저 로컬 표준 사용자 ${BOT} 를 만들어 주세요.`);
  if (existsSync(join(MANAGED_DIR, "managed-settings.json")) && !args.includes("--force")) {
    console.error("managed-settings.json 이 이미 있습니다. 내용을 확인한 뒤 --force 로 다시 실행하세요.");
    process.exit(1);
  }
  for (const s of steps) {
    console.log(describe(s));
    if (s.mkdir) mkdirSync(s.mkdir, { recursive: true });
    else if (s.copy) copyTree(s.copy, s.to);
    else if (s.secrets) {
      const text = mergeSecrets(existsSync(SECRETS) ? readFileSync(SECRETS, "utf8") : null, { webhook, ceoId });
      if (text) writeFileSync(SECRETS, text, "utf8");
    }
    else execFileSync(s.run[0], s.run.slice(1), { stdio: "inherit" });
  }
  console.log("설치를 마쳤습니다.");
}
