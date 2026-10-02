# README 用スクリーンショットを撮り直すスクリプト。
# 事前に別のターミナルで `npm run dev`（http://localhost:1420）を起動しておくこと。
# 開発用のデモシナリオ（src/dev/demo.ts）を headless Edge で開き、2x 解像度の PNG を保存する。
#
#   ./scripts/capture-screenshots.ps1
#
param(
  [string]$OutDir = (Join-Path $PSScriptRoot "..\docs\screenshots"),
  [int]$Width = 1280,
  [int]$Height = 800
)

$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { throw "Microsoft Edge が見つかりません: $edge" }
New-Item -ItemType Directory -Force $OutDir | Out-Null

$shots = @(
  @{ Scene = "main";     Theme = "dark";  Name = "main-dark" },
  @{ Scene = "main";     Theme = "light"; Name = "main-light" },
  @{ Scene = "overview"; Theme = "dark";  Name = "pane-overview" },
  @{ Scene = "switch";   Theme = "dark";  Name = "quick-switch" },
  @{ Scene = "palette";  Theme = "dark";  Name = "command-palette" },
  @{ Scene = "settings"; Theme = "dark";  Name = "settings" }
)

foreach ($shot in $shots) {
  $out = Join-Path (Resolve-Path $OutDir) "$($shot.Name).png"
  # 毎回まっさらなプロファイルで開く（localStorage の残りで状態が変わらないように）
  $profileDir = Join-Path $env:TEMP ("elecxterm-shot-" + [guid]::NewGuid().ToString("N"))
  $url = "http://localhost:1420/?demo=$($shot.Scene)&theme=$($shot.Theme)"
  & $edge --headless=new --hide-scrollbars --no-first-run --no-default-browser-check `
    --force-device-scale-factor=2 --window-size="$Width,$Height" --virtual-time-budget=6000 `
    --user-data-dir="$profileDir" --screenshot="$out" $url 2>&1 | Out-Null
  Start-Sleep -Milliseconds 300
  Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
  if (Test-Path $out) { Write-Host "saved $out" } else { Write-Warning "failed: $($shot.Name)" }
}
