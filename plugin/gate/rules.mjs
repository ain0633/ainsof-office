// 승인 게이트 규칙. 단단한 설치에서는 관리자 전용 폴더(C:\Program Files\ainsof\gate)에 복사되어 봇 계정은 고칠 수 없다.
// 간단 설치에서는 플러그인 안(~/.claude/plugins)에 있고 tamper.config 가 막는다. 같은 계정이라 실수 방지 수준이다.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const BOT_USER = "ainsof-bot";

const PW_READ = "mcp__plugin_ainsof-office_pw-read__";
const PW_LOCAL = "mcp__plugin_ainsof-office_pw-local__";
// 디스코드 채널 플러그인(discord@claude-plugins-official)의 도구. 운영실만 CEO에게 답한다. 첨부 내려받기는 쓰지 않는다
const DISCORD = ["reply", "react", "edit_message", "fetch_messages"].map((t) => "mcp__plugin_discord_discord__" + t);
const SHELL = /^(Bash|PowerShell)$/;
// Stitch(봇 계정에 CEO가 "stitch" 이름으로 연결). 프로젝트 삭제는 주지 않는다
const STITCH = ["create_project", "get_project", "list_projects", "list_screens", "get_screen", "generate_screen_from_text", "edit_screens", "generate_variants", "create_design_system", "create_design_system_from_design_md", "upload_design_md", "update_design_system", "apply_design_system", "list_design_systems"].map((t) => "mcp__stitch__" + t);
// 토스 ait 플러그인의 문서 MCP. 의견 보내기(sendFeedback)와 콘솔 MCP(ait-console)는 주지 않는다
const AIT_DOCS = ["searchDocumentation", "getPage", "askQuestion"].map((t) => "mcp__plugin_ait_apps-in-toss-docs__" + t);

