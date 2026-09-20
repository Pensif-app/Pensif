<#
.SYNOPSIS
  Pensif — backup local manuel du projet Supabase (P1 Data Safety, plan Free : pas de PITR).

.DESCRIPTION
  CHANTIER "Data Safety P1 — Backup/Restore" (2026-09-20). Voir docs/backup-restore.md pour
  l'audit complet (ce qui est/n'est pas couvert, stratégie Auth, restore drill, checklist Dashboard
  post-restauration, recommandation Free vs Pro).

  Produit, sous backups/<horodatage>/ (dossier IGNORÉ par git, voir .gitignore) :
    - roles.sql                        (pg_dumpall --roles-only, sans mots de passe de rôle)
    - schema.sql                       (schéma public + schémas non internes — exclut
                                         auth/storage/extensions/vault : comportement NATIF de
                                         `supabase db dump`, vérifié par --dry-run, jamais un choix
                                         de ce script)
    - data-public.sql                  (données du schéma public UNIQUEMENT : contacts, pensees…)
    - data-auth-users-identities.sql   (export SÉPARÉ, SCOPÉ à auth.users + auth.identities
                                         UNIQUEMENT — jamais les sessions/refresh tokens/MFA/etc.,
                                         voir la liste d'exclusion ci-dessous et docs/backup-restore.md
                                         §2/§4 pour pourquoi une table ajoutée par une future version
                                         de Supabase Auth pourrait échapper à cette liste)
    - manifest.json                    (horodatage, project_ref, fichiers, tailles, SHA256 —
                                         JAMAIS de secret)

  Lance ensuite automatiquement scripts/verify-backup.ps1 sur le dossier produit (§6).

  Sécurité credentials (respecté strictement) :
    - le mot de passe DB n'est JAMAIS écrit sur disque, ni dans ce script, ni dans manifest.json ;
    - il vient de $env:SUPABASE_DB_PASSWORD, ou d'un prompt sécurisé (SecureString) si absent ;
    - aucune connection string complète n'est jamais construite/affichée/journalisée par ce script.

.PARAMETER ProjectRef
  Project ref Supabase. Par défaut, lu depuis supabase/.temp/project-ref (déjà lié localement via
  `supabase link` — ce fichier est lui-même ignoré par git, voir .gitignore existant).

.EXAMPLE
  $env:SUPABASE_DB_PASSWORD = '...'   # jamais collé dans un fichier
  ./scripts/backup-supabase.ps1

.EXAMPLE
  ./scripts/backup-supabase.ps1 -ProjectRef abcdefghijklmnopqrst
  # (prompt sécurisé pour le mot de passe si $env:SUPABASE_DB_PASSWORD est absent)
#>
param(
  [string]$ProjectRef
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $ProjectRef) {
  $refFile = Join-Path $repoRoot 'supabase\.temp\project-ref'
  if (Test-Path $refFile) {
    $ProjectRef = (Get-Content -Raw -LiteralPath $refFile).Trim()
  }
}
if (-not $ProjectRef) {
  throw "Project ref introuvable. Passe -ProjectRef <ref>, ou lie le projet localement (supabase link --project-ref <ref>)."
}

