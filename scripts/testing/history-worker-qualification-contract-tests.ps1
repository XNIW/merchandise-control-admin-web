#Requires -Version 7.4
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot '../../tools/PaymentHistoryWorker/windows/WorkerQualification.psm1') -Force
# In-memory unit inputs only. No qualification receipt/artifact is emitted and
# this test never authorizes packaging, deployment, SCM or a linked project.
$source='a'*40;$tree='b'*40;$worker='c'*64
function InputObject {
 [pscustomobject]@{schema='history-worker-runtime-qualification-v2';protocol='stage_vector_v2';nodeVersion='v24.18.0';sourceSha=$source;sourceTree=$tree;workerSha256=$worker;artifactId='123';artifactArchiveSha256=('d'*64);
  canonicalSql=[pscustomobject]@{status='PASS';sourceSha=$source;runId='456';reportSha256=('e'*64)};
  realVolume=[pscustomobject]@{status='PASS';sourceSha=$source;runId='789';reportSha256=('f'*64);workerSha256=$worker;syntheticOnly=$true;sqlReal=$true;realGateway=$true;gatewayRuntime='node24-native-route-adapter';sqlRuntime='postgres-postgrest-owned-fixture';rows=25947;movementBytes=20274917;analysisBudgetMs=120000;requestBudgetMs=15000;canonicalRowLimit=200;vectorChunkLimit=4;elapsedMs=1000}}
}
function Check($value){Assert-HistoryWorkerRuntimeQualification -Receipt $value -WorkerSha256 $worker -SourceSha $source -SourceTree $tree}
$cases=0
$null=Check (InputObject);$cases++
foreach($mutate in @(
 {$args[0].schema='history-worker-runtime-qualification-v1'},
 {$args[0].sourceSha='0'*40},{$args[0].sourceTree='0'*40},{$args[0].workerSha256='0'*64},
 {$args[0].artifactId=''},{$args[0].artifactArchiveSha256=''},
 {$args[0].canonicalSql.status='NOT_RUN'},{$args[0].canonicalSql.sourceSha='0'*40},{$args[0].canonicalSql.reportSha256=''},
 {$args[0].realVolume.status='FAIL'},{$args[0].realVolume.sqlReal=$false},{$args[0].realVolume.realGateway=$false},
 {$args[0].realVolume.workerSha256='0'*64},{$args[0].realVolume.elapsedMs=120000},{$args[0].realVolume.elapsedMs=[double]::NaN},
 {$args[0].realVolume.analysisBudgetMs=180000},{$args[0].realVolume.canonicalRowLimit=800},{$args[0].realVolume.vectorChunkLimit=5},
 {$args[0].realVolume.rows=5},{$args[0].realVolume.rows='25947'},{$args[0].realVolume.sqlReal='true'},
 {$args[0].realVolume.gatewayRuntime='workerd'},{$args[0].realVolume.sqlRuntime='mock'}
)){
 $value=InputObject;& $mutate $value;$rejected=$false
 try{$null=Check $value}catch{if($_.Exception.Message -cne 'history_host_runtime_qualification_invalid'){throw};$rejected=$true}
 if(-not $rejected){throw 'history_host_qualification_negative_not_rejected'};$cases++
}
Write-Output ('HISTORY_WORKER_QUALIFICATION_CONTRACT_CASES='+$cases)