const base = {
  botUser: BOT_USER,
  roles: {
    "ainsof-office:operator": { tools: ["Agent", "Read", "Glob", "Grep", ...DISCORD, "mcp__office__reply"], agents: ["researcher", "developer", "reviewer", "qa", "designer", "codereview"] },
    // 코드리뷰봇: 개발봇 결과를 다른 회사 모델(Codex)이 읽기 전용으로 리뷰한다. 명령은 브랜치 바꾸기와 codex 리뷰 한 가지뿐, 파일은 쓰지 않는다.
    // 코드가 OpenAI 로 나간다(CEO 결정). Codex 안에서 하는 일은 게이트가 못 보므로 읽기 전용 샌드박스가 유일한 안전장치다 → 아래 codex.flags 가 그 옵션을 못 바꾸게 한다
    "ainsof-office:codereview": {
      tools: ["Read", "Glob", "Grep", "Bash"],
      shellAllow: [
        ["cd"], ["pwd"],
        ...["fetch", "switch", "status", "log", "diff", "rev-parse"].map((s) => ["git", s]), ["git", "branch", "--show-current"],
        ["codex", "exec", "--sandbox", "read-only", "review"],
      ],
    },
    "ainsof-office:researcher": {
      tools: ["WebSearch", "WebFetch", ...["browser_navigate", "browser_navigate_back", "browser_snapshot", "browser_take_screenshot", "browser_tabs", "browser_wait_for"].map((t) => PW_READ + t)],
    },
    // 검수봇: 운영실이 넘긴 초안과 출처 URL만 보고 원문을 대조한다. 웹 글을 읽으므로 로컬 파일·명령·외부 전송 도구는 주지 않는다(Rule of Two).
    // WebFetch 는 요약 모델을 거쳐 원문 그대로를 보장하지 못해 뺀다
    "ainsof-office:reviewer": {
      tools: ["browser_navigate", "browser_navigate_back", "browser_snapshot", "browser_wait_for"].map((t) => PW_READ + t),
    },
    "ainsof-office:developer": {
      tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "PowerShell", "WebFetch", ...["browser_navigate", "browser_snapshot", "browser_click", "browser_type", "browser_take_screenshot", "browser_wait_for"].map((t) => PW_LOCAL + t)],
      webfetchDomains: ["developer.mozilla.org", "nodejs.org", "react.dev", "vite.dev", "vitejs.dev", "playwright.dev", "docs.github.com", "code.claude.com"],
      browserHosts: ["localhost", "127.0.0.1"],
    },
    // QA봇: 완료 기준을 실행으로만 확인한다. 채점받는 코드(src 등)는 못 고치고 보고·스크린샷은 qa/ 아래에만 쓴다. 명령은 허용 목록만
    "ainsof-office:qa": {
      tools: ["Read", "Glob", "Grep", "Write", "Bash", ...["browser_navigate", "browser_snapshot", "browser_click", "browser_type", "browser_take_screenshot", "browser_wait_for"].map((t) => PW_LOCAL + t)],
      // 작업 폴더 바로 아래 qa/ 만. src/qa/ 같은 곳은 안 된다
      // 한계: 역할 분리(실수 방지)용이다. qa/ 에 쓴 Playwright 시험이 node 로 src 를 고치는 것까지는 못 막는다 — 같은 봇 계정 안의 일이라 피해 상한은 개발봇과 같다
      writePaths: /^((?:[a-z]:)?\/ainsof\/work\/[^/]+\/)?qa\/(?!.*\.\.)/i,
      shellAllow: [
        ["npm", "test"], ["npm", "ci"], ["npm", "audit"], ["npm", "ls"], ...["test", "build", "lint", "dev", "preview"].map((s) => ["npm", "run", s]),
        ["npx", "vitest"], ["npx", "tsc"], ["npx", "eslint"], ["npx", "playwright", "test"],
        ...["fetch", "switch", "status", "log", "diff", "show", "rev-parse"].map((s) => ["git", s]), ["git", "branch", "--show-current"],
        ["cd"], ["pwd"], ["ls"], ["cat"], ["head"], ["tail"], ["wc"], ["grep"], ["echo"], ["mkdir"], // mkdir 은 qa/ 안만(decide.mjs shellOutside)
      ],
      browserHosts: ["localhost", "127.0.0.1"],
    },
    // 디자이너봇: 기획서·DESIGN.md·시안·pptx·docx 를 디자인 폴더에만 쓴다. 웹은 공식 가이드·오픈 라이선스 이미지 사이트만(Dribbble·Behance·Mobbin·Pinterest 는 약관상 봇 금지).
    // 한계: node 실행(pptxgenjs 등)이 있어 쓰기 경로 제한은 실수 방지용이다. 그래서 웹 입력을 허용 목록으로 좁혀 둔다(Rule of Two)
    "ainsof-office:designer": {
      tools: [
        "Read", "Glob", "Grep", "Write", "Edit", "Bash", "Skill",
        ...["browser_navigate", "browser_navigate_back", "browser_snapshot", "browser_take_screenshot", "browser_wait_for"].map((t) => PW_READ + t),
        ...["browser_navigate", "browser_snapshot", "browser_take_screenshot", "browser_resize", "browser_wait_for"].map((t) => PW_LOCAL + t),
        ...STITCH, ...AIT_DOCS,
      ],
      writePaths: /^(?:[a-z]:)?\/ainsof\/work\/(design\/|[^/]+\/docs\/design\/)(?!.*\.\.)/i,
      shellAllow: [["node"], ["npm", "install"], ["npm", "ci"], ["npm", "ls"], ["npx", "designmd"], ["cd"], ["pwd"], ["ls"], ["mkdir"]],
      browserHosts: [
        "localhost", "127.0.0.1",
        "developers-apps-in-toss.toss.im", "developer.apple.com", "m3.material.io", "www.w3.org",
        "openverse.org", "commons.wikimedia.org", "www.artic.edu", "www.metmuseum.org", "www.awwwards.com",
      ],
    },
    main: { tools: ["Read", "Glob", "Grep"] },
  },
  // field "target" 은 도구 입력의 경로·명령·주소·파일 패턴을 모은 것, "shell" 은 따옴표와 git 전역 옵션을 걷어 낸 명령이다 (decide.mjs fields).
  deny: [
    // .env, .env.local, prod.env 는 막고 .env.example 만 정확히 통과
    { id: "secret.env", field: "target", re: /(^|[\s"'`\\/=:])\.env(?!\.example(?=$|[\s"'`\\/;|&)]))(\.[\w*-]+)*(?=$|[\s"'`\\/;|&)*])|[\w-]\.env(?=$|[\s"'`\\/;|&)*])/im, reason: "비밀번호 파일(.env)" },
    { id: "secret.keys", field: "target", re: /\.(pem|p12|pfx|key)(?=$|[\s"'`;|&)])|\bid_(rsa|ed25519|ecdsa|dsa)\b|[\\/]\.ssh\b|(^|[\s"'\\/~])\.(npmrc|pypirc|netrc|git-credentials|yarnrc(\.yml)?)\b|\bpip\.(conf|ini)\b|[\\/]\.(aws|azure|kube|docker)[\\/]|[\\/]gcloud[\\/]|[\\/]\.claude[\\/]channels\b|ainsof[\\/](gate[\\/])?secrets\.json|office-pairing\.txt|GitHub CLI[\\/]hosts\.yml|gh-token\.txt|[\\/]\.codex[\\/]auth\.json/i, reason: "키·토큰·인증 파일" },
    { id: "tamper.config", tools: /^(Write|Edit|Bash|PowerShell)$/, field: "target", re: /(^|[\\/\s"'])\.claude(?=$|[\\/\s"';&|])|(Program Files|PROGRA~\d)[\\/](ainsof|ClaudeCode)|managed-settings|[\\/]\.git[\\/]hooks\b|core\.hooksPath|[\\/]ainsof[\\/](plugin|log)\b|[\\/]\.codex[\\/]|ProgramData[\\/]openai\b/i, reason: "회사 규칙·설정·로그 변경(Codex 설정 포함)" },
    { id: "data.aihub", field: "target", re: /(^|[\\/\s"'=:])data[\\/]aihub\b/i, reason: "AI Hub 데이터(국외 반출 제한)" },
    { id: "infra.install", tools: SHELL, field: "shell", re: /\b(winget|choco|scoop|msiexec|Set-ExecutionPolicy|New-Service|netsh|runas|Install-(Module|Package|Script)|(Register|New)-ScheduledTask|schtasks|New-LocalUser|Add-LocalGroupMember|Enable-WindowsOptionalFeature|Add-WindowsCapability|dism)\b|\bsc(\.exe)?\s+(create|config)\b|\breg\s+(add|delete)\b|\bnet\s+(user|localgroup)\b/i, reason: "설치·시스템 변경·계정 생성은 CEO가 직접" },
    { id: "publish.external", tools: SHELL, check: "publishExternal", reason: "외부 발행·클라우드 CLI는 CEO가 직접" },
    { id: "repo.push", tools: SHELL, check: "pushOutside", reason: "넘김 저장소(handoff)의 bot/* 밖으로 푸시, 또는 원격 주소 변경" },
    { id: "delete.outside", tools: SHELL, check: "deleteOutside", reason: "작업 폴더 밖 삭제" },
    // 사무실 페이지는 CEO 브라우저만. 봇이 열거나 명령으로 두드리면 CEO 행세·자기 승인이 된다
    { id: "office.page", field: "target", re: /(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)\s*:\s*7777\b/i, reason: "사무실 페이지(CEO 전용) 접근" },
    { id: "browser.exec", tools: /__browser_(evaluate|run_code_unsafe|file_upload)$/, reason: "브라우저 임의 코드 실행·파일 업로드" },
    // Codex 는 게이트 밖에서 도는 별도 에이전트다. 코드리뷰봇의 읽기 전용 리뷰만 허용한다
    // Codex 설정 파일(봇 계정 .codex, C:\ProgramData\openai)은 위 tamper.config 가 막는다. 설정 하나로 샌드박스가 풀린다(CVE-2026-35603)
    { id: "codex.role", tools: SHELL, check: "codexCall", except: "ainsof-office:codereview", reason: "Codex 는 코드리뷰봇의 읽기 전용 리뷰로만" },
    { id: "codex.flags", tools: SHELL, field: "shell", re: /\bcodex(?:\.cmd|\.exe)?\b[^;&|\n]*?\s(--dangerously[\w-]*|--full-auto|--yolo|--add-dir|--config|--profile|--cd|-[cpsC]|--%|--sandbox\s+(?!read-only\b)\S+)(?=[\s=]|$)/i, reason: "Codex 샌드박스·설정을 바꾸는 옵션(--% 는 CVE-2026-19591)" },
  ],
  ask: [
    // 실수 방지용이다. 인터프리터 한 줄 실행처럼 이름이 안 보이는 통신은 못 잡는다 — 근본 대책은 네트워크 차단
    { id: "net.http", tools: SHELL, field: "shell", re: /\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|Start-BitsTransfer|git\s+clone|scp|ssh|sftp|rsync|ftp|certutil|bitsadmin|nc|ncat)\b|Net\.WebClient|Net\.Http\.HttpClient/i, reason: "명령어로 외부와 통신" },
    { id: "dependency.new", tools: SHELL, check: "newDependency", reason: "새 의존성: 왜 필요한지 / 없으면 / 대안을 적어 승인 요청" },
    { id: "dependency.manifest", tools: /^(Write|Edit)$/, field: "path", re: /(^|[\\/])(package(-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|(requirements|constraints)[\w.-]*\.txt|pyproject\.toml|Pipfile(\.lock)?|poetry\.lock|uv\.lock|Cargo\.(toml|lock)|go\.(mod|sum)|Gemfile(\.lock)?|composer\.(json|lock))$/i, reason: "의존성 목록 파일 수정" },
    { id: "git.history", tools: SHELL, field: "shell", re: /\bgit\s+(reset\s+--hard|clean\b[^;&|\n]*(\s-\w*f|--force)|push\b[^;&|\n]*(--force|\s-f\b|\s\+\S)|branch\b[^;&|\n]*(\s-D\b|\s-\w*D|--delete\s+--force)|filter-branch|filter-repo|update-ref\s+-d|checkout\b[^;&|\n]*\s--(\s|$)|restore\b|stash\s+(drop|clear)|reflog\s+(expire|delete))/i, reason: "git 기록 지우기·변경 버리기" },
    { id: "pii.input", check: "pii", reason: "개인정보로 보이는 입력" },
  ],
  limits: { dailyToolCalls: 300, repeatSame: 3 },
};

// rules.d/*.json: 프로젝트마다 역할의 허용 도메인을 더한다. 예: {"ainsof-office:developer": {"webfetchDomains": ["supabase.com"]}}
export function loadRules(dir = join(dirname(fileURLToPath(import.meta.url)), "rules.d")) {
  const roles = structuredClone(base.roles); // 정규식(writePaths)이 살아 있게 JSON 복사는 쓰지 않는다
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const add = JSON.parse(readFileSync(join(dir, name), "utf8"));
      for (const [role, extra] of Object.entries(add)) {
        if (roles[role]?.webfetchDomains && extra.webfetchDomains) roles[role].webfetchDomains.push(...extra.webfetchDomains);
      }
    }
  }
  return { ...base, roles };
}