$dbPassword = $env:SUPABASE_DB_PASSWORD
if (-not $dbPassword) {
  $secure = Read-Host -Prompt 'Mot de passe DB Supabase (saisie masquée, jamais écrite sur disque)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $dbPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}
if (-not $dbPassword) {
  throw "Mot de passe DB vide — abandon (aucun fichier n'a été créé)."
}

$timestamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$backupRoot = Join-Path $repoRoot 'backups'
$backupDir = Join-Path $backupRoot $timestamp
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Write-Host "Pensif — backup Supabase -> $backupDir"
Write-Host "Project ref : $ProjectRef"
Write-Host ''

# CORRECTIF COMPATIBILITÉ POWERSHELL 5.1 (2026-09-20) — helper CENTRAL pour tout appel natif
# Supabase/npx, utilisé identiquement pour role-only/schema/data-public/data-auth. Le premier
# backup réel s'arrêtait immédiatement sur "NativeCommandError" alors que `supabase db dump`
# réussissait réellement : la CLI Supabase écrit ses messages de progression ("Dumping roles from
# remote database...") sur STDERR, un comportement NORMAL — jamais une erreur en soi.
#
# Cause exacte : `2>&1` fusionnait stderr dans le pipeline PowerShell. En PowerShell 5.1, CHAQUE
# ligne stderr d'un exécutable natif ainsi fusionnée est enveloppée en ErrorRecord
# (NativeCommandError) — et avec `$ErrorActionPreference = 'Stop'` (portée script), cette
# enveloppe suffit À ELLE SEULE à interrompre le script immédiatement, AVANT même d'atteindre la
# vérification de `$LASTEXITCODE`. Le vrai code de sortie du process (souvent 0, succès réel)
# n'était jamais consulté.
#
# Correctif : ne JAMAIS rediriger stderr d'un exécutable natif via `2>&1` dans ce script. stdout ET
# stderr filent directement vers la console (progression Supabase visible telle quelle, jamais
# masquée) — `$LASTEXITCODE` reste la SEULE autorité de succès/échec, exactement comme demandé :
# exit 0 = succès même si stderr contient des messages de progression ; exit != 0 = échec réel, on
# s'arrête (`throw`). Aucune vraie erreur n'est masquée par ce changement — au contraire, avant ce
# correctif, une vraie erreur (exit != 0) ET une simple ligne de progression stderr produisaient la
# MÊME exception PowerShell générique, sans distinction.
function Invoke-SupabaseCommand {
  param([string[]]$Arguments, [string]$Label, [string]$OutFile)
  Write-Host "  - $Label..."
  & npx @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label a échoué (exit $LASTEXITCODE) — voir la sortie ci-dessus pour le détail réel de l'erreur."
  }
  if ($OutFile) {
    if (-not (Test-Path $OutFile) -or (Get-Item $OutFile).Length -le 0) {
      throw "$Label : fichier absent ou vide après exécution ($OutFile), alors que exit code = 0 — situation anormale à investiguer manuellement."
    }
  }
}

