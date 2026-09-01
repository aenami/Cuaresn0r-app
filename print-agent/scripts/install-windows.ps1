param(
  [string]$TaskName = 'POS Print Agent'
)

$agentDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = (Get-Command node -ErrorAction Stop).Source
$entry = Join-Path $agentDir 'src\index.js'
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$entry`"" -WorkingDirectory $agentDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Agente USB ESC/POS del sistema POS' -Force
Start-ScheduledTask -TaskName $TaskName
Write-Output "Tarea '$TaskName' instalada e iniciada."
