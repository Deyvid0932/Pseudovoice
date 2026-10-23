param([switch]$Install)

$ErrorActionPreference = 'Stop'
$taskPython = Join-Path $PSScriptRoot 'venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) {
    & py -3.11 -m venv (Join-Path $PSScriptRoot 'venv')
    if ($LASTEXITCODE -ne 0) { throw 'Instala Python 3.11 o posterior para crear el entorno local.' }
    $Install = $true
}
Push-Location $PSScriptRoot
try {
    if ($Install) {
        & $taskPython -m pip install -e .
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias del motor de voz.' }
    }
    & $taskPython -m pseudovoice
    if ($LASTEXITCODE -ne 0) { throw 'El servicio de voz terminó con un error. Revisa los mensajes anteriores.' }
} finally {
    Pop-Location
}
