#Requires -Version 7.4
[CmdletBinding()]
param([Parameter(Mandatory)][string]$PackageDirectory,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'history_host_qa_requires_disposable_admin_runner'}
if($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows'){throw 'history_host_qa_owned_runner_only'}
$base=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
$output=[IO.Path]::GetFullPath($OutputDirectory)
if(-not $output.StartsWith($base+'\',[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $output)){throw 'history_host_qa_fresh_owned_root_required'}
$null=New-Item -ItemType Directory -Path $output
$owner=[Guid]::NewGuid().ToString('N');$name='MerchandiseControlHistoryWorker.QA.'+$owner
[IO.File]::WriteAllText((Join-Path $output '.synthetic-owner'),$owner)
 $hostExe=Join-Path $PackageDirectory 'HistoryWorkerService.exe';$node=(Get-Command node).Source
Import-Module (Join-Path $PackageDirectory 'HostDeployment.psm1') -Force
$results=[Collections.Generic.List[object]]::new();$created=$false;$secret=$null
function Demand([bool]$Ok,[string]$Code){if(-not $Ok){throw $Code}}
function Add-Pass([string]$Id){$results.Add([ordered]@{id=$Id;status='PASS'})}
try{
 $memory=Join-Path $output 'worker-host-probe-memory.cjs';$receipt=Join-Path $output 'memory.json'
 [IO.File]::WriteAllText($memory,"const a=[];for(let i=0;i<40;i++){try{a.push(Buffer.alloc(32*1024*1024,1));}catch{process.exit(23);}}process.exit(0);")
 & $hostExe --resource-probe $node $memory $owner $receipt
 Demand ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $receipt)) 'history_host_memory_probe_missing'
 $m=Get-Content -LiteralPath $receipt -Raw|ConvertFrom-Json
 Demand ($m.processMemoryLimit -eq 1073741824 -and $m.jobMemoryLimit -eq 1073741824 -and $m.activeProcessLimit -eq 1 -and $m.assignedBeforeResume) 'history_host_limits_not_enforced'
 Demand ($m.exitCode -ne 0 -and $m.peakPrivateCommit -ge 800MB -and $m.peakPrivateCommit -le 1GB) 'history_host_memory_limit_not_exercised'
 Add-Pass 'hard_private_commit_limit_1GiB_before_first_instruction'
 $spawn=Join-Path $output 'worker-host-probe-spawn.cjs';$spawnReceipt=Join-Path $output 'spawn.json'
 [IO.File]::WriteAllText($spawn,"const r=require('node:child_process').spawnSync(process.execPath,['-e','process.exit(99)']);process.exit(r.error?0:24);")
 & $hostExe --resource-probe $node $spawn $owner $spawnReceipt
 Demand ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $spawnReceipt)) 'history_host_spawn_probe_missing'
 $s=Get-Content -LiteralPath $spawnReceipt -Raw|ConvertFrom-Json
 Demand ($s.exitCode -eq 0 -and $s.activeProcessLimit -eq 1) 'history_host_descendant_process_not_denied'
 Add-Pass 'single_process_limit_denies_descendant'

 $bin=Join-Path $output 'bin';$private=Join-Path $output 'private';$status=Join-Path $output 'status'
 foreach($path in @($bin,$private,$status)){$null=New-Item -ItemType Directory -Path $path}
 foreach($file in @('HistoryWorkerService.exe','HistoryWorkerService.exe.config')){Copy-Item -LiteralPath (Join-Path $PackageDirectory $file) -Destination (Join-Path $bin $file)}
 Copy-Item -LiteralPath $node -Destination (Join-Path $bin 'node.exe')
 $serviceNode=Join-Path $bin 'node.exe'
 $stub=Join-Path $bin 'worker.cjs';[IO.File]::WriteAllText($stub,'setInterval(()=>{},1000);')
 $sid=New-HistoryHostService -Name $name -HostExe (Join-Path $bin 'HistoryWorkerService.exe') -Created ([ref]$created)
 Set-HistoryHostAcl -Path $output -ServiceSid $sid -Rights ReadAndExecute
 Set-HistoryHostAcl -Path $bin -ServiceSid $sid -Rights ReadAndExecute
 foreach($file in @(Get-ChildItem -LiteralPath $bin -File)){Set-HistoryHostAcl -Path $file.FullName -ServiceSid $sid -Rights ReadAndExecute}
 Set-HistoryHostAcl -Path $private -ServiceSid $sid -Rights ReadAndExecute
 Set-HistoryHostAcl -Path $status -ServiceSid $sid -Rights Modify -PublicRead
 [IO.File]::WriteAllText((Join-Path $private '.synthetic-owner'),$owner)
 $secret=[Text.Encoding]::UTF8.GetBytes([Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)))
 $keyPath=Join-Path $private 'gateway.dpapi';$url='https://history-worker-qa.invalid/api/internal/payment-history/worker'
 Protect-HistoryHostSecret -Name $name -Url $url -SecretUtf8 $secret -Path $keyPath
 Set-HistoryHostAcl -Path $keyPath -ServiceSid $sid -Rights Read
 Set-HistoryHostParameters -Name $name -Values @{NodePath=$serviceNode;WorkerPath=$stub;SecretPath=$keyPath;GatewayUrl=$url;WorkerSha256=(Get-FileHash -LiteralPath $stub).Hash.ToLowerInvariant();NodeSha256=(Get-FileHash -LiteralPath $serviceNode).Hash.ToLowerInvariant();StatusPath=(Join-Path $status 'status.json')}
 $service=Get-CimInstance Win32_Service -Filter "Name='$name'"
 Demand ($service.StartName -ieq "NT SERVICE\$name" -and $service.StartMode -eq 'Manual') 'history_host_service_identity_wrong'
 $acl=Get-Acl -LiteralPath $keyPath
 $readers=@($acl.Access|Where-Object AccessControlType -eq Allow|ForEach-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value })
 Demand ($acl.AreAccessRulesProtected -and $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq 'S-1-5-18' -and @($readers|Where-Object {$_ -notin @('S-1-5-18','S-1-5-32-544',$sid.Value)}).Count -eq 0) 'history_host_secret_acl_exposes_other_identity'
 Add-Pass 'dedicated_virtual_account_and_service_only_secret_acl'
 Start-Service -Name $name
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(30);$health=$null
 do{
  Start-Sleep -Milliseconds 200
  if(Test-Path -LiteralPath (Join-Path $status 'status.json')){$health=Get-Content -LiteralPath (Join-Path $status 'status.json') -Raw|ConvertFrom-Json}
 }while(((-not $health) -or $health.state -ne 'running') -and [DateTimeOffset]::UtcNow -lt $deadline)
 Demand ($null -ne $health -and $health.state -eq 'running' -and $health.serviceSidPresent -and $health.processMemoryLimit -eq 1GB -and $health.activeProcessLimit -eq 1) 'history_host_service_not_healthy'
 $pidOwned=[int]$health.pid
 Demand ($null -ne (Get-Process -Id $pidOwned -ErrorAction SilentlyContinue)) 'history_host_owned_child_missing'
 Add-Pass 'SCM_virtual_identity_DPAPI_child_launch_and_actual_limits'
 Stop-Service -Name $name
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(10)
 while((Get-Process -Id $pidOwned -ErrorAction SilentlyContinue) -and [DateTimeOffset]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 100}
 Demand ($null -eq (Get-Process -Id $pidOwned -ErrorAction SilentlyContinue)) 'history_host_owned_child_survived_stop'
 Add-Pass 'stop_closes_only_owned_job_and_child'
 [ordered]@{schema='history-worker-host-qa-v1';status='PASS';cases=$results;syntheticOnly=$true;linkedProjectUsed=$false;financialOperations=$false;serviceAccount='per-service virtual account';memoryLimit=1073741824;heapMiB=640;processLimit=1;memoryProbe=$m;spawnProbe=$s}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $output 'host-qualification.json') -Encoding utf8
 Write-Output 'HISTORY_WORKER_HOST_QA=PASS'
}catch{
 [ordered]@{schema='history-worker-host-qa-v1';status='FAIL';cases=$results;code=if($_.Exception.Message -cmatch '^history_host_[a-z_0-9]+$'){$_.Exception.Message}else{'history_host_unexpected'};syntheticOnly=$true;linkedProjectUsed=$false;financialOperations=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $output 'host-qualification.json') -Encoding utf8
 throw
}finally{
 if($secret){[Array]::Clear($secret,0,$secret.Length)}
 if($created){
  Stop-Service -Name $name -ErrorAction SilentlyContinue
  & "$env:SystemRoot\System32\sc.exe" delete $name *> $null
  if($LASTEXITCODE -ne 0){throw 'history_host_owned_service_cleanup_failed'}
 }
}
