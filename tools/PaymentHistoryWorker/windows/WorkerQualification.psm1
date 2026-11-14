$ErrorActionPreference='Stop'
function Assert-HistoryWorkerRuntimeQualification {
 param([Parameter(Mandatory)][object]$Receipt,[Parameter(Mandatory)][string]$WorkerSha256,
       [Parameter(Mandatory)][string]$SourceSha,[Parameter(Mandatory)][string]$SourceTree)
 function Demand([bool]$Ok){if(-not $Ok){throw 'history_host_runtime_qualification_invalid'}}
 function Digest($Value){$Value -is [string] -and $Value -cmatch '^[0-9a-f]{64}$'}
 function RunId($Value){$Value -is [string] -and $Value -cmatch '^[1-9][0-9]{0,19}$'}
 Demand ($Receipt -is [pscustomobject] -and $Receipt.schema -is [string] -and $Receipt.schema -ceq 'history-worker-runtime-qualification-v2' -and $Receipt.protocol -is [string] -and $Receipt.protocol -ceq 'stage_vector_v2' -and $Receipt.nodeVersion -is [string] -and $Receipt.nodeVersion -ceq 'v24.18.0')
 Demand ($SourceSha -cmatch '^[0-9a-f]{40}$' -and $SourceTree -cmatch '^[0-9a-f]{40}$' -and (Digest $WorkerSha256))
 Demand ($Receipt.sourceSha -is [string] -and $Receipt.sourceSha -ceq $SourceSha -and $Receipt.sourceTree -is [string] -and $Receipt.sourceTree -ceq $SourceTree -and $Receipt.workerSha256 -is [string] -and $Receipt.workerSha256 -ceq $WorkerSha256)
 Demand ((RunId $Receipt.artifactId) -and (Digest $Receipt.artifactArchiveSha256))
 foreach($gate in @($Receipt.canonicalSql,$Receipt.realVolume)){
  Demand ($gate -is [pscustomobject] -and $gate.status -is [string] -and $gate.status -ceq 'PASS' -and $gate.sourceSha -is [string] -and $gate.sourceSha -ceq $SourceSha -and (RunId $gate.runId) -and (Digest $gate.reportSha256))
 }
 $volume=$Receipt.realVolume
 Demand ($volume.workerSha256 -is [string] -and $volume.workerSha256 -ceq $WorkerSha256 -and $volume.syntheticOnly -is [bool] -and $volume.syntheticOnly -and $volume.sqlReal -is [bool] -and $volume.sqlReal -and $volume.realGateway -is [bool] -and $volume.realGateway -and $volume.gatewayRuntime -is [string] -and $volume.gatewayRuntime -ceq 'node24-native-route-adapter' -and $volume.sqlRuntime -is [string] -and $volume.sqlRuntime -ceq 'postgres-postgrest-owned-fixture')
 foreach($pair in @(@('rows',25947),@('movementBytes',20274917),@('analysisBudgetMs',120000),@('requestBudgetMs',15000),@('canonicalRowLimit',200),@('vectorChunkLimit',4))){
  $value=$volume.($pair[0]);Demand (($value -is [int] -or $value -is [long]) -and $value -eq $pair[1])
 }
 Demand (($volume.elapsedMs -is [double] -or $volume.elapsedMs -is [decimal] -or $volume.elapsedMs -is [int] -or $volume.elapsedMs -is [long]) -and [double]::IsFinite([double]$volume.elapsedMs) -and $volume.elapsedMs -gt 0 -and $volume.elapsedMs -lt 120000)
 return $Receipt
}
function Read-HistoryWorkerRuntimeQualification {
 param([Parameter(Mandatory)][string]$ReceiptPath,[Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{64}$')][string]$ReceiptSha256,
       [Parameter(Mandatory)][string]$WorkerPath,[Parameter(Mandatory)][string]$SourceSha,[Parameter(Mandatory)][string]$SourceTree)
 foreach($path in @($ReceiptPath,$WorkerPath)){
  if(-not [IO.Path]::IsPathFullyQualified($path) -or $path.StartsWith('\\')){throw 'history_host_runtime_qualification_path_invalid'}
  $item=Get-Item -LiteralPath $path
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'history_host_runtime_qualification_path_invalid'}
  for($directory=$item.Directory;$null -ne $directory;$directory=$directory.Parent){if($directory.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'history_host_runtime_qualification_path_invalid'}}
 }
 if((Get-Item -LiteralPath $ReceiptPath).Length -gt 65536 -or (Get-FileHash -LiteralPath $ReceiptPath).Hash.ToLowerInvariant() -cne $ReceiptSha256){throw 'history_host_runtime_qualification_receipt_changed'}
 $receipt=Get-Content -LiteralPath $ReceiptPath -Raw|ConvertFrom-Json
 return Assert-HistoryWorkerRuntimeQualification -Receipt $receipt -WorkerSha256 (Get-FileHash -LiteralPath $WorkerPath).Hash.ToLowerInvariant() -SourceSha $SourceSha -SourceTree $SourceTree
}
Export-ModuleMember -Function Assert-HistoryWorkerRuntimeQualification,Read-HistoryWorkerRuntimeQualification
