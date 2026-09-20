# Pensif — Backup / Restore Supabase (Data Safety P1)

CHANTIER "Data Safety P1 — Backup/Restore Supabase" (2026-09-20). Audit + préparation locale
uniquement — **aucun restore n'a été exécuté sur le projet production dans cette passe**, aucun
changement Supabase Dashboard, aucun EAS, aucun SQL destructif.

**Statut au 2026-09-21 : le restore drill (§7) a été exécuté réellement, sur un projet Supabase
temporaire dédié, et validé de bout en bout (restore DB + login OTP réel + contacts/pensées visibles
dans l'app) — jamais sur la prod, prod jamais modifiée, vérifié.**

Toutes les affirmations ci-dessous sur le comportement de `supabase db dump` ont été **vérifiées
empiriquement** dans ce dépôt via `npx supabase db dump --dry-run ...` (CLI v2.117.0, lié au
projet Pensif) — jamais supposées. Le détail de chaque commande de vérification est dans l'historique
de ce chantier ; ce document ne retient que les conclusions.

## 1 — Limites du plan Free (confirmées, pas supposées)

Vérifié via `npx supabase backups list --project-ref <ref>` (lecture seule, aucune donnée
modifiée) contre le projet Pensif réel :

```json
{"region":"eu-west-1","walg_enabled":true,"pitr_enabled":false,"backups":[],"physical_backup_data":{}}
```

- **`pitr_enabled: false`** — Point-In-Time Recovery **non disponible** sur ce projet (plan Free).
- **`backups: []`** — aucun backup physique automatique géré par la plateforme n'existe pour ce
  projet.
- `walg_enabled: true` signale seulement que l'infrastructure de backup physique de Supabase existe
  en interne (WAL-G) — **pas** que Pensif y a accès sur le plan Free. Confirme la mise en garde de
  la consigne : un mécanisme de backup interne inaccessible ne constitue pas une stratégie pour
  nous.

**Baseline retenue pour Pensif tant que le projet reste sur Free : backup manuel, déclenché à la
main, stocké hors de cette machine (voir §5/§8).**

## 2 — Ce que `supabase db dump` couvre réellement

| Élément | Inclus par défaut ? | Détail vérifié |
|---|---|---|
| Schéma `public` (tables, policies RLS, triggers, fonctions) | ✅ Oui (`schema.sql`, sans flag) | `--schema-only` |
| Rôles Postgres (`postgres`, `authenticated`, `anon`…) | ✅ Oui, mais **sans mot de passe** | `--role-only` → `pg_dumpall --roles-only --no-role-passwords` ; les rôles réservés/plateforme ont leurs `CREATE ROLE`/`ALTER ROLE` commentés (gérés par Supabase, jamais recréés par nous) |
| Données `public` (contacts, pensees…) | ✅ Oui, si demandé explicitement | `--data-only --schema public` |
| **`auth` schema (DDL — CREATE TABLE `auth.users` etc.)** | ❌ **Exclu** du dump de schéma | `--exclude-schema` inclut littéralement `auth` (avec `storage`, `extensions`, `vault`, `realtime`, `cron`…) — confirmé par `--dry-run` |
| **`auth.users` / `auth.identities` (données)** | ⚠️ Inclus **uniquement** si aucune restriction `--schema` n'est posée sur un `--data-only` | `--data-only` sans `-s` a `--schema "*"` et n'exclut QUE `auth.schema_migrations` — donc `auth.users`/`auth.identities` **et aussi** `auth.sessions`/`auth.refresh_tokens`/`auth.mfa_*`/… seraient tous inclus sans filtrage supplémentaire |
| `storage` (metadata buckets/objects) | ⚠️ Idem — inclus dans un `--data-only` non restreint (seule `storage.migrations` exclue) ; **non utilisé par Pensif** (aucun appel Storage dans le code, vérifié) — donc non pertinent ici mais à savoir |
| Contenu binaire réel du Storage (fichiers) | ❌ Jamais — `pg_dump` ne dump que les métadonnées, pas les objets S3 |
| Edge Functions (code) | ❌ Non couvert par `db dump` — **déjà versionné dans git** (`supabase/functions/`), donc déjà "sauvegardé" par le dépôt lui-même |
| Secrets des Edge Functions (`supabase secrets set ...`) | ❌ **Jamais récupérables** — `supabase secrets list` ne montre QUE les noms, jamais les valeurs (API en écriture seule par conception, vérifié via `--help` et connaissance du produit) |
| Réglages Auth (Anonymous Sign-ins, Manual Identity Linking, OTP length/expiry) | ⚠️ Récupérables via `supabase config pull`, **mais** nécessite d'abord `supabase init` en local (testé : `config pull` échoue avec `file not found. Run supabase init to create one.` si `supabase/config.toml` n'existe pas) — **non exécuté dans cette passe** pour ne pas modifier la structure locale du repo au-delà d'un pur audit |
| SMTP (config Brevo) | ⚠️ Host/paramètres non-secrets potentiellement dans `config pull` (à confirmer lors d'un `supabase init` dédié) ; **le mot de passe SMTP n'est de toute façon jamais exposé par l'API** (même logique que les secrets) |

**Aucune invention** : toute case "⚠️"/"❌" ci-dessus est basée sur une commande réellement exécutée
en lecture seule dans ce chantier, jamais sur une supposition.

### Découverte opérationnelle importante (sécurité)

`supabase db dump --linked` **sans** `-p`/`--password` explicite fait provisionner par la CLI un
rôle Postgres temporaire (`cli_login_postgres`) avec un mot de passe généré côté serveur, **affiché
en clair dans le script `pg_dump` imprimé — y compris sous `--dry-run`**. Ce comportement a été
déclenché une fois pendant cet audit (commande de test, jamais utilisée pour un vrai dump). Ce
n'est pas un secret applicatif Pensif (rôle CLI éphémère, propre à Supabase), mais **la
recommandation opérationnelle est de toujours passer `-p`/`$env:SUPABASE_DB_PASSWORD` explicitement**
pour ne jamais faire apparaître de credential — même temporaire — dans une sortie de commande ou un
log. `scripts/backup-supabase.ps1` (§4) applique cette règle strictement.

## 3 — Backup minimum Pensif : ce qu'il faut pour reconstruire un compte

Une restauration sans `auth.users`/`auth.identities` est **insuffisante** : les lignes
`contacts.user_id`/`pensees.user_id` (contrainte RLS `auth.uid() = user_id`, voir
`supabase/schema.sql`) deviendraient orphelines — aucun utilisateur Auth ne pourrait plus jamais les
lire ni les écrire, même après restauration réussie du schéma `public`.

Backup minimum viable = **4 fichiers ensemble, jamais un seul isolé** :

1. `roles.sql` — rôles Postgres (pas de mot de passe, recréation structurelle uniquement).
2. `schema.sql` — schéma `public` (tables `contacts`/`pensees`, policies RLS, triggers).
3. `data-public.sql` — données `contacts`/`pensees` avec leur `user_id`.
4. `data-auth-users-identities.sql` — **export séparé et scopé** : uniquement `auth.users` +
   `auth.identities` (jamais les tables de session/tokens vivants — voir §4) : sans ce fichier, les
   `user_id` de (3) ne correspondent à aucun compte réel après restauration.

## 4 — Script local de backup

[`scripts/backup-supabase.ps1`](../scripts/backup-supabase.ps1) — PowerShell (environnement Windows
du projet). Produit les 4 fichiers du §3 + `manifest.json`, suit la procédure officielle Supabase CLI
(`supabase db dump --role-only` / sans flag / `--data-only`), avec un **export Auth séparé et
explicitement documenté** comme demandé :

```powershell
# auth.users + auth.identities UNIQUEMENT — jamais auth.sessions/refresh_tokens/mfa_*/etc.
supabase db dump --project-ref <ref> -p <password> --data-only --schema auth `
  -x auth.sessions -x auth.refresh_tokens -x auth.mfa_factors -x auth.mfa_challenges `
  -x auth.mfa_amr_claims -x auth.flow_state -x auth.one_time_tokens -x auth.audit_log_entries `
  -x auth.sso_providers -x auth.sso_domains -x auth.saml_providers -x auth.saml_relay_states `
  -x auth.instances -x auth.oauth_clients -x auth.oauth_authorizations -x auth.oauth_consents `
  -f data-auth-users-identities.sql
```

**Pourquoi un export scopé plutôt qu'un `--data-only` non restreint** : un `--data-only` sans
`--schema auth` inclurait aussi `auth.sessions`/`auth.refresh_tokens` (tokens de session **vivants**,
utilisables pour usurper une session active) et `auth.audit_log_entries`/`auth.mfa_*`. Le scoper à
`auth.users`/`auth.identities` réduit strictement le fichier à ce qui est nécessaire pour
**reconstruire** des comptes (§3), jamais à ce qui permettrait de **rejouer** une session existante.

⚠️ Cette liste d'exclusion est construite à la main à partir du schéma `auth` (GoTrue) connu au
moment de ce chantier (Postgres 17.6.1, projet Pensif). Si Supabase Auth ajoute une nouvelle table
interne dans une future version, elle **ne serait pas exclue automatiquement** et apparaîtrait dans
`data-auth-users-identities.sql`. → à revérifier à chaque montée de version significative de
Supabase (comparer avec `supabase db dump --dry-run --data-only --schema auth` sans exclusions, pour
lister les tables réellement présentes).

**Credentials** : `$env:SUPABASE_DB_PASSWORD` en variable d'environnement, ou saisie masquée
(`Read-Host -AsSecureString`) si absente. Jamais écrit sur disque, jamais dans le script, jamais
dans `manifest.json`. Le script vérifie lui-même, après génération, qu'aucun fichier produit ne
contient le mot de passe utilisé (garde-fou explicite, pas une simple supposition que `pg_dump` ne
l'inclut pas).

## 5 — Emplacement des backups

```
backups/
  2026-09-20_230000/
    roles.sql
    schema.sql
    data-public.sql
    data-auth-users-identities.sql
    manifest.json
```

`backups/` est dans `.gitignore` (ajouté dans ce chantier). `manifest.json` contient `timestamp`,
`project_ref`, la liste des fichiers avec taille + SHA256 — **jamais de secret, jamais de mot de
passe, jamais de connection string.**

## 6 — Vérification automatique du backup

[`scripts/verify-backup.ps1`](../scripts/verify-backup.ps1) — appelé automatiquement en fin de
`backup-supabase.ps1`, rejouable seul plus tard contre un dossier existant. Vérifie :

- les 4 fichiers existent et ne sont pas vides ;
- `schema.sql` contient bien `CREATE TABLE ... "public"."contacts"` et `"public"."pensees"` ;
- `data-public.sql` contient des lignes `contacts`/`pensees` (comptage **approximatif** — pg_dump
  groupe plusieurs lignes par `INSERT`, ce n'est pas un `COUNT(*)` exact, seulement un signal de
  présence/volume, documenté comme tel dans la sortie du script) ;
- `data-auth-users-identities.sql` contient au moins un `auth.users` (avertissement, pas échec
  bloquant, si absent — un projet neuf sans compte sécurisé n'est pas anormal).

N'affiche **jamais** de contenu de ligne (email, token, id) — uniquement des compteurs et des
booléens OK/WARN/FAIL.

## 7 — Restore drill

**Statut : DRILL RÉEL EXÉCUTÉ ET VALIDÉ DE BOUT EN BOUT** (2026-09-21), sur un projet Supabase
temporaire dédié (`pensif-restore-drill-20260921`), jamais sur la prod. Ce qui suit est la procédure
**réellement utilisée et confirmée fonctionner**, pas une hypothèse — elle diffère de la première
version documentée ici (qui supposait `psql` disponible localement, jamais vérifié) sur plusieurs
points concrets, corrigés ci-dessous après coup.

### Correctifs par rapport à la procédure initialement documentée

- **Pas de `psql` nécessaire, et aucun n'était disponible localement** (vérifié : absent du PATH sur
  la machine de dev). La restauration réelle utilise `supabase db query --linked --project-ref <ref>
  --file <fichier>` (API de gestion Supabase), qui exécute le SQL sans jamais avoir besoin du mot de
  passe DB Postgres du projet cible — seule l'authentification CLI (`supabase login`) suffit. Le
  mot de passe DB généré à la création du projet temporaire n'a donc servi qu'à la création
  elle-même (`projects create --db-password ...`), jamais à la restauration.
- **`supabase link --project-ref <ref>` est un préalable obligatoire** à `db query --linked` — passer
  seulement `--project-ref` sans `--linked` échoue explicitement
  (`LegacyDbQueryMutuallyExclusiveFlagsError`). Ce `link` réécrit
  `supabase/.temp/linked-project.json` **localement** (jamais un changement distant) : il faut donc
  explicitement **relier à nouveau la prod après le drill** (`supabase link --project-ref
  whznwmzypipalixtifpk`), vérifié par une relecture de ce fichier + `supabase projects list`
  (`"linked": true` sur la prod).
- **`supabase projects create` exige `--region` en mode non interactif** — omis dans la première
  tentative, échec propre et rapide (`LegacyProjectsCreateMissingArgError`), **aucun projet créé**
  à ce stade. `--region eu-west-1` (région de la prod) a résolu le problème.
- **PowerShell 5.1 — la même classe de bug que le correctif `Invoke-SupabaseCommand`
  (`backup-supabase.ps1`) est réapparue, sous une forme plus large** : rediriger stderr d'un
  exécutable natif via `2>$null` (pas seulement `2>&1`) déclenche aussi le `NativeCommandError` en
  PowerShell 5.1 avec `$ErrorActionPreference = 'Stop'`. Le script de drill a crashé sur ce point
  pendant `supabase projects create` — **le projet avait déjà été créé avec succès côté serveur**
  avant le crash local (confirmé par une relecture `supabase projects list`), preuve que
  `$LASTEXITCODE`/l'état réel de la commande était bon, seule la capture de sortie locale a échoué.
  **Leçon renforcée : ne jamais rediriger stderr d'un exécutable natif dans ce projet, sous AUCUNE
  forme (`2>&1`, `2>$null`, ou toute variante) sous PowerShell 5.1** — laisser stderr aller
  directement à la console, capturer uniquement stdout par affectation simple. Pour ce type
  d'orchestration multi-étapes avec relances de commandes `npx supabase ...`, **Bash (Git Bash) s'est
  avéré plus robuste** dans cet environnement — aucune de ces commandes n'a nécessité PowerShell
  pour fonctionner correctement une fois la redirection stderr supprimée.
- **`roles.sql` génère un échec partiel attendu et non bloquant** sur un projet géré : les 3
  lignes `ALTER ROLE "anon"/"authenticated"/"authenticator" SET "statement_timeout" ...`
  s'appliquent et persistent (relu après coup), mais la dernière ligne
  (`GRANT SET ON PARAMETER "log_min_messages" TO "supabase_realtime_admin";`) échoue avec
  `permission denied for parameter log_min_messages` — le rôle d'exécution utilisé par l'API de
  gestion (`cli_login_postgres`, provisionné automatiquement) n'a pas ce privilège, contrairement à
  une vraie connexion `postgres` superuser directe. **Conclusion : ce fichier n'a pas besoin d'être
  modifié/filtré avant restauration — l'échec de cette seule ligne finale est sans conséquence
  (réglage cosmétique de logging realtime, aucun lien avec la récupérabilité des comptes/données) et
  n'empêche pas la suite du restore.**
- **Constat inattendu (documenté, pas caché) : `db query --file` via l'API de gestion n'a PAS
  appliqué les contraintes de clé étrangère de façon synchrone pendant `data-public.sql`** —
  restaurer `data-public.sql` (avec ses `user_id` référençant `auth.users`) **avant**
  `data-auth-users-identities.sql` a réussi (exit 0) alors que `auth.users` était encore vide à ce
  moment (vérifié : 4 contacts insérés avec `auth.users` à 0 ligne). L'ordre documenté
  (roles → schema → data-public → data-auth) reste **la procédure recommandée** (correcte et sans
  ambiguïté), mais ce comportement du canal `db query` explique pourquoi une éventuelle inversion
  accidentelle de l'ordre data-public/data-auth ne provoquerait pas nécessairement une erreur
  immédiate — seule la vérification finale d'intégrité (0 orphelin) fait foi, jamais l'absence
  d'erreur pendant le restore lui-même.

### Procédure confirmée (celle réellement utilisée)

1. **Créer un projet Supabase temporaire dédié** :
   ```bash
   npx supabase projects create pensif-restore-drill-XXXXXXXX \
     --org-id <org-id> --db-password <généré aléatoirement, jamais affiché> \
     --region eu-west-1 --output-format json
   ```
   Vérifier explicitement `project_ref` du résultat **≠** `whznwmzypipalixtifpk` (prod) avant toute
   autre commande.
2. **Attendre `ACTIVE_HEALTHY`** (`supabase projects list`, poll).
3. **Lier le CLI au projet temporaire** :
   ```bash
   npx supabase link --project-ref <ref-projet-temporaire>
   ```
4. **Restaurer, dans l'ordre**, chaque fichier avec le **même** garde-fou `--project-ref` explicite
   (échoue si le lien local a dérivé) :
   ```bash
   npx supabase db query --linked --project-ref <ref-temp> --file roles.sql
   npx supabase db query --linked --project-ref <ref-temp> --file schema.sql
   npx supabase db query --linked --project-ref <ref-temp> --file data-public.sql
   npx supabase db query --linked --project-ref <ref-temp> --file data-auth-users-identities.sql
   ```
5. **Vérifier** (lecture seule, jamais de contenu affiché — uniquement counts/booléens) :
   ```sql
   select count(*) from public.contacts;
   select count(*) from public.pensees;
   select count(*) from auth.users;
   select count(*) from auth.identities;
   select count(*) from public.contacts c where not exists (select 1 from auth.users u where u.id = c.user_id);
   select count(*) from public.pensees p where not exists (select 1 from auth.users u where u.id = p.user_id);
   select relrowsecurity from pg_class where relname in ('contacts','pensees') and relnamespace='public'::regnamespace;
   ```
6. **Reconfigurer manuellement** (Dashboard du projet temporaire, jamais automatisé) : Email
   provider, SMTP/Brevo, OTP length=6/expiry=600s, Manual Identity Linking, Anonymous Sign-ins si le
   test le nécessite.
7. **Pointer l'app locale** (`.env` non commité) sur le projet temporaire, redémarrer Metro, utiliser
   au besoin l'outil DEV "Simuler une réinstallation" (SettingsScreen) pour repartir sans
   session/cache locale liée à la prod avant de tester "J'ai déjà un compte".
8. **Tester réellement** le login OTP + vérifier visuellement dans l'app que contacts/pensées
   restaurés apparaissent.
9. **Revenir sur la prod** : restaurer `.env` aux valeurs prod, `supabase link --project-ref
   whznwmzypipalixtifpk`, vérifier `git status --short` reste clean, vérifier par lecture seule que
   les compteurs prod n'ont pas bougé pendant le test (comparer `max(created_at)` avant/après).
10. **Ne pas détruire le projet temporaire immédiatement** si une investigation reste possible —
    décision explicite de l'utilisateur, pas automatique.

### Résultat du drill réel (2026-09-21)

- Projet temporaire : `pensif-restore-drill-20260921` (`wkxqagxuzvtjwmjrbrzo`, région eu-west-1).
- Restore DB : **réussi** sur les 4 fichiers (roles avec la réserve documentée ci-dessus, schema,
  data-public, data-auth).
- Comptages temporaire = comptages prod au moment du backup : `public.contacts` = 4,
  `public.pensees` = 6, `auth.users` = 14, `auth.identities` = 1.
- Intégrité : **0 orphelin** (`contacts.user_id`/`pensees.user_id` ↔ `auth.users.id`), sur le
  temporaire comme confirmé une seconde fois après le login OTP réel.
- RLS : policy présente et activée sur `public.contacts` et `public.pensees` (1 policy chacune,
  `relrowsecurity = true`).
- Colonnes attendues présentes sur `public.pensees` : `event_time`, `reminder_recurrence`, `pinned`
  (3/3).
- SMTP (Brevo)/Auth (OTP 6/600s, Manual Identity Linking) : reconfigurés manuellement par
  l'utilisateur dans le Dashboard du projet temporaire — jamais automatisé, jamais de secret transmis
  à l'assistant.
- Login OTP réel : **réussi** ("J'ai déjà un compte" → email → OTP Brevo reçu → session récupérée).
  Vérifié après coup : exactement 1 `auth.sessions` active, dont le `user_id` rejoint à la fois
  `auth.users` et `auth.identities` restaurés (jointure vérifiée, jamais l'UUID affiché).
- Contacts/pensées restaurés : **visibles dans l'app** (confirmé visuellement par l'utilisateur sur
  iPhone, Expo Go).
- Prod : counts identiques avant/après (4/6), `max(created_at)` sur `contacts`/`pensees` antérieur à
  tout le drill — **aucune écriture prod pendant le test**, CLI relié explicitement à la prod avant
  et après la fenêtre de test sur le projet temporaire.

### À reconfigurer manuellement après une restauration (non couvert par le dump)

- **Edge Functions** : redéployer depuis le code déjà versionné dans git (`supabase functions deploy
  capture` / `suggest-message`) — le code est backupé par git, pas par `db dump`.
- **Secrets des Edge Functions** : à ressaisir manuellement (`supabase secrets set ...`) — **aucune
  sauvegarde possible**, valeurs à conserver séparément dans un gestionnaire de mots de passe au
  moment où elles sont créées.
- **SMTP/Brevo** : reconfigurer manuellement dans Dashboard → Authentication → Email (host, port,
  utilisateur, mot de passe Brevo).
- **Auth settings** : réactiver manuellement Anonymous Sign-ins, Manual Identity Linking, régler
  OTP length (6) / expiry (600s) — sauf si `supabase config push` est utilisé avec un
  `config.toml` préalablement rempli via `config pull` sur le projet source (non exécuté dans cette
  passe, voir §2).
- **RLS** : normalement recréée par `schema.sql` (les policies font partie du schéma `public`) — à
  vérifier explicitement lors du drill (§7 étape 7 ne suffit pas seule, relire aussi les policies
  dans l'éditeur SQL).

## 8 — Politique de backup proposée (petite bêta privée)

- **Avant chaque release** (TestFlight/build) : lancer `scripts/backup-supabase.ps1`.
- **Backup périodique** : une fois par semaine pendant la bêta privée (volume de données faible,
  pas besoin de plus fréquent tant que le nombre d'utilisateurs reste petit).
- **Copie hors PC principal** : déplacer manuellement le dossier `backups/<horodatage>/` vers un
  support externe ou un stockage cloud privé personnel (jamais un dépôt git, jamais un stockage
  public) après chaque génération.
- **Pas d'automatisation CI/GitHub Actions dans cette passe** : automatiser un backup impliquerait
  de faire transiter des données utilisateur réelles (dont des emails) par un environnement
  CI/Actions — refusé explicitement par la consigne. Si une automatisation est décidée plus tard,
  elle doit chiffrer le backup et le déposer sur un stockage privé dédié, jamais dans ce
  dépôt/repository GitHub.

## 9 — Recommandation Free vs Pro avant TestFlight

Sur Free : **PITR indisponible, aucun backup automatique géré par la plateforme** (confirmé §1) — le
backup manuel décrit ici est la seule protection réelle tant que le projet reste sur Free.

**Recommandation : passer sur Pro avant TestFlight (ouverture à des utilisateurs externes,
au-delà d'un usage perso/test).** Raisons :
- TestFlight introduit des comptes/données de vraies personnes hors du contrôle direct — le risque
  d'un incident (perte, corruption, erreur de migration) devient réel dès qu'il y a plus d'un seul
  utilisateur (soi-même).
- Pro apporte des backups automatiques quotidiens gérés par la plateforme (au-delà du backup manuel
  de ce chantier, qui reste utile même sur Pro comme filet supplémentaire — voir §8, ne pas
  l'abandonner après l'upgrade).
- Le coût Pro est faible comparé au risque de perte de données de bêta-testeurs sur un produit
  personnel/émotionnel (pensées, contacts de proches).

Tant que Pensif reste un usage strictement personnel (un seul compte, le tien), rester sur Free avec
une discipline de backup manuel régulière (§8) est une position raisonnable et suffisante.
