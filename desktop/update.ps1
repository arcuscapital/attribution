$ErrorActionPreference = 'Stop'
$env:PYTHONPATH = $PSScriptRoot
$pythonCommand = (Get-Command python.exe -ErrorAction Stop).Source
& $pythonCommand -m arcus_attribution.app update
exit $LASTEXITCODE
