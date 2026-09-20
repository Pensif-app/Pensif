<#
.SYNOPSIS
  Pensif — vérifie qu'un dossier de backup Supabase (produit par backup-supabase.ps1) est
  utilisable, sans jamais afficher de secret/token/mot de passe.

.DESCRIPTION
  CHANTIER "Data Safety P1 — Backup/Restore" (2026-09-20), §6 ("Vérification du backup").
  Vérifie :
    - les fichiers attendus existent et ne sont pas vides ;
    - schema.sql contient bien les tables public.contacts / public.pensees ;
    - data-public.sql contient au moins la trace de ces deux tables (comptage de lignes
      APPROXIMATIF — pg_dump peut grouper plusieurs lignes dans un seul INSERT groupé, voir
      docs/backup-restore.md §2/§6 — ce n'est PAS un COUNT(*) exact, juste un signal de présence/
      volume) ;
    - data-auth-users-identities.sql doit exister et ne pas être vide (échec bloquant sinon, comme
      les 3 autres fichiers — voir §3 de docs/backup-restore.md : un backup sans export Auth ne
      permet pas de reconstruire un compte). Une fois le fichier présent, un compte permanent
      (auth.users) absent est en revanche un simple avertissement, pas un échec bloquant — un
      projet neuf sans compte sécurisé n'est pas en soi une anomalie.
  N'affiche JAMAIS le contenu des lignes (emails, ids, tokens) — uniquement des compteurs/booléens.
  Appelé automatiquement par backup-supabase.ps1 en fin de génération ; peut aussi être relancé
  seul plus tard contre un dossier de backup existant (ex. avant un restore drill).

.PARAMETER BackupDir
  Dossier du backup à vérifier (ex. backups\2026-09-20_230000).

.EXAMPLE
  ./scripts/verify-backup.ps1 -BackupDir backups/2026-09-20_230000
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $BackupDir)) {
  throw "Dossier de backup introuvable : $BackupDir"
}

$results = [ordered]@{}
$hardFailures = 0
$warnings = 0

function Test-FileNonEmpty {
  param([string]$Name)
  $path = Join-Path $BackupDir $Name
  if (-not (Test-Path $path)) {
    return @{ ok = $false; detail = 'absent' }
  }
  $size = (Get-Item $path).Length
  if ($size -le 0) {
    return @{ ok = $false; detail = 'vide (0 octet)' }
  }
  return @{ ok = $true; detail = "$size octets" }
}

# Compte APPROXIMATIF de lignes de données pour une table donnée dans un fichier INSERT groupé —
# jamais un COUNT(*) fiable, voir l'avertissement en tête de fichier. Ne lit/affiche aucune valeur
# de colonne, uniquement le nombre de lignes candidates.
function Get-ApproxRowCount {
  param([string]$FilePath, [string]$TableQualified)
  if (-not (Test-Path $FilePath)) { return -1 }
  $content = Get-Content -Raw -LiteralPath $FilePath
  $pattern = [regex]::Escape("INSERT INTO $TableQualified")
  $matches = [regex]::Matches($content, $pattern)
  if ($matches.Count -eq 0) { return 0 }
  # Heuristique : compte les lignes "(...)" qui suivent la 1re occurrence de l'INSERT jusqu'au ';'
  # terminal — approxime le nombre de tuples VALUES groupés par pg_dump --rows-per-insert.
  $idx = $content.IndexOf($matches[0].Value)
  $rest = $content.Substring($idx)
  $endIdx = $rest.IndexOf(');')
  if ($endIdx -lt 0) { return 1 } # une seule ligne, pas de regroupement détecté
  $block = $rest.Substring(0, $endIdx)
  $rowLines = [regex]::Matches($block, '(?m)^\s*\(')
  return [Math]::Max(1, $rowLines.Count)
}

Write-Host "Vérification du backup : $BackupDir"
Write-Host ''

# --- 1. Fichiers non vides ---
foreach ($f in @('roles.sql', 'schema.sql', 'data-public.sql', 'data-auth-users-identities.sql')) {
  $r = Test-FileNonEmpty -Name $f
  $results[$f] = $r
  if ($r.ok) {
    Write-Host "  OK   $f ($($r.detail))"
  } else {
    Write-Host "  FAIL $f — $($r.detail)"
    $hardFailures++
  }
}

# --- 2. Schéma contient les tables attendues ---
$schemaPath = Join-Path $BackupDir 'schema.sql'
if (Test-Path $schemaPath) {
  $schemaContent = Get-Content -Raw -LiteralPath $schemaPath
  $hasContactsTable = $schemaContent -match '(?i)CREATE TABLE[^\n]*"public"\."contacts"'
  $hasPenseesTable = $schemaContent -match '(?i)CREATE TABLE[^\n]*"public"\."pensees"'
  if ($hasContactsTable) { Write-Host '  OK   schema.sql contient public.contacts' } else { Write-Host '  FAIL schema.sql ne contient PAS public.contacts'; $hardFailures++ }
  if ($hasPenseesTable) { Write-Host '  OK   schema.sql contient public.pensees' } else { Write-Host '  FAIL schema.sql ne contient PAS public.pensees'; $hardFailures++ }
}

# --- 3. Données public : présence + comptage approximatif ---
$dataPublicPath = Join-Path $BackupDir 'data-public.sql'
if (Test-Path $dataPublicPath) {
  $contactsCount = Get-ApproxRowCount -FilePath $dataPublicPath -TableQualified '"public"."contacts"'
  $penseesCount = Get-ApproxRowCount -FilePath $dataPublicPath -TableQualified '"public"."pensees"'
  Write-Host "  INFO contacts (approx.) : $contactsCount ligne(s)"
  Write-Host "  INFO pensees  (approx.) : $penseesCount ligne(s)"
  if ($contactsCount -eq 0) { Write-Host '  WARN aucun contact dans le dump (peut être légitime sur un compte vide)'; $warnings++ }
  if ($penseesCount -eq 0) { Write-Host '  WARN aucune pensée dans le dump (peut être légitime sur un compte vide)'; $warnings++ }
}

# --- 4. Export Auth : au moins le compte sécurisé actuel ---
$dataAuthPath = Join-Path $BackupDir 'data-auth-users-identities.sql'
if (Test-Path $dataAuthPath) {
  $usersCount = Get-ApproxRowCount -FilePath $dataAuthPath -TableQualified '"auth"."users"'
  $identitiesCount = Get-ApproxRowCount -FilePath $dataAuthPath -TableQualified '"auth"."identities"'
  Write-Host "  INFO auth.users      (approx.) : $usersCount ligne(s)"
  Write-Host "  INFO auth.identities (approx.) : $identitiesCount ligne(s)"
  if ($usersCount -eq 0) {
    Write-Host "  WARN aucun compte permanent dans l'export Auth -- inattendu si un compte a deja ete securise"
    $warnings++
  }
} else {
  Write-Host '  WARN export Auth absent (data-auth-users-identities.sql manquant) — récupération après réinstallation NON garantie avec ce backup'
  $warnings++
}

Write-Host ''
if ($hardFailures -gt 0) {
  Write-Host "ÉCHEC — $hardFailures vérification(s) bloquante(s), $warnings avertissement(s)."
  exit 1
} elseif ($warnings -gt 0) {
  Write-Host "OK avec avertissements — $warnings avertissement(s), aucun échec bloquant."
  exit 0
} else {
  Write-Host 'OK — toutes les vérifications passent.'
  exit 0
}
