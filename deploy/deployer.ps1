# Déploiement de l'Agence IA depuis Windows vers ton VPS.
# Utilisation (PowerShell, dans le dossier où se trouve agence-ia.tar.gz) :
#   powershell -ExecutionPolicy Bypass -File .\deployer.ps1 -Serveur 1.2.3.4 -Utilisateur root
param(
  [Parameter(Mandatory = $true)][string]$Serveur,
  [string]$Utilisateur = "root",
  [int]$Port = 22
)
$ErrorActionPreference = "Stop"
$archive = Join-Path $PSScriptRoot "agence-ia.tar.gz"
if (-not (Test-Path $archive)) { throw "agence-ia.tar.gz introuvable à côté de ce script." }
$cible = "$Utilisateur@$Serveur"

Write-Host "`n==> Envoi de l'application vers $cible" -ForegroundColor Cyan
scp -P $Port $archive "${cible}:/tmp/agence-ia.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "Envoi impossible (vérifie l'adresse, l'utilisateur et ta clé SSH)." }

Write-Host "`n==> Installation sur le serveur (tu vas saisir la clé API et le mot de passe admin)" -ForegroundColor Cyan
$sudo = if ($Utilisateur -eq "root") { "" } else { "sudo " }
$cmd = "set -e; ${sudo}mkdir -p /opt/agence-ia && ${sudo}tar -xzf /tmp/agence-ia.tar.gz -C /opt --overwrite && rm -f /tmp/agence-ia.tar.gz && cd /opt/agence-ia && ${sudo}bash deploy/install.sh"
ssh -t -p $Port $cible $cmd
if ($LASTEXITCODE -ne 0) { throw "L'installation a échoué : relis les messages ci-dessus." }
Write-Host "`nTerminé." -ForegroundColor Green
