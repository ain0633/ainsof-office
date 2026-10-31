# 봇 계정의 gh 에 GitHub 토큰을 넣는다. 봇 계정의 일반 PowerShell 에서 운영실을 끈 뒤 실행한다:
#   powershell -ExecutionPolicy Bypass -File C:\ainsof\work\github-bot.ps1
# 토큰은 CEO 계정에서 C:\ainsof\work\gh-token.txt 로 넘긴다(계정 사이에 클립보드가 공유되지 않는다). 읽은 뒤 바로 지운다.
# 결과는 C:\ainsof\work\github-check.txt 에 남겨 CEO 계정에서 확인한다.
if ($env:USERNAME -ne "ainsof-bot") { Write-Host "ainsof-bot 계정에서 실행하세요."; exit 1 }
$f = "C:\ainsof\work\gh-token.txt"
if (-not (Test-Path $f)) { Write-Host "토큰 파일이 없습니다: $f"; exit 1 }

(Get-Content $f -Raw).Trim() | gh auth login --hostname github.com --with-token
Remove-Item $f
gh auth setup-git   # git fetch origin 이 gh 토큰을 쓰게 한다

@(
  "token file left: $(Test-Path $f)",
  (gh auth status 2>&1 | Out-String),
  "fetch: $(git -C C:\ainsof\work\app fetch origin 2>&1 | Out-String) exit=$LASTEXITCODE",
  "issues: $(gh issue list -R your-name/app --limit 1 2>&1 | Out-String) exit=$LASTEXITCODE"
) | Set-Content C:\ainsof\work\github-check.txt
Write-Host "끝. CEO 계정에서 C:\ainsof\work\github-check.txt 를 확인한다. 운영실을 다시 켠다: C:\ainsof\plugin\start-office.cmd"
