param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "God's Eye View.lnk"
$chrome = @(
  "$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
$brave = "$env:PROGRAMFILES\BraveSoftware\Brave-Browser\Application\brave.exe"
$edge = "${env:PROGRAMFILES(X86)}\Microsoft\Edge\Application\msedge.exe"

$target = if ($chrome) { $chrome } elseif (Test-Path $brave) { $brave } elseif (Test-Path $edge) { $edge } else { $null }
if (-not $target) {
  $urlFile = Join-Path $desktop "God's Eye View.url"
  @"
[InternetShortcut]
URL=$Url
"@ | Set-Content -Path $urlFile -Encoding ASCII
  Write-Output "Wrote $urlFile"
  exit 0
}

$w = New-Object -ComObject WScript.Shell
$lnk = $w.CreateShortcut($shortcutPath)
$lnk.TargetPath = $target
$lnk.Arguments = "--app=$Url --new-window"
$lnk.WorkingDirectory = Split-Path $target
$lnk.WindowStyle = 1
$lnk.Description = "God's Eye View live desk"
$lnk.Save()
Write-Output "Wrote $shortcutPath -> $Url"
