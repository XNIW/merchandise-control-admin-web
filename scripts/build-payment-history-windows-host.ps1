#Requires -Version 7.4
[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not [IO.Path]::IsPathFullyQualified($OutputDirectory) -or (Test-Path -LiteralPath $OutputDirectory)){throw 'history_host_fresh_output_required'}
$output=[IO.Path]::GetFullPath($OutputDirectory)
if($output.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'history_host_output_must_be_external'}
$node=(Get-Command node -ErrorAction Stop).Source
$version=(& $node --version).Trim()
if($LASTEXITCODE -ne 0 -or $version -cne 'v24.18.0'){throw 'history_host_qualified_node_version_required'}
$signature=Get-AuthenticodeSignature -LiteralPath $node
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'OpenJS Foundation'){throw 'history_host_node_signature_invalid'}
$csc=Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(-not (Test-Path -LiteralPath $csc)){throw 'history_host_net48_compiler_missing'}
$null=New-Item -ItemType Directory -Path $output
$hostExe=Join-Path $output 'HistoryWorkerService.exe'
$framework=Split-Path $csc -Parent
& $csc /nologo /target:exe /platform:x64 /optimize+ /warnaserror+ ("/out:$hostExe") ("/reference:"+(Join-Path $framework 'System.ServiceProcess.dll')) ("/reference:"+(Join-Path $framework 'System.Security.dll')) (Join-Path $repo 'tools/PaymentHistoryWorker/windows/HistoryWorkerService.cs')
if($LASTEXITCODE -ne 0){throw 'history_host_compilation_failed'}
$worker=Join-Path $output 'worker.cjs'
Push-Location -LiteralPath $repo
try{
 & $node scripts/build-payment-history-worker.mjs $worker
 if($LASTEXITCODE -ne 0){throw 'history_host_worker_build_failed'}
 $source=git rev-parse HEAD
 if($LASTEXITCODE -ne 0 -or $source -cnotmatch '^[0-9a-f]{40}$'){throw 'history_host_source_identity_failed'}
 $runtimeDiff=git diff 612d9bd0fb9f1f8a71d0bc3631186e8fac04761f HEAD -- src package.json package-lock.json tools/PaymentHistoryWorker/main.ts tools/PaymentHistoryWorker/gateway-port.ts scripts/build-payment-history-worker.mjs
 if($LASTEXITCODE -ne 0 -or $runtimeDiff){throw 'history_host_qualified_runtime_changed'}
}finally{Pop-Location}
$hash=(Get-FileHash -LiteralPath $worker -Algorithm SHA256).Hash.ToLowerInvariant()
if($hash -cne '20eb2acd148a6c169f280174cd521f9e331eb64efda491e3c579a33349314ccb'){throw 'history_host_worker_not_exact_qualified_bytes'}
[IO.File]::WriteAllText((Join-Path $output 'HistoryWorkerService.exe.config'),'<configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8" /></startup></configuration>',[Text.UTF8Encoding]::new($false))
foreach($name in @('HostDeployment.psm1','Install-Host.ps1','README.md')){Copy-Item -LiteralPath (Join-Path $repo ('tools/PaymentHistoryWorker/windows/'+$name)) -Destination (Join-Path $output $name)}
$license=Join-Path (Split-Path $node -Parent) 'LICENSE'
if(-not (Test-Path -LiteralPath $license -PathType Leaf)){throw 'history_host_node_license_missing'}
Copy-Item -LiteralPath $license -Destination (Join-Path $output 'Node-LICENSE.txt')
$files=@(Get-ChildItem -LiteralPath $output -File|Sort-Object Name|ForEach-Object{[ordered]@{path=$_.Name;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
[ordered]@{schema='history-worker-windows-package-v1';sourceSha=$source;runtimeQualifiedServerSha='612d9bd0fb9f1f8a71d0bc3631186e8fac04761f';workerSha256=$hash;runtimeFilesUnchanged=$true;nodeVersion=$version;nodeSha256=(Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant();nodePublisher=$signature.SignerCertificate.Subject;architecture='x64';framework='net48';processMemoryLimit=1073741824;jobMemoryLimit=1073741824;heapMiB=640;activeProcesses=1;files=$files;secretsIncluded=$false;remoteMutation=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $output 'manifest.json') -Encoding utf8
Write-Output 'HISTORY_WORKER_WINDOWS_PACKAGE=PASS exact qualified worker bytes; no installation'
