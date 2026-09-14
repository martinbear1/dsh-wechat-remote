param([switch]$Rollback)
$ErrorActionPreference = 'Stop'
$labRoot = 'C:\Users\Martin\.harness-remote\backups\task-notifications-20260915'
$labInstall = 'C:\Users\Martin\.dsh\profiles\web\node_modules\@harness-remote\dsh-wechat-remote'
$labSource = 'E:\agent remote\notifications-dsh-wechat-remote'
$labCli = 'C:\Users\Martin\AppData\Local\npm\node_modules\@deepseek-ai\dsh\lib\bin.js'
$labNode = 'C:\Program Files\nodejs\node.exe'
$labState = 'C:\Users\Martin\.dsh\gate-wechat-state.json'
$labIdentity = 'C:\Users\Martin\.dsh\harness-remote-public-identity.json'
$labFiles = @('lib/gate-runtime.js','lib/dsh-compatibility-api.js','lib/dsh-compatibility-api.d.ts','lib/task-notifications.js','lib/task-notifications.d.ts')
function Lab-Rpc($method, $payload) {
  $gate = Get-Content -Raw -LiteralPath $labState | ConvertFrom-Json
  $body = @{type='client-request';rpcId='notification-lab-check';method=$method;payload=$payload} | ConvertTo-Json -Depth 10 -Compress
  $reply = Invoke-RestMethod -Uri ('http://127.0.0.1:3092/api/' + $method) -Method Post -ContentType 'application/json' -Headers @{Authorization='Bearer ' + $gate.token} -Body $body -TimeoutSec 8
  if (!$reply.result.ok) {throw 'Authenticated DSH check failed; no installation changes allowed.'}
  return $reply.result.value
}
function Lab-Idle {
  $list = Lab-Rpc 'session.list' @{}
  if ($null -eq $list.items -or @($list.items | Where-Object {$_.running -ne $false}).Count) {throw 'DSH has active or unverifiable sessions. Wait before reloading.'}
  return @($list.items | ForEach-Object {$_.sessionId} | Sort-Object)
}
function Lab-Stop($ownedPid) {
  $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $ownedPid)
  if (!$process -or $process.ExecutablePath -ne $labNode -or $process.CommandLine -notlike '*@deepseek-ai/dsh/lib/bin.js*web*' -and $process.CommandLine -notlike '*@deepseek-ai\dsh\lib\bin.js*web*') {throw 'DSH process identity changed; refusing to stop.'}
  $null = Lab-Idle
  Stop-Process -Id $ownedPid
  Wait-Process -Id $ownedPid -Timeout 10 -ErrorAction SilentlyContinue
}
function Lab-Start($cwd, $enabled) {
  $previous = $env:HR_TASK_NOTIFICATIONS_ENABLED
  try {
    $env:HR_TASK_NOTIFICATIONS_ENABLED = $(if ($enabled) {'1'} else {'0'})
    $logSuffix = $(if ($enabled) {'research'} else {'restored'})
    return Start-Process -FilePath $labNode -ArgumentList @($labCli,'web','--no-open') -WorkingDirectory $cwd -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $labRoot ($logSuffix + '.out.log')) -RedirectStandardError (Join-Path $labRoot ($logSuffix + '.err.log'))
  } finally {$env:HR_TASK_NOTIFICATIONS_ENABLED = $previous}
}
function Lab-RestoreFiles {
  foreach ($relative in $labFiles) {
    $saved = Join-Path (Join-Path $labRoot 'plugin') $relative
    $target = [IO.Path]::GetFullPath((Join-Path $labInstall $relative))
    if (!$target.StartsWith($labInstall + '\', [StringComparison]::OrdinalIgnoreCase)) {throw 'Invalid restore target'}
    if (Test-Path -LiteralPath $saved) {Copy-Item -LiteralPath $saved -Destination $target -Force}
    elseif ($relative -in @('lib/task-notifications.js','lib/task-notifications.d.ts') -and (Test-Path -LiteralPath $target)) {Remove-Item -LiteralPath $target}
  }
}
if ($Rollback) {
  $record = Get-Content -Raw -LiteralPath (Join-Path $labRoot 'activation.json') | ConvertFrom-Json
  Lab-Stop $record.newPid
  Lab-RestoreFiles
  $restored = Lab-Start $record.cwd $false
  @{restored=$true;pid=$restored.Id;backup=$labRoot} | ConvertTo-Json -Compress
  exit
}
if (Test-Path -LiteralPath $labRoot) {throw 'Backup already exists; inspect before another activation.'}
if ((Get-Item -LiteralPath $labInstall).LinkType) {throw 'Installed plugin is linked; refusing to overwrite research or stable checkout.'}
$beforeSessions = Lab-Idle
$cwd = (Lab-Rpc 'host.describe' @{}).cwd
if (!(Test-Path -LiteralPath $cwd -PathType Container)) {throw 'Cannot preserve native working directory.'}
$owner = @(Get-NetTCPConnection -LocalPort 3092 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
if ($owner.Count -ne 1) {throw 'Ambiguous DSH listener owner'}
$identityHash = (Get-FileHash -LiteralPath $labIdentity -Algorithm SHA256).Hash
$stateHash = (Get-FileHash -LiteralPath $labState -Algorithm SHA256).Hash
$null = New-Item -ItemType Directory -Path $labRoot
# Private local backup: original package, dependencies and profile manifests; no credentials printed.
Copy-Item -LiteralPath $labInstall -Destination (Join-Path $labRoot 'plugin') -Recurse
$null = New-Item -ItemType Directory -Path (Join-Path $labRoot 'profile')
foreach ($name in @('package.json','pnpm-lock.yaml','cordis.patch.yml')) {
  $file = Join-Path 'C:\Users\Martin\.dsh\profiles\web' $name
  if (Test-Path -LiteralPath $file) {Copy-Item -LiteralPath $file -Destination (Join-Path (Join-Path $labRoot 'profile') $name)}
}
$record = @{oldPid=$owner[0];cwd=$cwd;identityHash=$identityHash;stateHash=$stateHash;sessions=$beforeSessions;files=$labFiles;stableVersion='1.7.5';sourceBranch='research/task-notifications-20260914'}
# This script writes only its own backup manifest/logs; it never writes DSH settings, keys or pairings.
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $labRoot 'before.json') -Encoding utf8
Lab-Stop $owner[0]
try {
  foreach ($relative in $labFiles) {Copy-Item -LiteralPath (Join-Path $labSource $relative) -Destination (Join-Path $labInstall $relative) -Force}
  $child = Lab-Start $cwd $true
  $record.newPid = $child.Id
  $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $labRoot 'activation.json') -Encoding utf8
  @{started=$true;pid=$child.Id;backup=$labRoot;sessionsPreservedBeforeRestart=$beforeSessions.Count;changedPluginFiles=$labFiles.Count;dshCoreModified=$false} | ConvertTo-Json -Compress
} catch {
  Lab-RestoreFiles
  $null = Lab-Start $cwd $false
  throw
}
