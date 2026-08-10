# GENERATED FILE - edit src/ and run: bun build.mjs
#Requires -Version 5.1
<#
.SYNOPSIS
    ClawGod Plus Installer for Windows
.DESCRIPTION
    Downloads Claude Code from npm, applies feature unlock patches,
    and replaces the 'claude' command with the patched version.
.EXAMPLE
    irm https://github.com/A6083450/clawgod-plus/releases/latest/download/install.ps1 | iex
    # or
    .\install.ps1
    .\install.ps1 -Version 2.1.89
    .\install.ps1 -NoUpgrade
    .\install.ps1 -Uninstall
#>
param(
    [string]$Version = "latest",
    [switch]$NoUpgrade,
    [switch]$Uninstall,
    [switch]$LeanOff,
    [switch]$LeanOn,
    [switch]$LeanMax
)

$ErrorActionPreference = "Stop"

if ($env:CLAWGOD_VERSION -and $Version -eq "latest") { $Version = $env:CLAWGOD_VERSION }
if ($env:CLAWGOD_NO_UPGRADE -eq "1") { $NoUpgrade = [switch]$true }
if ($env:CLAWGOD_LEAN_OFF -eq "1") { $LeanOff = [switch]$true }
if ($env:CLAWGOD_LEAN_ON -eq "1") { $LeanOn = [switch]$true }
if ($env:CLAWGOD_LEAN_MAX -eq "1") { $LeanMax = [switch]$true }

$ClawDir = Join-Path $env:USERPROFILE ".clawgod"
$BinDir  = Join-Path $env:USERPROFILE ".local\bin"
$ClawSelfVersion = "0.0.0-dev"  # injected by release workflow from git tag

$ClaudeMemCompatBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCmNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTsKY29uc3Qgb3MgPSByZXF1aXJlKCdvcycpOwpjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpOwpjb25zdCBjcCA9IHJlcXVpcmUoJ2NoaWxkX3Byb2Nlc3MnKTsKCmNvbnN0IGhvbWUgPSBwcm9jZXNzLmVudi5VU0VSUFJPRklMRSB8fCBwcm9jZXNzLmVudi5IT01FIHx8IG9zLmhvbWVkaXIoKTsKY29uc3QgY2xhd2dvZERpciA9IHBhdGguam9pbihob21lLCAnLmNsYXdnb2QnKTsKY29uc3QgbWVtRGlyID0gcHJvY2Vzcy5lbnYuQ0xBVURFX01FTV9EQVRBX0RJUiB8fCBwYXRoLmpvaW4oaG9tZSwgJy5jbGF1ZGUtbWVtJyk7CmNvbnN0IHNldHRpbmdzUGF0aCA9IHBhdGguam9pbihtZW1EaXIsICdzZXR0aW5ncy5qc29uJyk7CmNvbnN0IGJhY2t1cFBhdGggPSBwYXRoLmpvaW4obWVtRGlyLCAnY2xhd2dvZC1zZXR0aW5ncy1iYWNrdXAuanNvbicpOwpjb25zdCBzdGF0ZVBhdGggPSBwYXRoLmpvaW4obWVtRGlyLCAnY2xhd2dvZC1zZXR0aW5ncy1zdGF0ZS5qc29uJyk7CmNvbnN0IGlzV2luZG93cyA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMic7CmNvbnN0IGxhdW5jaGVyUGF0aCA9IHBhdGguam9pbihjbGF3Z29kRGlyLCBpc1dpbmRvd3MgPyAnY2xhdWRlLW1lbS5jbWQnIDogJ2NsYXVkZS1tZW0nKTsKY29uc3QgbWFuYWdlZEtleXMgPSBbJ0NMQVVERV9NRU1fTU9ERUwnLCAnQ0xBVURFX01FTV9DTEFVREVfQVVUSF9NRVRIT0QnLCAnQ0xBVURFX0NPREVfUEFUSCddOwoKZnVuY3Rpb24gcmVhZEpzb24oZmlsZSwgZmFsbGJhY2sgPSBudWxsKSB7CiAgdHJ5IHsgcmV0dXJuIEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKGZpbGUsICd1dGY4JykpOyB9IGNhdGNoIHsgcmV0dXJuIGZhbGxiYWNrOyB9Cn0KCmZ1bmN0aW9uIHdyaXRlSnNvbihmaWxlLCB2YWx1ZSkgewogIGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh2YWx1ZSwgbnVsbCwgMikgKyAnXG4nOwogIHRyeSB7IGlmIChmcy5yZWFkRmlsZVN5bmMoZmlsZSwgJ3V0ZjgnKSA9PT0gY29udGVudCkgcmV0dXJuIGZhbHNlOyB9IGNhdGNoIHt9CiAgZnMubWtkaXJTeW5jKHBhdGguZGlybmFtZShmaWxlKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7CiAgY29uc3QgdGVtcCA9IGAke2ZpbGV9LiR7cHJvY2Vzcy5waWR9LnRtcGA7CiAgZnMud3JpdGVGaWxlU3luYyh0ZW1wLCBjb250ZW50LCB7IG1vZGU6IDBvNjAwIH0pOwogIGZzLnJlbmFtZVN5bmModGVtcCwgZmlsZSk7CiAgcmV0dXJuIHRydWU7Cn0KCmZ1bmN0aW9uIGNvbmZpZ3VyZWRHYXRld2F5KCkgewogIGNvbnN0IHByb3ZpZGVyID0gcmVhZEpzb24ocGF0aC5qb2luKGNsYXdnb2REaXIsICdwcm92aWRlci5qc29uJyksIHt9KTsKICBjb25zdCBjbGF1ZGVTZXR0aW5ncyA9IHJlYWRKc29uKHBhdGguam9pbihwcm9jZXNzLmVudi5DTEFVREVfQ09ORklHX0RJUiB8fCBwYXRoLmpvaW4oaG9tZSwgJy5jbGF1ZGUnKSwgJ3NldHRpbmdzLmpzb24nKSwge30pOwogIGNvbnN0IGVudiA9IGNsYXVkZVNldHRpbmdzICYmIHR5cGVvZiBjbGF1ZGVTZXR0aW5ncy5lbnYgPT09ICdvYmplY3QnID8gY2xhdWRlU2V0dGluZ3MuZW52IDoge307CiAgaWYgKHByb3ZpZGVyLmFwaUtleSkgewogICAgcmV0dXJuIHsgY3JlZGVudGlhbDogcHJvdmlkZXIuYXBpS2V5LCBiYXNlVVJMOiBwcm92aWRlci5iYXNlVVJMIHx8ICcnIH07CiAgfQogIHJldHVybiB7CiAgICBjcmVkZW50aWFsOiBlbnYuQU5USFJPUElDX0FVVEhfVE9LRU4gfHwgZW52LkFOVEhST1BJQ19BUElfS0VZIHx8ICcnLAogICAgYmFzZVVSTDogZW52LkFOVEhST1BJQ19CQVNFX1VSTCB8fCAnJywKICB9Owp9CgpmdW5jdGlvbiBmaW5kV29ya2VyKCkgewogIGNvbnN0IGNvbmZpZ0RpciA9IHByb2Nlc3MuZW52LkNMQVVERV9DT05GSUdfRElSIHx8IHBhdGguam9pbihob21lLCAnLmNsYXVkZScpOwogIGNvbnN0IGNhY2hlID0gcGF0aC5qb2luKGNvbmZpZ0RpciwgJ3BsdWdpbnMnLCAnY2FjaGUnLCAndGhlZG90bWFjaycsICdjbGF1ZGUtbWVtJyk7CiAgY29uc3QgY2FuZGlkYXRlcyA9IFtdOwogIHRyeSB7CiAgICBmb3IgKGNvbnN0IHZlcnNpb24gb2YgZnMucmVhZGRpclN5bmMoY2FjaGUpKSB7CiAgICAgIGNhbmRpZGF0ZXMucHVzaChwYXRoLmpvaW4oY2FjaGUsIHZlcnNpb24sICdzY3JpcHRzJywgJ3dvcmtlci1zZXJ2aWNlLmNqcycpKTsKICAgIH0KICB9IGNhdGNoIHt9CiAgY2FuZGlkYXRlcy5wdXNoKHBhdGguam9pbihjb25maWdEaXIsICdwbHVnaW5zJywgJ21hcmtldHBsYWNlcycsICd0aGVkb3RtYWNrJywgJ3BsdWdpbicsICdzY3JpcHRzJywgJ3dvcmtlci1zZXJ2aWNlLmNqcycpKTsKICByZXR1cm4gY2FuZGlkYXRlcy5maWx0ZXIoZmlsZSA9PiBmcy5leGlzdHNTeW5jKGZpbGUpKS5zb3J0KChhLCBiKSA9PiB7CiAgICB0cnkgeyByZXR1cm4gZnMuc3RhdFN5bmMoYikubXRpbWVNcyAtIGZzLnN0YXRTeW5jKGEpLm10aW1lTXM7IH0gY2F0Y2ggeyByZXR1cm4gMDsgfQogIH0pWzBdIHx8IG51bGw7Cn0KCmZ1bmN0aW9uIHJlc3RhcnRXb3JrZXIoKSB7CiAgaWYgKHByb2Nlc3MuZW52LkNMQVdHT0RfU0tJUF9DTEFVREVfTUVNX1JFU1RBUlQgPT09ICcxJykgcmV0dXJuOwogIGNvbnN0IHdvcmtlciA9IGZpbmRXb3JrZXIoKTsKICBpZiAoIXdvcmtlcikgcmV0dXJuOwogIGNvbnN0IGJ1biA9IHByb2Nlc3MuZW52LkNMQVdHT0RfQlVOX0JJTiB8fCBwYXRoLmpvaW4oaG9tZSwgJy5idW4nLCAnYmluJywgaXNXaW5kb3dzID8gJ2J1bi5leGUnIDogJ2J1bicpOwogIGNvbnN0IGNvbW1hbmQgPSBmcy5leGlzdHNTeW5jKGJ1bikgPyBidW4gOiAnYnVuJzsKICBjb25zdCBydW4gPSBjcC5zcGF3blN5bmMoY29tbWFuZCwgW3dvcmtlciwgJ3Jlc3RhcnQnXSwgeyBzdGRpbzogJ2luaGVyaXQnLCB3aW5kb3dzSGlkZTogdHJ1ZSwgdGltZW91dDogOTAwMDAgfSk7CiAgaWYgKHJ1bi5lcnJvciB8fCBydW4uc3RhdHVzICE9PSAwKSB0aHJvdyBydW4uZXJyb3IgfHwgbmV3IEVycm9yKGBjbGF1ZGUtbWVtIHJlc3RhcnQgZXhpdGVkICR7cnVuLnN0YXR1c31gKTsKfQoKZnVuY3Rpb24gcHJvY2Vzc1Jvd3MoKSB7CiAgaWYgKHByb2Nlc3MuZW52LkNMQVdHT0RfQ0xBVURFX01FTV9QU19GSVhUVVJFKSByZXR1cm4gcHJvY2Vzcy5lbnYuQ0xBV0dPRF9DTEFVREVfTUVNX1BTX0ZJWFRVUkUuc3BsaXQoL1xyP1xuLyk7CiAgaWYgKGlzV2luZG93cykgewogICAgY29uc3Qgc2NyaXB0ID0gJ0dldC1DaW1JbnN0YW5jZSBXaW4zMl9Qcm9jZXNzIHwgU2VsZWN0LU9iamVjdCBQcm9jZXNzSWQsUGFyZW50UHJvY2Vzc0lkLENvbW1hbmRMaW5lIHwgQ29udmVydFRvLUpzb24gLUNvbXByZXNzJzsKICAgIGNvbnN0IHJhdyA9IGNwLmV4ZWNGaWxlU3luYygncG93ZXJzaGVsbCcsIFsnLU5vUHJvZmlsZScsICctQ29tbWFuZCcsIHNjcmlwdF0sIHsgZW5jb2Rpbmc6ICd1dGY4Jywgd2luZG93c0hpZGU6IHRydWUgfSk7CiAgICBjb25zdCB2YWx1ZXMgPSBKU09OLnBhcnNlKHJhdyB8fCAnW10nKTsKICAgIHJldHVybiAoQXJyYXkuaXNBcnJheSh2YWx1ZXMpID8gdmFsdWVzIDogW3ZhbHVlc10pLm1hcChpdGVtID0+IGAke2l0ZW0uUHJvY2Vzc0lkfSAke2l0ZW0uUGFyZW50UHJvY2Vzc0lkfSAke2l0ZW0uQ29tbWFuZExpbmUgfHwgJyd9YCk7CiAgfQogIHJldHVybiBjcC5leGVjRmlsZVN5bmMoJy9iaW4vcHMnLCBbJy1heG8nLCAncGlkPSxwcGlkPSxjb21tYW5kPSddLCB7IGVuY29kaW5nOiAndXRmOCcgfSkuc3BsaXQoL1xyP1xuLyk7Cn0KCmZ1bmN0aW9uIGNsZWFudXBTdGFsZUNocm9tYSgpIHsKICBpZiAocHJvY2Vzcy5lbnYuQ0xBV0dPRF9DTEFVREVfTUVNX1NLSVBfQ0xFQU5VUCA9PT0gJzEnKSByZXR1cm4geyBzdGFsZVBpZHM6IFtdLCBrZXB0UGlkOiBudWxsIH07CiAgY29uc3Qgc3VwZXJ2aXNvciA9IHJlYWRKc29uKHBhdGguam9pbihtZW1EaXIsICdzdXBlcnZpc29yLmpzb24nKSwge30pOwogIGNvbnN0IHJlY29yZGVkUGlkID0gTnVtYmVyKHN1cGVydmlzb3I/LnByb2Nlc3Nlcz8uWydjaHJvbWEtbWNwJ10/LnBpZCkgfHwgbnVsbDsKICBjb25zdCBub3JtYWxpemVQYXRoID0gdmFsdWUgPT4gewogICAgY29uc3Qgbm9ybWFsaXplZCA9IHBhdGgucmVzb2x2ZSh2YWx1ZSkucmVwbGFjZSgvXFwvZywgJy8nKTsKICAgIHJldHVybiBpc1dpbmRvd3MgPyBub3JtYWxpemVkLnRvTG93ZXJDYXNlKCkgOiBub3JtYWxpemVkOwogIH07CiAgY29uc3QgZGF0YURpciA9IG5vcm1hbGl6ZVBhdGgocGF0aC5qb2luKG1lbURpciwgJ2Nocm9tYScpKTsKICBjb25zdCBwcm9jZXNzZXMgPSBuZXcgTWFwKCk7CiAgZm9yIChjb25zdCByb3cgb2YgcHJvY2Vzc1Jvd3MoKSkgewogICAgY29uc3QgbWF0Y2ggPSAvXlxzKihcZCspXHMrKFxkKylccysoLispJC8uZXhlYyhyb3cpOwogICAgaWYgKG1hdGNoKSBwcm9jZXNzZXMuc2V0KE51bWJlcihtYXRjaFsxXSksIHsgcHBpZDogTnVtYmVyKG1hdGNoWzJdKSwgY29tbWFuZDogbWF0Y2hbM10gfSk7CiAgfQogIGNvbnN0IGNhbmRpZGF0ZXMgPSBuZXcgU2V0KCk7CiAgZm9yIChjb25zdCBbcGlkLCBpdGVtXSBvZiBwcm9jZXNzZXMpIHsKICAgIGNvbnN0IGNvbW1hbmQgPSBpc1dpbmRvd3MgPyBpdGVtLmNvbW1hbmQudG9Mb3dlckNhc2UoKSA6IGl0ZW0uY29tbWFuZDsKICAgIGNvbnN0IGFyZ3MgPSBjb21tYW5kLm1hdGNoKC8iW14iXSoifCdbXiddKid8XFMrL2cpPy5tYXAodmFsdWUgPT4gdmFsdWUucmVwbGFjZSgvXlsiJ118WyInXSQvZywgJycpKSB8fCBbXTsKICAgIGNvbnN0IGRhdGFEaXJJbmRleCA9IGFyZ3MuaW5kZXhPZignLS1kYXRhLWRpcicpOwogICAgaWYgKGNvbW1hbmQuaW5jbHVkZXMoJ2Nocm9tYS1tY3AnKSAmJiBjb21tYW5kLmluY2x1ZGVzKCctLWNsaWVudC10eXBlIHBlcnNpc3RlbnQnKSAmJiBkYXRhRGlySW5kZXggPj0gMCAmJiBub3JtYWxpemVQYXRoKGFyZ3NbZGF0YURpckluZGV4ICsgMV0pID09PSBkYXRhRGlyKSBjYW5kaWRhdGVzLmFkZChwaWQpOwogIH0KICBjb25zdCByb290T2YgPSBwaWQgPT4gewogICAgbGV0IGN1cnJlbnQgPSBwaWQ7CiAgICBjb25zdCBzZWVuID0gbmV3IFNldCgpOwogICAgd2hpbGUgKGNhbmRpZGF0ZXMuaGFzKHByb2Nlc3Nlcy5nZXQoY3VycmVudCk/LnBwaWQpICYmICFzZWVuLmhhcyhjdXJyZW50KSkgewogICAgICBzZWVuLmFkZChjdXJyZW50KTsKICAgICAgY3VycmVudCA9IHByb2Nlc3Nlcy5nZXQoY3VycmVudCkucHBpZDsKICAgIH0KICAgIHJldHVybiBjdXJyZW50OwogIH07CiAgY29uc3Qga2VwdFBpZCA9IHJlY29yZGVkUGlkICYmIGNhbmRpZGF0ZXMuaGFzKHJlY29yZGVkUGlkKSA/IHJvb3RPZihyZWNvcmRlZFBpZCkgOiBudWxsOwogIGlmICgha2VwdFBpZCkgcmV0dXJuIHsgc3RhbGVQaWRzOiBbXSwga2VwdFBpZDogbnVsbCB9OwogIGNvbnN0IHJvb3RzID0gWy4uLmNhbmRpZGF0ZXNdLmZpbHRlcihwaWQgPT4gcm9vdE9mKHBpZCkgPT09IHBpZCk7CiAgY29uc3Qgc3RhbGVQaWRzID0gcm9vdHMuZmlsdGVyKHBpZCA9PiBwaWQgIT09IGtlcHRQaWQpLnNvcnQoKGEsIGIpID0+IGEgLSBiKTsKICBpZiAocHJvY2Vzcy5lbnYuQ0xBV0dPRF9DTEFVREVfTUVNX0RSWV9SVU4gIT09ICcxJykgewogICAgZm9yIChjb25zdCBwaWQgb2Ygc3RhbGVQaWRzKSB7CiAgICAgIGlmIChpc1dpbmRvd3MpIHsKICAgICAgICBjcC5zcGF3blN5bmMoJ3Rhc2traWxsJywgWycvUElEJywgU3RyaW5nKHBpZCksICcvVCcsICcvRiddLCB7IHN0ZGlvOiAnaWdub3JlJywgd2luZG93c0hpZGU6IHRydWUgfSk7CiAgICAgIH0gZWxzZSB7CiAgICAgICAgY29uc3QgZGVzY2VuZGFudHMgPSBbLi4ucHJvY2Vzc2VzXS5maWx0ZXIoKFtjaGlsZF0pID0+IHJvb3RPZihjaGlsZCkgPT09IHBpZCkubWFwKChbY2hpbGRdKSA9PiBjaGlsZCkuc29ydCgoYSwgYikgPT4gYiAtIGEpOwogICAgICAgIGZvciAoY29uc3QgdGFyZ2V0IG9mIGRlc2NlbmRhbnRzKSB7IHRyeSB7IHByb2Nlc3Mua2lsbCh0YXJnZXQsICdTSUdURVJNJyk7IH0gY2F0Y2gge30gfQogICAgICB9CiAgICB9CiAgfQogIHJldHVybiB7IHN0YWxlUGlkcywga2VwdFBpZCB9Owp9CgpmdW5jdGlvbiB3cml0ZUxhdW5jaGVyKG1haW5CaW4pIHsKICBsZXQgY29udGVudDsKICBpZiAoaXNXaW5kb3dzKSB7CiAgICBjb250ZW50ID0gYEBlY2hvIG9mZlxyXG5zZXQgIkNMQVdHT0RfQ0xBVURFX01FTT0xIlxyXG5jYWxsICIke21haW5CaW59IiAlKlxyXG5leGl0IC9iICVFUlJPUkxFVkVMJVxyXG5gOwogIH0gZWxzZSB7CiAgICBjb25zdCBxdW90ZWQgPSBgJyR7bWFpbkJpbi5yZXBsYWNlKC8nL2csIGAnXFwnJ2ApfSdgOwogICAgY29udGVudCA9IGAjIS9iaW4vc2hcbmV4cG9ydCBDTEFXR09EX0NMQVVERV9NRU09MVxuZXhlYyAke3F1b3RlZH0gIiRAIlxuYDsKICB9CiAgdHJ5IHsgaWYgKGZzLnJlYWRGaWxlU3luYyhsYXVuY2hlclBhdGgsICd1dGY4JykgPT09IGNvbnRlbnQpIHJldHVybjsgfSBjYXRjaCB7fQogIGZzLm1rZGlyU3luYyhwYXRoLmRpcm5hbWUobGF1bmNoZXJQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7CiAgZnMud3JpdGVGaWxlU3luYyhsYXVuY2hlclBhdGgsIGNvbnRlbnQsIHsgbW9kZTogMG83MDAgfSk7CiAgaWYgKCFpc1dpbmRvd3MpIGZzLmNobW9kU3luYyhsYXVuY2hlclBhdGgsIDBvNzAwKTsKfQoKZnVuY3Rpb24gaW5zdGFsbCgpIHsKICBjb25zdCB3b3JrZXIgPSBmaW5kV29ya2VyKCk7CiAgaWYgKCFmcy5leGlzdHNTeW5jKHNldHRpbmdzUGF0aCkgJiYgIXdvcmtlcikgcmV0dXJuIGZhbHNlOwogIGNvbnN0IHNldHRpbmdzID0gcmVhZEpzb24oc2V0dGluZ3NQYXRoLCBudWxsKTsKICBpZiAoIXNldHRpbmdzKSB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZWFkIGNsYXVkZS1tZW0gc2V0dGluZ3M6ICR7c2V0dGluZ3NQYXRofWApOwogIGlmIChzZXR0aW5ncy5DTEFVREVfTUVNX1BST1ZJREVSICYmIHNldHRpbmdzLkNMQVVERV9NRU1fUFJPVklERVIgIT09ICdjbGF1ZGUnKSByZXR1cm4gZmFsc2U7CiAgY29uc3QgZ2F0ZXdheSA9IGNvbmZpZ3VyZWRHYXRld2F5KCk7CiAgaWYgKCFnYXRld2F5LmNyZWRlbnRpYWwpIHJldHVybiBmYWxzZTsKICBjb25zdCBzdGF0ZSA9IHJlYWRKc29uKHN0YXRlUGF0aCwgbnVsbCk7CiAgaWYgKHN0YXRlICYmIG1hbmFnZWRLZXlzLnNvbWUoa2V5ID0+IHNldHRpbmdzW2tleV0gIT09IHN0YXRlW2tleV0pKSByZXR1cm4gZmFsc2U7CiAgaWYgKCFmcy5leGlzdHNTeW5jKGJhY2t1cFBhdGgpKSB7CiAgICBjb25zdCBiYWNrdXAgPSB7fTsKICAgIGZvciAoY29uc3Qga2V5IG9mIG1hbmFnZWRLZXlzKSBpZiAoT2JqZWN0Lmhhc093bihzZXR0aW5ncywga2V5KSkgYmFja3VwW2tleV0gPSBzZXR0aW5nc1trZXldOwogICAgd3JpdGVKc29uKGJhY2t1cFBhdGgsIGJhY2t1cCk7CiAgfQogIGNvbnN0IGF1dGhNZXRob2QgPSBnYXRld2F5LmJhc2VVUkwgJiYgIS9hbnRocm9waWNcLmNvbS9pLnRlc3QoZ2F0ZXdheS5iYXNlVVJMKSA/ICdnYXRld2F5JyA6ICdhcGkta2V5JzsKICBjb25zdCBkZWZhdWx0QmluID0gcGF0aC5qb2luKGhvbWUsICcubG9jYWwnLCAnYmluJywgaXNXaW5kb3dzID8gJ2NsYXVkZS5jbWQnIDogJ2NsYXVkZScpOwogIGNvbnN0IHJlcXVlc3RlZEJpbiA9IHByb2Nlc3MuZW52LkNMQVdHT0RfQ0xBVURFX0JJTiB8fCBkZWZhdWx0QmluOwogIGNvbnN0IG1haW5CaW4gPSAvKD86XnxbXFwvXSljbXV4LWNsaS1zaGltcyg/OltcXC9dfCQpL2kudGVzdChyZXF1ZXN0ZWRCaW4pICYmIGZzLmV4aXN0c1N5bmMoZGVmYXVsdEJpbikgPyBkZWZhdWx0QmluIDogcmVxdWVzdGVkQmluOwogIGNvbnN0IG5leHQgPSB7IC4uLnNldHRpbmdzLCBDTEFVREVfTUVNX1BST1ZJREVSOiAnY2xhdWRlJywgQ0xBVURFX01FTV9NT0RFTDogJ2hhaWt1JywgQ0xBVURFX01FTV9DTEFVREVfQVVUSF9NRVRIT0Q6IGF1dGhNZXRob2QsIENMQVVERV9DT0RFX1BBVEg6IGxhdW5jaGVyUGF0aCB9OwogIHdyaXRlSnNvbihzZXR0aW5nc1BhdGgsIG5leHQpOwogIHdyaXRlSnNvbihzdGF0ZVBhdGgsIE9iamVjdC5mcm9tRW50cmllcyhtYW5hZ2VkS2V5cy5tYXAoa2V5ID0+IFtrZXksIG5leHRba2V5XV0pKSk7CiAgd3JpdGVMYXVuY2hlcihtYWluQmluKTsKICBjbGVhbnVwU3RhbGVDaHJvbWEoKTsKICByZXN0YXJ0V29ya2VyKCk7CiAgcmV0dXJuIHRydWU7Cn0KCmZ1bmN0aW9uIHVuaW5zdGFsbCgpIHsKICBjb25zdCBoYXNCYWNrdXAgPSBmcy5leGlzdHNTeW5jKGJhY2t1cFBhdGgpOwogIGNvbnN0IHNldHRpbmdzID0gcmVhZEpzb24oc2V0dGluZ3NQYXRoLCBudWxsKTsKICBjb25zdCBiYWNrdXAgPSByZWFkSnNvbihiYWNrdXBQYXRoLCBudWxsKTsKICBjb25zdCBzdGF0ZSA9IHJlYWRKc29uKHN0YXRlUGF0aCwgbnVsbCk7CiAgaWYgKGhhc0JhY2t1cCAmJiAoIXNldHRpbmdzIHx8ICFiYWNrdXAgfHwgIXN0YXRlKSkgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgcmVzdG9yZSBjbGF1ZGUtbWVtIHNldHRpbmdzOiAke3NldHRpbmdzUGF0aH1gKTsKICBpZiAoc2V0dGluZ3MgJiYgYmFja3VwICYmIHN0YXRlKSB7CiAgICBjb25zdCByZXN0b3JlZCA9IHsgLi4uc2V0dGluZ3MgfTsKICAgIGZvciAoY29uc3Qga2V5IG9mIG1hbmFnZWRLZXlzKSB7CiAgICAgIGlmIChzZXR0aW5nc1trZXldICE9PSBzdGF0ZVtrZXldKSBjb250aW51ZTsKICAgICAgaWYgKE9iamVjdC5oYXNPd24oYmFja3VwLCBrZXkpKSByZXN0b3JlZFtrZXldID0gYmFja3VwW2tleV07IGVsc2UgZGVsZXRlIHJlc3RvcmVkW2tleV07CiAgICB9CiAgICB3cml0ZUpzb24oc2V0dGluZ3NQYXRoLCByZXN0b3JlZCk7CiAgfQogIHRyeSB7IGZzLnVubGlua1N5bmMoYmFja3VwUGF0aCk7IH0gY2F0Y2gge30KICB0cnkgeyBmcy51bmxpbmtTeW5jKHN0YXRlUGF0aCk7IH0gY2F0Y2gge30KICB0cnkgeyBmcy51bmxpbmtTeW5jKGxhdW5jaGVyUGF0aCk7IH0gY2F0Y2gge30KICBpZiAoc2V0dGluZ3MgJiYgYmFja3VwKSByZXN0YXJ0V29ya2VyKCk7Cn0KCmNvbnN0IGNvbW1hbmQgPSBwcm9jZXNzLmFyZ3ZbMl0gfHwgJ2luc3RhbGwnOwppZiAoY29tbWFuZCA9PT0gJ2luc3RhbGwnKSBpbnN0YWxsKCk7CmVsc2UgaWYgKGNvbW1hbmQgPT09ICd1bmluc3RhbGwnKSB1bmluc3RhbGwoKTsKZWxzZSBpZiAoY29tbWFuZCA9PT0gJ2NsZWFudXAnKSBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShjbGVhbnVwU3RhbGVDaHJvbWEoKSkpOwplbHNlIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBjb21tYW5kOiAke2NvbW1hbmR9YCk7Cg==')

function Install-ClaudeMemCompatHelper {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    $helper = Join-Path $ClawDir "claude-mem-compat.cjs"
    [System.IO.File]::WriteAllBytes($helper, $ClaudeMemCompatBytes)
}

$FetchFileBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCmltcG9ydCB7IGV4aXN0c1N5bmMsIHJlbmFtZVN5bmMsIHJtU3luYyB9IGZyb20gJ25vZGU6ZnMnOwoKY29uc3QgW3VybCwgZGVzdGluYXRpb25dID0gcHJvY2Vzcy5hcmd2LnNsaWNlKDIpOwppZiAoIXVybCB8fCAhZGVzdGluYXRpb24pIHRocm93IG5ldyBFcnJvcigndXNhZ2U6IGZldGNoLWZpbGUubWpzIDx1cmw+IDxkZXN0aW5hdGlvbj4nKTsKCmZ1bmN0aW9uIG5vUHJveHlSdWxlKHZhbHVlKSB7CiAgbGV0IGVudHJ5ID0gdmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7CiAgaWYgKGVudHJ5ID09PSAnKicpIHJldHVybiB7IGFsbDogdHJ1ZSB9OwoKICBsZXQgaG9zdCA9IGVudHJ5OwogIGxldCBwb3J0ID0gJyc7CiAgaWYgKGVudHJ5LnN0YXJ0c1dpdGgoJ1snKSkgewogICAgY29uc3QgY2xvc2UgPSBlbnRyeS5pbmRleE9mKCddJyk7CiAgICBpZiAoY2xvc2UgPT09IC0xKSByZXR1cm4geyBob3N0OiBlbnRyeSwgcG9ydCB9OwogICAgaG9zdCA9IGVudHJ5LnNsaWNlKDEsIGNsb3NlKTsKICAgIGNvbnN0IHN1ZmZpeCA9IGVudHJ5LnNsaWNlKGNsb3NlICsgMSk7CiAgICBpZiAoL146XGQrJC8udGVzdChzdWZmaXgpKSBwb3J0ID0gc3VmZml4LnNsaWNlKDEpOwogICAgZWxzZSBpZiAoc3VmZml4KSByZXR1cm4geyBob3N0OiBlbnRyeSwgcG9ydCB9OwogIH0gZWxzZSB7CiAgICBjb25zdCBjb2xvbiA9IGVudHJ5Lmxhc3RJbmRleE9mKCc6Jyk7CiAgICBpZiAoY29sb24gPiAwICYmIGNvbG9uID09PSBlbnRyeS5pbmRleE9mKCc6JykgJiYgL15cZCskLy50ZXN0KGVudHJ5LnNsaWNlKGNvbG9uICsgMSkpKSB7CiAgICAgIGhvc3QgPSBlbnRyeS5zbGljZSgwLCBjb2xvbik7CiAgICAgIHBvcnQgPSBlbnRyeS5zbGljZShjb2xvbiArIDEpOwogICAgfQogIH0KICByZXR1cm4geyBob3N0OiBob3N0LnJlcGxhY2UoL15cKlwuLywgJy4nKSwgcG9ydCB9Owp9CgpmdW5jdGlvbiBieXBhc3Nlc1Byb3h5KHVybFZhbHVlKSB7CiAgY29uc3QgcGFyc2VkID0gdHlwZW9mIHVybFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBVUkwodXJsVmFsdWUpIDogdXJsVmFsdWU7CiAgY29uc3QgZW50cmllcyA9IChwcm9jZXNzLmVudi5OT19QUk9YWSB8fCBwcm9jZXNzLmVudi5ub19wcm94eSB8fCAnJykuc3BsaXQoJywnKS5maWx0ZXIodmFsdWUgPT4gdmFsdWUudHJpbSgpKTsKICBjb25zdCBob3N0ID0gcGFyc2VkLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvXlxbfFxdJC9nLCAnJyk7CiAgY29uc3QgcG9ydCA9IHBhcnNlZC5wb3J0IHx8IChwYXJzZWQucHJvdG9jb2wgPT09ICdodHRwczonID8gJzQ0MycgOiBwYXJzZWQucHJvdG9jb2wgPT09ICdodHRwOicgPyAnODAnIDogJycpOwogIHJldHVybiBlbnRyaWVzLnNvbWUoZW50cnkgPT4gewogICAgY29uc3QgcnVsZSA9IG5vUHJveHlSdWxlKGVudHJ5KTsKICAgIGlmIChydWxlLmFsbCkgcmV0dXJuIHRydWU7CiAgICBjb25zdCBiYXNlSG9zdCA9IHJ1bGUuaG9zdC5yZXBsYWNlKC9eXC4vLCAnJyk7CiAgICBjb25zdCBtYXRjaGVzSG9zdCA9IGhvc3QgPT09IGJhc2VIb3N0IHx8IGhvc3QuZW5kc1dpdGgoYC4ke2Jhc2VIb3N0fWApOwogICAgcmV0dXJuIG1hdGNoZXNIb3N0ICYmICghcnVsZS5wb3J0IHx8IHJ1bGUucG9ydCA9PT0gcG9ydCk7CiAgfSk7Cn0KCmZ1bmN0aW9uIHByb3h5Rm9yKHVybFZhbHVlKSB7CiAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmxWYWx1ZSk7CiAgaWYgKGJ5cGFzc2VzUHJveHkocGFyc2VkKSkgcmV0dXJuIHVuZGVmaW5lZDsKICByZXR1cm4gcGFyc2VkLnByb3RvY29sID09PSAnaHR0cHM6JwogICAgPyBwcm9jZXNzLmVudi5IVFRQU19QUk9YWSB8fCBwcm9jZXNzLmVudi5odHRwc19wcm94eSB8fCBwcm9jZXNzLmVudi5IVFRQX1BST1hZIHx8IHByb2Nlc3MuZW52Lmh0dHBfcHJveHkKICAgIDogcHJvY2Vzcy5lbnYuSFRUUF9QUk9YWSB8fCBwcm9jZXNzLmVudi5odHRwX3Byb3h5Owp9Cgphc3luYyBmdW5jdGlvbiBmZXRjaFdpdGhQcm94eShpbml0aWFsVXJsKSB7CiAgbGV0IG5leHRVcmwgPSBpbml0aWFsVXJsOwogIGZvciAobGV0IHJlZGlyZWN0cyA9IDA7IHJlZGlyZWN0cyA8PSA1OyByZWRpcmVjdHMrKykgewogICAgY29uc3QgcHJveHkgPSBwcm94eUZvcihuZXh0VXJsKTsKICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gobmV4dFVybCwgeyByZWRpcmVjdDogJ21hbnVhbCcsIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgzMDAwMDApLCAuLi4ocHJveHkgPyB7IHByb3h5IH0gOiB7fSkgfSk7CiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID49IDMwMCAmJiByZXNwb25zZS5zdGF0dXMgPCA0MDAgJiYgcmVzcG9uc2UuaGVhZGVycy5oYXMoJ2xvY2F0aW9uJykpIHsKICAgICAgaWYgKHJlZGlyZWN0cyA9PT0gNSkgdGhyb3cgbmV3IEVycm9yKCd0b28gbWFueSByZWRpcmVjdHMnKTsKICAgICAgbmV4dFVybCA9IG5ldyBVUkwocmVzcG9uc2UuaGVhZGVycy5nZXQoJ2xvY2F0aW9uJyksIG5leHRVcmwpLmhyZWY7CiAgICAgIGNvbnRpbnVlOwogICAgfQogICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwKSB0aHJvdyBuZXcgRXJyb3IoYGRvd25sb2FkIGZhaWxlZCB3aXRoIEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9YCk7CiAgICByZXR1cm4gcmVzcG9uc2U7CiAgfQogIHRocm93IG5ldyBFcnJvcigndG9vIG1hbnkgcmVkaXJlY3RzJyk7Cn0KCmNvbnN0IHRlbXBvcmFyeSA9IGAke2Rlc3RpbmF0aW9ufS4ke3Byb2Nlc3MucGlkfS50bXBgOwp0cnkgewogIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2hXaXRoUHJveHkodXJsKTsKICBhd2FpdCBCdW4ud3JpdGUodGVtcG9yYXJ5LCByZXNwb25zZSk7CiAgcmVuYW1lU3luYyh0ZW1wb3JhcnksIGRlc3RpbmF0aW9uKTsKfSBmaW5hbGx5IHsKICBpZiAoZXhpc3RzU3luYyh0ZW1wb3JhcnkpKSBybVN5bmModGVtcG9yYXJ5LCB7IGZvcmNlOiB0cnVlIH0pOwp9Cg==')

function Install-FetchFileHelper {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    $helper = Join-Path $ClawDir "fetch-file.mjs"
    [System.IO.File]::WriteAllBytes($helper, $FetchFileBytes)
}

function Install-ChromeFixScript {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    $dst = Join-Path $ClawDir "apply-claude-code-chrome-fix.ps1"
    $localCandidates = @()
    if ($PSScriptRoot) { $localCandidates += Join-Path $PSScriptRoot "apply-claude-code-chrome-fix.ps1" }
    $localCandidates += Join-Path (Get-Location) "apply-claude-code-chrome-fix.ps1"

    foreach ($src in $localCandidates) {
        if ($src -and (Test-Path $src)) {
            Copy-Item $src $dst -Force
            return $true
        }
    }

    try {
        & $BunBin (Join-Path $ClawDir "fetch-file.mjs") "https://raw.githubusercontent.com/A6083450/clawgod-plus/main/apply-claude-code-chrome-fix.ps1" $dst
        if ($LASTEXITCODE -ne 0) { return $false }
        return $true
    } catch {
        return $false
    }
}

function Invoke-ChromePostInstallFix {
    $script = Join-Path $ClawDir "apply-claude-code-chrome-fix.ps1"
    if (-not (Test-Path $script)) {
        if (-not (Install-ChromeFixScript)) {
            Write-Warn "Claude in Chrome post-install fix script not available; skipping"
            return
        }
    }

    $target = Join-Path $ClawDir "cli.original.cjs"
    Write-Dim "Applying Claude Code Chrome post-install fix ..."
    try {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $script -CliPath $target
        if ($LASTEXITCODE -eq 0) {
            Write-OK "Claude Code Chrome post-install fix applied"
        } else {
            Write-Warn "Claude Code Chrome post-install fix did not apply; ClawGod Plus core install will continue"
        }
    } catch {
        Write-Warn "Claude Code Chrome post-install fix failed; ClawGod Plus core install will continue"
    }
}

# ─── Colors ───────────────────────────────────────────

function Write-OK($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red }
function Write-Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Dim($msg)  { Write-Host "  $msg" -ForegroundColor DarkGray }

function Resolve-Bun {
    $candidates = @()
    try {
        $command = Get-Command bun -ErrorAction Stop
        if ($command.Source) { $candidates += $command.Source }
    } catch {}
    $candidates += @(
        (Join-Path $env:USERPROFILE ".bun\bin\bun.exe"),
        (Join-Path $env:APPDATA "npm\node_modules\bun\bin\bun.exe"),
        (Join-Path $env:USERPROFILE "scoop\shims\bun.exe"),
        (Join-Path $env:ProgramData "chocolatey\bin\bun.exe")
    )
    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (-not $candidate) { continue }
        if ($candidate -match '\.(?:cmd|bat|ps1)$') {
            $native = Join-Path (Split-Path $candidate) "node_modules\bun\bin\bun.exe"
            if (Test-Path -Path $native -PathType Leaf) { return $native }
            continue
        }
        if ($candidate -notmatch '\.exe$') { continue }
        if (Test-Path -Path $candidate -PathType Leaf) { return $candidate }
    }
    Write-Err "Bun is required. Install Bun first: https://bun.sh/install"
    return $null
}

function Test-ClaudePathPresent {
    param([string]$Path)

    try {
        $null = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Test-ClawGodLauncherContent {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if ($item.Length -gt 1048576) { return $false }
        $content = [System.IO.File]::ReadAllText($Path)
    } catch {
        return $false
    }

    # The marker identifies newer launchers, but never grants ownership alone.
    $hasExplicitMarker = $content -match '(?m)^rem CLAWGOD_LAUNCHER_V1\r?$'
    $hasStableStructure = (
        ($content -match '(?m)^@echo off\r?$') -and
        ($content -match '(?m)^setlocal\r?$') -and
        ($content -match '(?m)^if not exist ".*[\\/]\.clawgod[\\/]cli\.cjs" \(\r?$') -and
        ($content -match '(?m)^set "CLAUDE_CODE_EXECPATH=%~dp0claude\.orig\.exe"\r?$') -and
        ($content -match '(?m)^set "CLAWGOD_AUTO_CHROME=1"\r?$') -and
        ($content -match '(?m)^exit /b %ERRORLEVEL%\r?$')
    )
    if ($hasExplicitMarker -and -not $hasStableStructure) { return $false }
    return $hasStableStructure
}

function Test-ClawGodLauncher {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { return $false }
    } catch {
        return $false
    }
    return (Test-ClawGodLauncherContent $Path)
}

function Test-ValidClaudeOriginal {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    return (-not (Test-ClawGodLauncherContent $Path))
}

function Test-ClaudeLauncherConflict {
    param(
        [string]$Current,
        [string]$Original
    )

    if (-not (Test-ClaudePathPresent $Original)) { return $false }
    if ((Test-ClaudePathPresent $Current) -and -not (Test-ClawGodLauncher $Current)) {
        Write-Err "Claude launcher conflict at $Current; current command and $Original were preserved."
        Write-Err "Move or remove the third-party current command, then rerun the installer."
        return $true
    }
    if (-not (Test-ValidClaudeOriginal $Original) -and -not (Test-ClawGodLauncherContent $Original)) {
        Write-Err "Invalid original backup at $Original; operation stopped without launcher changes."
        return $true
    }
    return $false
}

function Test-ClaudeUninstallConflict {
    param(
        [string]$CurrentCmd,
        [string]$CurrentExe,
        [string]$OriginalCmd,
        [string]$OriginalExe
    )

    $hasValidOriginal = ((Test-ValidClaudeOriginal $OriginalCmd) -or
        (Test-ValidClaudeOriginal $OriginalExe))
    if (-not $hasValidOriginal) { return $false }

    $hasThirdPartyCurrent = (
        ((Test-ClaudePathPresent $CurrentCmd) -and -not (Test-ClawGodLauncher $CurrentCmd)) -or
        ((Test-ClaudePathPresent $CurrentExe) -and -not (Test-ClawGodLauncher $CurrentExe))
    )
    if ($hasThirdPartyCurrent) {
        Write-Err "Claude launcher conflict across cmd/exe slots; current commands and original backups were preserved."
        Write-Err "Move or remove the third-party current command, then rerun the uninstaller."
        return $true
    }
    return $false
}

Write-Host ""
Write-Host "  ClawGod Plus Installer" -ForegroundColor White -NoNewline
Write-Host " (Windows)" -ForegroundColor DarkGray
Write-Host ""

# ─── Uninstall ────────────────────────────────────────

if ($Uninstall) {
    $BunBin = Resolve-Bun
    if (-not $BunBin) { exit 1 }
    $claudeOrig = Join-Path $BinDir "claude.orig.cmd"
    $claudeCmd  = Join-Path $BinDir "claude.cmd"
    $claudeExeOrig = Join-Path $BinDir "claude.orig.exe"
    $claudeExe = Join-Path $BinDir "claude.exe"
    if (Test-ClaudeUninstallConflict -CurrentCmd $claudeCmd -CurrentExe $claudeExe -OriginalCmd $claudeOrig -OriginalExe $claudeExeOrig) {
        exit 1
    }
    if ((Test-ClaudeLauncherConflict -Current $claudeCmd -Original $claudeOrig) -or
        (Test-ClaudeLauncherConflict -Current $claudeExe -Original $claudeExeOrig)) {
        exit 1
    }
    # Restore optional Claude plugin integrations before any managed cleanup.
    $pluginDependencies = Join-Path $ClawDir "plugin-dependencies.mjs"
    $pluginState = Join-Path $ClawDir "plugin-dependencies-state.json"
    if ((Test-Path $pluginState) -and -not (Test-Path $pluginDependencies)) {
        Write-Warn "Could not restore optional Claude plugin integrations; ClawGod Plus was not uninstalled"
        exit 1
    }
    if (Test-Path $pluginDependencies) {
        $hadPluginBun = Test-Path Env:CLAWGOD_BUN_BIN
        $previousPluginBun = $env:CLAWGOD_BUN_BIN
        $hadPluginDir = Test-Path Env:CLAWGOD_DIR
        $previousPluginDir = $env:CLAWGOD_DIR
        $pluginRestoreFailed = $false
        try {
            $env:CLAWGOD_BUN_BIN = $BunBin
            $env:CLAWGOD_DIR = $ClawDir
            & $BunBin $pluginDependencies uninstall
            if ($LASTEXITCODE -ne 0) { throw "optional plugin restore exited $LASTEXITCODE" }
        } catch {
            Write-Warn "Could not restore optional Claude plugin integrations; ClawGod Plus was not uninstalled"
            $pluginRestoreFailed = $true
        } finally {
            if ($hadPluginBun) { $env:CLAWGOD_BUN_BIN = $previousPluginBun }
            else { Remove-Item Env:CLAWGOD_BUN_BIN -ErrorAction SilentlyContinue }
            if ($hadPluginDir) { $env:CLAWGOD_DIR = $previousPluginDir }
            else { Remove-Item Env:CLAWGOD_DIR -ErrorAction SilentlyContinue }
        }
        if ($pluginRestoreFailed) { exit 1 }
    }
    $claudeMemCompat = Join-Path $ClawDir "claude-mem-compat.cjs"
    if (Test-Path $claudeMemCompat) {
        try {
            $env:CLAWGOD_BUN_BIN = $BunBin
            & $BunBin "$ClawDir\claude-mem-compat.cjs" uninstall
            if ($LASTEXITCODE -ne 0) { throw "claude-mem compatibility helper exited $LASTEXITCODE" }
        } catch {
            Write-Warn "Could not restore claude-mem compatibility settings; ClawGod Plus was not uninstalled"
            exit 1
        }
    }
    # Restore original claude
    if (Test-ValidClaudeOriginal $claudeOrig) {
        if (Test-ClawGodLauncher $claudeCmd) { Remove-Item -LiteralPath $claudeCmd -Force }
        Move-Item -Force $claudeOrig $claudeCmd
        Write-OK "Original claude restored"
    } elseif (Test-ClawGodLauncherContent $claudeOrig) {
        if (Test-ClawGodLauncher $claudeCmd) { Remove-Item -LiteralPath $claudeCmd -Force }
        Remove-Item -LiteralPath $claudeOrig -Force
        Write-Warn "Removed installer-owned polluted backup ($claudeOrig)"
    } elseif ((Test-ClaudePathPresent $claudeCmd) -and (Test-ClawGodLauncher $claudeCmd)) {
        Remove-Item -Force $claudeCmd
        Write-OK "Removed ClawGod Plus launcher ($claudeCmd)"
    }
    # Also check for .exe backup
    if (Test-ValidClaudeOriginal $claudeExeOrig) {
        if (Test-ClawGodLauncher $claudeExe) { Remove-Item -LiteralPath $claudeExe -Force }
        Move-Item -Force $claudeExeOrig $claudeExe
        Write-OK "Original claude.exe restored"
    } elseif (Test-ClawGodLauncherContent $claudeExeOrig) {
        if (Test-ClawGodLauncher $claudeExe) { Remove-Item -LiteralPath $claudeExe -Force }
        Remove-Item -LiteralPath $claudeExeOrig -Force
        Write-Warn "Removed installer-owned polluted backup ($claudeExeOrig)"
    } elseif ((Test-ClaudePathPresent $claudeExe) -and (Test-ClawGodLauncher $claudeExe)) {
        Remove-Item -LiteralPath $claudeExe -Force
        Write-OK "Removed ClawGod Plus launcher ($claudeExe)"
    }
    # Remove explicit clawgod alias
    $clawgodCmd = Join-Path $BinDir "clawgod.cmd"
    if ((Test-Path $clawgodCmd) -and (Test-ClawGodLauncher $clawgodCmd)) {
        Remove-Item -Force $clawgodCmd
        Write-OK "Removed clawgod alias"
    }

    foreach ($f in @("cli.js","cli.cjs","cli.original.js","cli.original.cjs","cli.original.js.bak","cli.original.cjs.bak","patch.js","patch.mjs","extract-natives.mjs","post-process.mjs","repatch.mjs","openai-proxy.cjs","fetch-file.mjs","install-ripgrep.mjs","clawgod-import.exe","apply-claude-code-chrome-fix.ps1","claude-mem-compat.cjs","claude-mem.cmd","plugin-dependencies.mjs","claude-hud-statusline.mjs","plugin-dependencies-state.json","cache\claude-plugins","staging\claude-plugins",".source-version",".clawgod-version",".update-check","node_modules","bun-runtime","vendor")) {
        $p = Join-Path $ClawDir $f
        if (Test-Path $p) { Remove-Item -Recurse -Force $p }
    }
    Write-OK "ClawGod Plus uninstalled"
    Write-Host ""
    Write-Dim "Restart your terminal for changes to take effect."
    Write-Host ""
    exit 0
}

# ─── Bun prerequisite ──────────────────────────────────

$BunBin = Resolve-Bun
if (-not $BunBin) { exit 1 }
Write-OK "Bun: $(& $BunBin --version)"

# ─── Bun version pre-flight ───────────────────────────────────────────
# Anthropic builds the native binary with Bun's canary channel; stable
# bun.sh trails by one version. Bun < 1.3.14 panics on cli.original.cjs
# with "Expected CommonJS module to have a function wrapper". Refuse
# early — no npm download / no patch / no late sanity surprise where
# PowerShell's NativeCommandError display buries the friendly message.
# Bump $MinBunVersion when Anthropic moves the embedded Bun forward
# again.

$MinBunVersion = '1.3.14'
$BunVersionRaw = ''
try {
    $bunOut = & $BunBin --version 2>$null | Select-Object -First 1
    if ($bunOut) { $BunVersionRaw = "$bunOut".Trim() }
} catch {}
$BunVersionNum = ($BunVersionRaw -split '-')[0]
$BunVersionOk = $false
try {
    if ($BunVersionNum) {
        $BunVersionOk = ([version]$BunVersionNum) -ge ([version]$MinBunVersion)
    }
} catch {}
if (-not $BunVersionOk) {
    Write-Host ""
    Write-Err "Bun $BunVersionRaw is below the required minimum ($MinBunVersion)."
    Write-Err ""
    Write-Err "  Anthropic builds claude-code with Bun's canary channel. Older Bun"
    Write-Err "  panics on cli.original.cjs with 'Expected CommonJS module to have"
    Write-Err "  a function wrapper'. This is a hard requirement, not a warning."
    Write-Err ""
    Write-Err "  Upgrade with one of:"
    Write-Err "    bun upgrade --canary"
    Write-Err "    powershell -c ""iex & {`$(irm https://bun.sh/install.ps1)} -Version canary"""
    Write-Err ""
    Write-Err "  If your bun is from scoop (the binary is behind a shim and refuses"
    Write-Err "  to self-replace, so 'bun upgrade' silently hangs):"
    Write-Err "    scoop uninstall bun"
    Write-Err "    irm https://bun.sh/install.ps1 | iex"
    Write-Err "    bun upgrade --canary"
    Write-Err ""
    Write-Err "  Then re-run this installer."
    exit 1
}

Install-FetchFileHelper

# --- Optional Claude plugin dependencies -----------------------------

$PluginDependenciesBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCi8qKgogKiBAdHlwZWRlZiB7ewogKiAgIGhvbWU6IHN0cmluZywKICogICBjbGF1ZGVDb25maWdEaXI6IHN0cmluZywKICogICBjbGF3Z29kRGlyOiBzdHJpbmcsCiAqICAgYnVuUGF0aDogc3RyaW5nLAogKiAgIGNsYXVkZUNsaVBhdGg6IHN0cmluZywKICogICBmZXRjaEZpbGVQYXRoOiBzdHJpbmcsCiAqICAgZW52OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+LAogKiAgIHNwYXduU3luY0ltcGw6IHR5cGVvZiBCdW4uc3Bhd25TeW5jLAogKiAgIG9uTWFuYWdlZERpcmVjdG9yeVB1Ymxpc2hpbmc/OiAodHJhbnNhY3Rpb246IG9iamVjdCkgPT4gdm9pZCwKICogICBvbk1hbmFnZWREaXJlY3RvcnlJbnN0YWxsZWQ/OiAodHJhbnNhY3Rpb246IG9iamVjdCkgPT4gdm9pZCwKICogICBvblBlcnNpc3RlbnRUcmFuc2FjdGlvblByZXBhcmVkPzogKHRyYW5zYWN0aW9uOiBvYmplY3QpID0+IHZvaWQsCiAqICAgb25DYWNoZVF1YXJhbnRpbmVkPzogKHRyYW5zYWN0aW9uOiBvYmplY3QpID0+IHZvaWQsCiAqICAgb25DYWNoZUZhaWxlZEluc3BlY3RlZD86ICh0cmFuc2FjdGlvbjogb2JqZWN0KSA9PiB2b2lkLAogKiAgIG9uQ2FjaGVDbGVhbnVwSW52ZW50b3JpZWQ/OiAodHJhbnNhY3Rpb246IG9iamVjdCkgPT4gdm9pZCwKICogICBvbkh1ZFdyaXRpbmc/OiAod3JpdGU6IHsgbGFiZWw6IHN0cmluZyB9KSA9PiB2b2lkLAogKiAgIG9uSHVkV3JpdHRlbj86ICh3cml0ZTogeyBsYWJlbDogc3RyaW5nIH0pID0+IHZvaWQsCiAqICAgb25IdWRSZXN0b3Jpbmc/OiAod3JpdGU6IHsgbGFiZWw6IHN0cmluZyB9KSA9PiB2b2lkLAogKiAgIG9uSHVkUmVzdG9yZWQ/OiAod3JpdGU6IHsgbGFiZWw6IHN0cmluZyB9KSA9PiB2b2lkLAogKiAgIG9uQ2xhdWRlTWVtV3JpdGluZz86ICh3cml0ZTogeyByZWxhdGl2ZVBhdGg6IHN0cmluZyB9KSA9PiB2b2lkLAogKiAgIG9uQ2xhdWRlTWVtV3JpdHRlbj86ICh3cml0ZTogeyByZWxhdGl2ZVBhdGg6IHN0cmluZyB9KSA9PiB2b2lkLAogKiB9fSBQbHVnaW5Db250ZXh0CiAqLwoKaW1wb3J0IHsgY2htb2RTeW5jLCBjbG9zZVN5bmMsIGV4aXN0c1N5bmMsIGZzdGF0U3luYywgZnN5bmNTeW5jLCBsc3RhdFN5bmMsIG1rZGlyU3luYywgbWtkdGVtcFN5bmMsIG9wZW5TeW5jLCByZWFkZGlyU3luYywgcmVhZEZpbGVTeW5jLCByZWFscGF0aFN5bmMsIHJlbmFtZVN5bmMsIHJtZGlyU3luYywgcm1TeW5jLCB1bmxpbmtTeW5jLCB3cml0ZVN5bmMgfSBmcm9tICdub2RlOmZzJzsKaW1wb3J0IHsgaG9tZWRpciB9IGZyb20gJ25vZGU6b3MnOwppbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgaXNBYnNvbHV0ZSwgam9pbiwgcmVsYXRpdmUsIHJlc29sdmUsIHNlcCB9IGZyb20gJ25vZGU6cGF0aCc7CgpleHBvcnQgY29uc3QgUExVR0lOX0JBU0VMSU5FUyA9IE9iamVjdC5mcmVlemUoewogIGh1ZDogT2JqZWN0LmZyZWV6ZSh7CiAgICBrZXk6ICdodWQnLCBpZDogJ2NsYXVkZS1odWRAY2xhdWRlLWh1ZCcsIG1hcmtldHBsYWNlOiAnY2xhdWRlLWh1ZCcsIHBsdWdpbjogJ2NsYXVkZS1odWQnLAogICAgdmVyc2lvbjogJzAuNy4wJywgYnl0ZXM6IDc1NDQ0MywKICAgIHNoYTI1NjogJzU5YmQzZWMxN2U3YjkxODFkODA2OWM5M2NjN2M1ZTFkYjhiMWQzM2U2YTk0ZTQwNDFmNjU4OWRkOGI4N2M5MTInLAogICAgdXJsOiAnaHR0cHM6Ly9odWIuMjExMTA3Lnh5ei9odHRwczovL2dpdGh1Yi5jb20vamFycm9kd2F0dHMvY2xhdWRlLWh1ZC9hcmNoaXZlL3JlZnMvdGFncy92MC43LjAudGFyLmd6JywKICB9KSwKICBtZW1vcnk6IE9iamVjdC5mcmVlemUoewogICAga2V5OiAnbWVtb3J5JywgaWQ6ICdjbGF1ZGUtbWVtQHRoZWRvdG1hY2snLCBtYXJrZXRwbGFjZTogJ3RoZWRvdG1hY2snLCBwbHVnaW46ICdjbGF1ZGUtbWVtJywKICAgIHZlcnNpb246ICcxMy4xNC4wJywgYnl0ZXM6IDExODE3MzQ3LAogICAgc2hhMjU2OiAnYTY0ZjdkZDAzODMwOGRhMGRiNTJmMTBkOGY0ZmMyYjNiM2FjZmVjNWQ5ZGRmZGNmZWE5ZjZlNDczZTU0YmVkMCcsCiAgICB1cmw6ICdodHRwczovL2h1Yi4yMTExMDcueHl6L2h0dHBzOi8vZ2l0aHViLmNvbS90aGVkb3RtYWNrL2NsYXVkZS1tZW0vYXJjaGl2ZS9yZWZzL3RhZ3MvdjEzLjE0LjAudGFyLmd6JywKICB9KSwKICBzdXBlcnBvd2VyczogT2JqZWN0LmZyZWV6ZSh7CiAgICBrZXk6ICdzdXBlcnBvd2VycycsIGlkOiAnc3VwZXJwb3dlcnNAc3VwZXJwb3dlcnMtbWFya2V0cGxhY2UnLCBtYXJrZXRwbGFjZTogJ3N1cGVycG93ZXJzLW1hcmtldHBsYWNlJywgcGx1Z2luOiAnc3VwZXJwb3dlcnMnLAogICAgYXJjaGl2ZU1hcmtldHBsYWNlOiAnc3VwZXJwb3dlcnMtZGV2JywKICAgIHZlcnNpb246ICc2LjIuMCcsIGJ5dGVzOiA1MTY0MDEsCiAgICBzaGEyNTY6ICc0NjgyNDZhN2I0OTgxZDRjMDE0YzJiNThkOWVlNTM4NzAwZmZkZWQwNzUyNzlkNTgxMDA1OWNkYzFhYmViNWYzJywKICAgIHVybDogJ2h0dHBzOi8vaHViLjIxMTEwNy54eXovaHR0cHM6Ly9naXRodWIuY29tL29icmEvc3VwZXJwb3dlcnMvYXJjaGl2ZS9yZWZzL3RhZ3MvdjYuMi4wLnRhci5neicsCiAgfSksCn0pOwoKY29uc3QgTUFYX0FSQ0hJVkVfQllURVMgPSA2NCAqIDEwMjQgKiAxMDI0Owpjb25zdCBNQVhfRU5UUllfQllURVMgPSA2NCAqIDEwMjQgKiAxMDI0Owpjb25zdCBNQVhfRVhQQU5ERURfQllURVMgPSA1MTIgKiAxMDI0ICogMTAyNDsKY29uc3QgTUFYX0VOVFJJRVMgPSA1MF8wMDA7CmNvbnN0IFRBUl9CTE9DS19CWVRFUyA9IDUxMjsKY29uc3QgdGV4dERlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoJ3V0Zi04JywgeyBmYXRhbDogdHJ1ZSB9KTsKCmV4cG9ydCBjb25zdCBIVURfQ09ORklHX1RFWFQgPSBgewogICJsYW5ndWFnZSI6ICJ6aCIsCiAgImxpbmVMYXlvdXQiOiAiY29tcGFjdCIsCiAgInBhdGhMZXZlbHMiOiAxLAogICJlbGVtZW50T3JkZXIiOiBbInByb2plY3QiLCAidG9vbHMiLCAiY29udGV4dCIsICJ1c2FnZSIsICJtZW1vcnkiLCAiZW52aXJvbm1lbnQiLCAiYWdlbnRzIiwgInRvZG9zIiwgInNlc3Npb25UaW1lIl0sCiAgImdpdFN0YXR1cyI6IHsKICAgICJlbmFibGVkIjogdHJ1ZSwKICAgICJzaG93RGlydHkiOiB0cnVlLAogICAgInNob3dBaGVhZEJlaGluZCI6IHRydWUsCiAgICAic2hvd0ZpbGVTdGF0cyI6IHRydWUKICB9LAogICJkaXNwbGF5IjogewogICAgInNob3dNb2RlbCI6IHRydWUsCiAgICAic2hvd0FkZGVkRGlycyI6IHRydWUsCiAgICAiYWRkZWREaXJzTGF5b3V0IjogImxpbmUiLAogICAgInNob3dDb250ZXh0QmFyIjogdHJ1ZSwKICAgICJjb250ZXh0VmFsdWUiOiAidG9rZW5zIiwKICAgICJzaG93Q29uZmlnQ291bnRzIjogdHJ1ZSwKICAgICJzaG93Q29zdCI6IHRydWUsCiAgICAic2hvd0R1cmF0aW9uIjogdHJ1ZSwKICAgICJzaG93U3BlZWQiOiB0cnVlLAogICAgInNob3dVc2FnZSI6IHRydWUsCiAgICAic2hvd1Rvb2xzIjogdHJ1ZSwKICAgICJzaG93QWdlbnRzIjogdHJ1ZSwKICAgICJzaG93VG9kb3MiOiB0cnVlLAogICAgInNob3dUb2tlbkJyZWFrZG93biI6IHRydWUsCiAgICAidXNhZ2VCYXJFbmFibGVkIjogdHJ1ZQogIH0sCiAgImNvbG9ycyI6IHsKICAgICJjb250ZXh0IjogImdyZWVuIiwKICAgICJ1c2FnZSI6ICJicmlnaHRCbHVlIiwKICAgICJ3YXJuaW5nIjogInllbGxvdyIsCiAgICAidXNhZ2VXYXJuaW5nIjogImJyaWdodE1hZ2VudGEiLAogICAgImNyaXRpY2FsIjogInJlZCIsCiAgICAibW9kZWwiOiAiY3lhbiIsCiAgICAicHJvamVjdCI6ICJ5ZWxsb3ciLAogICAgImdpdCI6ICJtYWdlbnRhIiwKICAgICJnaXRCcmFuY2giOiAiY3lhbiIsCiAgICAibGFiZWwiOiAiI2ZmNGZjMiIsCiAgICAiY3VzdG9tIjogIiNGRjY2MDAiCiAgfQp9CmA7CgpmdW5jdGlvbiBwYXRoSXNDb250YWluZWQocm9vdCwgcGF0aCkgewogIGNvbnN0IGNoaWxkID0gcmVsYXRpdmUocm9vdCwgcGF0aCk7CiAgcmV0dXJuIGNoaWxkID09PSAnJyB8fCAoIWNoaWxkLnN0YXJ0c1dpdGgoYC4uJHtzZXB9YCkgJiYgY2hpbGQgIT09ICcuLicgJiYgIWlzQWJzb2x1dGUoY2hpbGQpKTsKfQoKZnVuY3Rpb24gaHVkRGlyZWN0b3J5Q2hhaW5Jc1NhZmUocm9vdCwgdGFyZ2V0KSB7CiAgaWYgKCFwYXRoSXNDb250YWluZWQocm9vdCwgdGFyZ2V0KSkgcmV0dXJuIGZhbHNlOwogIGxldCBjdXJyZW50ID0gcm9vdDsKICBmb3IgKGNvbnN0IHBhcnQgb2YgWycnLCAuLi5yZWxhdGl2ZShyb290LCB0YXJnZXQpLnNwbGl0KHNlcCkuZmlsdGVyKEJvb2xlYW4pXSkgewogICAgaWYgKHBhcnQpIGN1cnJlbnQgPSBqb2luKGN1cnJlbnQsIHBhcnQpOwogICAgdHJ5IHsKICAgICAgY29uc3Qgc3RhdHVzID0gbHN0YXRTeW5jKGN1cnJlbnQpOwogICAgICBpZiAoc3RhdHVzLmlzU3ltYm9saWNMaW5rKCkgfHwgIXN0YXR1cy5pc0RpcmVjdG9yeSgpKSByZXR1cm4gZmFsc2U7CiAgICB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9CiAgfQogIHJldHVybiB0cnVlOwp9CgpmdW5jdGlvbiBodWRGaWxlU25hcHNob3Qocm9vdCwgcGF0aCwgbGFiZWwsIHBhcnNlSnNvbiA9IGZhbHNlKSB7CiAgaWYgKCFpc0Fic29sdXRlKHJvb3QpIHx8ICFpc0Fic29sdXRlKHBhdGgpIHx8ICFwYXRoSXNDb250YWluZWQocm9vdCwgcGF0aCkpIHsKICAgIHRocm93IG5ldyBFcnJvcihgaHVkOiB1bnNhZmUgJHtsYWJlbH0gcGF0aGApOwogIH0KICBjb25zdCBwYXRoUGFydHMgPSByZWxhdGl2ZShyb290LCBkaXJuYW1lKHBhdGgpKS5zcGxpdChzZXApLmZpbHRlcihCb29sZWFuKTsKICBsZXQgY3VycmVudCA9IHJvb3Q7CiAgZm9yIChjb25zdCBwYXJ0IG9mIFsnJywgLi4ucGF0aFBhcnRzXSkgewogICAgaWYgKHBhcnQpIGN1cnJlbnQgPSBqb2luKGN1cnJlbnQsIHBhcnQpOwogICAgbGV0IHN0YXR1czsKICAgIHRyeSB7IHN0YXR1cyA9IGxzdGF0U3luYyhjdXJyZW50KTsgfSBjYXRjaCB7IHRocm93IG5ldyBFcnJvcihgaHVkOiB1bnNhZmUgJHtsYWJlbH0gYW5jZXN0b3JgKTsgfQogICAgaWYgKHN0YXR1cy5pc1N5bWJvbGljTGluaygpIHx8ICFzdGF0dXMuaXNEaXJlY3RvcnkoKSB8fCAoc3RhdHVzLm1vZGUgJiAwbzAyMikgIT09IDApIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKGBodWQ6IHVuc2FmZSAke2xhYmVsfSBhbmNlc3RvcmApOwogICAgfQogIH0KICBjb25zdCBwYXJlbnRTdGF0dXMgPSBsc3RhdFN5bmMoZGlybmFtZShwYXRoKSk7CiAgbGV0IHN0YXR1czsKICB0cnkgeyBzdGF0dXMgPSBsc3RhdFN5bmMocGF0aCk7IH0gY2F0Y2ggKGVycm9yKSB7CiAgICBpZiAoZXJyb3I/LmNvZGUgPT09ICdFTk9FTlQnKSB7CiAgICAgIHJldHVybiB7IHBhdGgsIHByZXNlbnQ6IGZhbHNlLCBieXRlczogbnVsbCwgbW9kZTogbnVsbCwgbmxpbms6IG51bGwsIGlkZW50aXR5OiBudWxsLCBwYXJlbnRJZGVudGl0eTogeyBkZXY6IHBhcmVudFN0YXR1cy5kZXYsIGlubzogcGFyZW50U3RhdHVzLmlubyB9IH07CiAgICB9CiAgICB0aHJvdyBuZXcgRXJyb3IoYGh1ZDogdW5zYWZlICR7bGFiZWx9YCk7CiAgfQogIGlmIChzdGF0dXMuaXNTeW1ib2xpY0xpbmsoKSB8fCAhc3RhdHVzLmlzRmlsZSgpIHx8IChzdGF0dXMubW9kZSAmIDBvMDIyKSAhPT0gMCkgewogICAgdGhyb3cgbmV3IEVycm9yKGBodWQ6IHVuc2FmZSAke2xhYmVsfWApOwogIH0KICBjb25zdCBieXRlcyA9IHJlYWRGaWxlU3luYyhwYXRoKTsKICBsZXQgdmFsdWU7CiAgaWYgKHBhcnNlSnNvbikgewogICAgdHJ5IHsgdmFsdWUgPSBKU09OLnBhcnNlKHRleHREZWNvZGVyLmRlY29kZShieXRlcykpOyB9IGNhdGNoIHsgdGhyb3cgbmV3IEVycm9yKGBodWQ6IGludmFsaWQgJHtsYWJlbH0gSlNPTmApOyB9CiAgICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcihgaHVkOiBpbnZhbGlkICR7bGFiZWx9IEpTT05gKTsKICB9CiAgcmV0dXJuIHsKICAgIHBhdGgsIHByZXNlbnQ6IHRydWUsIGJ5dGVzLCB2YWx1ZSwgbW9kZTogc3RhdHVzLm1vZGUgJiAwbzc3Nywgbmxpbms6IHN0YXR1cy5ubGluaywKICAgIGlkZW50aXR5OiB7IGRldjogc3RhdHVzLmRldiwgaW5vOiBzdGF0dXMuaW5vIH0sCiAgICBwYXJlbnRJZGVudGl0eTogeyBkZXY6IHBhcmVudFN0YXR1cy5kZXYsIGlubzogcGFyZW50U3RhdHVzLmlubyB9LAogIH07Cn0KCmZ1bmN0aW9uIGFzc2VydEh1ZFNuYXBzaG90Q3VycmVudChzbmFwc2hvdCwgcm9vdCwgbGFiZWwpIHsKICBjb25zdCBjdXJyZW50ID0gaHVkRmlsZVNuYXBzaG90KHJvb3QsIHNuYXBzaG90LnBhdGgsIGxhYmVsLCBmYWxzZSk7CiAgaWYgKGN1cnJlbnQucHJlc2VudCAhPT0gc25hcHNob3QucHJlc2VudAogICAgfHwgKGN1cnJlbnQucHJlc2VudCAmJiAoY3VycmVudC5pZGVudGl0eS5kZXYgIT09IHNuYXBzaG90LmlkZW50aXR5LmRldiB8fCBjdXJyZW50LmlkZW50aXR5LmlubyAhPT0gc25hcHNob3QuaWRlbnRpdHkuaW5vKSkKICAgIHx8IChjdXJyZW50LnByZXNlbnQgJiYgKGN1cnJlbnQubW9kZSAhPT0gc25hcHNob3QubW9kZSB8fCBjdXJyZW50Lm5saW5rICE9PSBzbmFwc2hvdC5ubGluayB8fCAhQnVmZmVyLmZyb20oY3VycmVudC5ieXRlcykuZXF1YWxzKEJ1ZmZlci5mcm9tKHNuYXBzaG90LmJ5dGVzKSkpKQogICAgfHwgY3VycmVudC5wYXJlbnRJZGVudGl0eS5kZXYgIT09IHNuYXBzaG90LnBhcmVudElkZW50aXR5LmRldgogICAgfHwgY3VycmVudC5wYXJlbnRJZGVudGl0eS5pbm8gIT09IHNuYXBzaG90LnBhcmVudElkZW50aXR5LmlubykgewogICAgdGhyb3cgbmV3IEVycm9yKGBodWQ6ICR7bGFiZWx9IGNoYW5nZWQgZHVyaW5nIHVwZGF0ZWApOwogIH0KfQoKZnVuY3Rpb24gYXRvbWljSHVkV3JpdGUocm9vdCwgc25hcHNob3QsIGJ5dGVzLCB0YXJnZXRNb2RlLCBsYWJlbCkgewogIGNvbnN0IHRlbXBvcmFyeSA9IGpvaW4oZGlybmFtZShzbmFwc2hvdC5wYXRoKSwgYC4ke2Jhc2VuYW1lKHNuYXBzaG90LnBhdGgpfS4ke3Byb2Nlc3MucGlkfS4ke2NyeXB0by5yYW5kb21VVUlEKCl9LnRtcGApOwogIGxldCBkZXNjcmlwdG9yID0gbnVsbDsKICB0cnkgewogICAgZGVzY3JpcHRvciA9IG9wZW5TeW5jKHRlbXBvcmFyeSwgJ3d4JywgMG82MDApOwogICAgbGV0IG9mZnNldCA9IDA7CiAgICB3aGlsZSAob2Zmc2V0IDwgYnl0ZXMuYnl0ZUxlbmd0aCkgb2Zmc2V0ICs9IHdyaXRlU3luYyhkZXNjcmlwdG9yLCBieXRlcywgb2Zmc2V0LCBieXRlcy5ieXRlTGVuZ3RoIC0gb2Zmc2V0KTsKICAgIGZzeW5jU3luYyhkZXNjcmlwdG9yKTsKICAgIGNsb3NlU3luYyhkZXNjcmlwdG9yKTsKICAgIGRlc2NyaXB0b3IgPSBudWxsOwogICAgY2htb2RTeW5jKHRlbXBvcmFyeSwgdGFyZ2V0TW9kZSk7CiAgICBhc3NlcnRIdWRTbmFwc2hvdEN1cnJlbnQoc25hcHNob3QsIHJvb3QsIGxhYmVsKTsKICAgIGNvbnN0IHRlbXBvcmFyeVN0YXR1cyA9IGxzdGF0U3luYyh0ZW1wb3JhcnkpOwogICAgaWYgKHRlbXBvcmFyeVN0YXR1cy5pc1N5bWJvbGljTGluaygpIHx8ICF0ZW1wb3JhcnlTdGF0dXMuaXNGaWxlKCkpIHRocm93IG5ldyBFcnJvcihgaHVkOiB1bnNhZmUgdGVtcG9yYXJ5ICR7bGFiZWx9YCk7CiAgICByZW5hbWVTeW5jKHRlbXBvcmFyeSwgc25hcHNob3QucGF0aCk7CiAgfSBmaW5hbGx5IHsKICAgIGlmIChkZXNjcmlwdG9yICE9PSBudWxsKSBjbG9zZVN5bmMoZGVzY3JpcHRvcik7CiAgICB0cnkgeyB1bmxpbmtTeW5jKHRlbXBvcmFyeSk7IH0gY2F0Y2ggKGVycm9yKSB7IGlmIChlcnJvcj8uY29kZSAhPT0gJ0VOT0VOVCcpIHRocm93IGVycm9yOyB9CiAgfQp9CgpmdW5jdGlvbiBwbGFuSHVkQ29uZmlnU25hcHNob3Qocm9vdCwgcGF0aCkgewogIGNvbnN0IHBhcmVudCA9IGRpcm5hbWUocGF0aCk7CiAgdHJ5IHsKICAgIHJldHVybiB7IHNuYXBzaG90OiBodWRGaWxlU25hcHNob3Qocm9vdCwgcGF0aCwgJ0hVRCBjb25maWcnKSwgbWlzc2luZ1BhcmVudDogbnVsbCB9OwogIH0gY2F0Y2ggKGVycm9yKSB7CiAgICB0cnkgeyBsc3RhdFN5bmMocGFyZW50KTsgdGhyb3cgZXJyb3I7IH0gY2F0Y2ggKHBhcmVudEVycm9yKSB7CiAgICAgIGlmIChwYXJlbnRFcnJvcj8uY29kZSAhPT0gJ0VOT0VOVCcpIHRocm93IGVycm9yOwogICAgfQogICAgY29uc3QgZ3JhbmRwYXJlbnQgPSBkaXJuYW1lKHBhcmVudCk7CiAgICBpZiAoIWh1ZERpcmVjdG9yeUNoYWluSXNTYWZlKHJvb3QsIGdyYW5kcGFyZW50KSkgdGhyb3cgbmV3IEVycm9yKCdodWQ6IHVuc2FmZSBIVUQgY29uZmlnIGFuY2VzdG9yJyk7CiAgICBjb25zdCBzdGF0dXMgPSBsc3RhdFN5bmMoZ3JhbmRwYXJlbnQpOwogICAgcmV0dXJuIHsgc25hcHNob3Q6IG51bGwsIG1pc3NpbmdQYXJlbnQ6IHsgcGF0aDogcGFyZW50LCBwYXJlbnRJZGVudGl0eTogeyBkZXY6IHN0YXR1cy5kZXYsIGlubzogc3RhdHVzLmlubyB9IH0gfTsKICB9Cn0KCmZ1bmN0aW9uIGNyZWF0ZUh1ZENvbmZpZ1BhcmVudChyb290LCBwbGFuKSB7CiAgaWYgKCFwbGFuLm1pc3NpbmdQYXJlbnQpIHJldHVybiB7IHNuYXBzaG90OiBwbGFuLnNuYXBzaG90LCBjcmVhdGVkUGFyZW50OiBudWxsIH07CiAgY29uc3QgcGFyZW50ID0gcGxhbi5taXNzaW5nUGFyZW50LnBhdGg7CiAgY29uc3QgZ3JhbmRwYXJlbnQgPSBkaXJuYW1lKHBhcmVudCk7CiAgaWYgKCFodWREaXJlY3RvcnlDaGFpbklzU2FmZShyb290LCBncmFuZHBhcmVudCkpIHRocm93IG5ldyBFcnJvcignaHVkOiB1bnNhZmUgSFVEIGNvbmZpZyBhbmNlc3RvcicpOwogIGNvbnN0IHN0YXR1cyA9IGxzdGF0U3luYyhncmFuZHBhcmVudCk7CiAgaWYgKHN0YXR1cy5kZXYgIT09IHBsYW4ubWlzc2luZ1BhcmVudC5wYXJlbnRJZGVudGl0eS5kZXYgfHwgc3RhdHVzLmlubyAhPT0gcGxhbi5taXNzaW5nUGFyZW50LnBhcmVudElkZW50aXR5LmlubykgewogICAgdGhyb3cgbmV3IEVycm9yKCdodWQ6IEhVRCBjb25maWcgYW5jZXN0b3IgY2hhbmdlZCBkdXJpbmcgdXBkYXRlJyk7CiAgfQogIHRyeSB7IGxzdGF0U3luYyhwYXJlbnQpOyB0aHJvdyBuZXcgRXJyb3IoJ2h1ZDogSFVEIGNvbmZpZyBwYXJlbnQgY2hhbmdlZCBkdXJpbmcgdXBkYXRlJyk7IH0KICBjYXRjaCAoZXJyb3IpIHsgaWYgKGVycm9yPy5jb2RlICE9PSAnRU5PRU5UJykgdGhyb3cgZXJyb3I7IH0KICBta2RpclN5bmMocGFyZW50LCAwbzcwMCk7CiAgY29uc3QgY3JlYXRlZCA9IGxzdGF0U3luYyhwYXJlbnQpOwogIGlmIChjcmVhdGVkLmlzU3ltYm9saWNMaW5rKCkgfHwgIWNyZWF0ZWQuaXNEaXJlY3RvcnkoKSkgdGhyb3cgbmV3IEVycm9yKCdodWQ6IHVuc2FmZSBjcmVhdGVkIEhVRCBjb25maWcgcGFyZW50Jyk7CiAgcmV0dXJuIHsgc25hcHNob3Q6IGh1ZEZpbGVTbmFwc2hvdChyb290LCBqb2luKHBhcmVudCwgJ2NvbmZpZy5qc29uJyksICdIVUQgY29uZmlnJyksIGNyZWF0ZWRQYXJlbnQ6IHsgcGF0aDogcGFyZW50LCBkZXY6IGNyZWF0ZWQuZGV2LCBpbm86IGNyZWF0ZWQuaW5vIH0gfTsKfQoKZnVuY3Rpb24gcmVtb3ZlQ3JlYXRlZEh1ZENvbmZpZ1BhcmVudChjcmVhdGVkUGFyZW50KSB7CiAgaWYgKCFjcmVhdGVkUGFyZW50KSByZXR1cm47CiAgY29uc3Qgc3RhdHVzID0gbHN0YXRTeW5jKGNyZWF0ZWRQYXJlbnQucGF0aCk7CiAgaWYgKHN0YXR1cy5pc1N5bWJvbGljTGluaygpIHx8ICFzdGF0dXMuaXNEaXJlY3RvcnkoKSB8fCBzdGF0dXMuZGV2ICE9PSBjcmVhdGVkUGFyZW50LmRldiB8fCBzdGF0dXMuaW5vICE9PSBjcmVhdGVkUGFyZW50LmlubykgewogICAgdGhyb3cgbmV3IEVycm9yKCdodWQ6IGNyZWF0ZWQgSFVEIGNvbmZpZyBwYXJlbnQgY2hhbmdlZCBkdXJpbmcgcm9sbGJhY2snKTsKICB9CiAgcm1kaXJTeW5jKGNyZWF0ZWRQYXJlbnQucGF0aCk7Cn0KCmZ1bmN0aW9uIHJvbGxiYWNrSHVkV3JpdGUod3JpdGUpIHsKICBjb25zdCBjdXJyZW50ID0gaHVkRmlsZVNuYXBzaG90KHdyaXRlLnJvb3QsIHdyaXRlLnNuYXBzaG90LnBhdGgsIHdyaXRlLmxhYmVsKTsKICB0cnkgeyBhc3NlcnRIdWRTbmFwc2hvdEN1cnJlbnQod3JpdGUucG9zdFdyaXRlLCB3cml0ZS5yb290LCB3cml0ZS5sYWJlbCk7IH0KICBjYXRjaCB7CiAgICB0aHJvdyBuZXcgRXJyb3IoYGh1ZDogJHt3cml0ZS5sYWJlbH0gY2hhbmdlZCBiZWZvcmUgcm9sbGJhY2tgKTsKICB9CiAgaWYgKHdyaXRlLnNuYXBzaG90LnByZXNlbnQpIHsKICAgIGF0b21pY0h1ZFdyaXRlKHdyaXRlLnJvb3QsIGN1cnJlbnQsIHdyaXRlLnNuYXBzaG90LmJ5dGVzLCB3cml0ZS5zbmFwc2hvdC5tb2RlLCB3cml0ZS5sYWJlbCk7CiAgfSBlbHNlIHsKICAgIGF0b21pY0h1ZFJlbW92ZSh3cml0ZS5yb290LCBjdXJyZW50LCB3cml0ZS5sYWJlbCk7CiAgfQp9CgpmdW5jdGlvbiByb2xsYmFja0NsYXVkZU1lbVdyaXRlcyh3cml0ZXMpIHsKICBjb25zdCB0cmFuc2ZlcnJlZCA9IFtdOwogIGNvbnN0IGVycm9ycyA9IFtdOwogIGZvciAoY29uc3Qgd3JpdGUgb2YgWy4uLndyaXRlc10ucmV2ZXJzZSgpKSB7CiAgICB0cnkgeyBhc3NlcnRIdWRTbmFwc2hvdEN1cnJlbnQod3JpdGUucG9zdFdyaXRlLCB3cml0ZS5yb290LCB3cml0ZS5sYWJlbCk7IH0KICAgIGNhdGNoIHsKICAgICAgdHJhbnNmZXJyZWQucHVzaCh3cml0ZS5sYWJlbCk7CiAgICAgIGNvbnRpbnVlOwogICAgfQogICAgdHJ5IHsgcm9sbGJhY2tIdWRXcml0ZSh3cml0ZSk7IH0KICAgIGNhdGNoIChlcnJvcikgeyBlcnJvcnMucHVzaChlcnJvcik7IH0KICB9CiAgcmV0dXJuIHsgdHJhbnNmZXJyZWQsIGVycm9ycyB9Owp9CgpmdW5jdGlvbiBhdG9taWNIdWRSZW1vdmUocm9vdCwgc25hcHNob3QsIGxhYmVsKSB7CiAgYXNzZXJ0SHVkU25hcHNob3RDdXJyZW50KHNuYXBzaG90LCByb290LCBsYWJlbCk7CiAgaWYgKHNuYXBzaG90LnByZXNlbnQpIHVubGlua1N5bmMoc25hcHNob3QucGF0aCk7Cn0KCmZ1bmN0aW9uIGpzb25GaW5nZXJwcmludCh2YWx1ZSkgewogIHJldHVybiBzaGEyNTYobmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKEpTT04uc3RyaW5naWZ5KHZhbHVlKSkpOwp9CgpmdW5jdGlvbiBmaWxlRmluZ2VycHJpbnQoYnl0ZXMpIHsKICByZXR1cm4gc2hhMjU2KGJ5dGVzIGluc3RhbmNlb2YgVWludDhBcnJheSA/IGJ5dGVzIDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGJ5dGVzKSk7Cn0KCmZ1bmN0aW9uIGlzUGxhaW5SZWNvcmQodmFsdWUpIHsKICByZXR1cm4gdmFsdWUgIT09IG51bGwgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSk7Cn0KCmZ1bmN0aW9uIGhhc0V4YWN0S2V5cyh2YWx1ZSwga2V5cykgewogIHJldHVybiBpc1BsYWluUmVjb3JkKHZhbHVlKSAmJiBPYmplY3Qua2V5cyh2YWx1ZSkuc29ydCgpLmpvaW4oJ1wwJykgPT09IFsuLi5rZXlzXS5zb3J0KCkuam9pbignXDAnKTsKfQoKZnVuY3Rpb24gaXNDYW5vbmljYWxCYXNlNjQodmFsdWUpIHsKICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCB2YWx1ZS5sZW5ndGggJSA0ICE9PSAwIHx8ICEvXig/OltBLVphLXowLTkrL117NH0pKig/OltBLVphLXowLTkrL117Mn09PXxbQS1aYS16MC05Ky9dezN9PSk/JC8udGVzdCh2YWx1ZSkpIHJldHVybiBmYWxzZTsKICByZXR1cm4gQnVmZmVyLmZyb20odmFsdWUsICdiYXNlNjQnKS50b1N0cmluZygnYmFzZTY0JykgPT09IHZhbHVlOwp9CgpmdW5jdGlvbiB2YWxpZGF0ZUNsYXVkZU1lbU93bmVyc2hpcChmaWxlcykgewogIGlmICghaXNQbGFpblJlY29yZChmaWxlcykpIHRocm93IG5ldyBFcnJvcignY2xhdWRlLW1lbTogdW5zdXBwb3J0ZWQgb3IgbWFsZm9ybWVkIG93bmVyc2hpcCBzdGF0ZScpOwogIGNvbnN0IGhhc2hQYXR0ZXJuID0gL15bMC05YS1mXXs2NH0kLzsKICBjb25zdCBzZWVuID0gbmV3IFNldCgpOwogIGZvciAoY29uc3QgW3RhcmdldFBhdGgsIHJlY29yZF0gb2YgT2JqZWN0LmVudHJpZXMoZmlsZXMpKSB7CiAgICBpZiAoIWlzQWJzb2x1dGUodGFyZ2V0UGF0aCkgfHwgcmVzb2x2ZSh0YXJnZXRQYXRoKSAhPT0gdGFyZ2V0UGF0aCB8fCBzZWVuLmhhcyh0YXJnZXRQYXRoKQogICAgICB8fCAhaGFzRXhhY3RLZXlzKHJlY29yZCwgWydyZWxhdGl2ZVBhdGgnLCAncGx1Z2luVmVyc2lvbicsICdvcmlnaW5hbEJhc2U2NCcsICdvcmlnaW5hbFNoYTI1NicsICdtYW5hZ2VkU2hhMjU2J10pCiAgICAgIHx8IChyZWNvcmQucmVsYXRpdmVQYXRoICE9PSAnaG9va3MvaG9va3MuanNvbicgJiYgcmVjb3JkLnJlbGF0aXZlUGF0aCAhPT0gJy5tY3AuanNvbicpCiAgICAgIHx8ICFwYXJzZVNlbXZlcihyZWNvcmQucGx1Z2luVmVyc2lvbikKICAgICAgfHwgIWlzQ2Fub25pY2FsQmFzZTY0KHJlY29yZC5vcmlnaW5hbEJhc2U2NCkKICAgICAgfHwgIWhhc2hQYXR0ZXJuLnRlc3QocmVjb3JkLm9yaWdpbmFsU2hhMjU2KQogICAgICB8fCByZWNvcmQub3JpZ2luYWxTaGEyNTYgIT09IGZpbGVGaW5nZXJwcmludChCdWZmZXIuZnJvbShyZWNvcmQub3JpZ2luYWxCYXNlNjQsICdiYXNlNjQnKSkKICAgICAgfHwgIWhhc2hQYXR0ZXJuLnRlc3QocmVjb3JkLm1hbmFnZWRTaGEyNTYpKSB7CiAgICAgIHRocm93IG5ldyBFcnJvcignY2xhdWRlLW1lbTogdW5zdXBwb3J0ZWQgb3IgbWFsZm9ybWVkIG93bmVyc2hpcCBzdGF0ZScpOwogICAgfQogICAgY29uc3Qgc3VmZml4ID0gcmVjb3JkLnJlbGF0aXZlUGF0aCA9PT0gJ2hvb2tzL2hvb2tzLmpzb24nCiAgICAgID8gam9pbignaG9va3MnLCAnaG9va3MuanNvbicpIDogJy5tY3AuanNvbic7CiAgICBpZiAoKHJlY29yZC5yZWxhdGl2ZVBhdGggPT09ICdob29rcy9ob29rcy5qc29uJyAmJiAhdGFyZ2V0UGF0aC5lbmRzV2l0aChgJHtzZXB9JHtzdWZmaXh9YCkpCiAgICAgIHx8IChyZWNvcmQucmVsYXRpdmVQYXRoID09PSAnLm1jcC5qc29uJyAmJiBiYXNlbmFtZSh0YXJnZXRQYXRoKSAhPT0gc3VmZml4KSkgewogICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NsYXVkZS1tZW06IHVuc3VwcG9ydGVkIG9yIG1hbGZvcm1lZCBvd25lcnNoaXAgc3RhdGUnKTsKICAgIH0KICAgIHNlZW4uYWRkKHRhcmdldFBhdGgpOwogIH0KfQoKZnVuY3Rpb24gdmFsaWRhdGVDbGF1ZGVNZW1Pd25lcnNoaXBDb250ZXh0KGZpbGVzLCBjb250ZXh0KSB7CiAgY29uc3QgY2FjaGVSb290ID0gcmVzb2x2ZShjb250ZXh0LmNsYXVkZUNvbmZpZ0RpciwgJ3BsdWdpbnMnLCAnY2FjaGUnLCAndGhlZG90bWFjaycsICdjbGF1ZGUtbWVtJyk7CiAgZm9yIChjb25zdCBbdGFyZ2V0UGF0aCwgcmVjb3JkXSBvZiBPYmplY3QuZW50cmllcyhmaWxlcykpIHsKICAgIGlmIChjb21wYXJlU2VtdmVyKHJlY29yZC5wbHVnaW5WZXJzaW9uLCBQTFVHSU5fQkFTRUxJTkVTLm1lbW9yeS52ZXJzaW9uKSA8IDApIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKCdjbGF1ZGUtbWVtOiBhbWJpZ3VvdXMgb3duZXJzaGlwIHN0YXRlJyk7CiAgICB9CiAgICBjb25zdCBleHBlY3RlZCA9IHJlY29yZC5yZWxhdGl2ZVBhdGggPT09ICdob29rcy9ob29rcy5qc29uJwogICAgICA/IHJlc29sdmUoY2FjaGVSb290LCByZWNvcmQucGx1Z2luVmVyc2lvbiwgJ2hvb2tzJywgJ2hvb2tzLmpzb24nKQogICAgICA6IHJlc29sdmUoY2FjaGVSb290LCByZWNvcmQucGx1Z2luVmVyc2lvbiwgJy5tY3AuanNvbicpOwogICAgaWYgKHRhcmdldFBhdGggIT09IGV4cGVjdGVkIHx8ICFwYXRoSXNDb250YWluZWQoY2FjaGVSb290LCB0YXJnZXRQYXRoKSkgewogICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NsYXVkZS1tZW06IGFtYmlndW91cyBvd25lcnNoaXAgc3RhdGUnKTsKICAgIH0KICB9Cn0KCmZ1bmN0aW9uIG1hbmFnZWRTdGF0dXNMaW5lQ29tbWFuZElzVmFsaWQoY29tbWFuZCwgbW9kdWxlUGF0aCwgcGxhdGZvcm0gPSBwcm9jZXNzLnBsYXRmb3JtKSB7CiAgaWYgKHR5cGVvZiBjb21tYW5kICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgbW9kdWxlUGF0aCAhPT0gJ3N0cmluZycpIHJldHVybiBmYWxzZTsKICBsZXQgbW9kdWxlQXJndW1lbnQ7CiAgdHJ5IHsgbW9kdWxlQXJndW1lbnQgPSBxdW90ZVN0YXR1c0xpbmVBcmcobW9kdWxlUGF0aCwgcGxhdGZvcm0pOyB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9CiAgY29uc3Qgc3VmZml4ID0gYCAke21vZHVsZUFyZ3VtZW50fWA7CiAgaWYgKCFjb21tYW5kLmVuZHNXaXRoKHN1ZmZpeCkpIHJldHVybiBmYWxzZTsKICBjb25zdCBidW5Bcmd1bWVudCA9IGNvbW1hbmQuc2xpY2UoMCwgLXN1ZmZpeC5sZW5ndGgpOwogIGxldCBidW5QYXRoOwogIGlmIChwbGF0Zm9ybSA9PT0gJ3dpbjMyJykgewogICAgaWYgKGJ1bkFyZ3VtZW50Lmxlbmd0aCA8IDIgfHwgYnVuQXJndW1lbnRbMF0gIT09ICciJyB8fCBidW5Bcmd1bWVudC5hdCgtMSkgIT09ICciJykgcmV0dXJuIGZhbHNlOwogICAgYnVuUGF0aCA9IGJ1bkFyZ3VtZW50LnNsaWNlKDEsIC0xKTsKICB9IGVsc2UgewogICAgaWYgKGJ1bkFyZ3VtZW50Lmxlbmd0aCA8IDIgfHwgYnVuQXJndW1lbnRbMF0gIT09ICInIiB8fCBidW5Bcmd1bWVudC5hdCgtMSkgIT09ICInIikgcmV0dXJuIGZhbHNlOwogICAgYnVuUGF0aCA9IGJ1bkFyZ3VtZW50LnNsaWNlKDEsIC0xKS5yZXBsYWNlQWxsKGAnIiciJ2AsICInIik7CiAgfQogIHRyeSB7CiAgICBpZiAocXVvdGVTdGF0dXNMaW5lQXJnKGJ1blBhdGgsIHBsYXRmb3JtKSAhPT0gYnVuQXJndW1lbnQpIHJldHVybiBmYWxzZTsKICB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9CiAgY29uc3QgZXhlY3V0YWJsZSA9IGJ1blBhdGgucmVwbGFjZUFsbCgnXFwnLCAnLycpLnNwbGl0KCcvJykuYXQoLTEpPy50b0xvd2VyQ2FzZSgpOwogIHJldHVybiBleGVjdXRhYmxlID09PSAnYnVuJyB8fCBleGVjdXRhYmxlID09PSAnYnVuLmV4ZSc7Cn0KCmZ1bmN0aW9uIHZhbGlkYXRlTWFuYWdlZEh1ZFN0YXRlKHZhbHVlLCBhbGxvd0luaXRpYWwgPSBmYWxzZSwgbWFuYWdlZENvbnRleHQgPSBudWxsKSB7CiAgaWYgKCFoYXNFeGFjdEtleXModmFsdWUsIFsnc2NoZW1hVmVyc2lvbicsICdodWQnLCAnY2xhdWRlTWVtJ10pIHx8IHZhbHVlLnNjaGVtYVZlcnNpb24gIT09IDEKICAgIHx8ICFpc1BsYWluUmVjb3JkKHZhbHVlLmNsYXVkZU1lbSkgfHwgIWlzUGxhaW5SZWNvcmQodmFsdWUuY2xhdWRlTWVtLmZpbGVzKSB8fCAhaXNQbGFpblJlY29yZCh2YWx1ZS5odWQpKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoJ2h1ZDogdW5zdXBwb3J0ZWQgb3IgbWFsZm9ybWVkIG93bmVyc2hpcCBzdGF0ZScpOwogIH0KICB2YWxpZGF0ZUNsYXVkZU1lbU93bmVyc2hpcCh2YWx1ZS5jbGF1ZGVNZW0uZmlsZXMpOwogIGlmIChPYmplY3Qua2V5cyh2YWx1ZS5odWQpLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHN0cnVjdHVyZWRDbG9uZSh2YWx1ZSk7CiAgY29uc3QgY29uZmlnID0gdmFsdWUuaHVkLmNvbmZpZzsKICBjb25zdCBzdGF0dXNMaW5lID0gdmFsdWUuaHVkLnN0YXR1c0xpbmU7CiAgY29uc3QgaGFzaFBhdHRlcm4gPSAvXlswLTlhLWZdezY0fSQvOwogIGlmICghaGFzRXhhY3RLZXlzKHZhbHVlLmh1ZCwgWydjb25maWcnLCAnc3RhdHVzTGluZSddKQogICAgfHwgIWhhc0V4YWN0S2V5cyhjb25maWcsIFsnb3JpZ2luYWxQcmVzZW50JywgJ29yaWdpbmFsQmFzZTY0JywgJ21hbmFnZWRTaGEyNTYnXSkKICAgIHx8IHR5cGVvZiBjb25maWcub3JpZ2luYWxQcmVzZW50ICE9PSAnYm9vbGVhbicKICAgIHx8ICFpc0Nhbm9uaWNhbEJhc2U2NChjb25maWcub3JpZ2luYWxCYXNlNjQpCiAgICB8fCAoIWNvbmZpZy5vcmlnaW5hbFByZXNlbnQgJiYgY29uZmlnLm9yaWdpbmFsQmFzZTY0ICE9PSAnJykKICAgIHx8ICFoYXNoUGF0dGVybi50ZXN0KGNvbmZpZy5tYW5hZ2VkU2hhMjU2KQogICAgfHwgY29uZmlnLm1hbmFnZWRTaGEyNTYgIT09IGZpbGVGaW5nZXJwcmludChIVURfQ09ORklHX1RFWFQpCiAgICB8fCAhaGFzRXhhY3RLZXlzKHN0YXR1c0xpbmUsIFsnb3JpZ2luYWxQcmVzZW50JywgJ29yaWdpbmFsVmFsdWUnLCAnbWFuYWdlZFZhbHVlJywgJ21hbmFnZWRTaGEyNTYnXSkKICAgIHx8IHR5cGVvZiBzdGF0dXNMaW5lLm9yaWdpbmFsUHJlc2VudCAhPT0gJ2Jvb2xlYW4nCiAgICB8fCAoIXN0YXR1c0xpbmUub3JpZ2luYWxQcmVzZW50ICYmIHN0YXR1c0xpbmUub3JpZ2luYWxWYWx1ZSAhPT0gbnVsbCkKICAgIHx8ICFoYXNFeGFjdEtleXMoc3RhdHVzTGluZS5tYW5hZ2VkVmFsdWUsIFsndHlwZScsICdjb21tYW5kJ10pCiAgICB8fCBzdGF0dXNMaW5lLm1hbmFnZWRWYWx1ZS50eXBlICE9PSAnY29tbWFuZCcKICAgIHx8IHR5cGVvZiBzdGF0dXNMaW5lLm1hbmFnZWRWYWx1ZS5jb21tYW5kICE9PSAnc3RyaW5nJwogICAgfHwgIW1hbmFnZWRTdGF0dXNMaW5lQ29tbWFuZElzVmFsaWQoc3RhdHVzTGluZS5tYW5hZ2VkVmFsdWUuY29tbWFuZCwgbWFuYWdlZENvbnRleHQ/Lm1vZHVsZVBhdGgsIG1hbmFnZWRDb250ZXh0Py5wbGF0Zm9ybSkKICAgIHx8ICFoYXNoUGF0dGVybi50ZXN0KHN0YXR1c0xpbmUubWFuYWdlZFNoYTI1NikKICAgIHx8IHN0YXR1c0xpbmUubWFuYWdlZFNoYTI1NiAhPT0ganNvbkZpbmdlcnByaW50KHN0YXR1c0xpbmUubWFuYWdlZFZhbHVlKSkgewogICAgdGhyb3cgbmV3IEVycm9yKCdodWQ6IHVuc3VwcG9ydGVkIG9yIG1hbGZvcm1lZCBvd25lcnNoaXAgc3RhdGUnKTsKICB9CiAgcmV0dXJuIHN0cnVjdHVyZWRDbG9uZSh2YWx1ZSk7Cn0KCmZ1bmN0aW9uIGN1cnJlbnRIdWRTdGF0ZShzdGF0ZSwgcGVyc2lzdGVkLCBjb250ZXh0LCBtb2R1bGVQYXRoKSB7CiAgcmV0dXJuIHZhbGlkYXRlTWFuYWdlZEh1ZFN0YXRlKHN0YXRlLCAhcGVyc2lzdGVkLCB7IG1vZHVsZVBhdGgsIHBsYXRmb3JtOiBjb250ZXh0LnBsYXRmb3JtIHx8IHByb2Nlc3MucGxhdGZvcm0gfSk7Cn0KCmZ1bmN0aW9uIHZhbGlkYXRlSHVkSW5zdGFsbFBhdGgocmVjb3JkLCBjYWNoZVJvb3QsIGNsYXVkZUNvbmZpZ0RpcikgewogIGlmIChyZWNvcmQ/LnNjb3BlICE9PSAndXNlcicgfHwgIXBhcnNlU2VtdmVyKHJlY29yZC52ZXJzaW9uKSB8fCB0eXBlb2YgcmVjb3JkLmluc3RhbGxQYXRoICE9PSAnc3RyaW5nJyB8fCAhaXNBYnNvbHV0ZShyZWNvcmQuaW5zdGFsbFBhdGgpKSByZXR1cm4gbnVsbDsKICB0cnkgewogICAgaWYgKCFwYXRoSXNDb250YWluZWQoY2FjaGVSb290LCByZWNvcmQuaW5zdGFsbFBhdGgpCiAgICAgIHx8ICFodWREaXJlY3RvcnlDaGFpbklzU2FmZShjbGF1ZGVDb25maWdEaXIsIGNhY2hlUm9vdCkKICAgICAgfHwgIWh1ZERpcmVjdG9yeUNoYWluSXNTYWZlKGNhY2hlUm9vdCwgcmVjb3JkLmluc3RhbGxQYXRoKSkgcmV0dXJuIG51bGw7CiAgICBjb25zdCBjYWNoZVN0YXR1cyA9IGxzdGF0U3luYyhjYWNoZVJvb3QpOwogICAgY29uc3QgaW5zdGFsbFN0YXR1cyA9IGxzdGF0U3luYyhyZWNvcmQuaW5zdGFsbFBhdGgpOwogICAgaWYgKGNhY2hlU3RhdHVzLmlzU3ltYm9saWNMaW5rKCkgfHwgIWNhY2hlU3RhdHVzLmlzRGlyZWN0b3J5KCkgfHwgaW5zdGFsbFN0YXR1cy5pc1N5bWJvbGljTGluaygpIHx8ICFpbnN0YWxsU3RhdHVzLmlzRGlyZWN0b3J5KCkpIHJldHVybiBudWxsOwogICAgY29uc3QgcmVhbENhY2hlID0gcmVhbHBhdGhTeW5jKGNhY2hlUm9vdCk7CiAgICBjb25zdCByZWFsSW5zdGFsbCA9IHJlYWxwYXRoU3luYyhyZWNvcmQuaW5zdGFsbFBhdGgpOwogICAgaWYgKCFwYXRoSXNDb250YWluZWQocmVhbENhY2hlLCByZWFsSW5zdGFsbCkgfHwgcmVhbEluc3RhbGwgPT09IHJlYWxDYWNoZSkgcmV0dXJuIG51bGw7CiAgICBjb25zdCBzb3VyY2UgPSBqb2luKHJlY29yZC5pbnN0YWxsUGF0aCwgJ3NyYycpOwogICAgY29uc3QgZW50cnkgPSBqb2luKHNvdXJjZSwgJ2luZGV4LnRzJyk7CiAgICBjb25zdCBzb3VyY2VTdGF0dXMgPSBsc3RhdFN5bmMoc291cmNlKTsKICAgIGNvbnN0IGVudHJ5U3RhdHVzID0gbHN0YXRTeW5jKGVudHJ5KTsKICAgIGlmIChzb3VyY2VTdGF0dXMuaXNTeW1ib2xpY0xpbmsoKSB8fCAhc291cmNlU3RhdHVzLmlzRGlyZWN0b3J5KCkgfHwgZW50cnlTdGF0dXMuaXNTeW1ib2xpY0xpbmsoKSB8fCAhZW50cnlTdGF0dXMuaXNGaWxlKCkgfHwgZW50cnlTdGF0dXMubmxpbmsgIT09IDEpIHJldHVybiBudWxsOwogICAgY29uc3QgcmVhbEVudHJ5ID0gcmVhbHBhdGhTeW5jKGVudHJ5KTsKICAgIGlmICghcGF0aElzQ29udGFpbmVkKHJlYWxJbnN0YWxsLCByZWFsRW50cnkpKSByZXR1cm4gbnVsbDsKICAgIHJldHVybiB7IHJlY29yZCwgZW50cnk6IHJlYWxFbnRyeSB9OwogIH0gY2F0Y2ggewogICAgcmV0dXJuIG51bGw7CiAgfQp9CgpmdW5jdGlvbiBzZWxlY3RlZEh1ZEluc3RhbGwoaW5zdGFsbGVkLCBjbGF1ZGVDb25maWdEaXIpIHsKICBjb25zdCByZWNvcmRzID0gQXJyYXkuaXNBcnJheShpbnN0YWxsZWQ/LnBsdWdpbnM/LlsnY2xhdWRlLWh1ZEBjbGF1ZGUtaHVkJ10pCiAgICA/IGluc3RhbGxlZC5wbHVnaW5zWydjbGF1ZGUtaHVkQGNsYXVkZS1odWQnXSA6IFtdOwogIGNvbnN0IGNhY2hlUm9vdCA9IGpvaW4oY2xhdWRlQ29uZmlnRGlyLCAncGx1Z2lucycsICdjYWNoZScsICdjbGF1ZGUtaHVkJywgJ2NsYXVkZS1odWQnKTsKICBjb25zdCB2YWxpZCA9IHJlY29yZHMubWFwKHJlY29yZCA9PiB2YWxpZGF0ZUh1ZEluc3RhbGxQYXRoKHJlY29yZCwgY2FjaGVSb290LCBjbGF1ZGVDb25maWdEaXIpKS5maWx0ZXIoQm9vbGVhbik7CiAgdmFsaWQuc29ydCgobGVmdCwgcmlnaHQpID0+IGNvbXBhcmVTZW12ZXIocmlnaHQucmVjb3JkLnZlcnNpb24sIGxlZnQucmVjb3JkLnZlcnNpb24pKTsKICByZXR1cm4gdmFsaWRbMF0gfHwgbnVsbDsKfQoKZnVuY3Rpb24gdmFsaWRhdGVDbGF1ZGVNZW1JbnN0YWxsUGF0aChyZWNvcmQsIGNhY2hlUm9vdCwgY2xhdWRlQ29uZmlnRGlyKSB7CiAgaWYgKHJlY29yZD8uc2NvcGUgIT09ICd1c2VyJyB8fCAhcGFyc2VTZW12ZXIocmVjb3JkLnZlcnNpb24pIHx8IHR5cGVvZiByZWNvcmQuaW5zdGFsbFBhdGggIT09ICdzdHJpbmcnIHx8ICFpc0Fic29sdXRlKHJlY29yZC5pbnN0YWxsUGF0aCkpIHJldHVybiBudWxsOwogIGNvbnN0IGV4cGVjdGVkUGF0aCA9IHJlc29sdmUoY2FjaGVSb290LCByZWNvcmQudmVyc2lvbik7CiAgaWYgKHJlc29sdmUocmVjb3JkLmluc3RhbGxQYXRoKSAhPT0gZXhwZWN0ZWRQYXRoKSByZXR1cm4gbnVsbDsKICB0cnkgewogICAgaWYgKCFwYXRoSXNDb250YWluZWQoY2FjaGVSb290LCBleHBlY3RlZFBhdGgpCiAgICAgIHx8ICFodWREaXJlY3RvcnlDaGFpbklzU2FmZShjbGF1ZGVDb25maWdEaXIsIGNhY2hlUm9vdCkKICAgICAgfHwgIWh1ZERpcmVjdG9yeUNoYWluSXNTYWZlKGNhY2hlUm9vdCwgZXhwZWN0ZWRQYXRoKSkgcmV0dXJuIG51bGw7CiAgICBjb25zdCBjYWNoZVN0YXR1cyA9IGxzdGF0U3luYyhjYWNoZVJvb3QpOwogICAgY29uc3QgaW5zdGFsbFN0YXR1cyA9IGxzdGF0U3luYyhleHBlY3RlZFBhdGgpOwogICAgaWYgKGNhY2hlU3RhdHVzLmlzU3ltYm9saWNMaW5rKCkgfHwgIWNhY2hlU3RhdHVzLmlzRGlyZWN0b3J5KCkgfHwgaW5zdGFsbFN0YXR1cy5pc1N5bWJvbGljTGluaygpIHx8ICFpbnN0YWxsU3RhdHVzLmlzRGlyZWN0b3J5KCkpIHJldHVybiBudWxsOwogICAgY29uc3QgcmVhbENhY2hlID0gcmVhbHBhdGhTeW5jKGNhY2hlUm9vdCk7CiAgICBjb25zdCByZWFsSW5zdGFsbCA9IHJlYWxwYXRoU3luYyhleHBlY3RlZFBhdGgpOwogICAgaWYgKCFwYXRoSXNDb250YWluZWQocmVhbENhY2hlLCByZWFsSW5zdGFsbCkgfHwgcmVhbEluc3RhbGwgPT09IHJlYWxDYWNoZSB8fCByZWFsSW5zdGFsbCAhPT0gZXhwZWN0ZWRQYXRoKSByZXR1cm4gbnVsbDsKICAgIHJldHVybiB7IHJlY29yZCwgaW5zdGFsbFBhdGg6IGV4cGVjdGVkUGF0aCB9OwogIH0gY2F0Y2ggewogICAgcmV0dXJuIG51bGw7CiAgfQp9CgpmdW5jdGlvbiBzZWxlY3RlZENsYXVkZU1lbUluc3RhbGwoaW5zdGFsbGVkLCBjbGF1ZGVDb25maWdEaXIpIHsKICBjb25zdCByZWNvcmRzID0gQXJyYXkuaXNBcnJheShpbnN0YWxsZWQ/LnBsdWdpbnM/LlsnY2xhdWRlLW1lbUB0aGVkb3RtYWNrJ10pCiAgICA/IGluc3RhbGxlZC5wbHVnaW5zWydjbGF1ZGUtbWVtQHRoZWRvdG1hY2snXSA6IFtdOwogIGNvbnN0IGNhY2hlUm9vdCA9IGpvaW4oY2xhdWRlQ29uZmlnRGlyLCAncGx1Z2lucycsICdjYWNoZScsICd0aGVkb3RtYWNrJywgJ2NsYXVkZS1tZW0nKTsKICBjb25zdCB2YWxpZCA9IHJlY29yZHMubWFwKHJlY29yZCA9PiB2YWxpZGF0ZUNsYXVkZU1lbUluc3RhbGxQYXRoKHJlY29yZCwgY2FjaGVSb290LCBjbGF1ZGVDb25maWdEaXIpKS5maWx0ZXIoQm9vbGVhbik7CiAgdmFsaWQuc29ydCgobGVmdCwgcmlnaHQpID0+IGNvbXBhcmVTZW12ZXIocmlnaHQucmVjb3JkLnZlcnNpb24sIGxlZnQucmVjb3JkLnZlcnNpb24pKTsKICByZXR1cm4gdmFsaWRbMF0gfHwgbnVsbDsKfQoKZnVuY3Rpb24gY2FwdHVyZUNsYXVkZU1lbVNlbGVjdGlvbihpbnN0YWxsZWRTbmFwc2hvdCwgc2VsZWN0ZWQsIGNvbnRleHQpIHsKICBjb25zdCBkaXJlY3RvcmllcyA9IFtdOwogIGxldCBjdXJyZW50ID0gY29udGV4dC5jbGF1ZGVDb25maWdEaXI7CiAgZm9yIChjb25zdCBwYXJ0IG9mIFsnJywgLi4ucmVsYXRpdmUoY29udGV4dC5jbGF1ZGVDb25maWdEaXIsIHNlbGVjdGVkLmluc3RhbGxQYXRoKS5zcGxpdChzZXApLmZpbHRlcihCb29sZWFuKV0pIHsKICAgIGlmIChwYXJ0KSBjdXJyZW50ID0gam9pbihjdXJyZW50LCBwYXJ0KTsKICAgIGNvbnN0IHN0YXR1cyA9IGxzdGF0U3luYyhjdXJyZW50KTsKICAgIGlmIChzdGF0dXMuaXNTeW1ib2xpY0xpbmsoKSB8fCAhc3RhdHVzLmlzRGlyZWN0b3J5KCkpIHRocm93IG5ldyBFcnJvcignY2xhdWRlLW1lbTogdW5zYWZlIHNlbGVjdGVkIGNhY2hlIGlkZW50aXR5Jyk7CiAgICBkaXJlY3Rvcmllcy5wdXNoKHsgcGF0aDogY3VycmVudCwgZGV2OiBzdGF0dXMuZGV2LCBpbm86IHN0YXR1cy5pbm8sIG1vZGU6IHN0YXR1cy5tb2RlLCBubGluazogc3RhdHVzLm5saW5rIH0pOwogIH0KICByZXR1cm4geyBpbnN0YWxsZWRTbmFwc2hvdCwgZGlyZWN0b3JpZXMgfTsKfQoKZnVuY3Rpb24gYXNzZXJ0Q2xhdWRlTWVtU2VsZWN0aW9uQ3VycmVudChzZWxlY3Rpb24sIGNvbnRleHQpIHsKICBhc3NlcnRIdWRTbmFwc2hvdEN1cnJlbnQoc2VsZWN0aW9uLmluc3RhbGxlZFNuYXBzaG90LCBjb250ZXh0LmNsYXVkZUNvbmZpZ0RpciwgJ2luc3RhbGxlZCBwbHVnaW4gc3RhdGUnKTsKICBmb3IgKGNvbnN0IGV4cGVjdGVkIG9mIHNlbGVjdGlvbi5kaXJlY3RvcmllcykgewogICAgY29uc3Qgc3RhdHVzID0gbHN0YXRTeW5jKGV4cGVjdGVkLnBhdGgpOwogICAgaWYgKHN0YXR1cy5pc1N5bWJvbGljTGluaygpIHx8ICFzdGF0dXMuaXNEaXJlY3RvcnkoKSB8fCBzdGF0dXMuZGV2ICE9PSBleHBlY3RlZC5kZXYgfHwgc3RhdHVzLmlubyAhPT0gZXhwZWN0ZWQuaW5vCiAgICAgIHx8IHN0YXR1cy5tb2RlICE9PSBleHBlY3RlZC5tb2RlIHx8IHN0YXR1cy5ubGluayAhPT0gZXhwZWN0ZWQubmxpbmspIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKCdjbGF1ZGUtbWVtOiBzZWxlY3RlZCBjYWNoZSBpZGVudGl0eSBjaGFuZ2VkIGR1cmluZyB1cGRhdGUnKTsKICAgIH0KICB9Cn0KCmV4cG9ydCBmdW5jdGlvbiBxdW90ZVN0YXR1c0xpbmVBcmcocGF0aCwgcGxhdGZvcm0gPSBwcm9jZXNzLnBsYXRmb3JtKSB7CiAgaWYgKHR5cGVvZiBwYXRoICE9PSAnc3RyaW5nJyB8fCBwYXRoLmluY2x1ZGVzKCdcMCcpIHx8IHBhdGguaW5jbHVkZXMoJyonKSB8fCBwYXRoLmluY2x1ZGVzKCckKCcpIHx8IHBhdGguaW5jbHVkZXMoJ2AnKSkgewogICAgdGhyb3cgbmV3IEVycm9yKCdodWQ6IHVuc2FmZSBzdGF0dXMtbGluZSBwYXRoJyk7CiAgfQogIGlmIChwbGF0Zm9ybSA9PT0gJ3dpbjMyJykgewogICAgaWYgKCEvXig/OltBLVphLXpdOltcXC9dfFxcXFwpLy50ZXN0KHBhdGgpIHx8IC9bIiUhJnw8PigpXlxyXG5dLy50ZXN0KHBhdGgpKSB7CiAgICAgIHRocm93IG5ldyBFcnJvcignaHVkOiB1bnNhZmUgV2luZG93cyBzdGF0dXMtbGluZSBwYXRoJyk7CiAgICB9CiAgICByZXR1cm4gYCIke3BhdGh9ImA7CiAgfQogIGlmICghaXNBYnNvbHV0ZShwYXRoKSkgdGhyb3cgbmV3IEVycm9yKCdodWQ6IHN0YXR1cy1saW5lIHBhdGggbXVzdCBiZSBhYnNvbHV0ZScpOwogIHJldHVybiBgJyR7cGF0aC5yZXBsYWNlQWxsKCInIiwgYCciJyInYCl9J2A7Cn0KCmZ1bmN0aW9uIGNsYXVkZU1lbUJ1blBhdGgocGF0aCkgewogIGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycgfHwgcGF0aC5pbmNsdWRlcygnXDAnKSB8fCBwYXRoLmluY2x1ZGVzKCdccicpIHx8IHBhdGguaW5jbHVkZXMoJ1xuJykKICAgIHx8ICghaXNBYnNvbHV0ZShwYXRoKSAmJiAhL15bQS1aYS16XTpbXFwvXS8udGVzdChwYXRoKSkpIHsKICAgIHRocm93IG5ldyBFcnJvcignY2xhdWRlLW1lbTogQnVuIHBhdGggbXVzdCBiZSBhYnNvbHV0ZScpOwogIH0KICBjb25zdCBleGVjdXRhYmxlID0gcGF0aC5yZXBsYWNlQWxsKCdcXCcsICcvJykuc3BsaXQoJy8nKS5hdCgtMSk/LnRvTG93ZXJDYXNlKCk7CiAgaWYgKGV4ZWN1dGFibGUgIT09ICdidW4nICYmIGV4ZWN1dGFibGUgIT09ICdidW4uZXhlJykgdGhyb3cgbmV3IEVycm9yKCdjbGF1ZGUtbWVtOiBleGVjdXRhYmxlIGlzIG5vdCBCdW4nKTsKICByZXR1cm4gcGF0aDsKfQoKZnVuY3Rpb24gcXVvdGVDbGF1ZGVNZW1Ib29rQnVuKHBhdGgpIHsKICByZXR1cm4gYCcke2NsYXVkZU1lbUJ1blBhdGgocGF0aCkucmVwbGFjZUFsbCgiJyIsIGAnIiciJ2ApfSdgOwp9CgpmdW5jdGlvbiBwYXJzZUNsYXVkZU1lbUpzb24ocmVsYXRpdmVQYXRoLCByYXcpIHsKICBpZiAodHlwZW9mIHJhdyAhPT0gJ3N0cmluZycpIHRocm93IG5ldyBFcnJvcihgY2xhdWRlLW1lbTogaW52YWxpZCAke3JlbGF0aXZlUGF0aH0gSlNPTmApOwogIGxldCB2YWx1ZTsKICB0cnkgeyB2YWx1ZSA9IEpTT04ucGFyc2UocmF3KTsgfSBjYXRjaCB7IHRocm93IG5ldyBFcnJvcihgY2xhdWRlLW1lbTogaW52YWxpZCAke3JlbGF0aXZlUGF0aH0gSlNPTmApOyB9CiAgaWYgKCFpc1BsYWluUmVjb3JkKHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKGBjbGF1ZGUtbWVtOiBpbnZhbGlkICR7cmVsYXRpdmVQYXRofSBzY2hlbWFgKTsKICByZXR1cm4gdmFsdWU7Cn0KCmZ1bmN0aW9uIGNsYXVkZU1lbVBsdWdpbk5vZGVQb3NpdGlvbnMoY29tbWFuZCkgewogIGNvbnN0IHBvc2l0aW9ucyA9IFtdOwogIGxldCBxdW90ZSA9IG51bGw7CiAgbGV0IGF0Q29tbWFuZFN0YXJ0ID0gdHJ1ZTsKICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgY29tbWFuZC5sZW5ndGg7IGluZGV4ICs9IDEpIHsKICAgIGNvbnN0IGNoYXJhY3RlciA9IGNvbW1hbmRbaW5kZXhdOwogICAgaWYgKHF1b3RlID09PSAiJyIpIHsKICAgICAgaWYgKGNoYXJhY3RlciA9PT0gIiciKSBxdW90ZSA9IG51bGw7CiAgICAgIGNvbnRpbnVlOwogICAgfQogICAgaWYgKHF1b3RlID09PSAnIicpIHsKICAgICAgaWYgKGNoYXJhY3RlciA9PT0gJ1xcJykgaW5kZXggKz0gMTsKICAgICAgZWxzZSBpZiAoY2hhcmFjdGVyID09PSAnIicpIHF1b3RlID0gbnVsbDsKICAgICAgY29udGludWU7CiAgICB9CiAgICBpZiAoY2hhcmFjdGVyID09PSAiJyIgfHwgY2hhcmFjdGVyID09PSAnIicpIHsKICAgICAgaWYgKGF0Q29tbWFuZFN0YXJ0KSBhdENvbW1hbmRTdGFydCA9IGZhbHNlOwogICAgICBxdW90ZSA9IGNoYXJhY3RlcjsKICAgICAgY29udGludWU7CiAgICB9CiAgICBpZiAoY2hhcmFjdGVyID09PSAnXFwnKSB7CiAgICAgIGlmIChhdENvbW1hbmRTdGFydCkgYXRDb21tYW5kU3RhcnQgPSBmYWxzZTsKICAgICAgaW5kZXggKz0gMTsKICAgICAgY29udGludWU7CiAgICB9CiAgICBpZiAoY2hhcmFjdGVyID09PSAnOycgfHwgY2hhcmFjdGVyID09PSAnJicgfHwgY2hhcmFjdGVyID09PSAnfCcgfHwgY2hhcmFjdGVyID09PSAnXG4nKSB7CiAgICAgIGF0Q29tbWFuZFN0YXJ0ID0gdHJ1ZTsKICAgICAgY29udGludWU7CiAgICB9CiAgICBpZiAoYXRDb21tYW5kU3RhcnQgJiYgL1xzLy50ZXN0KGNoYXJhY3RlcikpIGNvbnRpbnVlOwogICAgaWYgKCFhdENvbW1hbmRTdGFydCkgY29udGludWU7CiAgICBjb25zdCBjYW5kaWRhdGUgPSBjb21tYW5kLnNsaWNlKGluZGV4KTsKICAgIGlmICgvXm5vZGVccysoPz1bIiddP1wkX1BcL3NjcmlwdHNcLykvLnRlc3QoY2FuZGlkYXRlKSkgcG9zaXRpb25zLnB1c2goaW5kZXgpOwogICAgYXRDb21tYW5kU3RhcnQgPSBmYWxzZTsKICB9CiAgaWYgKHF1b3RlICE9PSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoJ2NsYXVkZS1tZW06IHVudGVybWluYXRlZCBzaGVsbCBxdW90ZScpOwogIHJldHVybiBwb3NpdGlvbnM7Cn0KCmV4cG9ydCBmdW5jdGlvbiByZXdyaXRlQ2xhdWRlTWVtRmlsZShyZWxhdGl2ZVBhdGgsIHJhdywgYnVuUGF0aCkgewogIGlmIChyZWxhdGl2ZVBhdGggIT09ICdob29rcy9ob29rcy5qc29uJyAmJiByZWxhdGl2ZVBhdGggIT09ICcubWNwLmpzb24nKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NsYXVkZS1tZW06IHVuc3VwcG9ydGVkIGludGVncmF0aW9uIHBhdGgnKTsKICB9CiAgY29uc3QgdmFsdWUgPSBwYXJzZUNsYXVkZU1lbUpzb24ocmVsYXRpdmVQYXRoLCByYXcpOwogIGNsYXVkZU1lbUJ1blBhdGgoYnVuUGF0aCk7CiAgaWYgKHJlbGF0aXZlUGF0aCA9PT0gJy5tY3AuanNvbicpIHsKICAgIGNvbnN0IHNlcnZlciA9IGlzUGxhaW5SZWNvcmQodmFsdWUubWNwU2VydmVycykgPyB2YWx1ZS5tY3BTZXJ2ZXJzWydtY3Atc2VhcmNoJ10gOiBudWxsOwogICAgaWYgKCFpc1BsYWluUmVjb3JkKHNlcnZlcikgfHwgc2VydmVyLnR5cGUgIT09ICdzdGRpbycgfHwgc2VydmVyLmNvbW1hbmQgIT09ICdub2RlJwogICAgICB8fCAhQXJyYXkuaXNBcnJheShzZXJ2ZXIuYXJncykgfHwgc2VydmVyLmFyZ3MubGVuZ3RoIDwgMiB8fCBzZXJ2ZXIuYXJnc1swXSAhPT0gJy1lJyB8fCB0eXBlb2Ygc2VydmVyLmFyZ3NbMV0gIT09ICdzdHJpbmcnKSB7CiAgICAgIHRocm93IG5ldyBFcnJvcignY2xhdWRlLW1lbTogaW52YWxpZCBtY3Atc2VhcmNoIHNjaGVtYScpOwogICAgfQogICAgc2VydmVyLmNvbW1hbmQgPSBidW5QYXRoOwogICAgcmV0dXJuIHsgdGV4dDogSlNPTi5zdHJpbmdpZnkodmFsdWUsIG51bGwsIDIpICsgJ1xuJywgcmVwbGFjZW1lbnRzOiAxIH07CiAgfQoKICBpZiAoIWlzUGxhaW5SZWNvcmQodmFsdWUuaG9va3MpKSB0aHJvdyBuZXcgRXJyb3IoJ2NsYXVkZS1tZW06IGludmFsaWQgaG9va3Mgc2NoZW1hJyk7CiAgY29uc3Qga25vd24gPSBbCiAgICB7IHRva2VuOiAnbm9kZSAiJF9QL3NjcmlwdHMvdmVyc2lvbi1jaGVjay5qcyInLCBsYWJlbDogJ3ZlcnNpb24tY2hlY2snIH0sCiAgICB7IHRva2VuOiAnbm9kZSAiJF9QL3NjcmlwdHMvYnVuLXJ1bm5lci5qcyInLCBsYWJlbDogJ2J1bi1ydW5uZXInIH0sCiAgXTsKICBjb25zdCBjb3VudHMgPSB7ICd2ZXJzaW9uLWNoZWNrJzogMCwgJ2J1bi1ydW5uZXInOiAwIH07CiAgY29uc3QgcXVvdGVkQnVuID0gcXVvdGVDbGF1ZGVNZW1Ib29rQnVuKGJ1blBhdGgpOwogIGZvciAoY29uc3QgZ3JvdXBzIG9mIE9iamVjdC52YWx1ZXModmFsdWUuaG9va3MpKSB7CiAgICBpZiAoIUFycmF5LmlzQXJyYXkoZ3JvdXBzKSkgdGhyb3cgbmV3IEVycm9yKCdjbGF1ZGUtbWVtOiBpbnZhbGlkIGhvb2tzIHNjaGVtYScpOwogICAgZm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHsKICAgICAgaWYgKCFpc1BsYWluUmVjb3JkKGdyb3VwKSB8fCAhQXJyYXkuaXNBcnJheShncm91cC5ob29rcykpIHRocm93IG5ldyBFcnJvcignY2xhdWRlLW1lbTogaW52YWxpZCBob29rcyBzY2hlbWEnKTsKICAgICAgZm9yIChjb25zdCBob29rIG9mIGdyb3VwLmhvb2tzKSB7CiAgICAgICAgaWYgKCFpc1BsYWluUmVjb3JkKGhvb2spIHx8IHR5cGVvZiBob29rLmNvbW1hbmQgIT09ICdzdHJpbmcnKSB0aHJvdyBuZXcgRXJyb3IoJ2NsYXVkZS1tZW06IGludmFsaWQgaG9vayBjb21tYW5kIHNjaGVtYScpOwogICAgICAgIGNvbnN0IHJlcGxhY2VtZW50cyA9IFtdOwogICAgICAgIGNvbnN0IGNvbW1hbmRDb3VudHMgPSB7ICd2ZXJzaW9uLWNoZWNrJzogMCwgJ2J1bi1ydW5uZXInOiAwIH07CiAgICAgICAgZm9yIChjb25zdCBwb3NpdGlvbiBvZiBjbGF1ZGVNZW1QbHVnaW5Ob2RlUG9zaXRpb25zKGhvb2suY29tbWFuZCkpIHsKICAgICAgICAgIGNvbnN0IGVudHJ5ID0ga25vd24uZmluZChjYW5kaWRhdGUgPT4gaG9vay5jb21tYW5kLnN0YXJ0c1dpdGgoY2FuZGlkYXRlLnRva2VuLCBwb3NpdGlvbikKICAgICAgICAgICAgJiYgKGhvb2suY29tbWFuZFtwb3NpdGlvbiArIGNhbmRpZGF0ZS50b2tlbi5sZW5ndGhdID09PSB1bmRlZmluZWQKICAgICAgICAgICAgICB8fCAvW1xzOyZ8XS8udGVzdChob29rLmNvbW1hbmRbcG9zaXRpb24gKyBjYW5kaWRhdGUudG9rZW4ubGVuZ3RoXSkpKTsKICAgICAgICAgIGlmICghZW50cnkpIHRocm93IG5ldyBFcnJvcignY2xhdWRlLW1lbTogcmVtYWluaW5nIHVua25vd24gTm9kZSBleGVjdXRhYmxlJyk7CiAgICAgICAgICBjb21tYW5kQ291bnRzW2VudHJ5LmxhYmVsXSArPSAxOwogICAgICAgICAgaWYgKGNvbW1hbmRDb3VudHNbZW50cnkubGFiZWxdID4gMSkgdGhyb3cgbmV3IEVycm9yKGBjbGF1ZGUtbWVtOiBkdXBsaWNhdGUgJHtlbnRyeS5sYWJlbH0gZXhlY3V0YWJsZWApOwogICAgICAgICAgcmVwbGFjZW1lbnRzLnB1c2goeyBwb3NpdGlvbiwgZW50cnkgfSk7CiAgICAgICAgfQogICAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzLnJldmVyc2UoKSkgewogICAgICAgICAgY29uc3QgYmVmb3JlID0gaG9vay5jb21tYW5kLnNsaWNlKDAsIHJlcGxhY2VtZW50LnBvc2l0aW9uKTsKICAgICAgICAgIGNvbnN0IGFmdGVyID0gaG9vay5jb21tYW5kLnNsaWNlKHJlcGxhY2VtZW50LnBvc2l0aW9uICsgcmVwbGFjZW1lbnQuZW50cnkudG9rZW4ubGVuZ3RoKTsKICAgICAgICAgIGhvb2suY29tbWFuZCA9IGAke2JlZm9yZX0ke3F1b3RlZEJ1bn0ke3JlcGxhY2VtZW50LmVudHJ5LnRva2VuLnNsaWNlKDQpfSR7YWZ0ZXJ9YDsKICAgICAgICAgIGNvdW50c1tyZXBsYWNlbWVudC5lbnRyeS5sYWJlbF0gKz0gMTsKICAgICAgICB9CiAgICAgIH0KICAgIH0KICB9CiAgaWYgKGNvdW50c1sndmVyc2lvbi1jaGVjayddIDwgMSB8fCBjb3VudHNbJ2J1bi1ydW5uZXInXSA8IDEpIHsKICAgIHRocm93IG5ldyBFcnJvcignY2xhdWRlLW1lbTogbWlzc2luZyByZXF1aXJlZCBob29rIHJlcGxhY2VtZW50Jyk7CiAgfQogIHJldHVybiB7IHRleHQ6IEpTT04uc3RyaW5naWZ5KHZhbHVlLCBudWxsLCAyKSArICdcbicsIHJlcGxhY2VtZW50czogY291bnRzWyd2ZXJzaW9uLWNoZWNrJ10gKyBjb3VudHNbJ2J1bi1ydW5uZXInXSB9Owp9CgpleHBvcnQgYXN5bmMgZnVuY3Rpb24gY29uZmlndXJlQ2xhdWRlTWVtQnVuKGNvbnRleHQsIHN0YXRlKSB7CiAgY29uc3Qgc3BlYyA9IFBMVUdJTl9CQVNFTElORVMubWVtb3J5OwogIGNvbnN0IGNvbXBsZXRlZFdyaXRlcyA9IFtdOwogIGxldCBvd25lcnNoaXBXcml0ZSA9IG51bGw7CiAgdHJ5IHsKICAgIGNsYXVkZU1lbUJ1blBhdGgoY29udGV4dC5idW5QYXRoKTsKICAgIGNvbnN0IGluc3RhbGxlZFBhdGggPSBqb2luKGNvbnRleHQuY2xhdWRlQ29uZmlnRGlyLCAncGx1Z2lucycsICdpbnN0YWxsZWRfcGx1Z2lucy5qc29uJyk7CiAgICBjb25zdCBpbnN0YWxsZWRTbmFwc2hvdCA9IGh1ZEZpbGVTbmFwc2hvdChjb250ZXh0LmNsYXVkZUNvbmZpZ0RpciwgaW5zdGFsbGVkUGF0aCwgJ2luc3RhbGxlZCBwbHVnaW4gc3RhdGUnLCB0cnVlKTsKICAgIGlmICghaW5zdGFsbGVkU25hcHNob3QucHJlc2VudCB8fCBpbnN0YWxsZWRTbmFwc2hvdC52YWx1ZS52ZXJzaW9uICE9PSAyIHx8ICFpc1BsYWluUmVjb3JkKGluc3RhbGxlZFNuYXBzaG90LnZhbHVlLnBsdWdpbnMpKSB7CiAgICAgIHRocm93IG5ldyBFcnJvcignY2xhdWRlLW1lbTogdW5zdXBwb3J0ZWQgaW5zdGFsbGVkIHBsdWdpbiBzY2hlbWEnKTsKICAgIH0KICAgIGNvbnN0IHNlbGVjdGVkID0gc2VsZWN0ZWRDbGF1ZGVNZW1JbnN0YWxsKGluc3RhbGxlZFNuYXBzaG90LnZhbHVlLCBjb250ZXh0LmNsYXVkZUNvbmZpZ0Rpcik7CiAgICBpZiAoIXNlbGVjdGVkIHx8IGNvbXBhcmVTZW12ZXIoc2VsZWN0ZWQucmVjb3JkLnZlcnNpb24sIHNwZWMudmVyc2lvbikgPCAwKSB7CiAgICAgIHRocm93IG5ldyBFcnJvcignY2xhdWRlLW1lbTogbm8gdmFsaWQgYmFzZWxpbmUgdXNlciBpbnN0YWxsYXRpb24nKTsKICAgIH0KICAgIGNvbnN0IHNlbGVjdGlvbiA9IGNhcHR1cmVDbGF1ZGVNZW1TZWxlY3Rpb24oaW5zdGFsbGVkU25hcHNob3QsIHNlbGVjdGVkLCBjb250ZXh0KTsKICAgIGNvbnN0IHN0YXRlUGF0aCA9IGpvaW4oY29udGV4dC5jbGF3Z29kRGlyLCAncGx1Z2luLWRlcGVuZGVuY2llcy1zdGF0ZS5qc29uJyk7CiAgICBjb25zdCBzdGF0ZVNuYXBzaG90ID0gaHVkRmlsZVNuYXBzaG90KGNvbnRleHQuY2xhd2dvZERpciwgc3RhdGVQYXRoLCAnb3duZXJzaGlwIHN0YXRlJywgdHJ1ZSk7CiAgICBjb25zdCBuZXh0U3RhdGUgPSB2YWxpZGF0ZU1hbmFnZWRIdWRTdGF0ZSgKICAgICAgc3RhdGVTbmFwc2hvdC5wcmVzZW50ID8gc3RhdGVTbmFwc2hvdC52YWx1ZSA6IHN0YXRlLAogICAgICAhc3RhdGVTbmFwc2hvdC5wcmVzZW50LAogICAgICB7IG1vZHVsZVBhdGg6IGpvaW4oY29udGV4dC5jbGF3Z29kRGlyLCAnY2xhdWRlLWh1ZC1zdGF0dXNsaW5lLm1qcycpLCBwbGF0Zm9ybTogY29udGV4dC5wbGF0Zm9ybSB8fCBwcm9jZXNzLnBsYXRmb3JtIH0sCiAgICApOwogICAgdmFsaWRhdGVDbGF1ZGVNZW1Pd25lcnNoaXBDb250ZXh0KG5leHRTdGF0ZS5jbGF1ZGVNZW0uZmlsZXMsIGNvbnRleHQpOwogICAgY29uc3QgZGVmaW5pdGlvbnMgPSBbCiAgICAgIHsgcmVsYXRpdmVQYXRoOiAnaG9va3MvaG9va3MuanNvbicsIHRhcmdldFBhdGg6IHJlc29sdmUoc2VsZWN0ZWQuaW5zdGFsbFBhdGgsICdob29rcycsICdob29rcy5qc29uJykgfSwKICAgICAgeyByZWxhdGl2ZVBhdGg6ICcubWNwLmpzb24nLCB0YXJnZXRQYXRoOiByZXNvbHZlKHNlbGVjdGVkLmluc3RhbGxQYXRoLCAnLm1jcC5qc29uJykgfSwKICAgIF07CiAgICBjb25zdCBwbGFucyA9IFtdOwogICAgZm9yIChjb25zdCBkZWZpbml0aW9uIG9mIGRlZmluaXRpb25zKSB7CiAgICAgIGNvbnN0IHNuYXBzaG90ID0gaHVkRmlsZVNuYXBzaG90KHNlbGVjdGVkLmluc3RhbGxQYXRoLCBkZWZpbml0aW9uLnRhcmdldFBhdGgsIGRlZmluaXRpb24ucmVsYXRpdmVQYXRoKTsKICAgICAgaWYgKCFzbmFwc2hvdC5wcmVzZW50KSB0aHJvdyBuZXcgRXJyb3IoYGNsYXVkZS1tZW06IG1pc3NpbmcgJHtkZWZpbml0aW9uLnJlbGF0aXZlUGF0aH1gKTsKICAgICAgY29uc3QgY3VycmVudEhhc2ggPSBmaWxlRmluZ2VycHJpbnQoc25hcHNob3QuYnl0ZXMpOwogICAgICBjb25zdCBwcmlvciA9IG5leHRTdGF0ZS5jbGF1ZGVNZW0uZmlsZXNbZGVmaW5pdGlvbi50YXJnZXRQYXRoXTsKICAgICAgaWYgKHByaW9yICYmIGN1cnJlbnRIYXNoID09PSBwcmlvci5tYW5hZ2VkU2hhMjU2KSB7CiAgICAgICAgcGxhbnMucHVzaCh7IC4uLmRlZmluaXRpb24sIHNuYXBzaG90LCBieXRlczogc25hcHNob3QuYnl0ZXMsIHdyaXRlOiBmYWxzZSB9KTsKICAgICAgICBjb250aW51ZTsKICAgICAgfQogICAgICBjb25zdCByZXdyaXR0ZW4gPSByZXdyaXRlQ2xhdWRlTWVtRmlsZShkZWZpbml0aW9uLnJlbGF0aXZlUGF0aCwgdGV4dERlY29kZXIuZGVjb2RlKHNuYXBzaG90LmJ5dGVzKSwgY29udGV4dC5idW5QYXRoKTsKICAgICAgY29uc3QgbWFuYWdlZEJ5dGVzID0gQnVmZmVyLmZyb20ocmV3cml0dGVuLnRleHQpOwogICAgICBuZXh0U3RhdGUuY2xhdWRlTWVtLmZpbGVzW2RlZmluaXRpb24udGFyZ2V0UGF0aF0gPSB7CiAgICAgICAgcmVsYXRpdmVQYXRoOiBkZWZpbml0aW9uLnJlbGF0aXZlUGF0aCwKICAgICAgICBwbHVnaW5WZXJzaW9uOiBzZWxlY3RlZC5yZWNvcmQudmVyc2lvbiwKICAgICAgICBvcmlnaW5hbEJhc2U2NDogc25hcHNob3QuYnl0ZXMudG9TdHJpbmcoJ2Jhc2U2NCcpLAogICAgICAgIG9yaWdpbmFsU2hhMjU2OiBjdXJyZW50SGFzaCwKICAgICAgICBtYW5hZ2VkU2hhMjU2OiBmaWxlRmluZ2VycHJpbnQobWFuYWdlZEJ5dGVzKSwKICAgICAgfTsKICAgICAgcGxhbnMucHVzaCh7IC4uLmRlZmluaXRpb24sIHNuYXBzaG90LCBieXRlczogbWFuYWdlZEJ5dGVzLCB3cml0ZTogdHJ1ZSB9KTsKICAgIH0KICAgIGlmIChwbGFucy5ldmVyeShwbGFuID0+ICFwbGFuLndyaXRlKSkgewogICAgICBjb25zdCBjYWxsZXJTdGF0ZVVwZGF0ZSA9IHN0YXRlICYmIHR5cGVvZiBzdGF0ZSA9PT0gJ29iamVjdCcKICAgICAgICA/IHsga2V5czogT2JqZWN0LmtleXMoc3RhdGUpLCB2YWx1ZTogc3RydWN0dXJlZENsb25lKG5leHRTdGF0ZSkgfQogICAgICAgIDogbnVsbDsKICAgICAgYXNzZXJ0SHVkU25hcHNob3RDdXJyZW50KHN0YXRlU25hcHNob3QsIGNvbnRleHQuY2xhd2dvZERpciwgJ293bmVyc2hpcCBzdGF0ZScpOwogICAgICBmb3IgKGNvbnN0IHBsYW4gb2YgcGxhbnMpIHsKICAgICAgICBhc3NlcnRIdWRTbmFwc2hvdEN1cnJlbnQocGxhbi5zbmFwc2hvdCwgc2VsZWN0ZWQuaW5zdGFsbFBhdGgsIGBjbGF1ZGUtbWVtICR7cGxhbi5yZWxhdGl2ZVBhdGh9YCk7CiAgICAgIH0KICAgICAgYXNzZXJ0Q2xhdWRlTWVtU2VsZWN0aW9uQ3VycmVudChzZWxlY3Rpb24sIGNvbnRleHQpOwogICAgICBpZiAoY2FsbGVyU3RhdGVVcGRhdGUpIHsKICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBjYWxsZXJTdGF0ZVVwZGF0ZS5rZXlzKSBkZWxldGUgc3RhdGVba2V5XTsKICAgICAgICBPYmplY3QuYXNzaWduKHN0YXRlLCBjYWxsZXJTdGF0ZVVwZGF0ZS52YWx1ZSk7CiAgICAgIH0KICAgICAgcmV0dXJuIHBsdWdpblJlc3VsdChzcGVjLCAnY29uZmlndXJlZCcsIHRydWUsIHNlbGVjdGVkLnJlY29yZC52ZXJzaW9uLCBgY29uZmlndXJlZCAke3NlbGVjdGVkLnJlY29yZC52ZXJzaW9ufWApOwogICAgfQoKICAgIGNvbnN0IHdyaXRlcyA9IFt7CiAgICAgIHJvb3Q6IGNvbnRleHQuY2xhd2dvZERpciwKICAgICAgc25hcHNob3Q6IHN0YXRlU25hcHNob3QsCiAgICAgIGJ5dGVzOiBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShuZXh0U3RhdGUsIG51bGwsIDIpICsgJ1xuJyksCiAgICAgIG1vZGU6IHN0YXRlU25hcHNob3QucHJlc2VudCA/IHN0YXRlU25hcHNob3QubW9kZSA6IDBvNjAwLAogICAgICBsYWJlbDogJ293bmVyc2hpcCBzdGF0ZScsCiAgICAgIHJlbGF0aXZlUGF0aDogbnVsbCwKICAgIH0sIC4uLnBsYW5zLmZpbHRlcihwbGFuID0+IHBsYW4ud3JpdGUpLm1hcChwbGFuID0+ICh7CiAgICAgIHJvb3Q6IHNlbGVjdGVkLmluc3RhbGxQYXRoLAogICAgICBzbmFwc2hvdDogcGxhbi5zbmFwc2hvdCwKICAgICAgYnl0ZXM6IHBsYW4uYnl0ZXMsCiAgICAgIG1vZGU6IHBsYW4uc25hcHNob3QubW9kZSwKICAgICAgbGFiZWw6IGBjbGF1ZGUtbWVtICR7cGxhbi5yZWxhdGl2ZVBhdGh9YCwKICAgICAgcmVsYXRpdmVQYXRoOiBwbGFuLnJlbGF0aXZlUGF0aCwKICAgIH0pKV07CiAgICBmb3IgKGNvbnN0IHdyaXRlIG9mIHdyaXRlcykgewogICAgICBpZiAod3JpdGUucmVsYXRpdmVQYXRoKSBjb250ZXh0Lm9uQ2xhdWRlTWVtV3JpdGluZz8uKHsgcmVsYXRpdmVQYXRoOiB3cml0ZS5yZWxhdGl2ZVBhdGggfSk7CiAgICAgIGFzc2VydENsYXVkZU1lbVNlbGVjdGlvbkN1cnJlbnQoc2VsZWN0aW9uLCBjb250ZXh0KTsKICAgICAgaWYgKHdyaXRlLnJlbGF0aXZlUGF0aCAmJiBvd25lcnNoaXBXcml0ZSkgewogICAgICAgIGFzc2VydEh1ZFNuYXBzaG90Q3VycmVudChvd25lcnNoaXBXcml0ZS5wb3N0V3JpdGUsIG93bmVyc2hpcFdyaXRlLnJvb3QsIG93bmVyc2hpcFdyaXRlLmxhYmVsKTsKICAgICAgfQogICAgICBhdG9taWNIdWRXcml0ZSh3cml0ZS5yb290LCB3cml0ZS5zbmFwc2hvdCwgd3JpdGUuYnl0ZXMsIHdyaXRlLm1vZGUsIHdyaXRlLmxhYmVsKTsKICAgICAgY29uc3QgY29tcGxldGVkV3JpdGUgPSB7IC4uLndyaXRlLCBwb3N0V3JpdGU6IGh1ZEZpbGVTbmFwc2hvdCh3cml0ZS5yb290LCB3cml0ZS5zbmFwc2hvdC5wYXRoLCB3cml0ZS5sYWJlbCkgfTsKICAgICAgY29tcGxldGVkV3JpdGVzLnB1c2goY29tcGxldGVkV3JpdGUpOwogICAgICBpZiAoIXdyaXRlLnJlbGF0aXZlUGF0aCkgb3duZXJzaGlwV3JpdGUgPSBjb21wbGV0ZWRXcml0ZTsKICAgICAgaWYgKHdyaXRlLnJlbGF0aXZlUGF0aCkgY29udGV4dC5vbkNsYXVkZU1lbVdyaXR0ZW4/Lih7IHJlbGF0aXZlUGF0aDogd3JpdGUucmVsYXRpdmVQYXRoIH0pOwogICAgfQogICAgYXNzZXJ0Q2xhdWRlTWVtU2VsZWN0aW9uQ3VycmVudChzZWxlY3Rpb24sIGNvbnRleHQpOwogICAgYXNzZXJ0SHVkU25hcHNob3RDdXJyZW50KG93bmVyc2hpcFdyaXRlLnBvc3RXcml0ZSwgb3duZXJzaGlwV3JpdGUucm9vdCwgb3duZXJzaGlwV3JpdGUubGFiZWwpOwogICAgaWYgKHN0YXRlICYmIHR5cGVvZiBzdGF0ZSA9PT0gJ29iamVjdCcpIHsKICAgICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoc3RhdGUpKSBkZWxldGUgc3RhdGVba2V5XTsKICAgICAgT2JqZWN0LmFzc2lnbihzdGF0ZSwgc3RydWN0dXJlZENsb25lKG5leHRTdGF0ZSkpOwogICAgfQogICAgcmV0dXJuIHBsdWdpblJlc3VsdChzcGVjLCAnY29uZmlndXJlZCcsIHRydWUsIHNlbGVjdGVkLnJlY29yZC52ZXJzaW9uLCBgY29uZmlndXJlZCAke3NlbGVjdGVkLnJlY29yZC52ZXJzaW9ufWApOwogIH0gY2F0Y2ggKGVycm9yKSB7CiAgICBjb25zdCByb2xsYmFjayA9IHJvbGxiYWNrQ2xhdWRlTWVtV3JpdGVzKGNvbXBsZXRlZFdyaXRlcyk7CiAgICBjb25zdCBwcmltYXJ5ID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnY2xhdWRlLW1lbSBjb25maWd1cmF0aW9uIGZhaWxlZCc7CiAgICBjb25zdCBtZXNzYWdlID0gcm9sbGJhY2suZXJyb3JzLmxlbmd0aCA+IDAKICAgICAgPyBgcm9sbGJhY2sgaW5jb21wbGV0ZTogJHtyb2xsYmFjay5lcnJvcnNbMF0ubWVzc2FnZX1gCiAgICAgIDogcm9sbGJhY2sudHJhbnNmZXJyZWQubGVuZ3RoID4gMAogICAgICAgID8gYCR7cHJpbWFyeX07IG93bmVyc2hpcCB0cmFuc2ZlcnJlZDogJHtyb2xsYmFjay50cmFuc2ZlcnJlZC5qb2luKCcsICcpfWAKICAgICAgICA6IHByaW1hcnk7CiAgICByZXR1cm4gcGx1Z2luUmVzdWx0KHNwZWMsICd3YXJuaW5nJywgZmFsc2UsIG51bGwsIGBwcmVzZXJ2ZWQgYnV0IG5vdCBCdW4tdmVyaWZpZWQ6ICR7bWVzc2FnZX1gKTsKICB9Cn0KCmZ1bmN0aW9uIGh1ZFN0YXR1c0xpbmVDb21tYW5kKGNvbnRleHQsIG1vZHVsZVBhdGgpIHsKICBjb25zdCBleGVjdXRhYmxlID0gY29udGV4dC5idW5QYXRoLnJlcGxhY2VBbGwoJ1xcJywgJy8nKS5zcGxpdCgnLycpLmF0KC0xKT8udG9Mb3dlckNhc2UoKTsKICBpZiAoZXhlY3V0YWJsZSAhPT0gJ2J1bicgJiYgZXhlY3V0YWJsZSAhPT0gJ2J1bi5leGUnKSB0aHJvdyBuZXcgRXJyb3IoJ2h1ZDogc3RhdHVzTGluZSBleGVjdXRhYmxlIGlzIG5vdCBCdW4nKTsKICBjb25zdCBjb21tYW5kID0gYCR7cXVvdGVTdGF0dXNMaW5lQXJnKGNvbnRleHQuYnVuUGF0aCwgY29udGV4dC5wbGF0Zm9ybSl9ICR7cXVvdGVTdGF0dXNMaW5lQXJnKG1vZHVsZVBhdGgsIGNvbnRleHQucGxhdGZvcm0pfWA7CiAgY29uc3QgbG93ZXJlZCA9IGNvbW1hbmQudG9Mb3dlckNhc2UoKTsKICBpZiAobG93ZXJlZC5pbmNsdWRlcygnYmFzaCAtYycpIHx8IGxvd2VyZWQuaW5jbHVkZXMoJyBscyAnKSB8fCBsb3dlcmVkLmluY2x1ZGVzKCcgaGVhZCAnKQogICAgfHwgY29tbWFuZC5pbmNsdWRlcygnJCgnKSB8fCBjb21tYW5kLmluY2x1ZGVzKCdgJykgfHwgY29tbWFuZC5pbmNsdWRlcygnKicpKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoJ2h1ZDogdW5zYWZlIHN0YXR1c0xpbmUgY29tbWFuZCcpOwogIH0KICByZXR1cm4gY29tbWFuZDsKfQoKY29uc3QgSFVEX1NUQVRVU0xJTkVfU09VUkNFX0pTT04gPSAiXCIjIS91c3IvYmluL2VudiBidW5cXG5pbXBvcnQgeyBsc3RhdFN5bmMsIHJlYWRGaWxlU3luYywgcmVhbHBhdGhTeW5jIH0gZnJvbSAnbm9kZTpmcyc7XFxuaW1wb3J0IHsgaXNBYnNvbHV0ZSwgam9pbiwgcmVsYXRpdmUsIHNlcCB9IGZyb20gJ25vZGU6cGF0aCc7XFxuXFxuY29uc3QgY2xhdWRlQ29uZmlnRGlyID0gXFxcIi9fX0NMQVdHT0RfSFVEX0NMQVVERV9DT05GSUdfRElSX19cXFwiO1xcbmNvbnN0IHBsdWdpbklkID0gJ2NsYXVkZS1odWRAY2xhdWRlLWh1ZCc7XFxuY29uc3Qgc2VtdmVyUGF0dGVybiA9IC9eKDB8WzEtOV1cXFxcZCopXFxcXC4oMHxbMS05XVxcXFxkKilcXFxcLigwfFsxLTldXFxcXGQqKSg/Oi0oWzAtOUEtWmEtei1dKyg/OlxcXFwuWzAtOUEtWmEtei1dKykqKSk/JC87XFxuZnVuY3Rpb24gcGFyc2VWZXJzaW9uKHZhbHVlKSB7XFxuICBjb25zdCBtYXRjaCA9IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyBzZW12ZXJQYXR0ZXJuLmV4ZWModmFsdWUpIDogbnVsbDtcXG4gIGlmICghbWF0Y2gpIHJldHVybiBudWxsO1xcbiAgY29uc3QgY29yZSA9IG1hdGNoLnNsaWNlKDEsIDQpLm1hcChOdW1iZXIpO1xcbiAgaWYgKCFjb3JlLmV2ZXJ5KE51bWJlci5pc1NhZmVJbnRlZ2VyKSkgcmV0dXJuIG51bGw7XFxuICBjb25zdCBwcmVyZWxlYXNlID0gbWF0Y2hbNF0gPyBtYXRjaFs0XS5zcGxpdCgnLicpLm1hcChpZGVudGlmaWVyID0+IHtcXG4gICAgaWYgKCEvXlxcXFxkKyQvLnRlc3QoaWRlbnRpZmllcikpIHJldHVybiBpZGVudGlmaWVyO1xcbiAgICBpZiAoIS9eKDB8WzEtOV1cXFxcZCopJC8udGVzdChpZGVudGlmaWVyKSkgcmV0dXJuIG51bGw7XFxuICAgIGNvbnN0IG51bWVyaWMgPSBOdW1iZXIoaWRlbnRpZmllcik7XFxuICAgIHJldHVybiBOdW1iZXIuaXNTYWZlSW50ZWdlcihudW1lcmljKSA/IG51bWVyaWMgOiBudWxsO1xcbiAgfSkgOiBbXTtcXG4gIHJldHVybiBwcmVyZWxlYXNlLmluY2x1ZGVzKG51bGwpID8gbnVsbCA6IHsgY29yZSwgcHJlcmVsZWFzZSB9O1xcbn1cXG5mdW5jdGlvbiBjb21wYXJlKGxlZnQsIHJpZ2h0KSB7XFxuICBjb25zdCBhID0gcGFyc2VWZXJzaW9uKGxlZnQpOyBjb25zdCBiID0gcGFyc2VWZXJzaW9uKHJpZ2h0KTtcXG4gIGlmICghYSB8fCAhYikgcmV0dXJuIDA7XFxuICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgMzsgaW5kZXgrKykgaWYgKGEuY29yZVtpbmRleF0gIT09IGIuY29yZVtpbmRleF0pIHJldHVybiBhLmNvcmVbaW5kZXhdIC0gYi5jb3JlW2luZGV4XTtcXG4gIGlmICghYS5wcmVyZWxlYXNlLmxlbmd0aCB8fCAhYi5wcmVyZWxlYXNlLmxlbmd0aCkgcmV0dXJuIGEucHJlcmVsZWFzZS5sZW5ndGggPyAtMSA6IGIucHJlcmVsZWFzZS5sZW5ndGggPyAxIDogMDtcXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBNYXRoLm1heChhLnByZXJlbGVhc2UubGVuZ3RoLCBiLnByZXJlbGVhc2UubGVuZ3RoKTsgaW5kZXgrKykge1xcbiAgICBpZiAoYS5wcmVyZWxlYXNlW2luZGV4XSA9PT0gdW5kZWZpbmVkKSByZXR1cm4gLTE7XFxuICAgIGlmIChiLnByZXJlbGVhc2VbaW5kZXhdID09PSB1bmRlZmluZWQpIHJldHVybiAxO1xcbiAgICBpZiAoYS5wcmVyZWxlYXNlW2luZGV4XSA9PT0gYi5wcmVyZWxlYXNlW2luZGV4XSkgY29udGludWU7XFxuICAgIGlmICh0eXBlb2YgYS5wcmVyZWxlYXNlW2luZGV4XSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIGIucHJlcmVsZWFzZVtpbmRleF0gIT09ICdudW1iZXInKSByZXR1cm4gLTE7XFxuICAgIGlmICh0eXBlb2YgYS5wcmVyZWxlYXNlW2luZGV4XSAhPT0gJ251bWJlcicgJiYgdHlwZW9mIGIucHJlcmVsZWFzZVtpbmRleF0gPT09ICdudW1iZXInKSByZXR1cm4gMTtcXG4gICAgcmV0dXJuIGEucHJlcmVsZWFzZVtpbmRleF0gPCBiLnByZXJlbGVhc2VbaW5kZXhdID8gLTEgOiAxO1xcbiAgfVxcbiAgcmV0dXJuIDA7XFxufVxcbmZ1bmN0aW9uIGNvbnRhaW5lZChyb290LCBwYXRoKSB7XFxuICBjb25zdCBjaGlsZCA9IHJlbGF0aXZlKHJvb3QsIHBhdGgpO1xcbiAgcmV0dXJuIGNoaWxkID09PSAnJyB8fCAoIWNoaWxkLnN0YXJ0c1dpdGgoJy4uJyArIHNlcCkgJiYgY2hpbGQgIT09ICcuLicgJiYgIWlzQWJzb2x1dGUoY2hpbGQpKTtcXG59XFxuZnVuY3Rpb24gY2FwdHVyZURpcmVjdG9yeUNoYWluKHJvb3QsIHRhcmdldCkge1xcbiAgaWYgKCFjb250YWluZWQocm9vdCwgdGFyZ2V0KSkgcmV0dXJuIG51bGw7XFxuICBjb25zdCBpZGVudGl0aWVzID0gW107XFxuICBsZXQgY3VycmVudCA9IHJvb3Q7XFxuICBmb3IgKGNvbnN0IHBhcnQgb2YgWycnLCAuLi5yZWxhdGl2ZShyb290LCB0YXJnZXQpLnNwbGl0KHNlcCkuZmlsdGVyKEJvb2xlYW4pXSkge1xcbiAgICBpZiAocGFydCkgY3VycmVudCA9IGpvaW4oY3VycmVudCwgcGFydCk7XFxuICAgIHRyeSB7XFxuICAgICAgY29uc3Qgc3RhdHVzID0gbHN0YXRTeW5jKGN1cnJlbnQpO1xcbiAgICAgIGlmIChzdGF0dXMuaXNTeW1ib2xpY0xpbmsoKSB8fCAhc3RhdHVzLmlzRGlyZWN0b3J5KCkpIHJldHVybiBudWxsO1xcbiAgICAgIGlkZW50aXRpZXMucHVzaCh7IHBhdGg6IGN1cnJlbnQsIGRldjogc3RhdHVzLmRldiwgaW5vOiBzdGF0dXMuaW5vLCBtb2RlOiBzdGF0dXMubW9kZSwgbmxpbms6IHN0YXR1cy5ubGluayB9KTtcXG4gICAgfSBjYXRjaCB7IHJldHVybiBudWxsOyB9XFxuICB9XFxuICByZXR1cm4gaWRlbnRpdGllcztcXG59XFxuZnVuY3Rpb24gdmFsaWRFbnRyeShyZWNvcmQsIGNhY2hlUm9vdCkge1xcbiAgaWYgKHJlY29yZD8uc2NvcGUgIT09ICd1c2VyJyB8fCAhcGFyc2VWZXJzaW9uKHJlY29yZC52ZXJzaW9uKSB8fCB0eXBlb2YgcmVjb3JkLmluc3RhbGxQYXRoICE9PSAnc3RyaW5nJyB8fCAhaXNBYnNvbHV0ZShyZWNvcmQuaW5zdGFsbFBhdGgpKSByZXR1cm4gbnVsbDtcXG4gIHRyeSB7XFxuICAgIGlmICghY29udGFpbmVkKGNhY2hlUm9vdCwgcmVjb3JkLmluc3RhbGxQYXRoKSkgcmV0dXJuIG51bGw7XFxuICAgIGNvbnN0IGNhY2hlU3RhdHVzID0gbHN0YXRTeW5jKGNhY2hlUm9vdCk7IGNvbnN0IGluc3RhbGxTdGF0dXMgPSBsc3RhdFN5bmMocmVjb3JkLmluc3RhbGxQYXRoKTtcXG4gICAgaWYgKGNhY2hlU3RhdHVzLmlzU3ltYm9saWNMaW5rKCkgfHwgIWNhY2hlU3RhdHVzLmlzRGlyZWN0b3J5KCkgfHwgaW5zdGFsbFN0YXR1cy5pc1N5bWJvbGljTGluaygpIHx8ICFpbnN0YWxsU3RhdHVzLmlzRGlyZWN0b3J5KCkpIHJldHVybiBudWxsO1xcbiAgICBjb25zdCByZWFsQ2FjaGUgPSByZWFscGF0aFN5bmMoY2FjaGVSb290KTsgY29uc3QgcmVhbEluc3RhbGwgPSByZWFscGF0aFN5bmMocmVjb3JkLmluc3RhbGxQYXRoKTtcXG4gICAgaWYgKHJlYWxDYWNoZSA9PT0gcmVhbEluc3RhbGwgfHwgIWNvbnRhaW5lZChyZWFsQ2FjaGUsIHJlYWxJbnN0YWxsKSkgcmV0dXJuIG51bGw7XFxuICAgIGNvbnN0IHNvdXJjZSA9IGpvaW4ocmVjb3JkLmluc3RhbGxQYXRoLCAnc3JjJyk7IGNvbnN0IGNhbmRpZGF0ZSA9IGpvaW4oc291cmNlLCAnaW5kZXgudHMnKTtcXG4gICAgY29uc3QgZGlyZWN0b3JpZXMgPSBjYXB0dXJlRGlyZWN0b3J5Q2hhaW4oY2xhdWRlQ29uZmlnRGlyLCBzb3VyY2UpO1xcbiAgICBpZiAoIWRpcmVjdG9yaWVzKSByZXR1cm4gbnVsbDtcXG4gICAgY29uc3Qgc291cmNlU3RhdHVzID0gbHN0YXRTeW5jKHNvdXJjZSk7IGNvbnN0IGVudHJ5U3RhdHVzID0gbHN0YXRTeW5jKGNhbmRpZGF0ZSk7XFxuICAgIGlmIChzb3VyY2VTdGF0dXMuaXNTeW1ib2xpY0xpbmsoKSB8fCAhc291cmNlU3RhdHVzLmlzRGlyZWN0b3J5KCkgfHwgZW50cnlTdGF0dXMuaXNTeW1ib2xpY0xpbmsoKSB8fCAhZW50cnlTdGF0dXMuaXNGaWxlKCkgfHwgZW50cnlTdGF0dXMubmxpbmsgIT09IDEpIHJldHVybiBudWxsO1xcbiAgICBjb25zdCBlbnRyeSA9IHJlYWxwYXRoU3luYyhjYW5kaWRhdGUpO1xcbiAgICByZXR1cm4gY29udGFpbmVkKHJlYWxJbnN0YWxsLCBlbnRyeSkgPyB7XFxuICAgICAgcmVjb3JkLCBlbnRyeSwgZGlyZWN0b3JpZXMsXFxuICAgICAgZW50cnlJZGVudGl0eToge1xcbiAgICAgICAgZGV2OiBlbnRyeVN0YXR1cy5kZXYsIGlubzogZW50cnlTdGF0dXMuaW5vLCBtb2RlOiBlbnRyeVN0YXR1cy5tb2RlLCBubGluazogZW50cnlTdGF0dXMubmxpbmssXFxuICAgICAgICBzaXplOiBlbnRyeVN0YXR1cy5zaXplLCBtdGltZU1zOiBlbnRyeVN0YXR1cy5tdGltZU1zLFxcbiAgICAgICAgc2hhMjU2OiBuZXcgQnVuLkNyeXB0b0hhc2hlcignc2hhMjU2JykudXBkYXRlKHJlYWRGaWxlU3luYyhlbnRyeSkpLmRpZ2VzdCgnaGV4JyksXFxuICAgICAgfSxcXG4gICAgfSA6IG51bGw7XFxuICB9IGNhdGNoIHsgcmV0dXJuIG51bGw7IH1cXG59XFxuZnVuY3Rpb24gcmV2YWxpZGF0ZShzZWxlY3RlZCkge1xcbiAgZm9yIChjb25zdCBleHBlY3RlZCBvZiBzZWxlY3RlZC5kaXJlY3Rvcmllcykge1xcbiAgICBjb25zdCBzdGF0dXMgPSBsc3RhdFN5bmMoZXhwZWN0ZWQucGF0aCk7XFxuICAgIGlmIChzdGF0dXMuaXNTeW1ib2xpY0xpbmsoKSB8fCAhc3RhdHVzLmlzRGlyZWN0b3J5KCkgfHwgc3RhdHVzLmRldiAhPT0gZXhwZWN0ZWQuZGV2IHx8IHN0YXR1cy5pbm8gIT09IGV4cGVjdGVkLmlub1xcbiAgICAgIHx8IHN0YXR1cy5tb2RlICE9PSBleHBlY3RlZC5tb2RlIHx8IHN0YXR1cy5ubGluayAhPT0gZXhwZWN0ZWQubmxpbmspIHRocm93IG5ldyBFcnJvcignSFVEIGRpcmVjdG9yeSBjaGFuZ2VkIGJlZm9yZSBleGVjdXRpb24nKTtcXG4gIH1cXG4gIGNvbnN0IHN0YXR1cyA9IGxzdGF0U3luYyhzZWxlY3RlZC5lbnRyeSk7XFxuICBjb25zdCBleHBlY3RlZCA9IHNlbGVjdGVkLmVudHJ5SWRlbnRpdHk7XFxuICBpZiAoc3RhdHVzLmlzU3ltYm9saWNMaW5rKCkgfHwgIXN0YXR1cy5pc0ZpbGUoKSB8fCBzdGF0dXMubmxpbmsgIT09IDEgfHwgc3RhdHVzLmRldiAhPT0gZXhwZWN0ZWQuZGV2IHx8IHN0YXR1cy5pbm8gIT09IGV4cGVjdGVkLmlub1xcbiAgICB8fCBzdGF0dXMubW9kZSAhPT0gZXhwZWN0ZWQubW9kZSB8fCBzdGF0dXMubmxpbmsgIT09IGV4cGVjdGVkLm5saW5rIHx8IHN0YXR1cy5zaXplICE9PSBleHBlY3RlZC5zaXplIHx8IHN0YXR1cy5tdGltZU1zICE9PSBleHBlY3RlZC5tdGltZU1zXFxuICAgIHx8IHJlYWxwYXRoU3luYyhzZWxlY3RlZC5lbnRyeSkgIT09IHNlbGVjdGVkLmVudHJ5XFxuICAgIHx8IG5ldyBCdW4uQ3J5cHRvSGFzaGVyKCdzaGEyNTYnKS51cGRhdGUocmVhZEZpbGVTeW5jKHNlbGVjdGVkLmVudHJ5KSkuZGlnZXN0KCdoZXgnKSAhPT0gZXhwZWN0ZWQuc2hhMjU2KSB7XFxuICAgIHRocm93IG5ldyBFcnJvcignSFVEIGVudHJ5IGNoYW5nZWQgYmVmb3JlIGV4ZWN1dGlvbicpO1xcbiAgfVxcbn1cXG5sZXQgc2VsZWN0ZWQ7XFxudHJ5IHtcXG4gIGNvbnN0IGluc3RhbGxlZFBhdGggPSBqb2luKGNsYXVkZUNvbmZpZ0RpciwgJ3BsdWdpbnMnLCAnaW5zdGFsbGVkX3BsdWdpbnMuanNvbicpO1xcbiAgY29uc3QgaW5zdGFsbGVkU3RhdHVzID0gbHN0YXRTeW5jKGluc3RhbGxlZFBhdGgpO1xcbiAgaWYgKGluc3RhbGxlZFN0YXR1cy5pc1N5bWJvbGljTGluaygpIHx8ICFpbnN0YWxsZWRTdGF0dXMuaXNGaWxlKCkpIHRocm93IG5ldyBFcnJvcignaW5zdGFsbGVkIHBsdWdpbiBzdGF0ZSBpcyB1bnNhZmUnKTtcXG4gIGNvbnN0IGluc3RhbGxlZCA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKGluc3RhbGxlZFBhdGgsICd1dGY4JykpO1xcbiAgaWYgKGluc3RhbGxlZD8udmVyc2lvbiAhPT0gMiB8fCAhaW5zdGFsbGVkLnBsdWdpbnMgfHwgdHlwZW9mIGluc3RhbGxlZC5wbHVnaW5zICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KGluc3RhbGxlZC5wbHVnaW5zKSkge1xcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkIGluc3RhbGxlZCBwbHVnaW4gc2NoZW1hJyk7XFxuICB9XFxuICBjb25zdCByZWNvcmRzID0gQXJyYXkuaXNBcnJheShpbnN0YWxsZWQ/LnBsdWdpbnM/LltwbHVnaW5JZF0pID8gaW5zdGFsbGVkLnBsdWdpbnNbcGx1Z2luSWRdIDogW107XFxuICBjb25zdCBjYWNoZVJvb3QgPSBqb2luKGNsYXVkZUNvbmZpZ0RpciwgJ3BsdWdpbnMnLCAnY2FjaGUnLCAnY2xhdWRlLWh1ZCcsICdjbGF1ZGUtaHVkJyk7XFxuICBzZWxlY3RlZCA9IHJlY29yZHMubWFwKHJlY29yZCA9PiB2YWxpZEVudHJ5KHJlY29yZCwgY2FjaGVSb290KSkuZmlsdGVyKEJvb2xlYW4pLnNvcnQoKGEsIGIpID0+IGNvbXBhcmUoYi5yZWNvcmQudmVyc2lvbiwgYS5yZWNvcmQudmVyc2lvbikpWzBdO1xcbiAgaWYgKCFzZWxlY3RlZCkgdGhyb3cgbmV3IEVycm9yKCdubyB2YWxpZCB1c2VyIEhVRCBpbnN0YWxsYXRpb24gaW4gdGhlIGNhbm9uaWNhbCBjYWNoZScpO1xcbiAgcmV2YWxpZGF0ZShzZWxlY3RlZCk7XFxufSBjYXRjaCAoZXJyb3IpIHtcXG4gIGNvbnNvbGUuZXJyb3IoJ2NsYXVkZS1odWQ6ICcgKyAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnbm8gdmFsaWQgdXNlciBIVUQgaW5zdGFsbGF0aW9uJykpO1xcbiAgcHJvY2Vzcy5leGl0KDEpO1xcbn1cXG5jb25zdCBjaGlsZCA9IEJ1bi5zcGF3bih7XFxuICBjbWQ6IFtwcm9jZXNzLmV4ZWNQYXRoLCBzZWxlY3RlZC5lbnRyeV0sXFxuICBzdGRpbjogJ2luaGVyaXQnLFxcbiAgc3Rkb3V0OiAnaW5oZXJpdCcsXFxuICBzdGRlcnI6ICdpbmhlcml0JyxcXG4gIGVudjogcHJvY2Vzcy5lbnYsXFxufSk7XFxucHJvY2Vzcy5leGl0KGF3YWl0IGNoaWxkLmV4aXRlZCk7XFxuXCIiOwpjb25zdCBIVURfU1RBVFVTTElORV9TT1VSQ0VfVE9LRU4gPSAnQEAnICsgJ0NMQVdHT0RfSFVEX1NUQVRVU0xJTkVfU09VUkNFX0pTT04nICsgJ0BAJzsKCmZ1bmN0aW9uIGh1ZFN0YXR1c0xpbmVTb3VyY2UoKSB7CiAgaWYgKEhVRF9TVEFUVVNMSU5FX1NPVVJDRV9KU09OID09PSBIVURfU1RBVFVTTElORV9TT1VSQ0VfVE9LRU4pIHsKICAgIHJldHVybiByZWFkRmlsZVN5bmMobmV3IFVSTCgnLi9jbGF1ZGUtaHVkLXN0YXR1c2xpbmUubWpzJywgaW1wb3J0Lm1ldGEudXJsKSwgJ3V0ZjgnKTsKICB9CiAgcmV0dXJuIEpTT04ucGFyc2UoSFVEX1NUQVRVU0xJTkVfU09VUkNFX0pTT04pOwp9CgpleHBvcnQgZnVuY3Rpb24gcmVuZGVySHVkU3RhdHVzTGluZU1vZHVsZShjb250ZXh0KSB7CiAgaWYgKCFpc0Fic29sdXRlKGNvbnRleHQuY2xhdWRlQ29uZmlnRGlyKSkgdGhyb3cgbmV3IEVycm9yKCdodWQ6IENsYXVkZSBjb25maWcgcGF0aCBtdXN0IGJlIGFic29sdXRlJyk7CiAgcmV0dXJuIGh1ZFN0YXR1c0xpbmVTb3VyY2UoKS5yZXBsYWNlKCJcIi9fX0NMQVdHT0RfSFVEX0NMQVVERV9DT05GSUdfRElSX19cIiIsIEpTT04uc3RyaW5naWZ5KGNvbnRleHQuY2xhdWRlQ29uZmlnRGlyKSk7Cn0KCmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25maWd1cmVIdWQoY29udGV4dCwgc3RhdGUpIHsKICBjb25zdCBzcGVjID0gUExVR0lOX0JBU0VMSU5FUy5odWQ7CiAgbGV0IGNyZWF0ZWRQYXJlbnQgPSBudWxsOwogIGNvbnN0IGNvbXBsZXRlZFdyaXRlcyA9IFtdOwogIHRyeSB7CiAgICBjb25zdCBpbnN0YWxsZWRQYXRoID0gam9pbihjb250ZXh0LmNsYXVkZUNvbmZpZ0RpciwgJ3BsdWdpbnMnLCAnaW5zdGFsbGVkX3BsdWdpbnMuanNvbicpOwogICAgY29uc3QgaW5zdGFsbGVkU25hcHNob3QgPSBodWRGaWxlU25hcHNob3QoY29udGV4dC5jbGF1ZGVDb25maWdEaXIsIGluc3RhbGxlZFBhdGgsICdpbnN0YWxsZWQgcGx1Z2luIHN0YXRlJywgdHJ1ZSk7CiAgICBpZiAoIWluc3RhbGxlZFNuYXBzaG90LnByZXNlbnQpIHRocm93IG5ldyBFcnJvcignaHVkOiBpbnN0YWxsZWQgcGx1Z2luIHN0YXRlIGlzIG1pc3NpbmcnKTsKICAgIGlmIChpbnN0YWxsZWRTbmFwc2hvdC52YWx1ZS52ZXJzaW9uICE9PSAyIHx8ICFpc1BsYWluUmVjb3JkKGluc3RhbGxlZFNuYXBzaG90LnZhbHVlLnBsdWdpbnMpKSB7CiAgICAgIHRocm93IG5ldyBFcnJvcignaHVkOiB1bnN1cHBvcnRlZCBpbnN0YWxsZWQgcGx1Z2luIHNjaGVtYScpOwogICAgfQogICAgY29uc3Qgc2VsZWN0ZWQgPSBzZWxlY3RlZEh1ZEluc3RhbGwoaW5zdGFsbGVkU25hcHNob3QudmFsdWUsIGNvbnRleHQuY2xhdWRlQ29uZmlnRGlyKTsKICAgIGlmICghc2VsZWN0ZWQgfHwgY29tcGFyZVNlbXZlcihzZWxlY3RlZC5yZWNvcmQudmVyc2lvbiwgc3BlYy52ZXJzaW9uKSA8IDApIHRocm93IG5ldyBFcnJvcignaHVkOiBubyB2YWxpZCBiYXNlbGluZSB1c2VyIEhVRCBpbnN0YWxsYXRpb24nKTsKCiAgICBjb25zdCBjb25maWdQYXRoID0gam9pbihjb250ZXh0LmNsYXVkZUNvbmZpZ0RpciwgJ3BsdWdpbnMnLCAnY2xhdWRlLWh1ZCcsICdjb25maWcuanNvbicpOwogICAgY29uc3Qgc2V0dGluZ3NQYXRoID0gam9pbihjb250ZXh0LmNsYXVkZUNvbmZpZ0RpciwgJ3NldHRpbmdzLmpzb24nKTsKICAgIGNvbnN0IG1vZHVsZVBhdGggPSBqb2luKGNvbnRleHQuY2xhd2dvZERpciwgJ2NsYXVkZS1odWQtc3RhdHVzbGluZS5tanMnKTsKICAgIGNvbnN0IHN0YXRlUGF0aCA9IGpvaW4oY29udGV4dC5jbGF3Z29kRGlyLCAncGx1Z2luLWRlcGVuZGVuY2llcy1zdGF0ZS5qc29uJyk7CiAgICBjb25zdCBzZXR0aW5nc1NuYXBzaG90ID0gaHVkRmlsZVNuYXBzaG90KGNvbnRleHQuY2xhdWRlQ29uZmlnRGlyLCBzZXR0aW5nc1BhdGgsICdzZXR0aW5ncycsIHRydWUpOwogICAgY29uc3QgbW9kdWxlU25hcHNob3QgPSBodWRGaWxlU25hcHNob3QoY29udGV4dC5jbGF3Z29kRGlyLCBtb2R1bGVQYXRoLCAnc3RhdHVzLWxpbmUgbW9kdWxlJyk7CiAgICBjb25zdCBzdGF0ZVNuYXBzaG90ID0gaHVkRmlsZVNuYXBzaG90KGNvbnRleHQuY2xhd2dvZERpciwgc3RhdGVQYXRoLCAnb3duZXJzaGlwIHN0YXRlJywgdHJ1ZSk7CiAgICBjb25zdCBuZXh0U3RhdGUgPSBjdXJyZW50SHVkU3RhdGUoc3RhdGVTbmFwc2hvdC5wcmVzZW50ID8gc3RhdGVTbmFwc2hvdC52YWx1ZSA6IHN0YXRlLCBzdGF0ZVNuYXBzaG90LnByZXNlbnQsIGNvbnRleHQsIG1vZHVsZVBhdGgpOwogICAgY29uc3QgY29uZmlnUGxhbiA9IHBsYW5IdWRDb25maWdTbmFwc2hvdChjb250ZXh0LmNsYXVkZUNvbmZpZ0RpciwgY29uZmlnUGF0aCk7CiAgICBjb25zdCBwcmVwYXJlZENvbmZpZyA9IGNyZWF0ZUh1ZENvbmZpZ1BhcmVudChjb250ZXh0LmNsYXVkZUNvbmZpZ0RpciwgY29uZmlnUGxhbik7CiAgICBjb25zdCBjb25maWdTbmFwc2hvdCA9IHByZXBhcmVkQ29uZmlnLnNuYXBzaG90OwogICAgY3JlYXRlZFBhcmVudCA9IHByZXBhcmVkQ29uZmlnLmNyZWF0ZWRQYXJlbnQ7CiAgICBjb25zdCBzZXR0aW5ncyA9IHNldHRpbmdzU25hcHNob3QucHJlc2VudCA/IHNldHRpbmdzU25hcHNob3QudmFsdWUgOiB7fTsKICAgIGNvbnN0IHByaW9yQ29uZmlnID0gbmV4dFN0YXRlLmh1ZC5jb25maWc7CiAgICBpZiAoIXByaW9yQ29uZmlnPy5tYW5hZ2VkU2hhMjU2IHx8ICFjb25maWdTbmFwc2hvdC5wcmVzZW50IHx8IGZpbGVGaW5nZXJwcmludChjb25maWdTbmFwc2hvdC5ieXRlcykgIT09IHByaW9yQ29uZmlnLm1hbmFnZWRTaGEyNTYpIHsKICAgICAgbmV4dFN0YXRlLmh1ZC5jb25maWcgPSB7CiAgICAgICAgb3JpZ2luYWxQcmVzZW50OiBjb25maWdTbmFwc2hvdC5wcmVzZW50LAogICAgICAgIG9yaWdpbmFsQmFzZTY0OiBjb25maWdTbmFwc2hvdC5wcmVzZW50ID8gY29uZmlnU25hcHNob3QuYnl0ZXMudG9TdHJpbmcoJ2Jhc2U2NCcpIDogJycsCiAgICAgICAgbWFuYWdlZFNoYTI1NjogZmlsZUZpbmdlcnByaW50KEhVRF9DT05GSUdfVEVYVCksCiAgICAgIH07CiAgICB9IGVsc2UgewogICAgICBuZXh0U3RhdGUuaHVkLmNvbmZpZy5tYW5hZ2VkU2hhMjU2ID0gZmlsZUZpbmdlcnByaW50KEhVRF9DT05GSUdfVEVYVCk7CiAgICB9CgogICAgY29uc3QgbW9kdWxlVGV4dCA9IHJlbmRlckh1ZFN0YXR1c0xpbmVNb2R1bGUoY29udGV4dCk7CiAgICBjb25zdCBjb21tYW5kID0gaHVkU3RhdHVzTGluZUNvbW1hbmQoY29udGV4dCwgbW9kdWxlUGF0aCk7CiAgICBjb25zdCBtYW5hZ2VkVmFsdWUgPSB7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZCB9OwogICAgY29uc3QgY3VycmVudFByZXNlbnQgPSBPYmplY3QuaGFzT3duKHNldHRpbmdzLCAnc3RhdHVzTGluZScpOwogICAgY29uc3QgY3VycmVudFZhbHVlID0gc2V0dGluZ3Muc3RhdHVzTGluZTsKICAgIGNvbnN0IHByaW9yU3RhdHVzID0gbmV4dFN0YXRlLmh1ZC5zdGF0dXNMaW5lOwogICAgaWYgKCFwcmlvclN0YXR1cz8ubWFuYWdlZFNoYTI1NiB8fCAhY3VycmVudFByZXNlbnQgfHwganNvbkZpbmdlcnByaW50KGN1cnJlbnRWYWx1ZSkgIT09IHByaW9yU3RhdHVzLm1hbmFnZWRTaGEyNTYpIHsKICAgICAgbmV4dFN0YXRlLmh1ZC5zdGF0dXNMaW5lID0gewogICAgICAgIG9yaWdpbmFsUHJlc2VudDogY3VycmVudFByZXNlbnQsCiAgICAgICAgb3JpZ2luYWxWYWx1ZTogY3VycmVudFByZXNlbnQgPyBzdHJ1Y3R1cmVkQ2xvbmUoY3VycmVudFZhbHVlKSA6IG51bGwsCiAgICAgICAgbWFuYWdlZFZhbHVlLAogICAgICAgIG1hbmFnZWRTaGEyNTY6IGpzb25GaW5nZXJwcmludChtYW5hZ2VkVmFsdWUpLAogICAgICB9OwogICAgfSBlbHNlIHsKICAgICAgbmV4dFN0YXRlLmh1ZC5zdGF0dXNMaW5lLm1hbmFnZWRWYWx1ZSA9IG1hbmFnZWRWYWx1ZTsKICAgICAgbmV4dFN0YXRlLmh1ZC5zdGF0dXNMaW5lLm1hbmFnZWRTaGEyNTYgPSBqc29uRmluZ2VycHJpbnQobWFuYWdlZFZhbHVlKTsKICAgIH0KICAgIGNvbnN0IG5leHRTZXR0aW5ncyA9IHsgLi4uc2V0dGluZ3MsIHN0YXR1c0xpbmU6IG1hbmFnZWRWYWx1ZSB9OwogICAgY29uc3Qgc3RhdGVUZXh0ID0gSlNPTi5zdHJpbmdpZnkobmV4dFN0YXRlLCBudWxsLCAyKSArICdcbic7CgogICAgY29uc3Qgd3JpdGVzID0gWwogICAgICB7IHJvb3Q6IGNvbnRleHQuY2xhd2dvZERpciwgc25hcHNob3Q6IHN0YXRlU25hcHNob3QsIGJ5dGVzOiBCdWZmZXIuZnJvbShzdGF0ZVRleHQpLCBtb2RlOiBzdGF0ZVNuYXBzaG90LnByZXNlbnQgPyBzdGF0ZVNuYXBzaG90Lm1vZGUgOiAwbzYwMCwgbGFiZWw6ICdvd25lcnNoaXAgc3RhdGUnIH0sCiAgICAgIHsgcm9vdDogY29udGV4dC5jbGF3Z29kRGlyLCBzbmFwc2hvdDogbW9kdWxlU25hcHNob3QsIGJ5dGVzOiBCdWZmZXIuZnJvbShtb2R1bGVUZXh0KSwgbW9kZTogbW9kdWxlU25hcHNob3QucHJlc2VudCA/IG1vZHVsZVNuYXBzaG90Lm1vZGUgOiAwbzcwMCwgbGFiZWw6ICdzdGF0dXMtbGluZSBtb2R1bGUnIH0sCiAgICAgIHsgcm9vdDogY29udGV4dC5jbGF1ZGVDb25maWdEaXIsIHNuYXBzaG90OiBjb25maWdTbmFwc2hvdCwgYnl0ZXM6IEJ1ZmZlci5mcm9tKEhVRF9DT05GSUdfVEVYVCksIG1vZGU6IGNvbmZpZ1NuYXBzaG90LnByZXNlbnQgPyBjb25maWdTbmFwc2hvdC5tb2RlIDogMG82MDAsIGxhYmVsOiAnSFVEIGNvbmZpZycgfSwKICAgICAgeyByb290OiBjb250ZXh0LmNsYXVkZUNvbmZpZ0Rpciwgc25hcHNob3Q6IHNldHRpbmdzU25hcHNob3QsIGJ5dGVzOiBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShuZXh0U2V0dGluZ3MsIG51bGwsIDIpICsgJ1xuJyksIG1vZGU6IHNldHRpbmdzU25hcHNob3QucHJlc2VudCA/IHNldHRpbmdzU25hcHNob3QubW9kZSA6IDBvNjAwLCBsYWJlbDogJ3NldHRpbmdzJyB9LAogICAgXTsKICAgIGZvciAoY29uc3Qgd3JpdGUgb2Ygd3JpdGVzKSB7CiAgICAgIGNvbnRleHQub25IdWRXcml0aW5nPy4oeyBsYWJlbDogd3JpdGUubGFiZWwgfSk7CiAgICAgIGF0b21pY0h1ZFdyaXRlKHdyaXRlLnJvb3QsIHdyaXRlLnNuYXBzaG90LCB3cml0ZS5ieXRlcywgd3JpdGUubW9kZSwgd3JpdGUubGFiZWwpOwogICAgICBjb21wbGV0ZWRXcml0ZXMucHVzaCh7IC4uLndyaXRlLCBwb3N0V3JpdGU6IGh1ZEZpbGVTbmFwc2hvdCh3cml0ZS5yb290LCB3cml0ZS5zbmFwc2hvdC5wYXRoLCB3cml0ZS5sYWJlbCkgfSk7CiAgICAgIGNvbnRleHQub25IdWRXcml0dGVuPy4oeyBsYWJlbDogd3JpdGUubGFiZWwgfSk7CiAgICB9CiAgICBpZiAoc3RhdGUgJiYgdHlwZW9mIHN0YXRlID09PSAnb2JqZWN0JykgewogICAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhzdGF0ZSkpIGRlbGV0ZSBzdGF0ZVtrZXldOwogICAgICBPYmplY3QuYXNzaWduKHN0YXRlLCBzdHJ1Y3R1cmVkQ2xvbmUobmV4dFN0YXRlKSk7CiAgICB9CiAgICByZXR1cm4gcGx1Z2luUmVzdWx0KHNwZWMsICdjb25maWd1cmVkJywgdHJ1ZSwgc2VsZWN0ZWQucmVjb3JkLnZlcnNpb24sIGBjb25maWd1cmVkICR7c2VsZWN0ZWQucmVjb3JkLnZlcnNpb259YCk7CiAgfSBjYXRjaCAoZXJyb3IpIHsKICAgIGNvbnN0IHJvbGxiYWNrRXJyb3JzID0gW107CiAgICBmb3IgKGNvbnN0IHdyaXRlIG9mIGNvbXBsZXRlZFdyaXRlcy5yZXZlcnNlKCkpIHsKICAgICAgdHJ5IHsgcm9sbGJhY2tIdWRXcml0ZSh3cml0ZSk7IH0KICAgICAgY2F0Y2ggKHJvbGxiYWNrRXJyb3IpIHsgcm9sbGJhY2tFcnJvcnMucHVzaChyb2xsYmFja0Vycm9yKTsgYnJlYWs7IH0KICAgIH0KICAgIGlmIChyb2xsYmFja0Vycm9ycy5sZW5ndGggPT09IDApIHsKICAgICAgdHJ5IHsgcmVtb3ZlQ3JlYXRlZEh1ZENvbmZpZ1BhcmVudChjcmVhdGVkUGFyZW50KTsgfSBjYXRjaCAocm9sbGJhY2tFcnJvcikgeyByb2xsYmFja0Vycm9ycy5wdXNoKHJvbGxiYWNrRXJyb3IpOyB9CiAgICB9CiAgICBpZiAocm9sbGJhY2tFcnJvcnMubGVuZ3RoID4gMCkgcmV0dXJuIHBsdWdpblJlc3VsdChzcGVjLCAnd2FybmluZycsIGZhbHNlLCBudWxsLCBgaHVkOiByb2xsYmFjayBpbmNvbXBsZXRlOiAke3JvbGxiYWNrRXJyb3JzWzBdLm1lc3NhZ2V9YCk7CiAgICByZXR1cm4gcGx1Z2luUmVzdWx0KHNwZWMsICd3YXJuaW5nJywgZmFsc2UsIG51bGwsIGVycm9yLm1lc3NhZ2UpOwogIH0KfQoKZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlc3RvcmVIdWQoY29udGV4dCwgc3RhdGUpIHsKICBjb25zdCBjb21wbGV0ZWRXcml0ZXMgPSBbXTsKICB0cnkgewogICAgY29uc3Qgc3RhdGVQYXRoID0gam9pbihjb250ZXh0LmNsYXdnb2REaXIsICdwbHVnaW4tZGVwZW5kZW5jaWVzLXN0YXRlLmpzb24nKTsKICAgIGNvbnN0IG1vZHVsZVBhdGggPSBqb2luKGNvbnRleHQuY2xhd2dvZERpciwgJ2NsYXVkZS1odWQtc3RhdHVzbGluZS5tanMnKTsKICAgIGNvbnN0IGNvbmZpZ1BhdGggPSBqb2luKGNvbnRleHQuY2xhdWRlQ29uZmlnRGlyLCAncGx1Z2lucycsICdjbGF1ZGUtaHVkJywgJ2NvbmZpZy5qc29uJyk7CiAgICBjb25zdCBzZXR0aW5nc1BhdGggPSBqb2luKGNvbnRleHQuY2xhdWRlQ29uZmlnRGlyLCAnc2V0dGluZ3MuanNvbicpOwogICAgY29uc3Qgc3RhdGVTbmFwc2hvdCA9IGh1ZEZpbGVTbmFwc2hvdChjb250ZXh0LmNsYXdnb2REaXIsIHN0YXRlUGF0aCwgJ293bmVyc2hpcCBzdGF0ZScsIHRydWUpOwogICAgaWYgKCFzdGF0ZVNuYXBzaG90LnByZXNlbnQpIHJldHVybiB7IHJlc3RvcmVkOiBbXSwgY29uZmxpY3RzOiBbXSwgZmFpbHVyZXM6IFtdIH07CiAgICBjb25zdCBvd25lcnNoaXBTdGF0ZSA9IGN1cnJlbnRIdWRTdGF0ZShzdGF0ZVNuYXBzaG90LnZhbHVlLCB0cnVlLCBjb250ZXh0LCBtb2R1bGVQYXRoKTsKICAgIGlmIChPYmplY3Qua2V5cyhvd25lcnNoaXBTdGF0ZS5odWQpLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHsgcmVzdG9yZWQ6IFtdLCBjb25mbGljdHM6IFtdLCBmYWlsdXJlczogW10gfTsKICAgIGNvbnN0IG93bmVyc2hpcCA9IG93bmVyc2hpcFN0YXRlLmh1ZDsKICAgIGNvbnN0IGNvbmZpZ1NuYXBzaG90ID0gaHVkRmlsZVNuYXBzaG90KGNvbnRleHQuY2xhdWRlQ29uZmlnRGlyLCBjb25maWdQYXRoLCAnSFVEIGNvbmZpZycpOwogICAgY29uc3Qgc2V0dGluZ3NTbmFwc2hvdCA9IGh1ZEZpbGVTbmFwc2hvdChjb250ZXh0LmNsYXVkZUNvbmZpZ0Rpciwgc2V0dGluZ3NQYXRoLCAnc2V0dGluZ3MnLCB0cnVlKTsKICAgIGNvbnN0IHJlc3RvcmVkID0gW107CiAgICBjb25zdCBjb25mbGljdHMgPSBbXTsKICAgIGNvbnN0IG93bnNDb25maWcgPSBjb25maWdTbmFwc2hvdC5wcmVzZW50ICYmIGZpbGVGaW5nZXJwcmludChjb25maWdTbmFwc2hvdC5ieXRlcykgPT09IG93bmVyc2hpcC5jb25maWcubWFuYWdlZFNoYTI1NjsKICAgIGlmICghb3duc0NvbmZpZykgY29uZmxpY3RzLnB1c2goJ2h1ZCBjb25maWcnKTsKICAgIGNvbnN0IHNldHRpbmdzID0gc2V0dGluZ3NTbmFwc2hvdC5wcmVzZW50ID8gc2V0dGluZ3NTbmFwc2hvdC52YWx1ZSA6IHt9OwogICAgY29uc3Qgb3duc1N0YXR1c0xpbmUgPSBPYmplY3QuaGFzT3duKHNldHRpbmdzLCAnc3RhdHVzTGluZScpCiAgICAgICYmIGpzb25GaW5nZXJwcmludChzZXR0aW5ncy5zdGF0dXNMaW5lKSA9PT0gb3duZXJzaGlwLnN0YXR1c0xpbmUubWFuYWdlZFNoYTI1NjsKICAgIGlmICghb3duc1N0YXR1c0xpbmUpIGNvbmZsaWN0cy5wdXNoKCdzdGF0dXNMaW5lJyk7CiAgICBpZiAoIW93bnNDb25maWcgJiYgIW93bnNTdGF0dXNMaW5lKSByZXR1cm4geyByZXN0b3JlZCwgY29uZmxpY3RzLCBmYWlsdXJlczogW10gfTsKCiAgICBjb25zdCBvcGVyYXRpb25zID0gW107CiAgICBpZiAob3duc1N0YXR1c0xpbmUpIHsKICAgICAgY29uc3QgbmV4dFNldHRpbmdzID0geyAuLi5zZXR0aW5ncyB9OwogICAgICBpZiAob3duZXJzaGlwLnN0YXR1c0xpbmUub3JpZ2luYWxQcmVzZW50KSBuZXh0U2V0dGluZ3Muc3RhdHVzTGluZSA9IHN0cnVjdHVyZWRDbG9uZShvd25lcnNoaXAuc3RhdHVzTGluZS5vcmlnaW5hbFZhbHVlKTsKICAgICAgZWxzZSBkZWxldGUgbmV4dFNldHRpbmdzLnN0YXR1c0xpbmU7CiAgICAgIG9wZXJhdGlvbnMucHVzaCh7CiAgICAgICAgcm9vdDogY29udGV4dC5jbGF1ZGVDb25maWdEaXIsCiAgICAgICAgc25hcHNob3Q6IHNldHRpbmdzU25hcHNob3QsCiAgICAgICAgYnl0ZXM6IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KG5leHRTZXR0aW5ncywgbnVsbCwgMikgKyAnXG4nKSwKICAgICAgICBtb2RlOiBzZXR0aW5nc1NuYXBzaG90Lm1vZGUgfHwgMG82MDAsCiAgICAgICAgcmVtb3ZlOiAhb3duZXJzaGlwLnN0YXR1c0xpbmUub3JpZ2luYWxQcmVzZW50ICYmIE9iamVjdC5rZXlzKG5leHRTZXR0aW5ncykubGVuZ3RoID09PSAwLAogICAgICAgIGxhYmVsOiAnc2V0dGluZ3MnLAogICAgICAgIHJlc3RvcmVkTGFiZWw6ICdzdGF0dXNMaW5lJywKICAgICAgfSk7CiAgICB9CiAgICBpZiAob3duc0NvbmZpZykgewogICAgICBvcGVyYXRpb25zLnB1c2goewogICAgICAgIHJvb3Q6IGNvbnRleHQuY2xhdWRlQ29uZmlnRGlyLAogICAgICAgIHNuYXBzaG90OiBjb25maWdTbmFwc2hvdCwKICAgICAgICBieXRlczogQnVmZmVyLmZyb20ob3duZXJzaGlwLmNvbmZpZy5vcmlnaW5hbEJhc2U2NCwgJ2Jhc2U2NCcpLAogICAgICAgIG1vZGU6IGNvbmZpZ1NuYXBzaG90Lm1vZGUsCiAgICAgICAgcmVtb3ZlOiAhb3duZXJzaGlwLmNvbmZpZy5vcmlnaW5hbFByZXNlbnQsCiAgICAgICAgbGFiZWw6ICdIVUQgY29uZmlnJywKICAgICAgICByZXN0b3JlZExhYmVsOiAnaHVkIGNvbmZpZycsCiAgICAgIH0pOwogICAgfQogICAgb3BlcmF0aW9ucy5wdXNoKHsKICAgICAgcm9vdDogY29udGV4dC5jbGF3Z29kRGlyLAogICAgICBzbmFwc2hvdDogc3RhdGVTbmFwc2hvdCwKICAgICAgYnl0ZXM6IHN0YXRlU25hcHNob3QuYnl0ZXMsCiAgICAgIG1vZGU6IHN0YXRlU25hcHNob3QubW9kZSwKICAgICAgcmVtb3ZlOiBmYWxzZSwKICAgICAgbGFiZWw6ICdvd25lcnNoaXAgc3RhdGUnLAogICAgICByZXN0b3JlZExhYmVsOiBudWxsLAogICAgfSk7CgogICAgZm9yIChjb25zdCBvcGVyYXRpb24gb2Ygb3BlcmF0aW9ucykgewogICAgICBjb250ZXh0Lm9uSHVkUmVzdG9yaW5nPy4oeyBsYWJlbDogb3BlcmF0aW9uLmxhYmVsIH0pOwogICAgICBpZiAob3BlcmF0aW9uLnJlbW92ZSkgYXRvbWljSHVkUmVtb3ZlKG9wZXJhdGlvbi5yb290LCBvcGVyYXRpb24uc25hcHNob3QsIG9wZXJhdGlvbi5sYWJlbCk7CiAgICAgIGVsc2UgYXRvbWljSHVkV3JpdGUob3BlcmF0aW9uLnJvb3QsIG9wZXJhdGlvbi5zbmFwc2hvdCwgb3BlcmF0aW9uLmJ5dGVzLCBvcGVyYXRpb24ubW9kZSwgb3BlcmF0aW9uLmxhYmVsKTsKICAgICAgY29tcGxldGVkV3JpdGVzLnB1c2goewogICAgICAgIC4uLm9wZXJhdGlvbiwKICAgICAgICBwb3N0V3JpdGU6IGh1ZEZpbGVTbmFwc2hvdChvcGVyYXRpb24ucm9vdCwgb3BlcmF0aW9uLnNuYXBzaG90LnBhdGgsIG9wZXJhdGlvbi5sYWJlbCksCiAgICAgIH0pOwogICAgICBpZiAob3BlcmF0aW9uLnJlc3RvcmVkTGFiZWwpIHJlc3RvcmVkLnB1c2gob3BlcmF0aW9uLnJlc3RvcmVkTGFiZWwpOwogICAgICBjb250ZXh0Lm9uSHVkUmVzdG9yZWQ/Lih7IGxhYmVsOiBvcGVyYXRpb24ubGFiZWwgfSk7CiAgICB9CiAgICByZXR1cm4geyByZXN0b3JlZCwgY29uZmxpY3RzLCBmYWlsdXJlczogW10gfTsKICB9IGNhdGNoIChlcnJvcikgewogICAgY29uc3Qgcm9sbGJhY2tFcnJvcnMgPSBbXTsKICAgIGZvciAoY29uc3Qgd3JpdGUgb2YgY29tcGxldGVkV3JpdGVzLnJldmVyc2UoKSkgewogICAgICB0cnkgeyByb2xsYmFja0h1ZFdyaXRlKHdyaXRlKTsgfQogICAgICBjYXRjaCAocm9sbGJhY2tFcnJvcikgeyByb2xsYmFja0Vycm9ycy5wdXNoKHJvbGxiYWNrRXJyb3IpOyBicmVhazsgfQogICAgfQogICAgY29uc3QgbWVzc2FnZSA9IHJvbGxiYWNrRXJyb3JzLmxlbmd0aCA+IDAKICAgICAgPyBgaHVkOiByb2xsYmFjayBpbmNvbXBsZXRlOiAke3JvbGxiYWNrRXJyb3JzWzBdLm1lc3NhZ2V9YAogICAgICA6IChlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdodWQ6IHJlc3RvcmUgZmFpbGVkJyk7CiAgICByZXR1cm4geyByZXN0b3JlZDogW10sIGNvbmZsaWN0czogW10sIGZhaWx1cmVzOiBbbWVzc2FnZV0gfTsKICB9Cn0KCmFzeW5jIGZ1bmN0aW9uIHJlc3RvcmVDbGF1ZGVNZW1JbnRlZ3JhdGlvbnMoY29udGV4dCkgewogIGNvbnN0IGNvbXBsZXRlZFdyaXRlcyA9IFtdOwogIHRyeSB7CiAgICBjb25zdCBzdGF0ZVBhdGggPSBqb2luKGNvbnRleHQuY2xhd2dvZERpciwgJ3BsdWdpbi1kZXBlbmRlbmNpZXMtc3RhdGUuanNvbicpOwogICAgY29uc3Qgc3RhdGVTbmFwc2hvdCA9IGh1ZEZpbGVTbmFwc2hvdChjb250ZXh0LmNsYXdnb2REaXIsIHN0YXRlUGF0aCwgJ293bmVyc2hpcCBzdGF0ZScsIHRydWUpOwogICAgaWYgKCFzdGF0ZVNuYXBzaG90LnByZXNlbnQpIHJldHVybiB7IHJlc3RvcmVkOiBbXSwgY29uZmxpY3RzOiBbXSwgZmFpbHVyZXM6IFtdIH07CiAgICBjb25zdCBtb2R1bGVQYXRoID0gam9pbihjb250ZXh0LmNsYXdnb2REaXIsICdjbGF1ZGUtaHVkLXN0YXR1c2xpbmUubWpzJyk7CiAgICBjb25zdCBvd25lcnNoaXBTdGF0ZSA9IGN1cnJlbnRIdWRTdGF0ZShzdGF0ZVNuYXBzaG90LnZhbHVlLCB0cnVlLCBjb250ZXh0LCBtb2R1bGVQYXRoKTsKICAgIGNvbnN0IGVudHJpZXMgPSBPYmplY3QuZW50cmllcyhvd25lcnNoaXBTdGF0ZS5jbGF1ZGVNZW0uZmlsZXMpOwogICAgaWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSByZXR1cm4geyByZXN0b3JlZDogW10sIGNvbmZsaWN0czogW10sIGZhaWx1cmVzOiBbXSB9OwogICAgY29uc3QgbmV4dFN0YXRlID0gc3RydWN0dXJlZENsb25lKG93bmVyc2hpcFN0YXRlKTsKICAgIGNvbnN0IGNhY2hlUm9vdCA9IHJlc29sdmUoY29udGV4dC5jbGF1ZGVDb25maWdEaXIsICdwbHVnaW5zJywgJ2NhY2hlJywgJ3RoZWRvdG1hY2snLCAnY2xhdWRlLW1lbScpOwogICAgY29uc3QgcmVzdG9yZWQgPSBbXTsKICAgIGNvbnN0IGNvbmZsaWN0cyA9IFtdOwogICAgY29uc3Qgb3BlcmF0aW9ucyA9IFtdOwogICAgZm9yIChjb25zdCBbdGFyZ2V0UGF0aCwgcmVjb3JkXSBvZiBlbnRyaWVzKSB7CiAgICAgIGNvbnN0IGV4cGVjdGVkID0gcmVjb3JkLnJlbGF0aXZlUGF0aCA9PT0gJ2hvb2tzL2hvb2tzLmpzb24nCiAgICAgICAgPyByZXNvbHZlKGNhY2hlUm9vdCwgcmVjb3JkLnBsdWdpblZlcnNpb24sICdob29rcycsICdob29rcy5qc29uJykKICAgICAgICA6IHJlc29sdmUoY2FjaGVSb290LCByZWNvcmQucGx1Z2luVmVyc2lvbiwgJy5tY3AuanNvbicpOwogICAgICBpZiAodGFyZ2V0UGF0aCAhPT0gZXhwZWN0ZWQgfHwgIXBhdGhJc0NvbnRhaW5lZChjYWNoZVJvb3QsIHRhcmdldFBhdGgpKSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjbGF1ZGUtbWVtOiBvd25lcnNoaXAgdGFyZ2V0IGVzY2FwZWQgdGhlIGNhbm9uaWNhbCBjYWNoZScpOwogICAgICB9CiAgICAgIGxldCBzdGF0dXM7CiAgICAgIHRyeSB7IHN0YXR1cyA9IGxzdGF0U3luYyh0YXJnZXRQYXRoKTsgfQogICAgICBjYXRjaCAoZXJyb3IpIHsKICAgICAgICBpZiAoZXJyb3I/LmNvZGUgIT09ICdFTk9FTlQnKSB0aHJvdyBlcnJvcjsKICAgICAgICBjb25mbGljdHMucHVzaCh0YXJnZXRQYXRoKTsKICAgICAgICBkZWxldGUgbmV4dFN0YXRlLmNsYXVkZU1lbS5maWxlc1t0YXJnZXRQYXRoXTsKICAgICAgICBjb250aW51ZTsKICAgICAgfQogICAgICBpZiAoc3RhdHVzLmlzU3ltYm9saWNMaW5rKCkgfHwgIXN0YXR1cy5pc0ZpbGUoKSB8fCAhaHVkRGlyZWN0b3J5Q2hhaW5Jc1NhZmUoY29udGV4dC5jbGF1ZGVDb25maWdEaXIsIGRpcm5hbWUodGFyZ2V0UGF0aCkpKSB7CiAgICAgICAgY29uZmxpY3RzLnB1c2godGFyZ2V0UGF0aCk7CiAgICAgICAgZGVsZXRlIG5leHRTdGF0ZS5jbGF1ZGVNZW0uZmlsZXNbdGFyZ2V0UGF0aF07CiAgICAgICAgY29udGludWU7CiAgICAgIH0KICAgICAgbGV0IHNuYXBzaG90OwogICAgICB0cnkgeyBzbmFwc2hvdCA9IGh1ZEZpbGVTbmFwc2hvdChjb250ZXh0LmNsYXVkZUNvbmZpZ0RpciwgdGFyZ2V0UGF0aCwgcmVjb3JkLnJlbGF0aXZlUGF0aCk7IH0KICAgICAgY2F0Y2ggewogICAgICAgIGNvbmZsaWN0cy5wdXNoKHRhcmdldFBhdGgpOwogICAgICAgIGRlbGV0ZSBuZXh0U3RhdGUuY2xhdWRlTWVtLmZpbGVzW3RhcmdldFBhdGhdOwogICAgICAgIGNvbnRpbnVlOwogICAgICB9CiAgICAgIGlmIChmaWxlRmluZ2VycHJpbnQoc25hcHNob3QuYnl0ZXMpICE9PSByZWNvcmQubWFuYWdlZFNoYTI1NikgewogICAgICAgIGNvbmZsaWN0cy5wdXNoKHRhcmdldFBhdGgpOwogICAgICAgIGRlbGV0ZSBuZXh0U3RhdGUuY2xhdWRlTWVtLmZpbGVzW3RhcmdldFBhdGhdOwogICAgICAgIGNvbnRpbnVlOwogICAgICB9CiAgICAgIG9wZXJhdGlvbnMucHVzaCh7CiAgICAgICAgcm9vdDogY29udGV4dC5jbGF1ZGVDb25maWdEaXIsCiAgICAgICAgc25hcHNob3QsCiAgICAgICAgYnl0ZXM6IEJ1ZmZlci5mcm9tKHJlY29yZC5vcmlnaW5hbEJhc2U2NCwgJ2Jhc2U2NCcpLAogICAgICAgIG1vZGU6IHNuYXBzaG90Lm1vZGUsCiAgICAgICAgbGFiZWw6IGBjbGF1ZGUtbWVtICR7cmVjb3JkLnJlbGF0aXZlUGF0aH1gLAogICAgICAgIHJlc3RvcmVkTGFiZWw6IHRhcmdldFBhdGgsCiAgICAgIH0pOwogICAgICBkZWxldGUgbmV4dFN0YXRlLmNsYXVkZU1lbS5maWxlc1t0YXJnZXRQYXRoXTsKICAgIH0KICAgIGZvciAoY29uc3Qgb3BlcmF0aW9uIG9mIG9wZXJhdGlvbnMpIHsKICAgICAgYXRvbWljSHVkV3JpdGUob3BlcmF0aW9uLnJvb3QsIG9wZXJhdGlvbi5zbmFwc2hvdCwgb3BlcmF0aW9uLmJ5dGVzLCBvcGVyYXRpb24ubW9kZSwgb3BlcmF0aW9uLmxhYmVsKTsKICAgICAgY29tcGxldGVkV3JpdGVzLnB1c2goeyAuLi5vcGVyYXRpb24sIHBvc3RXcml0ZTogaHVkRmlsZVNuYXBzaG90KG9wZXJhdGlvbi5yb290LCBvcGVyYXRpb24uc25hcHNob3QucGF0aCwgb3BlcmF0aW9uLmxhYmVsKSB9KTsKICAgICAgcmVzdG9yZWQucHVzaChvcGVyYXRpb24ucmVzdG9yZWRMYWJlbCk7CiAgICB9CiAgICBjb25zdCBzdGF0ZUJ5dGVzID0gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkobmV4dFN0YXRlLCBudWxsLCAyKSArICdcbicpOwogICAgaWYgKCFCdWZmZXIuZnJvbShzdGF0ZVNuYXBzaG90LmJ5dGVzKS5lcXVhbHMoc3RhdGVCeXRlcykpIHsKICAgICAgY29uc3Qgc3RhdGVXcml0ZSA9IHsKICAgICAgICByb290OiBjb250ZXh0LmNsYXdnb2REaXIsCiAgICAgICAgc25hcHNob3Q6IHN0YXRlU25hcHNob3QsCiAgICAgICAgYnl0ZXM6IHN0YXRlQnl0ZXMsCiAgICAgICAgbW9kZTogc3RhdGVTbmFwc2hvdC5tb2RlLAogICAgICAgIGxhYmVsOiAnb3duZXJzaGlwIHN0YXRlJywKICAgICAgfTsKICAgICAgYXRvbWljSHVkV3JpdGUoc3RhdGVXcml0ZS5yb290LCBzdGF0ZVdyaXRlLnNuYXBzaG90LCBzdGF0ZVdyaXRlLmJ5dGVzLCBzdGF0ZVdyaXRlLm1vZGUsIHN0YXRlV3JpdGUubGFiZWwpOwogICAgICBjb21wbGV0ZWRXcml0ZXMucHVzaCh7IC4uLnN0YXRlV3JpdGUsIHBvc3RXcml0ZTogaHVkRmlsZVNuYXBzaG90KHN0YXRlV3JpdGUucm9vdCwgc3RhdGVXcml0ZS5zbmFwc2hvdC5wYXRoLCBzdGF0ZVdyaXRlLmxhYmVsKSB9KTsKICAgIH0KICAgIHJldHVybiB7IHJlc3RvcmVkLCBjb25mbGljdHMsIGZhaWx1cmVzOiBbXSB9OwogIH0gY2F0Y2ggKGVycm9yKSB7CiAgICBjb25zdCByb2xsYmFja0Vycm9ycyA9IFtdOwogICAgZm9yIChjb25zdCB3cml0ZSBvZiBjb21wbGV0ZWRXcml0ZXMucmV2ZXJzZSgpKSB7CiAgICAgIHRyeSB7IHJvbGxiYWNrSHVkV3JpdGUod3JpdGUpOyB9CiAgICAgIGNhdGNoIChyb2xsYmFja0Vycm9yKSB7IHJvbGxiYWNrRXJyb3JzLnB1c2gocm9sbGJhY2tFcnJvcik7IGJyZWFrOyB9CiAgICB9CiAgICBjb25zdCBtZXNzYWdlID0gcm9sbGJhY2tFcnJvcnMubGVuZ3RoID4gMAogICAgICA/IGBjbGF1ZGUtbWVtOiByb2xsYmFjayBpbmNvbXBsZXRlOiAke3JvbGxiYWNrRXJyb3JzWzBdLm1lc3NhZ2V9YAogICAgICA6IChlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdjbGF1ZGUtbWVtOiByZXN0b3JlIGZhaWxlZCcpOwogICAgcmV0dXJuIHsgcmVzdG9yZWQ6IFtdLCBjb25mbGljdHM6IFtdLCBmYWlsdXJlczogW21lc3NhZ2VdIH07CiAgfQp9CgpleHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzdG9yZU1hbmFnZWRJbnRlZ3JhdGlvbnMoY29udGV4dCkgewogIGNvbnN0IGh1ZCA9IGF3YWl0IHJlc3RvcmVIdWQoY29udGV4dCk7CiAgaWYgKGh1ZC5mYWlsdXJlcy5sZW5ndGggPiAwKSByZXR1cm4geyByZXN0b3JlZDogW10sIGNvbmZsaWN0czogaHVkLmZhaWx1cmVzLm1hcChtZXNzYWdlID0+IGBodWQ6ICR7bWVzc2FnZX1gKSB9OwogIGNvbnN0IG1lbW9yeSA9IGF3YWl0IHJlc3RvcmVDbGF1ZGVNZW1JbnRlZ3JhdGlvbnMoY29udGV4dCk7CiAgcmV0dXJuIHsKICAgIHJlc3RvcmVkOiBbLi4uaHVkLnJlc3RvcmVkLCAuLi5tZW1vcnkucmVzdG9yZWRdLAogICAgY29uZmxpY3RzOiBbLi4uaHVkLmNvbmZsaWN0cywgLi4ubWVtb3J5LmNvbmZsaWN0cywgLi4ubWVtb3J5LmZhaWx1cmVzXSwKICB9Owp9CgpleHBvcnQgZnVuY3Rpb24gc2hhMjU2KGJ5dGVzKSB7CiAgcmV0dXJuIG5ldyBCdW4uQ3J5cHRvSGFzaGVyKCdzaGEyNTYnKS51cGRhdGUoYnl0ZXMpLmRpZ2VzdCgnaGV4Jyk7Cn0KCmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZUFyY2hpdmUoYnl0ZXMsIHNwZWMpIHsKICBpZiAoIShieXRlcyBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBhcmNoaXZlIGJ5dGVzIGFyZSBpbnZhbGlkYCk7CiAgaWYgKGJ5dGVzLmJ5dGVMZW5ndGggIT09IHNwZWMuYnl0ZXMpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IGFyY2hpdmUgc2l6ZSBtaXNtYXRjaGApOwogIGlmIChieXRlcy5ieXRlTGVuZ3RoID4gTUFYX0FSQ0hJVkVfQllURVMpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IGFyY2hpdmUgZXhjZWVkcyBzYWZldHkgbGltaXRgKTsKICBpZiAoc2hhMjU2KGJ5dGVzKSAhPT0gc3BlYy5zaGEyNTYpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IGFyY2hpdmUgU0hBLTI1NiBtaXNtYXRjaGApOwp9CgpmdW5jdGlvbiBkZWNvZGVUYXJUZXh0KGJ5dGVzLCBsYWJlbCwgc3BlYykgewogIGNvbnN0IG51bCA9IGJ5dGVzLmluZGV4T2YoMCk7CiAgY29uc3QgdmFsdWUgPSBudWwgPT09IC0xID8gYnl0ZXMgOiBieXRlcy5zdWJhcnJheSgwLCBudWwpOwogIHRyeSB7CiAgICByZXR1cm4gdGV4dERlY29kZXIuZGVjb2RlKHZhbHVlKTsKICB9IGNhdGNoIHsKICAgIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IG1hbGZvcm1lZCAke2xhYmVsfSBtZXRhZGF0YWApOwogIH0KfQoKZnVuY3Rpb24gcGFyc2VUYXJOdW1iZXIoYnl0ZXMsIGxhYmVsLCBzcGVjKSB7CiAgaWYgKGJ5dGVzLnNvbWUoYnl0ZSA9PiBieXRlID4gMHg3ZikpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IG1hbGZvcm1lZCB0YXIgJHtsYWJlbH1gKTsKICBjb25zdCBmaWVsZCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoLi4uYnl0ZXMpOwogIGNvbnN0IG51bCA9IGZpZWxkLmluZGV4T2YoJ1wwJyk7CiAgbGV0IHZhbHVlOwogIGlmIChudWwgPT09IC0xKSB7CiAgICBpZiAoIS9eICpbMC03XSsgKiQvLnRlc3QoZmllbGQpKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBtYWxmb3JtZWQgdGFyICR7bGFiZWx9YCk7CiAgICB2YWx1ZSA9IGZpZWxkLnRyaW0oKTsKICB9IGVsc2UgewogICAgaWYgKCEvXiAqWzAtN10rICpcMCAqJC8udGVzdChmaWVsZCkpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IG1hbGZvcm1lZCB0YXIgJHtsYWJlbH1gKTsKICAgIHZhbHVlID0gZmllbGQuc2xpY2UoMCwgbnVsKS50cmltKCk7CiAgfQogIGNvbnN0IHBhcnNlZCA9IE51bWJlci5wYXJzZUludCh2YWx1ZSwgOCk7CiAgaWYgKCFOdW1iZXIuaXNTYWZlSW50ZWdlcihwYXJzZWQpKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBtYWxmb3JtZWQgdGFyICR7bGFiZWx9YCk7CiAgcmV0dXJuIHBhcnNlZDsKfQoKZnVuY3Rpb24gdmVyaWZ5VGFyQ2hlY2tzdW0oaGVhZGVyLCBzcGVjKSB7CiAgY29uc3QgZXhwZWN0ZWQgPSBwYXJzZVRhck51bWJlcihoZWFkZXIuc3ViYXJyYXkoMTQ4LCAxNTYpLCAnY2hlY2tzdW0nLCBzcGVjKTsKICBsZXQgYWN0dWFsID0gMDsKICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgaGVhZGVyLmxlbmd0aDsgaW5kZXgrKykgewogICAgYWN0dWFsICs9IGluZGV4ID49IDE0OCAmJiBpbmRleCA8IDE1NiA/IDB4MjAgOiBoZWFkZXJbaW5kZXhdOwogIH0KICBpZiAoYWN0dWFsICE9PSBleHBlY3RlZCkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogdGFyIGhlYWRlciBjaGVja3N1bSBtaXNtYXRjaGApOwp9CgpmdW5jdGlvbiBwYXJzZVBheChieXRlcywgc3BlYykgewogIGNvbnN0IHZhbHVlcyA9IHt9OwogIGxldCBvZmZzZXQgPSAwOwogIHdoaWxlIChvZmZzZXQgPCBieXRlcy5sZW5ndGgpIHsKICAgIGNvbnN0IHNwYWNlID0gYnl0ZXMuaW5kZXhPZigweDIwLCBvZmZzZXQpOwogICAgaWYgKHNwYWNlIDw9IG9mZnNldCkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogbWFsZm9ybWVkIFBBWCBtZXRhZGF0YWApOwogICAgbGV0IGxlbmd0aFRleHQ7CiAgICB0cnkgewogICAgICBsZW5ndGhUZXh0ID0gdGV4dERlY29kZXIuZGVjb2RlKGJ5dGVzLnN1YmFycmF5KG9mZnNldCwgc3BhY2UpKTsKICAgIH0gY2F0Y2ggewogICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBtYWxmb3JtZWQgUEFYIG1ldGFkYXRhYCk7CiAgICB9CiAgICBpZiAoIS9eWzEtOV1cZCokLy50ZXN0KGxlbmd0aFRleHQpKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBtYWxmb3JtZWQgUEFYIG1ldGFkYXRhYCk7CiAgICBjb25zdCBsZW5ndGggPSBOdW1iZXIobGVuZ3RoVGV4dCk7CiAgICBjb25zdCBlbmQgPSBvZmZzZXQgKyBsZW5ndGg7CiAgICBpZiAoIU51bWJlci5pc1NhZmVJbnRlZ2VyKGxlbmd0aCkgfHwgZW5kID4gYnl0ZXMubGVuZ3RoIHx8IGJ5dGVzW2VuZCAtIDFdICE9PSAweDBhKSB7CiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IG1hbGZvcm1lZCBQQVggbWV0YWRhdGFgKTsKICAgIH0KICAgIGNvbnN0IGJvZHlTdGFydCA9IHNwYWNlICsgMTsKICAgIGNvbnN0IGJvZHlFbmQgPSBlbmQgLSAxOwogICAgY29uc3QgZXF1YWxzID0gYnl0ZXMuaW5kZXhPZigweDNkLCBib2R5U3RhcnQpOwogICAgaWYgKGVxdWFscyA8PSBib2R5U3RhcnQgfHwgZXF1YWxzID49IGJvZHlFbmQpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IG1hbGZvcm1lZCBQQVggbWV0YWRhdGFgKTsKICAgIGxldCBrZXk7CiAgICBsZXQgdmFsdWU7CiAgICB0cnkgewogICAgICBrZXkgPSB0ZXh0RGVjb2Rlci5kZWNvZGUoYnl0ZXMuc3ViYXJyYXkoYm9keVN0YXJ0LCBlcXVhbHMpKTsKICAgICAgdmFsdWUgPSB0ZXh0RGVjb2Rlci5kZWNvZGUoYnl0ZXMuc3ViYXJyYXkoZXF1YWxzICsgMSwgYm9keUVuZCkpOwogICAgfSBjYXRjaCB7CiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IG1hbGZvcm1lZCBQQVggbWV0YWRhdGFgKTsKICAgIH0KICAgIGlmIChPYmplY3QuaGFzT3duKHZhbHVlcywga2V5KSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogbWFsZm9ybWVkIFBBWCBtZXRhZGF0YWApOwogICAgdmFsdWVzW2tleV0gPSB2YWx1ZTsKICAgIG9mZnNldCA9IGVuZDsKICB9CiAgcmV0dXJuIHZhbHVlczsKfQoKZnVuY3Rpb24gcGF4U2l6ZSh2YWx1ZSwgZmFsbGJhY2ssIHNwZWMpIHsKICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkgcmV0dXJuIGZhbGxiYWNrOwogIGlmICghL14oMHxbMS05XVxkKikkLy50ZXN0KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogbWFsZm9ybWVkIFBBWCBtZXRhZGF0YWApOwogIGNvbnN0IHBhcnNlZCA9IE51bWJlcih2YWx1ZSk7CiAgaWYgKCFOdW1iZXIuaXNTYWZlSW50ZWdlcihwYXJzZWQpKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBtYWxmb3JtZWQgUEFYIG1ldGFkYXRhYCk7CiAgcmV0dXJuIHBhcnNlZDsKfQoKZnVuY3Rpb24gbm9ybWFsaXplQXJjaGl2ZVBhdGgodmFsdWUsIHNwZWMpIHsKICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCB2YWx1ZS5pbmNsdWRlcygnXDAnKSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogdW5zYWZlIGFyY2hpdmUgcGF0aGApOwogIGNvbnN0IHBvcnRhYmxlID0gdmFsdWUucmVwbGFjZSgvXFwvZywgJy8nKTsKICBpZiAoIXBvcnRhYmxlIHx8IHBvcnRhYmxlLnN0YXJ0c1dpdGgoJy8nKSB8fCAvXltBLVphLXpdOi8udGVzdChwb3J0YWJsZSkpIHsKICAgIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHVuc2FmZSBhcmNoaXZlIHBhdGhgKTsKICB9CiAgY29uc3QgcGFydHMgPSBwb3J0YWJsZS5zcGxpdCgnLycpOwogIGlmIChwYXJ0cy5pbmNsdWRlcygnLi4nKSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogdW5zYWZlIGFyY2hpdmUgcGF0aGApOwogIGNvbnN0IG5vcm1hbGl6ZWQgPSBwYXJ0cy5maWx0ZXIocGFydCA9PiBwYXJ0ICYmIHBhcnQgIT09ICcuJykuam9pbignLycpOwogIGlmICghbm9ybWFsaXplZCkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogdW5zYWZlIGFyY2hpdmUgcGF0aGApOwogIHJldHVybiBub3JtYWxpemVkOwp9Cgphc3luYyBmdW5jdGlvbiBndW56aXBCb3VuZGVkKGJ5dGVzLCBzcGVjKSB7CiAgY29uc3QgY2h1bmtzID0gW107CiAgbGV0IHRvdGFsID0gMDsKICBsZXQgcmVhZGVyOwogIHRyeSB7CiAgICByZWFkZXIgPSBuZXcgQmxvYihbYnl0ZXNdKS5zdHJlYW0oKS5waXBlVGhyb3VnaChuZXcgRGVjb21wcmVzc2lvblN0cmVhbSgnZ3ppcCcpKS5nZXRSZWFkZXIoKTsKICAgIHdoaWxlICh0cnVlKSB7CiAgICAgIGNvbnN0IHsgZG9uZSwgdmFsdWUgfSA9IGF3YWl0IHJlYWRlci5yZWFkKCk7CiAgICAgIGlmIChkb25lKSBicmVhazsKICAgICAgY29uc3QgY2h1bmsgPSB2YWx1ZSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkgPyB2YWx1ZSA6IG5ldyBVaW50OEFycmF5KHZhbHVlKTsKICAgICAgdG90YWwgKz0gY2h1bmsuYnl0ZUxlbmd0aDsKICAgICAgaWYgKHRvdGFsID4gTUFYX0VYUEFOREVEX0JZVEVTKSB7CiAgICAgICAgdHJ5IHsgYXdhaXQgcmVhZGVyLmNhbmNlbCgpOyB9IGNhdGNoIHt9CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogZGVjb21wcmVzc2VkIGFyY2hpdmUgZXhjZWVkcyBzYWZldHkgbGltaXRgKTsKICAgICAgfQogICAgICBjaHVua3MucHVzaChjaHVuayk7CiAgICB9CiAgfSBjYXRjaCAoZXJyb3IpIHsKICAgIGlmIChlcnJvcj8ubWVzc2FnZSA9PT0gYCR7c3BlYy5rZXl9OiBkZWNvbXByZXNzZWQgYXJjaGl2ZSBleGNlZWRzIHNhZmV0eSBsaW1pdGApIHRocm93IGVycm9yOwogICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogYXJjaGl2ZSBnemlwIGlzIGludmFsaWRgKTsKICB9CiAgY29uc3QgdGFyID0gbmV3IFVpbnQ4QXJyYXkodG90YWwpOwogIGxldCBvZmZzZXQgPSAwOwogIGZvciAoY29uc3QgY2h1bmsgb2YgY2h1bmtzKSB7CiAgICB0YXIuc2V0KGNodW5rLCBvZmZzZXQpOwogICAgb2Zmc2V0ICs9IGNodW5rLmJ5dGVMZW5ndGg7CiAgfQogIHJldHVybiB0YXI7Cn0KCmFzeW5jIGZ1bmN0aW9uIHBhcnNlVGFyKGJ5dGVzLCBzcGVjKSB7CiAgY29uc3QgdGFyID0gYXdhaXQgZ3VuemlwQm91bmRlZChieXRlcywgc3BlYyk7CiAgY29uc3QgZW50cmllcyA9IFtdOwogIGNvbnN0IHNlZW5QYXRocyA9IG5ldyBTZXQoKTsKICBjb25zdCByb290cyA9IG5ldyBTZXQoKTsKICBsZXQgZW50cnlDb3VudCA9IDA7CiAgbGV0IGV4cGFuZGVkQnl0ZXMgPSAwOwogIGxldCBvZmZzZXQgPSAwOwogIGxldCBnbG9iYWxQYXggPSB7fTsKICBsZXQgbG9jYWxQYXggPSBudWxsOwogIGxldCBsb25nTmFtZSA9IG51bGw7CiAgbGV0IHRlcm1pbmF0ZWQgPSBmYWxzZTsKCiAgd2hpbGUgKG9mZnNldCArIFRBUl9CTE9DS19CWVRFUyA8PSB0YXIuYnl0ZUxlbmd0aCkgewogICAgY29uc3QgaGVhZGVyID0gdGFyLnN1YmFycmF5KG9mZnNldCwgb2Zmc2V0ICsgVEFSX0JMT0NLX0JZVEVTKTsKICAgIGlmIChoZWFkZXIuZXZlcnkoYnl0ZSA9PiBieXRlID09PSAwKSkgewogICAgICBjb25zdCB0ZXJtaW5hdG9yRW5kID0gb2Zmc2V0ICsgMiAqIFRBUl9CTE9DS19CWVRFUzsKICAgICAgaWYgKHRlcm1pbmF0b3JFbmQgPiB0YXIuYnl0ZUxlbmd0aAogICAgICAgIHx8ICF0YXIuc3ViYXJyYXkob2Zmc2V0ICsgVEFSX0JMT0NLX0JZVEVTLCB0ZXJtaW5hdG9yRW5kKS5ldmVyeShieXRlID0+IGJ5dGUgPT09IDApCiAgICAgICAgfHwgdGFyLmJ5dGVMZW5ndGggJSBUQVJfQkxPQ0tfQllURVMgIT09IDAKICAgICAgICB8fCB0YXIuc3ViYXJyYXkodGVybWluYXRvckVuZCkuc29tZShieXRlID0+IGJ5dGUgIT09IDApKSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogbWFsZm9ybWVkIHRhciB0ZXJtaW5hdG9yIG9yIHBhZGRpbmdgKTsKICAgICAgfQogICAgICB0ZXJtaW5hdGVkID0gdHJ1ZTsKICAgICAgYnJlYWs7CiAgICB9CiAgICB2ZXJpZnlUYXJDaGVja3N1bShoZWFkZXIsIHNwZWMpOwogICAgb2Zmc2V0ICs9IFRBUl9CTE9DS19CWVRFUzsKICAgIGVudHJ5Q291bnQgKz0gMTsKICAgIGlmIChlbnRyeUNvdW50ID4gTUFYX0VOVFJJRVMpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IGFyY2hpdmUgaGFzIHRvbyBtYW55IGVudHJpZXNgKTsKCiAgICBjb25zdCB0eXBlQnl0ZSA9IGhlYWRlclsxNTZdOwogICAgY29uc3QgdHlwZSA9IHR5cGVCeXRlID09PSAwID8gJzAnIDogU3RyaW5nLmZyb21DaGFyQ29kZSh0eXBlQnl0ZSk7CiAgICBpZiAoIVsnMCcsICc1JywgJ3gnLCAnZycsICdMJ10uaW5jbHVkZXModHlwZSkpIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogdW5zdXBwb3J0ZWQgdGFyIGxpbmsgb3IgZGV2aWNlIGVudHJ5YCk7CiAgICB9CiAgICBjb25zdCBtZXRhZGF0YSA9IHR5cGUgPT09ICd4JyB8fCB0eXBlID09PSAnZycgfHwgdHlwZSA9PT0gJ0wnOwogICAgaWYgKG1ldGFkYXRhICYmIChsb2NhbFBheCAhPT0gbnVsbCB8fCBsb25nTmFtZSAhPT0gbnVsbCkpIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogbWFsZm9ybWVkIGFyY2hpdmUgbWV0YWRhdGFgKTsKICAgIH0KICAgIGNvbnN0IGhlYWRlclNpemUgPSBwYXJzZVRhck51bWJlcihoZWFkZXIuc3ViYXJyYXkoMTI0LCAxMzYpLCAnc2l6ZScsIHNwZWMpOwogICAgY29uc3QgbW9kZSA9IHBhcnNlVGFyTnVtYmVyKGhlYWRlci5zdWJhcnJheSgxMDAsIDEwOCksICdtb2RlJywgc3BlYyk7CiAgICBjb25zdCBlZmZlY3RpdmVQYXggPSB7IC4uLmdsb2JhbFBheCwgLi4uKGxvY2FsUGF4IHx8IHt9KSB9OwogICAgY29uc3Qgc2l6ZSA9IG1ldGFkYXRhID8gaGVhZGVyU2l6ZSA6IHBheFNpemUoZWZmZWN0aXZlUGF4LnNpemUsIGhlYWRlclNpemUsIHNwZWMpOwogICAgaWYgKHNpemUgPiBNQVhfRU5UUllfQllURVMpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IGFyY2hpdmUgZW50cnkgZXhjZWVkcyBzYWZldHkgbGltaXRgKTsKICAgIGV4cGFuZGVkQnl0ZXMgKz0gc2l6ZTsKICAgIGlmICghTnVtYmVyLmlzU2FmZUludGVnZXIoZXhwYW5kZWRCeXRlcykgfHwgZXhwYW5kZWRCeXRlcyA+IE1BWF9FWFBBTkRFRF9CWVRFUykgewogICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBhcmNoaXZlIGV4cGFuZGVkIGRhdGEgZXhjZWVkcyBzYWZldHkgbGltaXRgKTsKICAgIH0KICAgIGNvbnN0IGRhdGFFbmQgPSBvZmZzZXQgKyBzaXplOwogICAgY29uc3QgcGFkZGVkRW5kID0gb2Zmc2V0ICsgTWF0aC5jZWlsKHNpemUgLyBUQVJfQkxPQ0tfQllURVMpICogVEFSX0JMT0NLX0JZVEVTOwogICAgaWYgKGRhdGFFbmQgPiB0YXIuYnl0ZUxlbmd0aCB8fCBwYWRkZWRFbmQgPiB0YXIuYnl0ZUxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogdHJ1bmNhdGVkIHRhciBlbnRyeWApOwogICAgY29uc3QgZGF0YSA9IHRhci5zdWJhcnJheShvZmZzZXQsIGRhdGFFbmQpOwogICAgb2Zmc2V0ID0gcGFkZGVkRW5kOwoKICAgIGlmICh0eXBlID09PSAneCcgfHwgdHlwZSA9PT0gJ2cnKSB7CiAgICAgIGNvbnN0IHBheCA9IHBhcnNlUGF4KGRhdGEsIHNwZWMpOwogICAgICBpZiAodHlwZSA9PT0gJ2cnKSBnbG9iYWxQYXggPSB7IC4uLmdsb2JhbFBheCwgLi4ucGF4IH07CiAgICAgIGVsc2UgbG9jYWxQYXggPSBwYXg7CiAgICAgIGNvbnRpbnVlOwogICAgfQogICAgaWYgKHR5cGUgPT09ICdMJykgewogICAgICBpZiAoZGF0YS5sZW5ndGggPT09IDAgfHwgZGF0YVtkYXRhLmxlbmd0aCAtIDFdICE9PSAwIHx8IGRhdGEuc3ViYXJyYXkoMCwgLTEpLmluY2x1ZGVzKDApKSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogbWFsZm9ybWVkIEdOVSBsb25nLW5hbWUgbWV0YWRhdGFgKTsKICAgICAgfQogICAgICBsb25nTmFtZSA9IGRlY29kZVRhclRleHQoZGF0YS5zdWJhcnJheSgwLCAtMSksICdHTlUgbG9uZy1uYW1lJywgc3BlYyk7CiAgICAgIGNvbnRpbnVlOwogICAgfQoKICAgIGNvbnN0IHJhd05hbWUgPSBkZWNvZGVUYXJUZXh0KGhlYWRlci5zdWJhcnJheSgwLCAxMDApLCAndGFyIHBhdGgnLCBzcGVjKTsKICAgIGNvbnN0IHByZWZpeCA9IGRlY29kZVRhclRleHQoaGVhZGVyLnN1YmFycmF5KDM0NSwgNTAwKSwgJ3RhciBwcmVmaXgnLCBzcGVjKTsKICAgIGNvbnN0IGhlYWRlck5hbWUgPSBwcmVmaXggPyBgJHtwcmVmaXh9LyR7cmF3TmFtZX1gIDogcmF3TmFtZTsKICAgIGNvbnN0IHBheFBhdGggPSBlZmZlY3RpdmVQYXgucGF0aDsKICAgIGlmIChsb25nTmFtZSAhPT0gbnVsbCAmJiBwYXhQYXRoICE9PSB1bmRlZmluZWQpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IG1hbGZvcm1lZCBhcmNoaXZlIHBhdGggbWV0YWRhdGFgKTsKICAgIGNvbnN0IHBhdGggPSBub3JtYWxpemVBcmNoaXZlUGF0aChsb25nTmFtZSA/PyBwYXhQYXRoID8/IGhlYWRlck5hbWUsIHNwZWMpOwogICAgbG9uZ05hbWUgPSBudWxsOwogICAgbG9jYWxQYXggPSBudWxsOwogICAgaWYgKHNlZW5QYXRocy5oYXMocGF0aCkpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IGR1cGxpY2F0ZSBhcmNoaXZlIHBhdGhgKTsKICAgIHNlZW5QYXRocy5hZGQocGF0aCk7CiAgICByb290cy5hZGQocGF0aC5zcGxpdCgnLycpWzBdKTsKICAgIGVudHJpZXMucHVzaCh7IHBhdGgsIHR5cGUsIGRhdGEsIGV4ZWN1dGFibGU6IChtb2RlICYgMG8xMTEpICE9PSAwIH0pOwogIH0KCiAgaWYgKCF0ZXJtaW5hdGVkKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBtYWxmb3JtZWQgdGFyIHRlcm1pbmF0b3JgKTsKICBpZiAobG9jYWxQYXggIT09IG51bGwgfHwgbG9uZ05hbWUgIT09IG51bGwpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IG1hbGZvcm1lZCBhcmNoaXZlIG1ldGFkYXRhYCk7CiAgaWYgKHJvb3RzLnNpemUgIT09IDEpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IGFyY2hpdmUgbXVzdCBjb250YWluIGEgc2luZ2xlIHRvcC1sZXZlbCByZXBvc2l0b3J5IGRpcmVjdG9yeWApOwogIHJldHVybiB7IGVudHJpZXMsIHJvb3Q6IHJvb3RzLnZhbHVlcygpLm5leHQoKS52YWx1ZSB9Owp9CgpmdW5jdGlvbiBlbnN1cmVEaXJlY3Rvcnkocm9vdCwgcmVsYXRpdmVQYXRoLCBzcGVjKSB7CiAgbGV0IGN1cnJlbnQgPSByb290OwogIGZvciAoY29uc3QgcGFydCBvZiByZWxhdGl2ZVBhdGguc3BsaXQoJy8nKS5maWx0ZXIoQm9vbGVhbikpIHsKICAgIGN1cnJlbnQgPSBqb2luKGN1cnJlbnQsIHBhcnQpOwogICAgaWYgKGV4aXN0c1N5bmMoY3VycmVudCkpIHsKICAgICAgY29uc3Qgc3RhdHVzID0gbHN0YXRTeW5jKGN1cnJlbnQpOwogICAgICBpZiAoc3RhdHVzLmlzU3ltYm9saWNMaW5rKCkgfHwgIXN0YXR1cy5pc0RpcmVjdG9yeSgpKSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogdW5zYWZlIGV4dHJhY3Rpb24gcGFyZW50YCk7CiAgICAgIH0KICAgIH0gZWxzZSB7CiAgICAgIG1rZGlyU3luYyhjdXJyZW50KTsKICAgIH0KICB9CiAgcmV0dXJuIGN1cnJlbnQ7Cn0KCmZ1bmN0aW9uIHNhZmVEaXJlY3RvcnlTdGF0dXMocGF0aCwgc3BlYykgewogIGxldCBzdGF0dXM7CiAgdHJ5IHsKICAgIHN0YXR1cyA9IGxzdGF0U3luYyhwYXRoKTsKICB9IGNhdGNoIHsKICAgIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHVuc2FmZSBtYW5hZ2VkIGRpcmVjdG9yeWApOwogIH0KICBpZiAoc3RhdHVzLmlzU3ltYm9saWNMaW5rKCkgfHwgIXN0YXR1cy5pc0RpcmVjdG9yeSgpKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiB1bnNhZmUgbWFuYWdlZCBkaXJlY3RvcnlgKTsKICB9CiAgcmV0dXJuIHN0YXR1czsKfQoKZnVuY3Rpb24gZW5zdXJlRGVzdGluYXRpb25EaXJlY3RvcnkoZGVzdGluYXRpb24sIHNwZWMpIHsKICBjb25zdCBhbmNlc3RvcnMgPSBbXTsKICBsZXQgY3VycmVudCA9IGRlc3RpbmF0aW9uOwogIHdoaWxlICh0cnVlKSB7CiAgICBhbmNlc3RvcnMudW5zaGlmdChjdXJyZW50KTsKICAgIGNvbnN0IHBhcmVudCA9IGRpcm5hbWUoY3VycmVudCk7CiAgICBpZiAocGFyZW50ID09PSBjdXJyZW50KSBicmVhazsKICAgIGN1cnJlbnQgPSBwYXJlbnQ7CiAgfQogIGZvciAoY29uc3QgcGF0aCBvZiBhbmNlc3RvcnMpIHsKICAgIGxldCBzdGF0dXM7CiAgICB0cnkgewogICAgICBzdGF0dXMgPSBsc3RhdFN5bmMocGF0aCk7CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBpZiAoZXJyb3I/LmNvZGUgIT09ICdFTk9FTlQnKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiB1bnNhZmUgZXh0cmFjdGlvbiBkZXN0aW5hdGlvbmApOwogICAgICB0cnkgewogICAgICAgIG1rZGlyU3luYyhwYXRoLCAwbzcwMCk7CiAgICAgICAgc3RhdHVzID0gbHN0YXRTeW5jKHBhdGgpOwogICAgICB9IGNhdGNoIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiB1bnNhZmUgZXh0cmFjdGlvbiBkZXN0aW5hdGlvbmApOwogICAgICB9CiAgICB9CiAgICBpZiAoc3RhdHVzLmlzU3ltYm9saWNMaW5rKCkgfHwgIXN0YXR1cy5pc0RpcmVjdG9yeSgpKSB7CiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHVuc2FmZSBleHRyYWN0aW9uIGRlc3RpbmF0aW9uYCk7CiAgICB9CiAgfQogIHJldHVybiBkZXN0aW5hdGlvbjsKfQoKZnVuY3Rpb24gZW5zdXJlVHJ1c3RlZERpcmVjdG9yeShyb290LCBwYXJ0cywgc3BlYykgewogIHNhZmVEaXJlY3RvcnlTdGF0dXMocm9vdCwgc3BlYyk7CiAgbGV0IGN1cnJlbnQgPSByb290OwogIGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykgewogICAgY3VycmVudCA9IGpvaW4oY3VycmVudCwgcGFydCk7CiAgICBpZiAoZXhpc3RzU3luYyhjdXJyZW50KSkgc2FmZURpcmVjdG9yeVN0YXR1cyhjdXJyZW50LCBzcGVjKTsKICAgIGVsc2UgewogICAgICBta2RpclN5bmMoY3VycmVudCwgMG83MDApOwogICAgICBzYWZlRGlyZWN0b3J5U3RhdHVzKGN1cnJlbnQsIHNwZWMpOwogICAgfQogIH0KICByZXR1cm4gY3VycmVudDsKfQoKZnVuY3Rpb24gbWFuYWdlZERpcmVjdG9yeUZhaWx1cmUoc3BlYywgbWVzc2FnZSwgY2F1c2UsIGV2aWRlbmNlUGF0aHMgPSBbXSkgewogIGNvbnN0IGZhaWx1cmUgPSBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiAke21lc3NhZ2V9YCk7CiAgZmFpbHVyZS5yZXN0b3JhdGlvbkluY29tcGxldGUgPSB0cnVlOwogIGZhaWx1cmUuY2F1c2UgPSBjYXVzZTsKICBmYWlsdXJlLmV2aWRlbmNlUGF0aHMgPSBldmlkZW5jZVBhdGhzOwogIGZhaWx1cmUuZXZpZGVuY2VQYXRoID0gZXZpZGVuY2VQYXRocy5hdCgtMSk7CiAgcmV0dXJuIGZhaWx1cmU7Cn0KCmZ1bmN0aW9uIGNyZWF0ZVRyYWNrZWREaXJlY3RvcnkodGFyZ2V0LCBzcGVjLCBjb250ZXh0LCBsYWJlbCkgewogIGNvbnN0IHBhcmVudCA9IGRpcm5hbWUodGFyZ2V0KTsKICBjb25zdCBwYXJlbnRUcnVzdCA9IGNhcHR1cmVEaXJlY3RvcnlUcnVzdChwYXJlbnQsIHNwZWMpOwogIGNvbnN0IHBhcmVudElkZW50aXR5ID0gZGlyZWN0b3J5SWRlbnRpdHkocGFyZW50LCBzcGVjKTsKICB0cnkgewogICAgYXNzZXJ0RGlyZWN0b3J5VHJ1c3QocGFyZW50VHJ1c3QsIHNwZWMsIGxhYmVsKTsKICAgIGFzc2VydERpcmVjdG9yeUlkZW50aXR5KHBhcmVudCwgcGFyZW50SWRlbnRpdHksIHNwZWMsIGxhYmVsKTsKICAgIGNvbnRleHQub25NYW5hZ2VkRGlyZWN0b3J5UHVibGlzaGluZz8uKHsgcGF0aDogdGFyZ2V0LCBsYWJlbCB9KTsKICAgIG1rZGlyU3luYyh0YXJnZXQsIDBvNzAwKTsKICAgIGNvbnN0IGlkZW50aXR5ID0gZGlyZWN0b3J5SWRlbnRpdHkodGFyZ2V0LCBzcGVjKTsKICAgIGNvbnN0IHRydXN0ID0gY2FwdHVyZURpcmVjdG9yeVRydXN0KHRhcmdldCwgc3BlYyk7CiAgICBhc3NlcnREaXJlY3RvcnlUcnVzdChwYXJlbnRUcnVzdCwgc3BlYywgbGFiZWwpOwogICAgYXNzZXJ0RGlyZWN0b3J5SWRlbnRpdHkocGFyZW50LCBwYXJlbnRJZGVudGl0eSwgc3BlYywgbGFiZWwpOwogICAgYXNzZXJ0RGlyZWN0b3J5VHJ1c3QodHJ1c3QsIHNwZWMsIGxhYmVsKTsKICAgIGFzc2VydERpcmVjdG9yeUlkZW50aXR5KHRhcmdldCwgaWRlbnRpdHksIHNwZWMsIGxhYmVsKTsKICAgIGNvbnRleHQub25NYW5hZ2VkRGlyZWN0b3J5SW5zdGFsbGVkPy4oeyBwYXRoOiB0YXJnZXQsIGlkZW50aXR5LCBsYWJlbCB9KTsKICAgIGFzc2VydERpcmVjdG9yeVRydXN0KHBhcmVudFRydXN0LCBzcGVjLCBsYWJlbCk7CiAgICBhc3NlcnREaXJlY3RvcnlJZGVudGl0eShwYXJlbnQsIHBhcmVudElkZW50aXR5LCBzcGVjLCBsYWJlbCk7CiAgICBhc3NlcnREaXJlY3RvcnlUcnVzdCh0cnVzdCwgc3BlYywgbGFiZWwpOwogICAgYXNzZXJ0RGlyZWN0b3J5SWRlbnRpdHkodGFyZ2V0LCBpZGVudGl0eSwgc3BlYywgbGFiZWwpOwogICAgcmV0dXJuIHsgcGF0aDogdGFyZ2V0LCBpZGVudGl0eSwgcGFyZW50VHJ1c3QsIHRydXN0IH07CiAgfSBjYXRjaCAoZXJyb3IpIHsKICAgIGlmIChlcnJvcj8ucmVzdG9yYXRpb25JbmNvbXBsZXRlKSB0aHJvdyBlcnJvcjsKICAgIGNvbnN0IGV2aWRlbmNlUGF0aHMgPSBbXTsKICAgIGxldCBldmlkZW5jZUNhdXNlID0gbnVsbDsKICAgIHRyeSB7IGxzdGF0U3luYyh0YXJnZXQpOyBldmlkZW5jZVBhdGhzLnB1c2godGFyZ2V0KTsgfSBjYXRjaCAoZXZpZGVuY2VFcnJvcikgewogICAgICBpZiAoZXZpZGVuY2VFcnJvcj8uY29kZSAhPT0gJ0VOT0VOVCcpIGV2aWRlbmNlQ2F1c2UgPSBldmlkZW5jZUVycm9yOwogICAgfQogICAgY29uc3QgZmFpbHVyZSA9IG1hbmFnZWREaXJlY3RvcnlGYWlsdXJlKHNwZWMsIGAke2xhYmVsfSBjcmVhdGlvbiByZXN0b3JhdGlvbiBpbmNvbXBsZXRlYCwgZXJyb3IsIGV2aWRlbmNlUGF0aHMpOwogICAgaWYgKGV2aWRlbmNlQ2F1c2UpIGZhaWx1cmUuZXZpZGVuY2VDYXVzZSA9IGV2aWRlbmNlQ2F1c2U7CiAgICB0aHJvdyBmYWlsdXJlOwogIH0KfQoKZnVuY3Rpb24gdHJhY2tlZERpcmVjdG9yeUd1YXJkKHBhdGgsIGNyZWF0ZWRQYXJlbnRzLCBzcGVjLCBsYWJlbCkgewogIGNvbnN0IGNyZWF0ZWQgPSBjcmVhdGVkUGFyZW50cy5maW5kKGVudHJ5ID0+IGVudHJ5LnBhdGggPT09IHBhdGgpOwogIGNvbnN0IGlkZW50aXR5ID0gY3JlYXRlZD8uaWRlbnRpdHkgfHwgZGlyZWN0b3J5SWRlbnRpdHkocGF0aCwgc3BlYyk7CiAgY29uc3QgdHJ1c3QgPSBjcmVhdGVkPy50cnVzdCB8fCBjYXB0dXJlRGlyZWN0b3J5VHJ1c3QocGF0aCwgc3BlYyk7CiAgdHJ5IHsKICAgIGFzc2VydERpcmVjdG9yeVRydXN0KHRydXN0LCBzcGVjLCBsYWJlbCk7CiAgICBhc3NlcnREaXJlY3RvcnlJZGVudGl0eShwYXRoLCBpZGVudGl0eSwgc3BlYywgbGFiZWwpOwogIH0gY2F0Y2ggKGVycm9yKSB7CiAgICBpZiAoY3JlYXRlZCkgewogICAgICB0aHJvdyBtYW5hZ2VkRGlyZWN0b3J5RmFpbHVyZShzcGVjLCBgJHtsYWJlbH0gY3JlYXRpb24gaWRlbnRpdHkgY2hhbmdlZGAsIGVycm9yLCBbcGF0aF0uZmlsdGVyKGNhbmRpZGF0ZSA9PiBleGlzdHNTeW5jKGNhbmRpZGF0ZSkpKTsKICAgIH0KICAgIHRocm93IGVycm9yOwogIH0KICByZXR1cm4geyBpZGVudGl0eSwgdHJ1c3QgfTsKfQoKZnVuY3Rpb24gZW5zdXJlVHJhY2tlZERpcmVjdG9yeShyb290LCBwYXJ0cywgc3BlYywgY29udGV4dCwgbGFiZWwpIHsKICBzYWZlRGlyZWN0b3J5U3RhdHVzKHJvb3QsIHNwZWMpOwogIGxldCBjdXJyZW50ID0gcm9vdDsKICBjb25zdCBjcmVhdGVkUGFyZW50cyA9IFtdOwogIHRyeSB7CiAgICBmb3IgKGNvbnN0IHBhcnQgb2YgcGFydHMpIHsKICAgICAgY29uc3QgdGFyZ2V0ID0gam9pbihjdXJyZW50LCBwYXJ0KTsKICAgICAgaWYgKGV4aXN0c1N5bmModGFyZ2V0KSkgc2FmZURpcmVjdG9yeVN0YXR1cyh0YXJnZXQsIHNwZWMpOwogICAgICBlbHNlIGNyZWF0ZWRQYXJlbnRzLnB1c2goY3JlYXRlVHJhY2tlZERpcmVjdG9yeSh0YXJnZXQsIHNwZWMsIGNvbnRleHQsIGxhYmVsKSk7CiAgICAgIGN1cnJlbnQgPSB0YXJnZXQ7CiAgICB9CiAgICBmb3IgKGNvbnN0IGNyZWF0ZWQgb2YgY3JlYXRlZFBhcmVudHMpIHRyYWNrZWREaXJlY3RvcnlHdWFyZChjcmVhdGVkLnBhdGgsIFtjcmVhdGVkXSwgc3BlYywgbGFiZWwpOwogICAgcmV0dXJuIHsgcGF0aDogY3VycmVudCwgY3JlYXRlZFBhcmVudHMgfTsKICB9IGNhdGNoIChlcnJvcikgewogICAgdHJ5IHsKICAgICAgY2xlYW51cENyZWF0ZWRQYXJlbnRzKGNyZWF0ZWRQYXJlbnRzLCBzcGVjKTsKICAgIH0gY2F0Y2ggKGNsZWFudXBFcnJvcikgewogICAgICBpZiAoIWVycm9yPy5yZXN0b3JhdGlvbkluY29tcGxldGUpIHsKICAgICAgICB0aHJvdyBtYW5hZ2VkRGlyZWN0b3J5RmFpbHVyZShzcGVjLCBgJHtsYWJlbH0gY3JlYXRpb24gcmVzdG9yYXRpb24gaW5jb21wbGV0ZWAsIGNsZWFudXBFcnJvciwgY3JlYXRlZFBhcmVudHMubWFwKGVudHJ5ID0+IGVudHJ5LnBhdGgpKTsKICAgICAgfQogICAgICBlcnJvci5jbGVhbnVwQ2F1c2UgPSBjbGVhbnVwRXJyb3I7CiAgICB9CiAgICB0aHJvdyBlcnJvcjsKICB9Cn0KCmZ1bmN0aW9uIHZhbGlkYXRlRmlsZW5hbWVDb21wb25lbnQodmFsdWUsIGxhYmVsKSB7CiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgdmFsdWUubGVuZ3RoID4gMTI4CiAgICB8fCB2YWx1ZSA9PT0gJy4nIHx8IHZhbHVlID09PSAnLi4nCiAgICB8fCAhL15bQS1aYS16MC05XVtBLVphLXowLTkuXy1dKiQvLnRlc3QodmFsdWUpKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoYHBsdWdpbjogaW52YWxpZCAke2xhYmVsfSBmaWxlbmFtZSBjb21wb25lbnRgKTsKICB9Cn0KCmZ1bmN0aW9uIHZhbGlkYXRlU3BlY0ZpbGVuYW1lQ29tcG9uZW50cyhzcGVjKSB7CiAgdmFsaWRhdGVGaWxlbmFtZUNvbXBvbmVudChzcGVjPy5rZXksICdrZXknKTsKICB2YWxpZGF0ZUZpbGVuYW1lQ29tcG9uZW50KHNwZWM/LnZlcnNpb24sICd2ZXJzaW9uJyk7Cn0KCmZ1bmN0aW9uIGRpcmVjdG9yeUlkZW50aXR5KHBhdGgsIHNwZWMpIHsKICBjb25zdCBzdGF0dXMgPSBzYWZlRGlyZWN0b3J5U3RhdHVzKHBhdGgsIHNwZWMpOwogIHJldHVybiB7IGRldjogc3RhdHVzLmRldiwgaW5vOiBzdGF0dXMuaW5vIH07Cn0KCmZ1bmN0aW9uIGFzc2VydFRydXN0ZWREaXJlY3RvcnlJZGVudGl0eShyb290LCBwYXJ0cywgZXhwZWN0ZWQsIHNwZWMpIHsKICBjb25zdCBwYXRoID0gZW5zdXJlVHJ1c3RlZERpcmVjdG9yeShyb290LCBwYXJ0cywgc3BlYyk7CiAgY29uc3QgYWN0dWFsID0gZGlyZWN0b3J5SWRlbnRpdHkocGF0aCwgc3BlYyk7CiAgaWYgKGFjdHVhbC5kZXYgIT09IGV4cGVjdGVkLmRldiB8fCBhY3R1YWwuaW5vICE9PSBleHBlY3RlZC5pbm8pIHsKICAgIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IGNhY2hlIGRpcmVjdG9yeSBjaGFuZ2VkYCk7CiAgfQogIHJldHVybiBwYXRoOwp9CgpmdW5jdGlvbiBzYW1lRmlsZUlkZW50aXR5KGxlZnQsIHJpZ2h0KSB7CiAgcmV0dXJuIGxlZnQuZGV2ID09PSByaWdodC5kZXYgJiYgbGVmdC5pbm8gPT09IHJpZ2h0LmlubyAmJiBsZWZ0LnNpemUgPT09IHJpZ2h0LnNpemUKICAgICYmIGxlZnQubXRpbWVNcyA9PT0gcmlnaHQubXRpbWVNczsKfQoKZnVuY3Rpb24gcmVhZFNpbmdsZUxpbmtGaWxlKHBhdGgpIHsKICBsZXQgcGF0aEJlZm9yZTsKICB0cnkgewogICAgcGF0aEJlZm9yZSA9IGxzdGF0U3luYyhwYXRoKTsKICB9IGNhdGNoIHsKICAgIHJldHVybiBudWxsOwogIH0KICBpZiAoIXBhdGhCZWZvcmUuaXNGaWxlKCkgfHwgcGF0aEJlZm9yZS5pc1N5bWJvbGljTGluaygpIHx8IHBhdGhCZWZvcmUubmxpbmsgIT09IDEpIHJldHVybiBudWxsOwogIGxldCBkZXNjcmlwdG9yOwogIHRyeSB7CiAgICBkZXNjcmlwdG9yID0gb3BlblN5bmMocGF0aCwgJ3InKTsKICAgIGNvbnN0IGRlc2NyaXB0b3JCZWZvcmUgPSBmc3RhdFN5bmMoZGVzY3JpcHRvcik7CiAgICBpZiAoIWRlc2NyaXB0b3JCZWZvcmUuaXNGaWxlKCkgfHwgZGVzY3JpcHRvckJlZm9yZS5ubGluayAhPT0gMSB8fCAhc2FtZUZpbGVJZGVudGl0eShwYXRoQmVmb3JlLCBkZXNjcmlwdG9yQmVmb3JlKSkgcmV0dXJuIG51bGw7CiAgICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KHJlYWRGaWxlU3luYyhkZXNjcmlwdG9yKSk7CiAgICBjb25zdCBkZXNjcmlwdG9yQWZ0ZXIgPSBmc3RhdFN5bmMoZGVzY3JpcHRvcik7CiAgICBjb25zdCBwYXRoQWZ0ZXIgPSBsc3RhdFN5bmMocGF0aCk7CiAgICBpZiAoZGVzY3JpcHRvckFmdGVyLm5saW5rICE9PSAxIHx8IHBhdGhBZnRlci5ubGluayAhPT0gMQogICAgICB8fCAhc2FtZUZpbGVJZGVudGl0eShkZXNjcmlwdG9yQmVmb3JlLCBkZXNjcmlwdG9yQWZ0ZXIpCiAgICAgIHx8ICFzYW1lRmlsZUlkZW50aXR5KGRlc2NyaXB0b3JBZnRlciwgcGF0aEFmdGVyKSkgcmV0dXJuIG51bGw7CiAgICByZXR1cm4geyBieXRlcywgaWRlbnRpdHk6IHBhdGhBZnRlciB9OwogIH0gY2F0Y2ggewogICAgcmV0dXJuIG51bGw7CiAgfSBmaW5hbGx5IHsKICAgIGlmIChkZXNjcmlwdG9yICE9PSB1bmRlZmluZWQpIGNsb3NlU3luYyhkZXNjcmlwdG9yKTsKICB9Cn0KCmZ1bmN0aW9uIHdyaXRlRXhjbHVzaXZlKHBhdGgsIGJ5dGVzLCBleGVjdXRhYmxlLCBzcGVjKSB7CiAgbGV0IGRlc2NyaXB0b3I7CiAgdHJ5IHsKICAgIGRlc2NyaXB0b3IgPSBvcGVuU3luYyhwYXRoLCAnd3gnLCBleGVjdXRhYmxlID8gMG83MDAgOiAwbzYwMCk7CiAgICBsZXQgb2Zmc2V0ID0gMDsKICAgIHdoaWxlIChvZmZzZXQgPCBieXRlcy5sZW5ndGgpIG9mZnNldCArPSB3cml0ZVN5bmMoZGVzY3JpcHRvciwgYnl0ZXMsIG9mZnNldCk7CiAgfSBjYXRjaCB7CiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBhcmNoaXZlIGZpbGUgY291bGQgbm90IGJlIGNyZWF0ZWQgc2FmZWx5YCk7CiAgfSBmaW5hbGx5IHsKICAgIGlmIChkZXNjcmlwdG9yICE9PSB1bmRlZmluZWQpIGNsb3NlU3luYyhkZXNjcmlwdG9yKTsKICB9Cn0KCmZ1bmN0aW9uIHJlYWRKc29uKHBhdGgsIHNwZWMpIHsKICB0cnkgewogICAgcmV0dXJuIEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKHBhdGgsICd1dGY4JykpOwogIH0gY2F0Y2ggewogICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogcGx1Z2luIG1ldGFkYXRhIGlzIGludmFsaWRgKTsKICB9Cn0KCmZ1bmN0aW9uIGNvbnRhaW5lZFJlbGF0aXZlU291cmNlKHNvdXJjZVJvb3QsIHNvdXJjZSwgc3BlYykgewogIGlmICh0eXBlb2Ygc291cmNlICE9PSAnc3RyaW5nJyB8fCBzb3VyY2UuaW5jbHVkZXMoJ1wwJykpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBsdWdpbiBzb3VyY2UgaXMgaW52YWxpZGApOwogIGNvbnN0IHBvcnRhYmxlID0gc291cmNlLnJlcGxhY2UoL1xcL2csICcvJyk7CiAgaWYgKHBvcnRhYmxlLnN0YXJ0c1dpdGgoJy8nKSB8fCAvXltBLVphLXpdOi8udGVzdChwb3J0YWJsZSkpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBsdWdpbiBzb3VyY2UgaXMgaW52YWxpZGApOwogIGNvbnN0IHBhcnRzID0gcG9ydGFibGUuc3BsaXQoJy8nKTsKICBpZiAocGFydHMuaW5jbHVkZXMoJy4uJykpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBsdWdpbiBzb3VyY2UgaXMgaW52YWxpZGApOwogIGNvbnN0IG5vcm1hbGl6ZWQgPSBwYXJ0cy5maWx0ZXIocGFydCA9PiBwYXJ0ICYmIHBhcnQgIT09ICcuJykuam9pbignLycpOwogIGlmIChzcGVjLmtleSA9PT0gJ21lbW9yeScgJiYgbm9ybWFsaXplZCAhPT0gJ3BsdWdpbicpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IGRlY2xhcmVkIHBsdWdpbiBzb3VyY2UgbXVzdCBiZSBwbHVnaW4vYCk7CiAgaWYgKHNwZWMua2V5ID09PSAnc3VwZXJwb3dlcnMnICYmIHNvdXJjZSAhPT0gJy4vJykgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogZGVjbGFyZWQgcGx1Z2luIHNvdXJjZSBtdXN0IGJlIC4vYCk7CiAgY29uc3QgcGx1Z2luUm9vdCA9IG5vcm1hbGl6ZWQgPyBqb2luKHNvdXJjZVJvb3QsIC4uLm5vcm1hbGl6ZWQuc3BsaXQoJy8nKSkgOiBzb3VyY2VSb290OwogIGxldCBzdGF0dXM7CiAgdHJ5IHsKICAgIHN0YXR1cyA9IGxzdGF0U3luYyhwbHVnaW5Sb290KTsKICB9IGNhdGNoIHsKICAgIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBsdWdpbiBzb3VyY2UgaXMgbWlzc2luZ2ApOwogIH0KICBpZiAoc3RhdHVzLmlzU3ltYm9saWNMaW5rKCkgfHwgIXN0YXR1cy5pc0RpcmVjdG9yeSgpKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBwbHVnaW4gc291cmNlIGlzIGludmFsaWRgKTsKICByZXR1cm4gcGx1Z2luUm9vdDsKfQoKZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4dHJhY3RQbHVnaW5BcmNoaXZlKGJ5dGVzLCBzcGVjLCBkZXN0aW5hdGlvbikgewogIHZhbGlkYXRlU3BlY0ZpbGVuYW1lQ29tcG9uZW50cyhzcGVjKTsKICB2YWxpZGF0ZUFyY2hpdmUoYnl0ZXMsIHNwZWMpOwogIGNvbnN0IGFyY2hpdmUgPSBhd2FpdCBwYXJzZVRhcihieXRlcywgc3BlYyk7CiAgZW5zdXJlRGVzdGluYXRpb25EaXJlY3RvcnkoZGVzdGluYXRpb24sIHNwZWMpOwogIGNvbnN0IGRlc3RpbmF0aW9uU3RhdHVzID0gbHN0YXRTeW5jKGRlc3RpbmF0aW9uKTsKICBpZiAoZGVzdGluYXRpb25TdGF0dXMuaXNTeW1ib2xpY0xpbmsoKSB8fCAhZGVzdGluYXRpb25TdGF0dXMuaXNEaXJlY3RvcnkoKSkgewogICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogdW5zYWZlIGV4dHJhY3Rpb24gZGVzdGluYXRpb25gKTsKICB9CiAgY29uc3Qgc3RhZ2luZ1Jvb3QgPSBta2R0ZW1wU3luYyhqb2luKGRlc3RpbmF0aW9uLCBgLiR7c3BlYy5rZXl9LSR7c3BlYy52ZXJzaW9ufS1gKSk7CiAgdHJ5IHsKICAgIGZvciAoY29uc3QgZW50cnkgb2YgYXJjaGl2ZS5lbnRyaWVzKSB7CiAgICAgIGNvbnN0IHBhcmVudCA9IGVuc3VyZURpcmVjdG9yeShzdGFnaW5nUm9vdCwgZGlybmFtZShlbnRyeS5wYXRoKS5yZXBsYWNlKC9cXC9nLCAnLycpLCBzcGVjKTsKICAgICAgY29uc3QgdGFyZ2V0ID0gam9pbihwYXJlbnQsIGVudHJ5LnBhdGguc3BsaXQoJy8nKS5hdCgtMSkpOwogICAgICBpZiAoZW50cnkudHlwZSA9PT0gJzUnKSBlbnN1cmVEaXJlY3Rvcnkoc3RhZ2luZ1Jvb3QsIGVudHJ5LnBhdGgsIHNwZWMpOwogICAgICBlbHNlIHdyaXRlRXhjbHVzaXZlKHRhcmdldCwgZW50cnkuZGF0YSwgZW50cnkuZXhlY3V0YWJsZSwgc3BlYyk7CiAgICB9CiAgICBjb25zdCBzb3VyY2VSb290ID0gam9pbihzdGFnaW5nUm9vdCwgYXJjaGl2ZS5yb290KTsKICAgIGNvbnN0IG1hbmlmZXN0ID0gcmVhZEpzb24oam9pbihzb3VyY2VSb290LCAnLmNsYXVkZS1wbHVnaW4nLCAnbWFya2V0cGxhY2UuanNvbicpLCBzcGVjKTsKICAgIGNvbnN0IGV4cGVjdGVkQXJjaGl2ZU1hcmtldHBsYWNlID0gc3BlYy5hcmNoaXZlTWFya2V0cGxhY2UgfHwgc3BlYy5tYXJrZXRwbGFjZTsKICAgIGlmIChtYW5pZmVzdC5uYW1lICE9PSBleHBlY3RlZEFyY2hpdmVNYXJrZXRwbGFjZSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogbWFya2V0cGxhY2UgbmFtZSBtaXNtYXRjaGApOwogICAgY29uc3QgZW50cnkgPSBtYW5pZmVzdC5wbHVnaW5zPy5maW5kKHBsdWdpbiA9PiBwbHVnaW4ubmFtZSA9PT0gc3BlYy5wbHVnaW4pOwogICAgaWYgKCFlbnRyeSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogcGx1Z2luIGVudHJ5IGlzIG1pc3NpbmdgKTsKICAgIGNvbnN0IHBsdWdpblJvb3QgPSBjb250YWluZWRSZWxhdGl2ZVNvdXJjZShzb3VyY2VSb290LCBlbnRyeS5zb3VyY2UsIHNwZWMpOwogICAgY29uc3QgcGx1Z2luTWFuaWZlc3QgPSByZWFkSnNvbihqb2luKHBsdWdpblJvb3QsICcuY2xhdWRlLXBsdWdpbicsICdwbHVnaW4uanNvbicpLCBzcGVjKTsKICAgIGlmIChwbHVnaW5NYW5pZmVzdC5uYW1lICE9PSBzcGVjLnBsdWdpbiB8fCBwbHVnaW5NYW5pZmVzdC52ZXJzaW9uICE9PSBzcGVjLnZlcnNpb24pIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogcGx1Z2luIG1hbmlmZXN0IG1pc21hdGNoYCk7CiAgICB9CiAgICByZXR1cm4gc291cmNlUm9vdDsKICB9IGNhdGNoIChlcnJvcikgewogICAgcm1TeW5jKHN0YWdpbmdSb290LCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7CiAgICB0aHJvdyBlcnJvcjsKICB9Cn0KCmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkb3dubG9hZEFuZFN0YWdlKHNwZWMsIGNvbnRleHQpIHsKICB2YWxpZGF0ZVNwZWNGaWxlbmFtZUNvbXBvbmVudHMoc3BlYyk7CiAgY29uc3QgY2FjaGVEaXJlY3RvcnkgPSBlbnN1cmVUcnVzdGVkRGlyZWN0b3J5KGNvbnRleHQuY2xhd2dvZERpciwgWydjYWNoZScsICdjbGF1ZGUtcGx1Z2lucyddLCBzcGVjKTsKICBjb25zdCBjYWNoZURpcmVjdG9yeUlkZW50aXR5ID0gZGlyZWN0b3J5SWRlbnRpdHkoY2FjaGVEaXJlY3RvcnksIHNwZWMpOwogIGNvbnN0IGFyY2hpdmVQYXRoID0gam9pbihjYWNoZURpcmVjdG9yeSwgYCR7c3BlYy5rZXl9LSR7c3BlYy52ZXJzaW9ufS50YXIuZ3pgKTsKICBjb25zdCBzdGFnaW5nRGlyZWN0b3J5ID0gZW5zdXJlVHJ1c3RlZERpcmVjdG9yeShjb250ZXh0LmNsYXdnb2REaXIsIFsnc3RhZ2luZycsICdjbGF1ZGUtcGx1Z2lucyddLCBzcGVjKTsKICBsZXQgYXJjaGl2ZUJ5dGVzID0gbnVsbDsKICBsZXQgY2FjaGVJZGVudGl0eSA9IG51bGw7CiAgYXNzZXJ0VHJ1c3RlZERpcmVjdG9yeUlkZW50aXR5KGNvbnRleHQuY2xhd2dvZERpciwgWydjYWNoZScsICdjbGF1ZGUtcGx1Z2lucyddLCBjYWNoZURpcmVjdG9yeUlkZW50aXR5LCBzcGVjKTsKICBjb25zdCBjYWNoZWRGaWxlID0gcmVhZFNpbmdsZUxpbmtGaWxlKGFyY2hpdmVQYXRoKTsKICBhc3NlcnRUcnVzdGVkRGlyZWN0b3J5SWRlbnRpdHkoY29udGV4dC5jbGF3Z29kRGlyLCBbJ2NhY2hlJywgJ2NsYXVkZS1wbHVnaW5zJ10sIGNhY2hlRGlyZWN0b3J5SWRlbnRpdHksIHNwZWMpOwogIGlmIChjYWNoZWRGaWxlKSB7CiAgICB0cnkgewogICAgICBhcmNoaXZlQnl0ZXMgPSBjYWNoZWRGaWxlLmJ5dGVzOwogICAgICB2YWxpZGF0ZUFyY2hpdmUoYXJjaGl2ZUJ5dGVzLCBzcGVjKTsKICAgICAgY2FjaGVJZGVudGl0eSA9IGNhY2hlZEZpbGUuaWRlbnRpdHk7CiAgICB9IGNhdGNoIHsKICAgICAgYXJjaGl2ZUJ5dGVzID0gbnVsbDsKICAgICAgY2FjaGVJZGVudGl0eSA9IG51bGw7CiAgICB9CiAgfQogIGxldCBjYWNoZWQgPSBhcmNoaXZlQnl0ZXMgIT09IG51bGw7CiAgaWYgKCFjYWNoZWQpIHsKICAgIGNvbnN0IHRlbXBvcmFyeURpcmVjdG9yeSA9IG1rZHRlbXBTeW5jKGpvaW4oY2FjaGVEaXJlY3RvcnksIGAuJHtzcGVjLmtleX0tJHtzcGVjLnZlcnNpb259LWApKTsKICAgIGNvbnN0IHRlbXBvcmFyeUFyY2hpdmUgPSBqb2luKHRlbXBvcmFyeURpcmVjdG9yeSwgJ2Rvd25sb2FkLnRhci5neicpOwogICAgdHJ5IHsKICAgICAgbGV0IHJlc3VsdDsKICAgICAgdHJ5IHsKICAgICAgICByZXN1bHQgPSBCdW4uc3Bhd25TeW5jKHsKICAgICAgICAgIGNtZDogW2NvbnRleHQuYnVuUGF0aCwgY29udGV4dC5mZXRjaEZpbGVQYXRoLCBzcGVjLnVybCwgdGVtcG9yYXJ5QXJjaGl2ZV0sCiAgICAgICAgICBlbnY6IGNvbnRleHQuZW52LAogICAgICAgICAgc3Rkb3V0OiAncGlwZScsCiAgICAgICAgICBzdGRlcnI6ICdwaXBlJywKICAgICAgICB9KTsKICAgICAgfSBjYXRjaCB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogZG93bmxvYWQgZmFpbGVkYCk7CiAgICAgIH0KICAgICAgaWYgKHJlc3VsdC5leGl0Q29kZSAhPT0gMCkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogZG93bmxvYWQgZmFpbGVkYCk7CiAgICAgIGFzc2VydFRydXN0ZWREaXJlY3RvcnlJZGVudGl0eShjb250ZXh0LmNsYXdnb2REaXIsIFsnY2FjaGUnLCAnY2xhdWRlLXBsdWdpbnMnXSwgY2FjaGVEaXJlY3RvcnlJZGVudGl0eSwgc3BlYyk7CiAgICAgIGNvbnN0IHRlbXBvcmFyeUZpbGUgPSByZWFkU2luZ2xlTGlua0ZpbGUodGVtcG9yYXJ5QXJjaGl2ZSk7CiAgICAgIGlmICghdGVtcG9yYXJ5RmlsZSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogZG93bmxvYWQgZmFpbGVkYCk7CiAgICAgIGFyY2hpdmVCeXRlcyA9IHRlbXBvcmFyeUZpbGUuYnl0ZXM7CiAgICAgIHZhbGlkYXRlQXJjaGl2ZShhcmNoaXZlQnl0ZXMsIHNwZWMpOwogICAgICBhc3NlcnRUcnVzdGVkRGlyZWN0b3J5SWRlbnRpdHkoY29udGV4dC5jbGF3Z29kRGlyLCBbJ2NhY2hlJywgJ2NsYXVkZS1wbHVnaW5zJ10sIGNhY2hlRGlyZWN0b3J5SWRlbnRpdHksIHNwZWMpOwogICAgICByZW5hbWVTeW5jKHRlbXBvcmFyeUFyY2hpdmUsIGFyY2hpdmVQYXRoKTsKICAgICAgYXNzZXJ0VHJ1c3RlZERpcmVjdG9yeUlkZW50aXR5KGNvbnRleHQuY2xhd2dvZERpciwgWydjYWNoZScsICdjbGF1ZGUtcGx1Z2lucyddLCBjYWNoZURpcmVjdG9yeUlkZW50aXR5LCBzcGVjKTsKICAgICAgY29uc3QgaW5zdGFsbGVkRmlsZSA9IHJlYWRTaW5nbGVMaW5rRmlsZShhcmNoaXZlUGF0aCk7CiAgICAgIGlmICghaW5zdGFsbGVkRmlsZSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogY2FjaGUgcmVwbGFjZW1lbnQgaXMgdW5zYWZlYCk7CiAgICAgIHZhbGlkYXRlQXJjaGl2ZShpbnN0YWxsZWRGaWxlLmJ5dGVzLCBzcGVjKTsKICAgICAgYXJjaGl2ZUJ5dGVzID0gaW5zdGFsbGVkRmlsZS5ieXRlczsKICAgICAgY2FjaGVJZGVudGl0eSA9IGluc3RhbGxlZEZpbGUuaWRlbnRpdHk7CiAgICB9IGZpbmFsbHkgewogICAgICBybVN5bmModGVtcG9yYXJ5RGlyZWN0b3J5LCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7CiAgICB9CiAgfQogIGNvbnN0IHNvdXJjZVJvb3QgPSBhd2FpdCBleHRyYWN0UGx1Z2luQXJjaGl2ZShhcmNoaXZlQnl0ZXMsIHNwZWMsIHN0YWdpbmdEaXJlY3RvcnkpOwogIGFzc2VydFRydXN0ZWREaXJlY3RvcnlJZGVudGl0eShjb250ZXh0LmNsYXdnb2REaXIsIFsnY2FjaGUnLCAnY2xhdWRlLXBsdWdpbnMnXSwgY2FjaGVEaXJlY3RvcnlJZGVudGl0eSwgc3BlYyk7CiAgY29uc3QgZmluYWxDYWNoZUZpbGUgPSByZWFkU2luZ2xlTGlua0ZpbGUoYXJjaGl2ZVBhdGgpOwogIGFzc2VydFRydXN0ZWREaXJlY3RvcnlJZGVudGl0eShjb250ZXh0LmNsYXdnb2REaXIsIFsnY2FjaGUnLCAnY2xhdWRlLXBsdWdpbnMnXSwgY2FjaGVEaXJlY3RvcnlJZGVudGl0eSwgc3BlYyk7CiAgaWYgKCFmaW5hbENhY2hlRmlsZSB8fCAhc2FtZUZpbGVJZGVudGl0eShjYWNoZUlkZW50aXR5LCBmaW5hbENhY2hlRmlsZS5pZGVudGl0eSkpIHsKICAgIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IGNhY2hlIGNoYW5nZWQgZHVyaW5nIHVzZWApOwogIH0KICB2YWxpZGF0ZUFyY2hpdmUoZmluYWxDYWNoZUZpbGUuYnl0ZXMsIHNwZWMpOwogIHJldHVybiB7IHNvdXJjZVJvb3QsIGFyY2hpdmVQYXRoLCBjYWNoZWQgfTsKfQoKY29uc3QgU0VNVkVSID0gL14oMHxbMS05XVxkKilcLigwfFsxLTldXGQqKVwuKDB8WzEtOV1cZCopKD86LShbMC05QS1aYS16LV0rKD86XC5bMC05QS1aYS16LV0rKSopKT8kLzsKCmV4cG9ydCBmdW5jdGlvbiBwYXJzZVNlbXZlcih2YWx1ZSkgewogIGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSByZXR1cm4gbnVsbDsKICBjb25zdCBtYXRjaCA9IFNFTVZFUi5leGVjKHZhbHVlKTsKICBpZiAoIW1hdGNoKSByZXR1cm4gbnVsbDsKICBjb25zdCBbbWFqb3IsIG1pbm9yLCBwYXRjaCwgcHJlcmVsZWFzZVRleHRdID0gbWF0Y2guc2xpY2UoMSk7CiAgY29uc3QgcHJlcmVsZWFzZSA9IHByZXJlbGVhc2VUZXh0ID8gcHJlcmVsZWFzZVRleHQuc3BsaXQoJy4nKS5tYXAoaWRlbnRpZmllciA9PiB7CiAgICBpZiAoIS9eXGQrJC8udGVzdChpZGVudGlmaWVyKSkgcmV0dXJuIGlkZW50aWZpZXI7CiAgICBpZiAoIS9eKDB8WzEtOV1cZCopJC8udGVzdChpZGVudGlmaWVyKSkgcmV0dXJuIG51bGw7CiAgICBjb25zdCBudW1lcmljID0gTnVtYmVyKGlkZW50aWZpZXIpOwogICAgcmV0dXJuIE51bWJlci5pc1NhZmVJbnRlZ2VyKG51bWVyaWMpID8gbnVtZXJpYyA6IG51bGw7CiAgfSkgOiBbXTsKICBpZiAocHJlcmVsZWFzZS5pbmNsdWRlcyhudWxsKSkgcmV0dXJuIG51bGw7CiAgY29uc3QgY29yZSA9IFttYWpvciwgbWlub3IsIHBhdGNoXS5tYXAoTnVtYmVyKTsKICBpZiAoIWNvcmUuZXZlcnkoTnVtYmVyLmlzU2FmZUludGVnZXIpKSByZXR1cm4gbnVsbDsKICByZXR1cm4geyBtYWpvcjogY29yZVswXSwgbWlub3I6IGNvcmVbMV0sIHBhdGNoOiBjb3JlWzJdLCBwcmVyZWxlYXNlIH07Cn0KCmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlU2VtdmVyKGxlZnQsIHJpZ2h0KSB7CiAgY29uc3QgbGVmdFZlcnNpb24gPSBwYXJzZVNlbXZlcihsZWZ0KTsKICBjb25zdCByaWdodFZlcnNpb24gPSBwYXJzZVNlbXZlcihyaWdodCk7CiAgaWYgKCFsZWZ0VmVyc2lvbiB8fCAhcmlnaHRWZXJzaW9uKSByZXR1cm4gbnVsbDsKICBmb3IgKGNvbnN0IGtleSBvZiBbJ21ham9yJywgJ21pbm9yJywgJ3BhdGNoJ10pIHsKICAgIGlmIChsZWZ0VmVyc2lvbltrZXldICE9PSByaWdodFZlcnNpb25ba2V5XSkgcmV0dXJuIGxlZnRWZXJzaW9uW2tleV0gPCByaWdodFZlcnNpb25ba2V5XSA/IC0xIDogMTsKICB9CiAgaWYgKGxlZnRWZXJzaW9uLnByZXJlbGVhc2UubGVuZ3RoID09PSAwIHx8IHJpZ2h0VmVyc2lvbi5wcmVyZWxlYXNlLmxlbmd0aCA9PT0gMCkgewogICAgaWYgKGxlZnRWZXJzaW9uLnByZXJlbGVhc2UubGVuZ3RoID09PSByaWdodFZlcnNpb24ucHJlcmVsZWFzZS5sZW5ndGgpIHJldHVybiAwOwogICAgcmV0dXJuIGxlZnRWZXJzaW9uLnByZXJlbGVhc2UubGVuZ3RoID09PSAwID8gMSA6IC0xOwogIH0KICBjb25zdCBsZW5ndGggPSBNYXRoLm1pbihsZWZ0VmVyc2lvbi5wcmVyZWxlYXNlLmxlbmd0aCwgcmlnaHRWZXJzaW9uLnByZXJlbGVhc2UubGVuZ3RoKTsKICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7CiAgICBjb25zdCBsZWZ0SWRlbnRpZmllciA9IGxlZnRWZXJzaW9uLnByZXJlbGVhc2VbaW5kZXhdOwogICAgY29uc3QgcmlnaHRJZGVudGlmaWVyID0gcmlnaHRWZXJzaW9uLnByZXJlbGVhc2VbaW5kZXhdOwogICAgaWYgKGxlZnRJZGVudGlmaWVyID09PSByaWdodElkZW50aWZpZXIpIGNvbnRpbnVlOwogICAgaWYgKHR5cGVvZiBsZWZ0SWRlbnRpZmllciA9PT0gJ251bWJlcicgJiYgdHlwZW9mIHJpZ2h0SWRlbnRpZmllciA9PT0gJ251bWJlcicpIHJldHVybiBsZWZ0SWRlbnRpZmllciA8IHJpZ2h0SWRlbnRpZmllciA/IC0xIDogMTsKICAgIGlmICh0eXBlb2YgbGVmdElkZW50aWZpZXIgPT09ICdudW1iZXInKSByZXR1cm4gLTE7CiAgICBpZiAodHlwZW9mIHJpZ2h0SWRlbnRpZmllciA9PT0gJ251bWJlcicpIHJldHVybiAxOwogICAgcmV0dXJuIGxlZnRJZGVudGlmaWVyIDwgcmlnaHRJZGVudGlmaWVyID8gLTEgOiAxOwogIH0KICBpZiAobGVmdFZlcnNpb24ucHJlcmVsZWFzZS5sZW5ndGggPT09IHJpZ2h0VmVyc2lvbi5wcmVyZWxlYXNlLmxlbmd0aCkgcmV0dXJuIDA7CiAgcmV0dXJuIGxlZnRWZXJzaW9uLnByZXJlbGVhc2UubGVuZ3RoIDwgcmlnaHRWZXJzaW9uLnByZXJlbGVhc2UubGVuZ3RoID8gLTEgOiAxOwp9CgpleHBvcnQgZnVuY3Rpb24gc2VsZWN0SW5zdGFsbGVkUmVjb3JkKGluc3RhbGxlZCwgaWQpIHsKICBjb25zdCByZWNvcmRzID0gQXJyYXkuaXNBcnJheShpbnN0YWxsZWQ/LnBsdWdpbnM/LltpZF0pID8gaW5zdGFsbGVkLnBsdWdpbnNbaWRdIDogW107CiAgbGV0IHNlbGVjdGVkID0gbnVsbDsKICBmb3IgKGNvbnN0IHJlY29yZCBvZiByZWNvcmRzKSB7CiAgICBpZiAocmVjb3JkPy5zY29wZSAhPT0gJ3VzZXInIHx8ICFwYXJzZVNlbXZlcihyZWNvcmQudmVyc2lvbikpIGNvbnRpbnVlOwogICAgaWYgKCFzZWxlY3RlZCB8fCBjb21wYXJlU2VtdmVyKHJlY29yZC52ZXJzaW9uLCBzZWxlY3RlZC52ZXJzaW9uKSA+IDApIHNlbGVjdGVkID0gcmVjb3JkOwogIH0KICByZXR1cm4gc2VsZWN0ZWQ7Cn0KCmV4cG9ydCBmdW5jdGlvbiBjbGFzc2lmeVBsdWdpbihpbnN0YWxsZWQsIHNwZWMpIHsKICBjb25zdCByZWNvcmRzID0gQXJyYXkuaXNBcnJheShpbnN0YWxsZWQ/LnBsdWdpbnM/LltzcGVjLmlkXSkgPyBpbnN0YWxsZWQucGx1Z2luc1tzcGVjLmlkXSA6IFtdOwogIGNvbnN0IHVzZXJSZWNvcmRzID0gcmVjb3Jkcy5maWx0ZXIocmVjb3JkID0+IHJlY29yZD8uc2NvcGUgPT09ICd1c2VyJyk7CiAgaWYgKHVzZXJSZWNvcmRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuICdtaXNzaW5nJzsKICBjb25zdCBzZWxlY3RlZCA9IHNlbGVjdEluc3RhbGxlZFJlY29yZChpbnN0YWxsZWQsIHNwZWMuaWQpOwogIGlmICghc2VsZWN0ZWQgfHwgIXBhcnNlU2VtdmVyKHNlbGVjdGVkLnZlcnNpb24pKSByZXR1cm4gJ2ludmFsaWQnOwogIGNvbnN0IGNvbXBhcmlzb24gPSBjb21wYXJlU2VtdmVyKHNlbGVjdGVkLnZlcnNpb24sIHNwZWMudmVyc2lvbik7CiAgaWYgKGNvbXBhcmlzb24gPT09IG51bGwpIHJldHVybiAnaW52YWxpZCc7CiAgcmV0dXJuIGNvbXBhcmlzb24gPCAwID8gJ29sZGVyJyA6ICdzYXRpc2ZpZWQnOwp9CgpmdW5jdGlvbiBzbmFwc2hvdEZpbGUocGF0aCwgc3BlYykgewogIGNvbnN0IHBhcmVudFRydXN0ID0gY2FwdHVyZURpcmVjdG9yeVRydXN0KGRpcm5hbWUocGF0aCksIHNwZWMpOwogIGxldCBzdGF0dXM7CiAgdHJ5IHsKICAgIHN0YXR1cyA9IGxzdGF0U3luYyhwYXRoKTsKICB9IGNhdGNoIChlcnJvcikgewogICAgaWYgKGVycm9yPy5jb2RlID09PSAnRU5PRU5UJykgcmV0dXJuIHsgcHJlc2VudDogZmFsc2UsIHBhcmVudFRydXN0IH07CiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBwbHVnaW4gc3RhdGUgY291bGQgbm90IGJlIHJlYWRgKTsKICB9CiAgaWYgKCFzdGF0dXMuaXNGaWxlKCkgfHwgc3RhdHVzLmlzU3ltYm9saWNMaW5rKCkgfHwgc3RhdHVzLm5saW5rICE9PSAxKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBwbHVnaW4gc3RhdGUgZmlsZSBpcyB1bnNhZmVgKTsKICB9CiAgY29uc3QgZmlsZSA9IHJlYWRTaW5nbGVMaW5rRmlsZShwYXRoKTsKICBpZiAoIWZpbGUpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBsdWdpbiBzdGF0ZSBmaWxlIGNoYW5nZWQgd2hpbGUgcmVhZGluZ2ApOwogIHJldHVybiB7IHByZXNlbnQ6IHRydWUsIGJ5dGVzOiBmaWxlLmJ5dGVzLCBtb2RlOiBzdGF0dXMubW9kZSAmIDBvNzc3LCBwYXJlbnRUcnVzdCB9Owp9CgpmdW5jdGlvbiBwYXJzZVN0YXRlU25hcHNob3Qoc25hcHNob3QsIGZhbGxiYWNrLCBzcGVjLCBsYWJlbCkgewogIGlmICghc25hcHNob3QucHJlc2VudCkgcmV0dXJuIGZhbGxiYWNrOwogIHRyeSB7CiAgICBjb25zdCB2YWx1ZSA9IEpTT04ucGFyc2UodGV4dERlY29kZXIuZGVjb2RlKHNuYXBzaG90LmJ5dGVzKSk7CiAgICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCcpOwogICAgcmV0dXJuIHZhbHVlOwogIH0gY2F0Y2ggewogICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogJHtsYWJlbH0gaXMgbWFsZm9ybWVkYCk7CiAgfQp9CgpmdW5jdGlvbiBhc3NlcnREaXJlY3RvcnlJZGVudGl0eShwYXRoLCBleHBlY3RlZCwgc3BlYywgbGFiZWwpIHsKICBjb25zdCBhY3R1YWwgPSBkaXJlY3RvcnlJZGVudGl0eShwYXRoLCBzcGVjKTsKICBpZiAoYWN0dWFsLmRldiAhPT0gZXhwZWN0ZWQuZGV2IHx8IGFjdHVhbC5pbm8gIT09IGV4cGVjdGVkLmlubykgewogICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogJHtsYWJlbH0gZGlyZWN0b3J5IGNoYW5nZWRgKTsKICB9Cn0KCmZ1bmN0aW9uIGNhcHR1cmVEaXJlY3RvcnlUcnVzdChwYXRoLCBzcGVjKSB7CiAgY29uc3QgcmVxdWVzdGVkID0gcmVzb2x2ZShwYXRoKTsKICBjb25zdCBzdWZmaXggPSBbXTsKICBsZXQgZXhpc3RpbmcgPSByZXF1ZXN0ZWQ7CiAgd2hpbGUgKCFleGlzdHNTeW5jKGV4aXN0aW5nKSkgewogICAgY29uc3QgcGFyZW50ID0gZGlybmFtZShleGlzdGluZyk7CiAgICBpZiAocGFyZW50ID09PSBleGlzdGluZykgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogdW5zYWZlIG1hbmFnZWQgZGlyZWN0b3J5YCk7CiAgICBzdWZmaXgudW5zaGlmdChiYXNlbmFtZShleGlzdGluZykpOwogICAgZXhpc3RpbmcgPSBwYXJlbnQ7CiAgfQogIGNvbnN0IHBhdGhzID0gW107CiAgbGV0IGN1cnJlbnQgPSBleGlzdGluZzsKICB3aGlsZSAodHJ1ZSkgewogICAgcGF0aHMudW5zaGlmdChjdXJyZW50KTsKICAgIGNvbnN0IHBhcmVudCA9IGRpcm5hbWUoY3VycmVudCk7CiAgICBpZiAocGFyZW50ID09PSBjdXJyZW50KSBicmVhazsKICAgIGN1cnJlbnQgPSBwYXJlbnQ7CiAgfQogIGNvbnN0IGNoYWluID0gcGF0aHMubWFwKGNoYWluUGF0aCA9PiAoeyBwYXRoOiBjaGFpblBhdGgsIGlkZW50aXR5OiBkaXJlY3RvcnlJZGVudGl0eShjaGFpblBhdGgsIHNwZWMpIH0pKTsKICByZXR1cm4geyByZXF1ZXN0ZWQsIHN1ZmZpeCwgY2hhaW4gfTsKfQoKZnVuY3Rpb24gZGlyZWN0b3J5VHJ1c3RQcmVzZW50KHRydXN0LCBzcGVjLCBsYWJlbCkgewogIGlmICghdHJ1c3QgfHwgIUFycmF5LmlzQXJyYXkodHJ1c3QuY2hhaW4pIHx8IHRydXN0LmNoYWluLmxlbmd0aCA9PT0gMCkgewogICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogJHtsYWJlbH0gZGlyZWN0b3J5IHRydXN0IGlzIG1pc3NpbmdgKTsKICB9CiAgZm9yIChjb25zdCBlbnRyeSBvZiB0cnVzdC5jaGFpbikgYXNzZXJ0RGlyZWN0b3J5SWRlbnRpdHkoZW50cnkucGF0aCwgZW50cnkuaWRlbnRpdHksIHNwZWMsIGxhYmVsKTsKICBsZXQgY3VycmVudCA9IHRydXN0LmNoYWluW3RydXN0LmNoYWluLmxlbmd0aCAtIDFdLnBhdGg7CiAgZm9yIChjb25zdCBwYXJ0IG9mIHRydXN0LnN1ZmZpeCkgewogICAgY3VycmVudCA9IGpvaW4oY3VycmVudCwgcGFydCk7CiAgICBsZXQgc3RhdHVzOwogICAgdHJ5IHsKICAgICAgc3RhdHVzID0gbHN0YXRTeW5jKGN1cnJlbnQpOwogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgaWYgKGVycm9yPy5jb2RlID09PSAnRU5PRU5UJykgcmV0dXJuIGZhbHNlOwogICAgICB0aHJvdyBlcnJvcjsKICAgIH0KICAgIGlmIChzdGF0dXMuaXNTeW1ib2xpY0xpbmsoKSB8fCAhc3RhdHVzLmlzRGlyZWN0b3J5KCkpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHVuc2FmZSBtYW5hZ2VkIGRpcmVjdG9yeWApOwogIH0KICBpZiAocmVzb2x2ZShjdXJyZW50KSAhPT0gdHJ1c3QucmVxdWVzdGVkKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiAke2xhYmVsfSBkaXJlY3RvcnkgY2hhbmdlZGApOwogIHJldHVybiB0cnVlOwp9CgpmdW5jdGlvbiBhc3NlcnREaXJlY3RvcnlUcnVzdCh0cnVzdCwgc3BlYywgbGFiZWwpIHsKICBpZiAoIWRpcmVjdG9yeVRydXN0UHJlc2VudCh0cnVzdCwgc3BlYywgbGFiZWwpKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiAke2xhYmVsfSBkaXJlY3RvcnkgaXMgYWJzZW50YCk7CiAgfQp9CgpmdW5jdGlvbiBzYWZlUmVtb3ZlRXhhY3QodGFyZ2V0LCBwYXJlbnQsIG5hbWUsIHJlY3Vyc2l2ZSwgc3BlYywgcGFyZW50VHJ1c3QpIHsKICBpZiAoZGlybmFtZSh0YXJnZXQpICE9PSBwYXJlbnQgfHwgYmFzZW5hbWUodGFyZ2V0KSAhPT0gbmFtZSkgewogICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogdW5zYWZlIHRyYW5zYWN0aW9uIGNsZWFudXAgdGFyZ2V0YCk7CiAgfQogIGFzc2VydERpcmVjdG9yeVRydXN0KHBhcmVudFRydXN0LCBzcGVjLCAndHJhbnNhY3Rpb24gY2xlYW51cCBwYXJlbnQnKTsKICBsZXQgc3RhdHVzOwogIHRyeSB7CiAgICBzdGF0dXMgPSBsc3RhdFN5bmModGFyZ2V0KTsKICB9IGNhdGNoIChlcnJvcikgewogICAgaWYgKGVycm9yPy5jb2RlID09PSAnRU5PRU5UJykgcmV0dXJuOwogICAgdGhyb3cgZXJyb3I7CiAgfQogIGFzc2VydERpcmVjdG9yeVRydXN0KHBhcmVudFRydXN0LCBzcGVjLCAndHJhbnNhY3Rpb24gY2xlYW51cCBwYXJlbnQnKTsKICBpZiAoc3RhdHVzLmlzU3ltYm9saWNMaW5rKCkpIHJtU3luYyh0YXJnZXQsIHsgZm9yY2U6IHRydWUgfSk7CiAgZWxzZSBpZiAoc3RhdHVzLmlzRGlyZWN0b3J5KCkpIHsKICAgIGlmICghcmVjdXJzaXZlKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiB1bnNhZmUgdHJhbnNhY3Rpb24gY2xlYW51cCB0eXBlYCk7CiAgICBybVN5bmModGFyZ2V0LCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7CiAgfSBlbHNlIGlmIChzdGF0dXMuaXNGaWxlKCkpIHJtU3luYyh0YXJnZXQsIHsgZm9yY2U6IHRydWUgfSk7CiAgZWxzZSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiB1bnNhZmUgdHJhbnNhY3Rpb24gY2xlYW51cCB0eXBlYCk7Cn0KCmZ1bmN0aW9uIHJlc3RvcmVGaWxlKHBhdGgsIHNuYXBzaG90LCBzcGVjKSB7CiAgY29uc3QgcGFyZW50ID0gZGlybmFtZShwYXRoKTsKICBpZiAoIXNuYXBzaG90LnByZXNlbnQpIHsKICAgIGlmICghZGlyZWN0b3J5VHJ1c3RQcmVzZW50KHNuYXBzaG90LnBhcmVudFRydXN0LCBzcGVjLCAncGx1Z2luIHN0YXRlIHBhcmVudCcpKSByZXR1cm47CiAgICBzYWZlUmVtb3ZlRXhhY3QocGF0aCwgcGFyZW50LCBiYXNlbmFtZShwYXRoKSwgZmFsc2UsIHNwZWMsIHNuYXBzaG90LnBhcmVudFRydXN0KTsKICAgIHJldHVybjsKICB9CiAgYXNzZXJ0RGlyZWN0b3J5VHJ1c3Qoc25hcHNob3QucGFyZW50VHJ1c3QsIHNwZWMsICdwbHVnaW4gc3RhdGUgcGFyZW50Jyk7CiAgY29uc3Qgc3RhZ2VkID0gYCR7cGF0aH0uJHtwcm9jZXNzLnBpZH0ucmVzdG9yZWA7CiAgaWYgKGV4aXN0c1N5bmMoc3RhZ2VkKSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogcmVzdG9yYXRpb24gc3RhZ2luZyBwYXRoIGFscmVhZHkgZXhpc3RzYCk7CiAgdHJ5IHsKICAgIHdyaXRlRXhjbHVzaXZlKHN0YWdlZCwgc25hcHNob3QuYnl0ZXMsIGZhbHNlLCBzcGVjKTsKICAgIGNobW9kU3luYyhzdGFnZWQsIHNuYXBzaG90Lm1vZGUpOwogICAgY29uc3QgY3VycmVudCA9IGV4aXN0c1N5bmMocGF0aCkgPyBsc3RhdFN5bmMocGF0aCkgOiBudWxsOwogICAgaWYgKGN1cnJlbnQ/LmlzRGlyZWN0b3J5KCkpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBsdWdpbiBzdGF0ZSBwYXRoIGJlY2FtZSBhIGRpcmVjdG9yeWApOwogICAgcmVuYW1lU3luYyhzdGFnZWQsIHBhdGgpOwogIH0gZmluYWxseSB7CiAgICBpZiAoZXhpc3RzU3luYyhzdGFnZWQpKSBzYWZlUmVtb3ZlRXhhY3Qoc3RhZ2VkLCBwYXJlbnQsIGJhc2VuYW1lKHN0YWdlZCksIGZhbHNlLCBzcGVjLCBzbmFwc2hvdC5wYXJlbnRUcnVzdCk7CiAgfQp9CgpmdW5jdGlvbiBjb3B5VmFsaWRhdGVkRGlyZWN0b3J5KHNvdXJjZSwgZGVzdGluYXRpb24sIHNwZWMpIHsKICBjb25zdCBzb3VyY2VJZGVudGl0eSA9IGRpcmVjdG9yeUlkZW50aXR5KHNvdXJjZSwgc3BlYyk7CiAgbWtkaXJTeW5jKGRlc3RpbmF0aW9uLCAwbzcwMCk7CiAgY29uc3QgZGVzdGluYXRpb25TdGF0dXMgPSBsc3RhdFN5bmMoZGVzdGluYXRpb24pOwogIGlmIChkZXN0aW5hdGlvblN0YXR1cy5pc1N5bWJvbGljTGluaygpIHx8ICFkZXN0aW5hdGlvblN0YXR1cy5pc0RpcmVjdG9yeSgpKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBwZXJzaXN0ZW50IHNvdXJjZSBzdGFnaW5nIGlzIHVuc2FmZWApOwogIH0KICBmb3IgKGNvbnN0IG5hbWUgb2YgcmVhZGRpclN5bmMoc291cmNlKS5zb3J0KCkpIHsKICAgIGlmICghbmFtZSB8fCBuYW1lID09PSAnLicgfHwgbmFtZSA9PT0gJy4uJyB8fCBuYW1lLmxlbmd0aCA+IDI1NSB8fCBuYW1lLmluY2x1ZGVzKCcvJykgfHwgbmFtZS5pbmNsdWRlcygnXFwnKSB8fCBuYW1lLmluY2x1ZGVzKCdcMCcpKSB7CiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IGludmFsaWQgc3RhZ2VkIHNvdXJjZSBlbnRyeWApOwogICAgfQogICAgY29uc3Qgc291cmNlUGF0aCA9IGpvaW4oc291cmNlLCBuYW1lKTsKICAgIGNvbnN0IGRlc3RpbmF0aW9uUGF0aCA9IGpvaW4oZGVzdGluYXRpb24sIG5hbWUpOwogICAgY29uc3Qgc3RhdHVzID0gbHN0YXRTeW5jKHNvdXJjZVBhdGgpOwogICAgaWYgKHN0YXR1cy5pc1N5bWJvbGljTGluaygpKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBzdGFnZWQgc291cmNlIGNvbnRhaW5zIGEgbGlua2ApOwogICAgaWYgKHN0YXR1cy5pc0RpcmVjdG9yeSgpKSBjb3B5VmFsaWRhdGVkRGlyZWN0b3J5KHNvdXJjZVBhdGgsIGRlc3RpbmF0aW9uUGF0aCwgc3BlYyk7CiAgICBlbHNlIGlmIChzdGF0dXMuaXNGaWxlKCkgJiYgc3RhdHVzLm5saW5rID09PSAxKSB7CiAgICAgIGNvbnN0IGZpbGUgPSByZWFkU2luZ2xlTGlua0ZpbGUoc291cmNlUGF0aCk7CiAgICAgIGlmICghZmlsZSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogc3RhZ2VkIHNvdXJjZSBmaWxlIGNoYW5nZWQgd2hpbGUgY29weWluZ2ApOwogICAgICB3cml0ZUV4Y2x1c2l2ZShkZXN0aW5hdGlvblBhdGgsIGZpbGUuYnl0ZXMsIChzdGF0dXMubW9kZSAmIDBvMTExKSAhPT0gMCwgc3BlYyk7CiAgICB9IGVsc2UgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogc3RhZ2VkIHNvdXJjZSBjb250YWlucyBhbiB1bnNhZmUgZW50cnlgKTsKICB9CiAgYXNzZXJ0RGlyZWN0b3J5SWRlbnRpdHkoc291cmNlLCBzb3VyY2VJZGVudGl0eSwgc3BlYywgJ3N0YWdlZCBzb3VyY2UnKTsKfQoKZnVuY3Rpb24gcHJlcGFyZURpcmVjdG9yeVJlcGxhY2VtZW50KHRhcmdldCwgc3BlYywgbGFiZWwsIHBhcmVudEd1YXJkID0gbnVsbCkgewogIGNvbnN0IHBhcmVudCA9IGRpcm5hbWUodGFyZ2V0KTsKICBjb25zdCBwYXJlbnRUcnVzdCA9IHBhcmVudEd1YXJkPy50cnVzdCB8fCBjYXB0dXJlRGlyZWN0b3J5VHJ1c3QocGFyZW50LCBzcGVjKTsKICBjb25zdCBwYXJlbnRJZGVudGl0eSA9IHBhcmVudEd1YXJkPy5pZGVudGl0eSB8fCBkaXJlY3RvcnlJZGVudGl0eShwYXJlbnQsIHNwZWMpOwogIGFzc2VydERpcmVjdG9yeVRydXN0KHBhcmVudFRydXN0LCBzcGVjLCBsYWJlbCk7CiAgYXNzZXJ0RGlyZWN0b3J5SWRlbnRpdHkocGFyZW50LCBwYXJlbnRJZGVudGl0eSwgc3BlYywgbGFiZWwpOwogIGNvbnN0IGJhY2t1cCA9IGAke3RhcmdldH0uJHtwcm9jZXNzLnBpZH0uYmFja3VwYDsKICBpZiAoZXhpc3RzU3luYyhiYWNrdXApKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiAke2xhYmVsfSBiYWNrdXAgYWxyZWFkeSBleGlzdHNgKTsKICBjb25zdCB0cmFuc2FjdGlvbiA9IHsgdGFyZ2V0LCBwYXJlbnQsIHBhcmVudFRydXN0LCBwYXJlbnRJZGVudGl0eSwgYmFja3VwLCBoYWRFeGlzdGluZzogZmFsc2UsIGxhYmVsIH07CiAgaWYgKGV4aXN0c1N5bmModGFyZ2V0KSkgewogICAgY29uc3Qgc3RhdHVzID0gbHN0YXRTeW5jKHRhcmdldCk7CiAgICBpZiAoc3RhdHVzLmlzU3ltYm9saWNMaW5rKCkgfHwgIXN0YXR1cy5pc0RpcmVjdG9yeSgpKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiB1bnNhZmUgJHtsYWJlbH0gZGlyZWN0b3J5YCk7CiAgICByZW5hbWVTeW5jKHRhcmdldCwgYmFja3VwKTsKICAgIHRyYW5zYWN0aW9uLmhhZEV4aXN0aW5nID0gdHJ1ZTsKICAgIHRyeSB7CiAgICAgIGFzc2VydERpcmVjdG9yeVRydXN0KHBhcmVudFRydXN0LCBzcGVjLCBsYWJlbCk7CiAgICAgIGFzc2VydERpcmVjdG9yeUlkZW50aXR5KHBhcmVudCwgcGFyZW50SWRlbnRpdHksIHNwZWMsIGxhYmVsKTsKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnN0IGZhaWx1cmUgPSBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiAke2xhYmVsfSByZXN0b3JhdGlvbiBpbmNvbXBsZXRlYCk7CiAgICAgIGZhaWx1cmUucmVzdG9yYXRpb25JbmNvbXBsZXRlID0gdHJ1ZTsKICAgICAgZmFpbHVyZS5jYXVzZSA9IGVycm9yOwogICAgICBmYWlsdXJlLnRyYW5zYWN0aW9uID0gdHJhbnNhY3Rpb247CiAgICAgIHRocm93IGZhaWx1cmU7CiAgICB9CiAgfQogIHJldHVybiB0cmFuc2FjdGlvbjsKfQoKZnVuY3Rpb24gcmVzdG9yZURpcmVjdG9yeVJlcGxhY2VtZW50KHRyYW5zYWN0aW9uLCBzcGVjKSB7CiAgYXNzZXJ0RGlyZWN0b3J5VHJ1c3QodHJhbnNhY3Rpb24ucGFyZW50VHJ1c3QsIHNwZWMsIHRyYW5zYWN0aW9uLmxhYmVsKTsKICBhc3NlcnREaXJlY3RvcnlJZGVudGl0eSh0cmFuc2FjdGlvbi5wYXJlbnQsIHRyYW5zYWN0aW9uLnBhcmVudElkZW50aXR5LCBzcGVjLCB0cmFuc2FjdGlvbi5sYWJlbCk7CiAgc2FmZVJlbW92ZUV4YWN0KHRyYW5zYWN0aW9uLnRhcmdldCwgdHJhbnNhY3Rpb24ucGFyZW50LCBiYXNlbmFtZSh0cmFuc2FjdGlvbi50YXJnZXQpLCB0cnVlLCBzcGVjLCB0cmFuc2FjdGlvbi5wYXJlbnRUcnVzdCk7CiAgaWYgKHRyYW5zYWN0aW9uLmhhZEV4aXN0aW5nKSB7CiAgICBjb25zdCBiYWNrdXBTdGF0dXMgPSBsc3RhdFN5bmModHJhbnNhY3Rpb24uYmFja3VwKTsKICAgIGlmIChiYWNrdXBTdGF0dXMuaXNTeW1ib2xpY0xpbmsoKSB8fCAhYmFja3VwU3RhdHVzLmlzRGlyZWN0b3J5KCkpIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogdW5zYWZlICR7dHJhbnNhY3Rpb24ubGFiZWx9IGJhY2t1cGApOwogICAgfQogICAgcmVuYW1lU3luYyh0cmFuc2FjdGlvbi5iYWNrdXAsIHRyYW5zYWN0aW9uLnRhcmdldCk7CiAgfQp9CgpmdW5jdGlvbiBjbGVhbnVwRGlyZWN0b3J5UmVwbGFjZW1lbnQodHJhbnNhY3Rpb24sIHNwZWMpIHsKICBpZiAoIXRyYW5zYWN0aW9uLmhhZEV4aXN0aW5nKSByZXR1cm47CiAgYXNzZXJ0RGlyZWN0b3J5VHJ1c3QodHJhbnNhY3Rpb24ucGFyZW50VHJ1c3QsIHNwZWMsIHRyYW5zYWN0aW9uLmxhYmVsKTsKICBhc3NlcnREaXJlY3RvcnlJZGVudGl0eSh0cmFuc2FjdGlvbi5wYXJlbnQsIHRyYW5zYWN0aW9uLnBhcmVudElkZW50aXR5LCBzcGVjLCB0cmFuc2FjdGlvbi5sYWJlbCk7CiAgc2FmZVJlbW92ZUV4YWN0KHRyYW5zYWN0aW9uLmJhY2t1cCwgdHJhbnNhY3Rpb24ucGFyZW50LCBiYXNlbmFtZSh0cmFuc2FjdGlvbi5iYWNrdXApLCB0cnVlLCBzcGVjLCB0cmFuc2FjdGlvbi5wYXJlbnRUcnVzdCk7Cn0KCmZ1bmN0aW9uIG1hdGVyaWFsaXplUGVyc2lzdGVudFNvdXJjZShzb3VyY2VSb290LCBzcGVjLCBjb250ZXh0KSB7CiAgY29uc3QgdHJhY2tlZFBhcmVudHMgPSBlbnN1cmVUcmFja2VkRGlyZWN0b3J5KAogICAgY29udGV4dC5jbGF1ZGVDb25maWdEaXIsCiAgICBbJ3BsdWdpbnMnLCAnY2xhd2dvZC1tYXJrZXRwbGFjZXMnLCBzcGVjLm1hcmtldHBsYWNlXSwKICAgIHNwZWMsCiAgICBjb250ZXh0LAogICAgJ3BlcnNpc3RlbnQgbWFya2V0cGxhY2UgcGFyZW50JywKICApOwogIGNvbnN0IHNvdXJjZVBhcmVudCA9IHRyYWNrZWRQYXJlbnRzLnBhdGg7CiAgY29uc3QgY3JlYXRlZFBhcmVudHMgPSB0cmFja2VkUGFyZW50cy5jcmVhdGVkUGFyZW50czsKICBjb25zdCBzb3VyY2VQYXJlbnRHdWFyZCA9IHRyYWNrZWREaXJlY3RvcnlHdWFyZChzb3VyY2VQYXJlbnQsIGNyZWF0ZWRQYXJlbnRzLCBzcGVjLCAncGVyc2lzdGVudCBtYXJrZXRwbGFjZSBwYXJlbnQnKTsKICBjb25zdCBwZXJzaXN0ZW50U291cmNlID0gam9pbihzb3VyY2VQYXJlbnQsIHNwZWMudmVyc2lvbik7CiAgY29uc3Qgc3RhZ2VkID0gYCR7cGVyc2lzdGVudFNvdXJjZX0uJHtwcm9jZXNzLnBpZH0uc3RhZ2VkYDsKICBpZiAoZXhpc3RzU3luYyhzdGFnZWQpKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBwZXJzaXN0ZW50IHNvdXJjZSBzdGFnaW5nIHBhdGggYWxyZWFkeSBleGlzdHNgKTsKICBjb25zdCBwYXJlbnRJZGVudGl0eSA9IHNvdXJjZVBhcmVudEd1YXJkLmlkZW50aXR5OwogIGNvbnN0IHBhcmVudFRydXN0ID0gc291cmNlUGFyZW50R3VhcmQudHJ1c3Q7CiAgbGV0IGNvbXBsZXRlZCA9IGZhbHNlOwogIGxldCB0cmFuc2FjdGlvbiA9IG51bGw7CiAgbGV0IHJlc3VsdCA9IG51bGw7CiAgbGV0IGZhaWx1cmUgPSBudWxsOwogIHRyeSB7CiAgICBpZiAoc3BlYy5rZXkgPT09ICdzdXBlcnBvd2VycycpIHsKICAgICAgbWtkaXJTeW5jKHN0YWdlZCwgMG83MDApOwogICAgICBzYWZlRGlyZWN0b3J5U3RhdHVzKHN0YWdlZCwgc3BlYyk7CiAgICAgIGNvbnN0IG1hbmlmZXN0RGlyZWN0b3J5ID0gam9pbihzdGFnZWQsICcuY2xhdWRlLXBsdWdpbicpOwogICAgICBta2RpclN5bmMobWFuaWZlc3REaXJlY3RvcnksIDBvNzAwKTsKICAgICAgd3JpdGVFeGNsdXNpdmUoCiAgICAgICAgam9pbihtYW5pZmVzdERpcmVjdG9yeSwgJ21hcmtldHBsYWNlLmpzb24nKSwKICAgICAgICBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoSlNPTi5zdHJpbmdpZnkoewogICAgICAgICAgbmFtZTogJ3N1cGVycG93ZXJzLW1hcmtldHBsYWNlJywKICAgICAgICAgIHBsdWdpbnM6IFt7IG5hbWU6ICdzdXBlcnBvd2VycycsIHZlcnNpb246ICc2LjIuMCcsIHNvdXJjZTogJy4vcGx1Z2luJyB9XSwKICAgICAgICB9KSksCiAgICAgICAgZmFsc2UsCiAgICAgICAgc3BlYywKICAgICAgKTsKICAgICAgY29weVZhbGlkYXRlZERpcmVjdG9yeShzb3VyY2VSb290LCBqb2luKHN0YWdlZCwgJ3BsdWdpbicpLCBzcGVjKTsKICAgIH0gZWxzZSBjb3B5VmFsaWRhdGVkRGlyZWN0b3J5KHNvdXJjZVJvb3QsIHN0YWdlZCwgc3BlYyk7CiAgICBhc3NlcnREaXJlY3RvcnlJZGVudGl0eShzb3VyY2VQYXJlbnQsIHBhcmVudElkZW50aXR5LCBzcGVjLCAncGVyc2lzdGVudCBzb3VyY2UnKTsKICAgIHRyYW5zYWN0aW9uID0gcHJlcGFyZURpcmVjdG9yeVJlcGxhY2VtZW50KHBlcnNpc3RlbnRTb3VyY2UsIHNwZWMsICdwZXJzaXN0ZW50IHNvdXJjZScsIHNvdXJjZVBhcmVudEd1YXJkKTsKICAgIHRyeSB7CiAgICAgIGNvbnRleHQub25QZXJzaXN0ZW50VHJhbnNhY3Rpb25QcmVwYXJlZD8uKHRyYW5zYWN0aW9uKTsKICAgICAgcmVuYW1lU3luYyhzdGFnZWQsIHBlcnNpc3RlbnRTb3VyY2UpOwogICAgICBhc3NlcnREaXJlY3RvcnlJZGVudGl0eShzb3VyY2VQYXJlbnQsIHBhcmVudElkZW50aXR5LCBzcGVjLCAncGVyc2lzdGVudCBzb3VyY2UnKTsKICAgICAgc2FmZURpcmVjdG9yeVN0YXR1cyhwZXJzaXN0ZW50U291cmNlLCBzcGVjKTsKICAgICAgdHJhbnNhY3Rpb24uY3JlYXRlZFBhcmVudHMgPSBjcmVhdGVkUGFyZW50czsKICAgICAgY29uc3QgbWFuaWZlc3QgPSByZWFkSnNvbihqb2luKHBlcnNpc3RlbnRTb3VyY2UsICcuY2xhdWRlLXBsdWdpbicsICdtYXJrZXRwbGFjZS5qc29uJyksIHNwZWMpOwogICAgICBjb25zdCBlbnRyeSA9IG1hbmlmZXN0LnBsdWdpbnM/LmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5uYW1lID09PSBzcGVjLnBsdWdpbik7CiAgICAgIGlmICghZW50cnkpIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBlcnNpc3RlbnQgcGx1Z2luIGVudHJ5IGlzIG1pc3NpbmdgKTsKICAgICAgY29uc3QgcGx1Z2luU291cmNlID0gc3BlYy5rZXkgPT09ICdzdXBlcnBvd2VycycKICAgICAgICA/IGpvaW4ocGVyc2lzdGVudFNvdXJjZSwgJ3BsdWdpbicpCiAgICAgICAgOiBjb250YWluZWRSZWxhdGl2ZVNvdXJjZShwZXJzaXN0ZW50U291cmNlLCBlbnRyeS5zb3VyY2UsIHNwZWMpOwogICAgICByZXN1bHQgPSB7IHBlcnNpc3RlbnRTb3VyY2UsIHBsdWdpblNvdXJjZSwgdHJhbnNhY3Rpb24gfTsKICAgICAgY29tcGxldGVkID0gdHJ1ZTsKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIHRyeSB7IHJlc3RvcmVEaXJlY3RvcnlSZXBsYWNlbWVudCh0cmFuc2FjdGlvbiwgc3BlYyk7IH0gY2F0Y2ggKHJlc3RvcmVFcnJvcikgewogICAgICAgIGNvbnN0IHJlc3RvcmF0aW9uRmFpbHVyZSA9IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBlcnNpc3RlbnQgc291cmNlIHJlc3RvcmF0aW9uIGluY29tcGxldGVgKTsKICAgICAgICByZXN0b3JhdGlvbkZhaWx1cmUucmVzdG9yYXRpb25JbmNvbXBsZXRlID0gdHJ1ZTsKICAgICAgICByZXN0b3JhdGlvbkZhaWx1cmUuY2F1c2UgPSByZXN0b3JlRXJyb3I7CiAgICAgICAgcmVzdG9yYXRpb25GYWlsdXJlLnRyYW5zYWN0aW9uID0gdHJhbnNhY3Rpb247CiAgICAgICAgdGhyb3cgcmVzdG9yYXRpb25GYWlsdXJlOwogICAgICB9CiAgICAgIHRocm93IGVycm9yOwogICAgfQogIH0gY2F0Y2ggKGVycm9yKSB7CiAgICBmYWlsdXJlID0gZXJyb3I7CiAgICBpZiAoIXRyYW5zYWN0aW9uICYmIGVycm9yPy50cmFuc2FjdGlvbikgdHJhbnNhY3Rpb24gPSBlcnJvci50cmFuc2FjdGlvbjsKICB9CgogIGNvbnN0IGNsZWFudXBFcnJvcnMgPSBbXTsKICB0cnkgewogICAgaWYgKGV4aXN0c1N5bmMoc3RhZ2VkKSkgewogICAgICBhc3NlcnREaXJlY3RvcnlJZGVudGl0eShzb3VyY2VQYXJlbnQsIHBhcmVudElkZW50aXR5LCBzcGVjLCAncGVyc2lzdGVudCBzb3VyY2UnKTsKICAgICAgc2FmZVJlbW92ZUV4YWN0KHN0YWdlZCwgc291cmNlUGFyZW50LCBiYXNlbmFtZShzdGFnZWQpLCB0cnVlLCBzcGVjLCBwYXJlbnRUcnVzdCk7CiAgICB9CiAgfSBjYXRjaCAoZXJyb3IpIHsKICAgIGNsZWFudXBFcnJvcnMucHVzaChlcnJvcik7CiAgfQogIGlmICghY29tcGxldGVkKSB7CiAgICB0cnkgeyBjbGVhbnVwQ3JlYXRlZFBhcmVudHMoY3JlYXRlZFBhcmVudHMsIHNwZWMpOyB9IGNhdGNoIChlcnJvcikgeyBjbGVhbnVwRXJyb3JzLnB1c2goZXJyb3IpOyB9CiAgfQogIGlmIChmYWlsdXJlIHx8IGNsZWFudXBFcnJvcnMubGVuZ3RoID4gMCkgewogICAgY29uc3QgcHJpbWFyeSA9IGZhaWx1cmU/LnJlc3RvcmF0aW9uSW5jb21wbGV0ZSA/IGZhaWx1cmUgOiBjbGVhbnVwRXJyb3JzLmZpbmQoZXJyb3IgPT4gZXJyb3I/LnJlc3RvcmF0aW9uSW5jb21wbGV0ZSkgfHwgZmFpbHVyZSB8fCBjbGVhbnVwRXJyb3JzWzBdOwogICAgaWYgKHByaW1hcnk/LnJlc3RvcmF0aW9uSW5jb21wbGV0ZSkgewogICAgICBwcmltYXJ5LnRyYW5zYWN0aW9uID0gcHJpbWFyeS50cmFuc2FjdGlvbiB8fCB0cmFuc2FjdGlvbjsKICAgICAgdGhyb3cgcHJpbWFyeTsKICAgIH0KICAgIHRocm93IHByaW1hcnk7CiAgfQogIHJldHVybiByZXN1bHQ7Cn0KCmZ1bmN0aW9uIGNvcHlEaXJlY3RvcnlTbmFwc2hvdChzb3VyY2UsIGRlc3RpbmF0aW9uLCBzcGVjKSB7CiAgY29uc3Qgc291cmNlU3RhdHVzID0gc2FmZURpcmVjdG9yeVN0YXR1cyhzb3VyY2UsIHNwZWMpOwogIGNvbnN0IHNvdXJjZUlkZW50aXR5ID0geyBkZXY6IHNvdXJjZVN0YXR1cy5kZXYsIGlubzogc291cmNlU3RhdHVzLmlubyB9OwogIG1rZGlyU3luYyhkZXN0aW5hdGlvbiwgc291cmNlU3RhdHVzLm1vZGUgJiAwbzc3Nyk7CiAgY2htb2RTeW5jKGRlc3RpbmF0aW9uLCBzb3VyY2VTdGF0dXMubW9kZSAmIDBvNzc3KTsKICBmb3IgKGNvbnN0IG5hbWUgb2YgcmVhZGRpclN5bmMoc291cmNlKS5zb3J0KCkpIHsKICAgIGNvbnN0IHNvdXJjZVBhdGggPSBqb2luKHNvdXJjZSwgbmFtZSk7CiAgICBjb25zdCBkZXN0aW5hdGlvblBhdGggPSBqb2luKGRlc3RpbmF0aW9uLCBuYW1lKTsKICAgIGNvbnN0IHN0YXR1cyA9IGxzdGF0U3luYyhzb3VyY2VQYXRoKTsKICAgIGlmIChzdGF0dXMuaXNTeW1ib2xpY0xpbmsoKSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogcGx1Z2luIGNhY2hlIGNvbnRhaW5zIGEgbGlua2ApOwogICAgaWYgKHN0YXR1cy5pc0RpcmVjdG9yeSgpKSBjb3B5RGlyZWN0b3J5U25hcHNob3Qoc291cmNlUGF0aCwgZGVzdGluYXRpb25QYXRoLCBzcGVjKTsKICAgIGVsc2UgaWYgKHN0YXR1cy5pc0ZpbGUoKSAmJiBzdGF0dXMubmxpbmsgPT09IDEpIHsKICAgICAgY29uc3QgZmlsZSA9IHJlYWRTaW5nbGVMaW5rRmlsZShzb3VyY2VQYXRoKTsKICAgICAgaWYgKCFmaWxlKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBwbHVnaW4gY2FjaGUgY2hhbmdlZCB3aGlsZSBzbmFwc2hvdHRpbmdgKTsKICAgICAgd3JpdGVFeGNsdXNpdmUoZGVzdGluYXRpb25QYXRoLCBmaWxlLmJ5dGVzLCAoc3RhdHVzLm1vZGUgJiAwbzExMSkgIT09IDAsIHNwZWMpOwogICAgICBjaG1vZFN5bmMoZGVzdGluYXRpb25QYXRoLCBzdGF0dXMubW9kZSAmIDBvNzc3KTsKICAgIH0gZWxzZSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBwbHVnaW4gY2FjaGUgY29udGFpbnMgYW4gdW5zYWZlIGVudHJ5YCk7CiAgfQogIGFzc2VydERpcmVjdG9yeUlkZW50aXR5KHNvdXJjZSwgc291cmNlSWRlbnRpdHksIHNwZWMsICdwbHVnaW4gY2FjaGUnKTsKfQoKZnVuY3Rpb24gcmVjb3JkQ2FjaGVFbnRyaWVzKGRpcmVjdG9yeSwgZW50cmllcywgc3BlYywgcHJlZml4ID0gJycpIHsKICBmb3IgKGNvbnN0IG5hbWUgb2YgcmVhZGRpclN5bmMoZGlyZWN0b3J5KSkgewogICAgY29uc3QgcmVsYXRpdmVQYXRoID0gcHJlZml4ID8gYCR7cHJlZml4fS8ke25hbWV9YCA6IG5hbWU7CiAgICBjb25zdCBwYXRoID0gam9pbihkaXJlY3RvcnksIG5hbWUpOwogICAgY29uc3Qgc3RhdHVzID0gbHN0YXRTeW5jKHBhdGgpOwogICAgaWYgKHN0YXR1cy5pc1N5bWJvbGljTGluaygpKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBwbHVnaW4gY2FjaGUgY29udGFpbnMgYSBsaW5rYCk7CiAgICBpZiAoc3RhdHVzLmlzRGlyZWN0b3J5KCkpIHsKICAgICAgZW50cmllcy5zZXQocmVsYXRpdmVQYXRoLCBgZGlyZWN0b3J5OiR7c3RhdHVzLm1vZGUgJiAwbzc3N31gKTsKICAgICAgcmVjb3JkQ2FjaGVFbnRyaWVzKHBhdGgsIGVudHJpZXMsIHNwZWMsIHJlbGF0aXZlUGF0aCk7CiAgICB9IGVsc2UgaWYgKHN0YXR1cy5pc0ZpbGUoKSAmJiBzdGF0dXMubmxpbmsgPT09IDEpIHsKICAgICAgY29uc3QgZmlsZSA9IHJlYWRTaW5nbGVMaW5rRmlsZShwYXRoKTsKICAgICAgaWYgKCFmaWxlKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBwbHVnaW4gY2FjaGUgY2hhbmdlZCB3aGlsZSBpbnZlbnRvcnlpbmdgKTsKICAgICAgZW50cmllcy5zZXQocmVsYXRpdmVQYXRoLCBgZmlsZToke3N0YXR1cy5tb2RlICYgMG83Nzd9OiR7c2hhMjU2KGZpbGUuYnl0ZXMpfWApOwogICAgfSBlbHNlIHRocm93IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBsdWdpbiBjYWNoZSBjb250YWlucyBhbiB1bnNhZmUgZW50cnlgKTsKICB9Cn0KCmZ1bmN0aW9uIGNhY2hlRW50cnlTaWduYXR1cmUocGF0aCwgc3RhdHVzLCBzcGVjKSB7CiAgaWYgKHN0YXR1cy5pc1N5bWJvbGljTGluaygpKSByZXR1cm4gJ3Vuc2FmZSc7CiAgaWYgKHN0YXR1cy5pc0RpcmVjdG9yeSgpKSByZXR1cm4gYGRpcmVjdG9yeToke3N0YXR1cy5tb2RlICYgMG83Nzd9YDsKICBpZiAoIXN0YXR1cy5pc0ZpbGUoKSB8fCBzdGF0dXMubmxpbmsgIT09IDEpIHJldHVybiAndW5zYWZlJzsKICBjb25zdCBmaWxlID0gcmVhZFNpbmdsZUxpbmtGaWxlKHBhdGgpOwogIGlmICghZmlsZSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogcGx1Z2luIGNhY2hlIGNoYW5nZWQgd2hpbGUgaW52ZW50b3J5aW5nYCk7CiAgcmV0dXJuIGBmaWxlOiR7c3RhdHVzLm1vZGUgJiAwbzc3N306JHtzaGEyNTYoZmlsZS5ieXRlcyl9YDsKfQoKZnVuY3Rpb24gY2FjaGVUcmVlTWF0Y2hlcyhkaXJlY3RvcnksIGV4cGVjdGVkLCBleHBlY3RlZFJvb3RTaWduYXR1cmUsIHNwZWMpIHsKICBpZiAoIWV4aXN0c1N5bmMoZGlyZWN0b3J5KSkgcmV0dXJuIGZhbHNlOwogIGNvbnN0IHJvb3RTdGF0dXMgPSBsc3RhdFN5bmMoZGlyZWN0b3J5KTsKICBpZiAoY2FjaGVFbnRyeVNpZ25hdHVyZShkaXJlY3RvcnksIHJvb3RTdGF0dXMsIHNwZWMpICE9PSBleHBlY3RlZFJvb3RTaWduYXR1cmUpIHJldHVybiBmYWxzZTsKICBjb25zdCBhY3R1YWwgPSBuZXcgTWFwKCk7CiAgcmVjb3JkQ2FjaGVFbnRyaWVzKGRpcmVjdG9yeSwgYWN0dWFsLCBzcGVjKTsKICBpZiAoYWN0dWFsLnNpemUgIT09IGV4cGVjdGVkLnNpemUpIHJldHVybiBmYWxzZTsKICBmb3IgKGNvbnN0IFtwYXRoLCBzaWduYXR1cmVdIG9mIGV4cGVjdGVkKSBpZiAoYWN0dWFsLmdldChwYXRoKSAhPT0gc2lnbmF0dXJlKSByZXR1cm4gZmFsc2U7CiAgcmV0dXJuIHRydWU7Cn0KCmZ1bmN0aW9uIGNhcHR1cmVDYWNoZUNsZWFudXBOb2RlKHBhdGgsIHNwZWMpIHsKICBjb25zdCBiZWZvcmUgPSBsc3RhdFN5bmMocGF0aCk7CiAgY29uc3Qgc2lnbmF0dXJlID0gY2FjaGVFbnRyeVNpZ25hdHVyZShwYXRoLCBiZWZvcmUsIHNwZWMpOwogIGlmIChzaWduYXR1cmUgPT09ICd1bnNhZmUnKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBwbHVnaW4gY2FjaGUgY2xlYW51cCBjb250YWlucyBhbiB1bnNhZmUgZW50cnlgKTsKICBjb25zdCBub2RlID0gewogICAgdHlwZTogYmVmb3JlLmlzRGlyZWN0b3J5KCkgPyAnZGlyZWN0b3J5JyA6ICdmaWxlJywKICAgIGlkZW50aXR5OiB7IGRldjogYmVmb3JlLmRldiwgaW5vOiBiZWZvcmUuaW5vIH0sCiAgICBzaWduYXR1cmUsCiAgICBjaGlsZHJlbjogW10sCiAgfTsKICBjb25zdCBuYW1lcyA9IG5vZGUudHlwZSA9PT0gJ2RpcmVjdG9yeScgPyByZWFkZGlyU3luYyhwYXRoKS5zb3J0KCkgOiBbXTsKICBmb3IgKGNvbnN0IG5hbWUgb2YgbmFtZXMpIHsKICAgIG5vZGUuY2hpbGRyZW4ucHVzaCh7IG5hbWUsIG5vZGU6IGNhcHR1cmVDYWNoZUNsZWFudXBOb2RlKGpvaW4ocGF0aCwgbmFtZSksIHNwZWMpIH0pOwogIH0KICBjb25zdCBhZnRlciA9IGxzdGF0U3luYyhwYXRoKTsKICBjb25zdCBhZnRlclNpZ25hdHVyZSA9IGNhY2hlRW50cnlTaWduYXR1cmUocGF0aCwgYWZ0ZXIsIHNwZWMpOwogIGNvbnN0IGFmdGVyTmFtZXMgPSBub2RlLnR5cGUgPT09ICdkaXJlY3RvcnknID8gcmVhZGRpclN5bmMocGF0aCkuc29ydCgpIDogW107CiAgaWYgKGFmdGVyLmRldiAhPT0gbm9kZS5pZGVudGl0eS5kZXYgfHwgYWZ0ZXIuaW5vICE9PSBub2RlLmlkZW50aXR5LmlubwogICAgfHwgYWZ0ZXJTaWduYXR1cmUgIT09IHNpZ25hdHVyZSB8fCBhZnRlck5hbWVzLmxlbmd0aCAhPT0gbmFtZXMubGVuZ3RoCiAgICB8fCBhZnRlck5hbWVzLnNvbWUoKG5hbWUsIGluZGV4KSA9PiBuYW1lICE9PSBuYW1lc1tpbmRleF0pKSB7CiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBwbHVnaW4gY2FjaGUgY2hhbmdlZCB3aGlsZSBjYXB0dXJpbmcgY2xlYW51cCBpbnZlbnRvcnlgKTsKICB9CiAgcmV0dXJuIG5vZGU7Cn0KCmZ1bmN0aW9uIGNhY2hlQ2xlYW51cE5vZGVNYXRjaGVzKHBhdGgsIG5vZGUsIHNwZWMpIHsKICBpZiAoIWV4aXN0c1N5bmMocGF0aCkpIHJldHVybiBmYWxzZTsKICBjb25zdCBzdGF0dXMgPSBsc3RhdFN5bmMocGF0aCk7CiAgcmV0dXJuIHN0YXR1cy5kZXYgPT09IG5vZGUuaWRlbnRpdHkuZGV2ICYmIHN0YXR1cy5pbm8gPT09IG5vZGUuaWRlbnRpdHkuaW5vCiAgICAmJiBjYWNoZUVudHJ5U2lnbmF0dXJlKHBhdGgsIHN0YXR1cywgc3BlYykgPT09IG5vZGUuc2lnbmF0dXJlOwp9CgpmdW5jdGlvbiByZW1vdmVDYXB0dXJlZENhY2hlTm9kZShwYXRoLCBub2RlLCBzcGVjKSB7CiAgaWYgKCFjYWNoZUNsZWFudXBOb2RlTWF0Y2hlcyhwYXRoLCBub2RlLCBzcGVjKSkgewogICAgdGhyb3cgbWFuYWdlZERpcmVjdG9yeUZhaWx1cmUoc3BlYywgJ3BsdWdpbiBjYWNoZSByZXN0b3JhdGlvbiBpbmNvbXBsZXRlOyBjbGVhbnVwIGVudHJ5IGNoYW5nZWQnLCBudWxsLCBbcGF0aF0pOwogIH0KICBpZiAobm9kZS50eXBlID09PSAnZGlyZWN0b3J5JykgewogICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSByZW1vdmVDYXB0dXJlZENhY2hlTm9kZShqb2luKHBhdGgsIGNoaWxkLm5hbWUpLCBjaGlsZC5ub2RlLCBzcGVjKTsKICAgIGlmICghY2FjaGVDbGVhbnVwTm9kZU1hdGNoZXMocGF0aCwgbm9kZSwgc3BlYykpIHsKICAgICAgdGhyb3cgbWFuYWdlZERpcmVjdG9yeUZhaWx1cmUoc3BlYywgJ3BsdWdpbiBjYWNoZSByZXN0b3JhdGlvbiBpbmNvbXBsZXRlOyBjbGVhbnVwIGRpcmVjdG9yeSBjaGFuZ2VkJywgbnVsbCwgW3BhdGhdKTsKICAgIH0KICB9CgogIGNvbnN0IHBhcmVudCA9IGRpcm5hbWUocGF0aCk7CiAgY29uc3QgcGFyZW50VHJ1c3QgPSBjYXB0dXJlRGlyZWN0b3J5VHJ1c3QocGFyZW50LCBzcGVjKTsKICBjb25zdCBwYXJlbnRJZGVudGl0eSA9IGRpcmVjdG9yeUlkZW50aXR5KHBhcmVudCwgc3BlYyk7CiAgY29uc3QgcXVhcmFudGluZSA9IG1rZHRlbXBTeW5jKGpvaW4ocGFyZW50LCBgLmNsYXdnb2QtcmVtb3ZlLSR7cHJvY2Vzcy5waWR9LWApKTsKICBjaG1vZFN5bmMocXVhcmFudGluZSwgMG83MDApOwogIGNvbnN0IHF1YXJhbnRpbmVJZGVudGl0eSA9IGRpcmVjdG9yeUlkZW50aXR5KHF1YXJhbnRpbmUsIHNwZWMpOwogIGNvbnN0IG1vdmVkID0gam9pbihxdWFyYW50aW5lLCAnZW50cnknKTsKICB0cnkgewogICAgYXNzZXJ0RGlyZWN0b3J5VHJ1c3QocGFyZW50VHJ1c3QsIHNwZWMsICdwbHVnaW4gY2FjaGUgY2xlYW51cCBwYXJlbnQnKTsKICAgIGFzc2VydERpcmVjdG9yeUlkZW50aXR5KHBhcmVudCwgcGFyZW50SWRlbnRpdHksIHNwZWMsICdwbHVnaW4gY2FjaGUgY2xlYW51cCBwYXJlbnQnKTsKICAgIHJlbmFtZVN5bmMocGF0aCwgbW92ZWQpOwogICAgYXNzZXJ0RGlyZWN0b3J5SWRlbnRpdHkocGFyZW50LCBwYXJlbnRJZGVudGl0eSwgc3BlYywgJ3BsdWdpbiBjYWNoZSBjbGVhbnVwIHBhcmVudCcpOwogICAgYXNzZXJ0RGlyZWN0b3J5SWRlbnRpdHkocXVhcmFudGluZSwgcXVhcmFudGluZUlkZW50aXR5LCBzcGVjLCAncGx1Z2luIGNhY2hlIGNsZWFudXAgcXVhcmFudGluZScpOwogICAgaWYgKGV4aXN0c1N5bmMocGF0aCkgfHwgIWNhY2hlQ2xlYW51cE5vZGVNYXRjaGVzKG1vdmVkLCBub2RlLCBzcGVjKSkgewogICAgICB0aHJvdyBtYW5hZ2VkRGlyZWN0b3J5RmFpbHVyZSgKICAgICAgICBzcGVjLAogICAgICAgICdwbHVnaW4gY2FjaGUgcmVzdG9yYXRpb24gaW5jb21wbGV0ZTsgY2xlYW51cCBlbnRyeSB3YXMgcmVwbGFjZWQnLAogICAgICAgIG51bGwsCiAgICAgICAgW3F1YXJhbnRpbmUsIG1vdmVkLCBwYXRoXS5maWx0ZXIoY2FuZGlkYXRlID0+IGV4aXN0c1N5bmMoY2FuZGlkYXRlKSksCiAgICAgICk7CiAgICB9CiAgICBpZiAobm9kZS50eXBlID09PSAnZGlyZWN0b3J5Jykgcm1kaXJTeW5jKG1vdmVkKTsKICAgIGVsc2UgdW5saW5rU3luYyhtb3ZlZCk7CiAgICBhc3NlcnREaXJlY3RvcnlJZGVudGl0eShxdWFyYW50aW5lLCBxdWFyYW50aW5lSWRlbnRpdHksIHNwZWMsICdwbHVnaW4gY2FjaGUgY2xlYW51cCBxdWFyYW50aW5lJyk7CiAgICBybWRpclN5bmMocXVhcmFudGluZSk7CiAgfSBjYXRjaCAoZXJyb3IpIHsKICAgIGlmIChlcnJvcj8ucmVzdG9yYXRpb25JbmNvbXBsZXRlKSB0aHJvdyBlcnJvcjsKICAgIHRocm93IG1hbmFnZWREaXJlY3RvcnlGYWlsdXJlKAogICAgICBzcGVjLAogICAgICAncGx1Z2luIGNhY2hlIHJlc3RvcmF0aW9uIGluY29tcGxldGU7IGNsZWFudXAgcmFjZSBwcmVzZXJ2ZWQnLAogICAgICBlcnJvciwKICAgICAgW3F1YXJhbnRpbmUsIG1vdmVkLCBwYXRoXS5maWx0ZXIoY2FuZGlkYXRlID0+IGV4aXN0c1N5bmMoY2FuZGlkYXRlKSksCiAgICApOwogIH0KfQoKZnVuY3Rpb24gdW5leHBlY3RlZENhY2hlUGF0aHMoZGlyZWN0b3J5LCB0cmFuc2FjdGlvbiwgc3BlYywgcHJlZml4ID0gJycsIHVuZXhwZWN0ZWQgPSBbXSkgewogIGZvciAoY29uc3QgbmFtZSBvZiByZWFkZGlyU3luYyhkaXJlY3RvcnkpKSB7CiAgICBjb25zdCByZWxhdGl2ZVBhdGggPSBwcmVmaXggPyBgJHtwcmVmaXh9LyR7bmFtZX1gIDogbmFtZTsKICAgIGNvbnN0IHBhdGggPSBqb2luKGRpcmVjdG9yeSwgbmFtZSk7CiAgICBjb25zdCBzdGF0dXMgPSBsc3RhdFN5bmMocGF0aCk7CiAgICBjb25zdCBiYXNlbGluZVByZWZpeCA9IGAke3RyYW5zYWN0aW9uLnZlcnNpb259L2A7CiAgICBjb25zdCBleHBlY3RlZFBhdGggPSByZWxhdGl2ZVBhdGggPT09IHRyYW5zYWN0aW9uLnZlcnNpb24gPyAnJwogICAgICA6IHJlbGF0aXZlUGF0aC5zdGFydHNXaXRoKGJhc2VsaW5lUHJlZml4KSA/IHJlbGF0aXZlUGF0aC5zbGljZShiYXNlbGluZVByZWZpeC5sZW5ndGgpIDogbnVsbDsKICAgIGNvbnN0IGV4cGVjdGVkU2lnbmF0dXJlID0gZXhwZWN0ZWRQYXRoID09PSAnJyA/IHRyYW5zYWN0aW9uLmV4cGVjdGVkVmVyc2lvblJvb3RTaWduYXR1cmUKICAgICAgOiBleHBlY3RlZFBhdGggPT09IG51bGwgPyBudWxsIDogdHJhbnNhY3Rpb24uZXhwZWN0ZWRWZXJzaW9uRW50cmllcy5nZXQoZXhwZWN0ZWRQYXRoKTsKICAgIGlmICghdHJhbnNhY3Rpb24ucHJlRXhpc3RpbmdFbnRyaWVzLmhhcyhyZWxhdGl2ZVBhdGgpCiAgICAgICYmIChleHBlY3RlZFNpZ25hdHVyZSA9PT0gbnVsbCB8fCBleHBlY3RlZFNpZ25hdHVyZSA9PT0gdW5kZWZpbmVkIHx8IGNhY2hlRW50cnlTaWduYXR1cmUocGF0aCwgc3RhdHVzLCBzcGVjKSAhPT0gZXhwZWN0ZWRTaWduYXR1cmUpKSB7CiAgICAgIHVuZXhwZWN0ZWQucHVzaChyZWxhdGl2ZVBhdGgpOwogICAgICBjb250aW51ZTsKICAgIH0KICAgIGlmIChzdGF0dXMuaXNEaXJlY3RvcnkoKSAmJiAhc3RhdHVzLmlzU3ltYm9saWNMaW5rKCkpIHsKICAgICAgdW5leHBlY3RlZENhY2hlUGF0aHMocGF0aCwgdHJhbnNhY3Rpb24sIHNwZWMsIHJlbGF0aXZlUGF0aCwgdW5leHBlY3RlZCk7CiAgICB9CiAgfQogIHJldHVybiB1bmV4cGVjdGVkOwp9CgpmdW5jdGlvbiBwcmVwYXJlQ2FjaGVUcmFuc2FjdGlvbihwbHVnaW5Sb290LCBzcGVjLCBpbnN0YWxsZWQsIHBsdWdpblNvdXJjZSwgY29udGV4dCkgewogIGNvbnN0IGNhY2hlUm9vdCA9IGpvaW4ocGx1Z2luUm9vdCwgJ2NhY2hlJyk7CiAgY29uc3QgbWFya2V0cGxhY2VDYWNoZSA9IGpvaW4oY2FjaGVSb290LCBzcGVjLm1hcmtldHBsYWNlKTsKICBjb25zdCBwbHVnaW5DYWNoZSA9IGpvaW4obWFya2V0cGxhY2VDYWNoZSwgc3BlYy5wbHVnaW4pOwogIGNvbnN0IGJhY2t1cCA9IGAke3BsdWdpbkNhY2hlfS4ke3Byb2Nlc3MucGlkfS5iYWNrdXBgOwogIGNvbnN0IGJhY2t1cFByZUV4aXN0aW5nID0gZXhpc3RzU3luYyhiYWNrdXApOwogIGxldCBtYXJrZXRwbGFjZUNhY2hlVHJ1c3QgPSBudWxsOwogIGxldCBjcmVhdGVkUGFyZW50cyA9IFtdOwogIHRyeSB7CiAgICBjb25zdCB0cmFja2VkQ2FjaGUgPSBlbnN1cmVUcmFja2VkRGlyZWN0b3J5KAogICAgICBwbHVnaW5Sb290LAogICAgICBbJ2NhY2hlJywgc3BlYy5tYXJrZXRwbGFjZSwgc3BlYy5wbHVnaW5dLAogICAgICBzcGVjLAogICAgICBjb250ZXh0LAogICAgICAncGx1Z2luIGNhY2hlIHBhcmVudCcsCiAgICApOwogICAgY3JlYXRlZFBhcmVudHMgPSB0cmFja2VkQ2FjaGUuY3JlYXRlZFBhcmVudHM7CiAgICBjb25zdCBoYWRFeGlzdGluZyA9ICFjcmVhdGVkUGFyZW50cy5zb21lKGVudHJ5ID0+IGVudHJ5LnBhdGggPT09IHBsdWdpbkNhY2hlKTsKICAgIGNvbnN0IHBsdWdpbkNhY2hlR3VhcmQgPSB0cmFja2VkRGlyZWN0b3J5R3VhcmQocGx1Z2luQ2FjaGUsIGNyZWF0ZWRQYXJlbnRzLCBzcGVjLCAncGx1Z2luIGNhY2hlJyk7CiAgICBjb25zdCBtYXJrZXRwbGFjZUNhY2hlR3VhcmQgPSB0cmFja2VkRGlyZWN0b3J5R3VhcmQobWFya2V0cGxhY2VDYWNoZSwgY3JlYXRlZFBhcmVudHMsIHNwZWMsICdwbHVnaW4gY2FjaGUgcGFyZW50Jyk7CiAgICBjb25zdCBwbHVnaW5DYWNoZUlkZW50aXR5ID0gcGx1Z2luQ2FjaGVHdWFyZC5pZGVudGl0eTsKICAgIGNvbnN0IHBsdWdpbkNhY2hlVHJ1c3QgPSBwbHVnaW5DYWNoZUd1YXJkLnRydXN0OwogICAgbWFya2V0cGxhY2VDYWNoZVRydXN0ID0gbWFya2V0cGxhY2VDYWNoZUd1YXJkLnRydXN0OwogICAgY29uc3QgcHJlRXhpc3RpbmdFbnRyaWVzID0gbmV3IE1hcCgpOwogICAgcmVjb3JkQ2FjaGVFbnRyaWVzKHBsdWdpbkNhY2hlLCBwcmVFeGlzdGluZ0VudHJpZXMsIHNwZWMpOwogICAgY29uc3QgcHJlRXhpc3RpbmdSb290U2lnbmF0dXJlID0gY2FjaGVFbnRyeVNpZ25hdHVyZShwbHVnaW5DYWNoZSwgbHN0YXRTeW5jKHBsdWdpbkNhY2hlKSwgc3BlYyk7CiAgICBjb25zdCBleHBlY3RlZFZlcnNpb25FbnRyaWVzID0gbmV3IE1hcCgpOwogICAgcmVjb3JkQ2FjaGVFbnRyaWVzKHBsdWdpblNvdXJjZSwgZXhwZWN0ZWRWZXJzaW9uRW50cmllcywgc3BlYyk7CiAgICBjb25zdCBleHBlY3RlZFZlcnNpb25Sb290U2lnbmF0dXJlID0gY2FjaGVFbnRyeVNpZ25hdHVyZShwbHVnaW5Tb3VyY2UsIGxzdGF0U3luYyhwbHVnaW5Tb3VyY2UpLCBzcGVjKTsKICAgIGlmIChiYWNrdXBQcmVFeGlzdGluZykgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogcGx1Z2luIGNhY2hlIGJhY2t1cCBhbHJlYWR5IGV4aXN0c2ApOwogICAgaWYgKGhhZEV4aXN0aW5nKSBjb3B5RGlyZWN0b3J5U25hcHNob3QocGx1Z2luQ2FjaGUsIGJhY2t1cCwgc3BlYyk7CiAgICBhc3NlcnREaXJlY3RvcnlUcnVzdChwbHVnaW5DYWNoZVRydXN0LCBzcGVjLCAncGx1Z2luIGNhY2hlJyk7CiAgICBhc3NlcnREaXJlY3RvcnlJZGVudGl0eShwbHVnaW5DYWNoZSwgcGx1Z2luQ2FjaGVJZGVudGl0eSwgc3BlYywgJ3BsdWdpbiBjYWNoZScpOwogICAgYXNzZXJ0RGlyZWN0b3J5VHJ1c3QobWFya2V0cGxhY2VDYWNoZVRydXN0LCBzcGVjLCAncGx1Z2luIGNhY2hlIHBhcmVudCcpOwogICAgcmV0dXJuIHsKICAgICAgcGx1Z2luQ2FjaGUsIHBsdWdpbkNhY2hlSWRlbnRpdHksIHBsdWdpbkNhY2hlVHJ1c3QsIG1hcmtldHBsYWNlQ2FjaGUsIG1hcmtldHBsYWNlQ2FjaGVUcnVzdCwKICAgICAgYmFja3VwLCBoYWRFeGlzdGluZywgY3JlYXRlZFBhcmVudHMsIHByZUV4aXN0aW5nRW50cmllcywgcHJlRXhpc3RpbmdSb290U2lnbmF0dXJlLAogICAgICBleHBlY3RlZFZlcnNpb25FbnRyaWVzLCBleHBlY3RlZFZlcnNpb25Sb290U2lnbmF0dXJlLAogICAgICB2ZXJzaW9uOiBzcGVjLnZlcnNpb24sCiAgICB9OwogIH0gY2F0Y2ggKGVycm9yKSB7CiAgICBjb25zdCByZXN0b3JhdGlvbkVycm9ycyA9IFtdOwogICAgdHJ5IHsKICAgICAgaWYgKCFiYWNrdXBQcmVFeGlzdGluZyAmJiBtYXJrZXRwbGFjZUNhY2hlVHJ1c3QgJiYgZXhpc3RzU3luYyhiYWNrdXApKSB7CiAgICAgICAgc2FmZVJlbW92ZUV4YWN0KGJhY2t1cCwgbWFya2V0cGxhY2VDYWNoZSwgYmFzZW5hbWUoYmFja3VwKSwgdHJ1ZSwgc3BlYywgbWFya2V0cGxhY2VDYWNoZVRydXN0KTsKICAgICAgfQogICAgfSBjYXRjaCAocmVzdG9yZUVycm9yKSB7IHJlc3RvcmF0aW9uRXJyb3JzLnB1c2gocmVzdG9yZUVycm9yKTsgfQogICAgdHJ5IHsgY2xlYW51cENyZWF0ZWRQYXJlbnRzKGNyZWF0ZWRQYXJlbnRzLCBzcGVjKTsgfSBjYXRjaCAocmVzdG9yZUVycm9yKSB7IHJlc3RvcmF0aW9uRXJyb3JzLnB1c2gocmVzdG9yZUVycm9yKTsgfQogICAgaWYgKHJlc3RvcmF0aW9uRXJyb3JzLmxlbmd0aCA+IDApIHsKICAgICAgY29uc3QgZmFpbHVyZSA9IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBsdWdpbiBjYWNoZSBwcmVwYXJhdGlvbiByZXN0b3JhdGlvbiBpbmNvbXBsZXRlYCk7CiAgICAgIGZhaWx1cmUucmVzdG9yYXRpb25JbmNvbXBsZXRlID0gdHJ1ZTsKICAgICAgZmFpbHVyZS5jYXVzZSA9IHJlc3RvcmF0aW9uRXJyb3JzWzBdOwogICAgICB0aHJvdyBmYWlsdXJlOwogICAgfQogICAgdGhyb3cgZXJyb3I7CiAgfQp9CgpmdW5jdGlvbiByZXN0b3JlQ2FjaGVUcmFuc2FjdGlvbih0cmFuc2FjdGlvbiwgc3BlYywgY29udGV4dCkgewogIGFzc2VydERpcmVjdG9yeVRydXN0KHRyYW5zYWN0aW9uLnBsdWdpbkNhY2hlVHJ1c3QsIHNwZWMsICdwbHVnaW4gY2FjaGUnKTsKICBhc3NlcnREaXJlY3RvcnlJZGVudGl0eSh0cmFuc2FjdGlvbi5wbHVnaW5DYWNoZSwgdHJhbnNhY3Rpb24ucGx1Z2luQ2FjaGVJZGVudGl0eSwgc3BlYywgJ3BsdWdpbiBjYWNoZScpOwogIGNvbnN0IGZhaWxlZFBhdGggPSBgJHt0cmFuc2FjdGlvbi5wbHVnaW5DYWNoZX0uJHtwcm9jZXNzLnBpZH0uZmFpbGVkYDsKICBjb25zdCBjbGVhbnVwUGF0aCA9IGAke3RyYW5zYWN0aW9uLnBsdWdpbkNhY2hlfS4ke3Byb2Nlc3MucGlkfS5jbGVhbnVwYDsKICBjb25zdCBjb25jdXJyZW50UGF0aCA9IGAke3RyYW5zYWN0aW9uLnBsdWdpbkNhY2hlfS4ke3Byb2Nlc3MucGlkfS5jb25jdXJyZW50YDsKICBpZiAoZXhpc3RzU3luYyhmYWlsZWRQYXRoKSB8fCBleGlzdHNTeW5jKGNsZWFudXBQYXRoKSB8fCBleGlzdHNTeW5jKGNvbmN1cnJlbnRQYXRoKSkgewogICAgY29uc3QgZmFpbHVyZSA9IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBsdWdpbiBjYWNoZSByZXN0b3JhdGlvbiBpbmNvbXBsZXRlOyBldmlkZW5jZSBwYXRoIGV4aXN0c2ApOwogICAgZmFpbHVyZS5yZXN0b3JhdGlvbkluY29tcGxldGUgPSB0cnVlOwogICAgZmFpbHVyZS5ldmlkZW5jZVBhdGggPSB0cmFuc2FjdGlvbi5wbHVnaW5DYWNoZTsKICAgIHRocm93IGZhaWx1cmU7CiAgfQogIGFzc2VydERpcmVjdG9yeVRydXN0KHRyYW5zYWN0aW9uLm1hcmtldHBsYWNlQ2FjaGVUcnVzdCwgc3BlYywgJ3BsdWdpbiBjYWNoZSBwYXJlbnQnKTsKICByZW5hbWVTeW5jKHRyYW5zYWN0aW9uLnBsdWdpbkNhY2hlLCBmYWlsZWRQYXRoKTsKICBpZiAodHJhbnNhY3Rpb24uaGFkRXhpc3RpbmcpIGNvcHlEaXJlY3RvcnlTbmFwc2hvdCh0cmFuc2FjdGlvbi5iYWNrdXAsIHRyYW5zYWN0aW9uLnBsdWdpbkNhY2hlLCBzcGVjKTsKICBjb250ZXh0Lm9uQ2FjaGVRdWFyYW50aW5lZD8uKHsgcGx1Z2luQ2FjaGU6IHRyYW5zYWN0aW9uLnBsdWdpbkNhY2hlLCBmYWlsZWRQYXRoIH0pOwoKICBjb25zdCBjYW5vbmljYWxDaGFuZ2VkID0gdHJhbnNhY3Rpb24uaGFkRXhpc3RpbmcKICAgID8gIWNhY2hlVHJlZU1hdGNoZXModHJhbnNhY3Rpb24ucGx1Z2luQ2FjaGUsIHRyYW5zYWN0aW9uLnByZUV4aXN0aW5nRW50cmllcywgdHJhbnNhY3Rpb24ucHJlRXhpc3RpbmdSb290U2lnbmF0dXJlLCBzcGVjKQogICAgOiBleGlzdHNTeW5jKHRyYW5zYWN0aW9uLnBsdWdpbkNhY2hlKTsKICBpZiAoY2Fub25pY2FsQ2hhbmdlZCkgewogICAgY29uc3QgZXZpZGVuY2VQYXRocyA9IFtmYWlsZWRQYXRoXTsKICAgIGlmIChleGlzdHNTeW5jKHRyYW5zYWN0aW9uLnBsdWdpbkNhY2hlKSkgewogICAgICByZW5hbWVTeW5jKHRyYW5zYWN0aW9uLnBsdWdpbkNhY2hlLCBjb25jdXJyZW50UGF0aCk7CiAgICAgIGV2aWRlbmNlUGF0aHMucHVzaChjb25jdXJyZW50UGF0aCk7CiAgICB9CiAgICBpZiAodHJhbnNhY3Rpb24uaGFkRXhpc3RpbmcpIHJlbmFtZVN5bmModHJhbnNhY3Rpb24uYmFja3VwLCB0cmFuc2FjdGlvbi5wbHVnaW5DYWNoZSk7CiAgICBjb25zdCBmYWlsdXJlID0gbmV3IEVycm9yKGAke3NwZWMua2V5fTogcGx1Z2luIGNhY2hlIHJlc3RvcmF0aW9uIGluY29tcGxldGU7IGNvbmN1cnJlbnQgZGF0YSBwcmVzZXJ2ZWRgKTsKICAgIGZhaWx1cmUucmVzdG9yYXRpb25JbmNvbXBsZXRlID0gdHJ1ZTsKICAgIGZhaWx1cmUuZXZpZGVuY2VQYXRoID0gZXZpZGVuY2VQYXRocy5hdCgtMSk7CiAgICBmYWlsdXJlLmV2aWRlbmNlUGF0aHMgPSBldmlkZW5jZVBhdGhzOwogICAgdGhyb3cgZmFpbHVyZTsKICB9CgogIGNvbnN0IHVuZXhwZWN0ZWQgPSB1bmV4cGVjdGVkQ2FjaGVQYXRocyhmYWlsZWRQYXRoLCB0cmFuc2FjdGlvbiwgc3BlYyk7CiAgY29udGV4dC5vbkNhY2hlRmFpbGVkSW5zcGVjdGVkPy4oeyBwbHVnaW5DYWNoZTogdHJhbnNhY3Rpb24ucGx1Z2luQ2FjaGUsIGZhaWxlZFBhdGgsIHVuZXhwZWN0ZWRQYXRoczogdW5leHBlY3RlZCB9KTsKCiAgYXNzZXJ0RGlyZWN0b3J5VHJ1c3QodHJhbnNhY3Rpb24ubWFya2V0cGxhY2VDYWNoZVRydXN0LCBzcGVjLCAncGx1Z2luIGNhY2hlIHBhcmVudCcpOwogIHJlbmFtZVN5bmMoZmFpbGVkUGF0aCwgY2xlYW51cFBhdGgpOwogIGNvbnN0IGxhdGVVbmV4cGVjdGVkID0gdW5leHBlY3RlZENhY2hlUGF0aHMoY2xlYW51cFBhdGgsIHRyYW5zYWN0aW9uLCBzcGVjKTsKICBjb25zdCBjYW5vbmljYWxDaGFuZ2VkQWZ0ZXJJbnNwZWN0aW9uID0gdHJhbnNhY3Rpb24uaGFkRXhpc3RpbmcKICAgID8gIWNhY2hlVHJlZU1hdGNoZXModHJhbnNhY3Rpb24ucGx1Z2luQ2FjaGUsIHRyYW5zYWN0aW9uLnByZUV4aXN0aW5nRW50cmllcywgdHJhbnNhY3Rpb24ucHJlRXhpc3RpbmdSb290U2lnbmF0dXJlLCBzcGVjKQogICAgOiBleGlzdHNTeW5jKHRyYW5zYWN0aW9uLnBsdWdpbkNhY2hlKTsKICBpZiAoY2Fub25pY2FsQ2hhbmdlZEFmdGVySW5zcGVjdGlvbikgewogICAgY29uc3QgZXZpZGVuY2VQYXRocyA9IFtjbGVhbnVwUGF0aF07CiAgICBpZiAoZXhpc3RzU3luYyh0cmFuc2FjdGlvbi5wbHVnaW5DYWNoZSkpIHsKICAgICAgcmVuYW1lU3luYyh0cmFuc2FjdGlvbi5wbHVnaW5DYWNoZSwgY29uY3VycmVudFBhdGgpOwogICAgICBldmlkZW5jZVBhdGhzLnB1c2goY29uY3VycmVudFBhdGgpOwogICAgfQogICAgaWYgKHRyYW5zYWN0aW9uLmhhZEV4aXN0aW5nKSByZW5hbWVTeW5jKHRyYW5zYWN0aW9uLmJhY2t1cCwgdHJhbnNhY3Rpb24ucGx1Z2luQ2FjaGUpOwogICAgY29uc3QgZmFpbHVyZSA9IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBsdWdpbiBjYWNoZSByZXN0b3JhdGlvbiBpbmNvbXBsZXRlOyBsYXRlIGNvbmN1cnJlbnQgZGF0YSBwcmVzZXJ2ZWRgKTsKICAgIGZhaWx1cmUucmVzdG9yYXRpb25JbmNvbXBsZXRlID0gdHJ1ZTsKICAgIGZhaWx1cmUuZXZpZGVuY2VQYXRoID0gZXZpZGVuY2VQYXRocy5hdCgtMSk7CiAgICBmYWlsdXJlLmV2aWRlbmNlUGF0aHMgPSBldmlkZW5jZVBhdGhzOwogICAgdGhyb3cgZmFpbHVyZTsKICB9CiAgaWYgKHVuZXhwZWN0ZWQubGVuZ3RoID4gMCB8fCBsYXRlVW5leHBlY3RlZC5sZW5ndGggPiAwIHx8IGV4aXN0c1N5bmMoZmFpbGVkUGF0aCkpIHsKICAgIGNvbnN0IGV2aWRlbmNlUGF0aHMgPSBbY2xlYW51cFBhdGgsIHRyYW5zYWN0aW9uLnBsdWdpbkNhY2hlXTsKICAgIGlmIChleGlzdHNTeW5jKGZhaWxlZFBhdGgpKSBldmlkZW5jZVBhdGhzLnB1c2goZmFpbGVkUGF0aCk7CiAgICBpZiAodHJhbnNhY3Rpb24uaGFkRXhpc3RpbmcpIGV2aWRlbmNlUGF0aHMucHVzaCh0cmFuc2FjdGlvbi5iYWNrdXApOwogICAgY29uc3QgZmFpbHVyZSA9IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBsdWdpbiBjYWNoZSByZXN0b3JhdGlvbiBpbmNvbXBsZXRlOyB1bmtub3duIHBhdGhzIHByZXNlcnZlZGApOwogICAgZmFpbHVyZS5yZXN0b3JhdGlvbkluY29tcGxldGUgPSB0cnVlOwogICAgZmFpbHVyZS5ldmlkZW5jZVBhdGggPSBjbGVhbnVwUGF0aDsKICAgIGZhaWx1cmUuZXZpZGVuY2VQYXRocyA9IGV2aWRlbmNlUGF0aHM7CiAgICBmYWlsdXJlLnVuZXhwZWN0ZWRQYXRocyA9IFsuLi5uZXcgU2V0KFsuLi51bmV4cGVjdGVkLCAuLi5sYXRlVW5leHBlY3RlZF0pXTsKICAgIHRocm93IGZhaWx1cmU7CiAgfQoKICBsZXQgY2xlYW51cEludmVudG9yeTsKICB0cnkgewogICAgY2xlYW51cEludmVudG9yeSA9IGNhcHR1cmVDYWNoZUNsZWFudXBOb2RlKGNsZWFudXBQYXRoLCBzcGVjKTsKICAgIGNvbnRleHQub25DYWNoZUNsZWFudXBJbnZlbnRvcmllZD8uKHsgY2xlYW51cFBhdGggfSk7CiAgICByZW1vdmVDYXB0dXJlZENhY2hlTm9kZShjbGVhbnVwUGF0aCwgY2xlYW51cEludmVudG9yeSwgc3BlYyk7CiAgfSBjYXRjaCAoZXJyb3IpIHsKICAgIGlmIChlcnJvcj8ucmVzdG9yYXRpb25JbmNvbXBsZXRlKSB0aHJvdyBlcnJvcjsKICAgIHRocm93IG1hbmFnZWREaXJlY3RvcnlGYWlsdXJlKAogICAgICBzcGVjLAogICAgICAncGx1Z2luIGNhY2hlIHJlc3RvcmF0aW9uIGluY29tcGxldGU7IGNsZWFudXAgaW52ZW50b3J5IGNoYW5nZWQnLAogICAgICBlcnJvciwKICAgICAgW2NsZWFudXBQYXRoXS5maWx0ZXIocGF0aCA9PiBleGlzdHNTeW5jKHBhdGgpKSwKICAgICk7CiAgfQogIGNvbnN0IGNhbm9uaWNhbENoYW5nZWRBZnRlckNsZWFudXAgPSB0cmFuc2FjdGlvbi5oYWRFeGlzdGluZwogICAgPyAhY2FjaGVUcmVlTWF0Y2hlcyh0cmFuc2FjdGlvbi5wbHVnaW5DYWNoZSwgdHJhbnNhY3Rpb24ucHJlRXhpc3RpbmdFbnRyaWVzLCB0cmFuc2FjdGlvbi5wcmVFeGlzdGluZ1Jvb3RTaWduYXR1cmUsIHNwZWMpCiAgICA6IGV4aXN0c1N5bmModHJhbnNhY3Rpb24ucGx1Z2luQ2FjaGUpOwogIGlmIChjYW5vbmljYWxDaGFuZ2VkQWZ0ZXJDbGVhbnVwIHx8IGV4aXN0c1N5bmMoZmFpbGVkUGF0aCkgfHwgZXhpc3RzU3luYyhjbGVhbnVwUGF0aCkpIHsKICAgIGNvbnN0IGV2aWRlbmNlUGF0aHMgPSBbZmFpbGVkUGF0aCwgY2xlYW51cFBhdGhdLmZpbHRlcihwYXRoID0+IGV4aXN0c1N5bmMocGF0aCkpOwogICAgaWYgKGNhbm9uaWNhbENoYW5nZWRBZnRlckNsZWFudXAgJiYgZXhpc3RzU3luYyh0cmFuc2FjdGlvbi5wbHVnaW5DYWNoZSkpIHsKICAgICAgcmVuYW1lU3luYyh0cmFuc2FjdGlvbi5wbHVnaW5DYWNoZSwgY29uY3VycmVudFBhdGgpOwogICAgICBldmlkZW5jZVBhdGhzLnB1c2goY29uY3VycmVudFBhdGgpOwogICAgfQogICAgaWYgKHRyYW5zYWN0aW9uLmhhZEV4aXN0aW5nKSByZW5hbWVTeW5jKHRyYW5zYWN0aW9uLmJhY2t1cCwgdHJhbnNhY3Rpb24ucGx1Z2luQ2FjaGUpOwogICAgY29uc3QgZmFpbHVyZSA9IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBsdWdpbiBjYWNoZSByZXN0b3JhdGlvbiBpbmNvbXBsZXRlOyBjbGVhbnVwIHJhY2UgcHJlc2VydmVkYCk7CiAgICBmYWlsdXJlLnJlc3RvcmF0aW9uSW5jb21wbGV0ZSA9IHRydWU7CiAgICBmYWlsdXJlLmV2aWRlbmNlUGF0aCA9IGV2aWRlbmNlUGF0aHMuYXQoLTEpIHx8IHRyYW5zYWN0aW9uLnBsdWdpbkNhY2hlOwogICAgZmFpbHVyZS5ldmlkZW5jZVBhdGhzID0gZXZpZGVuY2VQYXRoczsKICAgIHRocm93IGZhaWx1cmU7CiAgfQogIGlmICh0cmFuc2FjdGlvbi5oYWRFeGlzdGluZykgY2xlYW51cENhY2hlVHJhbnNhY3Rpb24odHJhbnNhY3Rpb24sIHNwZWMpOwp9CgpmdW5jdGlvbiBjbGVhbnVwQ2FjaGVUcmFuc2FjdGlvbih0cmFuc2FjdGlvbiwgc3BlYykgewogIGlmICghdHJhbnNhY3Rpb24uaGFkRXhpc3RpbmcpIHJldHVybjsKICBzYWZlUmVtb3ZlRXhhY3QoCiAgICB0cmFuc2FjdGlvbi5iYWNrdXAsCiAgICB0cmFuc2FjdGlvbi5tYXJrZXRwbGFjZUNhY2hlLAogICAgYmFzZW5hbWUodHJhbnNhY3Rpb24uYmFja3VwKSwKICAgIHRydWUsCiAgICBzcGVjLAogICAgdHJhbnNhY3Rpb24ubWFya2V0cGxhY2VDYWNoZVRydXN0LAogICk7Cn0KCmZ1bmN0aW9uIGNsZWFudXBDcmVhdGVkUGFyZW50cyhjcmVhdGVkUGFyZW50cywgc3BlYykgewogIGZvciAobGV0IGluZGV4ID0gY3JlYXRlZFBhcmVudHMubGVuZ3RoIC0gMTsgaW5kZXggPj0gMDsgaW5kZXgtLSkgewogICAgY29uc3QgeyBwYXRoLCBpZGVudGl0eSwgcGFyZW50VHJ1c3QgfSA9IGNyZWF0ZWRQYXJlbnRzW2luZGV4XTsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHN0YXR1cyA9IGxzdGF0U3luYyhwYXRoKTsKICAgICAgaWYgKHN0YXR1cy5pc1N5bWJvbGljTGluaygpIHx8ICFzdGF0dXMuaXNEaXJlY3RvcnkoKSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogdW5zYWZlIGNyZWF0ZWQgcGFyZW50YCk7CiAgICAgIGFzc2VydERpcmVjdG9yeVRydXN0KHBhcmVudFRydXN0LCBzcGVjLCAnY3JlYXRlZCBwYXJlbnQnKTsKICAgICAgYXNzZXJ0RGlyZWN0b3J5SWRlbnRpdHkocGF0aCwgaWRlbnRpdHksIHNwZWMsICdjcmVhdGVkIHBhcmVudCcpOwogICAgICBybWRpclN5bmMocGF0aCk7CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBpZiAoZXJyb3I/LmNvZGUgPT09ICdFTk9FTlQnKSBjb250aW51ZTsKICAgICAgY29uc3QgZmFpbHVyZSA9IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IGNyZWF0ZWQgcGFyZW50IHJlc3RvcmF0aW9uIGluY29tcGxldGVgKTsKICAgICAgZmFpbHVyZS5yZXN0b3JhdGlvbkluY29tcGxldGUgPSB0cnVlOwogICAgICBmYWlsdXJlLmNhdXNlID0gZXJyb3I7CiAgICAgIHRocm93IGZhaWx1cmU7CiAgICB9CiAgfQp9CgpmdW5jdGlvbiBjbGVhbnVwQ3JlYXRlZENhY2hlUGFyZW50cyhjYWNoZVRyYW5zYWN0aW9uLCBzcGVjKSB7CiAgY2xlYW51cENyZWF0ZWRQYXJlbnRzKGNhY2hlVHJhbnNhY3Rpb24uY3JlYXRlZFBhcmVudHMsIHNwZWMpOwp9CgpmdW5jdGlvbiBydW5QbHVnaW5DbGkoYXJncywgc3BlYywgY29udGV4dCkgewogIGxldCByZXN1bHQ7CiAgdHJ5IHsKICAgIHJlc3VsdCA9IGNvbnRleHQuc3Bhd25TeW5jSW1wbCh7CiAgICAgIGNtZDogW2NvbnRleHQuYnVuUGF0aCwgY29udGV4dC5jbGF1ZGVDbGlQYXRoLCAuLi5hcmdzXSwKICAgICAgZW52OiB7IC4uLmNvbnRleHQuZW52LCBDTEFVREVfQ09ERV9ESVNBQkxFX05PTkVTU0VOVElBTF9UUkFGRklDOiAnMScgfSwKICAgICAgc3Rkb3V0OiAncGlwZScsCiAgICAgIHN0ZGVycjogJ3BpcGUnLAogICAgfSk7CiAgfSBjYXRjaCB7CiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBwbHVnaW4gY29tbWFuZCBmYWlsZWRgKTsKICB9CiAgaWYgKHJlc3VsdC5leGl0Q29kZSAhPT0gMCkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogcGx1Z2luIGNvbW1hbmQgZmFpbGVkYCk7Cn0KCmZ1bmN0aW9uIHZlcmlmeVBsdWdpbkluc3RhbGxhdGlvbihzcGVjLCBjb250ZXh0LCBwbHVnaW5Sb290LCBjYWNoZVRyYW5zYWN0aW9uKSB7CiAgYXNzZXJ0RGlyZWN0b3J5VHJ1c3QoY2FjaGVUcmFuc2FjdGlvbi5wbHVnaW5DYWNoZVRydXN0LCBzcGVjLCAncGx1Z2luIGNhY2hlJyk7CiAgYXNzZXJ0RGlyZWN0b3J5SWRlbnRpdHkoY2FjaGVUcmFuc2FjdGlvbi5wbHVnaW5DYWNoZSwgY2FjaGVUcmFuc2FjdGlvbi5wbHVnaW5DYWNoZUlkZW50aXR5LCBzcGVjLCAncGx1Z2luIGNhY2hlJyk7CiAgY29uc3QgaW5zdGFsbGVkID0gcGFyc2VTdGF0ZVNuYXBzaG90KHNuYXBzaG90RmlsZShqb2luKHBsdWdpblJvb3QsICdpbnN0YWxsZWRfcGx1Z2lucy5qc29uJyksIHNwZWMpLCB7fSwgc3BlYywgJ2luc3RhbGxlZCBwbHVnaW4gc3RhdGUnKTsKICBjb25zdCByZWNvcmRzID0gQXJyYXkuaXNBcnJheShpbnN0YWxsZWQ/LnBsdWdpbnM/LltzcGVjLmlkXSkgPyBpbnN0YWxsZWQucGx1Z2luc1tzcGVjLmlkXSA6IFtdOwogIGNvbnN0IHJlY29yZCA9IHJlY29yZHMuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlPy5zY29wZSA9PT0gJ3VzZXInICYmIGNhbmRpZGF0ZS52ZXJzaW9uID09PSBzcGVjLnZlcnNpb24pOwogIGlmICghcmVjb3JkIHx8IHR5cGVvZiByZWNvcmQuaW5zdGFsbFBhdGggIT09ICdzdHJpbmcnKSB0aHJvdyBuZXcgRXJyb3IoYCR7c3BlYy5rZXl9OiBpbnN0YWxsZWQgdmVyc2lvbiB3YXMgbm90IHZlcmlmaWVkYCk7CiAgY29uc3QgY2FjaGVSb290ID0gcmVhbHBhdGhTeW5jKGpvaW4ocGx1Z2luUm9vdCwgJ2NhY2hlJykpOwogIGNvbnN0IGluc3RhbGxQYXRoID0gcmVhbHBhdGhTeW5jKHJlY29yZC5pbnN0YWxsUGF0aCk7CiAgaWYgKCFpbnN0YWxsUGF0aC5zdGFydHNXaXRoKGAke2NhY2hlUm9vdH0ke3NlcH1gKSkgewogICAgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogaW5zdGFsbGVkIHBsdWdpbiBlc2NhcGVkIHRoZSBjYW5vbmljYWwgY2FjaGVgKTsKICB9CiAgY29uc3Qgc2V0dGluZ3MgPSBwYXJzZVN0YXRlU25hcHNob3Qoc25hcHNob3RGaWxlKGpvaW4oY29udGV4dC5jbGF1ZGVDb25maWdEaXIsICdzZXR0aW5ncy5qc29uJyksIHNwZWMpLCB7fSwgc3BlYywgJ3BsdWdpbiBzZXR0aW5ncycpOwogIGlmIChzZXR0aW5ncz8uZW5hYmxlZFBsdWdpbnM/LltzcGVjLmlkXSAhPT0gdHJ1ZSkgdGhyb3cgbmV3IEVycm9yKGAke3NwZWMua2V5fTogaW5zdGFsbGVkIHBsdWdpbiBpcyBub3QgZW5hYmxlZGApOwp9CgpmdW5jdGlvbiBwbHVnaW5SZXN1bHQoc3BlYywgc3RhdHVzLCByZWFkeSwgdmVyc2lvbiwgZGV0YWlsKSB7CiAgcmV0dXJuIHsga2V5OiBzcGVjLmtleSwgaWQ6IHNwZWMuaWQsIHZlcnNpb24sIHN0YXR1cywgcmVhZHksIGRldGFpbCB9Owp9CgpleHBvcnQgYXN5bmMgZnVuY3Rpb24gZW5zdXJlTWFya2V0cGxhY2VQbHVnaW4oc3BlYywgY29udGV4dCkgewogIHRyeSB7CiAgICB2YWxpZGF0ZVNwZWNGaWxlbmFtZUNvbXBvbmVudHMoc3BlYyk7CiAgICB2YWxpZGF0ZUZpbGVuYW1lQ29tcG9uZW50KHNwZWM/Lm1hcmtldHBsYWNlLCAnbWFya2V0cGxhY2UnKTsKICAgIHZhbGlkYXRlRmlsZW5hbWVDb21wb25lbnQoc3BlYz8ucGx1Z2luLCAncGx1Z2luJyk7CiAgfSBjYXRjaCAoZXJyb3IpIHsKICAgIHJldHVybiBwbHVnaW5SZXN1bHQoc3BlYyB8fCB7fSwgJ3dhcm5pbmcnLCBmYWxzZSwgbnVsbCwgZXJyb3IubWVzc2FnZSk7CiAgfQogIGNvbnN0IGJhc2VsaW5lID0gUExVR0lOX0JBU0VMSU5FU1tzcGVjLmtleV07CiAgaWYgKCFiYXNlbGluZSB8fCBbJ2tleScsICdpZCcsICdtYXJrZXRwbGFjZScsICdwbHVnaW4nLCAndmVyc2lvbiddLnNvbWUoZmllbGQgPT4gc3BlY1tmaWVsZF0gIT09IGJhc2VsaW5lW2ZpZWxkXSkpIHsKICAgIHJldHVybiBwbHVnaW5SZXN1bHQoc3BlYywgJ3dhcm5pbmcnLCBmYWxzZSwgbnVsbCwgJ3BsdWdpbiBzcGVjIGlzIG5vdCBjYW5vbmljYWwnKTsKICB9CiAgY29uc3QgcGx1Z2luUm9vdCA9IGpvaW4oY29udGV4dC5jbGF1ZGVDb25maWdEaXIsICdwbHVnaW5zJyk7CiAgY29uc3QgaW5zdGFsbGVkUGx1Z2lucyA9IGpvaW4ocGx1Z2luUm9vdCwgJ2luc3RhbGxlZF9wbHVnaW5zLmpzb24nKTsKICBsZXQgaW5zdGFsbGVkU25hcHNob3Q7CiAgbGV0IGluc3RhbGxlZDsKICB0cnkgewogICAgaW5zdGFsbGVkU25hcHNob3QgPSBzbmFwc2hvdEZpbGUoaW5zdGFsbGVkUGx1Z2lucywgc3BlYyk7CiAgICBpbnN0YWxsZWQgPSBwYXJzZVN0YXRlU25hcHNob3QoaW5zdGFsbGVkU25hcHNob3QsIHsgdmVyc2lvbjogMiwgcGx1Z2luczoge30gfSwgc3BlYywgJ2luc3RhbGxlZCBwbHVnaW4gc3RhdGUnKTsKICB9IGNhdGNoIChlcnJvcikgewogICAgcmV0dXJuIHBsdWdpblJlc3VsdChzcGVjLCAnd2FybmluZycsIGZhbHNlLCBudWxsLCBlcnJvci5tZXNzYWdlKTsKICB9CiAgY29uc3QgY2xhc3NpZmljYXRpb24gPSBjbGFzc2lmeVBsdWdpbihpbnN0YWxsZWQsIHNwZWMpOwogIGNvbnN0IHNlbGVjdGVkID0gc2VsZWN0SW5zdGFsbGVkUmVjb3JkKGluc3RhbGxlZCwgc3BlYy5pZCk7CiAgaWYgKGNsYXNzaWZpY2F0aW9uID09PSAnc2F0aXNmaWVkJykgewogICAgcmV0dXJuIHBsdWdpblJlc3VsdChzcGVjLCAncHJlc2VydmVkJywgdHJ1ZSwgc2VsZWN0ZWQudmVyc2lvbiwgYHByZXNlcnZlZCAke3NlbGVjdGVkLnZlcnNpb259YCk7CiAgfQogIGlmIChjbGFzc2lmaWNhdGlvbiA9PT0gJ2ludmFsaWQnKSB7CiAgICByZXR1cm4gcGx1Z2luUmVzdWx0KHNwZWMsICd3YXJuaW5nJywgZmFsc2UsIG51bGwsICdpbnN0YWxsZWQgdmVyc2lvbiBpcyBpbnZhbGlkOyBwcmVzZXJ2ZWQgZXhpc3Rpbmcgc3RhdGUnKTsKICB9CgogIGNvbnN0IGtub3duTWFya2V0cGxhY2VzID0gam9pbihwbHVnaW5Sb290LCAna25vd25fbWFya2V0cGxhY2VzLmpzb24nKTsKICBjb25zdCBzZXR0aW5nc1BhdGggPSBqb2luKGNvbnRleHQuY2xhdWRlQ29uZmlnRGlyLCAnc2V0dGluZ3MuanNvbicpOwogIGxldCBrbm93blNuYXBzaG90OwogIGxldCBzZXR0aW5nc1NuYXBzaG90OwogIGxldCBrbm93bjsKICB0cnkgewogICAga25vd25TbmFwc2hvdCA9IHNuYXBzaG90RmlsZShrbm93bk1hcmtldHBsYWNlcywgc3BlYyk7CiAgICBzZXR0aW5nc1NuYXBzaG90ID0gc25hcHNob3RGaWxlKHNldHRpbmdzUGF0aCwgc3BlYyk7CiAgICBrbm93biA9IHBhcnNlU3RhdGVTbmFwc2hvdChrbm93blNuYXBzaG90LCB7fSwgc3BlYywgJ2tub3duIG1hcmtldHBsYWNlIHN0YXRlJyk7CiAgICBwYXJzZVN0YXRlU25hcHNob3Qoc2V0dGluZ3NTbmFwc2hvdCwge30sIHNwZWMsICdwbHVnaW4gc2V0dGluZ3MnKTsKICB9IGNhdGNoIChlcnJvcikgewogICAgcmV0dXJuIHBsdWdpblJlc3VsdChzcGVjLCAnd2FybmluZycsIGZhbHNlLCBzZWxlY3RlZD8udmVyc2lvbiB8fCBudWxsLCBlcnJvci5tZXNzYWdlKTsKICB9CgogIGxldCBwZXJzaXN0ZW50VHJhbnNhY3Rpb24gPSBudWxsOwogIGxldCBtYXJrZXRwbGFjZVRyYW5zYWN0aW9uID0gbnVsbDsKICBsZXQgY2FjaGVUcmFuc2FjdGlvbiA9IG51bGw7CiAgdHJ5IHsKICAgIGNvbnN0IHN0YWdlZFNvdXJjZSA9IGF3YWl0IGRvd25sb2FkQW5kU3RhZ2Uoc3BlYywgY29udGV4dCk7CiAgICBjb25zdCBtYXRlcmlhbGl6ZWQgPSBtYXRlcmlhbGl6ZVBlcnNpc3RlbnRTb3VyY2Uoc3RhZ2VkU291cmNlLnNvdXJjZVJvb3QsIHNwZWMsIGNvbnRleHQpOwogICAgcGVyc2lzdGVudFRyYW5zYWN0aW9uID0gbWF0ZXJpYWxpemVkLnRyYW5zYWN0aW9uOwogICAgY29uc3QgdHJhY2tlZE1hcmtldHBsYWNlID0gZW5zdXJlVHJhY2tlZERpcmVjdG9yeSgKICAgICAgcGx1Z2luUm9vdCwKICAgICAgWydtYXJrZXRwbGFjZXMnXSwKICAgICAgc3BlYywKICAgICAgY29udGV4dCwKICAgICAgJ21hcmtldHBsYWNlIHBhcmVudCcsCiAgICApOwogICAgY29uc3QgbWFya2V0cGxhY2VQYXJlbnQgPSB0cmFja2VkTWFya2V0cGxhY2UucGF0aDsKICAgIGNvbnN0IG1hcmtldHBsYWNlQ3JlYXRlZFBhcmVudHMgPSB0cmFja2VkTWFya2V0cGxhY2UuY3JlYXRlZFBhcmVudHM7CiAgICBjb25zdCBtYXJrZXRwbGFjZVBhcmVudEd1YXJkID0gdHJhY2tlZERpcmVjdG9yeUd1YXJkKG1hcmtldHBsYWNlUGFyZW50LCBtYXJrZXRwbGFjZUNyZWF0ZWRQYXJlbnRzLCBzcGVjLCAnbWFya2V0cGxhY2UgcGFyZW50Jyk7CiAgICBtYXJrZXRwbGFjZVRyYW5zYWN0aW9uID0gcHJlcGFyZURpcmVjdG9yeVJlcGxhY2VtZW50KAogICAgICBqb2luKG1hcmtldHBsYWNlUGFyZW50LCBzcGVjLm1hcmtldHBsYWNlKSwKICAgICAgc3BlYywKICAgICAgJ21hcmtldHBsYWNlJywKICAgICAgbWFya2V0cGxhY2VQYXJlbnRHdWFyZCwKICAgICk7CiAgICBtYXJrZXRwbGFjZVRyYW5zYWN0aW9uLmNyZWF0ZWRQYXJlbnRzID0gbWFya2V0cGxhY2VDcmVhdGVkUGFyZW50czsKICAgIGNhY2hlVHJhbnNhY3Rpb24gPSBwcmVwYXJlQ2FjaGVUcmFuc2FjdGlvbihwbHVnaW5Sb290LCBzcGVjLCBpbnN0YWxsZWQsIG1hdGVyaWFsaXplZC5wbHVnaW5Tb3VyY2UsIGNvbnRleHQpOwoKICAgIGlmIChPYmplY3QuaGFzT3duKGtub3duLCBzcGVjLm1hcmtldHBsYWNlKSkgewogICAgICBydW5QbHVnaW5DbGkoWydwbHVnaW4nLCAnbWFya2V0cGxhY2UnLCAncmVtb3ZlJywgc3BlYy5tYXJrZXRwbGFjZV0sIHNwZWMsIGNvbnRleHQpOwogICAgfQogICAgcnVuUGx1Z2luQ2xpKFsncGx1Z2luJywgJ21hcmtldHBsYWNlJywgJ2FkZCcsIG1hdGVyaWFsaXplZC5wZXJzaXN0ZW50U291cmNlLCAnLS1zY29wZScsICd1c2VyJ10sIHNwZWMsIGNvbnRleHQpOwogICAgcnVuUGx1Z2luQ2xpKAogICAgICBjbGFzc2lmaWNhdGlvbiA9PT0gJ21pc3NpbmcnCiAgICAgICAgPyBbJ3BsdWdpbicsICdpbnN0YWxsJywgc3BlYy5pZCwgJy0tc2NvcGUnLCAndXNlciddCiAgICAgICAgOiBbJ3BsdWdpbicsICd1cGRhdGUnLCBzcGVjLmlkLCAnLS1zY29wZScsICd1c2VyJ10sCiAgICAgIHNwZWMsCiAgICAgIGNvbnRleHQsCiAgICApOwogICAgdmVyaWZ5UGx1Z2luSW5zdGFsbGF0aW9uKHNwZWMsIGNvbnRleHQsIHBsdWdpblJvb3QsIGNhY2hlVHJhbnNhY3Rpb24pOwogIH0gY2F0Y2ggKGVycm9yKSB7CiAgICBpZiAoIXBlcnNpc3RlbnRUcmFuc2FjdGlvbiAmJiBlcnJvcj8udHJhbnNhY3Rpb24pIHBlcnNpc3RlbnRUcmFuc2FjdGlvbiA9IGVycm9yLnRyYW5zYWN0aW9uOwogICAgY29uc3QgcmVzdG9yYXRpb25FcnJvcnMgPSBbXTsKICAgIGZvciAoY29uc3QgcmVzdG9yZSBvZiBbCiAgICAgICgpID0+IHJlc3RvcmVGaWxlKGtub3duTWFya2V0cGxhY2VzLCBrbm93blNuYXBzaG90LCBzcGVjKSwKICAgICAgKCkgPT4gcmVzdG9yZUZpbGUoaW5zdGFsbGVkUGx1Z2lucywgaW5zdGFsbGVkU25hcHNob3QsIHNwZWMpLAogICAgICAoKSA9PiByZXN0b3JlRmlsZShzZXR0aW5nc1BhdGgsIHNldHRpbmdzU25hcHNob3QsIHNwZWMpLAogICAgICAoKSA9PiBtYXJrZXRwbGFjZVRyYW5zYWN0aW9uICYmIHJlc3RvcmVEaXJlY3RvcnlSZXBsYWNlbWVudChtYXJrZXRwbGFjZVRyYW5zYWN0aW9uLCBzcGVjKSwKICAgICAgKCkgPT4gY2FjaGVUcmFuc2FjdGlvbiAmJiByZXN0b3JlQ2FjaGVUcmFuc2FjdGlvbihjYWNoZVRyYW5zYWN0aW9uLCBzcGVjLCBjb250ZXh0KSwKICAgICAgKCkgPT4gbWFya2V0cGxhY2VUcmFuc2FjdGlvbiAmJiBjbGVhbnVwQ3JlYXRlZFBhcmVudHMobWFya2V0cGxhY2VUcmFuc2FjdGlvbi5jcmVhdGVkUGFyZW50cywgc3BlYyksCiAgICAgICgpID0+IGNhY2hlVHJhbnNhY3Rpb24gJiYgY2xlYW51cENyZWF0ZWRDYWNoZVBhcmVudHMoY2FjaGVUcmFuc2FjdGlvbiwgc3BlYyksCiAgICAgICgpID0+IHBlcnNpc3RlbnRUcmFuc2FjdGlvbiAmJiByZXN0b3JlRGlyZWN0b3J5UmVwbGFjZW1lbnQocGVyc2lzdGVudFRyYW5zYWN0aW9uLCBzcGVjKSwKICAgICAgKCkgPT4gcGVyc2lzdGVudFRyYW5zYWN0aW9uICYmIGNsZWFudXBDcmVhdGVkUGFyZW50cyhwZXJzaXN0ZW50VHJhbnNhY3Rpb24uY3JlYXRlZFBhcmVudHMgfHwgW10sIHNwZWMpLAogICAgXSkgewogICAgICB0cnkgeyByZXN0b3JlKCk7IH0gY2F0Y2ggKHJlc3RvcmVFcnJvcikgeyByZXN0b3JhdGlvbkVycm9ycy5wdXNoKHJlc3RvcmVFcnJvcik7IH0KICAgIH0KICAgIGlmIChyZXN0b3JhdGlvbkVycm9ycy5sZW5ndGggPiAwIHx8IGVycm9yPy5yZXN0b3JhdGlvbkluY29tcGxldGUpIHsKICAgICAgY29uc3QgZmFpbHVyZSA9IG5ldyBFcnJvcihgJHtzcGVjLmtleX06IHBsdWdpbiB0cmFuc2FjdGlvbiByZXN0b3JhdGlvbiBpbmNvbXBsZXRlYCk7CiAgICAgIGZhaWx1cmUucmVzdG9yYXRpb25JbmNvbXBsZXRlID0gdHJ1ZTsKICAgICAgY29uc3QgcHJpbWFyeSA9IGVycm9yPy5yZXN0b3JhdGlvbkluY29tcGxldGUgPyBlcnJvciA6IHJlc3RvcmF0aW9uRXJyb3JzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZT8ucmVzdG9yYXRpb25JbmNvbXBsZXRlKSB8fCByZXN0b3JhdGlvbkVycm9yc1swXSB8fCBlcnJvcjsKICAgICAgZmFpbHVyZS5jYXVzZSA9IHByaW1hcnk7CiAgICAgIGZhaWx1cmUudHJhbnNhY3Rpb24gPSBwcmltYXJ5Py50cmFuc2FjdGlvbiB8fCBwZXJzaXN0ZW50VHJhbnNhY3Rpb24gfHwgbnVsbDsKICAgICAgaWYgKHByaW1hcnk/LmV2aWRlbmNlUGF0aCkgZmFpbHVyZS5ldmlkZW5jZVBhdGggPSBwcmltYXJ5LmV2aWRlbmNlUGF0aDsKICAgICAgaWYgKHByaW1hcnk/LmV2aWRlbmNlUGF0aHMpIGZhaWx1cmUuZXZpZGVuY2VQYXRocyA9IHByaW1hcnkuZXZpZGVuY2VQYXRoczsKICAgICAgaWYgKHByaW1hcnk/LnVuZXhwZWN0ZWRQYXRocykgZmFpbHVyZS51bmV4cGVjdGVkUGF0aHMgPSBwcmltYXJ5LnVuZXhwZWN0ZWRQYXRoczsKICAgICAgdGhyb3cgZmFpbHVyZTsKICAgIH0KICAgIHJldHVybiBwbHVnaW5SZXN1bHQoc3BlYywgJ3dhcm5pbmcnLCBmYWxzZSwgc2VsZWN0ZWQ/LnZlcnNpb24gfHwgbnVsbCwgZXJyb3IubWVzc2FnZSk7CiAgfQoKICBjb25zdCBjbGVhbnVwRXJyb3JzID0gW107CiAgZm9yIChjb25zdCBjbGVhbnVwIG9mIFsKICAgICgpID0+IGNsZWFudXBEaXJlY3RvcnlSZXBsYWNlbWVudChtYXJrZXRwbGFjZVRyYW5zYWN0aW9uLCBzcGVjKSwKICAgICgpID0+IGNsZWFudXBDYWNoZVRyYW5zYWN0aW9uKGNhY2hlVHJhbnNhY3Rpb24sIHNwZWMpLAogICAgKCkgPT4gY2xlYW51cERpcmVjdG9yeVJlcGxhY2VtZW50KHBlcnNpc3RlbnRUcmFuc2FjdGlvbiwgc3BlYyksCiAgXSkgewogICAgdHJ5IHsgY2xlYW51cCgpOyB9IGNhdGNoIChlcnJvcikgeyBjbGVhbnVwRXJyb3JzLnB1c2goZXJyb3IpOyB9CiAgfQogIGlmIChjbGVhbnVwRXJyb3JzLmxlbmd0aCA+IDApIHsKICAgIHJldHVybiBwbHVnaW5SZXN1bHQoc3BlYywgJ3dhcm5pbmcnLCB0cnVlLCBzcGVjLnZlcnNpb24sICdpbnN0YWxsZWQgcGx1Z2luIHZlcmlmaWVkOyB0cmFuc2FjdGlvbiBiYWNrdXAgY2xlYW51cCBmYWlsZWQnKTsKICB9CiAgcmV0dXJuIHBsdWdpblJlc3VsdCgKICAgIHNwZWMsCiAgICBjbGFzc2lmaWNhdGlvbiA9PT0gJ21pc3NpbmcnID8gJ2luc3RhbGxlZCcgOiAndXBncmFkZWQnLAogICAgdHJ1ZSwKICAgIHNwZWMudmVyc2lvbiwKICAgIGAke2NsYXNzaWZpY2F0aW9uID09PSAnbWlzc2luZycgPyAnaW5zdGFsbGVkJyA6ICd1cGdyYWRlZCd9ICR7c3BlYy52ZXJzaW9ufWAsCiAgKTsKfQoKZnVuY3Rpb24gd2FybmluZ1Jlc3VsdChzcGVjLCBlcnJvcikgewogIGNvbnN0IGRldGFpbCA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ3BsdWdpbiBzZXR1cCBmYWlsZWQnOwogIHJldHVybiBwbHVnaW5SZXN1bHQoc3BlYywgJ3dhcm5pbmcnLCBmYWxzZSwgbnVsbCwgZGV0YWlsKTsKfQoKZXhwb3J0IGZ1bmN0aW9uIHNob3VsZENvbmZpZ3VyZVBsdWdpbkRlcGVuZGVuY3kocmVzdWx0KSB7CiAgcmV0dXJuIHJlc3VsdD8ucmVhZHkgPT09IHRydWUgJiYgcmVzdWx0LnN0YXR1cyAhPT0gJ3dhcm5pbmcnOwp9CgpleHBvcnQgYXN5bmMgZnVuY3Rpb24gZW5zdXJlUGx1Z2luRGVwZW5kZW5jaWVzKGNvbnRleHQpIHsKICBjb25zdCBzcGVjcyA9IFtQTFVHSU5fQkFTRUxJTkVTLmh1ZCwgUExVR0lOX0JBU0VMSU5FUy5tZW1vcnksIFBMVUdJTl9CQVNFTElORVMuc3VwZXJwb3dlcnNdOwogIGNvbnN0IG1hcmtldHBsYWNlUmVzdWx0cyA9IG5ldyBNYXAoKTsKICBmb3IgKGNvbnN0IHNwZWMgb2Ygc3BlY3MpIHsKICAgIHRyeSB7CiAgICAgIG1hcmtldHBsYWNlUmVzdWx0cy5zZXQoc3BlYy5rZXksIGF3YWl0IGVuc3VyZU1hcmtldHBsYWNlUGx1Z2luKHNwZWMsIGNvbnRleHQpKTsKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIG1hcmtldHBsYWNlUmVzdWx0cy5zZXQoc3BlYy5rZXksIHdhcm5pbmdSZXN1bHQoc3BlYywgZXJyb3IpKTsKICAgIH0KICB9CgogIGNvbnN0IHN0YXRlID0geyBzY2hlbWFWZXJzaW9uOiAxLCBodWQ6IHt9LCBjbGF1ZGVNZW06IHsgZmlsZXM6IHt9IH0gfTsKICBjb25zdCByZXN1bHRzID0gW107CiAgZm9yIChjb25zdCBzcGVjIG9mIHNwZWNzKSB7CiAgICBjb25zdCBtYXJrZXRwbGFjZSA9IG1hcmtldHBsYWNlUmVzdWx0cy5nZXQoc3BlYy5rZXkpOwogICAgaWYgKCFzaG91bGRDb25maWd1cmVQbHVnaW5EZXBlbmRlbmN5KG1hcmtldHBsYWNlKSB8fCBzcGVjLmtleSA9PT0gJ3N1cGVycG93ZXJzJykgewogICAgICByZXN1bHRzLnB1c2gobWFya2V0cGxhY2UpOwogICAgICBjb250aW51ZTsKICAgIH0KICAgIHRyeSB7CiAgICAgIHJlc3VsdHMucHVzaChzcGVjLmtleSA9PT0gJ2h1ZCcKICAgICAgICA/IGF3YWl0IGNvbmZpZ3VyZUh1ZChjb250ZXh0LCBzdGF0ZSkKICAgICAgICA6IGF3YWl0IGNvbmZpZ3VyZUNsYXVkZU1lbUJ1bihjb250ZXh0LCBzdGF0ZSkpOwogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgcmVzdWx0cy5wdXNoKHdhcm5pbmdSZXN1bHQoc3BlYywgZXJyb3IpKTsKICAgIH0KICB9CiAgcmV0dXJuIHJlc3VsdHM7Cn0KCmZ1bmN0aW9uIHBsdWdpbkNvbnRleHQoKSB7CiAgY29uc3QgaG9tZSA9IHByb2Nlc3MuZW52LkhPTUUgfHwgaG9tZWRpcigpOwogIGNvbnN0IGNsYXdnb2REaXIgPSBwcm9jZXNzLmVudi5DTEFXR09EX0RJUiB8fCBqb2luKGhvbWUsICcuY2xhd2dvZCcpOwogIHJldHVybiB7CiAgICBob21lLAogICAgY2xhdWRlQ29uZmlnRGlyOiBwcm9jZXNzLmVudi5DTEFVREVfQ09ORklHX0RJUiB8fCBqb2luKGhvbWUsICcuY2xhdWRlJyksCiAgICBjbGF3Z29kRGlyLAogICAgYnVuUGF0aDogcHJvY2Vzcy5lbnYuQ0xBV0dPRF9CVU5fQklOIHx8IHByb2Nlc3MuZXhlY1BhdGgsCiAgICBjbGF1ZGVDbGlQYXRoOiBqb2luKGNsYXdnb2REaXIsICdjbGkub3JpZ2luYWwuY2pzJyksCiAgICBmZXRjaEZpbGVQYXRoOiBqb2luKGNsYXdnb2REaXIsICdmZXRjaC1maWxlLm1qcycpLAogICAgZW52OiBwcm9jZXNzLmVudiwKICAgIHNwYXduU3luY0ltcGw6IEJ1bi5zcGF3blN5bmMsCiAgfTsKfQoKZnVuY3Rpb24gcHJpbnRQbHVnaW5SZXN1bHRzKHJlc3VsdHMpIHsKICBsZXQgd2FybmluZ3MgPSAwOwogIGZvciAoY29uc3QgcmVzdWx0IG9mIHJlc3VsdHMpIHsKICAgIGNvbnN0IHdhcm5pbmcgPSByZXN1bHQuc3RhdHVzID09PSAnd2FybmluZycgfHwgIXJlc3VsdC5yZWFkeTsKICAgIGlmICh3YXJuaW5nKSB3YXJuaW5ncyArPSAxOwogICAgY29uc3QgZGV0YWlsID0gU3RyaW5nKHJlc3VsdC5kZXRhaWwgfHwgJycpLnJlcGxhY2UoL1xzKy9nLCAnICcpLnRyaW0oKTsKICAgIGNvbnNvbGUubG9nKGAke3Jlc3VsdC5pZH06ICR7d2FybmluZyA/ICd3YXJuaW5nJyA6ICdyZWFkeSd9JHtkZXRhaWwgPyBgIC0gJHtkZXRhaWx9YCA6ICcnfWApOwogIH0KICBjb25zb2xlLmxvZyhgT3B0aW9uYWwgcGx1Z2luczogJHtyZXN1bHRzLmxlbmd0aCAtIHdhcm5pbmdzfSByZWFkeSwgJHt3YXJuaW5nc30gd2FybmluZyR7d2FybmluZ3MgPT09IDEgPyAnJyA6ICdzJ31gKTsKfQoKY29uc3QgTUFOQUdFRF9BVE9NSUNfUkVTSURVRSA9IC9eXC4oPzpwbHVnaW4tZGVwZW5kZW5jaWVzLXN0YXRlXC5qc29ufGNsYXVkZS1odWQtc3RhdHVzbGluZVwubWpzKVwuXGQrXC5bMC05YS1mXXs4fS1bMC05YS1mXXs0fS1bMS01XVswLTlhLWZdezN9LVs4OWFiXVswLTlhLWZdezN9LVswLTlhLWZdezEyfVwudG1wJC87CgpmdW5jdGlvbiBjbGVhbnVwTWFuYWdlZEF0b21pY1Jlc2lkdWUoY29udGV4dCkgewogIGNvbnN0IHJvb3QgPSByZXNvbHZlKGNvbnRleHQuY2xhd2dvZERpcik7CiAgbGV0IHJvb3RJZGVudGl0eTsKICB0cnkgewogICAgY29uc3Qgc3RhdHVzID0gbHN0YXRTeW5jKHJvb3QpOwogICAgaWYgKHN0YXR1cy5pc1N5bWJvbGljTGluaygpIHx8ICFzdGF0dXMuaXNEaXJlY3RvcnkoKSkgcmV0dXJuOwogICAgcm9vdElkZW50aXR5ID0geyBkZXY6IHN0YXR1cy5kZXYsIGlubzogc3RhdHVzLmlubyB9OwogIH0gY2F0Y2ggeyByZXR1cm47IH0KICBsZXQgZW50cmllczsKICB0cnkgeyBlbnRyaWVzID0gcmVhZGRpclN5bmMocm9vdCk7IH0gY2F0Y2ggeyByZXR1cm47IH0KICBmb3IgKGNvbnN0IG5hbWUgb2YgZW50cmllcykgewogICAgaWYgKCFNQU5BR0VEX0FUT01JQ19SRVNJRFVFLnRlc3QobmFtZSkpIGNvbnRpbnVlOwogICAgY29uc3QgcGF0aCA9IGpvaW4ocm9vdCwgbmFtZSk7CiAgICBsZXQgc3RhdHVzOwogICAgdHJ5IHsgc3RhdHVzID0gbHN0YXRTeW5jKHBhdGgpOyB9IGNhdGNoIHsgY29udGludWU7IH0KICAgIGlmIChzdGF0dXMuaXNTeW1ib2xpY0xpbmsoKSB8fCAhc3RhdHVzLmlzRmlsZSgpIHx8IHN0YXR1cy5ubGluayAhPT0gMSkgY29udGludWU7CiAgICBsZXQgY3VycmVudFJvb3Q7CiAgICBsZXQgY3VycmVudDsKICAgIHRyeSB7CiAgICAgIGN1cnJlbnRSb290ID0gbHN0YXRTeW5jKHJvb3QpOwogICAgICBjdXJyZW50ID0gbHN0YXRTeW5jKHBhdGgpOwogICAgfSBjYXRjaCB7IGNvbnRpbnVlOyB9CiAgICBpZiAoY3VycmVudFJvb3QuaXNTeW1ib2xpY0xpbmsoKSB8fCAhY3VycmVudFJvb3QuaXNEaXJlY3RvcnkoKQogICAgICB8fCBjdXJyZW50Um9vdC5kZXYgIT09IHJvb3RJZGVudGl0eS5kZXYgfHwgY3VycmVudFJvb3QuaW5vICE9PSByb290SWRlbnRpdHkuaW5vCiAgICAgIHx8IGN1cnJlbnQuaXNTeW1ib2xpY0xpbmsoKSB8fCAhY3VycmVudC5pc0ZpbGUoKSB8fCBjdXJyZW50Lm5saW5rICE9PSAxCiAgICAgIHx8IGN1cnJlbnQuZGV2ICE9PSBzdGF0dXMuZGV2IHx8IGN1cnJlbnQuaW5vICE9PSBzdGF0dXMuaW5vKSBjb250aW51ZTsKICAgIHRyeSB7IHVubGlua1N5bmMocGF0aCk7IH0gY2F0Y2gge30KICB9Cn0KCmFzeW5jIGZ1bmN0aW9uIHJ1blBsdWdpbkRlcGVuZGVuY2llc0NsaShjb21tYW5kKSB7CiAgY29uc3QgY29udGV4dCA9IHBsdWdpbkNvbnRleHQoKTsKICBpZiAoY29tbWFuZCA9PT0gJ2Vuc3VyZScpIHsKICAgIHByaW50UGx1Z2luUmVzdWx0cyhhd2FpdCBlbnN1cmVQbHVnaW5EZXBlbmRlbmNpZXMoY29udGV4dCkpOwogICAgcmV0dXJuOwogIH0KICBpZiAoY29tbWFuZCA9PT0gJ3VuaW5zdGFsbCcpIHsKICAgIGNvbnN0IHJlc3RvcmF0aW9uID0gYXdhaXQgcmVzdG9yZU1hbmFnZWRJbnRlZ3JhdGlvbnMoY29udGV4dCk7CiAgICBpZiAocmVzdG9yYXRpb24uY29uZmxpY3RzLmxlbmd0aCA+IDApIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKGBvcHRpb25hbCBwbHVnaW4gcmVzdG9yYXRpb24gY29uZmxpY3RzOiAke3Jlc3RvcmF0aW9uLmNvbmZsaWN0cy5qb2luKCcsICcpfWApOwogICAgfQogICAgY2xlYW51cE1hbmFnZWRBdG9taWNSZXNpZHVlKGNvbnRleHQpOwogICAgcmV0dXJuOwogIH0KICB0aHJvdyBuZXcgRXJyb3IoJ3VzYWdlOiBwbHVnaW4tZGVwZW5kZW5jaWVzLm1qcyA8ZW5zdXJlfHVuaW5zdGFsbD4nKTsKfQoKaWYgKGltcG9ydC5tZXRhLm1haW4pIHsKICB0cnkgewogICAgYXdhaXQgcnVuUGx1Z2luRGVwZW5kZW5jaWVzQ2xpKHByb2Nlc3MuYXJndlsyXSk7CiAgfSBjYXRjaCAoZXJyb3IpIHsKICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnb3B0aW9uYWwgcGx1Z2luIGxpZmVjeWNsZSBmYWlsZWQnKTsKICAgIHByb2Nlc3MuZXhpdENvZGUgPSAxOwogIH0KfQo=')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "plugin-dependencies.mjs"), $PluginDependenciesBytes)

# --- Managed ripgrep -------------------------------------------------

$InstallRipgrepBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCmltcG9ydCB7IGNobW9kU3luYywgZXhpc3RzU3luYywgbHN0YXRTeW5jLCBta2RpclN5bmMsIHJlbmFtZVN5bmMsIHJtU3luYyB9IGZyb20gJ25vZGU6ZnMnOwppbXBvcnQgeyBpc0Fic29sdXRlLCBqb2luLCByZWxhdGl2ZSwgcmVzb2x2ZSwgc2VwIH0gZnJvbSAnbm9kZTpwYXRoJzsKCmV4cG9ydCBjb25zdCBSSVBHUkVQX1ZFUlNJT04gPSAnMTUuMi4wJzsKZXhwb3J0IGNvbnN0IFJJUEdSRVBfQVNTRVRTID0gewogICdkYXJ3aW4tYXJtNjQnOiBbJ3JpcGdyZXAtMTUuMi4wLWFhcmNoNjQtYXBwbGUtZGFyd2luLnRhci5neicsICczNzUwYjJlOTNmMzdlMGM2OTI2NTdkYTU3NGQ3MDE5YTEwMWMwMDg0ZGEwNWE3OTBjODNmZDMzNWJhZDk3M2U0J10sCiAgJ2Rhcndpbi14NjQnOiBbJ3JpcGdyZXAtMTUuMi4wLXg4Nl82NC1hcHBsZS1kYXJ3aW4udGFyLmd6JywgJ2FmNzgyNWZjYzY5YTJhZmM3YTdhZWE1NWZjOWFmOTBlMjY0MjFkOGYyMGZlNTlkZjMyZTIzM2MwYjhhMjMxYzEnXSwKICAnbGludXgtYXJtNjQnOiBbJ3JpcGdyZXAtMTUuMi4wLWFhcmNoNjQtdW5rbm93bi1saW51eC1tdXNsLnRhci5neicsICc4MDBiMWU3MjA2YWZlNzk5ZGZiNWE2OTAxZjIzMTQ3Y2ZhYWJlMGU1MjIxMDUzODEwMGY2MWU4NmUxNzQwOTE1J10sCiAgJ2xpbnV4LXg2NCc6IFsncmlwZ3JlcC0xNS4yLjAteDg2XzY0LXVua25vd24tbGludXgtbXVzbC50YXIuZ3onLCAnMzNlMTViY2YxNjI0YjI1Y2RkMmE1NTgxM2E0N2EyZjk1ZGJlMTI2MjY4MjAzZTc2YWE2YTU4NWQxZTdiMTQ5YyddLAogICd3aW4zMi1hcm02NCc6IFsncmlwZ3JlcC0xNS4yLjAtYWFyY2g2NC1wYy13aW5kb3dzLW1zdmMuemlwJywgJ2U0YWJjYTEwYzNhNjRlYmVhNzQyNjY3ZGQ3MDA5NDQ5ZDQ5NDAzZGI1NDYwZGQ2ODczZTM4OWZhMjk0NTM2MGYnXSwKICAnd2luMzIteDY0JzogWydyaXBncmVwLTE1LjIuMC14ODZfNjQtcGMtd2luZG93cy1tc3ZjLnppcCcsICc3MWIyZmVmODYwYWJlNDY3MjE3YTUzOGZmMzFkZTAyZjUyNTg4MDdjMDEyOWY3NzE4NDZmODdiZDAyOWFhZmM1J10sCn07Cgpjb25zdCBNQVhfQklOQVJZX0JZVEVTID0gMTAwICogMTAyNCAqIDEwMjQ7CgpmdW5jdGlvbiBub1Byb3h5UnVsZSh2YWx1ZSkgewogIGxldCBlbnRyeSA9IHZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpOwogIGlmIChlbnRyeSA9PT0gJyonKSByZXR1cm4geyBhbGw6IHRydWUgfTsKICBsZXQgaG9zdCA9IGVudHJ5OwogIGxldCBwb3J0ID0gJyc7CiAgaWYgKGVudHJ5LnN0YXJ0c1dpdGgoJ1snKSkgewogICAgY29uc3QgY2xvc2UgPSBlbnRyeS5pbmRleE9mKCddJyk7CiAgICBpZiAoY2xvc2UgPT09IC0xKSByZXR1cm4geyBob3N0OiBlbnRyeSwgcG9ydCB9OwogICAgaG9zdCA9IGVudHJ5LnNsaWNlKDEsIGNsb3NlKTsKICAgIGNvbnN0IHN1ZmZpeCA9IGVudHJ5LnNsaWNlKGNsb3NlICsgMSk7CiAgICBpZiAoL146XGQrJC8udGVzdChzdWZmaXgpKSBwb3J0ID0gc3VmZml4LnNsaWNlKDEpOwogICAgZWxzZSBpZiAoc3VmZml4KSByZXR1cm4geyBob3N0OiBlbnRyeSwgcG9ydCB9OwogIH0gZWxzZSB7CiAgICBjb25zdCBjb2xvbiA9IGVudHJ5Lmxhc3RJbmRleE9mKCc6Jyk7CiAgICBpZiAoY29sb24gPiAwICYmIGNvbG9uID09PSBlbnRyeS5pbmRleE9mKCc6JykgJiYgL15cZCskLy50ZXN0KGVudHJ5LnNsaWNlKGNvbG9uICsgMSkpKSB7CiAgICAgIGhvc3QgPSBlbnRyeS5zbGljZSgwLCBjb2xvbik7CiAgICAgIHBvcnQgPSBlbnRyeS5zbGljZShjb2xvbiArIDEpOwogICAgfQogIH0KICByZXR1cm4geyBob3N0OiBob3N0LnJlcGxhY2UoL15cKlwuLywgJy4nKSwgcG9ydCB9Owp9CgpmdW5jdGlvbiBieXBhc3Nlc1Byb3h5KHVybFZhbHVlLCBlbnYpIHsKICBjb25zdCBwYXJzZWQgPSB0eXBlb2YgdXJsVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IFVSTCh1cmxWYWx1ZSkgOiB1cmxWYWx1ZTsKICBjb25zdCBlbnRyaWVzID0gKGVudi5OT19QUk9YWSB8fCBlbnYubm9fcHJveHkgfHwgJycpLnNwbGl0KCcsJykuZmlsdGVyKHZhbHVlID0+IHZhbHVlLnRyaW0oKSk7CiAgY29uc3QgaG9zdCA9IHBhcnNlZC5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL15cW3xcXSQvZywgJycpOwogIGNvbnN0IHBvcnQgPSBwYXJzZWQucG9ydCB8fCAocGFyc2VkLnByb3RvY29sID09PSAnaHR0cHM6JyA/ICc0NDMnIDogcGFyc2VkLnByb3RvY29sID09PSAnaHR0cDonID8gJzgwJyA6ICcnKTsKICByZXR1cm4gZW50cmllcy5zb21lKGVudHJ5ID0+IHsKICAgIGNvbnN0IHJ1bGUgPSBub1Byb3h5UnVsZShlbnRyeSk7CiAgICBpZiAocnVsZS5hbGwpIHJldHVybiB0cnVlOwogICAgY29uc3QgYmFzZUhvc3QgPSBydWxlLmhvc3QucmVwbGFjZSgvXlwuLywgJycpOwogICAgcmV0dXJuIChob3N0ID09PSBiYXNlSG9zdCB8fCBob3N0LmVuZHNXaXRoKGAuJHtiYXNlSG9zdH1gKSkgJiYgKCFydWxlLnBvcnQgfHwgcnVsZS5wb3J0ID09PSBwb3J0KTsKICB9KTsKfQoKZXhwb3J0IGZ1bmN0aW9uIHByb3h5Rm9yKHVybFZhbHVlLCBlbnYgPSBwcm9jZXNzLmVudikgewogIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsVmFsdWUpOwogIGlmIChieXBhc3Nlc1Byb3h5KHBhcnNlZCwgZW52KSkgcmV0dXJuIHVuZGVmaW5lZDsKICByZXR1cm4gcGFyc2VkLnByb3RvY29sID09PSAnaHR0cHM6JwogICAgPyBlbnYuSFRUUFNfUFJPWFkgfHwgZW52Lmh0dHBzX3Byb3h5IHx8IGVudi5IVFRQX1BST1hZIHx8IGVudi5odHRwX3Byb3h5CiAgICA6IGVudi5IVFRQX1BST1hZIHx8IGVudi5odHRwX3Byb3h5Owp9Cgphc3luYyBmdW5jdGlvbiBmZXRjaERpcmVjdCh1cmwsIGluaXQsIGZldGNoSW1wbCkgewogIGNvbnN0IHVwcGVyID0gT2JqZWN0Lmhhc093bihwcm9jZXNzLmVudiwgJ05PX1BST1hZJykgPyBwcm9jZXNzLmVudi5OT19QUk9YWSA6IHVuZGVmaW5lZDsKICBjb25zdCBsb3dlciA9IE9iamVjdC5oYXNPd24ocHJvY2Vzcy5lbnYsICdub19wcm94eScpID8gcHJvY2Vzcy5lbnYubm9fcHJveHkgOiB1bmRlZmluZWQ7CiAgdHJ5IHsKICAgIHByb2Nlc3MuZW52Lk5PX1BST1hZID0gJyonOwogICAgcHJvY2Vzcy5lbnYubm9fcHJveHkgPSAnKic7CiAgICByZXR1cm4gYXdhaXQgZmV0Y2hJbXBsKHVybCwgaW5pdCk7CiAgfSBmaW5hbGx5IHsKICAgIGlmICh1cHBlciA9PT0gdW5kZWZpbmVkKSBkZWxldGUgcHJvY2Vzcy5lbnYuTk9fUFJPWFk7CiAgICBlbHNlIHByb2Nlc3MuZW52Lk5PX1BST1hZID0gdXBwZXI7CiAgICBpZiAobG93ZXIgPT09IHVuZGVmaW5lZCkgZGVsZXRlIHByb2Nlc3MuZW52Lm5vX3Byb3h5OwogICAgZWxzZSBwcm9jZXNzLmVudi5ub19wcm94eSA9IGxvd2VyOwogIH0KfQoKZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoV2l0aFByb3h5KGluaXRpYWxVcmwsIGluaXQgPSB7fSwgZW52ID0gcHJvY2Vzcy5lbnYsIGZldGNoSW1wbCA9IGZldGNoKSB7CiAgbGV0IG5leHRVcmwgPSBpbml0aWFsVXJsOwogIGNvbnN0IHsgcHJveHk6IF9jYWxsZXJQcm94eSwgLi4uYmFzZUluaXQgfSA9IGluaXQ7CiAgZm9yIChsZXQgcmVkaXJlY3RzID0gMDsgcmVkaXJlY3RzIDw9IDU7IHJlZGlyZWN0cysrKSB7CiAgICBjb25zdCBieXBhc3MgPSBieXBhc3Nlc1Byb3h5KG5leHRVcmwsIGVudik7CiAgICBjb25zdCBwcm94eSA9IHByb3h5Rm9yKG5leHRVcmwsIGVudik7CiAgICBsZXQgcmVzcG9uc2U7CiAgICB0cnkgewogICAgICBjb25zdCByZXF1ZXN0SW5pdCA9IHsKICAgICAgICAuLi5iYXNlSW5pdCwKICAgICAgICByZWRpcmVjdDogJ21hbnVhbCcsCiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDAwMCksCiAgICAgICAgLi4uKHByb3h5ID8geyBwcm94eSB9IDoge30pLAogICAgICB9OwogICAgICByZXNwb25zZSA9IGJ5cGFzcwogICAgICAgID8gYXdhaXQgZmV0Y2hEaXJlY3QobmV4dFVybCwgcmVxdWVzdEluaXQsIGZldGNoSW1wbCkKICAgICAgICA6IGF3YWl0IGZldGNoSW1wbChuZXh0VXJsLCByZXF1ZXN0SW5pdCk7CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBpZiAocHJveHkpIHRocm93IG5ldyBFcnJvcignUmVxdWVzdCBmYWlsZWQgdGhyb3VnaCBjb25maWd1cmVkIHByb3h5Jyk7CiAgICAgIHRocm93IGVycm9yOwogICAgfQogICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA+PSAzMDAgJiYgcmVzcG9uc2Uuc3RhdHVzIDwgNDAwICYmIHJlc3BvbnNlLmhlYWRlcnMuaGFzKCdsb2NhdGlvbicpKSB7CiAgICAgIGlmIChyZWRpcmVjdHMgPT09IDUpIHRocm93IG5ldyBFcnJvcignVG9vIG1hbnkgcmVkaXJlY3RzJyk7CiAgICAgIG5leHRVcmwgPSBuZXcgVVJMKHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdsb2NhdGlvbicpLCBuZXh0VXJsKS5ocmVmOwogICAgICBjb250aW51ZTsKICAgIH0KICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDIwMCkgdGhyb3cgbmV3IEVycm9yKGBSZXF1ZXN0IGZhaWxlZCB3aXRoIEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9YCk7CiAgICByZXR1cm4gcmVzcG9uc2U7CiAgfQogIHRocm93IG5ldyBFcnJvcignVG9vIG1hbnkgcmVkaXJlY3RzJyk7Cn0KCmZ1bmN0aW9uIHNhZmVBcmNoaXZlUGF0aChuYW1lKSB7CiAgaWYgKCFuYW1lIHx8IG5hbWUuc3RhcnRzV2l0aCgnLycpIHx8IG5hbWUuc3RhcnRzV2l0aCgnXFwnKSB8fCAvXltBLVphLXpdOltcXC9dLy50ZXN0KG5hbWUpKSByZXR1cm4gZmFsc2U7CiAgcmV0dXJuICFuYW1lLnNwbGl0KC9bXFwvXS8pLmluY2x1ZGVzKCcuLicpOwp9CgpleHBvcnQgZnVuY3Rpb24gc2VsZWN0UmlwZ3JlcEFzc2V0KHBsYXRmb3JtLCBhcmNoKSB7CiAgY29uc3Qgc2VsZWN0ZWQgPSBSSVBHUkVQX0FTU0VUU1tgJHtwbGF0Zm9ybX0tJHthcmNofWBdOwogIGlmICghc2VsZWN0ZWQpIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgcmlwZ3JlcCBwbGF0Zm9ybTogJHtwbGF0Zm9ybX0tJHthcmNofWApOwogIGNvbnN0IFtuYW1lLCBzaGEyNTZdID0gc2VsZWN0ZWQ7CiAgY29uc3QgZGlyZWN0b3J5ID0gbmFtZS5yZXBsYWNlKC9cLig/OnRhclwuZ3p8emlwKSQvLCAnJyk7CiAgcmV0dXJuIHsgbmFtZSwgc2hhMjU2LCBlbnRyeTogYCR7ZGlyZWN0b3J5fS8ke3BsYXRmb3JtID09PSAnd2luMzInID8gJ3JnLmV4ZScgOiAncmcnfWAgfTsKfQoKZnVuY3Rpb24gY3JjMzIoYnl0ZXMpIHsKICBsZXQgY3JjID0gMHhmZmZmZmZmZjsKICBmb3IgKGNvbnN0IGJ5dGUgb2YgYnl0ZXMpIHsKICAgIGNyYyBePSBieXRlOwogICAgZm9yIChsZXQgYml0ID0gMDsgYml0IDwgODsgYml0KyspIGNyYyA9IChjcmMgPj4+IDEpIF4gKDB4ZWRiODgzMjAgJiAtKGNyYyAmIDEpKTsKICB9CiAgcmV0dXJuIChjcmMgXiAweGZmZmZmZmZmKSA+Pj4gMDsKfQoKZnVuY3Rpb24gY2hlY2tlZFJhbmdlKHN0YXJ0LCBzaXplLCBsaW1pdCwgbGFiZWwpIHsKICBpZiAoIU51bWJlci5pc1NhZmVJbnRlZ2VyKHN0YXJ0KSB8fCAhTnVtYmVyLmlzU2FmZUludGVnZXIoc2l6ZSkgfHwgc3RhcnQgPCAwIHx8IHNpemUgPCAwIHx8IHN0YXJ0ID4gbGltaXQgfHwgc2l6ZSA+IGxpbWl0IC0gc3RhcnQpIHsKICAgIHRocm93IG5ldyBFcnJvcihgWklQICR7bGFiZWx9IGlzIG91dCBvZiBib3VuZHNgKTsKICB9CiAgcmV0dXJuIHN0YXJ0ICsgc2l6ZTsKfQoKYXN5bmMgZnVuY3Rpb24gZXh0cmFjdFppcChieXRlcywgZXhwZWN0ZWRFbnRyeSkgewogIGlmIChieXRlcy5sZW5ndGggPCAyMikgdGhyb3cgbmV3IEVycm9yKCdaSVAgZW5kIG9mIGNlbnRyYWwgZGlyZWN0b3J5IGlzIG1pc3NpbmcnKTsKICBjb25zdCB2aWV3ID0gbmV3IERhdGFWaWV3KGJ5dGVzLmJ1ZmZlciwgYnl0ZXMuYnl0ZU9mZnNldCwgYnl0ZXMuYnl0ZUxlbmd0aCk7CiAgbGV0IGVvY2QgPSAtMTsKICBjb25zdCBzZWFyY2hTdGFydCA9IE1hdGgubWF4KDAsIGJ5dGVzLmxlbmd0aCAtIDIyIC0gMHhmZmZmKTsKICBmb3IgKGxldCBvZmZzZXQgPSBieXRlcy5sZW5ndGggLSAyMjsgb2Zmc2V0ID49IHNlYXJjaFN0YXJ0OyBvZmZzZXQtLSkgewogICAgaWYgKHZpZXcuZ2V0VWludDMyKG9mZnNldCwgdHJ1ZSkgPT09IDB4MDYwNTRiNTApIHsKICAgICAgY29uc3QgY29tbWVudExlbmd0aCA9IHZpZXcuZ2V0VWludDE2KG9mZnNldCArIDIwLCB0cnVlKTsKICAgICAgaWYgKG9mZnNldCArIDIyICsgY29tbWVudExlbmd0aCA9PT0gYnl0ZXMubGVuZ3RoKSB7IGVvY2QgPSBvZmZzZXQ7IGJyZWFrOyB9CiAgICB9CiAgfQogIGlmIChlb2NkIDwgMCkgdGhyb3cgbmV3IEVycm9yKCdaSVAgZW5kIG9mIGNlbnRyYWwgZGlyZWN0b3J5IGlzIG1pc3Npbmcgb3IgbWFsZm9ybWVkJyk7CiAgaWYgKHZpZXcuZ2V0VWludDE2KGVvY2QgKyA0LCB0cnVlKSAhPT0gMCB8fCB2aWV3LmdldFVpbnQxNihlb2NkICsgNiwgdHJ1ZSkgIT09IDApIHRocm93IG5ldyBFcnJvcignTXVsdGktZGlzayBaSVAgYXJjaGl2ZXMgYXJlIHVuc3VwcG9ydGVkJyk7CiAgY29uc3QgZW50cmllcyA9IHZpZXcuZ2V0VWludDE2KGVvY2QgKyAxMCwgdHJ1ZSk7CiAgaWYgKGVudHJpZXMgIT09IHZpZXcuZ2V0VWludDE2KGVvY2QgKyA4LCB0cnVlKSB8fCBlbnRyaWVzID09PSAweGZmZmYpIHRocm93IG5ldyBFcnJvcignWklQIGNlbnRyYWwgZGlyZWN0b3J5IGVudHJ5IGNvdW50IGlzIGludmFsaWQnKTsKICBjb25zdCBjZW50cmFsU2l6ZSA9IHZpZXcuZ2V0VWludDMyKGVvY2QgKyAxMiwgdHJ1ZSk7CiAgY29uc3QgY2VudHJhbE9mZnNldCA9IHZpZXcuZ2V0VWludDMyKGVvY2QgKyAxNiwgdHJ1ZSk7CiAgY29uc3QgY2VudHJhbEVuZCA9IGNoZWNrZWRSYW5nZShjZW50cmFsT2Zmc2V0LCBjZW50cmFsU2l6ZSwgZW9jZCwgJ2NlbnRyYWwgZGlyZWN0b3J5Jyk7CiAgbGV0IGN1cnNvciA9IGNlbnRyYWxPZmZzZXQ7CiAgbGV0IHNlbGVjdGVkID0gbnVsbDsKICBjb25zdCBkZWNvZGVyID0gbmV3IFRleHREZWNvZGVyKCd1dGYtOCcsIHsgZmF0YWw6IHRydWUgfSk7CiAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGVudHJpZXM7IGluZGV4KyspIHsKICAgIGNoZWNrZWRSYW5nZShjdXJzb3IsIDQ2LCBjZW50cmFsRW5kLCAnY2VudHJhbCBlbnRyeSBoZWFkZXInKTsKICAgIGlmICh2aWV3LmdldFVpbnQzMihjdXJzb3IsIHRydWUpICE9PSAweDAyMDE0YjUwKSB0aHJvdyBuZXcgRXJyb3IoJ1pJUCBjZW50cmFsIGRpcmVjdG9yeSBzaWduYXR1cmUgaXMgaW52YWxpZCcpOwogICAgY29uc3QgZmxhZ3MgPSB2aWV3LmdldFVpbnQxNihjdXJzb3IgKyA4LCB0cnVlKTsKICAgIGNvbnN0IG1ldGhvZCA9IHZpZXcuZ2V0VWludDE2KGN1cnNvciArIDEwLCB0cnVlKTsKICAgIGNvbnN0IGV4cGVjdGVkQ3JjID0gdmlldy5nZXRVaW50MzIoY3Vyc29yICsgMTYsIHRydWUpOwogICAgY29uc3QgY29tcHJlc3NlZFNpemUgPSB2aWV3LmdldFVpbnQzMihjdXJzb3IgKyAyMCwgdHJ1ZSk7CiAgICBjb25zdCB1bmNvbXByZXNzZWRTaXplID0gdmlldy5nZXRVaW50MzIoY3Vyc29yICsgMjQsIHRydWUpOwogICAgY29uc3QgbmFtZUxlbmd0aCA9IHZpZXcuZ2V0VWludDE2KGN1cnNvciArIDI4LCB0cnVlKTsKICAgIGNvbnN0IGV4dHJhTGVuZ3RoID0gdmlldy5nZXRVaW50MTYoY3Vyc29yICsgMzAsIHRydWUpOwogICAgY29uc3QgY29tbWVudExlbmd0aCA9IHZpZXcuZ2V0VWludDE2KGN1cnNvciArIDMyLCB0cnVlKTsKICAgIGNvbnN0IGxvY2FsT2Zmc2V0ID0gdmlldy5nZXRVaW50MzIoY3Vyc29yICsgNDIsIHRydWUpOwogICAgaWYgKGZsYWdzICYgMHg0MSkgdGhyb3cgbmV3IEVycm9yKCdFbmNyeXB0ZWQgWklQIGVudHJpZXMgYXJlIHVuc3VwcG9ydGVkJyk7CiAgICBpZiAobWV0aG9kICE9PSAwICYmIG1ldGhvZCAhPT0gOCkgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBaSVAgY29tcHJlc3Npb24gbWV0aG9kOiAke21ldGhvZH1gKTsKICAgIGlmIChjb21wcmVzc2VkU2l6ZSA9PT0gMHhmZmZmZmZmZiB8fCB1bmNvbXByZXNzZWRTaXplID09PSAweGZmZmZmZmZmIHx8IGxvY2FsT2Zmc2V0ID09PSAweGZmZmZmZmZmKSB0aHJvdyBuZXcgRXJyb3IoJ1pJUDY0IGVudHJpZXMgYXJlIHVuc3VwcG9ydGVkJyk7CiAgICBpZiAodW5jb21wcmVzc2VkU2l6ZSA+IE1BWF9CSU5BUllfQllURVMpIHRocm93IG5ldyBFcnJvcignWklQIGV4ZWN1dGFibGUgc2l6ZSBleGNlZWRzIHRoZSBzYWZldHkgbGltaXQnKTsKICAgIGNvbnN0IHJlY29yZEVuZCA9IGNoZWNrZWRSYW5nZShjdXJzb3IgKyA0NiwgbmFtZUxlbmd0aCArIGV4dHJhTGVuZ3RoICsgY29tbWVudExlbmd0aCwgY2VudHJhbEVuZCwgJ2NlbnRyYWwgZW50cnknKTsKICAgIGxldCBuYW1lOwogICAgdHJ5IHsgbmFtZSA9IGRlY29kZXIuZGVjb2RlKGJ5dGVzLnN1YmFycmF5KGN1cnNvciArIDQ2LCBjdXJzb3IgKyA0NiArIG5hbWVMZW5ndGgpKTsgfQogICAgY2F0Y2ggeyB0aHJvdyBuZXcgRXJyb3IoJ1pJUCBlbnRyeSBuYW1lIGlzIG5vdCB2YWxpZCBVVEYtOCcpOyB9CiAgICBpZiAoIXNhZmVBcmNoaXZlUGF0aChuYW1lKSkgdGhyb3cgbmV3IEVycm9yKGBVbnNhZmUgWklQIHBhdGg6ICR7bmFtZX1gKTsKICAgIGlmIChuYW1lID09PSBleHBlY3RlZEVudHJ5KSB7CiAgICAgIGlmIChzZWxlY3RlZCkgdGhyb3cgbmV3IEVycm9yKGBaSVAgY29udGFpbnMgZHVwbGljYXRlIGV4YWN0IGVudHJ5OiAke2V4cGVjdGVkRW50cnl9YCk7CiAgICAgIHNlbGVjdGVkID0geyBmbGFncywgbWV0aG9kLCBleHBlY3RlZENyYywgY29tcHJlc3NlZFNpemUsIHVuY29tcHJlc3NlZFNpemUsIGxvY2FsT2Zmc2V0LCBuYW1lIH07CiAgICB9CiAgICBjdXJzb3IgPSByZWNvcmRFbmQ7CiAgfQogIGlmIChjdXJzb3IgIT09IGNlbnRyYWxFbmQpIHRocm93IG5ldyBFcnJvcignWklQIGNlbnRyYWwgZGlyZWN0b3J5IHNpemUgZG9lcyBub3QgbWF0Y2ggaXRzIGVudHJpZXMnKTsKICBpZiAoIXNlbGVjdGVkKSB0aHJvdyBuZXcgRXJyb3IoYFpJUCBpcyBtaXNzaW5nIGV4YWN0IGVudHJ5OiAke2V4cGVjdGVkRW50cnl9YCk7CgogIGNoZWNrZWRSYW5nZShzZWxlY3RlZC5sb2NhbE9mZnNldCwgMzAsIGNlbnRyYWxPZmZzZXQsICdsb2NhbCBoZWFkZXInKTsKICBpZiAodmlldy5nZXRVaW50MzIoc2VsZWN0ZWQubG9jYWxPZmZzZXQsIHRydWUpICE9PSAweDA0MDM0YjUwKSB0aHJvdyBuZXcgRXJyb3IoJ1pJUCBsb2NhbCBoZWFkZXIgc2lnbmF0dXJlIGlzIGludmFsaWQnKTsKICBjb25zdCBsb2NhbEZsYWdzID0gdmlldy5nZXRVaW50MTYoc2VsZWN0ZWQubG9jYWxPZmZzZXQgKyA2LCB0cnVlKTsKICBjb25zdCBsb2NhbE1ldGhvZCA9IHZpZXcuZ2V0VWludDE2KHNlbGVjdGVkLmxvY2FsT2Zmc2V0ICsgOCwgdHJ1ZSk7CiAgY29uc3QgbG9jYWxDcmMgPSB2aWV3LmdldFVpbnQzMihzZWxlY3RlZC5sb2NhbE9mZnNldCArIDE0LCB0cnVlKTsKICBjb25zdCBsb2NhbENvbXByZXNzZWRTaXplID0gdmlldy5nZXRVaW50MzIoc2VsZWN0ZWQubG9jYWxPZmZzZXQgKyAxOCwgdHJ1ZSk7CiAgY29uc3QgbG9jYWxVbmNvbXByZXNzZWRTaXplID0gdmlldy5nZXRVaW50MzIoc2VsZWN0ZWQubG9jYWxPZmZzZXQgKyAyMiwgdHJ1ZSk7CiAgY29uc3QgbG9jYWxOYW1lTGVuZ3RoID0gdmlldy5nZXRVaW50MTYoc2VsZWN0ZWQubG9jYWxPZmZzZXQgKyAyNiwgdHJ1ZSk7CiAgY29uc3QgbG9jYWxFeHRyYUxlbmd0aCA9IHZpZXcuZ2V0VWludDE2KHNlbGVjdGVkLmxvY2FsT2Zmc2V0ICsgMjgsIHRydWUpOwogIGlmIChsb2NhbEZsYWdzICE9PSBzZWxlY3RlZC5mbGFncyB8fCBsb2NhbE1ldGhvZCAhPT0gc2VsZWN0ZWQubWV0aG9kKSB0aHJvdyBuZXcgRXJyb3IoJ1pJUCBsb2NhbCBoZWFkZXIgZGlzYWdyZWVzIHdpdGggY2VudHJhbCBkaXJlY3RvcnknKTsKICBpZiAoIShzZWxlY3RlZC5mbGFncyAmIDgpICYmIChsb2NhbENyYyAhPT0gc2VsZWN0ZWQuZXhwZWN0ZWRDcmMgfHwgbG9jYWxDb21wcmVzc2VkU2l6ZSAhPT0gc2VsZWN0ZWQuY29tcHJlc3NlZFNpemUgfHwgbG9jYWxVbmNvbXByZXNzZWRTaXplICE9PSBzZWxlY3RlZC51bmNvbXByZXNzZWRTaXplKSkgewogICAgdGhyb3cgbmV3IEVycm9yKCdaSVAgbG9jYWwgaGVhZGVyIGRpc2FncmVlcyB3aXRoIGNlbnRyYWwgZGlyZWN0b3J5Jyk7CiAgfQogIGNvbnN0IGRhdGFTdGFydCA9IGNoZWNrZWRSYW5nZShzZWxlY3RlZC5sb2NhbE9mZnNldCArIDMwLCBsb2NhbE5hbWVMZW5ndGggKyBsb2NhbEV4dHJhTGVuZ3RoLCBjZW50cmFsT2Zmc2V0LCAnbG9jYWwgbmFtZSBhbmQgZXh0cmEgZGF0YScpOwogIGNvbnN0IGRhdGFFbmQgPSBjaGVja2VkUmFuZ2UoZGF0YVN0YXJ0LCBzZWxlY3RlZC5jb21wcmVzc2VkU2l6ZSwgY2VudHJhbE9mZnNldCwgJ2NvbXByZXNzZWQgZGF0YScpOwogIGxldCBsb2NhbE5hbWU7CiAgdHJ5IHsgbG9jYWxOYW1lID0gZGVjb2Rlci5kZWNvZGUoYnl0ZXMuc3ViYXJyYXkoc2VsZWN0ZWQubG9jYWxPZmZzZXQgKyAzMCwgc2VsZWN0ZWQubG9jYWxPZmZzZXQgKyAzMCArIGxvY2FsTmFtZUxlbmd0aCkpOyB9CiAgY2F0Y2ggeyB0aHJvdyBuZXcgRXJyb3IoJ1pJUCBsb2NhbCBlbnRyeSBuYW1lIGlzIG5vdCB2YWxpZCBVVEYtOCcpOyB9CiAgaWYgKGxvY2FsTmFtZSAhPT0gc2VsZWN0ZWQubmFtZSkgdGhyb3cgbmV3IEVycm9yKCdaSVAgbG9jYWwgZW50cnkgbmFtZSBkaXNhZ3JlZXMgd2l0aCBjZW50cmFsIGRpcmVjdG9yeScpOwogIGNvbnN0IGNvbXByZXNzZWQgPSBieXRlcy5zdWJhcnJheShkYXRhU3RhcnQsIGRhdGFFbmQpOwogIGxldCBvdXRwdXQ7CiAgdHJ5IHsKICAgIG91dHB1dCA9IHNlbGVjdGVkLm1ldGhvZCA9PT0gMCA/IG5ldyBVaW50OEFycmF5KGNvbXByZXNzZWQpIDogbmV3IFVpbnQ4QXJyYXkoQnVuLmluZmxhdGVTeW5jKGNvbXByZXNzZWQpKTsKICB9IGNhdGNoIHsKICAgIHRocm93IG5ldyBFcnJvcignWklQIGRlZmxhdGUgc3RyZWFtIGlzIG1hbGZvcm1lZCcpOwogIH0KICBpZiAob3V0cHV0Lmxlbmd0aCAhPT0gc2VsZWN0ZWQudW5jb21wcmVzc2VkU2l6ZSkgdGhyb3cgbmV3IEVycm9yKCdaSVAgdW5jb21wcmVzc2VkIHNpemUgbWlzbWF0Y2gnKTsKICBpZiAoY3JjMzIob3V0cHV0KSAhPT0gc2VsZWN0ZWQuZXhwZWN0ZWRDcmMpIHRocm93IG5ldyBFcnJvcignWklQIENSQy0zMiBtaXNtYXRjaCcpOwogIHJldHVybiBvdXRwdXQ7Cn0KCmV4cG9ydCBhc3luYyBmdW5jdGlvbiBleHRyYWN0UmlwZ3JlcChieXRlcywgYXNzZXQpIHsKICBpZiAoIShieXRlcyBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpKSB0aHJvdyBuZXcgRXJyb3IoJ3JpcGdyZXAgYXJjaGl2ZSBtdXN0IGJlIGJ5dGVzJyk7CiAgaWYgKCFhc3NldCB8fCB0eXBlb2YgYXNzZXQuZW50cnkgIT09ICdzdHJpbmcnIHx8ICFzYWZlQXJjaGl2ZVBhdGgoYXNzZXQuZW50cnkpKSB0aHJvdyBuZXcgRXJyb3IoJ3JpcGdyZXAgYXNzZXQgZW50cnkgaXMgaW52YWxpZCcpOwogIGlmIChhc3NldC5uYW1lLmVuZHNXaXRoKCcuemlwJykpIHJldHVybiBleHRyYWN0WmlwKGJ5dGVzLCBhc3NldC5lbnRyeSk7CiAgaWYgKCFhc3NldC5uYW1lLmVuZHNXaXRoKCcudGFyLmd6JykpIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgcmlwZ3JlcCBhcmNoaXZlOiAke2Fzc2V0Lm5hbWV9YCk7CiAgbGV0IGZpbGVzOwogIHRyeSB7IGZpbGVzID0gYXdhaXQgbmV3IEJ1bi5BcmNoaXZlKGJ5dGVzKS5maWxlcygpOyB9CiAgY2F0Y2ggeyB0aHJvdyBuZXcgRXJyb3IoJ3JpcGdyZXAgdGFyLmd6IGFyY2hpdmUgaXMgbWFsZm9ybWVkJyk7IH0KICBmb3IgKGNvbnN0IG5hbWUgb2YgZmlsZXMua2V5cygpKSB7CiAgICBpZiAoIXNhZmVBcmNoaXZlUGF0aChuYW1lKSkgdGhyb3cgbmV3IEVycm9yKGBVbnNhZmUgYXJjaGl2ZSBwYXRoOiAke25hbWV9YCk7CiAgfQogIGNvbnN0IGZpbGUgPSBmaWxlcy5nZXQoYXNzZXQuZW50cnkpOwogIGlmICghZmlsZSkgdGhyb3cgbmV3IEVycm9yKGB0YXIuZ3ogaXMgbWlzc2luZyBleGFjdCBlbnRyeTogJHthc3NldC5lbnRyeX1gKTsKICBpZiAoZmlsZS5zaXplID4gTUFYX0JJTkFSWV9CWVRFUykgdGhyb3cgbmV3IEVycm9yKCdyaXBncmVwIGV4ZWN1dGFibGUgc2l6ZSBleGNlZWRzIHRoZSBzYWZldHkgbGltaXQnKTsKICByZXR1cm4gbmV3IFVpbnQ4QXJyYXkoYXdhaXQgZmlsZS5hcnJheUJ1ZmZlcigpKTsKfQoKZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlUmlwZ3JlcFZlcnNpb24ocGF0aCwgc3Bhd25JbXBsID0gQnVuLnNwYXduU3luYykgewogIGNvbnN0IHJlc3VsdCA9IHNwYXduSW1wbChbcGF0aCwgJy0tdmVyc2lvbiddLCB7IHN0ZG91dDogJ3BpcGUnLCBzdGRlcnI6ICdwaXBlJyB9KTsKICBjb25zdCBvdXRwdXQgPSB0eXBlb2YgcmVzdWx0LnN0ZG91dCA9PT0gJ3N0cmluZycgPyByZXN1bHQuc3Rkb3V0IDogQnVmZmVyLmZyb20ocmVzdWx0LnN0ZG91dCB8fCBbXSkudG9TdHJpbmcoKTsKICBpZiAocmVzdWx0LmV4aXRDb2RlICE9PSAwIHx8ICEvXnJpcGdyZXAgMTVcLjJcLjAoPzogXChyZXYgWzAtOUEtRmEtZl0rXCkpPyg/OlxyP1xufCQpLy50ZXN0KG91dHB1dCkpIHsKICAgIHRocm93IG5ldyBFcnJvcihgcmlwZ3JlcCAke1JJUEdSRVBfVkVSU0lPTn0gdmVyc2lvbiBzbW9rZSBmYWlsZWRgKTsKICB9Cn0KCmZ1bmN0aW9uIGFzc2VydENvbnRhaW5lZE1hbmFnZWRQYXRoKHJvb3QsIHBhdGgpIHsKICBjb25zdCBjaGlsZCA9IHJlbGF0aXZlKHJlc29sdmUocm9vdCksIHJlc29sdmUocGF0aCkpOwogIGlmICghY2hpbGQgfHwgY2hpbGQgPT09ICcuLicgfHwgY2hpbGQuc3RhcnRzV2l0aChgLi4ke3NlcH1gKSB8fCBpc0Fic29sdXRlKGNoaWxkKSkgewogICAgdGhyb3cgbmV3IEVycm9yKGBNYW5hZ2VkIHJpcGdyZXAgcGF0aCBlc2NhcGVkIGl0cyByb290OiAke3BhdGh9YCk7CiAgfQp9CgpmdW5jdGlvbiBhc3NlcnROb3RTeW1ib2xpY0xpbmsocGF0aCwgZnNPcHMgPSB7fSkgewogIGNvbnN0IGluc3BlY3QgPSBmc09wcy5sc3RhdFN5bmMgfHwgbHN0YXRTeW5jOwogIHRyeSB7CiAgICBpZiAoaW5zcGVjdChwYXRoKS5pc1N5bWJvbGljTGluaygpKSB0aHJvdyBuZXcgRXJyb3IoYE1hbmFnZWQgcmlwZ3JlcCBwYXRoIG11c3Qgbm90IGJlIGEgc3ltYm9saWMgbGluazogJHtwYXRofWApOwogIH0gY2F0Y2ggKGVycm9yKSB7CiAgICBpZiAoZXJyb3I/LmNvZGUgIT09ICdFTk9FTlQnKSB0aHJvdyBlcnJvcjsKICB9Cn0KCmZ1bmN0aW9uIGlzVmFsaWRSaXBncmVwQ2FuZGlkYXRlKHBhdGgsIGZzT3BzLCBzcGF3bkltcGwpIHsKICBpZiAoIWZzT3BzLmV4aXN0c1N5bmMocGF0aCkpIHJldHVybiBmYWxzZTsKICB0cnkgewogICAgdmFsaWRhdGVSaXBncmVwVmVyc2lvbihwYXRoLCBzcGF3bkltcGwpOwogICAgcmV0dXJuIHRydWU7CiAgfSBjYXRjaCB7CiAgICByZXR1cm4gZmFsc2U7CiAgfQp9CgpleHBvcnQgZnVuY3Rpb24gcmVwbGFjZU1hbmFnZWRCaW5hcnkoc3RhZ2VkLCB0YXJnZXQsIGZzT3BzID0geyBleGlzdHNTeW5jLCBsc3RhdFN5bmMsIHJlbmFtZVN5bmMsIHJtU3luYyB9LCBzcGF3bkltcGwgPSBCdW4uc3Bhd25TeW5jKSB7CiAgY29uc3QgYmFja3VwID0gYCR7dGFyZ2V0fS5wcmV2aW91c2A7CiAgY29uc3QgZGlzcGxhY2VkID0gYCR7dGFyZ2V0fS4ke3Byb2Nlc3MucGlkfS5jdXJyZW50YDsKICBmb3IgKGNvbnN0IHBhdGggb2YgW3N0YWdlZCwgdGFyZ2V0LCBiYWNrdXAsIGRpc3BsYWNlZF0pIGFzc2VydE5vdFN5bWJvbGljTGluayhwYXRoLCBmc09wcyk7CiAgaWYgKGZzT3BzLmV4aXN0c1N5bmMoZGlzcGxhY2VkKSkgdGhyb3cgbmV3IEVycm9yKGBNYW5hZ2VkIHJpcGdyZXAgdHJhbnNhY3Rpb24gcGF0aCBhbHJlYWR5IGV4aXN0czogJHtkaXNwbGFjZWR9YCk7CiAgY29uc3QgY3VycmVudFZhbGlkID0gaXNWYWxpZFJpcGdyZXBDYW5kaWRhdGUodGFyZ2V0LCBmc09wcywgc3Bhd25JbXBsKTsKICBjb25zdCBiYWNrdXBWYWxpZCA9IGlzVmFsaWRSaXBncmVwQ2FuZGlkYXRlKGJhY2t1cCwgZnNPcHMsIHNwYXduSW1wbCk7CiAgbGV0IG1vdmVkQ3VycmVudCA9IGZhbHNlOwogIHRyeSB7CiAgICBpZiAoZnNPcHMuZXhpc3RzU3luYyh0YXJnZXQpKSB7CiAgICAgIGZzT3BzLnJlbmFtZVN5bmModGFyZ2V0LCBkaXNwbGFjZWQpOwogICAgICBtb3ZlZEN1cnJlbnQgPSB0cnVlOwogICAgfQogICAgdHJ5IHsKICAgICAgZnNPcHMucmVuYW1lU3luYyhzdGFnZWQsIHRhcmdldCk7CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBpZiAoZnNPcHMuZXhpc3RzU3luYyh0YXJnZXQpKSBmc09wcy5ybVN5bmModGFyZ2V0LCB7IGZvcmNlOiB0cnVlIH0pOwogICAgICBpZiAoY3VycmVudFZhbGlkICYmIG1vdmVkQ3VycmVudCAmJiBmc09wcy5leGlzdHNTeW5jKGRpc3BsYWNlZCkpIGZzT3BzLnJlbmFtZVN5bmMoZGlzcGxhY2VkLCB0YXJnZXQpOwogICAgICBlbHNlIGlmIChiYWNrdXBWYWxpZCAmJiBmc09wcy5leGlzdHNTeW5jKGJhY2t1cCkpIGZzT3BzLnJlbmFtZVN5bmMoYmFja3VwLCB0YXJnZXQpOwogICAgICBpZiAoZnNPcHMuZXhpc3RzU3luYyhiYWNrdXApKSBmc09wcy5ybVN5bmMoYmFja3VwLCB7IGZvcmNlOiB0cnVlIH0pOwogICAgICBpZiAoZnNPcHMuZXhpc3RzU3luYyhkaXNwbGFjZWQpKSBmc09wcy5ybVN5bmMoZGlzcGxhY2VkLCB7IGZvcmNlOiB0cnVlIH0pOwogICAgICB0aHJvdyBlcnJvcjsKICAgIH0KICAgIGZzT3BzLnJtU3luYyhiYWNrdXAsIHsgZm9yY2U6IHRydWUgfSk7CiAgICBpZiAoZnNPcHMuZXhpc3RzU3luYyhkaXNwbGFjZWQpKSBmc09wcy5ybVN5bmMoZGlzcGxhY2VkLCB7IGZvcmNlOiB0cnVlIH0pOwogIH0gZmluYWxseSB7CiAgICBpZiAoZnNPcHMuZXhpc3RzU3luYyhzdGFnZWQpKSBmc09wcy5ybVN5bmMoc3RhZ2VkLCB7IGZvcmNlOiB0cnVlIH0pOwogIH0KfQoKZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJpcGdyZXAocm9vdCwgb3B0aW9ucyA9IHt9KSB7CiAgaWYgKHR5cGVvZiByb290ICE9PSAnc3RyaW5nJyB8fCAhcm9vdC50cmltKCkpIHRocm93IG5ldyBFcnJvcignbWFuYWdlZCByaXBncmVwIHJvb3QgaXMgcmVxdWlyZWQnKTsKICBjb25zdCBwbGF0Zm9ybSA9IG9wdGlvbnMucGxhdGZvcm0gfHwgcHJvY2Vzcy5wbGF0Zm9ybTsKICBjb25zdCBhcmNoID0gb3B0aW9ucy5hcmNoIHx8IHByb2Nlc3MuYXJjaDsKICBjb25zdCBhc3NldCA9IHNlbGVjdFJpcGdyZXBBc3NldChwbGF0Zm9ybSwgYXJjaCk7CiAgY29uc3QgdmVuZG9yRGlyID0gam9pbihyb290LCAndmVuZG9yJyk7CiAgY29uc3QgcmlwZ3JlcERpciA9IGpvaW4odmVuZG9yRGlyLCAncmlwZ3JlcCcpOwogIGNvbnN0IGJpbkRpciA9IGpvaW4ocmlwZ3JlcERpciwgJ2JpbicpOwogIGNvbnN0IHRhcmdldCA9IGpvaW4oYmluRGlyLCBwbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/ICdyZy5leGUnIDogJ3JnJyk7CiAgY29uc3Qgc3RhZ2VkID0gYCR7dGFyZ2V0fS4ke3Byb2Nlc3MucGlkfS5zdGFnZWRgOwogIGNvbnN0IGJhY2t1cCA9IGAke3RhcmdldH0ucHJldmlvdXNgOwogIGNvbnN0IGRpc3BsYWNlZCA9IGAke3RhcmdldH0uJHtwcm9jZXNzLnBpZH0uY3VycmVudGA7CiAgY29uc3Qgcm9vdFBhdGggPSByZXNvbHZlKHJvb3QpOwogIGNvbnN0IG1hbmFnZWRQYXRocyA9IFt2ZW5kb3JEaXIsIHJpcGdyZXBEaXIsIGJpbkRpciwgdGFyZ2V0LCBzdGFnZWQsIGJhY2t1cCwgZGlzcGxhY2VkXTsKICBmb3IgKGNvbnN0IHBhdGggb2YgbWFuYWdlZFBhdGhzKSB7CiAgICBhc3NlcnRDb250YWluZWRNYW5hZ2VkUGF0aChyb290UGF0aCwgcGF0aCk7CiAgICBhc3NlcnROb3RTeW1ib2xpY0xpbmsocGF0aCwgb3B0aW9ucy5mc09wcyk7CiAgfQogIGNvbnN0IHNwYXduSW1wbCA9IG9wdGlvbnMuc3Bhd25JbXBsIHx8IEJ1bi5zcGF3blN5bmM7CiAgaWYgKGV4aXN0c1N5bmModGFyZ2V0KSkgewogICAgdHJ5IHsgdmFsaWRhdGVSaXBncmVwVmVyc2lvbih0YXJnZXQsIHNwYXduSW1wbCk7IHJldHVybiB0YXJnZXQ7IH0KICAgIGNhdGNoIHt9CiAgfQoKICBjb25zdCBmZXRjaEltcGwgPSBvcHRpb25zLmZldGNoSW1wbCB8fCBmZXRjaDsKICBjb25zdCBlbnYgPSBvcHRpb25zLmVudiB8fCBwcm9jZXNzLmVudjsKICBjb25zdCB1cmwgPSBgaHR0cHM6Ly9naXRodWIuY29tL0J1cm50U3VzaGkvcmlwZ3JlcC9yZWxlYXNlcy9kb3dubG9hZC8ke1JJUEdSRVBfVkVSU0lPTn0vJHthc3NldC5uYW1lfWA7CiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaFdpdGhQcm94eSh1cmwsIHt9LCBlbnYsIGZldGNoSW1wbCk7CiAgY29uc3QgYXJjaGl2ZSA9IG5ldyBVaW50OEFycmF5KGF3YWl0IHJlc3BvbnNlLmFycmF5QnVmZmVyKCkpOwogIGNvbnN0IGFjdHVhbCA9IG5ldyBCdW4uQ3J5cHRvSGFzaGVyKCdzaGEyNTYnKS51cGRhdGUoYXJjaGl2ZSkuZGlnZXN0KCdoZXgnKTsKICBpZiAoYWN0dWFsICE9PSBhc3NldC5zaGEyNTYpIHRocm93IG5ldyBFcnJvcihgU0hBLTI1NiBtaXNtYXRjaCBmb3IgJHthc3NldC5uYW1lfWApOwogIGNvbnN0IGV4ZWN1dGFibGUgPSBhd2FpdCBleHRyYWN0UmlwZ3JlcChhcmNoaXZlLCBhc3NldCk7CgogIG1rZGlyU3luYyhiaW5EaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pOwogIGZvciAoY29uc3QgcGF0aCBvZiBtYW5hZ2VkUGF0aHMpIGFzc2VydE5vdFN5bWJvbGljTGluayhwYXRoLCBvcHRpb25zLmZzT3BzKTsKICBybVN5bmMoc3RhZ2VkLCB7IGZvcmNlOiB0cnVlIH0pOwogIHRyeSB7CiAgICBhd2FpdCBCdW4ud3JpdGUoc3RhZ2VkLCBleGVjdXRhYmxlKTsKICAgIGlmIChwbGF0Zm9ybSAhPT0gJ3dpbjMyJykgY2htb2RTeW5jKHN0YWdlZCwgMG83NTUpOwogICAgdmFsaWRhdGVSaXBncmVwVmVyc2lvbihzdGFnZWQsIHNwYXduSW1wbCk7CiAgICByZXBsYWNlTWFuYWdlZEJpbmFyeShzdGFnZWQsIHRhcmdldCwgb3B0aW9ucy5mc09wcywgc3Bhd25JbXBsKTsKICAgIHJldHVybiB0YXJnZXQ7CiAgfSBmaW5hbGx5IHsKICAgIGFzc2VydE5vdFN5bWJvbGljTGluayhzdGFnZWQsIG9wdGlvbnMuZnNPcHMpOwogICAgaWYgKGV4aXN0c1N5bmMoc3RhZ2VkKSkgcm1TeW5jKHN0YWdlZCwgeyBmb3JjZTogdHJ1ZSB9KTsKICB9Cn0KCmlmIChpbXBvcnQubWV0YS5tYWluKSB7CiAgY29uc3Qgcm9vdCA9IHByb2Nlc3MuYXJndlsyXTsKICBjb25zdCB0YXJnZXQgPSBhd2FpdCBlbnN1cmVSaXBncmVwKHJvb3QpOwogIGNvbnNvbGUubG9nKGByaXBncmVwICR7UklQR1JFUF9WRVJTSU9OfTogJHt0YXJnZXR9YCk7Cn0K')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "install-ripgrep.mjs"), $InstallRipgrepBytes)

$ripgrepOutput = & $BunBin (Join-Path $ClawDir "install-ripgrep.mjs") $ClawDir 2>&1
if ($LASTEXITCODE -ne 0) {
    $ripgrepOutput | ForEach-Object { Write-Err "$_" }
    Write-Err "Failed to install ClawGod-managed ripgrep."
    exit 1
}
$ripgrepOutput | ForEach-Object { Write-OK "$_" }

# ─── Handle -NoUpgrade (skip download, re-patch only) ────────────────
if ($NoUpgrade) {
    New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
    New-Item -ItemType Directory -Force -Path $BinDir  | Out-Null
    $existingCjs = Join-Path $ClawDir "cli.original.cjs"
    $existingBak = "$existingCjs.bak"
    if (-not (Test-Path $existingCjs)) {
        Write-Err "-NoUpgrade requires an existing installation."
        Write-Err "Run a full install first (without -NoUpgrade)."
        exit 1
    }
    if (Test-Path $existingBak) {
        Copy-Item $existingBak $existingCjs -Force
        Write-OK "Restored clean cli.original.cjs from backup"
    }
    Write-OK "Skipping download (-NoUpgrade)"
} else {

# ─── Locate native Bun binary (cli.js source) ──────────────────────────
# Source: npm registry (@anthropic-ai/claude-code-win32-<arch>).
# Local binary detection is intentionally skipped — see policy note below.

New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir  | Out-Null
if (Install-ChromeFixScript) {
    Write-OK "Chrome fix helper installed (apply-claude-code-chrome-fix.ps1)"
} else {
    Write-Warn "Could not install Chrome fix helper; will try again after patching"
}

$NativeBin = $null
$NativeBinLabel = $null
$NativeBinTmpDir = $null

# Detect platform suffix
if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or $env:PROCESSOR_ARCHITEW6432 -eq "ARM64") {
    $arch = "arm64"
} else {
    $arch = "x64"
}
$platformSuffix = "win32-$arch"

# Detection policy: ALWAYS pull from the npm registry @latest.
#
# Earlier versions of this script also probed local install directories
# (versions/, claude.orig, npm-global, bun-global) before falling back to
# the registry. Every one of those is a stale-source trap: clawgod patches
# out `claude update`, so users never re-run the underlying installers,
# and those directories freeze at whatever version was on disk the day
# clawgod was first installed. `claude update` (which is now redirected
# here) would re-detect the frozen binary forever — never reaching the
# registry. See INCIDENT_LOG 2026-04-29 entry. The fix is to skip local
# detection entirely; the npm tarball is ~60-90 MB compressed, fetched
# once per upgrade.

# npm registry — pull the platform tarball directly via Bun.
if (-not $NativeBin) {
    $npmPkg = "@anthropic-ai/claude-code-$platformSuffix"
    Write-Dim "Fetching $npmPkg@$Version from npm registry ..."
    $NativeBinTmpDir = Join-Path $env:TEMP "clawgod-binary-$([Guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Force -Path $NativeBinTmpDir | Out-Null
    $fetchScript = Join-Path $NativeBinTmpDir "fetch-package.mjs"
    $FetchPackageBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCmltcG9ydCB7IGNobW9kU3luYywgbWtkaXJTeW5jIH0gZnJvbSAnbm9kZTpmcyc7CmltcG9ydCB7IGpvaW4gfSBmcm9tICdub2RlOnBhdGgnOwoKY29uc3QgTUlOX0JJTkFSWV9CWVRFUyA9IDEwICogMTAyNCAqIDEwMjQ7CgpmdW5jdGlvbiBub1Byb3h5UnVsZSh2YWx1ZSkgewogIGxldCBlbnRyeSA9IHZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpOwogIGlmIChlbnRyeSA9PT0gJyonKSByZXR1cm4geyBhbGw6IHRydWUgfTsKCiAgbGV0IGhvc3QgPSBlbnRyeTsKICBsZXQgcG9ydCA9ICcnOwogIGlmIChlbnRyeS5zdGFydHNXaXRoKCdbJykpIHsKICAgIGNvbnN0IGNsb3NlID0gZW50cnkuaW5kZXhPZignXScpOwogICAgaWYgKGNsb3NlID09PSAtMSkgcmV0dXJuIHsgaG9zdDogZW50cnksIHBvcnQgfTsKICAgIGhvc3QgPSBlbnRyeS5zbGljZSgxLCBjbG9zZSk7CiAgICBjb25zdCBzdWZmaXggPSBlbnRyeS5zbGljZShjbG9zZSArIDEpOwogICAgaWYgKC9eOlxkKyQvLnRlc3Qoc3VmZml4KSkgcG9ydCA9IHN1ZmZpeC5zbGljZSgxKTsKICAgIGVsc2UgaWYgKHN1ZmZpeCkgcmV0dXJuIHsgaG9zdDogZW50cnksIHBvcnQgfTsKICB9IGVsc2UgewogICAgY29uc3QgY29sb24gPSBlbnRyeS5sYXN0SW5kZXhPZignOicpOwogICAgaWYgKGNvbG9uID4gMCAmJiBjb2xvbiA9PT0gZW50cnkuaW5kZXhPZignOicpICYmIC9eXGQrJC8udGVzdChlbnRyeS5zbGljZShjb2xvbiArIDEpKSkgewogICAgICBob3N0ID0gZW50cnkuc2xpY2UoMCwgY29sb24pOwogICAgICBwb3J0ID0gZW50cnkuc2xpY2UoY29sb24gKyAxKTsKICAgIH0KICB9CiAgcmV0dXJuIHsgaG9zdDogaG9zdC5yZXBsYWNlKC9eXCpcLi8sICcuJyksIHBvcnQgfTsKfQoKZnVuY3Rpb24gYnlwYXNzZXNQcm94eSh1cmxWYWx1ZSwgZW52KSB7CiAgY29uc3QgcGFyc2VkID0gdHlwZW9mIHVybFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBVUkwodXJsVmFsdWUpIDogdXJsVmFsdWU7CiAgY29uc3QgZW50cmllcyA9IChlbnYuTk9fUFJPWFkgfHwgZW52Lm5vX3Byb3h5IHx8ICcnKS5zcGxpdCgnLCcpLmZpbHRlcih2YWx1ZSA9PiB2YWx1ZS50cmltKCkpOwogIGNvbnN0IGhvc3QgPSBwYXJzZWQuaG9zdG5hbWUudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9eXFt8XF0kL2csICcnKTsKICBjb25zdCBwb3J0ID0gcGFyc2VkLnBvcnQgfHwgKHBhcnNlZC5wcm90b2NvbCA9PT0gJ2h0dHBzOicgPyAnNDQzJyA6IHBhcnNlZC5wcm90b2NvbCA9PT0gJ2h0dHA6JyA/ICc4MCcgOiAnJyk7CiAgcmV0dXJuIGVudHJpZXMuc29tZShlbnRyeSA9PiB7CiAgICBjb25zdCBydWxlID0gbm9Qcm94eVJ1bGUoZW50cnkpOwogICAgaWYgKHJ1bGUuYWxsKSByZXR1cm4gdHJ1ZTsKICAgIGNvbnN0IGJhc2VIb3N0ID0gcnVsZS5ob3N0LnJlcGxhY2UoL15cLi8sICcnKTsKICAgIGNvbnN0IG1hdGNoZXNIb3N0ID0gaG9zdCA9PT0gYmFzZUhvc3QgfHwgaG9zdC5lbmRzV2l0aChgLiR7YmFzZUhvc3R9YCk7CiAgICByZXR1cm4gbWF0Y2hlc0hvc3QgJiYgKCFydWxlLnBvcnQgfHwgcnVsZS5wb3J0ID09PSBwb3J0KTsKICB9KTsKfQoKZXhwb3J0IGZ1bmN0aW9uIHByb3h5Rm9yKHVybFZhbHVlLCBlbnYgPSBwcm9jZXNzLmVudikgewogIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsVmFsdWUpOwogIGlmIChieXBhc3Nlc1Byb3h5KHBhcnNlZCwgZW52KSkgcmV0dXJuIHVuZGVmaW5lZDsKICByZXR1cm4gcGFyc2VkLnByb3RvY29sID09PSAnaHR0cHM6JwogICAgPyBlbnYuSFRUUFNfUFJPWFkgfHwgZW52Lmh0dHBzX3Byb3h5IHx8IGVudi5IVFRQX1BST1hZIHx8IGVudi5odHRwX3Byb3h5CiAgICA6IGVudi5IVFRQX1BST1hZIHx8IGVudi5odHRwX3Byb3h5Owp9Cgphc3luYyBmdW5jdGlvbiBmZXRjaERpcmVjdCh1cmwsIGluaXQsIGZldGNoSW1wbCkgewogIGNvbnN0IHVwcGVyID0gT2JqZWN0Lmhhc093bihwcm9jZXNzLmVudiwgJ05PX1BST1hZJykgPyBwcm9jZXNzLmVudi5OT19QUk9YWSA6IHVuZGVmaW5lZDsKICBjb25zdCBsb3dlciA9IE9iamVjdC5oYXNPd24ocHJvY2Vzcy5lbnYsICdub19wcm94eScpID8gcHJvY2Vzcy5lbnYubm9fcHJveHkgOiB1bmRlZmluZWQ7CiAgdHJ5IHsKICAgIHByb2Nlc3MuZW52Lk5PX1BST1hZID0gJyonOwogICAgcHJvY2Vzcy5lbnYubm9fcHJveHkgPSAnKic7CiAgICByZXR1cm4gYXdhaXQgZmV0Y2hJbXBsKHVybCwgaW5pdCk7CiAgfSBmaW5hbGx5IHsKICAgIGlmICh1cHBlciA9PT0gdW5kZWZpbmVkKSBkZWxldGUgcHJvY2Vzcy5lbnYuTk9fUFJPWFk7CiAgICBlbHNlIHByb2Nlc3MuZW52Lk5PX1BST1hZID0gdXBwZXI7CiAgICBpZiAobG93ZXIgPT09IHVuZGVmaW5lZCkgZGVsZXRlIHByb2Nlc3MuZW52Lm5vX3Byb3h5OwogICAgZWxzZSBwcm9jZXNzLmVudi5ub19wcm94eSA9IGxvd2VyOwogIH0KfQoKZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoV2l0aFByb3h5KGluaXRpYWxVcmwsIGluaXQgPSB7fSwgZW52ID0gcHJvY2Vzcy5lbnYsIGZldGNoSW1wbCA9IGZldGNoKSB7CiAgbGV0IG5leHRVcmwgPSBpbml0aWFsVXJsOwogIGNvbnN0IHsgcHJveHk6IF9jYWxsZXJQcm94eSwgLi4uYmFzZUluaXQgfSA9IGluaXQ7CiAgZm9yIChsZXQgcmVkaXJlY3RzID0gMDsgcmVkaXJlY3RzIDw9IDU7IHJlZGlyZWN0cysrKSB7CiAgICBjb25zdCBieXBhc3MgPSBieXBhc3Nlc1Byb3h5KG5leHRVcmwsIGVudik7CiAgICBjb25zdCBwcm94eSA9IHByb3h5Rm9yKG5leHRVcmwsIGVudik7CiAgICBsZXQgcmVzcG9uc2U7CiAgICB0cnkgewogICAgICBjb25zdCByZXF1ZXN0SW5pdCA9IHsKICAgICAgICAuLi5iYXNlSW5pdCwKICAgICAgICByZWRpcmVjdDogJ21hbnVhbCcsCiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDAwMCksCiAgICAgICAgLi4uKHByb3h5ID8geyBwcm94eSB9IDoge30pLAogICAgICB9OwogICAgICByZXNwb25zZSA9IGJ5cGFzcwogICAgICAgID8gYXdhaXQgZmV0Y2hEaXJlY3QobmV4dFVybCwgcmVxdWVzdEluaXQsIGZldGNoSW1wbCkKICAgICAgICA6IGF3YWl0IGZldGNoSW1wbChuZXh0VXJsLCByZXF1ZXN0SW5pdCk7CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBpZiAocHJveHkpIHRocm93IG5ldyBFcnJvcignUmVxdWVzdCBmYWlsZWQgdGhyb3VnaCBjb25maWd1cmVkIHByb3h5Jyk7CiAgICAgIHRocm93IGVycm9yOwogICAgfQogICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA+PSAzMDAgJiYgcmVzcG9uc2Uuc3RhdHVzIDwgNDAwICYmIHJlc3BvbnNlLmhlYWRlcnMuaGFzKCdsb2NhdGlvbicpKSB7CiAgICAgIGlmIChyZWRpcmVjdHMgPT09IDUpIHRocm93IG5ldyBFcnJvcignVG9vIG1hbnkgcmVkaXJlY3RzJyk7CiAgICAgIG5leHRVcmwgPSBuZXcgVVJMKHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdsb2NhdGlvbicpLCBuZXh0VXJsKS5ocmVmOwogICAgICBjb250aW51ZTsKICAgIH0KICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDIwMCkgdGhyb3cgbmV3IEVycm9yKGBSZXF1ZXN0IGZhaWxlZCB3aXRoIEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9YCk7CiAgICByZXR1cm4gcmVzcG9uc2U7CiAgfQogIHRocm93IG5ldyBFcnJvcignVG9vIG1hbnkgcmVkaXJlY3RzJyk7Cn0KCmFzeW5jIGZ1bmN0aW9uIGNoZWNrZWRKc29uKHJlc3BvbnNlKSB7CiAgdHJ5IHsKICAgIHJldHVybiBhd2FpdCByZXNwb25zZS5qc29uKCk7CiAgfSBjYXRjaCB7CiAgICB0aHJvdyBuZXcgRXJyb3IoJ1JlZ2lzdHJ5IHJldHVybmVkIGludmFsaWQgSlNPTicpOwogIH0KfQoKZnVuY3Rpb24gb2JqZWN0UmVjb3JkKHZhbHVlKSB7CiAgcmV0dXJuIHZhbHVlICE9PSBudWxsICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpOwp9CgpmdW5jdGlvbiBzdXBwb3J0ZWRJbnRlZ3JpdHkodmFsdWUpIHsKICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiAvXnNoYTUxMi1bQS1aYS16MC05Ky9dezg2fT09JC8udGVzdCh2YWx1ZSk7Cn0KCmZ1bmN0aW9uIGh0dHBUYXJiYWxsKHZhbHVlKSB7CiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHJldHVybiBmYWxzZTsKICB0cnkgewogICAgY29uc3QgdXJsID0gbmV3IFVSTCh2YWx1ZSk7CiAgICByZXR1cm4gdXJsLnByb3RvY29sID09PSAnaHR0cDonIHx8IHVybC5wcm90b2NvbCA9PT0gJ2h0dHBzOic7CiAgfSBjYXRjaCB7CiAgICByZXR1cm4gZmFsc2U7CiAgfQp9CgpleHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVBhY2thZ2UocGtnLCByZXF1ZXN0ZWQsIG9wdGlvbnMgPSB7fSkgewogIGNvbnN0IGZldGNoSW1wbCA9IG9wdGlvbnMuZmV0Y2hJbXBsIHx8IGZldGNoOwogIGNvbnN0IGVudiA9IG9wdGlvbnMuZW52IHx8IHByb2Nlc3MuZW52OwogIGNvbnN0IG1ldGFkYXRhVXJsID0gYGh0dHBzOi8vcmVnaXN0cnkubnBtanMub3JnLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHBrZyl9YDsKICBjb25zdCBtZXRhZGF0YSA9IGF3YWl0IGNoZWNrZWRKc29uKGF3YWl0IGZldGNoV2l0aFByb3h5KG1ldGFkYXRhVXJsLCB7fSwgZW52LCBmZXRjaEltcGwpKTsKICBpZiAoIW9iamVjdFJlY29yZChtZXRhZGF0YSkpIHRocm93IG5ldyBFcnJvcignUmVnaXN0cnkgbWV0YWRhdGEgbXVzdCBiZSBhbiBvYmplY3QnKTsKICBpZiAoIW9iamVjdFJlY29yZChtZXRhZGF0YS52ZXJzaW9ucykpIHRocm93IG5ldyBFcnJvcignUmVnaXN0cnkgdmVyc2lvbnMgbXVzdCBiZSBhbiBvYmplY3QnKTsKICBjb25zdCB2ZXJzaW9uID0gcmVxdWVzdGVkID09PSAnbGF0ZXN0JyA/IG1ldGFkYXRhWydkaXN0LXRhZ3MnXT8ubGF0ZXN0IDogcmVxdWVzdGVkOwogIGlmICh0eXBlb2YgdmVyc2lvbiAhPT0gJ3N0cmluZycgfHwgIXZlcnNpb24udHJpbSgpKSB0aHJvdyBuZXcgRXJyb3IoJ1Jlc29sdmVkIHZlcnNpb24gbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcnKTsKICBpZiAoIU9iamVjdC5oYXNPd24obWV0YWRhdGEudmVyc2lvbnMsIHZlcnNpb24pKSB0aHJvdyBuZXcgRXJyb3IoYFBhY2thZ2UgdmVyc2lvbiBub3QgZm91bmQ6ICR7cGtnfUAke3ZlcnNpb259YCk7CiAgY29uc3QgbWFuaWZlc3QgPSBtZXRhZGF0YS52ZXJzaW9uc1t2ZXJzaW9uXTsKICBpZiAoIW9iamVjdFJlY29yZChtYW5pZmVzdCkpIHRocm93IG5ldyBFcnJvcignUmVnaXN0cnkgbWFuaWZlc3QgbXVzdCBiZSBhbiBvYmplY3QnKTsKICBpZiAobWFuaWZlc3QubmFtZSAhPT0gcGtnKSB0aHJvdyBuZXcgRXJyb3IoJ1JlZ2lzdHJ5IG1hbmlmZXN0IG5hbWUgbXVzdCBtYXRjaCB0aGUgcmVxdWVzdGVkIHBhY2thZ2UnKTsKICBpZiAobWFuaWZlc3QudmVyc2lvbiAhPT0gdmVyc2lvbikgdGhyb3cgbmV3IEVycm9yKCdSZWdpc3RyeSBtYW5pZmVzdCB2ZXJzaW9uIG11c3QgbWF0Y2ggdGhlIHJlc29sdmVkIHZlcnNpb24nKTsKICBjb25zdCBkaXN0ID0gbWFuaWZlc3QuZGlzdDsKICBpZiAoIW9iamVjdFJlY29yZChkaXN0KSkgdGhyb3cgbmV3IEVycm9yKCdSZWdpc3RyeSBkaXN0IG11c3QgYmUgYW4gb2JqZWN0Jyk7CiAgaWYgKCFzdXBwb3J0ZWRJbnRlZ3JpdHkoZGlzdC5pbnRlZ3JpdHkpKSB0aHJvdyBuZXcgRXJyb3IoJ1JlZ2lzdHJ5IGludGVncml0eSBtdXN0IGJlIGEgc3VwcG9ydGVkIFNIQS01MTIgc3RyaW5nJyk7CiAgaWYgKCFodHRwVGFyYmFsbChkaXN0LnRhcmJhbGwpKSB0aHJvdyBuZXcgRXJyb3IoJ1JlZ2lzdHJ5IHRhcmJhbGwgbXVzdCBiZSBhbiBIVFRQKFMpIFVSTCcpOwogIHJldHVybiB7IHZlcnNpb24sIGRpc3QgfTsKfQoKZnVuY3Rpb24gcGFyc2VTcGVjKHNwZWMpIHsKICBjb25zdCBzZXBhcmF0b3IgPSBzcGVjLmxhc3RJbmRleE9mKCdAJyk7CiAgaWYgKHNlcGFyYXRvciA+IDApIHsKICAgIHJldHVybiB7IHBrZzogc3BlYy5zbGljZSgwLCBzZXBhcmF0b3IpLCByZXF1ZXN0ZWQ6IHNwZWMuc2xpY2Uoc2VwYXJhdG9yICsgMSkgfHwgJ2xhdGVzdCcgfTsKICB9CiAgcmV0dXJuIHsgcGtnOiBzcGVjLCByZXF1ZXN0ZWQ6ICdsYXRlc3QnIH07Cn0KCmZ1bmN0aW9uIHNhZmVBcmNoaXZlUGF0aChuYW1lKSB7CiAgaWYgKCFuYW1lIHx8IG5hbWUuc3RhcnRzV2l0aCgnLycpIHx8IG5hbWUuc3RhcnRzV2l0aCgnXFwnKSB8fCAvXltBLVphLXpdOltcXC9dLy50ZXN0KG5hbWUpKSByZXR1cm4gZmFsc2U7CiAgcmV0dXJuICFuYW1lLnNwbGl0KC9bXFwvXS8pLmluY2x1ZGVzKCcuLicpOwp9CgpleHBvcnQgYXN5bmMgZnVuY3Rpb24gaW5zdGFsbFBhY2thZ2Uoc3BlYywgb3V0RGlyLCBvcHRpb25zID0ge30pIHsKICBjb25zdCB7IHBrZywgcmVxdWVzdGVkIH0gPSBwYXJzZVNwZWMoc3BlYyk7CiAgY29uc3QgZmV0Y2hJbXBsID0gb3B0aW9ucy5mZXRjaEltcGwgfHwgZmV0Y2g7CiAgY29uc3QgZW52ID0gb3B0aW9ucy5lbnYgfHwgcHJvY2Vzcy5lbnY7CiAgY29uc3QgeyB2ZXJzaW9uLCBkaXN0IH0gPSBhd2FpdCByZXNvbHZlUGFja2FnZShwa2csIHJlcXVlc3RlZCwgeyBmZXRjaEltcGwsIGVudiB9KTsKICBpZiAoIWRpc3QudGFyYmFsbCB8fCB0eXBlb2YgZGlzdC5pbnRlZ3JpdHkgIT09ICdzdHJpbmcnKSB0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgZGlzdHJpYnV0aW9uIG1ldGFkYXRhIGZvciAke3BrZ31AJHt2ZXJzaW9ufWApOwoKICBjb25zdCBhcmNoaXZlUmVzcG9uc2UgPSBhd2FpdCBmZXRjaFdpdGhQcm94eShkaXN0LnRhcmJhbGwsIHt9LCBlbnYsIGZldGNoSW1wbCk7CiAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShhd2FpdCBhcmNoaXZlUmVzcG9uc2UuYXJyYXlCdWZmZXIoKSk7CiAgY29uc3QgaW50ZWdyaXR5TWF0Y2ggPSAvXnNoYTUxMi0oW0EtWmEtejAtOSsvXSs9ezAsMn0pJC8uZXhlYyhkaXN0LmludGVncml0eSk7CiAgaWYgKCFpbnRlZ3JpdHlNYXRjaCkgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBpbnRlZ3JpdHkgZm9yICR7cGtnfUAke3ZlcnNpb259YCk7CiAgY29uc3QgYWN0dWFsID0gbmV3IEJ1bi5DcnlwdG9IYXNoZXIoJ3NoYTUxMicpLnVwZGF0ZShieXRlcykuZGlnZXN0KCdiYXNlNjQnKTsKICBpZiAoYWN0dWFsICE9PSBpbnRlZ3JpdHlNYXRjaFsxXSkgdGhyb3cgbmV3IEVycm9yKGBJbnRlZ3JpdHkgbWlzbWF0Y2ggZm9yICR7cGtnfUAke3ZlcnNpb259YCk7CgogIGNvbnN0IGZpbGVzID0gYXdhaXQgbmV3IEJ1bi5BcmNoaXZlKGJ5dGVzKS5maWxlcygpOwogIGZvciAoY29uc3QgbmFtZSBvZiBmaWxlcy5rZXlzKCkpIHsKICAgIGlmICghc2FmZUFyY2hpdmVQYXRoKG5hbWUpKSB0aHJvdyBuZXcgRXJyb3IoYFVuc2FmZSBhcmNoaXZlIHBhdGg6ICR7bmFtZX1gKTsKICB9CgogIGNvbnN0IHBhY2thZ2VQYXRoID0gJ3BhY2thZ2UvcGFja2FnZS5qc29uJzsKICBjb25zdCBiaW5hcnlOYW1lID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/ICdjbGF1ZGUuZXhlJyA6ICdjbGF1ZGUnOwogIGNvbnN0IGJpbmFyeUVudHJ5UGF0aCA9IGBwYWNrYWdlLyR7YmluYXJ5TmFtZX1gOwogIGNvbnN0IHBhY2thZ2VGaWxlID0gZmlsZXMuZ2V0KHBhY2thZ2VQYXRoKTsKICBjb25zdCBiaW5hcnlGaWxlID0gZmlsZXMuZ2V0KGJpbmFyeUVudHJ5UGF0aCk7CiAgaWYgKCFwYWNrYWdlRmlsZSkgdGhyb3cgbmV3IEVycm9yKGBBcmNoaXZlIGlzIG1pc3NpbmcgJHtwYWNrYWdlUGF0aH1gKTsKICBpZiAoIWJpbmFyeUZpbGUpIHRocm93IG5ldyBFcnJvcihgQXJjaGl2ZSBpcyBtaXNzaW5nICR7YmluYXJ5RW50cnlQYXRofWApOwogIGlmIChiaW5hcnlGaWxlLnNpemUgPD0gTUlOX0JJTkFSWV9CWVRFUykgdGhyb3cgbmV3IEVycm9yKGBBcmNoaXZlIGJpbmFyeSBpcyB0b28gc21hbGw6ICR7YmluYXJ5RW50cnlQYXRofWApOwoKICBjb25zdCBwYWNrYWdlRGlyID0gam9pbihvdXREaXIsICdwYWNrYWdlJyk7CiAgY29uc3QgYmluYXJ5UGF0aCA9IGpvaW4ocGFja2FnZURpciwgYmluYXJ5TmFtZSk7CiAgbWtkaXJTeW5jKHBhY2thZ2VEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pOwogIGF3YWl0IEJ1bi53cml0ZShqb2luKHBhY2thZ2VEaXIsICdwYWNrYWdlLmpzb24nKSwgcGFja2FnZUZpbGUpOwogIGF3YWl0IEJ1bi53cml0ZShiaW5hcnlQYXRoLCBiaW5hcnlGaWxlKTsKICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ3dpbjMyJykgY2htb2RTeW5jKGJpbmFyeVBhdGgsIDBvNzU1KTsKICByZXR1cm4geyB2ZXJzaW9uLCBiaW5hcnlQYXRoIH07Cn0KCmlmIChpbXBvcnQubWV0YS5tYWluKSB7CiAgY29uc3QgW3NwZWMsIG91dERpcl0gPSBwcm9jZXNzLmFyZ3Yuc2xpY2UoMik7CiAgaWYgKCFzcGVjIHx8ICFvdXREaXIpIHRocm93IG5ldyBFcnJvcigndXNhZ2U6IGZldGNoLXBhY2thZ2UubWpzIDxwYWNrYWdlQHZlcnNpb24+IDxvdXRwdXQtZGlyZWN0b3J5PicpOwogIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGluc3RhbGxQYWNrYWdlKHNwZWMsIG91dERpcik7CiAgY29uc29sZS5sb2coYFZFUlNJT049JHtyZXN1bHQudmVyc2lvbn1gKTsKfQo=')
    [System.IO.File]::WriteAllBytes($fetchScript, $FetchPackageBytes)

    $output = & $BunBin $fetchScript "$npmPkg@$Version" $NativeBinTmpDir 2>&1
    $exitCode = $LASTEXITCODE
    $output | ForEach-Object { Write-Host "  $_" }
    Remove-Item -Force $fetchScript -ErrorAction SilentlyContinue

    if ($exitCode -ne 0) {
        Remove-Item -Recurse -Force $NativeBinTmpDir -ErrorAction SilentlyContinue
        Write-Err "Fetch failed (Bun exit $exitCode). Install the official binary manually:"
        Write-Err "    irm https://claude.ai/install.ps1 | iex"
        exit 1
    }

    $cand = Join-Path $NativeBinTmpDir "package\claude.exe"
    if ((Test-Path $cand) -and (Get-Item $cand).Length -gt 10MB) {
        $NativeBin = $cand
        $verLine = $output | Where-Object { $_ -match '^VERSION=' } | Select-Object -First 1
        if ($verLine) { $NativeBinLabel = ($verLine -replace '^VERSION=', '').Trim() }
        else { $NativeBinLabel = "npm-latest" }
    } else {
        Remove-Item -Recurse -Force $NativeBinTmpDir -ErrorAction SilentlyContinue
        Write-Err "Tarball downloaded but expected package\claude.exe was missing or too small."
        exit 1
    }
    Write-OK "Downloaded $npmPkg@$NativeBinLabel"
}

if (-not $NativeBin) {
    Write-Err "Native Claude Code binary not found"
    Write-Err "Install the official binary first:"
    Write-Err "  irm https://claude.ai/install.ps1 | iex"
    Write-Err "Then re-run this script."
    exit 1
}

# Always write the extractor (used for cli.js and/or .node modules)
$extractorPath = Join-Path $ClawDir "extract-natives.mjs"
$ExtractorBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCi8qKgogKiBDbGF3R29kIFBsdXMgQnVuIHNlY3Rpb24gZXh0cmFjdG9yCiAqCiAqIFBhcnNlcyB0aGUgLmJ1biAoUEUvRUxGKSBvciBfX0JVTixfX2J1biAoTWFjaC1PKSBzZWN0aW9uIGVtYmVkZGVkIGluIGEKICogQnVuIHN0YW5kYWxvbmUgZXhlY3V0YWJsZSwgd2Fsa3MgdGhlIG1vZHVsZSBncmFwaCwgYW5kIGV4dHJhY3RzOgogKiAgIC0gdGhlIGVudHJ5LXBvaW50IG1vZHVsZSAgICAgIOKGkiA8b3V0Pi9jbGkub3JpZ2luYWwuanMKICogICAtIGV2ZXJ5IGxvYWRlcj1uYXBpIG1vZHVsZSAgICDihpIgPG91dD4vdmVuZG9yLzxuYW1lPi88YXJjaD4tPG9zPi88bmFtZT4ubm9kZQogKgogKiBFdmVyeXRoaW5nIGVsc2UgaXMgZHJvcHBlZCAoZS5nLiBhdXRvLWdlbmVyYXRlZCAqLmpzIG5hcGkgc2hpbXMgYXJlbid0CiAqIG5lZWRlZCBiZWNhdXNlIGNsaS5qcyBhbHJlYWR5IGlubGluZXMgdGhlIHJlcXVpcmUoJy8kYnVuZnMvcm9vdC9YLm5vZGUnKQogKiBjYWxscyB0aGF0IHBvc3QtcHJvY2Vzcy5tanMgcmV3cml0ZXMgdG8gdGhlIHZlbmRvciBsb29rdXApLgogKgogKiBBZGFwdGVkIGZyb20gL2hvbWUva2FpanUvY29kZS9weXRob24vcGFyc2UtYnVuL21haW4uanMgKHdoaWNoIGl0c2VsZgogKiBpbXBsZW1lbnRzIHRoZSBmb3JtYXQgZG9jdW1lbnRlZCBpbiBkb2NzL2J1bi1zZWN0aW9uLWZvcm1hdC5tZCkuIExhenkKICogQnVuLmZpbGUgcmVhZHMgd2VyZSByZXBsYWNlZCB3aXRoIHJlYWRGaWxlU3luYyBzbyB0aGUgc2NyaXB0IHJ1bnMgdW5kZXIKICogdGhlIGV4aXN0aW5nIEJ1biBpbnZvY2F0aW9uIGluIGluc3RhbGwuc2ggLyBpbnN0YWxsLnBzMS4KICoKICogVXNhZ2U6CiAqICAgYnVuIGV4dHJhY3QtbmF0aXZlcy5tanMgPGJpbmFyeS1wYXRoPiA8b3V0cHV0LWRpcj4KICovCgppbXBvcnQgeyByZWFkRmlsZVN5bmMsIHdyaXRlRmlsZVN5bmMsIG1rZGlyU3luYywgZXhpc3RzU3luYyB9IGZyb20gJ25vZGU6ZnMnOwppbXBvcnQgeyBqb2luLCBiYXNlbmFtZSB9IGZyb20gJ25vZGU6cGF0aCc7CgovLyDilIDilIDilIAgRm9ybWF0IGNvbnN0YW50cyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKCmNvbnN0IFRSQUlMRVIgICAgICAgICAgICAgPSBCdWZmZXIuZnJvbSgnXG4tLS0tIEJ1biEgLS0tLVxuJyk7CmNvbnN0IEJVTl9TRUNUSU9OX05BTUUgICAgPSAnLmJ1bic7CmNvbnN0IE9GRlNFVF9TVFJVQ1RfU0laRSAgPSAzMjsKY29uc3QgTU9EVUxFX1JFQ09SRF9TSVpFICA9IDUyOwoKLy8gbG9hZGVyIGlkIOKGkiBuYW1lIChzdWJzZXQ7IG9ubHkgYG5hcGlgIGlzIGFjdGVkIG9uLCByZXN0IGluZm9ybWF0aW9uYWwpCmNvbnN0IExPQURFUlMgPSB7CiAgMDonanN4JywgMTonanMnLCAyOid0cycsIDM6J3RzeCcsIDQ6J2NzcycsIDU6J2ZpbGUnLCA2Oidqc29uJywgNzonanNvbmMnLAogIDg6J3RvbWwnLCA5Oid3YXNtJywgMTA6J25hcGknLCAxMTonYmFzZTY0JywgMTI6J2RhdGF1cmwnLCAxMzondGV4dCcsCiAgMTQ6J2J1bnNoJywgMTU6J3NxbGl0ZScsIDE2OidzcWxpdGVfZW1iZWRkZWQnLCAxNzonaHRtbCcsIDE4Oid5YW1sJywKICAxOTonanNvbjUnLCAyMDonbWQnLAp9OwoKLy8gRUxGCmNvbnN0IEVMRl9NQUdJQ19MRSAgICAgICAgICA9IDB4NDY0YzQ1N2Y7IC8vICJceDdmRUxGIiBMRSB1MzIKY29uc3QgRUxGX0VJX0NMQVNTICAgICAgICAgID0gMHgwNDsKY29uc3QgRUxGX0VJX0RBVEEgICAgICAgICAgID0gMHgwNTsKY29uc3QgRUxGX0NMQVNTXzY0ICAgICAgICAgID0gMHgwMjsKY29uc3QgRUxGX0RBVEFfTEUgICAgICAgICAgID0gMHgwMTsKY29uc3QgRUxGX0VfTUFDSElORSAgICAgICAgID0gMHgxMjsgICAgICAgLy8gdTE2CmNvbnN0IEVMRl9FSERSX1NJWkUgICAgICAgICA9IDB4NDA7CmNvbnN0IEVMRjY0X0VfU0hPRkYgICAgICAgICA9IDB4Mjg7CmNvbnN0IEVMRjY0X0VfU0hFTlRTSVpFICAgICA9IDB4M2E7CmNvbnN0IEVMRjY0X0VfU0hOVU0gICAgICAgICA9IDB4M2M7CmNvbnN0IEVMRjY0X0VfU0hTVFJORFggICAgICA9IDB4M2U7CmNvbnN0IEVMRjY0X1NIX05BTUUgICAgICAgICA9IDB4MDA7CmNvbnN0IEVMRjY0X1NIX09GRlNFVCAgICAgICA9IDB4MTg7CmNvbnN0IEVMRjY0X1NIX1NJWkUgICAgICAgICA9IDB4MjA7CmNvbnN0IEVNX1g4Nl82NCAgICAgICAgICAgICA9IDB4M2U7CmNvbnN0IEVNX0FBUkNINjQgICAgICAgICAgICA9IDB4Yjc7CgovLyBNYWNoLU8gKHRoaW4gTEUgNjQtYml0OyBmYXQgLyAzMi1iaXQgLyBCRSByZWplY3RlZCB3aXRoIGNsZWFyIG1lc3NhZ2UpCmNvbnN0IE1IX01BR0lDXzY0ICAgICAgICAgICA9IDB4ZmVlZGZhY2Y7CmNvbnN0IE1IX0NJR0FNXzY0ICAgICAgICAgICA9IDB4Y2ZmYWVkZmU7CmNvbnN0IE1IX01BR0lDICAgICAgICAgICAgICA9IDB4ZmVlZGZhY2U7CmNvbnN0IE1IX0NJR0FNICAgICAgICAgICAgICA9IDB4Y2VmYWVkZmU7CmNvbnN0IE1BQ0hfQ1BVVFlQRV9PRkYgICAgICA9IDB4MDQ7ICAgICAgICAvLyB1MzIKY29uc3QgTUFDSF9OQ01EU19PRkYgICAgICAgID0gMHgxMDsKY29uc3QgTUFDSF9TSVpFT0ZDTURTX09GRiAgID0gMHgxNDsKY29uc3QgTUFDSF9IRFJfU0laRV82NCAgICAgID0gMHgyMDsKY29uc3QgTENfU0VHTUVOVF82NCAgICAgICAgID0gMHgxOTsKY29uc3QgTENfQ01EU0laRV9PRkYgICAgICAgID0gMHgwNDsKY29uc3QgTENfU0VHTkFNRV9PRkYgICAgICAgID0gMHgwODsKY29uc3QgTENfU0VHTkFNRV9MRU4gICAgICAgID0gMHgxMDsKY29uc3QgU0VHNjRfTlNFQ1RTX09GRiAgICAgID0gMHg0MDsKY29uc3QgU0VHNjRfU0VDVFNfT0ZGICAgICAgID0gMHg0ODsKY29uc3QgU0VDVDY0X0VOVFJZX1NJWkUgICAgID0gMHg1MDsKY29uc3QgU0VDVDY0X1NJWkVfT0ZGICAgICAgID0gMHgyODsKY29uc3QgU0VDVDY0X09GRlNFVF9PRkYgICAgID0gMHgzMDsKY29uc3QgQ1BVX1RZUEVfWDg2XzY0ICAgICAgID0gMHgwMTAwMDAwNzsKY29uc3QgQ1BVX1RZUEVfQVJNNjQgICAgICAgID0gMHgwMTAwMDAwYzsKCi8vIFBFCmNvbnN0IFBFX09GRlNFVF9QVFIgICAgICAgICA9IDB4M2M7CmNvbnN0IFBFX01BQ0hJTkVfT0ZGICAgICAgICA9IDB4MDQ7ICAgICAgIC8vIHJlbGF0aXZlIHRvIFBFIHNpZwpjb25zdCBQRV9OVU1fU0VDVElPTlNfT0ZGICAgPSAweDA2Owpjb25zdCBQRV9PUFRfSERSX1NJWkVfT0ZGICAgPSAweDE0Owpjb25zdCBQRV9DT0ZGX0hEUl9TSVpFICAgICAgPSAweDE4Owpjb25zdCBQRV9PUFRfTUFHSUNfT0ZGICAgICAgPSAweDE4Owpjb25zdCBQRV9PUFRfTUFHSUNfUEUzMlAgICAgPSAweDIwYjsKY29uc3QgUEVfU0VDVElPTl9FTlRSWV9TSVpFID0gMHgyODsKY29uc3QgUEVfU0VDVF9SQVdfU0laRV9PRkYgID0gMHgxMDsKY29uc3QgUEVfU0VDVF9SQVdfT0ZGX09GRiAgID0gMHgxNDsKY29uc3QgUEVfU0VDVF9OQU1FX0xFTiAgICAgID0gMHgwODsKY29uc3QgSU1BR0VfTUFDSElORV9BTUQ2NCAgID0gMHg4NjY0Owpjb25zdCBJTUFHRV9NQUNISU5FX0FSTTY0ICAgPSAweGFhNjQ7CgovLyDilIDilIDilIAgSGVscGVycyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKCmZ1bmN0aW9uIGRpZShtc2cpIHsgdGhyb3cgbmV3IEVycm9yKGBlcnJvcjogJHttc2d9YCk7IH0KCmZ1bmN0aW9uIHJlYWRVNjRMRShidWYsIG9mZiwgd2hhdCkgewogIGNvbnN0IHYgPSBidWYucmVhZEJpZ1VJbnQ2NExFKG9mZik7CiAgaWYgKHYgPiBCaWdJbnQoTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpKSBkaWUoYCR7d2hhdH0gZXhjZWVkcyBKUyBzYWZlIGludGVnZXI6ICR7dn1gKTsKICByZXR1cm4gTnVtYmVyKHYpOwp9CgpmdW5jdGlvbiBjaGVja2VkU2xpY2UoYnVmLCBvZmYsIHNpemUsIHdoYXQpIHsKICBpZiAob2ZmIDwgMCB8fCBzaXplIDwgMCB8fCBvZmYgKyBzaXplID4gYnVmLmxlbmd0aCkgewogICAgZGllKGAke3doYXR9IG91dCBvZiBib3VuZHM6IG9mZnNldD0ke29mZn0gc2l6ZT0ke3NpemV9IGJ1Zj0ke2J1Zi5sZW5ndGh9YCk7CiAgfQogIHJldHVybiBidWYuc3ViYXJyYXkob2ZmLCBvZmYgKyBzaXplKTsKfQoKZnVuY3Rpb24gZGVjb2RlTmFtZShidWYpIHsKICByZXR1cm4gYnVmLnRvU3RyaW5nKCd1dGY4JykucmVwbGFjZSgvXHUwMDAwKyQvdSwgJycpOwp9CgovLyDilIDilIDilIAgU2VjdGlvbiBsb2NhdG9ycyAocGVyIGZvcm1hdCkg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACgpmdW5jdGlvbiBmaW5kU2VjdGlvbkVsZihidWYpIHsKICBpZiAoYnVmLmxlbmd0aCA8IEVMRl9FSERSX1NJWkUpIGRpZSgnRUxGIHRvbyBzbWFsbCcpOwogIGlmIChidWZbRUxGX0VJX0NMQVNTXSAhPT0gRUxGX0NMQVNTXzY0KSBkaWUoJ0VMRjogb25seSA2NC1iaXQgc3VwcG9ydGVkJyk7CiAgaWYgKGJ1ZltFTEZfRUlfREFUQV0gICE9PSBFTEZfREFUQV9MRSkgZGllKCdFTEY6IG9ubHkgbGl0dGxlLWVuZGlhbiBzdXBwb3J0ZWQnKTsKCiAgY29uc3QgZU1hY2hpbmUgPSBidWYucmVhZFVJbnQxNkxFKEVMRl9FX01BQ0hJTkUpOwogIGNvbnN0IGFyY2ggPSBlTWFjaGluZSA9PT0gRU1fWDg2XzY0ICA/ICd4NjQnCiAgICAgICAgICAgICA6IGVNYWNoaW5lID09PSBFTV9BQVJDSDY0ID8gJ2FybTY0JwogICAgICAgICAgICAgOiBkaWUoYEVMRjogdW5zdXBwb3J0ZWQgZV9tYWNoaW5lIDB4JHtlTWFjaGluZS50b1N0cmluZygxNil9YCk7CgogIGNvbnN0IHNob2ZmICAgICA9IHJlYWRVNjRMRShidWYsIEVMRjY0X0VfU0hPRkYsICdFTEYgZV9zaG9mZicpOwogIGNvbnN0IHNoZW50c2l6ZSA9IGJ1Zi5yZWFkVUludDE2TEUoRUxGNjRfRV9TSEVOVFNJWkUpOwogIGNvbnN0IHNobnVtICAgICA9IGJ1Zi5yZWFkVUludDE2TEUoRUxGNjRfRV9TSE5VTSk7CiAgY29uc3Qgc2hzdHJuZHggID0gYnVmLnJlYWRVSW50MTZMRShFTEY2NF9FX1NIU1RSTkRYKTsKICBpZiAoc2hzdHJuZHggPj0gc2hudW0pIGRpZSgnRUxGIGVfc2hzdHJuZHggb3V0IG9mIHJhbmdlJyk7CgogIGNvbnN0IHNoc3RyRW50cnkgID0gYnVmLnN1YmFycmF5KHNob2ZmICsgc2hzdHJuZHggKiBzaGVudHNpemUsIHNob2ZmICsgKHNoc3RybmR4ICsgMSkgKiBzaGVudHNpemUpOwogIGNvbnN0IHNoc3RyT2Zmc2V0ID0gcmVhZFU2NExFKHNoc3RyRW50cnksIEVMRjY0X1NIX09GRlNFVCwgJ3Noc3RydGFiIG9mZnNldCcpOwogIGNvbnN0IHNoc3RyU2l6ZSAgID0gcmVhZFU2NExFKHNoc3RyRW50cnksIEVMRjY0X1NIX1NJWkUsICAgJ3Noc3RydGFiIHNpemUnKTsKICBjb25zdCBzaHN0ciAgICAgICA9IGNoZWNrZWRTbGljZShidWYsIHNoc3RyT2Zmc2V0LCBzaHN0clNpemUsICdzaHN0cnRhYicpOwoKICBsZXQgbWF0Y2ggPSBudWxsOwogIGZvciAobGV0IGkgPSAwOyBpIDwgc2hudW07IGkrKykgewogICAgY29uc3QgZW50cnkgICA9IGJ1Zi5zdWJhcnJheShzaG9mZiArIGkgKiBzaGVudHNpemUsIHNob2ZmICsgKGkgKyAxKSAqIHNoZW50c2l6ZSk7CiAgICBjb25zdCBuYW1lSWR4ID0gZW50cnkucmVhZFVJbnQzMkxFKEVMRjY0X1NIX05BTUUpOwogICAgaWYgKG5hbWVJZHggPj0gc2hzdHIubGVuZ3RoKSBjb250aW51ZTsKICAgIGxldCBuYW1lRW5kID0gbmFtZUlkeDsKICAgIHdoaWxlIChuYW1lRW5kIDwgc2hzdHIubGVuZ3RoICYmIHNoc3RyW25hbWVFbmRdICE9PSAwKSBuYW1lRW5kKys7CiAgICBpZiAoc2hzdHIudG9TdHJpbmcoJ2FzY2lpJywgbmFtZUlkeCwgbmFtZUVuZCkgIT09IEJVTl9TRUNUSU9OX05BTUUpIGNvbnRpbnVlOwogICAgaWYgKG1hdGNoKSBkaWUoJ0VMRiBoYXMgbXVsdGlwbGUgLmJ1biBzZWN0aW9ucycpOwogICAgY29uc3QgcmF3T2Zmc2V0ID0gcmVhZFU2NExFKGVudHJ5LCBFTEY2NF9TSF9PRkZTRVQsICcuYnVuIHNoX29mZnNldCcpOwogICAgY29uc3QgcmF3U2l6ZSAgID0gcmVhZFU2NExFKGVudHJ5LCBFTEY2NF9TSF9TSVpFLCAgICcuYnVuIHNoX3NpemUnKTsKICAgIGlmIChyYXdPZmZzZXQgKyByYXdTaXplID4gYnVmLmxlbmd0aCkgZGllKCcuYnVuIG91dCBvZiBmaWxlIGJvdW5kcycpOwogICAgbWF0Y2ggPSB7IGZvcm1hdDogJ0VMRicsIG9zOiAnbGludXgnLCBhcmNoLCByYXdPZmZzZXQsIHJhd1NpemUgfTsKICB9CiAgaWYgKCFtYXRjaCkgZGllKCdFTEYgaGFzIG5vIC5idW4gc2VjdGlvbicpOwogIHJldHVybiBtYXRjaDsKfQoKZnVuY3Rpb24gZmluZFNlY3Rpb25NYWNobyhidWYpIHsKICBpZiAoYnVmLmxlbmd0aCA8IE1BQ0hfSERSX1NJWkVfNjQpIGRpZSgnTWFjaC1PIHRvbyBzbWFsbCcpOwogIGNvbnN0IGNwdXR5cGUgPSBidWYucmVhZFVJbnQzMkxFKE1BQ0hfQ1BVVFlQRV9PRkYpOwogIGNvbnN0IGFyY2ggPSBjcHV0eXBlID09PSBDUFVfVFlQRV9YODZfNjQgPyAneDY0JwogICAgICAgICAgICAgOiBjcHV0eXBlID09PSBDUFVfVFlQRV9BUk02NCAgPyAnYXJtNjQnCiAgICAgICAgICAgICA6IGRpZShgTWFjaC1POiB1bnN1cHBvcnRlZCBjcHV0eXBlIDB4JHtjcHV0eXBlLnRvU3RyaW5nKDE2KX1gKTsKCiAgY29uc3QgbmNtZHMgICAgICA9IGJ1Zi5yZWFkVUludDMyTEUoTUFDSF9OQ01EU19PRkYpOwogIGNvbnN0IHNpemVvZmNtZHMgPSBidWYucmVhZFVJbnQzMkxFKE1BQ0hfU0laRU9GQ01EU19PRkYpOwogIGlmIChzaXplb2ZjbWRzID09PSAwIHx8IE1BQ0hfSERSX1NJWkVfNjQgKyBzaXplb2ZjbWRzID4gYnVmLmxlbmd0aCkgZGllKCdNYWNoLU8gc2l6ZW9mY21kcyBpbnZhbGlkJyk7CiAgY29uc3QgY21kcyA9IGJ1Zi5zdWJhcnJheShNQUNIX0hEUl9TSVpFXzY0LCBNQUNIX0hEUl9TSVpFXzY0ICsgc2l6ZW9mY21kcyk7CgogIGxldCBtYXRjaCA9IG51bGw7CiAgbGV0IG9mZiA9IDA7CiAgZm9yIChsZXQgaSA9IDA7IGkgPCBuY21kczsgaSsrKSB7CiAgICBpZiAob2ZmICsgOCA+IHNpemVvZmNtZHMpIGRpZShgTWFjaC1PIExDICR7aX0gdHJ1bmNhdGVkYCk7CiAgICBjb25zdCBjbWQgICAgID0gY21kcy5yZWFkVUludDMyTEUob2ZmKTsKICAgIGNvbnN0IGNtZHNpemUgPSBjbWRzLnJlYWRVSW50MzJMRShvZmYgKyBMQ19DTURTSVpFX09GRik7CiAgICBpZiAoY21kc2l6ZSA8IDggfHwgb2ZmICsgY21kc2l6ZSA+IHNpemVvZmNtZHMpIGRpZShgTWFjaC1PIExDICR7aX0gY21kc2l6ZSBpbnZhbGlkOiAke2NtZHNpemV9YCk7CiAgICBpZiAoY21kID09PSBMQ19TRUdNRU5UXzY0KSB7CiAgICAgIGNvbnN0IHNlZ25hbWUgPSBjbWRzLnRvU3RyaW5nKCdhc2NpaScsIG9mZiArIExDX1NFR05BTUVfT0ZGLCBvZmYgKyBMQ19TRUdOQU1FX09GRiArIExDX1NFR05BTUVfTEVOKS5yZXBsYWNlKC9cMCskLywgJycpOwogICAgICBpZiAoc2VnbmFtZSA9PT0gJ19fQlVOJykgewogICAgICAgIGNvbnN0IG5zZWN0cyA9IGNtZHMucmVhZFVJbnQzMkxFKG9mZiArIFNFRzY0X05TRUNUU19PRkYpOwogICAgICAgIGlmIChTRUc2NF9TRUNUU19PRkYgKyBuc2VjdHMgKiBTRUNUNjRfRU5UUllfU0laRSA+IGNtZHNpemUpIGRpZShgTWFjaC1PIExDX1NFR01FTlRfNjQoX19CVU4pIHNlY3Rpb25zIGV4Y2VlZCBjbWRzaXplYCk7CiAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBuc2VjdHM7IGorKykgewogICAgICAgICAgY29uc3QgcyA9IG9mZiArIFNFRzY0X1NFQ1RTX09GRiArIGogKiBTRUNUNjRfRU5UUllfU0laRTsKICAgICAgICAgIGNvbnN0IHNlY3RuYW1lID0gY21kcy50b1N0cmluZygnYXNjaWknLCBzLCBzICsgTENfU0VHTkFNRV9MRU4pLnJlcGxhY2UoL1wwKyQvLCAnJyk7CiAgICAgICAgICBpZiAoc2VjdG5hbWUgPT09ICdfX2J1bicpIHsKICAgICAgICAgICAgY29uc3QgcmF3U2l6ZSAgID0gcmVhZFU2NExFKGNtZHMsIHMgKyBTRUNUNjRfU0laRV9PRkYsICdfX2J1biBzaXplJyk7CiAgICAgICAgICAgIGNvbnN0IHJhd09mZnNldCA9IGNtZHMucmVhZFVJbnQzMkxFKHMgKyBTRUNUNjRfT0ZGU0VUX09GRik7CiAgICAgICAgICAgIGlmIChyYXdPZmZzZXQgKyByYXdTaXplID4gYnVmLmxlbmd0aCkgZGllKCdfX2J1biBvdXQgb2YgZmlsZSBib3VuZHMnKTsKICAgICAgICAgICAgaWYgKG1hdGNoKSBkaWUoJ01hY2gtTyBoYXMgbXVsdGlwbGUgX19CVU4sX19idW4gc2VjdGlvbnMnKTsKICAgICAgICAgICAgbWF0Y2ggPSB7IGZvcm1hdDogJ01hY2gtTycsIG9zOiAnZGFyd2luJywgYXJjaCwgcmF3T2Zmc2V0LCByYXdTaXplIH07CiAgICAgICAgICB9CiAgICAgICAgfQogICAgICB9CiAgICB9CiAgICBvZmYgKz0gY21kc2l6ZTsKICB9CiAgaWYgKCFtYXRjaCkgZGllKCdNYWNoLU8gaGFzIG5vIF9fQlVOLF9fYnVuIHNlY3Rpb24nKTsKICByZXR1cm4gbWF0Y2g7Cn0KCmZ1bmN0aW9uIGZpbmRTZWN0aW9uUGUoYnVmKSB7CiAgaWYgKGJ1Zi5sZW5ndGggPCAweDQwKSBkaWUoJ1BFIHRvbyBzbWFsbCcpOwogIGlmIChidWYudG9TdHJpbmcoJ2FzY2lpJywgMCwgMikgIT09ICdNWicpIGRpZSgnUEUgbWlzc2luZyBNWiBoZWFkZXInKTsKICBjb25zdCBwZU9mZiA9IGJ1Zi5yZWFkVUludDMyTEUoUEVfT0ZGU0VUX1BUUik7CiAgaWYgKGJ1Zi50b1N0cmluZygnYXNjaWknLCBwZU9mZiwgcGVPZmYgKyA0KSAhPT0gJ1BFXDBcMCcpIGRpZSgnUEUgbWlzc2luZyBQRSBzaWduYXR1cmUnKTsKCiAgY29uc3QgbWFjaGluZSA9IGJ1Zi5yZWFkVUludDE2TEUocGVPZmYgKyBQRV9NQUNISU5FX09GRik7CiAgY29uc3QgYXJjaCA9IG1hY2hpbmUgPT09IElNQUdFX01BQ0hJTkVfQU1ENjQgPyAneDY0JwogICAgICAgICAgICAgOiBtYWNoaW5lID09PSBJTUFHRV9NQUNISU5FX0FSTTY0ID8gJ2FybTY0JwogICAgICAgICAgICAgOiBkaWUoYFBFOiB1bnN1cHBvcnRlZCBtYWNoaW5lIDB4JHttYWNoaW5lLnRvU3RyaW5nKDE2KX1gKTsKCiAgY29uc3Qgb3B0TWFnaWMgPSBidWYucmVhZFVJbnQxNkxFKHBlT2ZmICsgUEVfT1BUX01BR0lDX09GRik7CiAgaWYgKG9wdE1hZ2ljICE9PSBQRV9PUFRfTUFHSUNfUEUzMlApIGRpZShgUEU6IG9ubHkgNjQtYml0IChQRTMyKykgc3VwcG9ydGVkLCBnb3QgMHgke29wdE1hZ2ljLnRvU3RyaW5nKDE2KX1gKTsKCiAgY29uc3QgbnVtU2VjdCAgICA9IGJ1Zi5yZWFkVUludDE2TEUocGVPZmYgKyBQRV9OVU1fU0VDVElPTlNfT0ZGKTsKICBjb25zdCBvcHRIZHJTaXplID0gYnVmLnJlYWRVSW50MTZMRShwZU9mZiArIFBFX09QVF9IRFJfU0laRV9PRkYpOwogIGNvbnN0IHNlY3RUYWJsZSAgPSBwZU9mZiArIFBFX0NPRkZfSERSX1NJWkUgKyBvcHRIZHJTaXplOwoKICBsZXQgbWF0Y2ggPSBudWxsOwogIGZvciAobGV0IGkgPSAwOyBpIDwgbnVtU2VjdDsgaSsrKSB7CiAgICBjb25zdCBlbnRyeSAgPSBzZWN0VGFibGUgKyBpICogUEVfU0VDVElPTl9FTlRSWV9TSVpFOwogICAgY29uc3QgcmF3Tm0gID0gYnVmLnN1YmFycmF5KGVudHJ5LCBlbnRyeSArIFBFX1NFQ1RfTkFNRV9MRU4pOwogICAgY29uc3QgbnVsICAgID0gcmF3Tm0uaW5kZXhPZigwKTsKICAgIGNvbnN0IG5hbWUgICA9IHJhd05tLnN1YmFycmF5KDAsIG51bCA9PT0gLTEgPyByYXdObS5sZW5ndGggOiBudWwpLnRvU3RyaW5nKCdhc2NpaScpOwogICAgaWYgKG5hbWUgIT09IEJVTl9TRUNUSU9OX05BTUUpIGNvbnRpbnVlOwogICAgaWYgKG1hdGNoKSBkaWUoJ1BFIGhhcyBtdWx0aXBsZSAuYnVuIHNlY3Rpb25zJyk7CiAgICBjb25zdCByYXdTaXplICAgPSBidWYucmVhZFVJbnQzMkxFKGVudHJ5ICsgUEVfU0VDVF9SQVdfU0laRV9PRkYpOwogICAgY29uc3QgcmF3T2Zmc2V0ID0gYnVmLnJlYWRVSW50MzJMRShlbnRyeSArIFBFX1NFQ1RfUkFXX09GRl9PRkYpOwogICAgaWYgKHJhd09mZnNldCArIHJhd1NpemUgPiBidWYubGVuZ3RoKSBkaWUoJy5idW4gb3V0IG9mIGZpbGUgYm91bmRzJyk7CiAgICBtYXRjaCA9IHsgZm9ybWF0OiAnUEUnLCBvczogJ3dpbjMyJywgYXJjaCwgcmF3T2Zmc2V0LCByYXdTaXplIH07CiAgfQogIGlmICghbWF0Y2gpIGRpZSgnUEUgaGFzIG5vIC5idW4gc2VjdGlvbicpOwogIHJldHVybiBtYXRjaDsKfQoKZnVuY3Rpb24gZmluZEJ1blNlY3Rpb24oYnVmKSB7CiAgaWYgKGJ1Zi5sZW5ndGggPCA0KSBkaWUoJ2ZpbGUgdG9vIHNtYWxsJyk7CiAgY29uc3QgbWFnaWMgPSBidWYucmVhZFVJbnQzMkxFKDApOwogIGlmIChtYWdpYyA9PT0gRUxGX01BR0lDX0xFKSAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbmRTZWN0aW9uRWxmKGJ1Zik7CiAgaWYgKG1hZ2ljID09PSBNSF9NQUdJQ182NCkgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmluZFNlY3Rpb25NYWNobyhidWYpOwogIGlmIChtYWdpYyA9PT0gTUhfQ0lHQU1fNjQgfHwgbWFnaWMgPT09IE1IX0NJR0FNKSAgZGllKCdNYWNoLU86IG9ubHkgbGl0dGxlLWVuZGlhbiBzdXBwb3J0ZWQnKTsKICBpZiAobWFnaWMgPT09IE1IX01BR0lDKSAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpZSgnTWFjaC1POiBvbmx5IDY0LWJpdCBzdXBwb3J0ZWQnKTsKICByZXR1cm4gZmluZFNlY3Rpb25QZShidWYpOwp9CgovLyDilIDilIDilIAgUGF5bG9hZCArIG1vZHVsZSByZWNvcmRzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAoKZnVuY3Rpb24gcGFyc2VQYXlsb2FkKHNlY3Rpb25EYXRhKSB7CiAgaWYgKHNlY3Rpb25EYXRhLmxlbmd0aCA8IDgpIGRpZSgnLmJ1biB0b28gc21hbGwgZm9yIGxlbmd0aCBwcmVmaXgnKTsKICBjb25zdCBwYXlsb2FkU2l6ZSA9IHJlYWRVNjRMRShzZWN0aW9uRGF0YSwgMCwgJy5idW4gcGF5bG9hZCBsZW5ndGgnKTsKICBpZiAocGF5bG9hZFNpemUgKyA4ID4gc2VjdGlvbkRhdGEubGVuZ3RoKSBkaWUoJy5idW4gcGF5bG9hZCBleGNlZWRzIHJhdyBzZWN0aW9uJyk7CiAgY29uc3QgcGF5bG9hZCA9IHNlY3Rpb25EYXRhLnN1YmFycmF5KDgsIDggKyBwYXlsb2FkU2l6ZSk7CiAgaWYgKHBheWxvYWQubGVuZ3RoIDwgT0ZGU0VUX1NUUlVDVF9TSVpFICsgVFJBSUxFUi5sZW5ndGgpIGRpZSgnLmJ1biBwYXlsb2FkIHRvbyBzbWFsbCcpOwogIGlmICghcGF5bG9hZC5zdWJhcnJheShwYXlsb2FkLmxlbmd0aCAtIFRSQUlMRVIubGVuZ3RoKS5lcXVhbHMoVFJBSUxFUikpIGRpZSgnLmJ1biB0cmFpbGVyIG1pc21hdGNoJyk7CiAgcmV0dXJuIHBheWxvYWQ7Cn0KCmZ1bmN0aW9uIHBhcnNlT2Zmc2V0cyhwYXlsb2FkKSB7CiAgY29uc3Qgc3RhcnQgPSBwYXlsb2FkLmxlbmd0aCAtIFRSQUlMRVIubGVuZ3RoIC0gT0ZGU0VUX1NUUlVDVF9TSVpFOwogIHJldHVybiB7CiAgICBtb2R1bGVzX29mZnNldDogcGF5bG9hZC5yZWFkVUludDMyTEUoc3RhcnQgKyA4KSwKICAgIG1vZHVsZXNfc2l6ZTogICBwYXlsb2FkLnJlYWRVSW50MzJMRShzdGFydCArIDEyKSwKICAgIGVudHJ5X3BvaW50X2lkOiBwYXlsb2FkLnJlYWRVSW50MzJMRShzdGFydCArIDE2KSwKICB9Owp9CgpmdW5jdGlvbiBwYXJzZU1vZHVsZXMocGF5bG9hZCwgb2Zmc2V0cykgewogIGlmIChvZmZzZXRzLm1vZHVsZXNfc2l6ZSAlIE1PRFVMRV9SRUNPUkRfU0laRSAhPT0gMCkgewogICAgZGllKGBtb2R1bGVzIHRhYmxlIHNpemUgbm90IGEgbXVsdGlwbGUgb2YgJHtNT0RVTEVfUkVDT1JEX1NJWkV9OiAke29mZnNldHMubW9kdWxlc19zaXplfWApOwogIH0KICBjb25zdCBjb3VudCA9IG9mZnNldHMubW9kdWxlc19zaXplIC8gTU9EVUxFX1JFQ09SRF9TSVpFOwogIGlmIChvZmZzZXRzLmVudHJ5X3BvaW50X2lkID49IGNvdW50KSBkaWUoYGVudHJ5X3BvaW50X2lkICR7b2Zmc2V0cy5lbnRyeV9wb2ludF9pZH0gPj0gJHtjb3VudH1gKTsKICBjb25zdCB0YWJsZSA9IGNoZWNrZWRTbGljZShwYXlsb2FkLCBvZmZzZXRzLm1vZHVsZXNfb2Zmc2V0LCBvZmZzZXRzLm1vZHVsZXNfc2l6ZSwgJ21vZHVsZXMgdGFibGUnKTsKICBjb25zdCBvdXQgPSBbXTsKICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHsKICAgIGNvbnN0IHJlYyAgICAgICAgPSB0YWJsZS5zdWJhcnJheShpICogTU9EVUxFX1JFQ09SRF9TSVpFLCAoaSArIDEpICogTU9EVUxFX1JFQ09SRF9TSVpFKTsKICAgIGNvbnN0IG5hbWVPZmYgICAgPSByZWMucmVhZFVJbnQzMkxFKDApOwogICAgY29uc3QgbmFtZVNpemUgICA9IHJlYy5yZWFkVUludDMyTEUoNCk7CiAgICBjb25zdCBjb250ZW50T2ZmID0gcmVjLnJlYWRVSW50MzJMRSg4KTsKICAgIGNvbnN0IGNvbnRlbnRTaXplPSByZWMucmVhZFVJbnQzMkxFKDEyKTsKICAgIGNvbnN0IGxvYWRlcklkICAgPSByZWMucmVhZFVJbnQ4KDQ5KTsKICAgIGNvbnN0IG5hbWUgPSBkZWNvZGVOYW1lKGNoZWNrZWRTbGljZShwYXlsb2FkLCBuYW1lT2ZmLCBuYW1lU2l6ZSwgYG1vZHVsZVske2l9XS5uYW1lYCkpOwogICAgY29uc3QgY29udGVudCA9IGNoZWNrZWRTbGljZShwYXlsb2FkLCBjb250ZW50T2ZmLCBjb250ZW50U2l6ZSwgYG1vZHVsZVske2l9XS5jb250ZW50YCk7CiAgICBvdXQucHVzaCh7CiAgICAgIGluZGV4OiBpLAogICAgICBlbnRyeTogaSA9PT0gb2Zmc2V0cy5lbnRyeV9wb2ludF9pZCwKICAgICAgbmFtZSwKICAgICAgY29udGVudCwKICAgICAgbG9hZGVyOiBMT0FERVJTW2xvYWRlcklkXSA/PyBgdW5rbm93bigke2xvYWRlcklkfSlgLAogICAgfSk7CiAgfQogIHJldHVybiBvdXQ7Cn0KCi8vIOKUgOKUgOKUgCBPdXRwdXQgZGlzcGF0Y2gg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACgpmdW5jdGlvbiBuYXBpQmFzZW5hbWUobmFtZSkgewogIC8vIEJ1biByZWNvcmRzIG1heSB1c2UgZWl0aGVyICcvJyAoUE9TSVggYnVpbGRzKSBvciAnXFwnIChQRSkgYXMgc2VwYXJhdG9yOwogIC8vIGFsd2F5cyBub3JtYWxpemUgc28gYmFzZW5hbWUgZ3JhYnMgdGhlIHJpZ2h0IHRhaWwuCiAgY29uc3QgZmxhdCA9IG5hbWUucmVwbGFjZUFsbCgnXFwnLCAnLycpOwogIGNvbnN0IHRhaWwgPSBmbGF0LnNwbGl0KCcvJykucG9wKCkgPz8gJyc7CiAgcmV0dXJuIHRhaWwucmVwbGFjZSgvXC5ub2RlJC9pLCAnJyk7Cn0KCi8vIOKUgOKUgOKUgCBNYWluIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAoKZnVuY3Rpb24gbWFpbigpIHsKICBjb25zdCBbLCwgYmluYXJ5UGF0aCwgb3V0cHV0RGlyXSA9IHByb2Nlc3MuYXJndjsKICBpZiAoIWJpbmFyeVBhdGggfHwgIW91dHB1dERpcikgewogICAgY29uc29sZS5lcnJvcignVXNhZ2U6IGV4dHJhY3QtbmF0aXZlcy5tanMgPGJpbmFyeS1wYXRoPiA8b3V0cHV0LWRpcj4nKTsKICAgIHByb2Nlc3MuZXhpdCgxKTsKICB9CiAgaWYgKCFleGlzdHNTeW5jKGJpbmFyeVBhdGgpKSB7CiAgICBjb25zb2xlLmVycm9yKGBCaW5hcnkgbm90IGZvdW5kOiAke2JpbmFyeVBhdGh9YCk7CiAgICBwcm9jZXNzLmV4aXQoMSk7CiAgfQoKICBjb25zdCBidWYgPSByZWFkRmlsZVN5bmMoYmluYXJ5UGF0aCk7CiAgY29uc29sZS5sb2coYFNpemU6ICAgICR7KGJ1Zi5sZW5ndGggLyAxMDI0IC8gMTAyNCkudG9GaXhlZCgxKX0gTUJgKTsKCiAgY29uc3Qgc2VjdGlvbiA9IGZpbmRCdW5TZWN0aW9uKGJ1Zik7CiAgY29uc29sZS5sb2coYEZvcm1hdDogICR7c2VjdGlvbi5mb3JtYXR9ICgke3NlY3Rpb24uYXJjaH0tJHtzZWN0aW9uLm9zfSlgKTsKCiAgY29uc3Qgc2VjdGlvbkRhdGEgPSBjaGVja2VkU2xpY2UoYnVmLCBzZWN0aW9uLnJhd09mZnNldCwgc2VjdGlvbi5yYXdTaXplLCAnLmJ1biBzZWN0aW9uJyk7CiAgY29uc3QgcGF5bG9hZCAgICAgPSBwYXJzZVBheWxvYWQoc2VjdGlvbkRhdGEpOwogIGNvbnN0IG9mZnNldHMgICAgID0gcGFyc2VPZmZzZXRzKHBheWxvYWQpOwogIGNvbnN0IG1vZHVsZXMgICAgID0gcGFyc2VNb2R1bGVzKHBheWxvYWQsIG9mZnNldHMpOwogIGNvbnNvbGUubG9nKGBNb2R1bGVzOiAke21vZHVsZXMubGVuZ3RofSAoZW50cnkgaWQ9JHtvZmZzZXRzLmVudHJ5X3BvaW50X2lkfSlgKTsKCiAgbWtkaXJTeW5jKG91dHB1dERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7CgogIGxldCBjbGlDb3VudCA9IDAsIG5hcGlDb3VudCA9IDAsIGRyb3BwZWQgPSAwOwogIGZvciAoY29uc3QgbSBvZiBtb2R1bGVzKSB7CiAgICBpZiAobS5lbnRyeSkgewogICAgICBjb25zdCBvdXQgPSBqb2luKG91dHB1dERpciwgJ2NsaS5vcmlnaW5hbC5qcycpOwogICAgICB3cml0ZUZpbGVTeW5jKG91dCwgbS5jb250ZW50KTsKICAgICAgY29uc29sZS5sb2coYCAgY2xpLmpzICAgJHsobS5jb250ZW50Lmxlbmd0aCAvIDEwMjQgLyAxMDI0KS50b0ZpeGVkKDIpfSBNQiDihpIgJHtvdXR9ICgke20ubmFtZX0pYCk7CiAgICAgIGNsaUNvdW50Kys7CiAgICB9IGVsc2UgaWYgKG0ubG9hZGVyID09PSAnbmFwaScpIHsKICAgICAgY29uc3QgYmFzZSA9IG5hcGlCYXNlbmFtZShtLm5hbWUpOwogICAgICBpZiAoIWJhc2UpIHsgY29uc29sZS53YXJuKGAgIHNraXAgbmFwaSAke20ubmFtZX06IGVtcHR5IGJhc2VuYW1lYCk7IGRyb3BwZWQrKzsgY29udGludWU7IH0KICAgICAgY29uc3QgZGlyID0gam9pbihvdXRwdXREaXIsICd2ZW5kb3InLCBiYXNlLCBgJHtzZWN0aW9uLmFyY2h9LSR7c2VjdGlvbi5vc31gKTsKICAgICAgbWtkaXJTeW5jKGRpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7CiAgICAgIGNvbnN0IG91dCA9IGpvaW4oZGlyLCBgJHtiYXNlfS5ub2RlYCk7CiAgICAgIHdyaXRlRmlsZVN5bmMob3V0LCBtLmNvbnRlbnQpOwogICAgICBjb25zb2xlLmxvZyhgICBuYXBpICAgICAkeyhtLmNvbnRlbnQubGVuZ3RoIC8gMTAyNCkudG9GaXhlZCgwKS5wYWRTdGFydCg1KX0gS0Ig4oaSICR7b3V0fWApOwogICAgICBuYXBpQ291bnQrKzsKICAgIH0gZWxzZSB7CiAgICAgIGRyb3BwZWQrKzsKICAgIH0KICB9CiAgY29uc29sZS5sb2coYEV4dHJhY3RlZDogJHtjbGlDb3VudH0gY2xpLmpzICsgJHtuYXBpQ291bnR9IG5hcGkgKCR7ZHJvcHBlZH0gZHJvcHBlZClgKTsKICBpZiAoY2xpQ291bnQgIT09IDEpIHsKICAgIGNvbnNvbGUuZXJyb3IoYGVycm9yOiBleHBlY3RlZCBleGFjdGx5IDEgZW50cnktcG9pbnQsIGdvdCAke2NsaUNvdW50fWApOwogICAgcHJvY2Vzcy5leGl0KDIpOwogIH0KfQoKbWFpbigpOwo=')
[System.IO.File]::WriteAllBytes($extractorPath, $ExtractorBytes)

# ─── Extract cli.js + native modules from Bun binary ──────────

# Single extractor pass: writes cli.original.js to $ClawDir and creates
# vendor\<name>\<arch>-<os>\<name>.node for every napi module in one go.
$VendorDir = Join-Path $ClawDir "vendor"
if (Test-Path $VendorDir) {
    Get-ChildItem -Force $VendorDir | Where-Object { $_.Name -ne "ripgrep" } | Remove-Item -Recurse -Force
}

$dstCli = Join-Path $ClawDir "cli.original.js"
if (Test-Path $dstCli) { Remove-Item -Force $dstCli }

Write-Dim "Extracting cli.js + napi modules from $NativeBinLabel ..."
& $BunBin $extractorPath $NativeBin $ClawDir 2>&1 | ForEach-Object { Write-Host "  $_" }
if (-not (Test-Path $dstCli)) {
    Write-Err "Failed to extract cli.js from native binary"
    exit 1
}

# Note: keep extractorPath around — repatch.mjs uses it on version drift

# ─── Post-process cli.js for Bun runtime ──────────────────────

Write-Dim "Rewriting bunfs paths and IIFE invocation ..."
$postProc = Join-Path $ClawDir "post-process.mjs"
$PostProcessorBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCmltcG9ydCB7IHJlYWRGaWxlU3luYywgd3JpdGVGaWxlU3luYywgdW5saW5rU3luYyB9IGZyb20gJ2ZzJzsKaW1wb3J0IHsgZGlybmFtZSB9IGZyb20gJ3BhdGgnOwppbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAndXJsJzsKCmNvbnN0IGhlcmUgPSBkaXJuYW1lKGZpbGVVUkxUb1BhdGgoaW1wb3J0Lm1ldGEudXJsKSk7CmNvbnN0IHNyYyA9IGAke2hlcmV9L2NsaS5vcmlnaW5hbC5qc2A7CmNvbnN0IGRzdCA9IGAke2hlcmV9L2NsaS5vcmlnaW5hbC5janNgOwoKbGV0IGNvZGUgPSByZWFkRmlsZVN5bmMoc3JjLCAndXRmOCcpOwoKLy8gU3RyaXAgbGVhZGluZyBAYnVuIHByYWdtYSBjb21tZW50cyAoZS5nLiAiLy8gQGJ1biBAYnl0ZWNvZGUgQGJ1bi1janNcbiIpCi8vIEJ1biByZXF1aXJlcyB0aGUgZmlsZSB0byBzdGFydCBkaXJlY3RseSB3aXRoICIoZnVuY3Rpb24iIHRvIHJlY29nbml6ZQovLyB0aGUgQ29tbW9uSlMgd3JhcHBlcjsgYW55IHByZWNlZGluZyBjb21tZW50IGJyZWFrcyB0aGF0IGRldGVjdGlvbi4KY29kZSA9IGNvZGUucmVwbGFjZSgvXig/OlwvXC9bXlxuXSpcbikrLywgJycpOwoKLy8gKDEpIGJ1bmZzIC5ub2RlIG1vZHVsZSBwYXRocyDihpIgcnVudGltZSB2ZW5kb3IgbG9va3VwCmNvZGUgPSBjb2RlLnJlcGxhY2UoCiAgL3JlcXVpcmVcKFsnIl0oXC9cJGJ1bmZzXC9yb290XC8oW1x3LV0rKVwubm9kZSlbJyJdXCkvZywKICAobSwgX2Z1bGwsIG5hbWUpID0+CiAgICBgcmVxdWlyZShyZXF1aXJlKCdwYXRoJykuam9pbihfX2Rpcm5hbWUsJ3ZlbmRvcicsJHtKU09OLnN0cmluZ2lmeShuYW1lKX0sXGBcJHtwcm9jZXNzLmFyY2g9PT0nYXJtNjQnPydhcm02NCc6J3g2NCd9LVwke3Byb2Nlc3MucGxhdGZvcm09PT0nZGFyd2luJz8nZGFyd2luJzpwcm9jZXNzLnBsYXRmb3JtPT09J2xpbnV4Jz8nbGludXgnOid3aW4zMid9XGAsJHtKU09OLnN0cmluZ2lmeShuYW1lICsgJy5ub2RlJyl9KSlgLAopOwoKLy8gKDIpIGJ1aWxkLXRpbWUgZmlsZVVSTFRvUGF0aCgpIGxlYWtzIOKGkiB1c2UgY2xpLmNqcydzIG93biBfX2ZpbGVuYW1lCmNvZGUgPSBjb2RlLnJlcGxhY2UoCiAgL1tcdyRdK1wuZmlsZVVSTFRvUGF0aFwoImZpbGU6XC9cL1wvaG9tZVwvcnVubmVyXC93b3JrXC9jbGF1ZGUtY2xpLWludGVybmFsXC9jbGF1ZGUtY2xpLWludGVybmFsXC9bXiJdKiJcKS9nLAogICgpID0+ICdfX2ZpbGVuYW1lJywKKTsKCi8vICgzKSBtYWtlIHRoZSBvdXRlciAoZnVuY3Rpb24oLi4uKXsuLi59KSBhY3R1YWxseSBydW4KY29kZSA9IGNvZGUucmVwbGFjZSgvXH1cKVxzKiQvLCAnfSkoZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlLCBfX2ZpbGVuYW1lLCBfX2Rpcm5hbWUpJyk7Cgp3cml0ZUZpbGVTeW5jKGRzdCwgY29kZSk7CnVubGlua1N5bmMoc3JjKTsKY29uc29sZS5sb2coYGNsaS5vcmlnaW5hbC5janM6ICR7Y29kZS5sZW5ndGh9IGJ5dGVzYCk7Cg==')
[System.IO.File]::WriteAllBytes($postProc, $PostProcessorBytes)
& $BunBin $postProc 2>&1 | ForEach-Object { Write-Host "  $_" }
if (-not (Test-Path (Join-Path $ClawDir "cli.original.cjs"))) {
    Write-Err "Post-process failed"
    exit 1
}

# Stamp source version so wrapper can detect drift on next launch
Set-Content -Path (Join-Path $ClawDir ".source-version") -Value $NativeBinLabel -Encoding ASCII

# If we pulled the binary from npm into a tmpdir, clean up — extraction
# is done; drift detection only consults %USERPROFILE%\.local\share\claude\versions\.
if ($NativeBinTmpDir -and (Test-Path $NativeBinTmpDir)) {
    Remove-Item -Recurse -Force $NativeBinTmpDir -ErrorAction SilentlyContinue
}

Write-OK "cli.original.cjs ready ($NativeBinLabel)"

}  # end -NoUpgrade skip

# ─── Write re-patch helper (used by wrapper on version drift) ─────────

$RepatcherBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCi8vIFJlLWV4dHJhY3QgKyBwb3N0LXByb2Nlc3MgKyBwYXRjaCB0aGUgdXNlcidzIGN1cnJlbnRseS1pbnN0YWxsZWQKLy8gbmF0aXZlIENsYXVkZSBiaW5hcnkuIEludm9rZWQgYnkgY2xpLmNqcyB3aGVuIGl0IGRldGVjdHMgdGhhdAovLyAuc291cmNlLXZlcnNpb24gbm8gbG9uZ2VyIG1hdGNoZXMgdGhlIGxhdGVzdCBiaW5hcnkgaW4gdmVyc2lvbnMvLgppbXBvcnQgeyBzcGF3blN5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJzsKaW1wb3J0IHsgd3JpdGVGaWxlU3luYywgZXhpc3RzU3luYywgbWtkaXJTeW5jLCByZWFkZGlyU3luYywgcm1TeW5jIH0gZnJvbSAnZnMnOwppbXBvcnQgeyBkaXJuYW1lLCBqb2luLCBiYXNlbmFtZSB9IGZyb20gJ3BhdGgnOwppbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAndXJsJzsKCmNvbnN0IGhlcmUgPSBkaXJuYW1lKGZpbGVVUkxUb1BhdGgoaW1wb3J0Lm1ldGEudXJsKSk7CmNvbnN0IG5hdGl2ZUJpbiA9IHByb2Nlc3MuYXJndlsyXTsKCmlmICghbmF0aXZlQmluIHx8ICFleGlzdHNTeW5jKG5hdGl2ZUJpbikpIHsKICBjb25zb2xlLmVycm9yKCdyZXBhdGNoOiBuYXRpdmUgYmluYXJ5IHBhdGggcmVxdWlyZWQgYW5kIG11c3QgZXhpc3QnKTsKICBwcm9jZXNzLmV4aXQoMSk7Cn0KCmNvbnN0IHZlbmRvckRpciA9IGpvaW4oaGVyZSwgJ3ZlbmRvcicpOwppZiAoZXhpc3RzU3luYyh2ZW5kb3JEaXIpKSB7CiAgZm9yIChjb25zdCBlbnRyeSBvZiByZWFkZGlyU3luYyh2ZW5kb3JEaXIpKSB7CiAgICBpZiAoZW50cnkgIT09ICdyaXBncmVwJykgcm1TeW5jKGpvaW4odmVuZG9yRGlyLCBlbnRyeSksIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTsKICB9Cn0Kcm1TeW5jKGpvaW4oaGVyZSwgJ2NsaS5vcmlnaW5hbC5qcycpLCB7IGZvcmNlOiB0cnVlIH0pOwoKY29uc3QgcnVudGltZSA9IHByb2Nlc3MuZXhlY1BhdGg7CgpmdW5jdGlvbiBydW4obGFiZWwsIGFyZ3MpIHsKICBjb25zdCByID0gc3Bhd25TeW5jKHJ1bnRpbWUsIGFyZ3MsIHsgY3dkOiBoZXJlLCBzdGRpbzogJ2luaGVyaXQnIH0pOwogIGlmIChyLnN0YXR1cyAhPT0gMCkgewogICAgY29uc29sZS5lcnJvcihgcmVwYXRjaDogJHtsYWJlbH0gZmFpbGVkIChleGl0ICR7ci5zdGF0dXN9KWApOwogICAgcHJvY2Vzcy5leGl0KDEpOwogIH0KfQoKY29uc3QgZXh0cmFjdG9yID0gam9pbihoZXJlLCAnZXh0cmFjdC1uYXRpdmVzLm1qcycpOwpjb25zdCBwb3N0UHJvYyA9IGpvaW4oaGVyZSwgJ3Bvc3QtcHJvY2Vzcy5tanMnKTsKY29uc3QgcGF0Y2hlciA9IGpvaW4oaGVyZSwgJ3BhdGNoLm1qcycpOwoKcnVuKCdleHRyYWN0JywgW2V4dHJhY3RvciwgbmF0aXZlQmluLCBoZXJlXSk7CnJ1bigncG9zdC1wcm9jZXNzJywgW3Bvc3RQcm9jXSk7CnJ1bigncGF0Y2hlcicsIFtwYXRjaGVyXSk7Cgp3cml0ZUZpbGVTeW5jKGpvaW4oaGVyZSwgJy5zb3VyY2UtdmVyc2lvbicpLCBiYXNlbmFtZShuYXRpdmVCaW4pICsgJ1xuJyk7CmNvbnNvbGUubG9nKGBbY2xhd2dvZF0gcmUtcGF0Y2hlZCB0byAke2Jhc2VuYW1lKG5hdGl2ZUJpbil9YCk7Cg==')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "repatch.mjs"), $RepatcherBytes)
Write-OK "Re-patch helper installed (repatch.mjs)"

# ─── Write OpenAI-compatible proxy ────────────────────────────

$OpenAIProxyBytes = [Convert]::FromBase64String('J3VzZSBzdHJpY3QnOwovLyBBbnRocm9waWMgTWVzc2FnZXMgQVBJIDwtPiBPcGVuQUkgQ2hhdCBDb21wbGV0aW9ucyBBUEkgdHJhbnNsYXRpb24gcHJveHkKLy8gQWxsb3dzIENsYXVkZSBDb2RlIHRvIHVzZSB4QUkvR3JvayBhbmQgb3RoZXIgT3BlbkFJLWNvbXBhdGlibGUgQVBJcwoKZnVuY3Rpb24gdHJhbnNsYXRlU3lzdGVtKHN5c3RlbSkgewogIGlmICghc3lzdGVtKSByZXR1cm4gW107CiAgaWYgKHR5cGVvZiBzeXN0ZW0gPT09ICdzdHJpbmcnKSByZXR1cm4gW3sgcm9sZTogJ3N5c3RlbScsIGNvbnRlbnQ6IHN5c3RlbSB9XTsKICBpZiAoQXJyYXkuaXNBcnJheShzeXN0ZW0pKSB7CiAgICB2YXIgdGV4dCA9IHN5c3RlbS5maWx0ZXIoZnVuY3Rpb24gKGIpIHsgcmV0dXJuIGIudHlwZSA9PT0gJ3RleHQnOyB9KS5tYXAoZnVuY3Rpb24gKGIpIHsgcmV0dXJuIGIudGV4dDsgfSkuam9pbignXG4nKTsKICAgIHJldHVybiB0ZXh0ID8gW3sgcm9sZTogJ3N5c3RlbScsIGNvbnRlbnQ6IHRleHQgfV0gOiBbXTsKICB9CiAgcmV0dXJuIFtdOwp9CgpmdW5jdGlvbiB0cmFuc2xhdGVNZXNzYWdlcyhtc2dzKSB7CiAgdmFyIG91dCA9IFtdOwogIGZvciAodmFyIGkgPSAwOyBpIDwgbXNncy5sZW5ndGg7IGkrKykgewogICAgdmFyIG1zZyA9IG1zZ3NbaV07CiAgICBpZiAobXNnLnJvbGUgPT09ICd1c2VyJykgewogICAgICBpZiAodHlwZW9mIG1zZy5jb250ZW50ID09PSAnc3RyaW5nJykgeyBvdXQucHVzaCh7IHJvbGU6ICd1c2VyJywgY29udGVudDogbXNnLmNvbnRlbnQgfSk7IGNvbnRpbnVlOyB9CiAgICAgIGlmICghQXJyYXkuaXNBcnJheShtc2cuY29udGVudCkpIGNvbnRpbnVlOwogICAgICB2YXIgdG9vbFJlc3VsdHMgPSBbXSwgb3RoZXJCbG9ja3MgPSBbXTsKICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBtc2cuY29udGVudC5sZW5ndGg7IGorKykgewogICAgICAgIGlmIChtc2cuY29udGVudFtqXS50eXBlID09PSAndG9vbF9yZXN1bHQnKSB0b29sUmVzdWx0cy5wdXNoKG1zZy5jb250ZW50W2pdKTsKICAgICAgICBlbHNlIG90aGVyQmxvY2tzLnB1c2gobXNnLmNvbnRlbnRbal0pOwogICAgICB9CiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgdG9vbFJlc3VsdHMubGVuZ3RoOyBrKyspIHsKICAgICAgICB2YXIgdHIgPSB0b29sUmVzdWx0c1trXSwgY29udGVudCA9ICcnOwogICAgICAgIGlmICh0eXBlb2YgdHIuY29udGVudCA9PT0gJ3N0cmluZycpIGNvbnRlbnQgPSB0ci5jb250ZW50OwogICAgICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodHIuY29udGVudCkpIGNvbnRlbnQgPSB0ci5jb250ZW50LmZpbHRlcihmdW5jdGlvbiAoYikgeyByZXR1cm4gYi50eXBlID09PSAndGV4dCc7IH0pLm1hcChmdW5jdGlvbiAoYikgeyByZXR1cm4gYi50ZXh0OyB9KS5qb2luKCdcbicpOwogICAgICAgIGlmICh0ci5pc19lcnJvcikgY29udGVudCA9ICdbRVJST1JdICcgKyBjb250ZW50OwogICAgICAgIG91dC5wdXNoKHsgcm9sZTogJ3Rvb2wnLCB0b29sX2NhbGxfaWQ6IHRyLnRvb2xfdXNlX2lkLCBjb250ZW50OiBjb250ZW50IHx8ICcnIH0pOwogICAgICB9CiAgICAgIGlmIChvdGhlckJsb2Nrcy5sZW5ndGggPiAwKSB7CiAgICAgICAgdmFyIHBhcnRzID0gW107CiAgICAgICAgZm9yICh2YXIgbCA9IDA7IGwgPCBvdGhlckJsb2Nrcy5sZW5ndGg7IGwrKykgewogICAgICAgICAgdmFyIGJsb2NrID0gb3RoZXJCbG9ja3NbbF07CiAgICAgICAgICBpZiAoYmxvY2sudHlwZSA9PT0gJ3RleHQnKSBwYXJ0cy5wdXNoKHsgdHlwZTogJ3RleHQnLCB0ZXh0OiBibG9jay50ZXh0IH0pOwogICAgICAgICAgZWxzZSBpZiAoYmxvY2sudHlwZSA9PT0gJ2ltYWdlJykgewogICAgICAgICAgICB2YXIgdXJsID0gYmxvY2suc291cmNlLnR5cGUgPT09ICdiYXNlNjQnID8gJ2RhdGE6JyArIGJsb2NrLnNvdXJjZS5tZWRpYV90eXBlICsgJztiYXNlNjQsJyArIGJsb2NrLnNvdXJjZS5kYXRhIDogYmxvY2suc291cmNlLnVybDsKICAgICAgICAgICAgcGFydHMucHVzaCh7IHR5cGU6ICdpbWFnZV91cmwnLCBpbWFnZV91cmw6IHsgdXJsOiB1cmwgfSB9KTsKICAgICAgICAgIH0KICAgICAgICB9CiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMSAmJiBwYXJ0c1swXS50eXBlID09PSAndGV4dCcpIG91dC5wdXNoKHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiBwYXJ0c1swXS50ZXh0IH0pOwogICAgICAgIGVsc2UgaWYgKHBhcnRzLmxlbmd0aCA+IDApIG91dC5wdXNoKHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiBwYXJ0cyB9KTsKICAgICAgfQogICAgfSBlbHNlIGlmIChtc2cucm9sZSA9PT0gJ2Fzc2lzdGFudCcpIHsKICAgICAgaWYgKHR5cGVvZiBtc2cuY29udGVudCA9PT0gJ3N0cmluZycpIHsgb3V0LnB1c2goeyByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogbXNnLmNvbnRlbnQgfSk7IGNvbnRpbnVlOyB9CiAgICAgIGlmICghQXJyYXkuaXNBcnJheShtc2cuY29udGVudCkpIGNvbnRpbnVlOwogICAgICB2YXIgdGV4dENvbnRlbnQgPSAnJywgdG9vbENhbGxzID0gW107CiAgICAgIGZvciAodmFyIG0gPSAwOyBtIDwgbXNnLmNvbnRlbnQubGVuZ3RoOyBtKyspIHsKICAgICAgICB2YXIgYiA9IG1zZy5jb250ZW50W21dOwogICAgICAgIGlmIChiLnR5cGUgPT09ICd0ZXh0JykgdGV4dENvbnRlbnQgKz0gYi50ZXh0OwogICAgICAgIGVsc2UgaWYgKGIudHlwZSA9PT0gJ3Rvb2xfdXNlJykgdG9vbENhbGxzLnB1c2goeyBpZDogYi5pZCwgdHlwZTogJ2Z1bmN0aW9uJywgZnVuY3Rpb246IHsgbmFtZTogYi5uYW1lLCBhcmd1bWVudHM6IHR5cGVvZiBiLmlucHV0ID09PSAnc3RyaW5nJyA/IGIuaW5wdXQgOiBKU09OLnN0cmluZ2lmeShiLmlucHV0KSB9IH0pOwogICAgICB9CiAgICAgIHZhciBhc3Npc3RhbnRNc2cgPSB7IHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiB0ZXh0Q29udGVudCB8fCBudWxsIH07CiAgICAgIGlmICh0b29sQ2FsbHMubGVuZ3RoID4gMCkgYXNzaXN0YW50TXNnLnRvb2xfY2FsbHMgPSB0b29sQ2FsbHM7CiAgICAgIG91dC5wdXNoKGFzc2lzdGFudE1zZyk7CiAgICB9CiAgfQogIHJldHVybiBvdXQ7Cn0KCmZ1bmN0aW9uIHRyYW5zbGF0ZVRvb2xzKHRvb2xzKSB7CiAgaWYgKCF0b29scyB8fCB0b29scy5sZW5ndGggPT09IDApIHJldHVybiB1bmRlZmluZWQ7CiAgcmV0dXJuIHRvb2xzLm1hcChmdW5jdGlvbiAodCkgewogICAgcmV0dXJuIHsgdHlwZTogJ2Z1bmN0aW9uJywgZnVuY3Rpb246IHsgbmFtZTogdC5uYW1lLCBkZXNjcmlwdGlvbjogdC5kZXNjcmlwdGlvbiB8fCAnJywgcGFyYW1ldGVyczogdC5pbnB1dF9zY2hlbWEgfHwgeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSB9IH07CiAgfSk7Cn0KCmZ1bmN0aW9uIHN0cmlwQ2FjaGVDb250cm9sKG9iaikgewogIGlmICghb2JqIHx8IHR5cGVvZiBvYmogIT09ICdvYmplY3QnKSByZXR1cm4gb2JqOwogIGlmIChBcnJheS5pc0FycmF5KG9iaikpIHJldHVybiBvYmoubWFwKHN0cmlwQ2FjaGVDb250cm9sKTsKICB2YXIgb3V0ID0ge307CiAgZm9yICh2YXIga2V5IGluIG9iaikgeyBpZiAoa2V5ID09PSAnY2FjaGVfY29udHJvbCcpIGNvbnRpbnVlOyBvdXRba2V5XSA9IHN0cmlwQ2FjaGVDb250cm9sKG9ialtrZXldKTsgfQogIHJldHVybiBvdXQ7Cn0KCmZ1bmN0aW9uIHRyYW5zbGF0ZVJlcXVlc3QoYm9keSkgewogIHZhciBjbGVhbmVkID0gc3RyaXBDYWNoZUNvbnRyb2woYm9keSk7CiAgdmFyIHN5c3RlbU1zZ3MgPSB0cmFuc2xhdGVTeXN0ZW0oY2xlYW5lZC5zeXN0ZW0pOwogIHZhciB1c2VyTXNncyA9IHRyYW5zbGF0ZU1lc3NhZ2VzKGNsZWFuZWQubWVzc2FnZXMgfHwgW10pOwogIHZhciBvcGVuYWlCb2R5ID0geyBtb2RlbDogY2xlYW5lZC5tb2RlbCwgbWVzc2FnZXM6IHN5c3RlbU1zZ3MuY29uY2F0KHVzZXJNc2dzKSwgc3RyZWFtOiAhIWNsZWFuZWQuc3RyZWFtIH07CiAgaWYgKGNsZWFuZWQubWF4X3Rva2Vucykgb3BlbmFpQm9keS5tYXhfdG9rZW5zID0gY2xlYW5lZC5tYXhfdG9rZW5zOwogIGlmIChjbGVhbmVkLnRlbXBlcmF0dXJlICE9PSB1bmRlZmluZWQpIG9wZW5haUJvZHkudGVtcGVyYXR1cmUgPSBjbGVhbmVkLnRlbXBlcmF0dXJlOwogIGlmIChjbGVhbmVkLnRvcF9wICE9PSB1bmRlZmluZWQpIG9wZW5haUJvZHkudG9wX3AgPSBjbGVhbmVkLnRvcF9wOwogIGlmIChjbGVhbmVkLnN0b3Bfc2VxdWVuY2VzKSBvcGVuYWlCb2R5LnN0b3AgPSBjbGVhbmVkLnN0b3Bfc2VxdWVuY2VzOwogIHZhciB0b29scyA9IHRyYW5zbGF0ZVRvb2xzKGNsZWFuZWQudG9vbHMpOwogIGlmICh0b29scykgb3BlbmFpQm9keS50b29scyA9IHRvb2xzOwogIGlmIChjbGVhbmVkLnN0cmVhbSkgb3BlbmFpQm9keS5zdHJlYW1fb3B0aW9ucyA9IHsgaW5jbHVkZV91c2FnZTogdHJ1ZSB9OwogIHJldHVybiBvcGVuYWlCb2R5Owp9CgpmdW5jdGlvbiBtYXBGaW5pc2hSZWFzb24ocmVhc29uKSB7CiAgaWYgKHJlYXNvbiA9PT0gJ3N0b3AnKSByZXR1cm4gJ2VuZF90dXJuJzsKICBpZiAocmVhc29uID09PSAndG9vbF9jYWxscycpIHJldHVybiAndG9vbF91c2UnOwogIGlmIChyZWFzb24gPT09ICdsZW5ndGgnKSByZXR1cm4gJ21heF90b2tlbnMnOwogIHJldHVybiAnZW5kX3R1cm4nOwp9CgpmdW5jdGlvbiB0cmFuc2xhdGVSZXNwb25zZShvcGVuYWlSZXNwLCByZXF1ZXN0TW9kZWwpIHsKICB2YXIgY2hvaWNlID0gb3BlbmFpUmVzcC5jaG9pY2VzICYmIG9wZW5haVJlc3AuY2hvaWNlc1swXTsKICBpZiAoIWNob2ljZSkgcmV0dXJuIHsgaWQ6ICdtc2dfcHJveHlfZXJyb3InLCB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdObyByZXNwb25zZSBmcm9tIHVwc3RyZWFtIEFQSScgfV0sIG1vZGVsOiByZXF1ZXN0TW9kZWwsIHN0b3BfcmVhc29uOiAnZW5kX3R1cm4nLCBzdG9wX3NlcXVlbmNlOiBudWxsLCB1c2FnZTogeyBpbnB1dF90b2tlbnM6IDAsIG91dHB1dF90b2tlbnM6IDAgfSB9OwogIHZhciBjb250ZW50ID0gW107CiAgaWYgKGNob2ljZS5tZXNzYWdlLmNvbnRlbnQpIGNvbnRlbnQucHVzaCh7IHR5cGU6ICd0ZXh0JywgdGV4dDogY2hvaWNlLm1lc3NhZ2UuY29udGVudCB9KTsKICBpZiAoY2hvaWNlLm1lc3NhZ2UudG9vbF9jYWxscykgewogICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaG9pY2UubWVzc2FnZS50b29sX2NhbGxzLmxlbmd0aDsgaSsrKSB7CiAgICAgIHZhciB0YyA9IGNob2ljZS5tZXNzYWdlLnRvb2xfY2FsbHNbaV0sIGlucHV0ID0ge307CiAgICAgIHRyeSB7IGlucHV0ID0gSlNPTi5wYXJzZSh0Yy5mdW5jdGlvbi5hcmd1bWVudHMgfHwgJ3t9Jyk7IH0gY2F0Y2ggKGUpIHt9CiAgICAgIGNvbnRlbnQucHVzaCh7IHR5cGU6ICd0b29sX3VzZScsIGlkOiB0Yy5pZCwgbmFtZTogdGMuZnVuY3Rpb24ubmFtZSwgaW5wdXQ6IGlucHV0IH0pOwogICAgfQogIH0KICBpZiAoY29udGVudC5sZW5ndGggPT09IDApIGNvbnRlbnQucHVzaCh7IHR5cGU6ICd0ZXh0JywgdGV4dDogJycgfSk7CiAgcmV0dXJuIHsgaWQ6IG9wZW5haVJlc3AuaWQgfHwgKCdtc2dfJyArIERhdGUubm93KCkpLCB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBjb250ZW50LCBtb2RlbDogcmVxdWVzdE1vZGVsIHx8IG9wZW5haVJlc3AubW9kZWwsIHN0b3BfcmVhc29uOiBtYXBGaW5pc2hSZWFzb24oY2hvaWNlLmZpbmlzaF9yZWFzb24pLCBzdG9wX3NlcXVlbmNlOiBudWxsLCB1c2FnZTogeyBpbnB1dF90b2tlbnM6IChvcGVuYWlSZXNwLnVzYWdlICYmIG9wZW5haVJlc3AudXNhZ2UucHJvbXB0X3Rva2VucykgfHwgMCwgb3V0cHV0X3Rva2VuczogKG9wZW5haVJlc3AudXNhZ2UgJiYgb3BlbmFpUmVzcC51c2FnZS5jb21wbGV0aW9uX3Rva2VucykgfHwgMCB9IH07Cn0KCmZ1bmN0aW9uIHNzZShldmVudCwgZGF0YSkgeyByZXR1cm4gJ2V2ZW50OiAnICsgZXZlbnQgKyAnXG5kYXRhOiAnICsgSlNPTi5zdHJpbmdpZnkoZGF0YSkgKyAnXG5cbic7IH0KCmZ1bmN0aW9uIGNyZWF0ZVN0cmVhbVRyYW5zbGF0b3IocmVxdWVzdE1vZGVsKSB7CiAgdmFyIHN0YXRlID0geyBtb2RlbDogcmVxdWVzdE1vZGVsLCBibG9ja0luZGV4OiAwLCBzZW50U3RhcnQ6IGZhbHNlLCBpblRleHQ6IGZhbHNlLCB0Y0J1ZnM6IHt9LCBpblRvazogMCwgb3V0VG9rOiAwLCBtc2dJZDogJ21zZ18nICsgRGF0ZS5ub3coKSB9OwogIHJldHVybiBmdW5jdGlvbiAoY2h1bmspIHsKICAgIHZhciBldmVudHMgPSBbXTsKICAgIGlmICghc3RhdGUuc2VudFN0YXJ0KSB7CiAgICAgIHN0YXRlLnNlbnRTdGFydCA9IHRydWU7CiAgICAgIGlmIChjaHVuay5pZCkgc3RhdGUubXNnSWQgPSBjaHVuay5pZDsKICAgICAgZXZlbnRzLnB1c2goc3NlKCdtZXNzYWdlX3N0YXJ0JywgeyB0eXBlOiAnbWVzc2FnZV9zdGFydCcsIG1lc3NhZ2U6IHsgaWQ6IHN0YXRlLm1zZ0lkLCB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbXSwgbW9kZWw6IHN0YXRlLm1vZGVsIHx8IGNodW5rLm1vZGVsLCBzdG9wX3JlYXNvbjogbnVsbCwgc3RvcF9zZXF1ZW5jZTogbnVsbCwgdXNhZ2U6IHsgaW5wdXRfdG9rZW5zOiAwLCBvdXRwdXRfdG9rZW5zOiAwIH0gfSB9KSk7CiAgICAgIGV2ZW50cy5wdXNoKHNzZSgncGluZycsIHsgdHlwZTogJ3BpbmcnIH0pKTsKICAgIH0KICAgIHZhciBjaG9pY2UgPSBjaHVuay5jaG9pY2VzICYmIGNodW5rLmNob2ljZXNbMF07CiAgICBpZiAoIWNob2ljZSkgeyBpZiAoY2h1bmsudXNhZ2UpIHsgc3RhdGUuaW5Ub2sgPSBjaHVuay51c2FnZS5wcm9tcHRfdG9rZW5zIHx8IDA7IHN0YXRlLm91dFRvayA9IGNodW5rLnVzYWdlLmNvbXBsZXRpb25fdG9rZW5zIHx8IDA7IH0gcmV0dXJuIGV2ZW50czsgfQogICAgdmFyIGRlbHRhID0gY2hvaWNlLmRlbHRhIHx8IHt9OwogICAgaWYgKGRlbHRhLmNvbnRlbnQpIHsKICAgICAgaWYgKCFzdGF0ZS5pblRleHQpIHsgc3RhdGUuaW5UZXh0ID0gdHJ1ZTsgZXZlbnRzLnB1c2goc3NlKCdjb250ZW50X2Jsb2NrX3N0YXJ0JywgeyB0eXBlOiAnY29udGVudF9ibG9ja19zdGFydCcsIGluZGV4OiBzdGF0ZS5ibG9ja0luZGV4LCBjb250ZW50X2Jsb2NrOiB7IHR5cGU6ICd0ZXh0JywgdGV4dDogJycgfSB9KSk7IH0KICAgICAgZXZlbnRzLnB1c2goc3NlKCdjb250ZW50X2Jsb2NrX2RlbHRhJywgeyB0eXBlOiAnY29udGVudF9ibG9ja19kZWx0YScsIGluZGV4OiBzdGF0ZS5ibG9ja0luZGV4LCBkZWx0YTogeyB0eXBlOiAndGV4dF9kZWx0YScsIHRleHQ6IGRlbHRhLmNvbnRlbnQgfSB9KSk7CiAgICB9CiAgICBpZiAoZGVsdGEudG9vbF9jYWxscykgewogICAgICBpZiAoc3RhdGUuaW5UZXh0KSB7IGV2ZW50cy5wdXNoKHNzZSgnY29udGVudF9ibG9ja19zdG9wJywgeyB0eXBlOiAnY29udGVudF9ibG9ja19zdG9wJywgaW5kZXg6IHN0YXRlLmJsb2NrSW5kZXggfSkpOyBzdGF0ZS5ibG9ja0luZGV4Kys7IHN0YXRlLmluVGV4dCA9IGZhbHNlOyB9CiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVsdGEudG9vbF9jYWxscy5sZW5ndGg7IGkrKykgewogICAgICAgIHZhciB0YyA9IGRlbHRhLnRvb2xfY2FsbHNbaV0sIGlkeCA9IHRjLmluZGV4OwogICAgICAgIGlmICghc3RhdGUudGNCdWZzW2lkeF0pIHsKICAgICAgICAgIHZhciB0Y0lkID0gdGMuaWQgfHwgKCd0b29sdV8nICsgRGF0ZS5ub3coKSArICdfJyArIGlkeCksIHRjTmFtZSA9ICh0Yy5mdW5jdGlvbiAmJiB0Yy5mdW5jdGlvbi5uYW1lKSB8fCAnJzsKICAgICAgICAgIHN0YXRlLnRjQnVmc1tpZHhdID0geyBpZDogdGNJZCwgbmFtZTogdGNOYW1lLCBiaTogc3RhdGUuYmxvY2tJbmRleCB9OwogICAgICAgICAgZXZlbnRzLnB1c2goc3NlKCdjb250ZW50X2Jsb2NrX3N0YXJ0JywgeyB0eXBlOiAnY29udGVudF9ibG9ja19zdGFydCcsIGluZGV4OiBzdGF0ZS5ibG9ja0luZGV4LCBjb250ZW50X2Jsb2NrOiB7IHR5cGU6ICd0b29sX3VzZScsIGlkOiB0Y0lkLCBuYW1lOiB0Y05hbWUsIGlucHV0OiB7fSB9IH0pKTsKICAgICAgICAgIHN0YXRlLmJsb2NrSW5kZXgrKzsKICAgICAgICB9CiAgICAgICAgdmFyIGJ1ZiA9IHN0YXRlLnRjQnVmc1tpZHhdOwogICAgICAgIGlmICh0Yy5mdW5jdGlvbiAmJiB0Yy5mdW5jdGlvbi5uYW1lKSBidWYubmFtZSA9IHRjLmZ1bmN0aW9uLm5hbWU7CiAgICAgICAgaWYgKHRjLmZ1bmN0aW9uICYmIHRjLmZ1bmN0aW9uLmFyZ3VtZW50cykgewogICAgICAgICAgZXZlbnRzLnB1c2goc3NlKCdjb250ZW50X2Jsb2NrX2RlbHRhJywgeyB0eXBlOiAnY29udGVudF9ibG9ja19kZWx0YScsIGluZGV4OiBidWYuYmksIGRlbHRhOiB7IHR5cGU6ICdpbnB1dF9qc29uX2RlbHRhJywgcGFydGlhbF9qc29uOiB0Yy5mdW5jdGlvbi5hcmd1bWVudHMgfSB9KSk7CiAgICAgICAgfQogICAgICB9CiAgICB9CiAgICBpZiAoY2hvaWNlLmZpbmlzaF9yZWFzb24pIHsKICAgICAgaWYgKHN0YXRlLmluVGV4dCkgeyBldmVudHMucHVzaChzc2UoJ2NvbnRlbnRfYmxvY2tfc3RvcCcsIHsgdHlwZTogJ2NvbnRlbnRfYmxvY2tfc3RvcCcsIGluZGV4OiBzdGF0ZS5ibG9ja0luZGV4IH0pKTsgc3RhdGUuaW5UZXh0ID0gZmFsc2U7IH0KICAgICAgZm9yICh2YXIga2V5IGluIHN0YXRlLnRjQnVmcykgZXZlbnRzLnB1c2goc3NlKCdjb250ZW50X2Jsb2NrX3N0b3AnLCB7IHR5cGU6ICdjb250ZW50X2Jsb2NrX3N0b3AnLCBpbmRleDogc3RhdGUudGNCdWZzW2tleV0uYmkgfSkpOwogICAgICBldmVudHMucHVzaChzc2UoJ21lc3NhZ2VfZGVsdGEnLCB7IHR5cGU6ICdtZXNzYWdlX2RlbHRhJywgZGVsdGE6IHsgc3RvcF9yZWFzb246IG1hcEZpbmlzaFJlYXNvbihjaG9pY2UuZmluaXNoX3JlYXNvbiksIHN0b3Bfc2VxdWVuY2U6IG51bGwgfSwgdXNhZ2U6IHsgb3V0cHV0X3Rva2Vuczogc3RhdGUub3V0VG9rIH0gfSkpOwogICAgICBldmVudHMucHVzaChzc2UoJ21lc3NhZ2Vfc3RvcCcsIHsgdHlwZTogJ21lc3NhZ2Vfc3RvcCcgfSkpOwogICAgfQogICAgcmV0dXJuIGV2ZW50czsKICB9Owp9CgpmdW5jdGlvbiBwYXJzZVNTRUxpbmVzKHRleHQpIHsKICB2YXIgY2h1bmtzID0gW10sIGxpbmVzID0gdGV4dC5zcGxpdCgnXG4nKTsKICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7CiAgICB2YXIgbGluZSA9IGxpbmVzW2ldLnRyaW0oKTsKICAgIGlmICghbGluZS5zdGFydHNXaXRoKCdkYXRhOiAnKSkgY29udGludWU7CiAgICB2YXIgcGF5bG9hZCA9IGxpbmUuc3Vic3RyaW5nKDYpOwogICAgaWYgKHBheWxvYWQgPT09ICdbRE9ORV0nKSB7IGNodW5rcy5wdXNoKG51bGwpOyBjb250aW51ZTsgfQogICAgdHJ5IHsgY2h1bmtzLnB1c2goSlNPTi5wYXJzZShwYXlsb2FkKSk7IH0gY2F0Y2ggKGUpIHt9CiAgfQogIHJldHVybiBjaHVua3M7Cn0KCmZ1bmN0aW9uIHN0YXJ0UHJveHkoY29uZmlnKSB7CiAgdmFyIHVwc3RyZWFtVVJMID0gKGNvbmZpZy5iYXNlVVJMIHx8ICdodHRwczovL2FwaS54LmFpL3YxJykucmVwbGFjZSgvXC8rJC8sICcnKTsKICB2YXIgdXBzdHJlYW1LZXkgPSBjb25maWcuYXBpS2V5OwoKICB2YXIgc2VydmVyID0gQnVuLnNlcnZlKHsKICAgIHBvcnQ6IDAsIGhvc3RuYW1lOiAnMTI3LjAuMC4xJywgaWRsZVRpbWVvdXQ6IDI1NSwKICAgIGZldGNoOiBhc3luYyBmdW5jdGlvbiAocmVxKSB7CiAgICAgIHZhciB1cmwgPSBuZXcgVVJMKHJlcS51cmwpOwogICAgICBpZiAocmVxLm1ldGhvZCA9PT0gJ0dFVCcgJiYgdXJsLnBhdGhuYW1lID09PSAnL2hlYWx0aCcpIHJldHVybiBuZXcgUmVzcG9uc2UoJ29rJyk7CiAgICAgIGlmIChyZXEubWV0aG9kICE9PSAnUE9TVCcgfHwgIXVybC5wYXRobmFtZS5lbmRzV2l0aCgnL21lc3NhZ2VzJykpCiAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnbm90IGZvdW5kJyB9KSwgeyBzdGF0dXM6IDQwNCwgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0gfSk7CgogICAgICB2YXIgYm9keTsKICAgICAgdHJ5IHsgYm9keSA9IGF3YWl0IHJlcS5qc29uKCk7IH0gY2F0Y2ggKGUpIHsKICAgICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ2Vycm9yJywgZXJyb3I6IHsgdHlwZTogJ2ludmFsaWRfcmVxdWVzdF9lcnJvcicsIG1lc3NhZ2U6ICdJbnZhbGlkIEpTT04nIH0gfSksIHsgc3RhdHVzOiA0MDAsIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9IH0pOwogICAgICB9CgogICAgICB2YXIgcmVxdWVzdE1vZGVsID0gYm9keS5tb2RlbCB8fCBjb25maWcubW9kZWwgfHwgJyc7CiAgICAgIHZhciBpc1N0cmVhbSA9ICEhYm9keS5zdHJlYW07CiAgICAgIHZhciBvcGVuYWlCb2R5OwogICAgICB0cnkgeyBvcGVuYWlCb2R5ID0gdHJhbnNsYXRlUmVxdWVzdChib2R5KTsgfSBjYXRjaCAoZSkgewogICAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAnZXJyb3InLCBlcnJvcjogeyB0eXBlOiAnaW52YWxpZF9yZXF1ZXN0X2Vycm9yJywgbWVzc2FnZTogJ1RyYW5zbGF0aW9uIGVycm9yOiAnICsgZS5tZXNzYWdlIH0gfSksIHsgc3RhdHVzOiA0MDAsIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9IH0pOwogICAgICB9CgogICAgICB2YXIgdXBzdHJlYW1SZXNwOwogICAgICB0cnkgewogICAgICAgIHVwc3RyZWFtUmVzcCA9IGF3YWl0IGZldGNoKHVwc3RyZWFtVVJMICsgJy9jaGF0L2NvbXBsZXRpb25zJywgewogICAgICAgICAgbWV0aG9kOiAnUE9TVCcsCiAgICAgICAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsICdBdXRob3JpemF0aW9uJzogJ0JlYXJlciAnICsgdXBzdHJlYW1LZXkgfSwKICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KG9wZW5haUJvZHkpLAogICAgICAgIH0pOwogICAgICB9IGNhdGNoIChlKSB7CiAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdlcnJvcicsIGVycm9yOiB7IHR5cGU6ICdhcGlfZXJyb3InLCBtZXNzYWdlOiAnVXBzdHJlYW0gY29ubmVjdGlvbiBmYWlsZWQ6ICcgKyBlLm1lc3NhZ2UgfSB9KSwgeyBzdGF0dXM6IDUwMiwgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0gfSk7CiAgICAgIH0KCiAgICAgIGlmICghdXBzdHJlYW1SZXNwLm9rICYmICFpc1N0cmVhbSkgewogICAgICAgIHZhciBlcnJUZXh0ID0gYXdhaXQgdXBzdHJlYW1SZXNwLnRleHQoKS5jYXRjaChmdW5jdGlvbiAoKSB7IHJldHVybiAnJzsgfSk7CiAgICAgICAgdmFyIGVyckJvZHk7IHRyeSB7IGVyckJvZHkgPSBKU09OLnBhcnNlKGVyclRleHQpOyB9IGNhdGNoIChlKSB7IGVyckJvZHkgPSBudWxsOyB9CiAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdlcnJvcicsIGVycm9yOiB7IHR5cGU6IHVwc3RyZWFtUmVzcC5zdGF0dXMgPT09IDQyOSA/ICdyYXRlX2xpbWl0X2Vycm9yJyA6ICdhcGlfZXJyb3InLCBtZXNzYWdlOiAoZXJyQm9keSAmJiBlcnJCb2R5LmVycm9yICYmIGVyckJvZHkuZXJyb3IubWVzc2FnZSkgfHwgZXJyVGV4dCB8fCAoJ0hUVFAgJyArIHVwc3RyZWFtUmVzcC5zdGF0dXMpIH0gfSksIHsgc3RhdHVzOiB1cHN0cmVhbVJlc3Auc3RhdHVzLCBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSB9KTsKICAgICAgfQoKICAgICAgaWYgKCFpc1N0cmVhbSkgewogICAgICAgIHZhciByZXN1bHQ7IHRyeSB7IHJlc3VsdCA9IGF3YWl0IHVwc3RyZWFtUmVzcC5qc29uKCk7IH0gY2F0Y2ggKGUpIHsKICAgICAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAnZXJyb3InLCBlcnJvcjogeyB0eXBlOiAnYXBpX2Vycm9yJywgbWVzc2FnZTogJ0ludmFsaWQgdXBzdHJlYW0gcmVzcG9uc2UnIH0gfSksIHsgc3RhdHVzOiA1MDIsIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9IH0pOwogICAgICAgIH0KICAgICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHRyYW5zbGF0ZVJlc3BvbnNlKHJlc3VsdCwgcmVxdWVzdE1vZGVsKSksIHsgc3RhdHVzOiAyMDAsIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9IH0pOwogICAgICB9CgogICAgICB2YXIgdHJhbnNsYXRvciA9IGNyZWF0ZVN0cmVhbVRyYW5zbGF0b3IocmVxdWVzdE1vZGVsKTsKICAgICAgdmFyIHVwc3RyZWFtQm9keSA9IHVwc3RyZWFtUmVzcC5ib2R5OwogICAgICB2YXIgcmVhZGFibGUgPSBuZXcgUmVhZGFibGVTdHJlYW0oewogICAgICAgIGFzeW5jIHN0YXJ0KGNvbnRyb2xsZXIpIHsKICAgICAgICAgIHZhciBlbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKCksIGRlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoKSwgYnVmZmVyID0gJyc7CiAgICAgICAgICB0cnkgewogICAgICAgICAgICB2YXIgcmVhZGVyID0gdXBzdHJlYW1Cb2R5LmdldFJlYWRlcigpOwogICAgICAgICAgICB3aGlsZSAodHJ1ZSkgewogICAgICAgICAgICAgIHZhciByID0gYXdhaXQgcmVhZGVyLnJlYWQoKTsKICAgICAgICAgICAgICBpZiAoci5kb25lKSBicmVhazsKICAgICAgICAgICAgICBidWZmZXIgKz0gZGVjb2Rlci5kZWNvZGUoci52YWx1ZSwgeyBzdHJlYW06IHRydWUgfSk7CiAgICAgICAgICAgICAgdmFyIGJvdW5kYXJ5ID0gYnVmZmVyLmxhc3RJbmRleE9mKCdcbicpOwogICAgICAgICAgICAgIGlmIChib3VuZGFyeSA9PT0gLTEpIGNvbnRpbnVlOwogICAgICAgICAgICAgIHZhciBjb21wbGV0ZSA9IGJ1ZmZlci5zdWJzdHJpbmcoMCwgYm91bmRhcnkgKyAxKTsKICAgICAgICAgICAgICBidWZmZXIgPSBidWZmZXIuc3Vic3RyaW5nKGJvdW5kYXJ5ICsgMSk7CiAgICAgICAgICAgICAgdmFyIGNodW5rcyA9IHBhcnNlU1NFTGluZXMoY29tcGxldGUpOwogICAgICAgICAgICAgIGZvciAodmFyIGNpID0gMDsgY2kgPCBjaHVua3MubGVuZ3RoOyBjaSsrKSB7CiAgICAgICAgICAgICAgICBpZiAoY2h1bmtzW2NpXSA9PT0gbnVsbCkgY29udGludWU7CiAgICAgICAgICAgICAgICB2YXIgZXZ0cyA9IHRyYW5zbGF0b3IoY2h1bmtzW2NpXSk7CiAgICAgICAgICAgICAgICBmb3IgKHZhciBlaSA9IDA7IGVpIDwgZXZ0cy5sZW5ndGg7IGVpKyspIGNvbnRyb2xsZXIuZW5xdWV1ZShlbmNvZGVyLmVuY29kZShldnRzW2VpXSkpOwogICAgICAgICAgICAgIH0KICAgICAgICAgICAgfQogICAgICAgICAgICBpZiAoYnVmZmVyLnRyaW0oKSkgewogICAgICAgICAgICAgIHZhciByZW0gPSBwYXJzZVNTRUxpbmVzKGJ1ZmZlcik7CiAgICAgICAgICAgICAgZm9yICh2YXIgcmkgPSAwOyByaSA8IHJlbS5sZW5ndGg7IHJpKyspIHsKICAgICAgICAgICAgICAgIGlmIChyZW1bcmldID09PSBudWxsKSBjb250aW51ZTsKICAgICAgICAgICAgICAgIHZhciByZXZ0cyA9IHRyYW5zbGF0b3IocmVtW3JpXSk7CiAgICAgICAgICAgICAgICBmb3IgKHZhciByZWkgPSAwOyByZWkgPCByZXZ0cy5sZW5ndGg7IHJlaSsrKSBjb250cm9sbGVyLmVucXVldWUoZW5jb2Rlci5lbmNvZGUocmV2dHNbcmVpXSkpOwogICAgICAgICAgICAgIH0KICAgICAgICAgICAgfQogICAgICAgICAgfSBjYXRjaCAoZSkgeyBjb250cm9sbGVyLmVucXVldWUoZW5jb2Rlci5lbmNvZGUoc3NlKCdlcnJvcicsIHsgdHlwZTogJ2Vycm9yJywgZXJyb3I6IHsgdHlwZTogJ2FwaV9lcnJvcicsIG1lc3NhZ2U6ICdTdHJlYW0gZXJyb3I6ICcgKyBlLm1lc3NhZ2UgfSB9KSkpOyB9CiAgICAgICAgICBmaW5hbGx5IHsgY29udHJvbGxlci5jbG9zZSgpOyB9CiAgICAgICAgfSwKICAgICAgfSk7CiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UocmVhZGFibGUsIHsgc3RhdHVzOiAyMDAsIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICd0ZXh0L2V2ZW50LXN0cmVhbScsICdDYWNoZS1Db250cm9sJzogJ25vLWNhY2hlJywgJ0Nvbm5lY3Rpb24nOiAna2VlcC1hbGl2ZScgfSB9KTsKICAgIH0sCiAgfSk7CiAgcmV0dXJuIHsgcG9ydDogc2VydmVyLnBvcnQsIHN0b3A6IGZ1bmN0aW9uICgpIHsgc2VydmVyLnN0b3AoKTsgfSB9Owp9Cgptb2R1bGUuZXhwb3J0cyA9IHsgc3RhcnRQcm94eTogc3RhcnRQcm94eSB9Owo=')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "openai-proxy.cjs"), $OpenAIProxyBytes)
Write-OK "OpenAI-compatible proxy created (openai-proxy.cjs)"

# ─── Write wrapper (cli.cjs, runs under Bun) ──────────────────

$WrapperBytes = [Convert]::FromBase64String('IyEvdXNyL2Jpbi9lbnYgYnVuCmNvbnN0IHsgcmVhZEZpbGVTeW5jLCBleGlzdHNTeW5jLCBta2RpclN5bmMsIHdyaXRlRmlsZVN5bmMsIHJlYWRkaXJTeW5jLCBzdGF0U3luYywgcmVuYW1lU3luYyB9ID0gcmVxdWlyZSgnZnMnKTsKY29uc3QgeyBqb2luLCBiYXNlbmFtZSwgZGVsaW1pdGVyIH0gPSByZXF1aXJlKCdub2RlOnBhdGgnKTsKY29uc3QgeyBob21lZGlyIH0gPSByZXF1aXJlKCdvcycpOwpjb25zdCB7IHNwYXduU3luYyB9ID0gcmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpOwoKY29uc3QgY2xhd2dvZERpciA9IGpvaW4oaG9tZWRpcigpLCAnLmNsYXdnb2QnKTsKY29uc3QgcmlwZ3JlcEJpbiA9IGpvaW4oY2xhd2dvZERpciwgJ3ZlbmRvcicsICdyaXBncmVwJywgJ2JpbicpOwpjb25zdCByaXBncmVwUGF0aFdhc1JlYWR5ID0gcHJvY2Vzcy5lbnYuQ0xBV0dPRF9JTlRFUk5BTF9SSVBHUkVQX1BBVEhfUkVBRFkgPT09IHJpcGdyZXBCaW4KICAmJiAocHJvY2Vzcy5lbnYuUEFUSCB8fCAnJykuc3BsaXQoZGVsaW1pdGVyKVswXSA9PT0gcmlwZ3JlcEJpbjsKaWYgKChwcm9jZXNzLmVudi5QQVRIIHx8ICcnKS5zcGxpdChkZWxpbWl0ZXIpWzBdICE9PSByaXBncmVwQmluKSB7CiAgcHJvY2Vzcy5lbnYuUEFUSCA9IGAke3JpcGdyZXBCaW59JHtkZWxpbWl0ZXJ9JHtwcm9jZXNzLmVudi5QQVRIIHx8ICcnfWA7Cn0KaWYgKCFyaXBncmVwUGF0aFdhc1JlYWR5KSB7CiAgY29uc3QgcmVleGVjID0gc3Bhd25TeW5jKHByb2Nlc3MuZXhlY1BhdGgsIHByb2Nlc3MuYXJndi5zbGljZSgxKSwgewogICAgc3RkaW86ICdpbmhlcml0JywKICAgIGVudjogeyAuLi5wcm9jZXNzLmVudiwgQ0xBV0dPRF9JTlRFUk5BTF9SSVBHUkVQX1BBVEhfUkVBRFk6IHJpcGdyZXBCaW4gfSwKICB9KTsKICBpZiAocmVleGVjLmVycm9yKSB7CiAgICBwcm9jZXNzLnN0ZGVyci53cml0ZSgnW2NsYXdnb2RdIEZhaWxlZCB0byByZXN0YXJ0IEJ1biB3aXRoIG1hbmFnZWQgcmlwZ3JlcCBQQVRILlxuJyk7CiAgICBwcm9jZXNzLmV4aXQoMSk7CiAgfQogIGlmIChyZWV4ZWMuc2lnbmFsKSB7CiAgICB0cnkgeyBwcm9jZXNzLmtpbGwocHJvY2Vzcy5waWQsIHJlZXhlYy5zaWduYWwpOyB9IGNhdGNoIHt9CiAgICBwcm9jZXNzLmV4aXQoMSk7CiAgfQogIHByb2Nlc3MuZXhpdChyZWV4ZWMuc3RhdHVzID8/IDEpOwp9CgovLyBOb3RlOiB0aGVyZSB1c2VkIHRvIGJlIGEgImRyaWZ0IGRldGVjdGlvbiIgYmxvY2sgaGVyZSB0aGF0IHNjYW5uZWQKLy8gfi8ubG9jYWwvc2hhcmUvY2xhdWRlL3ZlcnNpb25zLyBmb3IgYSBuZXdlciBiaW5hcnkgYW5kIHNpbGVudGx5IHJlLXBhdGNoZWQuCi8vIFJlbW92ZWQgYmVjYXVzZToKLy8gICAxLiBXaW5kb3dzIHVzZXJzIGRvbid0IGhhdmUgYSBgdmVyc2lvbnMvYCBkaXJlY3RvcnkgYXQgYWxsIChBbnRocm9waWMncwovLyAgICAgIFdpbmRvd3MgaW5zdGFsbCBkb2Vzbid0IGZvbGxvdyB0aGF0IGNvbnZlbnRpb24pLgovLyAgIDIuIFdlIHBhdGNoIG91dCBgY2xhdWRlIHVwZGF0ZWAgKGl0IHdvdWxkIG90aGVyd2lzZSBvdmVyd3JpdGUgdGhlIGJ1bgovLyAgICAgIHJ1bnRpbWUgdW5kZXIgb3VyIGxhdW5jaGVyKSwgc28gYHZlcnNpb25zL2Agbm8gbG9uZ2VyIGF1dG8tZ3Jvd3MKLy8gICAgICBvbiBhIGhlYWx0aHkgY2xhd2dvZCBpbnN0YWxsLgovLyBJbiBwcmFjdGljZSB0aGUgYmxvY2sgd2FzIHJlYWRpbmcgYSBkaXJlY3RvcnkgdGhhdCBuZXZlciBjaGFuZ2VzLCBidXQKLy8gY291bGQgKnJldHJhY3QqIGEgZnJlc2hlciB2ZXJzaW9uIHRoYXQgaW5zdGFsbC5zaCBqdXN0IHB1bGxlZCBmcm9tIG5wbQovLyByZWdpc3RyeSDigJQgcHV0dGluZyB1c2VycyBpbnRvIGEgcmUtcGF0Y2ggbG9vcC4gVXBncmFkZXMgbm93IGdvIHRocm91Z2gKLy8gdGhlIHBhdGNoZWQgYGNsYXVkZSB1cGRhdGVgIOKGkiBpbnN0YWxsLnNoIHJlZGlyZWN0LCB3aGljaCBhbHdheXMgcHVsbHMKLy8gdGhlIGxhdGVzdCBmcm9tIG5wbS4KCi8vIE9uZS10aW1lIG1pZ3JhdGlvbjogZWFybGllciB3cmFwcGVyIHZlcnNpb25zIHNldCBDTEFVREVfQ09ORklHX0RJUj1+Ly5jbGF3Z29kLAovLyB3aGljaCBtYWRlIENsYXVkZSBDb2RlIHJlYWQvd3JpdGUgfi8uY2xhd2dvZC8uY2xhdWRlLmpzb24gaW5zdGVhZCBvZiB0aGUKLy8gbmF0aXZlIH4vLmNsYXVkZS5qc29uICh0aGUgZmlsZSBob2xkaW5nIE1DUCBjb25maWcsIHByb2plY3QgaGlzdG9yeSwgc2Vzc2lvbgovLyBpbmRleCkuIE1vdmUgaXQgYmFjayB0cmFuc3BhcmVudGx5IG9uIGZpcnN0IHJ1biBhZnRlciB1cGdyYWRlLgpjb25zdCBuYXRpdmVDbGF1ZGVKc29uID0gam9pbihob21lZGlyKCksICcuY2xhdWRlLmpzb24nKTsKY29uc3Qgc3RyYXlDbGF1ZGVKc29uID0gam9pbihjbGF3Z29kRGlyLCAnLmNsYXVkZS5qc29uJyk7CmlmIChleGlzdHNTeW5jKHN0cmF5Q2xhdWRlSnNvbikgJiYgIWV4aXN0c1N5bmMobmF0aXZlQ2xhdWRlSnNvbikpIHsKICB0cnkgeyByZW5hbWVTeW5jKHN0cmF5Q2xhdWRlSnNvbiwgbmF0aXZlQ2xhdWRlSnNvbik7IH0gY2F0Y2gge30KfQoKY29uc3QgcHJvdmlkZXJEaXIgPSBjbGF3Z29kRGlyOwpjb25zdCBjb25maWdGaWxlID0gam9pbihwcm92aWRlckRpciwgJ3Byb3ZpZGVyLmpzb24nKTsKCmNvbnN0IGRlZmF1bHRDb25maWcgPSB7CiAgYXBpS2V5OiAnJywKICBiYXNlVVJMOiAnaHR0cHM6Ly9hcGkuYW50aHJvcGljLmNvbScsCiAgbW9kZWw6ICcnLAogIHNtYWxsTW9kZWw6ICcnLAogIHRpbWVvdXRNczogMzAwMDAwMCwKfTsKCmxldCBjb25maWcgPSB7IC4uLmRlZmF1bHRDb25maWcgfTsKaWYgKGV4aXN0c1N5bmMoY29uZmlnRmlsZSkpIHsKICB0cnkgewogICAgY29uc3QgcmF3ID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMoY29uZmlnRmlsZSwgJ3V0ZjgnKSk7CiAgICBjb25maWcgPSB7IC4uLmRlZmF1bHRDb25maWcsIC4uLnJhdyB9OwogIH0gY2F0Y2gge30KfSBlbHNlIHsKICBta2RpclN5bmMocHJvdmlkZXJEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pOwogIHdyaXRlRmlsZVN5bmMoY29uZmlnRmlsZSwgSlNPTi5zdHJpbmdpZnkoZGVmYXVsdENvbmZpZywgbnVsbCwgMikgKyAnXG4nKTsKfQoKLy8gT3BlbkFJLWNvbXBhdGlibGUgcHJvdmlkZXIgcHJveHkgKGdyb2ssIG9wZW5haS1jb21wYXQsIGV0Yy4pCmNvbnN0IF9wcm94eVR5cGVzID0geyBncm9rOiAxLCAnb3BlbmFpLWNvbXBhdCc6IDEgfTsKaWYgKF9wcm94eVR5cGVzW2NvbmZpZy50eXBlXSkgewogIGxldCBfcHJveHlLZXkgPSBjb25maWcuYXBpS2V5IHx8ICcnOwogIGlmICghX3Byb3h5S2V5ICYmIGNvbmZpZy50eXBlID09PSAnZ3JvaycpIHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IF9ncyA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKGpvaW4oaG9tZWRpcigpLCAnLmdyb2snLCAndXNlci1zZXR0aW5ncy5qc29uJyksICd1dGY4JykpOwogICAgICBfcHJveHlLZXkgPSBfZ3MuYXBpS2V5IHx8ICcnOwogICAgfSBjYXRjaCB7fQogICAgaWYgKCFfcHJveHlLZXkpIF9wcm94eUtleSA9IHByb2Nlc3MuZW52LkdST0tfQVBJX0tFWSB8fCAnJzsKICB9CiAgaWYgKF9wcm94eUtleSkgewogICAgY29uc3QgeyBzdGFydFByb3h5IH0gPSByZXF1aXJlKCcuL29wZW5haS1wcm94eS5janMnKTsKICAgIGNvbnN0IF9wcm94eSA9IHN0YXJ0UHJveHkoewogICAgICBhcGlLZXk6IF9wcm94eUtleSwKICAgICAgYmFzZVVSTDogY29uZmlnLmJhc2VVUkwgfHwgKGNvbmZpZy50eXBlID09PSAnZ3JvaycgPyAnaHR0cHM6Ly9hcGkueC5haS92MScgOiAnJyksCiAgICAgIG1vZGVsOiBjb25maWcubW9kZWwgfHwgJycsCiAgICB9KTsKICAgIHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZID0gJ3Byb3h5LXBhc3N0aHJvdWdoJzsKICAgIHByb2Nlc3MuZW52LkFOVEhST1BJQ19CQVNFX1VSTCA9ICdodHRwOi8vMTI3LjAuMC4xOicgKyBfcHJveHkucG9ydDsKICAgIHByb2Nlc3MuZW52LkFOVEhST1BJQ19BVVRIX1RPS0VOID0gJ3Byb3h5LXBhc3N0aHJvdWdoJzsKICAgIGlmIChjb25maWcubW9kZWwpIHByb2Nlc3MuZW52LkFOVEhST1BJQ19NT0RFTCA9IGNvbmZpZy5tb2RlbDsKICAgIGlmIChjb25maWcuc21hbGxNb2RlbCkgcHJvY2Vzcy5lbnYuQU5USFJPUElDX1NNQUxMX0ZBU1RfTU9ERUwgPSBjb25maWcuc21hbGxNb2RlbDsKICAgIHByb2Nlc3MuZW52LkNMQVVERV9DT0RFX0FUVFJJQlVUSU9OX0hFQURFUiA9ICcwJzsKICAgIHByb2Nlc3MuZW52LkNMQVVERV9DT0RFX0RJU0FCTEVfRVhQRVJJTUVOVEFMX0JFVEFTID8/PSAnMSc7CiAgICBwcm9jZXNzLm9uKCdleGl0JywgZnVuY3Rpb24gKCkgeyB0cnkgeyBfcHJveHkuc3RvcCgpOyB9IGNhdGNoIHt9IH0pOwogICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoJ1tjbGF3Z29kXSBPcGVuQUktY29tcGF0IHByb3h5IG9uIHBvcnQgJyArIF9wcm94eS5wb3J0ICsgJyAodHlwZTogJyArIGNvbmZpZy50eXBlICsgJylcbicpOwogICAgY29uZmlnID0geyAuLi5kZWZhdWx0Q29uZmlnIH07ICAvLyBwcmV2ZW50IGZhbGx0aHJvdWdoIHRvIGFwaUtleS9iYXNlVVJMIGluamVjdGlvbiBiZWxvdwogIH0gZWxzZSB7CiAgICBwcm9jZXNzLnN0ZGVyci53cml0ZSgnW2NsYXdnb2RdIFdhcm5pbmc6IHR5cGU9JyArIGNvbmZpZy50eXBlICsgJyBidXQgbm8gQVBJIGtleSBmb3VuZFxuJyk7CiAgfQp9Cgpjb25zdCBoYXNQcm92aWRlckFwaUtleSA9ICEhY29uZmlnLmFwaUtleTsKCmlmIChoYXNQcm92aWRlckFwaUtleSkgewogIHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZID0gY29uZmlnLmFwaUtleTsKICBpZiAoY29uZmlnLmJhc2VVUkwpIHByb2Nlc3MuZW52LkFOVEhST1BJQ19CQVNFX1VSTCA9IGNvbmZpZy5iYXNlVVJMOwogIGlmIChjb25maWcubW9kZWwpIHByb2Nlc3MuZW52LkFOVEhST1BJQ19NT0RFTCA9IGNvbmZpZy5tb2RlbDsKICBpZiAoY29uZmlnLnNtYWxsTW9kZWwpIHByb2Nlc3MuZW52LkFOVEhST1BJQ19TTUFMTF9GQVNUX01PREVMID0gY29uZmlnLnNtYWxsTW9kZWw7CiAgaWYgKGNvbmZpZy5iYXNlVVJMICYmICEvYW50aHJvcGljXC5jb20vaS50ZXN0KGNvbmZpZy5iYXNlVVJMKSkgewogICAgcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FVVEhfVE9LRU4gPz89IGNvbmZpZy5hcGlLZXk7CiAgfQp9IGVsc2UgaWYgKGNvbmZpZy5iYXNlVVJMICYmIGNvbmZpZy5iYXNlVVJMICE9PSBkZWZhdWx0Q29uZmlnLmJhc2VVUkwpIHsKICBwcm9jZXNzLmVudi5BTlRIUk9QSUNfQkFTRV9VUkwgPz89IGNvbmZpZy5iYXNlVVJMOwp9CgovLyBjbGF1ZGUtbWVtIGRlbGliZXJhdGVseSBzdGFydHMgU0RLIHN1YnByb2Nlc3NlcyB3aXRob3V0IENsYXVkZSBzZXR0aW5ncyBvcgovLyBpbmhlcml0ZWQgYXV0aC4gSXRzIENsYXdHb2QgUGx1cy1zcGVjaWZpYyBsYXVuY2hlciBtYXJrcyB0aG9zZSBzdWJwcm9jZXNzZXMgc28gdGhlCi8vIHdyYXBwZXIgY2FuIHJlc29sdmUgdGhlIHNhbWUgcHJvdmlkZXIgYW5kIEhhaWt1IG1hcHBpbmcgYXQgc3Bhd24gdGltZSB3aXRob3V0Ci8vIGNvcHlpbmcgY3JlZGVudGlhbHMgaW50byB+Ly5jbGF1ZGUtbWVtLy5lbnYuCmlmIChwcm9jZXNzLmVudi5DTEFXR09EX0NMQVVERV9NRU0gPT09ICcxJykgewogIGxldCBfY21FbnYgPSB7fTsKICB0cnkgewogICAgY29uc3QgX2NtU2V0dGluZ3MgPSBKU09OLnBhcnNlKHJlYWRGaWxlU3luYyhqb2luKHByb2Nlc3MuZW52LkNMQVVERV9DT05GSUdfRElSIHx8IGpvaW4oaG9tZWRpcigpLCAnLmNsYXVkZScpLCAnc2V0dGluZ3MuanNvbicpLCAndXRmOCcpKTsKICAgIGlmIChfY21TZXR0aW5ncyAmJiB0eXBlb2YgX2NtU2V0dGluZ3MuZW52ID09PSAnb2JqZWN0JykgX2NtRW52ID0gX2NtU2V0dGluZ3MuZW52OwogIH0gY2F0Y2gge30KICBjb25zdCBfY21WYWx1ZSA9IGZ1bmN0aW9uKHYpIHsgcmV0dXJuIHR5cGVvZiB2ID09PSAnc3RyaW5nJyAmJiB2ICYmICEvW1xyXG5cMF0vLnRlc3QodikgPyB2IDogJyc7IH07CiAgY29uc3QgX2NtSGFpa3UgPSBfY21WYWx1ZShfY21FbnYuQU5USFJPUElDX0RFRkFVTFRfSEFJS1VfTU9ERUwpIHx8IF9jbVZhbHVlKHByb2Nlc3MuZW52LkFOVEhST1BJQ19TTUFMTF9GQVNUX01PREVMKTsKICBpZiAoX2NtSGFpa3UpIHByb2Nlc3MuZW52LkFOVEhST1BJQ19ERUZBVUxUX0hBSUtVX01PREVMID0gX2NtSGFpa3U7CiAgY29uc3QgX2NtUHJveHlBY3RpdmUgPSBwcm9jZXNzLmVudi5BTlRIUk9QSUNfQVBJX0tFWSA9PT0gJ3Byb3h5LXBhc3N0aHJvdWdoJzsKICBpZiAoIV9jbVByb3h5QWN0aXZlICYmIGhhc1Byb3ZpZGVyQXBpS2V5KSB7CiAgICBwcm9jZXNzLmVudi5BTlRIUk9QSUNfQVBJX0tFWSA9IGNvbmZpZy5hcGlLZXk7CiAgICBpZiAoY29uZmlnLmJhc2VVUkwpIHByb2Nlc3MuZW52LkFOVEhST1BJQ19CQVNFX1VSTCA9IGNvbmZpZy5iYXNlVVJMOwogICAgaWYgKGNvbmZpZy5iYXNlVVJMICYmICEvYW50aHJvcGljXC5jb20vaS50ZXN0KGNvbmZpZy5iYXNlVVJMKSkgcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FVVEhfVE9LRU4gPSBjb25maWcuYXBpS2V5OwogICAgZWxzZSBkZWxldGUgcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FVVEhfVE9LRU47CiAgfSBlbHNlIGlmICghX2NtUHJveHlBY3RpdmUgJiYgIWhhc1Byb3ZpZGVyQXBpS2V5KSB7CiAgICBjb25zdCBfY21BcGlLZXkgPSBfY21WYWx1ZShfY21FbnYuQU5USFJPUElDX0FQSV9LRVkpOwogICAgY29uc3QgX2NtQXV0aFRva2VuID0gX2NtVmFsdWUoX2NtRW52LkFOVEhST1BJQ19BVVRIX1RPS0VOKTsKICAgIGNvbnN0IF9jbUJhc2VVUkwgPSBfY21WYWx1ZShfY21FbnYuQU5USFJPUElDX0JBU0VfVVJMKTsKICAgIGlmIChfY21BcGlLZXkpIHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZID0gX2NtQXBpS2V5OwogICAgaWYgKF9jbUF1dGhUb2tlbikgcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FVVEhfVE9LRU4gPSBfY21BdXRoVG9rZW47CiAgICBpZiAoX2NtQmFzZVVSTCkgcHJvY2Vzcy5lbnYuQU5USFJPUElDX0JBU0VfVVJMID0gX2NtQmFzZVVSTDsKICB9Cn0KCi8vIFRoaXJkLXBhcnR5IEFudGhyb3BpYy1jb21wYXRpYmxlIHByb3hpZXMgKERlZXBTZWVrIC8gT25lQVBJIC8gQmVkcm9jayAvCi8vIHZMTE0gLyBldGMuKSBkb24ndCBzaGFyZSBBbnRocm9waWMncyBzZXJ2ZXItc2lkZSBoYW5kbGluZyBvZgovLyB4LWFudGhyb3BpYy1iaWxsaW5nLWhlYWRlci4gVGhhdCBoZWFkZXIgY2FycmllcyBhIHBlci1yZXF1ZXN0IGBjY2hgIGZpZWxkCi8vIHdoaWNoIEFudGhyb3BpYydzIG93biBzZXJ2ZXIgZXhjbHVkZXMgZnJvbSBwcm9tcHQtY2FjaGUga2V5IGNhbGN1bGF0aW9uCi8vICh2aWEgY2FjaGVTY29wZTpudWxsKSwgYnV0IHRoaXJkLXBhcnR5IHByb3hpZXMgZm9sZCBpbnRvIHRoZSBwcmVmaXggaGFzaCDigJQKLy8gc28gdGhlIGNhY2hlZCBwcmVmaXggY2hhbmdlcyBldmVyeSByZXF1ZXN0IGFuZCBjYWNoZSBoaXQgcmF0ZSBkcm9wcyB0bwovLyB6ZXJvLiBBdXRvLWRpc2FibGUgdGhlIGhlYWRlciB3aGVuZXZlciBiYXNlVVJMIHBvaW50cyBhd2F5IGZyb20gQW50aHJvcGljLgovLyBVc2VycyBjYW4gZm9yY2UgcmUtZW5hYmxlIHdpdGggQ0xBVURFX0NPREVfQVRUUklCVVRJT05fSEVBREVSPTEgaWYgbmVlZGVkLgppZiAoY29uZmlnLmJhc2VVUkwgJiYgIS9hbnRocm9waWNcLmNvbS9pLnRlc3QoY29uZmlnLmJhc2VVUkwpKSB7CiAgcHJvY2Vzcy5lbnYuQ0xBVURFX0NPREVfQVRUUklCVVRJT05fSEVBREVSID8/PSAnMCc7CiAgLy8gVGhpcmQtcGFydHkgcHJveGllcyAoaGVhZHJvb20sIGV0Yy4pIG9mdGVuIHJlcXVpcmUgcmVtb3RlIGNvbnRyb2wuCiAgLy8gTGVhbiBtb2RlIHNldHMgZGlzYWJsZVJlbW90ZUNvbnRyb2w6dHJ1ZSBpbiBzZXR0aW5ncy5qc29uIOKAlCB1bmRvIGl0CiAgLy8gd2hlbiB0aGUgdXNlciBpcyByb3V0aW5nIHRocm91Z2ggYSBub24tQW50aHJvcGljIGVuZHBvaW50LgogIHRyeSB7CiAgICBjb25zdCBfcmNTZXR0aW5ncyA9IGpvaW4oaG9tZWRpcigpLCAnLmNsYXVkZScsICdzZXR0aW5ncy5qc29uJyk7CiAgICBpZiAoZXhpc3RzU3luYyhfcmNTZXR0aW5ncykpIHsKICAgICAgY29uc3QgX3JjUyA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKF9yY1NldHRpbmdzLCAndXRmOCcpKTsKICAgICAgaWYgKF9yY1MuZGlzYWJsZVJlbW90ZUNvbnRyb2wpIHsKICAgICAgICBkZWxldGUgX3JjUy5kaXNhYmxlUmVtb3RlQ29udHJvbDsKICAgICAgICB3cml0ZUZpbGVTeW5jKF9yY1NldHRpbmdzLCBKU09OLnN0cmluZ2lmeShfcmNTLCBudWxsLCAyKSArICdcbicpOwogICAgICB9CiAgICB9CiAgfSBjYXRjaCB7fQp9CgppZiAoY29uZmlnLnRpbWVvdXRNcykgewogIHByb2Nlc3MuZW52LkFQSV9USU1FT1VUX01TID8/PSBTdHJpbmcoY29uZmlnLnRpbWVvdXRNcyk7Cn0KcHJvY2Vzcy5lbnYuQ0xBVURFX0NPREVfRElTQUJMRV9OT05FU1NFTlRJQUxfVFJBRkZJQyA/Pz0gJzEnOwpwcm9jZXNzLmVudi5ESVNBQkxFX0lOU1RBTExBVElPTl9DSEVDS1MgPz89ICcxJzsKLy8gIkJ1aWx0LWluIiByaXBncmVwIHJlc29sdmVzIHRocm91Z2ggdGhlIENsYXdHb2QtbWFuYWdlZCBQQVRIIGFib3ZlLgpwcm9jZXNzLmVudi5VU0VfQlVJTFRJTl9SSVBHUkVQID8/PSAnMSc7Cgpjb25zdCBmZWF0dXJlc0ZpbGUgPSBqb2luKHByb3ZpZGVyRGlyLCAnZmVhdHVyZXMuanNvbicpOwppZiAoIXByb2Nlc3MuZW52LkNMQVVERV9JTlRFUk5BTF9GQ19PVkVSUklERVMgJiYgZXhpc3RzU3luYyhmZWF0dXJlc0ZpbGUpKSB7CiAgdHJ5IHsKICAgIGNvbnN0IHJhdyA9IHJlYWRGaWxlU3luYyhmZWF0dXJlc0ZpbGUsICd1dGY4Jyk7CiAgICBKU09OLnBhcnNlKHJhdyk7CiAgICBwcm9jZXNzLmVudi5DTEFVREVfSU5URVJOQUxfRkNfT1ZFUlJJREVTID0gcmF3OwogIH0gY2F0Y2gge30KfQoKLy8gS2VlcCBwcm9jZXNzLmV4ZWNQYXRoIGFzIHRoZSBCdW4gcnVudGltZS4gQ2xhdWRlIENvZGUncyBiYWNrZ3JvdW5kIGRhZW1vbgovLyBsYXVuY2ggcGF0aCByZXNwYXducyB0aGlzIHBhdGNoZWQgSlMgZW50cnlwb2ludCBhczoKLy8gICBwcm9jZXNzLmV4ZWNQYXRoIHByb2Nlc3MuYXJndlsxXSBkYWVtb24gcnVuIC4uLgovLyBJZiBwcm9jZXNzLmV4ZWNQYXRoIGlzIHJld3JpdHRlbiB0byB0aGUgbmF0aXZlIENsYXVkZSBiaW5hcnksIHRoZSBuYXRpdmUKLy8gYmluYXJ5IHJlY2VpdmVzIGNsaS5janMgYXMgYW4gYXJndW1lbnQgYW5kIHRoZSBkYWVtb24vY29udHJvbCBzb2NrZXQgbmV2ZXIKLy8gY29tZXMgdXAsIGxlYXZpbmcgYGNsYXVkZSBhZ2VudHNgIHN0dWNrIG9uIG9wZW5pbmcgY29tcGxldGVkIHNlc3Npb25zLgovLyBDTEFVREVfQ09ERV9FWEVDUEFUSCBpcyBzdGlsbCBleHBvcnRlZCBieSB0aGUgc2hlbGwgbGF1bmNoZXIgZm9yIGFueSBjb2RlCi8vIHBhdGhzIHRoYXQgbmVlZCB0byBrbm93IHRoZSBuYXRpdmUgYmluYXJ5IGV4cGxpY2l0bHkuCgovLyBMZWFuIG1vZGUgdG9nZ2xlIOKAlCAtLWxlYW4tb2ZmIC8gLS1sZWFuLW9uIC8gLS1sZWFuLW1heAppZiAocHJvY2Vzcy5hcmd2LmluY2x1ZGVzKCctLWxlYW4tb2ZmJykgfHwgcHJvY2Vzcy5hcmd2LmluY2x1ZGVzKCctLWxlYW4tb24nKSB8fCBwcm9jZXNzLmFyZ3YuaW5jbHVkZXMoJy0tbGVhbi1tYXgnKSkgewogIGNvbnN0IF9sZWFuT2ZmID0gam9pbihjbGF3Z29kRGlyLCAnLmxlYW4tZGlzYWJsZWQnKTsKICBjb25zdCBfbGVhbk1heCA9IGpvaW4oY2xhd2dvZERpciwgJy5sZWFuLW1heCcpOwogIGNvbnN0IF9sZWFuU2V0dGluZ3MgPSBqb2luKGhvbWVkaXIoKSwgJy5jbGF1ZGUnLCAnc2V0dGluZ3MuanNvbicpOwogIGNvbnN0IF9iYXNlRGVueSA9IFsnRGVzaWduU3luYycsJ05vdGVib29rRWRpdCcsJ1B1c2hOb3RpZmljYXRpb24nLCdSZW1vdGVUcmlnZ2VyJywnQ3JvbkNyZWF0ZScsJ0Nyb25EZWxldGUnLCdDcm9uTGlzdCddOwogIGNvbnN0IF9tYXhEZW55ID0gWydFbnRlclBsYW5Nb2RlJywnRXhpdFBsYW5Nb2RlJywnU2VuZE1lc3NhZ2UnLCdTY2hlZHVsZVdha2V1cCcsJ0Fza1VzZXJRdWVzdGlvbicsJ1JlcG9ydEZpbmRpbmdzJ107CiAgY29uc3QgX2Jhc2VGbGFncyA9IFsnZGlzYWJsZVdvcmtmbG93cycsJ2Rpc2FibGVSZW1vdGVDb250cm9sJywnZGlzYWJsZUNsYXVkZUFpQ29ubmVjdG9ycycsJ2Rpc2FibGVBcnRpZmFjdCddOwogIGNvbnN0IF9tYXhGbGFncyA9IFsnZGlzYWJsZUJ1bmRsZWRTa2lsbHMnXTsKICBjb25zdCBfYWxsRGVueSA9IG5ldyBTZXQoWy4uLl9iYXNlRGVueSwgLi4uX21heERlbnldKTsKICBjb25zdCBfYWxsRmxhZ3MgPSBbLi4uX2Jhc2VGbGFncywgLi4uX21heEZsYWdzXTsKICBjb25zdCBfdW5saW5rID0gZnVuY3Rpb24ocCkgeyB0cnkgeyByZXF1aXJlKCdmcycpLnVubGlua1N5bmMocCk7IH0gY2F0Y2gge30gfTsKICBpZiAocHJvY2Vzcy5hcmd2LmluY2x1ZGVzKCctLWxlYW4tb2ZmJykpIHsKICAgIHdyaXRlRmlsZVN5bmMoX2xlYW5PZmYsICcnKTsKICAgIF91bmxpbmsoX2xlYW5NYXgpOwogICAgdHJ5IHsKICAgICAgY29uc3QgX3MgPSBKU09OLnBhcnNlKHJlYWRGaWxlU3luYyhfbGVhblNldHRpbmdzLCAndXRmOCcpKTsKICAgICAgZm9yIChjb25zdCBfayBvZiBfYWxsRmxhZ3MpIGRlbGV0ZSBfc1tfa107CiAgICAgIGlmIChBcnJheS5pc0FycmF5KF9zLnBlcm1pc3Npb25zPy5kZW55KSkgX3MucGVybWlzc2lvbnMuZGVueSA9IF9zLnBlcm1pc3Npb25zLmRlbnkuZmlsdGVyKGZ1bmN0aW9uKHQpIHsgcmV0dXJuICFfYWxsRGVueS5oYXModCk7IH0pOwogICAgICB3cml0ZUZpbGVTeW5jKF9sZWFuU2V0dGluZ3MsIEpTT04uc3RyaW5naWZ5KF9zLCBudWxsLCAyKSArICdcbicpOwogICAgfSBjYXRjaCB7fQogICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoJ1tjbGF3Z29kXSBMZWFuIG1vZGUgZGlzYWJsZWQuIEFsbCB0b29scyByZXN0b3JlZC5cbicpOwogIH0gZWxzZSB7CiAgICBjb25zdCBfaXNNYXggPSBwcm9jZXNzLmFyZ3YuaW5jbHVkZXMoJy0tbGVhbi1tYXgnKTsKICAgIF91bmxpbmsoX2xlYW5PZmYpOwogICAgaWYgKF9pc01heCkgd3JpdGVGaWxlU3luYyhfbGVhbk1heCwgJycpOyBlbHNlIF91bmxpbmsoX2xlYW5NYXgpOwogICAgY29uc3QgX2RlbnkgPSBfaXNNYXggPyBbLi4uX2Jhc2VEZW55LCAuLi5fbWF4RGVueV0gOiBfYmFzZURlbnk7CiAgICBjb25zdCBfZmxhZ3MgPSBfaXNNYXggPyBfYWxsRmxhZ3MgOiBfYmFzZUZsYWdzOwogICAgdHJ5IHsKICAgICAgbGV0IF9zID0ge307CiAgICAgIHRyeSB7IF9zID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMoX2xlYW5TZXR0aW5ncywgJ3V0ZjgnKSk7IH0gY2F0Y2gge30KICAgICAgbGV0IF9jaCA9IGZhbHNlOwogICAgICBmb3IgKGNvbnN0IF9rIG9mIF9mbGFncykgeyBpZiAoIShfayBpbiBfcykpIHsgX3NbX2tdID0gdHJ1ZTsgX2NoID0gdHJ1ZTsgfSB9CiAgICAgIC8vIElmIGRvd25ncmFkaW5nIGZyb20gbWF4IHRvIG9uLCByZW1vdmUgbWF4LW9ubHkga2V5cwogICAgICBpZiAoIV9pc01heCkgeyBmb3IgKGNvbnN0IF9rIG9mIF9tYXhGbGFncykgeyBpZiAoX2sgaW4gX3MpIHsgZGVsZXRlIF9zW19rXTsgX2NoID0gdHJ1ZTsgfSB9IH0KICAgICAgaWYgKCFfcy5wZXJtaXNzaW9ucykgX3MucGVybWlzc2lvbnMgPSB7fTsKICAgICAgaWYgKCFBcnJheS5pc0FycmF5KF9zLnBlcm1pc3Npb25zLmRlbnkpKSBfcy5wZXJtaXNzaW9ucy5kZW55ID0gW107CiAgICAgIGNvbnN0IF9leCA9IG5ldyBTZXQoX3MucGVybWlzc2lvbnMuZGVueSk7CiAgICAgIGZvciAoY29uc3QgX3Qgb2YgX2RlbnkpIHsgaWYgKCFfZXguaGFzKF90KSkgeyBfcy5wZXJtaXNzaW9ucy5kZW55LnB1c2goX3QpOyBfY2ggPSB0cnVlOyB9IH0KICAgICAgLy8gSWYgZG93bmdyYWRpbmcgZnJvbSBtYXggdG8gb24sIHJlbW92ZSBtYXgtb25seSBkZW55IGVudHJpZXMKICAgICAgaWYgKCFfaXNNYXgpIHsKICAgICAgICBjb25zdCBfbWF4U2V0ID0gbmV3IFNldChfbWF4RGVueSk7CiAgICAgICAgY29uc3QgX2JlZm9yZSA9IF9zLnBlcm1pc3Npb25zLmRlbnkubGVuZ3RoOwogICAgICAgIF9zLnBlcm1pc3Npb25zLmRlbnkgPSBfcy5wZXJtaXNzaW9ucy5kZW55LmZpbHRlcihmdW5jdGlvbih0KSB7IHJldHVybiAhX21heFNldC5oYXModCk7IH0pOwogICAgICAgIGlmIChfcy5wZXJtaXNzaW9ucy5kZW55Lmxlbmd0aCAhPT0gX2JlZm9yZSkgX2NoID0gdHJ1ZTsKICAgICAgfQogICAgICBpZiAoX2NoKSB3cml0ZUZpbGVTeW5jKF9sZWFuU2V0dGluZ3MsIEpTT04uc3RyaW5naWZ5KF9zLCBudWxsLCAyKSArICdcbicpOwogICAgfSBjYXRjaCB7fQogICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoJ1tjbGF3Z29kXSBMZWFuIG1vZGU6ICcgKyAoX2lzTWF4ID8gJ21heCcgOiAnb24nKSArICcuIFNldHRpbmdzIHVwZGF0ZWQuXG4nKTsKICB9CiAgcHJvY2Vzcy5leGl0KDApOwp9CgovLyBVcGRhdGUgY2hlY2sg4oCUIGNhY2hlZCwgbm9uLWJsb2NraW5nLCAyNGggaW50ZXJ2YWwKdHJ5IHsKICBjb25zdCBfdWNGaWxlID0gam9pbihjbGF3Z29kRGlyLCAnLnVwZGF0ZS1jaGVjaycpOwogIGNvbnN0IF92ZXJGaWxlID0gam9pbihjbGF3Z29kRGlyLCAnLmNsYXdnb2QtdmVyc2lvbicpOwogIGlmIChleGlzdHNTeW5jKF92ZXJGaWxlKSkgewogICAgY29uc3QgX2xvY2FsVmVyID0gcmVhZEZpbGVTeW5jKF92ZXJGaWxlLCAndXRmOCcpLnRyaW0oKTsKICAgIGxldCBfdWMgPSBudWxsOwogICAgdHJ5IHsgaWYgKGV4aXN0c1N5bmMoX3VjRmlsZSkpIF91YyA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKF91Y0ZpbGUsICd1dGY4JykpOyB9IGNhdGNoIHt9CiAgICB2YXIgX3NlbUd0ID0gZnVuY3Rpb24oYSwgYikgeyB2YXIgeCA9IGEuc3BsaXQoJy4nKSwgeSA9IGIuc3BsaXQoJy4nKTsgZm9yICh2YXIgaSA9IDA7IGkgPCAzOyBpKyspIHsgdmFyIGQgPSAocGFyc2VJbnQoeFtpXXx8MCkpIC0gKHBhcnNlSW50KHlbaV18fDApKTsgaWYgKGQpIHJldHVybiBkID4gMDsgfSByZXR1cm4gZmFsc2U7IH07CiAgICBpZiAoX3VjICYmIF91Yy52ICYmIF9zZW1HdChfdWMudiwgX2xvY2FsVmVyKSkgewogICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZSgnW2NsYXdnb2RdIHYnICsgX3VjLnYgKyAnIGF2YWlsYWJsZSAoaW5zdGFsbGVkOiB2JyArIF9sb2NhbFZlciArICIpIOKAlCBydW4gJ2NsYXVkZSB1cGRhdGUnIHRvIHVwZ3JhZGVcbiIpOwogICAgfQogICAgaWYgKCFfdWMgfHwgRGF0ZS5ub3coKSAtIChfdWMudCB8fCAwKSA+IDg2NDAwMDAwKSB7CiAgICAgIGZldGNoKCdodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL0E2MDgzNDUwL2NsYXdnb2QtcGx1cy9yZWxlYXNlcy9sYXRlc3QnLCB7CiAgICAgICAgaGVhZGVyczogeyAnVXNlci1BZ2VudCc6ICdjbGF3Z29kJyB9LAogICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCg1MDAwKSwKICAgICAgfSkudGhlbihmdW5jdGlvbihyKSB7IHJldHVybiByLmpzb24oKTsgfSkudGhlbihmdW5jdGlvbihkKSB7CiAgICAgICAgdmFyIHYgPSAoZC50YWdfbmFtZSB8fCAnJykucmVwbGFjZSgvXnYvLCAnJyk7CiAgICAgICAgaWYgKHYpIHdyaXRlRmlsZVN5bmMoX3VjRmlsZSwgSlNPTi5zdHJpbmdpZnkoeyB0OiBEYXRlLm5vdygpLCB2OiB2IH0pKTsKICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oKSB7fSk7CiAgICB9CiAgfQp9IGNhdGNoIHt9CgpyZXF1aXJlKCcuL2NsaS5vcmlnaW5hbC5janMnKTsK')
[System.IO.File]::WriteAllBytes((Join-Path $ClawDir "cli.cjs"), $WrapperBytes)
Set-Content (Join-Path $ClawDir ".clawgod-version") $ClawSelfVersion
Write-OK "Wrapper created (cli.cjs)"

# ─── Write universal patcher ──────────────────────────
# (Same Bun patcher as bash version — inline to avoid extra download)

$patcherCode = @'
#!/usr/bin/env bun
/**
 * ClawGod Plus Universal Patcher
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = join(__dirname, 'cli.original.cjs');
const BACKUP = TARGET + '.bak';
const ACORN_CACHE = join(__dirname, 'vendor', 'acorn.cjs');
const ACORN_URL = 'https://unpkg.com/acorn@8.16.0/dist/acorn.js';

async function loadAcorn() {
  try {
    if (!existsSync(ACORN_CACHE)) {
      mkdirSync(dirname(ACORN_CACHE), { recursive: true });
      const response = await fetch(ACORN_URL);
      if (!response.ok) return null;
      const temp = `${ACORN_CACHE}.${process.pid}.tmp`;
      writeFileSync(temp, await response.text(), 'utf8');
      renameSync(temp, ACORN_CACHE);
    }
    const module = await import(pathToFileURL(ACORN_CACHE).href);
    const acorn = typeof module.parse === 'function' ? module : module.default;
    return acorn && typeof acorn.parse === 'function' ? acorn : null;
  } catch {
    return null;
  }
}

function findNodes(node, predicate, results = []) {
  if (!node || typeof node !== 'object') return results;
  if (predicate(node)) results.push(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (!child || typeof child !== 'object') continue;
    if (Array.isArray(child)) {
      for (const item of child) findNodes(item, predicate, results);
    } else {
      findNodes(child, predicate, results);
    }
  }
  return results;
}

function isChromeClientFactory(node) {
  let bodyStmts;
  if (node.body?.type === 'BlockStatement') bodyStmts = node.body.body;
  else return false;
  if (!node.params || node.params.length !== 1) return false;
  if (bodyStmts.length !== 1 || bodyStmts[0].type !== 'ReturnStatement') return false;
  const ret = bodyStmts[0].argument;
  if (!ret || ret.type !== 'ConditionalExpression') return false;
  if (ret.test?.type !== 'MemberExpression' || ret.test.property?.name !== 'bridgeConfig') return false;
  const alt = ret.alternate;
  if (!alt || alt.type !== 'ConditionalExpression') return false;
  if (alt.test?.type !== 'MemberExpression' || alt.test.property?.name !== 'getSocketPaths') return false;
  return true;
}

async function applyClaudeChromeSocketPatch(source, { dryRun, verify }) {
  const replacements = [];
  const seen = new Set();
  const needs = {
    clientFactory: !source.includes('__ccpp_bridge_fallback_v2'),
    subscriptionGate: !source.includes('__ccpp_sub_bypass'),
    subscriptionMsg: !source.includes('__ccpp_sub_msg_bypass'),
    selectBrowserHide: !source.includes('__ccpp_no_select_browser'),
  };

  function add(name, start, end, replacement) {
    if (!needs[name] || seen.has(name)) return;
    replacements.push({ name, start, end, replacement });
    seen.add(name);
  }

  const legacyClientFactoryRe = /function ([\w$]+)\(([\w$]+)\)\{if\(\2\.getSocketPaths\)\{var __paths=\2\.getSocketPaths\(\);if\(__paths&&__paths\.length>0\)return ([\w$]+\(\2\))\}return \2\.bridgeConfig\?([\w$]+\(\2\)):([\w$]+\(\2\))\}\/\*__ccpp_bridge_fallback\*\//g;
  const legacyClientFactory = legacyClientFactoryRe.exec(source);
  if (legacyClientFactory) {
    add(
      'clientFactory',
      legacyClientFactory.index,
      legacyClientFactory.index + legacyClientFactory[0].length,
      `function ${legacyClientFactory[1]}(${legacyClientFactory[2]}){return ${legacyClientFactory[2]}.getSocketPaths?${legacyClientFactory[3]}:${legacyClientFactory[2]}.bridgeConfig?${legacyClientFactory[4]}:${legacyClientFactory[5]}}/*__ccpp_bridge_fallback_v2*/`
    );
  }

  let parseSource = source;
  let offset = 0;
  if (parseSource.startsWith('#!')) {
    const idx = parseSource.indexOf('\n');
    if (idx >= 0) {
      offset = idx + 1;
      parseSource = parseSource.slice(offset);
    }
  }

  const acorn = Object.values(needs).some(Boolean) ? await loadAcorn() : null;
  if (acorn) {
    try {
      const ast = acorn.parse(parseSource, { ecmaVersion: 'latest', sourceType: 'module' });
      const src = (node) => parseSource.slice(node.start, node.end);
      const abs = (pos) => pos + offset;

      if (needs.clientFactory) {
        const funcs = [
          ...findNodes(ast, (n) => n.type === 'FunctionDeclaration'),
          ...findNodes(ast, (n) =>
            n.type === 'VariableDeclarator' &&
            n.init &&
            (n.init.type === 'ArrowFunctionExpression' || n.init.type === 'FunctionExpression')
          ),
        ];
        for (const node of funcs) {
          const fnNode = node.type === 'VariableDeclarator' ? node.init : node;
          if (!isChromeClientFactory(fnNode)) continue;
          const paramName = fnNode.params[0].name;
          const cond = fnNode.body.body[0].argument;
          const bridgeCall = src(cond.consequent);
          const socketCall = src(cond.alternate.consequent);
          const nativeCall = src(cond.alternate.alternate);
          add(
            'clientFactory',
            abs(fnNode.body.start),
            abs(fnNode.body.end),
            `{return ${paramName}.getSocketPaths?${socketCall}:${paramName}.bridgeConfig?${bridgeCall}:${nativeCall}}/*__ccpp_bridge_fallback_v2*/`
          );
          break;
        }
      }

      if (needs.subscriptionGate) {
        for (const decl of findNodes(ast, (n) => n.type === 'VariableDeclarator')) {
          if (!decl.init || decl.init.type !== 'LogicalExpression' || decl.init.operator !== '&&') continue;
          const left = decl.init.left;
          const right = decl.init.right;
          if (left.type !== 'CallExpression' || !left.arguments?.length) continue;
          const arg = left.arguments[0];
          if (!arg || arg.type !== 'MemberExpression' || arg.property?.name !== 'chrome') continue;
          if (right.type !== 'CallExpression' || right.arguments?.length !== 0) continue;
          const calleeName = left.callee?.name || left.callee?.property?.name;
          if (!calleeName) continue;
          const defs = findNodes(ast, (n) =>
            (n.type === 'FunctionDeclaration' && n.id?.name === calleeName) ||
            (n.type === 'VariableDeclarator' && n.id?.name === calleeName)
          );
          if (!defs.some((def) => src(def).includes('claudeInChromeDefaultEnabled'))) continue;
          add('subscriptionGate', abs(decl.init.start), abs(decl.init.end), `${src(left)}/*__ccpp_sub_bypass*/`);
          break;
        }
      }

      if (needs.subscriptionMsg) {
        const msgAnchor = 'Claude in Chrome requires a claude.ai subscription.';
        const msgPos = parseSource.indexOf(msgAnchor);
        if (msgPos >= 0) {
          const before = parseSource.slice(Math.max(0, msgPos - 200), msgPos);
          if (!before.includes('false&&')) {
            const logicals = findNodes(ast, (n) =>
              n.type === 'LogicalExpression' &&
              n.operator === '&&' &&
              n.start <= msgPos &&
              n.end >= msgPos &&
              n.left?.type === 'UnaryExpression' &&
              n.left.operator === '!'
            );
            if (logicals.length > 0) {
              const target = logicals.reduce((a, b) => (b.end - b.start) < (a.end - a.start) ? b : a);
              add('subscriptionMsg', abs(target.left.start), abs(target.left.end), 'false/*__ccpp_sub_msg_bypass*/');
            }
          }
        }
      }

      if (needs.selectBrowserHide) {
        const selectBrowserNodes = findNodes(ast, (n) => {
          if (n.type !== 'ObjectExpression') return false;
          return n.properties?.some((p) => p.key?.name === 'value' && p.value?.value === 'select-browser');
        });
        if (selectBrowserNodes.length > 0) {
          const sbNode = selectBrowserNodes[0];
          const pushCalls = findNodes(ast, (n) =>
            n.type === 'CallExpression' &&
            n.callee?.property?.name === 'push' &&
            n.start >= sbNode.start &&
            n.start - sbNode.end <= 200
          );
          if (pushCalls.length > 0) {
            add('selectBrowserHide', abs(pushCalls[0].start), abs(pushCalls[0].end), 'void 0/*__ccpp_no_select_browser*/');
          }
        }
      }
    } catch {}
  }

  // Regex fallback for the current minified bundle shape. The AST path above
  // handles name drift; this keeps install/repatch useful if acorn is absent.
  if (needs.clientFactory && !seen.has('clientFactory')) {
    const re = /function ([\w$]+)\(([\w$]+)\)\{return \2\.bridgeConfig\?([\w$]+\(\2\)):\2\.getSocketPaths\?([\w$]+\(\2\)):([\w$]+\(\2\))\}/g;
    const m = re.exec(source);
    if (m) add('clientFactory', m.index, m.index + m[0].length, `function ${m[1]}(${m[2]}){return ${m[2]}.getSocketPaths?${m[4]}:${m[2]}.bridgeConfig?${m[3]}:${m[5]}}/*__ccpp_bridge_fallback_v2*/`);
  }

  if (needs.subscriptionGate && !seen.has('subscriptionGate')) {
    const re = /(\b[\w$]+\(([\w$]+)\.chrome\);let [\w$]+=)([\w$]+\(\2\.chrome\))&&[\w$]+\(\)(?=,[\s\S]{0,1600}?tengu_claude_in_chrome_setup)/g;
    const m = re.exec(source);
    if (m) add('subscriptionGate', m.index, m.index + m[0].length, `${m[1]}${m[3]}/*__ccpp_sub_bypass*/`);
  }

  if (needs.subscriptionMsg && !seen.has('subscriptionMsg')) {
    const re = /(\b[\w$]+=)(![\w$]+)(&&[\s\S]{0,500}?"Claude in Chrome requires a claude\.ai subscription\.")/g;
    const m = re.exec(source);
    if (m) add('subscriptionMsg', m.index, m.index + m[0].length, `${m[1]}false/*__ccpp_sub_msg_bypass*/${m[3]}`);
  }

  if (needs.selectBrowserHide && !seen.has('selectBrowserHide')) {
    const re = /(\{label:"Select browser(?:\\u2026|\u2026)",value:"select-browser"\}[\s\S]{0,240}?)([\w$]+)\.push\(([\w$]+)\)/g;
    const m = re.exec(source);
    if (m) add('selectBrowserHide', m.index, m.index + m[0].length, `${m[1]}void 0/*__ccpp_no_select_browser*/`);
  }

  if (replacements.length === 0) {
    const hasChrome = source.includes('tengu_claude_in_chrome_setup') ||
      source.includes('Claude in Chrome requires a claude.ai subscription.') ||
      source.includes('select-browser');
    const allApplied = source.includes('__ccpp_bridge_fallback_v2') &&
      (source.includes('__ccpp_sub_bypass') || !source.includes('tengu_claude_in_chrome_setup')) &&
      (source.includes('__ccpp_sub_msg_bypass') || !source.includes('Claude in Chrome requires a claude.ai subscription.')) &&
      (source.includes('__ccpp_no_select_browser') || !source.includes('select-browser'));
    if (allApplied) return { status: 'already', detail: 'already applied' };
    if (!hasChrome) return { status: 'skipped', detail: 'not present in this version' };
    return { status: 'failed', detail: 'Chrome socket patterns not found' };
  }

  if (verify) return { status: 'verify', count: replacements.length };

  let next = source;
  if (!dryRun) {
    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) next = next.slice(0, r.start) + r.replacement + next.slice(r.end);
  }
  return { status: 'applied', count: replacements.length, code: next };
}

async function applyContextLimitPatch(source, { dryRun, verify }) {
  const ENV_EXPR = '(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||+process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS||200000)';
  const dualRe = /var\s+([\w$]+)\s*=\s*200000\s*,\s*([\w$]+)\s*=\s*200000\s*,\s*([\w$]+)\s*=\s*32000\s*,\s*([\w$]+)\s*=\s*128000\s*,\s*([\w$]+)\s*=\s*1e6\b/;
  const alreadyRe = new RegExp('var\\s+([\\w$]+)\\s*=\\s*\\(\\+process\\.env\\.CLAUDE_CODE_CONTEXT_LIMIT\\|\\|\\+process\\.env\\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\\|\\|200000\\)\\s*,\\s*([\\w$]+)\\s*=\\s*\\(\\+process\\.env\\.CLAUDE_CODE_CONTEXT_LIMIT\\|\\|\\+process\\.env\\.CLAUDE_CODE_MAX_CONTEXT_TOKENS\\|\\|200000\\)\\s*,\\s*[\\w$]+\\s*=\\s*32000\\s*,\\s*[\\w$]+\\s*=\\s*128000\\s*,\\s*[\\w$]+\\s*=\\s*1e6\\b');

  const dualMatch = dualRe.exec(source);
  const alreadyMatch = alreadyRe.exec(source);
  if (!dualMatch && !alreadyMatch) {
    if (!source.includes('200000')) return { status: 'skipped', detail: 'not present in this version' };
    return { status: 'failed', detail: 'context default constants not found' };
  }

  const match = dualMatch || alreadyMatch;
  const [, varA, varB, varC, varD, varE] = match;
  const replacements = [];
  if (dualMatch) {
    replacements.push({
      start: dualMatch.index,
      end: dualMatch.index + dualMatch[0].length,
      replacement: `var ${varA}=${ENV_EXPR},${varB}=${ENV_EXPR},${varC}=32000,${varD}=128000,${varE}=1e6`,
    });

    // The large-message guard has the minified shape
    // `return message?tokenCount(message)>200000:!1`. Patch only that guard;
    // unrelated numeric thresholds and model metadata must stay upstream-owned.
    const cmpRe = /\breturn ([\w$]+)\?([\w$]+)\(\1\)>200000:!1/g;
    let cm;
    while ((cm = cmpRe.exec(source)) !== null) {
      const comparison = `${cm[2]}(${cm[1]})>200000`;
      const start = cm.index + cm[0].indexOf(comparison);
      replacements.push({
        start,
        end: start + comparison.length,
        replacement: `${cm[2]}(${cm[1]})>${ENV_EXPR}`,
      });
    }
  }

  const envReassign = `;${varA}=${ENV_EXPR};${varB}=${ENV_EXPR};`;
  const acorn = await loadAcorn();
  if (acorn) {
    try {
      const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
      const envAssigns = findNodes(ast, (n) =>
        n.type === 'ExpressionStatement' &&
        n.expression?.type === 'CallExpression' &&
        n.expression.callee?.type === 'MemberExpression' &&
        n.expression.callee.object?.name === 'Object' &&
        n.expression.callee.property?.name === 'assign' &&
        n.expression.arguments?.length >= 2 &&
        n.expression.arguments[0]?.type === 'MemberExpression' &&
        n.expression.arguments[0].object?.name === 'process' &&
        n.expression.arguments[0].property?.name === 'env'
      );
      for (const stmt of envAssigns.slice(0, 6)) {
        if (source.startsWith(envReassign, stmt.end)) continue;
        replacements.push({ start: stmt.end, end: stmt.end, replacement: envReassign });
      }
    } catch {}
  }

  if (replacements.length === 0) return { status: 'already', detail: 'already applied' };
  if (verify) return { status: 'verify', count: replacements.length };

  let next = source;
  if (!dryRun) {
    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) next = next.slice(0, r.start) + r.replacement + next.slice(r.end);
  }
  return { status: 'applied', count: replacements.length, code: next };
}

const patches = [
  {
    name: 'USER_TYPE → ant',
    pattern: /function ([\w$]+)\(\)\{return"external"\}/g,
    replacer: (m, fn) => `function ${fn}(){return"ant"}`,
    sentinel: 'return"external"',
  },
  {
    // ClawGod Plus runs extracted cli.cjs under Bun even when Bun reports itself as
    // standalone. Special-case only the worker/daemon resolver; the shared
    // standalone predicate also controls Chrome and Computer Use MCP commands.
    name: 'Worker resolver for plain Bun cli.cjs (target shape)',
    pattern: /if\(([\w$]+)\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};let ([\w$]+)=process\.argv\[1\];if\(!\2\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};return\{cmd:process\.execPath,prefixArgs:\[\2\],target:\2\}/g,
    replacer: (m, standalone, entry) => `let ${entry}=process.argv[1];if(${entry}&&/(?:^|[\\/])cli\\.cjs$/.test(${entry}))return{cmd:process.execPath,prefixArgs:[${entry}],target:${entry}}/*__clawgod_plain_bun_worker__*/;if(${standalone}())return{cmd:process.execPath,prefixArgs:[],target:process.execPath};if(!${entry})return{cmd:process.execPath,prefixArgs:[],target:process.execPath};return{cmd:process.execPath,prefixArgs:[${entry}],target:${entry}}`,
    appliedMarker: '/*__clawgod_plain_bun_worker__*/',
    knownShape: /if\([\w$]+\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};let [\w$]+=process\.argv\[1\];if\(![\w$]+\)return\{cmd:process\.execPath,prefixArgs:\[\],target:process\.execPath\};return\{cmd:process\.execPath,prefixArgs:/,
    optional: true,
  },
  {
    name: 'Worker resolver for plain Bun cli.cjs (legacy shape)',
    pattern: /if\(([\w$]+)\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\]\};let ([\w$]+)=process\.argv\[1\];if\(!\2\)return\{cmd:process\.execPath,prefixArgs:\[\]\};return\{cmd:process\.execPath,prefixArgs:\[\2\]\}/g,
    replacer: (m, standalone, entry) => `let ${entry}=process.argv[1];if(${entry}&&/(?:^|[\\/])cli\\.cjs$/.test(${entry}))return{cmd:process.execPath,prefixArgs:[${entry}]}/*__clawgod_plain_bun_worker__*/;if(${standalone}())return{cmd:process.execPath,prefixArgs:[]};if(!${entry})return{cmd:process.execPath,prefixArgs:[]};return{cmd:process.execPath,prefixArgs:[${entry}]}`,
    appliedMarker: '/*__clawgod_plain_bun_worker__*/',
    knownShape: /if\([\w$]+\(\)\)return\{cmd:process\.execPath,prefixArgs:\[\]\};let [\w$]+=process\.argv\[1\];if\(![\w$]+\)return\{cmd:process\.execPath,prefixArgs:\[\]\};return\{cmd:process\.execPath,prefixArgs:/,
    optional: true,
  },
  {
    name: 'GrowthBook env overrides',
    pattern: /function ([\w$]+)\(\)\{if\(!([\w$]+)\)\2=!0;return ([\w$]+)\}/g,
    replacer: (m, fn, flag, val) =>
      `function ${fn}(){if(!${flag}){${flag}=!0;try{let e=process.env.CLAUDE_INTERNAL_FC_OVERRIDES;if(e)${val}=JSON.parse(e)}catch(e){}}return ${val}}`,
    unique: true,
  },
  {
    name: 'GrowthBook config overrides',
    pattern: /function ([\w$]+)\(\)\{return\}(function)/g,
    replacer: (m, fn, next) =>
      `function ${fn}(){return null}${next}`,
    selectIndex: 0,
    validate: (match, code) => {
      const pos = code.indexOf(match);
      const nearby = code.substring(Math.max(0, pos - 500), pos + 500);
      return nearby.includes('growthBook') || nearby.includes('GrowthBook') || nearby.includes('FeatureValue');
    },
  },
  {
    name: 'Agent Teams always enabled',
    pattern: /function ([\w$]+)\(\)\{if\(![\w$]+\(process\.env\.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS\)&&![\w$]+\(\)\)return!1;if\(![\w$]+\("tengu_amber_flint",!0\)\)return!1;return!0\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
    sentinel: 'tengu_amber_flint',
  },
  {
    // Session-aware launchers pass this metadata through the early view gate.
    name: 'Agents view session metadata',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{for\(let ([\w$]+)=0;\3<\2\.length;\3\+\+\)\{let ([\w$]+)=\2\[\3\];if\((\4==="--debug"\|\|\4==="-d"\|\|\4==="--debug-to-stderr"\|\|\4==="-d2e"\|\|\4\.startsWith\("--debug="\)\|\|\4\.startsWith\("--debug-file="\))\)continue;if\(\4==="--debug-file"&&\3\+1<\2\.length\)\{\3\+\+;continue\}return!1\}return!0\}/g,
    replacer: (m, fn, args, index, arg, debugFlags) =>
      `function ${fn}(${args}){for(let ${index}=0;${index}<${args}.length;${index}++){let ${arg}=${args}[${index}];if(${debugFlags})continue;if(${arg}==="--debug-file"&&${index}+1<${args}.length){${index}++;continue}if(${arg}==="--session-id"/*__clawgod_agents_session_id__*/&&${index}+1<${args}.length){${index}++;continue}return!1}return!0}`,
    appliedMarker: '/*__clawgod_agents_session_id__*/',
    unique: true,
  },
  {
    // The launcher prepends --chrome to empty interactive starts. Upstream
    // parses that flag before this gate, so validate the remaining arguments;
    // otherwise defaultToAgentsView is never read.
    name: 'Default Agents view with auto Chrome',
    pattern: /,([\w$]+)=([\w$]+)\.hasAgentsPositional&&([\w$]+)\(([\w$]+)\);if\(\(\1\|\|\3\(([\w$]+)\)&&process\.stdin\.isTTY\)&&process\.stdout\.isTTY\)\{/g,
    replacer: (m, explicit, parsed, validator, rest) =>
      `,${explicit}=${parsed}.hasAgentsPositional&&${validator}(${rest});if((${explicit}||${validator}(${parsed}.rest/*__clawgod_default_agents_view__*/)&&process.stdin.isTTY)&&process.stdout.isTTY){`,
    appliedMarker: '/*__clawgod_default_agents_view__*/',
    knownShape: /hasAgentsPositional&&[\w$]+\([\w$]+\);if\(\([\w$]+\|\|[\w$]+\([\w$]+\)&&process\.stdin\.isTTY\)&&process\.stdout\.isTTY\)/,
    unique: true,
  },
  {
    // Keep the chat Agent list from crowding out the composer in short terminals.
    name: 'Chat Agent list fits terminal height',
    pattern: /\{columns:([\w$]+)\}=([\w$]+)\(\)([\s\S]{0,8000}?)\{windowStart:([\w$]+),windowEnd:([\w$]+),moreAbove:([\w$]+),moreBelow:([\w$]+)\}=([\w$]+)\(([\w$]+),([\w$]+)\.length,([\w$]+)\)/g,
    replacer: (m, columns, dimensions, middle, windowStart, windowEnd, moreAbove, moreBelow, windowFn, selected, tasks, limit) =>
      `{columns:${columns},rows:__clawgodTerminalRows}=${dimensions}(),__clawgodMaxChatAgentRows=Math.max(1,Math.min(${limit},__clawgodTerminalRows-6))${middle}{windowStart:${windowStart},windowEnd:${windowEnd},moreAbove:${moreAbove},moreBelow:${moreBelow}}=${windowFn}(${selected},${tasks}.length,__clawgodMaxChatAgentRows/*__clawgod_chat_agent_rows__*/)`,
    appliedMarker: '/*__clawgod_chat_agent_rows__*/',
    validate: (match, code) => code.substring(Math.max(0, code.indexOf(match) - 300), code.indexOf(match)).includes('showWorkflows'),
    optional: true,
    unique: true,
  },
  {
    name: 'Chat Agent list keeps overflow indicator',
    pattern: /([\w$]+)\.length>([\w$]+)&&([\w$]+)\.jsx\(([\w$]+),\{justifyContent:"flex-end",children:/g,
    replacer: (m, tasks, limit, react, box) =>
      `${tasks}.length>__clawgodMaxChatAgentRows/*__clawgod_chat_agent_more__*/&&${react}.jsx(${box},{justifyContent:"flex-end",children:`,
    appliedMarker: '/*__clawgod_chat_agent_more__*/',
    validate: (match, code) => {
      const marker = code.indexOf('/*__clawgod_chat_agent_rows__*/');
      const pos = code.indexOf(match);
      return marker >= 0 && pos > marker && pos - marker < 4000;
    },
    optional: true,
    unique: true,
  },
  {
    name: 'Agents directories default collapsed state',
    pattern: /,\[([\w$]+),([\w$]+)\]=([\w$]+)\.useState\(\(\)=>\{let [\w$]+=[\w$]+;return new Set\([\s\S]{0,500}?\)\}\),([\w$]+)=\3\.useRef\(\1\);\4\.current=\1;let\[[\w$]+,[\w$]+\]=\3\.useState\(\(\)=>new Set\)/g,
    replacer: (m, collapsed, setCollapsed, react, collapsedRef) => {
      const anchor = `${collapsedRef}=${react}.useRef(${collapsed});${collapsedRef}.current=${collapsed};`;
      return m.replace(anchor, `${anchor}let __clawgodShouldDefaultCollapseDirectories=${react}.useRef(${collapsed}.size===0),__clawgodCollapsedDirectoryKeys=${react}.useRef(new Set),__clawgodSetCollapsedGroups=${setCollapsed},__clawgodReact=${react};/*__clawgod_collapsed_directory_state__*/`);
    },
    appliedMarker: '/*__clawgod_collapsed_directory_state__*/',
    optional: true,
    unique: true,
  },
  {
    name: 'Agents directories default collapsed rows',
    pattern: /if\(([\w$]+)\.size>0\)([\w$]+)=\2\.filter\(\(([\w$]+)\)=>\3\.kind==="header"\|\|!\1\.has\(([\w$]+)\(\3\.group\)\)\);function /g,
    replacer: (m, collapsed, rows, row, groupKey) =>
      `__clawgodReact.useLayoutEffect(()=>{let keys=[];if(__clawgodShouldDefaultCollapseDirectories.current)for(let row of ${rows})if(row.kind==="header"){let key=${groupKey}(row.group);if(key.startsWith("directory:")&&!__clawgodCollapsedDirectoryKeys.current.has(key))__clawgodCollapsedDirectoryKeys.current.add(key),keys.push(key)}__clawgodSetCollapsedGroups((current)=>{let next=new Set(current),changed=!1,marker="group:__clawgod_expanded_directories__";if(!next.has(marker))next.add(marker),changed=!0;for(let key of keys)if(!next.has(key))next.add(key),changed=!0;return changed?next:current})},[${rows}]);${m.replace(`${collapsed}.size>0`, `${collapsed}.size/*__clawgod_default_collapsed_directories__*/>0`)}`,
    appliedMarker: '/*__clawgod_default_collapsed_directories__*/',
    validate: (match, code) => code.includes('/*__clawgod_collapsed_directory_state__*/'),
    optional: true,
    unique: true,
  },
  {
    // API-key and setup-token sessions expose only user:inference, but local
    // socket mode does not require Claude.ai OAuth scopes. Respect --chrome.
    name: 'Claude in Chrome OAuth scope bypass',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{if\(![\w$]+\(\)\)return [\w$]+\("\[Claude in Chrome\] Disabled: OAuth token has no scope accepted by \/api\/oauth\/validate[^"]*"\),!1;if\(\2===!0\)return!0;/g,
    replacer: (m, fn, arg) => `function ${fn}(${arg}){/*__ccpp_chrome_oauth_scope_bypass*/if(${arg}===!0)return!0;`,
    appliedMarker: '/*__ccpp_chrome_oauth_scope_bypass*/',
    optional: true,
  },
  {
    // `claude --chrome agents` enables Chrome tools in the Fleet View host, but
    // upstream only persists a narrow config subset into dispatched background
    // jobs. Preserve the Chrome flag so sessions created from `claude agents`
    // keep `claude-in-chrome` after attach/respawn.
    name: 'Claude in Chrome agents config state',
    pattern: /([\w$]+)=\{addDir:\[\],pluginDir:\[\],pluginDirNoMcp:\[\],settings:void 0,mcpConfig:\[\],strictMcpConfig:!1\}/g,
    replacer: (m, cfg) => `${cfg}={addDir:[],pluginDir:[],pluginDirNoMcp:[],settings:void 0,mcpConfig:[],strictMcpConfig:!1,chrome:!1,noChrome:!1}`,
    appliedMarker: /[\w$]+=\{addDir:\[\],pluginDir:\[\],pluginDirNoMcp:\[\],settings:void 0,mcpConfig:\[\],strictMcpConfig:!1,chrome:!1,noChrome:!1\}/,
    validate: (match, code) => !code.includes('strictMcpConfig:!1,chrome:!1,noChrome:!1'),
  },
  {
    name: 'Claude in Chrome agents flag parser',
    pattern: /if\(([\w$]+)==="--strict-mcp-config"\)\{([\w$]+)\.strictMcpConfig=!0;continue\}/g,
    replacer: (m, arg, cfg) => `if(${arg}==="--chrome"){${cfg}.chrome=!0;continue}if(${arg}==="--no-chrome"){${cfg}.noChrome=!0;continue}` + m,
    appliedMarker: /if\([\w$]+==="--chrome"\)\{[\w$]+\.chrome=!0;continue\}if\([\w$]+==="--no-chrome"\)\{[\w$]+\.noChrome=!0;continue\}/,
    validate: (match, code) => !/if\([\w$]+==="--chrome"\)\{[\w$]+\.chrome=!0;continue\}/.test(code),
  },
  {
    name: 'Claude in Chrome agents config resolver',
    pattern: /strictMcpConfig:([\w$]+)\.strictMcpConfig\}\}function ([\w$]+)/g,
    replacer: (m, cfg, fn) => `strictMcpConfig:${cfg}.strictMcpConfig,chrome:${cfg}.chrome&&!${cfg}.noChrome,noChrome:${cfg}.noChrome}}function ${fn}`,
    appliedMarker: /chrome:[\w$]+\.chrome&&![\w$]+\.noChrome,noChrome:[\w$]+\.noChrome/,
    validate: (match, code) => !/chrome:[\w$]+\.chrome&&![\w$]+\.noChrome/.test(code),
  },
  {
    name: 'Claude in Chrome agents dispatch args',
    pattern: /\.\.\.e\.strictMcpConfig\?\["--strict-mcp-config"\]:\[\]\]\}/g,
    replacer: () => '...e.chrome?["--chrome"/*__ccpp_agents_chrome_dispatch*/]:[],...e.noChrome?["--no-chrome"]:[],...e.strictMcpConfig?["--strict-mcp-config"]:[]]}',
    appliedMarker: '__ccpp_agents_chrome_dispatch',
    validate: (match, code) => !code.includes('__ccpp_agents_chrome_dispatch'),
  },
  {
    name: 'Computer Use subscription bypass',
    pattern: /function ([\w$]+)\(\)\{let [\w$]+=[\w$]+\(\);return [\w$]+==="max"\|\|[\w$]+==="pro"\}/g,
    replacer: (m, fn) => `function ${fn}(){/*__clawgod_computer_use_subscription__*/return!0}`,
    appliedMarker: '/*__clawgod_computer_use_subscription__*/',
  },
  {
    name: 'Computer Use default enabled',
    pattern: /([\w$]+=)\{enabled:!1,pixelValidation/g,
    replacer: (m, prefix) => `${prefix}{enabled:!0,pixelValidation`,
    sentinel: '{enabled:!1,pixelValidation',
  },
  {
    // v2.1.92+: name:"ultraplan",get description(){...},argumentHint:"<prompt>",isEnabled:()=>fnRef()
    // Older  : name:"ultraplan",description:`...`,argumentHint:"<prompt>",isEnabled:()=>!1
    name: 'Ultraplan enable',
    pattern: /(name:"ultraplan",[\s\S]{1,500}?argumentHint:"<prompt>",isEnabled:\(\)=>)(?:!1|[\w$]+\(\))/g,
    replacer: (m, prefix) => `${prefix}!0`,
    sentinel: 'name:"ultraplan"',
    appliedMarker: 'argumentHint:"<prompt>",isEnabled:()=>!0',
  },
  {
    name: 'Ultrareview enable (rQt gate)',
    pattern: /function ([\w$]+)\(\)\{return ([\w$]+)\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\}/g,
    replacer: (m, fn) => `function ${fn}(){/*__clawgod_ultrareview_enabled__*/return!0}`,
    optional: true,
    appliedMarker: '/*__clawgod_ultrareview_enabled__*/',
  },
  {
    name: 'Ultrareview enable (direct literal, <=2.1.213)',
    pattern: /function ([\w$]+)\(\)\{return ([\w$]+)\("tengu_review_bughunter_config",null\)(\?\.enabled===!0)?\}/g,
    replacer: (m, fn, getter, gate) =>
      gate
        ? `function ${fn}(){return!0}`
        : `function ${fn}(){let _r=${getter}("tengu_review_bughunter_config",null);return _r?{..._r,enabled:!0}:{enabled:!0}}`,
    optional: true,
    sentinel: '("tengu_review_bughunter_config",null)',
    appliedMarker: ',enabled:!0}:{enabled:!0}}',
  },
  {
    // v2.1.215+: the config key is stored in ulu and the gate moved away
    // from the getter. Preserve every declaration between them and replace
    // only the gate; deleting that span leaves runtime references undefined.
    name: 'Ultrareview enable (v2.1.215+ gate)',
    pattern: /(function ([\w$]+)\(\)\{return [\w$]+\(ulu,null\)\})([\s\S]{0,1500}?)(function ([\w$]+)\(\)\{return \2\(\)\?\.enabled===!0&&[\w$]+\(\)&&![\w$]+\(\)\})/g,
    replacer: (m, getterDef, getter, between, gateDef, gate) =>
      `${getterDef}${between}function ${gate}(){/*__clawgod_ultrareview_enabled__*/return!0}`,
    sentinel: 'var ulu="tengu_review_bughunter_config"',
    appliedMarker: '/*__clawgod_ultrareview_enabled__*/',
  },
  {
    name: 'Logo + brand color → green (RGB dark)',
    pattern: /clawd_body:"rgb\(215,119,87\)"/g,
    replacer: () => 'clawd_body:"rgb(34,197,94)"',
    sentinel: 'clawd_body:"rgb(215,119,87)"',
  },
  {
    name: 'Logo + brand color → green (ANSI)',
    pattern: /clawd_body:"ansi:redBright"/g,
    replacer: () => 'clawd_body:"ansi:greenBright"',
    sentinel: 'clawd_body:"ansi:redBright"',
  },
  {
    name: 'Theme claude color → green (dark)',
    pattern: /claude:"rgb\(215,119,87\)"/g,
    replacer: () => 'claude:"rgb(34,197,94)"',
    sentinel: 'claude:"rgb(215,119,87)"',
  },
  {
    name: 'Theme claude color → green (light)',
    pattern: /claude:"rgb\(255,153,51\)"/g,
    replacer: () => 'claude:"rgb(22,163,74)"',
    sentinel: 'claude:"rgb(255,153,51)"',
  },
  {
    name: 'Shimmer → green',
    pattern: /claudeShimmer:"rgb\(2[34]5,1[45]9,1[12]7\)"/g,
    replacer: () => 'claudeShimmer:"rgb(74,222,128)"',
    appliedMarker: 'claudeShimmer:"rgb(74,222,128)"',
  },
  {
    name: 'Shimmer light → green',
    pattern: /claudeShimmer:"rgb\(255,183,101\)"/g,
    replacer: () => 'claudeShimmer:"rgb(34,197,94)"',
    sentinel: 'claudeShimmer:"rgb(255,183,101)"',
  },
  {
    name: 'Computer Use gate bypass',
    pattern: /function ([\w$]+)\(\)\{if\([\w$]+\("hipaa"\)\)return\s*!1;return [\w$]+\(\)&&[\w$]+\(\)\.enabled\}/g,
    replacer: (m, fn) => `function ${fn}(){/*__clawgod_computer_use_gate__*/return!0}`,
    sentinel: '"hipaa"',
    appliedMarker: '/*__clawgod_computer_use_gate__*/',
  },
  {
    // Streaming clients such as cmux provide permission prompts over stdio,
    // so Computer Use is safe and expected there too.
    name: 'Computer Use in noninteractive sessions',
    pattern: /if\(([\w$]+)\(\)==="macos"&&!([\w$]+)\(\)&&([\w$]+)\(\)\)try\{let\{setupComputerUseMCP:/g,
    replacer: (m, platform, isNonInteractive, gate) =>
      `if(${platform}()==="macos"&&${gate}())/*__clawgod_computer_use_noninteractive__*/try{let{setupComputerUseMCP:`,
    sentinel: 'setupComputerUseMCP',
    appliedMarker: '/*__clawgod_computer_use_noninteractive__*/',
  },
  {
    // ≤v2.1.18x: voice mode was GrowthBook-killable via
    //   function X(){return!Y("tengu_amber_quartz_disabled",!1)}
    // v2.1.183 removed that flag entirely; voice mode is now gated only by real
    // requirements — a Claude.ai account (hT(): if(!hT())return "...requires a
    // Claude.ai account...") plus microphone permission — neither a bypassable
    // flag. Faking the auth gate would show voice as available then fail at the
    // stream layer (voice_stream_no_auth), so there is nothing to bypass on
    // current builds. optional keeps it working on older bundles that still ship
    // the kill-flag, without a false "0 matches — cannot verify".
    name: 'Voice Mode enable (bypass GrowthBook kill)',
    pattern: /function ([\w$]+)\(\)\{return![\w$]+\("tengu_amber_quartz_disabled",!1\)\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
    optional: true,
  },
  {
    // v2.1.158+: provider gate refactored into helper function:
    //   function mw$(H){if(H==="firstParty"||H==="anthropicAws")return!0;return CH(process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}
    //   Called as: if(!mw$(q))return!1;  inside the auto-mode model gate.
    //   Lookahead ensures we only strip the call inside the auto-mode gate
    //   (the next 300 chars must contain !=="firstParty") and not unrelated
    //   if(!fn(x))return!1; patterns elsewhere.
    //   Not present in ≤v2.1.149 (provider gate was inline).
    name: 'Auto-mode unlock for third-party API (provider helper gate)',
    pattern: /if\(!([\w$]+)\(([\w$]+)\)\)return!1;(?=(?:(?!function\s).){0,300}!=="firstParty")/g,
    replacer: () => '',
    optional: true,
  },
  {
    // ≤v2.1.149: if(Y!=="firstParty"&&Y!=="anthropicAws")return!1;
    // v2.1.158+: if(q!=="firstParty"&&q!=="anthropicAws"&&($==="claude-opus-4-6"||…))return!1;
    // v2.1.214+: if(r!=="firstParty"&&!d6(r)&&(t==="claude-opus-4-6"||…))return!1;
    //   "anthropicAws" replaced by helper function !fn(var).
    //   Match both: \1!=="anthropicAws" OR !fn(\1).
    // [^;]* absorbs the optional model-condition tail safely. This patch is
    // optional because newer bundles may use the provider helper below.
    name: 'Auto-mode unlock for third-party API (inline gate)',
    pattern: /if\(([\w$]+)!=="firstParty"&&(?:\1!=="anthropicAws"|![\w$]+\(\1\))[^;]*\)return!1;/g,
    replacer: () => '',
    optional: true,
  },
  {
    // v2.1.158+: the auto-mode provider opt-in helper. Older bundles gated it
    // at the call site (if(!mw$(q))return!1;) — see 'provider helper gate'
    // above. By v2.1.183 the call site became a warning-message branch
    // (else if(!_kt(xr()))p="provider",...) so the call-site strip no longer
    // matches. The helper shape is unchanged, so neutralize it directly —
    // every provider becomes auto-mode eligible without needing the
    // CLAUDE_CODE_ENABLE_AUTO_MODE opt-in:
    //   function _kt(e){if(e==="firstParty"||e==="anthropicAws")return!0;return st(process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}
    name: 'Auto-mode unlock for third-party API (provider opt-in helper)',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{if\(\2==="firstParty"\|\|\2==="anthropicAws"\)return!0;return [\w$]+\(process\.env\.CLAUDE_CODE_ENABLE_AUTO_MODE\)\}/g,
    replacer: (m, fn) => `function ${fn}(){return!0}`,
    sentinel: 'process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}',
  },
  {
    // Redirect CLI `claude update` to clawgod self-update. Upstream's
    // detectInstallType() returns "unknown" under our launcher; the
    // unknown-fallback either silently downgrades ~/.bun/bin/bun (macOS) or
    // writes the new binary outside our drift-detection scan path (Windows).
    // Our redirect funnels the upgrade through install.{sh,ps1} so the new
    // version is re-extracted, re-patched, and re-launchered without ever
    // touching the bun runtime. Escape hatch for users who want vanilla
    // update is printed every run.
    name: "Redirect `claude update` to clawgod self-update",
    pattern: /(\.command\("update"\)\.alias\("upgrade"\)\.description\("[^"]+"\))(\.action\(async\(\)=>\{)/g,
    replacer: (m, chain, action) => {
      return (
        chain + '.allowUnknownOption()' + action +
        `const __clawgodUpdateIndex=process.argv.findIndex(a=>a==="update"||a==="upgrade");` +
        `const __clawgodUpdateArgs=__clawgodUpdateIndex>=0?process.argv.slice(__clawgodUpdateIndex+1):[];` +
        `const __clawgodVersionIndex=__clawgodUpdateArgs.indexOf("--version");` +
        `if(__clawgodVersionIndex>=0&&__clawgodUpdateArgs[__clawgodVersionIndex+1])process.env.CLAWGOD_VERSION=__clawgodUpdateArgs[__clawgodVersionIndex+1];` +
        `if(__clawgodUpdateArgs.includes("--no-upgrade"))process.env.CLAWGOD_NO_UPGRADE="1";` +
        `if(__clawgodUpdateArgs.includes("--lean-off"))process.env.CLAWGOD_LEAN_OFF="1";` +
        `if(__clawgodUpdateArgs.includes("--lean-on"))process.env.CLAWGOD_LEAN_ON="1";` +
        `if(__clawgodUpdateArgs.includes("--lean-max"))process.env.CLAWGOD_LEAN_MAX="1";` +
        `process.stderr.write("[clawgod] 'claude update' is handled by clawgod self-update.\\n[clawgod] To leave clawgod and use vanilla update: bash ~/.clawgod/install.sh --uninstall\\n[clawgod] Continuing now\\u2026\\n");` +
        `const _w=process.platform==='win32';` +
        `const __clawgodUpdateStatus=(()=>{const __fs=require('fs'),__path=require('path'),__os=require('os'),__cp=require('child_process');const __root=__path.join(__os.homedir(),'.clawgod'),__fetch=__path.join(__root,'fetch-file.mjs'),__bun=process.env.CLAWGOD_BUN_BIN||process.execPath;let __temporary='';try{let __installer=__path.join(__root,_w?'install.ps1':'install.sh');if(!__fs.existsSync(__installer)){if(!__fs.existsSync(__fetch))throw new Error('managed fetch-file.mjs is missing; reinstall ClawGod Plus');__temporary=__fs.mkdtempSync(__path.join(__os.tmpdir(),'clawgod-update-'));if(!_w)__fs.chmodSync(__temporary,0o700);__installer=__path.join(__temporary,_w?'install.ps1':'install.sh');const __url='https://github.com/A6083450/clawgod-plus/releases/latest/download/'+(_w?'install.ps1':'install.sh');const __download=__cp.spawnSync(__bun,[__fetch,__url,__installer],{stdio:'inherit',env:process.env});if(__download.error)throw __download.error;if(__download.status===null)throw new Error('managed installer download did not return an exit status');if(__download.status!==0)return __download.status;}else process.stderr.write('[clawgod] using local installer (remote skipped): '+__installer+'\\n');const __command=_w?['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File',__installer]:['bash',__installer];const __result=__cp.spawnSync(__command[0],__command.slice(1),{stdio:'inherit',env:process.env});if(__result.error)throw __result.error;if(__result.status===null)throw new Error('installer process did not return an exit status');return __result.status;}catch(__error){process.stderr.write('[clawgod] update failed: '+(__error&&__error.message?__error.message:String(__error))+'\\n');return 1;}finally{if(__temporary)__fs.rmSync(__temporary,{recursive:true,force:true});}})();` +
        `process.exit(__clawgodUpdateStatus);`
      );
    },
    sentinel: '.command("update").alias("upgrade")',
    appliedMarker: "[clawgod] 'claude update' is handled by clawgod self-update.",
  },
  {
    name: 'Hex brand color → green',
    pattern: /#da7756/g,
    replacer: () => '#22c55e',
    sentinel: '#da7756',
  },
  {
    name: 'Theme claude color → green (ANSI)',
    pattern: /claude:"ansi:redBright"/g,
    replacer: () => 'claude:"ansi:greenBright"',
  },
  {
    name: 'Shimmer → green (ANSI)',
    pattern: /claudeShimmer:"ansi:yellowBright"/g,
    replacer: () => 'claudeShimmer:"ansi:greenBright"',
  },
  {
    name: 'Brief label claude color → green (RGB dark)',
    pattern: /briefLabelClaude:"rgb\(215,119,87\)"/g,
    replacer: () => 'briefLabelClaude:"rgb(34,197,94)"',
  },
  {
    name: 'Brief label claude color → green (RGB light)',
    pattern: /briefLabelClaude:"rgb\(255,153,51\)"/g,
    replacer: () => 'briefLabelClaude:"rgb(22,163,74)"',
  },
  {
    name: 'Brief label claude color → green (ANSI)',
    pattern: /briefLabelClaude:"ansi:redBright"/g,
    replacer: () => 'briefLabelClaude:"ansi:greenBright"',
  },
  {
    name: 'macOS Cmd+V image paste fallback to clipboard read',
    pattern: /\}else if\(([\w$]+)&&([\w$]+)\)([\w$]+)\(\);else ([\w$]+)\("input_image_drag","read_failed"\),([\w$]+)\(([\w$]+)\),([\w$]+)\(\)/g,
    replacer: (m, N, d, mFn, We, g, x, y) =>
      `}else if(${d})${mFn}();else ${We}("input_image_drag","read_failed"),${g}(${x}),${y}()`,
    sentinel: '"input_image_drag","read_failed"',
    optional: true,
  },
  {
    // Current bundles restructured the paste handler: the clipboard-read
    // fallback above is now unconditional upstream, but the image processor
    // loader only tries the vendored native image-processor.node behind the
    // standalone-executable predicate:
    //
    //   async function N8e(){
    //     if(tco)return tco.default;
    //     if(WE())try{let r=await Promise.resolve().then(() => (Blo(),Flo)),n=r.sharp||r.default;return tco={default:n},n}
    //     catch{console.warn("Native image processor not available, falling back to sharp")}
    //     let e=await Promise.resolve().then(() => R(vAu(),1)),t=gGg(e);  // import("sharp")
    //     ...
    //
    // ClawGod Plus runs under Bun, whose standalone predicate may not reflect the
    // extracted module layout, so the native branch can be skipped and the npm
    // "sharp" fallback throws
    // (nothing is installed under ~/.clawgod) → the paste image read throws →
    // the paste handler's .catch types the raw temp PNG path as text instead
    // of attaching [Image #N]. Terminals like Ghostty always paste clipboard
    // images as temp file paths, so this breaks Cmd+V image paste entirely.
    //
    // The native branch (vendor/image-processor/<arch>-<platform>/*.node,
    // resolved relative to cli.cjs) works fine under clawgod — the installer
    // vendors it. Drop the gate so the native loader is always tried first;
    // the catch still falls back to the npm sharp import on failure.
    //
    // appliedMarker (not sentinel): the warn string intentionally survives in
    // the patched output, so it cannot distinguish "stale regex" from
    // "already patched".
    name: 'Image paste: try native image processor regardless of standalone gate',
    pattern: /if\(([\w$]+)\(\)\)(try\{let [\w$]+=await Promise\.resolve\(\)\.then\(\(\)\s*=>\s*\([\w$]+\(\),[\w$]+\)\),[\w$]+=[\w$]+\.sharp\|\|[\w$]+\.default;return [\w$]+=\{default:[\w$]+\},[\w$]+\}catch\{console\.warn\("Native image processor not available, falling back to sharp"\)\})/g,
    replacer: (m, gate, body) => body,
    appliedMarker: /return [\w$]+\.default;try\{let [\w$]+=await Promise\.resolve\(\)\.then\(\(\)\s*=>\s*\([\w$]+\(\),[\w$]+\)\)/,
  },
  {
    // macOS clipboard managers can paste copied images as escaped TIFF paths.
    // The native file decoder does not support TIFF, but classifying these as
    // image paths makes the existing macOS failure branch read the clipboard
    // directly, where readClipboardImage converts the image to PNG.
    name: 'Image paste: recognize TIFF paths for macOS clipboard fallback',
    pattern: /([\w$]+)=\/\\\.\(png\|jpe\?g\|gif\|webp\)\$\/i(?=;[\w$]+=\/\^\(\?:\[A-Za-z\]:\\\\\|\\\\\\\\\)\/)/g,
    replacer: (m, imagePathRe) => `${imagePathRe}=/\\.(png|jpe?g|gif|webp|tiff?)$/i`,
    sentinel: '/\\.(png|jpe?g|gif|webp)$/i;',
    appliedMarker: '/\\.(png|jpe?g|gif|webp|tiff?)$/i;',
    unique: true,
  },
  {
    // URLs ending in an image extension are text, not local image paths.
    name: 'Image paste: keep HTTP image URLs as text',
    pattern: /function ([\w$]+)\(([\w$]+)\)\{let ([\w$]+)=([\w$]+)\(\2\.trim\(\)\),([\w$]+)=([\w$]+)\(\3\);return ([\w$]+)\.test\(\5\)\}/g,
    replacer: (m, fn, value, quoted, unquote, path, unescape, imagePathRe) =>
      `function ${fn}(${value}){let ${quoted}=${unquote}(${value}.trim()),${path}=${unescape}(${quoted});return!/^https?:\\/\\//i.test(${path})&&${imagePathRe}.test(${path})}`,
    appliedMarker: '/^https?:\\/\\//i.test(',
    unique: true,
  },
  {
    name: 'Restore Glob/Grep tools (un-inline EMBEDDED_SEARCH_TOOLS)',
    pattern: /function ([\w$]+)\(\)\{if\(!([\w$]+)\("true"\)\)return!1;if\([\w$]+\(\)\)return!1;return process\.env\.CLAUDE_CODE_ENTRYPOINT!=="local-agent"\}/g,
    replacer: (m, fn, envCheck) =>
      `function ${fn}(){if(!${envCheck}(process.env.EMBEDDED_SEARCH_TOOLS))return!1;if(typeof globalThis.__dpBinOk>"u"){try{var _w=process.platform==="win32"?"where":"which";require("child_process").execFileSync(_w,["bfs"],{timeout:2e3});require("child_process").execFileSync(_w,["ugrep"],{timeout:2e3});globalThis.__dpBinOk=!0}catch{globalThis.__dpBinOk=!1}}if(!globalThis.__dpBinOk)return!1;return process.env.CLAUDE_CODE_ENTRYPOINT!=="local-agent"}`,
    sentinel: 'ct("true")',
    optional: true,
  },
  {
    name: 'Neutralize geo-steganography in date string (qla)',
    pattern: /function ([\w$]+)\([\w$]+\)\{let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\([\w$]+\?\.[\w$]+\?\?!1,[\w$]+\?\.[\w$]+\?\?!1\),[\w$]+=[\w$]+\?\.[\w$]+\?[\w$]+\.replaceAll\("-","\/"\):[\w$]+;return`Today\$\{[\w$]+\}s date is \$\{[\w$]+\}\.`\}/g,
    replacer: (m) => {
      const fnMatch = m.match(/^function ([\w$]+)\(([\w$]+)\)/);
      if (!fnMatch) return m;
      const [, fn, param] = fnMatch;
      return `function ${fn}(${param}){return\`Today's date is \${${param}}.\`}`;
    },
    sentinel: 'replaceAll("-","/")',
  },
  {
    name: 'Neutralize geo-detection probe (rdp)',
    pattern: /function ([\w$]+)\(\)\{if\([\w$]+\(\)\)return null;let [\w$]+=[\w$]+\(\),[\w$]+=[\w$]+\(\),[\w$]+=[\w$]+==="Asia\/Shanghai"\|\|[\w$]+==="Asia\/Urumqi"[\s\S]*?\}\}/g,
    replacer: (m) => {
      const fn = m.match(/^function ([\w$]+)/)[1];
      return `function ${fn}(){return null}`;
    },
    sentinel: 'Asia/Shanghai',
  },
  {
    name: 'Neutralize apostrophe steganography (odp)',
    pattern: new RegExp(
      'function ([\\w$]+)\\(([\\w$]+),([\\w$]+)\\)\\{' +
      'if\\(!\\2&&!\\3\\)return"\'";' +
      'if\\(\\2&&!\\3\\)return"(?:\\\\u2019|\\u2019)";' +
      'if\\(!\\2&&\\3\\)return"(?:\\\\u02[Bb][Cc]|\\u02BC)";' +
      'return"(?:\\\\u02[Bb]9|\\u02B9)"\\}',
      'g'
    ),
    replacer: (m) => {
      const fn = m.match(/^function ([\w$]+)/)[1];
      return `function ${fn}(e,t){return"'"}`;
    },
    optional: true,
  },
  {
    name: 'Remove CYBER_RISK_INSTRUCTION',
    pattern: /([\w$]+)="IMPORTANT: Assist with authorized security testing[^"]*"/g,
    replacer: (m, varName) => `${varName}=""`,
    sentinel: 'Assist with authorized security testing',
  },
  {
    name: 'Remove URL generation restriction',
    pattern: /\n\$\{[\w$]+\}\nIMPORTANT: You must NEVER generate or guess URLs[^.]*\. You may use URLs provided by the user in their messages or local files\./g,
    replacer: () => '',
    sentinel: 'IMPORTANT: You must NEVER generate or guess URLs',
  },
  {
    name: 'Remove cautious actions section',
    // v2.1.88-~v2.1.122: function GSY(){return`# Executing actions...`}
    // v2.1.123+: function _j3(H){if(LE8(H)==="compact")return`# Executing...short`;return`# Executing...long`}
    pattern: /function ([\w$]+)\(([\w$]*)\)\{(?:if\([\s\S]{1,200}?\)return`# Executing actions with care\n\n[\s\S]*?`;)?return`# Executing actions with care\n\n[\s\S]*?`\}/g,
    replacer: (m, fn, arg) => `function ${fn}(${arg}){return\`\`}`,
    sentinel: '# Executing actions with care',
  },
  {
    name: 'Remove "Not logged in" notice',
    pattern: /Not logged in\. Run [\w ]+ to authenticate\./g,
    replacer: () => '',
    optional: true,
  },
  {
    name: 'Attachment filter bypass',
    pattern: /([\w$]+)\(\)!=="ant"(&&[\w$]+\.has\([\w$]+\.attachment\.type\)|\)\{if\([\w$]+\.attachment\.type==="hook_additional_context")/g,
    replacer: (m) => m.replace(/([\w$]+)\(\)!=="ant"/, 'false'),
    optional: true,
  },
  {
    name: 'Message list filter bypass (legacy ternary)',
    pattern: /([\w$]+)\(\)!=="ant"\?([\w$]+)\(([\w$]+),([\w$]+)\(([\w$]+)\)\):([\w$]+)/g,
    replacer: (m, fn, tRY, underscore, sRY, K, fallback) => fallback,
    optional: true,
  },
  {
    name: 'Message list filter bypass (s_8 form)',
    pattern: /if\(([\w$]+)\(\)==="ant"\)return ([\w$]+);let ([\w$]+)=([\w$]+) instanceof Set\?\4:([\w$]+)\(\4\);return ([\w$]+)\(\2,\3\)/g,
    replacer: (m, fn, ret) => `return ${ret}`,
    optional: true,
  },
  {
    // Shell-integration generator (iT6 in v2.1.140, was Wa1 in older versions)
    // emits a zsh/bash function that calls the native claude binary with
    // ARGV0=ugrep|rg|... for multitool dispatch. After clawgod installs, the
    // baked path points at our shell-script launcher (or .cmd on Windows) —
    // but shell scripts CANNOT preserve argv[0] (kernel shebang re-exec
    // overwrites it, and zsh additionally refuses to export ARGV0 as env).
    // The shell function then fails because bun receives e.g. -G and errors
    // with "Invalid Argument".
    //
    // Fix: redirect the baked path to claude.orig[.exe] (the native binary
    // backup clawgod creates at install time). Then the multitool dispatch
    // reaches a real binary that honors argv[0]. See issue #82.
    //
    // Generator shape across versions:
    //   v2.1.88 (Wa1):  let Y=E4([_]),...  ← _ is the claude binary path, no in-function compute
    //   v2.1.140 (iT6): let ...,z=FJ$.join(Le(),A?"claude.exe":"claude"),Y=A?rL(z):z,...
    //                   ← path computed inside via join(versionsDir, "claude[.exe]")
    // Anchor on the join(...) ternary form unique to the generator — the
    // bare "claude.exe":"claude" string also appears in u18() (basename
    // helper) but never inside a path.join(), so this regex hits exactly the
    // shell-integration generator and nothing else.
    name: 'Shell integration → claude.orig (multitool dispatch fix)',
    pattern: /([\w$]+\.join\([\w$]+\(\),[\w$]+\?)"claude\.exe":"claude"(\))/g,
    replacer: (m, prefix, suffix) => `${prefix}"claude.orig.exe":"claude.orig"${suffix}`,
    sentinel: '?"claude.exe":"claude")',
    optional: true,
  },
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verify = args.includes('--verify');
const revert = args.includes('--revert');

if (revert) {
  if (!existsSync(BACKUP)) { console.error('No backup found'); process.exit(1); }
  copyFileSync(BACKUP, TARGET);
  console.log('Reverted from backup');
  process.exit(0);
}

if (!existsSync(TARGET)) {
  console.error('Target not found:', TARGET);
  process.exit(1);
}

let code = readFileSync(TARGET, 'utf8');
const origSize = code.length;
const verMatch = code.match(/Version:\s*([\d.]+)/);
const version = verMatch ? verMatch[1] : 'unknown';

console.log(`\n${'='.repeat(55)}`);
console.log(`  ClawGod Plus (universal)`);
console.log(`  Target: cli.original.cjs (v${version})`);
console.log(`  Mode: ${dryRun ? 'DRY RUN' : verify ? 'VERIFY' : 'APPLY'}`);
console.log(`${'='.repeat(55)}\n`);

let applied = 0, skipped = 0, failed = 0;

for (const p of patches) {
  const matches = [...code.matchAll(p.pattern)];
  let relevant = matches;
  if (p.validate) relevant = matches.filter(m => p.validate(m[0], code));
  if (p.selectIndex !== undefined) relevant = relevant.length > p.selectIndex ? [relevant[p.selectIndex]] : [];
  if (p.unique && relevant.length > 1) {
    console.log(`  ?? ${p.name} — ${relevant.length} matches (need 1)`);
    failed++; continue;
  }
  if (relevant.length === 0) {
    if (p.knownShape?.test(code)) { console.log(`  XX ${p.name} — known resolver shape did not match exactly`); failed++; continue; }
    if (p.appliedMarker !== undefined && (p.appliedMarker instanceof RegExp ? p.appliedMarker.test(code) : code.includes(p.appliedMarker))) { console.log(`  OK ${p.name} (already applied, marker present)`); applied++; continue; }
    if (p.optional) { console.log(`  >> ${p.name} (not in this version)`); skipped++; continue; }
    if (p.sentinel !== undefined) {
      const sentinels = Array.isArray(p.sentinel) ? p.sentinel : [p.sentinel];
      const stillPresent = sentinels.filter((s) => code.includes(s));
      if (stillPresent.length > 0) {
        console.log(`  XX ${p.name} — regex stale, sentinel still present: ${stillPresent.map((s) => JSON.stringify(s)).join(', ')}`);
        failed++; continue;
      }
      console.log(`  OK ${p.name} (already applied, sentinel absent)`); applied++; continue;
    }
    console.log(`  !! ${p.name} (0 matches, no sentinel)`); skipped++;
    continue;
  }
  if (verify) { console.log(`  -- ${p.name} — not yet applied`); skipped++; continue; }
  let count = 0;
  for (const m of relevant) {
    const replacement = p.replacer(m[0], ...m.slice(1));
    // Function-form replace: a string replacement would interpret $$ as $
    // and break minified identifiers like `a$$`. See install.sh issue #86.
    if (replacement !== m[0]) { if (!dryRun) code = code.replace(m[0], () => replacement); count++; }
  }
  if (count > 0) { console.log(`  OK ${p.name} (${count})`); applied++; }
  else { console.log(`  >> ${p.name} (no change)`); skipped++; }
}

const contextLimitPatch = await applyContextLimitPatch(code, { dryRun, verify });
if (contextLimitPatch.status === 'applied') {
  if (!dryRun) code = contextLimitPatch.code;
  console.log(`  OK Context limit configurable (${contextLimitPatch.count})`);
  applied++;
} else if (contextLimitPatch.status === 'verify') {
  console.log(`  -- Context limit configurable — ${contextLimitPatch.count} match(es), not yet applied`);
  skipped++;
} else if (contextLimitPatch.status === 'already') {
  console.log(`  OK Context limit configurable (${contextLimitPatch.detail})`);
  applied++;
} else if (contextLimitPatch.status === 'skipped') {
  console.log(`  >> Context limit configurable (${contextLimitPatch.detail})`);
  skipped++;
} else {
  console.log(`  XX Context limit configurable — ${contextLimitPatch.detail}`);
  failed++;
}

const chromePatch = await applyClaudeChromeSocketPatch(code, { dryRun, verify });
if (chromePatch.status === 'applied') {
  if (!dryRun) code = chromePatch.code;
  console.log(`  OK Claude in Chrome local socket fallback (${chromePatch.count})`);
  applied++;
} else if (chromePatch.status === 'verify') {
  console.log(`  -- Claude in Chrome local socket fallback — ${chromePatch.count} match(es), not yet applied`);
  skipped++;
} else if (chromePatch.status === 'already') {
  console.log(`  OK Claude in Chrome local socket fallback (${chromePatch.detail})`);
  applied++;
} else if (chromePatch.status === 'skipped') {
  console.log(`  >> Claude in Chrome local socket fallback (${chromePatch.detail})`);
  skipped++;
} else {
  console.log(`  XX Claude in Chrome local socket fallback — ${chromePatch.detail}`);
  failed++;
}

console.log(`\n${'-'.repeat(55)}`);
console.log(`  Result: ${applied} applied, ${skipped} skipped, ${failed} failed`);

if (failed === 0 && !dryRun && !verify && applied > 0) {
  if (!existsSync(BACKUP)) { copyFileSync(TARGET, BACKUP); console.log(`  Backup: ${BACKUP}`); }
  writeFileSync(TARGET, code, 'utf8');
  console.log(`  Written: cli.original.cjs (${code.length - origSize} bytes)`);
}
console.log(`${'='.repeat(55)}\n`);
if (failed > 0) process.exit(1);
'@

Set-Content (Join-Path $ClawDir "patch.mjs") $patcherCode -Encoding UTF8
Write-OK "Patcher created (patch.mjs)"

# ─── Apply patches ────────────────────────────────────

Write-Dim "Applying patches ..."
$patchOutput = & $BunBin (Join-Path $ClawDir "patch.mjs") 2>&1
$patchStatus = $LASTEXITCODE
$patchOutput | ForEach-Object { Write-Host "  $_" }
if ($patchStatus -ne 0) {
    Write-Err "Mandatory patching failed; installation stopped before launcher replacement."
    exit $patchStatus
}
Invoke-ChromePostInstallFix

# ─── Create default configs ───────────────────────────

$featuresFile = Join-Path $ClawDir "features.json"
if (-not (Test-Path $featuresFile)) {
    $featuresJson = @'
{
  "tengu_harbor": true,
  "tengu_session_memory": true,
  "tengu_amber_flint": true,
  "tengu_auto_background_agents": true,
  "tengu_destructive_command_warning": true,
  "tengu_immediate_model_command": true,
  "tengu_desktop_upsell": false,
  "tengu_malort_pedway": {"enabled": true},
  "tengu_amber_quartz_disabled": false,
  "tengu_prompt_cache_1h_config": {"allowlist": ["*"]},
  "tengu_amber_redwood3": "enabled"
}
'@
    [System.IO.File]::WriteAllText($featuresFile, $featuresJson, (New-Object System.Text.UTF8Encoding $false))
    Write-OK "Default features.json created"
}

# ─── Lean mode: optimize ~/.claude/settings.json ─────
$leanOffFlag = Join-Path $ClawDir ".lean-disabled"
$leanMaxFlag = Join-Path $ClawDir ".lean-max"
$claudeSettingsDir = Join-Path $env:USERPROFILE ".claude"
$claudeSettings = Join-Path $claudeSettingsDir "settings.json"
New-Item -ItemType Directory -Force -Path $claudeSettingsDir | Out-Null

# Default to lean-off: if no lean flag files exist and user didn't explicitly
# request lean-on or lean-max, create the .lean-disabled flag so lean stays off.
if (-not (Test-Path $leanOffFlag) -and -not (Test-Path $leanMaxFlag) -and -not $LeanOn -and -not $LeanMax) {
    New-Item -ItemType File -Force -Path $leanOffFlag | Out-Null
}

if ($LeanOff) {
    New-Item -ItemType File -Force -Path $leanOffFlag | Out-Null
    if (Test-Path $leanMaxFlag) { Remove-Item $leanMaxFlag -Force }
    $leanRemoveScript = @'
const fs=require("fs"),p=process.argv[1];
const allDeny=new Set(["DesignSync","NotebookEdit","PushNotification","RemoteTrigger","CronCreate","CronDelete","CronList","EnterPlanMode","ExitPlanMode","SendMessage","ScheduleWakeup","AskUserQuestion","ReportFindings"]);
const allFlags=["disableWorkflows","disableRemoteControl","disableClaudeAiConnectors","disableArtifact","disableBundledSkills"];
let s={};try{s=JSON.parse(fs.readFileSync(p,"utf8"))}catch{process.exit(0)}
for(const k of allFlags)delete s[k];
if(Array.isArray(s.permissions?.deny))s.permissions.deny=s.permissions.deny.filter(t=>!allDeny.has(t));
fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n");
'@
    if (Test-Path $claudeSettings) {
        try { & $BunBin -e $leanRemoveScript "$claudeSettings" 2>$null } catch {}
    }
    Write-OK "Lean mode disabled (all tools restored)"
} elseif ($LeanOn) {
    if (Test-Path $leanOffFlag) { Remove-Item $leanOffFlag -Force }
    if (Test-Path $leanMaxFlag) { Remove-Item $leanMaxFlag -Force }
} elseif ($LeanMax) {
    if (Test-Path $leanOffFlag) { Remove-Item $leanOffFlag -Force }
    New-Item -ItemType File -Force -Path $leanMaxFlag | Out-Null
}

if (-not (Test-Path $leanOffFlag)) {
    $leanIsMax = (Test-Path $leanMaxFlag)
    $leanApplyScript = @'
const fs = require("fs");
const settingsPath = process.argv[1];
const isMax = process.argv[2] === "true";
const baseDeny = ["DesignSync","NotebookEdit","PushNotification","RemoteTrigger","CronCreate","CronDelete","CronList"];
const maxDeny = ["EnterPlanMode","ExitPlanMode","SendMessage","ScheduleWakeup","AskUserQuestion","ReportFindings"];
const baseFlags = ["disableWorkflows","disableRemoteControl","disableClaudeAiConnectors","disableArtifact"];
const maxFlags = ["disableBundledSkills"];
const deny = isMax ? [...baseDeny, ...maxDeny] : baseDeny;
const flags = isMax ? [...baseFlags, ...maxFlags] : baseFlags;
let s = {};
try { s = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch {}
let changed = false;
for (const k of flags) { if (!(k in s)) { s[k] = true; changed = true; } }
if (!s.permissions) s.permissions = {};
if (!Array.isArray(s.permissions.deny)) s.permissions.deny = [];
const ex = new Set(s.permissions.deny);
for (const t of deny) { if (!ex.has(t)) { s.permissions.deny.push(t); changed = true; } }
if (changed) fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + "\n");
'@
    try {
        & $BunBin -e $leanApplyScript "$claudeSettings" "$leanIsMax" 2>$null
        if ($leanIsMax) { Write-OK "Lean settings applied: max (~/.claude/settings.json)" }
        else { Write-OK "Lean settings applied: on (~/.claude/settings.json)" }
    } catch {}
} else {
    Write-Host "  $([char]0x2022) Lean mode disabled (claude --lean-on to re-enable)" -ForegroundColor DarkGray
}

# ─── Sanity check: ensure user's Bun can actually load cli.original.cjs ──
# Anthropic builds the native binary with a bleeding-edge Bun build (e.g.
# 1.3.14 while stable still ships 1.3.13). Older Bun crashes loading the
# extracted cli.original.cjs with "Expected CommonJS module to have a
# function wrapper". Detect this BEFORE we install the launcher — better
# to fail loudly than to leave the user with a launcher that panics on
# first invocation.

Write-Dim "Verifying Bun can load patched cli.original.cjs ..."
$sanityCli = Join-Path $ClawDir "cli.cjs"
# PowerShell folds native-command stderr into the error stream as
# ErrorRecord objects; with $ErrorActionPreference='Stop' (common when
# this script is piped through `iex`) that terminates BEFORE we even
# read $sanityOut. Localize ErrorActionPreference + try/catch so the
# panic message reliably lands in $sanityOut and our friendly Write-Err
# block runs. Defense-in-depth — pre-flight already blocks Bun < $MinBunVersion;
# this remains for the day Anthropic bumps embedded Bun past our constant.
$sanityOut = $null
$sanityStatus = 1
try {
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $sanityOut = (& $BunBin $sanityCli --version 2>&1 | Out-String)
    $sanityStatus = $LASTEXITCODE
} catch {
    $sanityOut = "$_"
    $sanityStatus = 1
} finally {
    $ErrorActionPreference = $prevEAP
}
if ($sanityOut -match "Expected CommonJS module to have a function wrapper") {
    Write-Host ""
    Write-Err "Bun $(& $BunBin --version) cannot load Anthropic's cli.original.cjs."
    Write-Err ""
    Write-Err "  Anthropic builds with Bun's canary channel (currently ~1.3.14), while"
    Write-Err "  bun.sh's main download is on stable (currently 1.3.13). The canary build"
    Write-Err "  is NOT visible on bun.sh's download page — it lives on GitHub Releases"
    Write-Err "  and is reachable only via 'bun upgrade --canary'."
    Write-Err ""
    Write-Err "  If your bun is from bun.sh:"
    Write-Err "    bun upgrade --canary"
    Write-Err "    or: powershell -c ""iex & {`$(irm https://bun.sh/install.ps1)} -Version canary"""
    Write-Err ""
    Write-Err "  If your bun is from scoop (the binary is behind a shim and refuses to"
    Write-Err "  self-replace, so 'bun upgrade' silently hangs):"
    Write-Err "    scoop uninstall bun"
    Write-Err "    irm https://bun.sh/install.ps1 | iex"
    Write-Err "    bun upgrade --canary"
    Write-Err ""
    Write-Err "  Then re-run .\install.ps1 — this sanity check will pass."
    if ($sanityStatus -eq 0) { $sanityStatus = 1 }
    exit $sanityStatus
}
if ($sanityStatus -ne 0) {
    if ($sanityOut) { Write-Host $sanityOut.TrimEnd() }
    Write-Err "Bun failed to load patched cli.original.cjs (exit $sanityStatus)."
    exit $sanityStatus
}
Write-OK "Bun loads cli.original.cjs"

# ─── Replace claude command ───────────────────────────

# Build launcher content using %USERPROFILE% env var where possible to avoid
# encoding issues when the profile path contains non-ASCII characters (e.g.
# Chinese/Korean/Japanese usernames). cmd.exe resolves %USERPROFILE% at
# runtime so no problematic characters need to be baked into the .cmd file.
$cliPathInCmd = "%USERPROFILE%\.clawgod\cli.cjs"
$normalizedUserProfile = $env:USERPROFILE.TrimEnd('\', '/')
$normalizedBunBin = $BunBin.TrimEnd('\', '/')
$userProfilePrefix = "$normalizedUserProfile\"
if ($normalizedBunBin.Equals($normalizedUserProfile, [StringComparison]::OrdinalIgnoreCase) -or
    $normalizedBunBin.StartsWith($userProfilePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    $bunRelative = $normalizedBunBin.Substring($normalizedUserProfile.Length).TrimStart('\', '/')
    $bunPathInCmd = "%USERPROFILE%\$bunRelative"
} else {
    # Bun outside USERPROFILE (e.g. system-wide install) — fall back to
    # absolute path since %USERPROFILE%-relative expansion doesn't apply.
    $bunPathInCmd = $BunBin
}
# Download clawgod-import binary
$importBin = Join-Path $ClawDir "clawgod-import.exe"
if (-not (Test-Path $importBin)) {
    $importUrl = "https://github.com/0Chencc/clawgod/releases/latest/download/clawgod-import-windows-x64.exe"
    try {
        & $BunBin (Join-Path $ClawDir "fetch-file.mjs") $importUrl $importBin 2>$null
        if ($LASTEXITCODE -ne 0) { throw "fetch-file.mjs exited $LASTEXITCODE" }
        Write-OK "Provider import tool installed (clawgod-import.exe)"
    } catch {
        Write-Dim "Provider import tool not yet available (build pending)"
    }
}

$importPathInCmd = "%USERPROFILE%\.clawgod\clawgod-import.exe"
$launcherContent = @"
@echo off
rem CLAWGOD_LAUNCHER_V1
setlocal
if /I "%~1"=="import" (
  if exist "$importPathInCmd" (
    shift
    "$importPathInCmd" %1 %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
  ) else (
    echo clawgod: import tool not installed. Reinstall clawgod to get it.
    exit /b 127
  )
)
if not exist "$cliPathInCmd" (
  echo clawgod: cli.cjs not found. Reinstall: irm https://github.com/A6083450/clawgod-plus/releases/latest/download/install.ps1 ^| iex
  exit /b 127
)
if not exist "$bunPathInCmd" (
  echo clawgod: bun not found at $bunPathInCmd. Install: https://bun.sh/install
  exit /b 127
)
set "CLAUDE_CODE_EXECPATH=%~dp0claude.orig.exe"
set "CLAWGOD_AUTO_CHROME=1"
if "%CLAWGOD_NO_AUTO_CHROME%"=="1" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--chrome" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="-p" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--print" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--permission-mode" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--input-format" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (%*) do if /I "%%~A"=="--output-format" set "CLAWGOD_AUTO_CHROME=0"
for %%A in (-h --help -v --version version update upgrade auth login logout config mcp daemon logs attach stop kill respawn rm doctor install uninstall completion migrate-installer setup-token) do if /I "%~1"=="%%~A" set "CLAWGOD_AUTO_CHROME=0"
if "%CLAWGOD_AUTO_CHROME%"=="1" (
  "$bunPathInCmd" "$cliPathInCmd" --chrome %*
) else (
  "$bunPathInCmd" "$cliPathInCmd" %*
)
exit /b %ERRORLEVEL%
"@

# Find and back up original claude
$claudeCmd = Join-Path $BinDir "claude.cmd"
$claudeExe = Join-Path $BinDir "claude.exe"
$claudeOrigCmd = Join-Path $BinDir "claude.orig.cmd"
$claudeOrigExe = Join-Path $BinDir "claude.orig.exe"

# Validate both launcher slots before any backup, removal, or replacement.
if ((Test-ClaudeLauncherConflict -Current $claudeCmd -Original $claudeOrigCmd) -or
    (Test-ClaudeLauncherConflict -Current $claudeExe -Original $claudeOrigExe)) {
    exit 1
}
foreach ($original in @($claudeOrigCmd, $claudeOrigExe)) {
    if (Test-ClawGodLauncherContent $original) {
        Remove-Item -LiteralPath $original -Force
        Write-Warn "Removed installer-owned polluted backup ($original)"
    }
}

# Check multiple locations for original claude
foreach ($loc in @(
    (Join-Path $BinDir "claude.exe"),
    (Join-Path $BinDir "claude.cmd"),
    (Join-Path $env:USERPROFILE ".local\share\claude\versions"),
    (Join-Path $env:LOCALAPPDATA "Programs\claude-code")
)) {
    if (-not (Test-Path $loc)) { continue }
    if ((Test-Path $loc -PathType Leaf) -and (Test-ClawGodLauncher $loc)) { continue }
    # Back up .exe if exists and not already backed up
    if ($loc -like "*.exe" -and -not (Test-ClaudePathPresent $claudeOrigExe)) {
        Copy-Item $loc $claudeOrigExe -Force
        Write-OK "Original claude.exe backed up → claude.orig.exe"
    }
    # Back up .cmd if exists and not already backed up
    if ($loc -like "*.cmd" -and -not (Test-ClaudePathPresent $claudeOrigCmd)) {
        Copy-Item $loc $claudeOrigCmd -Force
        Write-OK "Original claude.cmd backed up → claude.orig.cmd"
    }
    # If it's a versions directory, find the latest exe
    if (Test-Path $loc -PathType Container) {
        $latestExe = Get-ChildItem $loc -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latestExe -and -not (Test-ClaudePathPresent $claudeOrigExe)) {
            Copy-Item $latestExe.FullName $claudeOrigExe -Force
            Write-OK "Original claude backed up → claude.orig.exe ($($latestExe.Name))"
        }
    }
}

# Remove claude.exe so .cmd takes precedence
# The exact current executable is removed only after it has a valid backup.
if (Test-ClaudePathPresent $claudeExe) {
    if (Test-ClawGodLauncher $claudeExe) {
        Remove-Item -LiteralPath $claudeExe -Force
        Write-OK "Removed owned claude.exe launcher (.cmd now takes priority)"
    } elseif (-not (Test-ClaudePathPresent $claudeOrigExe)) {
        Rename-Item $claudeExe $claudeOrigExe -Force
        Write-OK "Renamed claude.exe → claude.orig.exe"
    } else {
        # Conflict preflight plus backup search proved this exact current path is preserved.
        try {
            Remove-Item -LiteralPath $claudeExe -Force
        } catch {
            Write-Err "Could not remove owned launcher $claudeExe`: $($_.Exception.Message)"
            exit 1
        }
        Write-OK "Removed claude.exe (.cmd now takes priority)"
    }
}


# Write .cmd launcher for both 'claude' and the explicit 'clawgod' alias.
# Why both:
#  - claude.cmd may be shadowed by a claude.exe higher in PATH
#  - clawgod.cmd has no .exe competitor, so it always works
#  - User can invoke patched explicitly via `clawgod` regardless of which
#    binary 'claude' resolves to
foreach ($cmd in @("claude", "clawgod")) {
    $launcherContent | Set-Content (Join-Path $BinDir "$cmd.cmd") -Encoding Default
}
Write-OK "Commands 'claude' + 'clawgod' → patched"

# --- Ensure optional Claude plugins ---------------------------------

$hadPluginBun = Test-Path Env:CLAWGOD_BUN_BIN
$previousPluginBun = $env:CLAWGOD_BUN_BIN
$hadPluginDir = Test-Path Env:CLAWGOD_DIR
$previousPluginDir = $env:CLAWGOD_DIR
try {
    $env:CLAWGOD_BUN_BIN = $BunBin
    $env:CLAWGOD_DIR = $ClawDir
    & $BunBin (Join-Path $ClawDir "plugin-dependencies.mjs") ensure
    if ($LASTEXITCODE -ne 0) { throw "optional plugin ensure exited $LASTEXITCODE" }
} catch {
    Write-Warn "Optional Claude plugin setup could not complete; ClawGod Plus core install will continue"
} finally {
    if ($hadPluginBun) { $env:CLAWGOD_BUN_BIN = $previousPluginBun }
    else { Remove-Item Env:CLAWGOD_BUN_BIN -ErrorAction SilentlyContinue }
    if ($hadPluginDir) { $env:CLAWGOD_DIR = $previousPluginDir }
    else { Remove-Item Env:CLAWGOD_DIR -ErrorAction SilentlyContinue }
}

Install-ClaudeMemCompatHelper
try {
    $env:CLAWGOD_BUN_BIN = $BunBin
    $env:CLAWGOD_CLAUDE_BIN = $claudeCmd
    & $BunBin (Join-Path $ClawDir "claude-mem-compat.cjs") install
    if (Test-Path (Join-Path $env:USERPROFILE ".claude-mem\clawgod-settings-backup.json")) {
        Write-OK "claude-mem compatibility configured"
    }
} catch {
    Write-Warn "claude-mem compatibility setup failed; ClawGod Plus core install will continue"
} finally {
    Remove-Item Env:CLAWGOD_BUN_BIN -ErrorAction SilentlyContinue
    Remove-Item Env:CLAWGOD_CLAUDE_BIN -ErrorAction SilentlyContinue
}

# ─── Ensure BinDir is in PATH ─────────────────────────

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$BinDir;$userPath", "User")
    $env:Path = "$BinDir;$env:Path"
    Write-OK "Added $BinDir to user PATH"
    Write-Dim "(restart terminal for PATH to take effect)"
}

# ─── Done ─────────────────────────────────────────────

Write-Host ""
Write-Host "  ClawGod Plus installed!" -ForegroundColor Green
Write-Host ""
Write-Dim "  claude            — Start patched Claude Code (green logo)"
Write-Dim "  claude.orig       — Run original unpatched Claude Code"
Write-Host ""
Write-Dim "  Updates: 'claude update' is patched to route through this installer."
Write-Dim "  Just run it as usual — pulls latest Anthropic release + re-patches"
Write-Dim "  in one step. Extra options:"
Write-Dim "    claude update --version 2.1.180   (install a specific version)"
Write-Dim "    claude update --no-upgrade        (re-patch without downloading)"
Write-Dim "  To leave clawgod and use vanilla update:"
Write-Dim "    bash ~/.clawgod/install.sh --uninstall"
Write-Host ""
Write-Dim "  If 'claude' still runs the old version, restart your terminal."
Write-Host ""
Write-Dim "  Config: ~/.clawgod/provider.json"
Write-Dim "  Flags:  ~/.clawgod/features.json"
Write-Host ""
Write-Dim "  If 'claude' panics with 'Expected CommonJS module to have a function wrapper',"
Write-Dim "  your Bun lags Anthropic's embedded Bun. Upgrade with one of:"
Write-Dim "    bun upgrade --canary           (if installed from bun.sh)"
Write-Dim "    scoop update bun               (scoop — may lag stable)"
Write-Dim "    irm https://bun.sh/install.ps1 | iex   (re-install latest)"
Write-Host ""
