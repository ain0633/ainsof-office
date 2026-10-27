# 설치된 게이트를 봇 계정에서 직접 시험한다 (런북 7-3). 봇이 스스로 거절하면 게이트까지 가지 않으므로, 훅 입력을 직접 넣는다.
#   powershell -ExecutionPolicy Bypass -File C:\ainsof\work\gate-check.ps1
# 막힘·승인 요청은 #office 웹후크로도 간다. 결과는 C:\ainsof\work\gate-check.txt 에 남긴다.
if ($env:USERNAME -ne "ainsof-bot") { Write-Host "ainsof-bot 계정에서 실행하세요."; exit 1 }
$gate = "C:\Program Files\ainsof\gate\gate.mjs"
[Console]::OutputEncoding = [Text.Encoding]::UTF8   # node 출력(UTF-8)을 CP949 로 읽으면 한글이 깨져 JSON 이 망가진다(2026-10-14 첫 실행)
$cases = @(
  @{ want = "deny";  input = '{"agent_type":"ainsof-office:developer","session_id":"gate-check","tool_name":"Bash","tool_input":{"command":"git push origin master"}}' },
  @{ want = "deny";  input = '{"agent_type":"ainsof-office:developer","session_id":"gate-check","tool_name":"Read","tool_input":{"file_path":"C:\\ainsof\\work\\app\\.env"}}' },
  @{ want = "ask";   input = '{"agent_type":"ainsof-office:developer","session_id":"gate-check","tool_name":"Bash","tool_input":{"command":"npm install left-pad"}}' },
  @{ want = "allow"; input = '{"agent_type":"ainsof-office:developer","session_id":"gate-check","tool_name":"Bash","tool_input":{"command":"git push handoff bot/gate-check"}}' }
)
$lines = foreach ($c in $cases) {
  $out = $c.input | node $gate pre
  $got = if ($out) { ($out | ConvertFrom-Json).hookSpecificOutput.permissionDecision } else { "(출력 없음)" }
  $mark = if ($got -eq $c.want) { "OK  " } else { "FAIL" }
  "$mark 기대=$($c.want) 실제=$got  $(($c.input | ConvertFrom-Json).tool_input | ConvertTo-Json -Compress)"
}
$lines | ForEach-Object { Write-Host $_ }
$lines | Set-Content C:\ainsof\work\gate-check.txt
