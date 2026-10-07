$ErrorActionPreference = 'Stop'
$taskName = 'Arcus Attribution Update'
$script = Join-Path $PSScriptRoot 'update.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -File "' + $script + '"')
$trigger = @(New-ScheduledTaskTrigger -Daily -At '08:15'; New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Updates the independent local attribution database; never calls Arcus or Cloudflare.' -Force | Out-Null
Write-Output ('Installed: ' + $taskName)
