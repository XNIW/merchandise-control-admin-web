$ErrorActionPreference='Stop'
function Assert-HistoryServiceName([string]$Name){
 if($Name -cnotmatch '^MerchandiseControlHistoryWorker(?:\.QA\.[0-9a-f]{32})?$'){throw 'history_host_service_name_invalid'}
}
function Set-HistoryHostAcl {
 param([Parameter(Mandatory)][string]$Path,[Parameter(Mandatory)][Security.Principal.SecurityIdentifier]$ServiceSid,
       [Parameter(Mandatory)][Security.AccessControl.FileSystemRights]$Rights,[switch]$PublicRead)
 $item=Get-Item -LiteralPath $Path -Force
 if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'history_host_reparse_rejected'}
 $directory=$item.PSIsContainer
 $acl=if($directory){[Security.AccessControl.DirectorySecurity]::new()}else{[Security.AccessControl.FileSecurity]::new()}
 $acl.SetAccessRuleProtection($true,$false)
 $inherit=if($directory){[Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit}else{[Security.AccessControl.InheritanceFlags]::None}
 foreach($sid in @([Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))){
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
 }
 $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($ServiceSid,$Rights,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
 if($PublicRead){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545'),[Security.AccessControl.FileSystemRights]::ReadAndExecute,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))}
 Set-Acl -LiteralPath $Path -AclObject $acl
 & "$env:SystemRoot\System32\icacls.exe" $Path /setowner '*S-1-5-18' *> $null
 if($LASTEXITCODE -ne 0){throw 'history_host_owner_failed'}
}
function New-HistoryHostService {
 param([Parameter(Mandatory)][string]$Name,[Parameter(Mandatory)][string]$HostExe,[Parameter(Mandatory)][ref]$Created)
 Assert-HistoryServiceName $Name
 if(Get-Service -Name $Name -ErrorAction SilentlyContinue){throw 'history_host_service_already_exists'}
 if(-not [IO.Path]::IsPathFullyQualified($HostExe) -or -not (Test-Path -LiteralPath $HostExe -PathType Leaf)){throw 'history_host_binary_missing'}
 $binary='"'+$HostExe+'" --service-name "'+$Name+'"'
 $null=New-Service -Name $Name -BinaryPathName $binary -StartupType Manual -Description 'Scoped Getnet analysis worker; no financial commit or POS credentials.'
 $Created.Value=$true
 & "$env:SystemRoot\System32\sc.exe" sidtype $Name unrestricted *> $null
 if($LASTEXITCODE -ne 0){throw 'history_host_service_sid_failed'}
 $service=Get-CimInstance Win32_Service -Filter "Name='$Name'"
 # ChangeServiceConfig requires NULL (not an empty password) for virtual accounts.
 # https://learn.microsoft.com/windows/win32/api/winsvc/nf-winsvc-changeserviceconfigw
 $changed=Invoke-CimMethod -InputObject $service -MethodName Change -Arguments @{StartName="NT SERVICE\$Name";StartPassword=$null}
 if($changed.ReturnValue -ne 0){throw ('history_host_virtual_account_failed_'+[uint32]$changed.ReturnValue)}
 return [Security.Principal.SecurityIdentifier]([Security.Principal.NTAccount]::new('NT SERVICE',$Name).Translate([Security.Principal.SecurityIdentifier]))
}
function Set-HistoryHostParameters {
 param([Parameter(Mandatory)][string]$Name,[Parameter(Mandatory)][hashtable]$Values)
 Assert-HistoryServiceName $Name
 if(@($Values.Keys|Where-Object {$_ -cnotin @('NodePath','WorkerPath','SecretPath','GatewayUrl','WorkerSha256','NodeSha256','StatusPath')}).Count -ne 0 -or $Values.Count -ne 7){throw 'history_host_parameter_shape'}
 $path="HKLM:\SYSTEM\CurrentControlSet\Services\$Name\Parameters"
 $null=New-Item -Path $path -Force
 foreach($key in $Values.Keys){$null=New-ItemProperty -LiteralPath $path -Name $key -Value ([string]$Values[$key]) -PropertyType String -Force}
}
function Protect-HistoryHostSecret {
 param([Parameter(Mandatory)][string]$Name,[Parameter(Mandatory)][string]$Url,[Parameter(Mandatory)][byte[]]$SecretUtf8,[Parameter(Mandatory)][string]$Path)
 Assert-HistoryServiceName $Name
 if($SecretUtf8.Length -lt 32 -or $SecretUtf8.Length -gt 256 -or (Test-Path -LiteralPath $Path)){throw 'history_host_secret_shape'}
 Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
 $entropy=[Text.Encoding]::UTF8.GetBytes('MC.HistoryWorker.v1|'+$Name+'|'+$Url)
 $cipher=[Security.Cryptography.ProtectedData]::Protect($SecretUtf8,$entropy,[Security.Cryptography.DataProtectionScope]::LocalMachine)
 [IO.File]::WriteAllBytes($Path,$cipher)
}
Export-ModuleMember -Function Assert-HistoryServiceName,Set-HistoryHostAcl,New-HistoryHostService,Set-HistoryHostParameters,Protect-HistoryHostSecret
