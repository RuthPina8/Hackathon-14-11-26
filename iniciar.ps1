# Arranca AstroHealth desde ESTA carpeta (back + front) y abre el navegador.
# Uso: clic derecho -> "Ejecutar con PowerShell"
# Antes cierra lo que haya quedado corriendo en los puertos de la app, para no ver una versión vieja.

$raiz = $PSScriptRoot
Write-Host "Proyecto: $raiz" -ForegroundColor Cyan

# 1. Cerrar servidores viejos (back en 8000, front en 5173 a 5179)
$puertos = @(8000, 5173, 5174, 5175, 5176, 5177, 5178, 5179)
foreach ($p in $puertos) {
  $conexiones = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conexiones) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host "Cerrando $($proc.ProcessName) en el puerto $p" -ForegroundColor Yellow
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
Start-Sleep -Seconds 1

# 2. Back en su propia ventana
$back = "Set-Location '$raiz\api'; if (-not (Test-Path venv)) { python -m venv venv }; .\venv\Scripts\Activate.ps1; pip install -r requirements.txt; uvicorn main:app --reload --host 0.0.0.0 --port 8000"
Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $back

# 3. Front en su propia ventana, siempre en el puerto 5173
$front = "Set-Location '$raiz\web'; npm install; npm run dev -- --port 5173 --strictPort"
Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $front

# 4. Abrir la app cuando el front ya esté arriba
Write-Host "Esperando a que arranque el front..." -ForegroundColor Cyan
for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 2
  if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { break }
}
Start-Process "http://localhost:5173/"
Write-Host "Listo. Si ves la version vieja, presiona Ctrl + Shift + R en el navegador." -ForegroundColor Green
