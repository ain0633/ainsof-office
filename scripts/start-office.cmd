@echo off
rem ainsof Office operator session. Run in the ainsof-bot account:
rem   C:\ainsof\plugin\start-office.cmd
rem Kept in C:\ainsof\plugin (bot: read-only) so the bot cannot change the launch flags.
rem Office page channel: http://127.0.0.1:7777 . Research preview, so it needs the development flag and a confirm on start.
rem Optional argument: work repo name under C:\ainsof\work (default app).
set REPO=%~1
if "%REPO%"=="" set REPO=app
cd /d C:\ainsof\work\%REPO%
"%USERPROFILE%\.local\bin\claude.exe" --plugin-dir C:\ainsof\plugin\ainsof-office --agent ainsof-office:operator --mcp-config C:\ainsof\plugin\ainsof-office\channel\office.mcp.json --channels plugin:discord@claude-plugins-official --dangerously-load-development-channels server:office
