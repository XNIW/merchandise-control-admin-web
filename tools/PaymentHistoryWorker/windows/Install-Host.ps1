#Requires -Version 7.4
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$PackageDirectory,
 [Parameter(Mandatory)][string]$ReadyReceipt,
 [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{64}$')][string]$ReadyReceiptSha256,
 [Parameter(Mandatory)][string]$ReceiptPath,
 [switch]$ValidateOnly
)
$ErrorActionPreference='Stop'
$name='MerchandiseControlHistoryWorker'
$gateway='https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/api/internal/payment-history/worker'
$stage='validation';$keyBytes=$null;$configured=$false;$created=$false
function Demand([bool]$Ok,[string]$Code){if(-not $Ok){throw $Code}}
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Run-Wrangler([string[]]$Arguments,[string]$InputText){
 $info=[Diagnostics.ProcessStartInfo]::new($node)
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.ArgumentList.Add($ready.wranglerScript)
 foreach($arg in $Arguments){$info.ArgumentList.Add($arg)}
 $info.ArgumentList.Add('--config');$info.ArgumentList.Add($ready.cloudflareConfig)
 $info.ArgumentList.Add('--name');$info.ArgumentList.Add('merchandise-control-admin-web-staging')
 $process=[Diagnostics.Process]::new();$process.StartInfo=$info
 try{
  $null=$process.Start();$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
  if($null -ne $InputText){$process.StandardInput.WriteLine($InputText)}
  $process.StandardInput.Close()
  if(-not $process.WaitForExit(120000)){try{$process.Kill()}catch{};throw 'history_host_gateway_configuration_timeout'}
  $out=$stdout.GetAwaiter().GetResult();$null=$stderr.GetAwaiter().GetResult()
  Demand ($process.ExitCode -eq 0) 'history_host_gateway_configuration_failed'
  return $out
 }finally{$process.Dispose()}
}
try{
 $package=[IO.Path]::GetFullPath($PackageDirectory)
 $m=Get-Content -LiteralPath (Join-Path $package 'manifest.json') -Raw|ConvertFrom-Json
 Demand ($m.schema -ceq 'history-worker-windows-package-v1' -and $m.workerSha256 -ceq '20eb2acd148a6c169f280174cd521f9e331eb64efda491e3c579a33349314ccb' -and $m.runtimeFilesUnchanged -and -not $m.secretsIncluded) 'history_host_package_identity_invalid'
 $expected=@('HistoryWorkerService.exe','HistoryWorkerService.exe.config','worker.cjs','HostDeployment.psm1','Install-Host.ps1','README.md','Node-LICENSE.txt')
 Demand (@($m.files).Count -eq $expected.Count -and @($m.files.path|Select-Object -Unique).Count -eq $expected.Count -and @($m.files.path|Where-Object {$_ -cnotin $expected}).Count -eq 0) 'history_host_package_members_invalid'
 foreach($file in $m.files){
  Demand ($file.path -cmatch '^[A-Za-z0-9._-]+$') 'history_host_package_member_invalid'
  $path=Join-Path $package $file.path
  Demand ((Get-Item -LiteralPath $path).Length -eq $file.bytes -and (Hash $path) -ceq $file.sha256) 'history_host_package_hash_invalid'
 }
 Demand ((Hash $ReadyReceipt) -ceq $ReadyReceiptSha256) 'history_host_ready_receipt_changed'
 $ready=Get-Content -LiteralPath $ReadyReceipt -Raw|ConvertFrom-Json
 Demand ($ready.schema -ceq 'asus019-staging-ready-v1' -and $ready.runtimeSourceSha -ceq '612d9bd0fb9f1f8a71d0bc3631186e8fac04761f' -and $ready.historyMigrationsCompleted -and $ready.gatewayRoutePublished -and $ready.cloudflareVersion -cmatch '^[0-9a-f-]{36}$' -and $ready.workerTarget -ceq 'merchandise-control-admin-web-staging') 'history_host_backend_not_ready'
 Demand ((Hash $ready.wranglerScript) -ceq $ready.wranglerScriptSha256 -and (Hash $ready.cloudflareConfig) -ceq $ready.cloudflareConfigSha256) 'history_host_provisioner_changed'
 $config=Get-Content -LiteralPath $ready.cloudflareConfig -Raw|ConvertFrom-Json
 Demand ($config.name -ceq 'merchandise-control-admin-web-staging') 'history_host_provisioner_target_invalid'
 $node=(Get-Command node -ErrorAction Stop).Source
 Demand ((& $node --version).Trim() -ceq $m.nodeVersion -and (Hash $node) -ceq $m.nodeSha256) 'history_host_qualified_node_required'
 $signature=Get-AuthenticodeSignature -LiteralPath $node
 Demand ($signature.Status -eq 'Valid' -and $signature.SignerCertificate.Subject -match 'OpenJS Foundation') 'history_host_node_signature_invalid'
 if($ValidateOnly){Write-Output 'HISTORY_WORKER_HOST_PREREQUISITES=PASS no mutation';return}
 $principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
 Demand ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'history_host_administrator_consent_required'
 Demand ([int]((Get-CimInstance Win32_OperatingSystem).Version.Split('.')[0]) -ge 10 -and [Environment]::Is64BitProcess) 'history_host_supported_windows_x64_required'
 Demand (-not (Test-Path -LiteralPath $ReceiptPath)) 'history_host_new_receipt_required'
 $bin=Join-Path $env:ProgramFiles 'MerchandiseControlHistoryWorker'
 $data=Join-Path $env:ProgramData 'MerchandiseControlHistoryWorker'
 Demand (-not (Test-Path -LiteralPath $bin) -and -not (Test-Path -LiteralPath $data) -and -not (Get-Service -Name $name -ErrorAction SilentlyContinue)) 'history_host_existing_install_requires_reconciliation'
 # Inspect names only. Never replace a pre-existing shared gateway key blindly.
 $before=Run-Wrangler @('secret','list') $null|ConvertFrom-Json
 Demand (@($before|Where-Object name -CEQ 'PAYMENT_HISTORY_WORKER_GATEWAY_SECRET').Count -eq 0) 'history_host_gateway_key_already_present'
 $deployments=Run-Wrangler @('deployments','list','--json') $null|ConvertFrom-Json
 $deployment=@($deployments|Sort-Object created_on -Descending)[0]
 Demand (@($deployment.versions).Count -eq 1 -and $deployment.versions[0].percentage -eq 100 -and $deployment.versions[0].version_id -ceq $ready.cloudflareVersion) 'history_host_backend_version_changed'
 $stage='install_service'
 $null=New-Item -ItemType Directory -Path $bin
 $null=New-Item -ItemType Directory -Path $data
 $private=Join-Path $data 'private';$status=Join-Path $data 'status'
 $null=New-Item -ItemType Directory -Path $private;$null=New-Item -ItemType Directory -Path $status
 foreach($file in @('HistoryWorkerService.exe','HistoryWorkerService.exe.config','worker.cjs','Node-LICENSE.txt')){Copy-Item -LiteralPath (Join-Path $package $file) -Destination (Join-Path $bin $file)}
 Copy-Item -LiteralPath $node -Destination (Join-Path $bin 'node.exe')
 Demand ((Hash (Join-Path $bin 'node.exe')) -ceq $m.nodeSha256) 'history_host_node_copy_changed'
 Import-Module (Join-Path $package 'HostDeployment.psm1') -Force
 $sid=New-HistoryHostService -Name $name -HostExe (Join-Path $bin 'HistoryWorkerService.exe') -Created ([ref]$created)
 Set-HistoryHostAcl -Path $bin -ServiceSid $sid -Rights ReadAndExecute
 foreach($file in @(Get-ChildItem -LiteralPath $bin -File)){Set-HistoryHostAcl -Path $file.FullName -ServiceSid $sid -Rights ReadAndExecute}
 Set-HistoryHostAcl -Path $data -ServiceSid $sid -Rights ReadAndExecute
 Set-HistoryHostAcl -Path $private -ServiceSid $sid -Rights ReadAndExecute
 Set-HistoryHostAcl -Path $status -ServiceSid $sid -Rights Modify -PublicRead
 $stage='protect_gateway_key'
 $random=[Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
 $key=[Convert]::ToBase64String($random).TrimEnd('=').Replace('+','-').Replace('/','_');[Array]::Clear($random,0,$random.Length)
 $keyBytes=[Text.Encoding]::UTF8.GetBytes($key)
 $keyPath=Join-Path $private 'gateway.dpapi'
 Protect-HistoryHostSecret -Name $name -Url $gateway -SecretUtf8 $keyBytes -Path $keyPath
 Set-HistoryHostAcl -Path $keyPath -ServiceSid $sid -Rights Read
 Set-HistoryHostParameters -Name $name -Values @{NodePath=(Join-Path $bin 'node.exe');WorkerPath=(Join-Path $bin 'worker.cjs');SecretPath=$keyPath;GatewayUrl=$gateway;WorkerSha256=$m.workerSha256;NodeSha256=$m.nodeSha256;StatusPath=(Join-Path $status 'status.json')}
 $stage='provision_gateway_key'
 # Recheck after local preparation: a delayed UAC must not configure a different backend.
 $deployments=Run-Wrangler @('deployments','list','--json') $null|ConvertFrom-Json
 $deployment=@($deployments|Sort-Object created_on -Descending)[0]
 Demand (@($deployment.versions).Count -eq 1 -and $deployment.versions[0].percentage -eq 100 -and $deployment.versions[0].version_id -ceq $ready.cloudflareVersion) 'history_host_backend_version_changed'
 # The key enters the existing CLI only through stdin; no argument/log/repo copy.
 $null=Run-Wrangler @('secret','put','PAYMENT_HISTORY_WORKER_GATEWAY_SECRET') $key
 $configured=$true;$key=$null;[Array]::Clear($keyBytes,0,$keyBytes.Length);$keyBytes=$null
 $stage='start_service'
 Set-Service -Name $name -StartupType Automatic
 & "$env:SystemRoot\System32\sc.exe" config $name start= delayed-auto *> $null
 Demand ($LASTEXITCODE -eq 0) 'history_host_startup_configuration_failed'
 & "$env:SystemRoot\System32\sc.exe" failure $name reset= 86400 actions= restart/60000/restart/300000 *> $null
 Demand ($LASTEXITCODE -eq 0) 'history_host_recovery_configuration_failed'
 & "$env:SystemRoot\System32\sc.exe" failureflag $name 1 *> $null
 Demand ($LASTEXITCODE -eq 0) 'history_host_recovery_flag_failed'
 Start-Service -Name $name
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(30);$health=$null
 do{
  Start-Sleep -Milliseconds 250
  if(Test-Path -LiteralPath (Join-Path $status 'status.json')){$health=Get-Content -LiteralPath (Join-Path $status 'status.json') -Raw|ConvertFrom-Json}
 }while(((-not $health) -or $health.state -ne 'running') -and [DateTimeOffset]::UtcNow -lt $deadline)
 Demand ($health -and $health.state -ceq 'running' -and $health.processMemoryLimit -eq 1GB -and $health.activeProcessLimit -eq 1) 'history_host_started_without_valid_limits'
 [ordered]@{schema='history-worker-host-install-v1';status='INSTALLED_RUNNING_GATEWAY_HEALTH_PENDING';utc=[DateTimeOffset]::UtcNow.ToString('O');service=$name;serviceAccount="NT SERVICE\$name";packageSource=$m.sourceSha;workerRuntimeSource=$m.runtimeQualifiedServerSha;workerSha256=$m.workerSha256;nodeVersion=$m.nodeVersion;gatewayKeyConfigured=$configured;secretValuesLogged=$false;health=$health;publicStatusPath=(Join-Path $status 'status.json');rollback='Stop this exact service and restore prior reviewed staging Worker version; retain additive SQL/data and protected key.'}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $ReceiptPath -Encoding utf8
 Write-Output 'HISTORY_WORKER_HOST=INSTALLED_RUNNING; verify signed gateway activity separately'
}catch{
 if($created){Stop-Service -Name $name -ErrorAction SilentlyContinue}
 $code=if($_.Exception.Message -cmatch '^history_host_[a-z_]+$'){$_.Exception.Message}else{'history_host_install_failed'}
 if(-not $ValidateOnly -and [IO.Path]::IsPathFullyQualified($ReceiptPath) -and -not (Test-Path -LiteralPath $ReceiptPath)){
  [ordered]@{schema='history-worker-host-install-v1';status='FAIL';utc=[DateTimeOffset]::UtcNow.ToString('O');stage=$stage;code=$code;serviceCreated=$created;gatewayKeyConfigured=$configured;protectedKeyRetained=$true;secretValuesLogged=$false}|ConvertTo-Json|Set-Content -LiteralPath $ReceiptPath -Encoding utf8
 }
 throw $code
}finally{if($keyBytes){[Array]::Clear($keyBytes,0,$keyBytes.Length)}}
