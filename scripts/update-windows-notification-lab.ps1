param([switch]$Rollback, [ValidateSet('unified','session-title')][string]$Revision='unified')
$ErrorActionPreference='Stop'
$notifyBackup='C:\Users\Martin\.harness-remote\backups\task-notifications-unified-20260915'
if ($Revision -eq 'session-title') { $notifyBackup='C:\Users\Martin\.harness-remote\backups\task-notifications-title-20260915' }
$notifyInstall='C:\Users\Martin\.dsh\profiles\web\node_modules\@harness-remote\dsh-wechat-remote'
$notifySource='E:\agent remote\notifications-dsh-wechat-remote'
$notifyCli='C:\Users\Martin\AppData\Local\npm\node_modules\@deepseek-ai\dsh\lib\bin.js'
$notifyNode='C:\Program Files\nodejs\node.exe'
$notifyIdentity='C:\Users\Martin\.dsh\harness-remote-public-identity.json'
$notifyState='C:\Users\Martin\.dsh\gate-wechat-state.json'
$notifyFiles=@('lib/task-notifications.js','lib/task-notifications.d.ts')
function Notify-Rpc($method) {
  $gate=Get-Content -Raw -LiteralPath $notifyState|ConvertFrom-Json
  $body=@{type='client-request';rpcId='notification-update-guard';method=$method;payload=@{}}|ConvertTo-Json -Compress
  $r=Invoke-RestMethod ('http://127.0.0.1:3092/api/'+$method) -Method Post -ContentType 'application/json' -Headers @{Authorization='Bearer '+$gate.token} -Body $body -TimeoutSec 8
  if(!$r.result.ok){throw 'DSH guard failed'}
  return $r.result.value
}
function Notify-Sessions {
  $value=Notify-Rpc 'session.list'
  if($null -eq $value.items -or @($value.items|Where-Object {$_.running -ne $false}).Count){throw 'Active or unknown session; refusing restart'}
  return @($value.items|ForEach-Object {$_.sessionId}|Sort-Object)
}
function Notify-Start($cwd,$suffix) {
  $previous=$env:HR_TASK_NOTIFICATIONS_ENABLED
  try {
    $env:HR_TASK_NOTIFICATIONS_ENABLED='1'
    return Start-Process -FilePath $notifyNode -ArgumentList @($notifyCli,'web','--no-open') -WorkingDirectory $cwd -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $notifyBackup ($suffix+'.out.log')) -RedirectStandardError (Join-Path $notifyBackup ($suffix+'.err.log'))
  }finally{$env:HR_TASK_NOTIFICATIONS_ENABLED=$previous}
}
$notifySessions=Notify-Sessions
$notifyCwd=(Notify-Rpc 'host.describe').cwd
$notifyPid=@(Get-NetTCPConnection -State Listen -LocalPort 3092|Select-Object -ExpandProperty OwningProcess -Unique)
if($notifyPid.Count -ne 1){throw 'Ambiguous process'}
$notifyProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+$notifyPid[0])
if($notifyProcess.ExecutablePath -ne $notifyNode -or $notifyProcess.CommandLine -notmatch '@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin.js.*web'){throw 'Process changed'}
if((Get-Item -LiteralPath $notifyInstall).LinkType){throw 'Linked install forbidden'}
$notifyBefore=@{}
foreach($file in @($notifyCli,$notifyIdentity,$notifyState)){$notifyBefore[$file]=(Get-FileHash -LiteralPath $file).Hash}
if(!$Rollback){
  if(Test-Path -LiteralPath $notifyBackup){throw 'Backup exists; review before retry'}
  $null=New-Item -ItemType Directory -Path (Join-Path $notifyBackup 'lib')
  foreach($file in $notifyFiles){Copy-Item -LiteralPath (Join-Path $notifyInstall $file) -Destination (Join-Path $notifyBackup $file)}
  @{oldPid=$notifyPid[0];cwd=$notifyCwd;hashes=$notifyBefore;sessions=$notifySessions}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $notifyBackup 'before.json') -Encoding utf8
}else{
  $record=Get-Content -Raw -LiteralPath (Join-Path $notifyBackup 'activation.json')|ConvertFrom-Json
  if($record.newPid -ne $notifyPid[0]){throw 'Rollback owner changed; inspect first'}
}
$null=Notify-Sessions
$notifyCurrent=Get-CimInstance Win32_Process -Filter ('ProcessId='+$notifyPid[0])
if (!$notifyCurrent -or $notifyCurrent.CreationDate -ne $notifyProcess.CreationDate -or $notifyCurrent.ExecutablePath -ne $notifyNode) { throw 'Process identity changed before restart' }
Stop-Process -Id $notifyPid[0]
Wait-Process -Id $notifyPid[0] -Timeout 10 -ErrorAction SilentlyContinue
try {
  foreach($file in $notifyFiles){
    $target=[IO.Path]::GetFullPath((Join-Path $notifyInstall $file))
    if(!$target.StartsWith($notifyInstall+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid target'}
    $from=if($Rollback){Join-Path $notifyBackup $file}else{Join-Path $notifySource $file}
    Copy-Item -LiteralPath $from -Destination $target -Force
  }
  $child=Notify-Start $notifyCwd $(if($Rollback){'rollback'}else{'unified'})
  for($attempt=0;$attempt -lt 30;$attempt++){
    try{$after=Notify-Sessions;break}catch{if($attempt -eq 29){throw};Start-Sleep -Milliseconds 500}
  }
  if(Compare-Object $notifySessions $after){throw 'Session identity changed'}
  foreach($file in $notifyBefore.Keys){if((Get-FileHash -LiteralPath $file).Hash -ne $notifyBefore[$file]){throw 'DSH core or pairing changed'}}
  foreach($file in $notifyFiles){
    $expected=if($Rollback){Join-Path $notifyBackup $file}else{Join-Path $notifySource $file}
    if((Get-FileHash -LiteralPath (Join-Path $notifyInstall $file)).Hash -ne (Get-FileHash -LiteralPath $expected).Hash){throw 'Installed notification module differs from the selected source'}
  }
  $report=@{updated=(!$Rollback);newPid=$child.Id;cwd=$notifyCwd;coreAndPairingUnchanged=$true;sessions=$after.Count;changedPluginFiles=$notifyFiles.Count;backup=$notifyBackup}
  $report|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $notifyBackup 'activation.json') -Encoding utf8
  $report|ConvertTo-Json -Compress
}catch{
  # Do not kill an unknown/new process on failure; keep exact backup and report for inspection.
  throw
}
