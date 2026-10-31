# ainsof-bot 계정 준비. 봇 계정의 일반 PowerShell 에서 한 줄로 실행한다:
#   powershell -ExecutionPolicy Bypass -File C:\ainsof\work\setup-bot.ps1
# 계정 사이에 클립보드가 공유되지 않아 명령을 이 파일에 모았다. 결과는 C:\ainsof\work 에 남겨 CEO 계정에서 확인한다.
if ($env:USERNAME -ne "ainsof-bot") { Write-Host "ainsof-bot 계정에서 실행하세요."; exit 1 }

# 다시 실행해도 되게 이미 설치된 것은 건너뛴다
if (Test-Path "$HOME\.local\bin\claude.exe") { Write-Host "[1/5] Claude Code 이미 설치됨" } else { Write-Host "[1/5] Claude Code 설치"; irm https://claude.ai/install.ps1 | iex }
if (Test-Path "$HOME\.bun\bin\bun.exe") { Write-Host "[2/5] Bun 이미 설치됨" } else { Write-Host "[2/5] Bun 설치 (디스코드 채널 플러그인이 쓴다)"; irm bun.sh/install.ps1 | iex }

# Bun 설치 프로그램이 이 창의 PATH 를 사용자 PATH 로만 바꿔 git·node 가 빠진다(2026-10-13 첫 실행에서 git 을 못 찾음).
# Claude Code 는 .local\bin 이 PATH 에 없다고 경고만 하므로 사용자 PATH 에 영구로 더하고, 이 창은 시스템 PATH 와 다시 합친다.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
foreach ($p in "$HOME\.local\bin", "$HOME\.bun\bin") { if (($userPath -split ";") -notcontains $p) { $userPath = "$userPath;$p".Trim(";") } }
[Environment]::SetEnvironmentVariable("Path", $userPath, "User")
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + $userPath

Write-Host "[3/5] git 설정"
git config --global user.name "ainsof-bot"
git config --global user.email "ainsof-bot@users.noreply.local"
git config --global --add safe.directory C:/ainsof/handoff/app.git
git config --global --add safe.directory C:/ainsof/work/app

Write-Host "[4/5] 봇 Claude 설정: claude.ai 커넥터(Gmail·Drive·캘린더·Notion 등) 끄기"
# 봇 계정이 CEO 의 claude.ai 계정으로 로그인하면 커넥터가 따라온다(2026-10-13 확인). 게이트 허용표가 막지만 아예 받지 않게 한다.
# 봇의 Claude 는 이 파일을 고칠 수 없다(게이트 tamper.config). 기존 설정(설치한 플러그인 등)은 그대로 둔다.
$sf = "$HOME\.claude\settings.json"
New-Item -ItemType Directory -Force (Split-Path $sf) | Out-Null
$s = if ((Test-Path $sf) -and (Get-Content $sf -Raw).Trim()) { Get-Content $sf -Raw | ConvertFrom-Json } else { New-Object psobject }
$s | Add-Member -NotePropertyName disableClaudeAiConnectors -NotePropertyValue $true -Force
# 봇이 GitHub 에 쓰는 글·커밋에 Claude 작성 표시를 넣지 않는다. 빈 문자열 형태는 예전 버전도 읽는다(settings-reference "attribution")
$s | Add-Member -NotePropertyName attribution -NotePropertyValue ([pscustomobject]@{ commit = ""; pr = ""; sessionUrl = $false }) -Force
[IO.File]::WriteAllText($sf, ($s | ConvertTo-Json -Depth 20))

# 디스코드 플러그인은 .env 를 \n 으로만 나눠 읽어, 줄 끝 \r 이 있으면 토큰을 못 읽고 바로 꺼진다(2026-10-14).
$ef = "$HOME\.claude\channels\discord\.env"
if (Test-Path $ef) { [IO.File]::WriteAllText($ef, ((Get-Content $ef -Raw) -replace "`r", "")); Write-Host "      디스코드 .env 줄바꿈 정리(CRLF -> LF)" }

Write-Host "[5/5] 확인 파일 쓰기 (C:\ainsof\work\step6.txt, pw-help.txt)"
@("claude $(claude --version)", "bun $(bun --version)", (git -C C:\ainsof\work\app status -sb | Select-Object -First 1), "API_KEY=[$env:ANTHROPIC_API_KEY]", "discord .env 있음=$(Test-Path $ef), CR 남음=$((Test-Path $ef) -and ([IO.File]::ReadAllBytes($ef) -contains 13))", "settings: $(Get-Content $sf -Raw)") | Set-Content C:\ainsof\work\step6.txt
npx -y @playwright/mcp@0.0.83 --help > C:\ainsof\work\pw-help.txt 2>&1

Write-Host ""
Write-Host "끝. 다음(6-C)은 이 창에서 차례로:"
Write-Host "  1) cd C:\ainsof\work\app"
Write-Host "  2) claude --plugin-dir C:\ainsof\plugin\ainsof-office"
Write-Host "     - 테마 등을 물으면 기본값으로 Enter"
Write-Host "     - 로그인 방식은 'Claude 계정(구독)' 을 고르고, 열리는 브라우저에서 CEO Pro 계정으로 로그인"
Write-Host "  3) /plugin install discord@claude-plugins-official   (범위를 물으면 user)"
Write-Host "     - 마켓플레이스가 없다고 나오면: /plugin marketplace add anthropics/claude-plugins-official 뒤 다시"
Write-Host "  4) /status  /agents  /mcp  를 차례로 입력해 화면을 확인한 뒤 /exit"
Write-Host "  5) 사용자 전환으로 CEO 계정에 돌아가 Claude 에게 '6-B 끝' 이라고 알린다"