try {
  $baseArgs = @('supabase', 'db', 'dump', '--project-ref', $ProjectRef, '-p', $dbPassword)

  # 1. Rôles — pg_dumpall --roles-only, --no-role-passwords côté CLI Supabase (confirmé via
  #    `supabase db dump --dry-run --role-only`) : aucun mot de passe de rôle dans ce fichier.
  $rolesFile = Join-Path $backupDir 'roles.sql'
  Invoke-SupabaseCommand -Arguments ($baseArgs + @('--role-only', '-f', $rolesFile)) -OutFile $rolesFile -Label 'Rôles (roles.sql)'

  # 2. Schéma — comportement natif : exclut auth/storage/extensions/vault/etc. (schémas gérés par
  #    la plateforme Supabase, voir docs/backup-restore.md §2). Couvre public.contacts/public.pensees
  #    + les policies RLS qui leur sont attachées.
  $schemaFile = Join-Path $backupDir 'schema.sql'
  Invoke-SupabaseCommand -Arguments ($baseArgs + @('-f', $schemaFile)) -OutFile $schemaFile -Label 'Schéma (schema.sql)'

  # 3. Données — schéma public UNIQUEMENT (jamais mélangées à auth/storage dans ce fichier, pour
  #    garder data-public.sql non sensible du point de vue "secrets de session").
  $dataPublicFile = Join-Path $backupDir 'data-public.sql'
  Invoke-SupabaseCommand -Arguments ($baseArgs + @('--data-only', '--schema', 'public', '-f', $dataPublicFile)) -OutFile $dataPublicFile -Label 'Données publiques (data-public.sql)'

  # 4. Export SÉPARÉ et SCOPÉ de l'Auth — UNIQUEMENT auth.users + auth.identities (jamais les
  #    sessions/refresh tokens vivants ni MFA/SSO/SAML/OAuth/flow_state/audit_log — ces tables
  #    contiennent des secrets de session, volontairement exclues ici). Si Supabase Auth ajoute une
  #    nouvelle table interne non listée ci-dessous, elle serait incluse par erreur dans ce fichier —
  #    voir docs/backup-restore.md §2 pour la procédure de revérification périodique de cette liste.
  $authExcludeTables = @(
    'auth.sessions', 'auth.refresh_tokens', 'auth.mfa_factors', 'auth.mfa_challenges',
    'auth.mfa_amr_claims', 'auth.flow_state', 'auth.one_time_tokens', 'auth.audit_log_entries',
    'auth.sso_providers', 'auth.sso_domains', 'auth.saml_providers', 'auth.saml_relay_states',
    'auth.instances', 'auth.oauth_clients', 'auth.oauth_authorizations', 'auth.oauth_consents'
  )
  $dataAuthFile = Join-Path $backupDir 'data-auth-users-identities.sql'
  $authArgs = $baseArgs + @('--data-only', '--schema', 'auth')
  foreach ($t in $authExcludeTables) { $authArgs += @('-x', $t) }
  $authArgs += @('-f', $dataAuthFile)
  Invoke-SupabaseCommand -Arguments $authArgs -OutFile $dataAuthFile -Label 'Données Auth — users + identities (data-auth-users-identities.sql)'

  # --- Garde-fou : le mot de passe DB ne doit JAMAIS apparaître dans un fichier produit (pg_dump ne
  #     l'inclut normalement pas, mais on vérifie explicitement plutôt que de le supposer). ---
  Write-Host ''
  Write-Host 'Vérification anti-fuite (mot de passe DB absent des fichiers produits)...'
  Get-ChildItem -Path $backupDir -Filter '*.sql' | ForEach-Object {
    $content = Get-Content -Raw -LiteralPath $_.FullName
    if ($content.Contains($dbPassword)) {
      throw "ALERTE : le mot de passe DB apparaît dans $($_.Name) — backup supprimé par précaution."
    }
  }
  Write-Host '  OK   aucun mot de passe DB détecté dans les fichiers produits'

  # --- manifest.json — jamais de secret, uniquement métadonnées + hashes ---
  $files = Get-ChildItem -Path $backupDir -Filter '*.sql' | ForEach-Object {
    [ordered]@{
      name   = $_.Name
      bytes  = $_.Length
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
    }
  }
  $manifest = [ordered]@{
    timestamp   = (Get-Date).ToString('o')
    project_ref = $ProjectRef
    files       = $files
  }
  $manifestPath = Join-Path $backupDir 'manifest.json'
  ($manifest | ConvertTo-Json -Depth 5) | Out-File -LiteralPath $manifestPath -Encoding utf8
  Write-Host "  OK   manifest.json écrit ($manifestPath)"

  Write-Host ''
  Write-Host 'Backup terminé, lancement de la vérification automatique (§6)...'
  Write-Host ''
  & (Join-Path $PSScriptRoot 'verify-backup.ps1') -BackupDir $backupDir
  $verifyExit = $LASTEXITCODE

  Write-Host ''
  Write-Host "Backup produit dans : $backupDir"
  Write-Host 'Rappel : ce dossier contient des données utilisateur réelles (dont des emails, via auth.users) — ne JAMAIS le commiter (voir .gitignore), le partager en clair, ni le déposer sur un stockage public.'

  exit $verifyExit
} finally {
  # Le mot de passe ne vit qu'en mémoire process le temps du script — jamais écrit sur disque, jamais
  # dans l'historique de ce script (variable locale uniquement, jamais journalisée).
  $dbPassword = $null
}
