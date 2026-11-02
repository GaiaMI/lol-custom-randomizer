# Petit serveur local pour Rift Randomizer (aucune installation requise)
$port = 8080
$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() } catch {
  Write-Host "Le port $port est deja utilise. Ferme l'autre fenetre du serveur ou change `$port dans serveur.ps1." -ForegroundColor Red
  Read-Host "Appuie sur Entree pour fermer"; exit 1
}
Write-Host ""
Write-Host "  Rift Randomizer tourne sur http://localhost:$port" -ForegroundColor Yellow
Write-Host "  Laisse cette fenetre ouverte. Ferme-la pour arreter le site."
Write-Host ""
Start-Process "http://localhost:$port/"
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript'; '.css'='text/css'; '.png'='image/png'; '.webp'='image/webp'; '.ico'='image/x-icon' }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ($path -eq '') { $path = 'index.html' }
  $file = [IO.Path]::GetFullPath((Join-Path $root $path))
  if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $ct = $types[[IO.Path]::GetExtension($file).ToLower()]
    if (-not $ct) { $ct = 'application/octet-stream' }
    $ctx.Response.ContentType = $ct
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else { $ctx.Response.StatusCode = 404 }
  $ctx.Response.Close()
}
