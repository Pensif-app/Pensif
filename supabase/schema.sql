-- Schéma Pensif — à exécuter dans l'éditeur SQL de ton projet Supabase.
-- Une fois appliqué, l'app pourra être branchée dessus (voir src/lib/supabase.ts et le README).
--
-- Si ta table "contacts" existe déjà (tu as déjà exécuté une version précédente de ce fichier),
-- les "create table if not exists" ci-dessous ne rejoueront pas les nouvelles colonnes. Lance
-- plutôt cette ligne une fois dans l'éditeur SQL pour la mettre à jour :
--   alter table contacts add column if not exists favorite boolean default false;
--   alter table pensees add column if not exists custom_offset_minutes integer;
--   alter table contacts add column if not exists quiz jsonb;
--   alter table contacts drop column if exists q1, drop column if exists q2, drop column if exists q3;
--   alter table contacts add column if not exists family_role text;
--   alter table contacts add column if not exists genre text;
--   alter table pensees add column if not exists end_date date;
--   alter table contacts add column if not exists birthday_reminder_days integer;
--
-- CHANTIER PENSÉES V2 — migration à exécuter avant de créer/modifier la moindre pensée depuis une
-- version de l'app postérieure à ce chantier (voir le rapport de chantier pour le détail) :
--   alter table pensees alter column date_evenement drop not null;
--   alter table pensees add column if not exists reminder_at timestamptz;
--   update pensees set reminder_at = case
--     when remind_offset = 'custom' and custom_offset_minutes is not null then
--       (date_evenement::timestamp + time '23:59:59') - (custom_offset_minutes || ' minutes')::interval
--     when remind_offset is not null and date_evenement is not null then
--       (date_evenement::timestamp + time '09:00:00') - (remind_offset || ' days')::interval
--     else null
--   end
--   where reminder_at is null and date_evenement is not null;
--   alter table pensees drop column if exists remind_offset;
--   alter table pensees drop column if exists custom_offset_minutes;
--
-- CORRECTIF post-CHANTIER PENSÉES V2 : si ta base a été créée/migrée AVANT que la ligne 13
-- ("alter table pensees add column if not exists end_date date;") n'ait jamais été exécutée, la
-- colonne `end_date` peut manquer même après la migration ci-dessus — insertPenseeRemote/
-- updatePenseeRemote (supabaseRepo.ts) l'envoient TOUJOURS dans leur payload (nécessaire aux
-- périodes du Calendrier), ce qui échoue avec `PGRST204: Could not find the 'end_date' column`.
-- Vérifie sa présence (`select end_date from pensees limit 1;`) et si besoin :
--   alter table pensees add column if not exists end_date date;
--
-- CHANTIER "sécuriser le cycle Capture" (2026-09-14) — protection serveur invisible contre l'abus de
-- Capture Intelligente (5 captures/minute, 20/heure, 100/mois, jamais exposé au client). Si ta base
-- existe déjà, exécute simplement tout le bloc `capture_events` / `register_capture_usage` plus bas
-- (idempotent : `create table if not exists`, `create or replace function`). Rien à migrer sur les
-- tables existantes.
--
-- CHANTIER PENSÉES V3 (2026-09-16) — épingler une pensée (purement organisationnel, ne modifie
-- jamais date/endDate/reminderAt) :
--   alter table pensees add column if not exists pinned boolean default false;
--
-- CHANTIER "Réponses intelligentes" (2026-09-16) — protection anti-abus DÉDIÉE à l'Edge Function
-- `suggest-message`, totalement séparée de `capture_events`/`register_capture_usage` (table, fonction
-- et espace de verrou consultatif distincts — voir bloc `message_suggestion_events` plus bas).
-- Rafale courte uniquement (5/minute, 20/heure) — AUCUN plafond mensuel pour l'instant, décision
-- produit explicite : mesurer coût/usage réel avant d'en fixer un. Si ta base existe déjà, exécute
-- simplement le bloc `message_suggestion_events` / `register_message_suggestion_usage` plus bas
-- (idempotent, comme le bloc `capture_events`).

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prenom text not null,
  nom text default '',
  tel text default '',
  date_naissance date not null,
  relation text default '',
  -- Précision du lien familial (Père, Mère, Grand-mère…) quand relation = 'Famille'.
  family_role text,
  -- 'homme' | 'femme' | null — sert à accorder les questions du quiz (il/elle).
  genre text,
  -- Profil du Petit Quiz (réponses A/B, centres d'intérêt, à éviter, souhait libre, budget) —
  -- remplace les 3 anciennes colonnes q1/q2/q3 en texte libre.
  quiz jsonb,
  gift_sent boolean default false,
  favorite boolean default false,
  -- Rappel avant l'anniversaire, en jours (1 = la veille, 7 = J-7…) — null tant que non réglé.
  -- L'alerte du jour J, elle, est toujours envoyée quel que soit ce réglage (voir notifications.ts).
  birthday_reminder_days integer,
  created_at timestamptz default now()
);

create table if not exists pensees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  -- Ancre calendrier facultative depuis CHANTIER PENSÉES V2 (une pensée n'a plus besoin d'être
  -- rattachée à un jour précis) — nullable, renseignée seulement pour une pensée créée depuis le
  -- Calendrier (jour choisi, ou début de période).
  date_evenement date,
  -- Renseigné uniquement pour une pensée de période (surlignage type "Vacances en Italie").
  end_date date,
  texte text not null,
  -- Date/heure ABSOLUE et autonome du rappel, ou NULL = aucun rappel (entièrement facultatif
  -- depuis CHANTIER PENSÉES V2) — remplace l'ancien couple remind_offset/custom_offset_minutes qui
  -- dérivait toujours un rappel relatif à date_evenement.
  reminder_at timestamptz,
  created_at timestamptz default now(),
  -- CHANTIER PENSÉES V3 — épingle une pensée en haut de l'écran Pensées, purement organisationnel :
  -- ne modifie jamais date_evenement/end_date/reminder_at.
  pinned boolean default false
);

alter table contacts enable row level security;
alter table pensees enable row level security;

create policy "Un utilisateur gère ses propres contacts"
  on contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Un utilisateur gère ses propres pensées"
  on pensees for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- CHANTIER "sécuriser le cycle Capture" — protection serveur INVISIBLE (jamais affichée comme un
-- quota côté client, voir supabase/functions/capture/rateLimit.ts et index.ts) : 5 captures/minute,
-- 20/heure (fenêtres glissantes), 100/mois (mois civil). Une ligne = une capture qui a réellement
-- franchi ce contrôle et est entrée dans le pipeline IA payant (Groq/OpenAI) — pas un simple tap sur
-- le bouton micro, et le compteur avance MÊME si le provider échoue ensuite (protection des coûts
-- avant tout, décision assumée). Pas de purge/cron pour l'instant — envisageable plus tard (~40
-- jours) si la table grossit trop, pas nécessaire au fonctionnement.
create table if not exists capture_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists capture_events_user_created_idx
  on capture_events (user_id, created_at desc);

alter table capture_events enable row level security;
-- AUCUNE policy créée volontairement : ni un client anonyme ni un utilisateur authentifié ne peut
-- lire/écrire cette table directement (RLS activée + aucune règle = accès refusé par défaut). Seul
-- `service_role` (utilisé exclusivement par l'Edge Function `capture`, jamais exposé au client
-- mobile) peut y accéder, car `service_role` contourne RLS par nature côté Postgres/PostgREST.

-- Fonction RPC ATOMIQUE : vérifie les 3 seuils ET enregistre la capture en une seule opération,
-- protégée par un verrou consultatif PAR UTILISATEUR (`pg_advisory_xact_lock`, relâché automatiquement
-- à la fin de la transaction implicite de cet appel). Deux appels concurrents du MÊME utilisateur se
-- sérialisent donc ici (l'un attend que l'autre ait fini de compter ET d'insérer avant de compter à
-- son tour) — sans cette sérialisation, deux requêtes simultanées pourraient toutes les deux lire un
-- compte sous le seuil puis insérer, dépassant la limite réelle ("check-then-act" non atomique). Deux
-- utilisateurs différents ne se bloquent jamais entre eux (hash différent par utilisateur).
-- Retourne : 'ok' | 'rate_limit_minute' | 'rate_limit_hour' | 'monthly_cap' — jamais un chiffre de
-- seuil, jamais un compteur restant (voir CAPTURE_USAGE_ERROR_CODE côté Edge Function pour le
-- mapping en code structuré renvoyé au client).
create or replace function register_capture_usage(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minute_count integer;
  v_hour_count integer;
  v_month_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select count(*) into v_minute_count from capture_events
    where user_id = p_user_id and created_at >= now() - interval '1 minute';
  if v_minute_count >= 5 then
    return 'rate_limit_minute';
  end if;

  select count(*) into v_hour_count from capture_events
    where user_id = p_user_id and created_at >= now() - interval '1 hour';
  if v_hour_count >= 20 then
    return 'rate_limit_hour';
  end if;

  select count(*) into v_month_count from capture_events
    where user_id = p_user_id
      and date_trunc('month', created_at) = date_trunc('month', now());
  if v_month_count >= 100 then
    return 'monthly_cap';
  end if;

  insert into capture_events (user_id) values (p_user_id);
  return 'ok';
end;
$$;

-- Exécution restreinte à service_role UNIQUEMENT — ni anon ni authenticated ne peuvent appeler cette
-- fonction directement (même si SECURITY DEFINER lui donne les droits du créateur en interne), le
-- client mobile ne doit jamais pouvoir déclencher/contourner ce contrôle lui-même.
--
-- CORRECTIF (2026-09-16, audit pré-déploiement "Réponses intelligentes") — `revoke ... from public`
-- SEUL est INSUFFISANT sur ce projet : des privilèges par défaut (`pg_default_acl`, posés par
-- `postgres`/`supabase_admin` sur le schéma `public`) accordent automatiquement EXECUTE à `anon` ET
-- `authenticated` sur TOUTE nouvelle fonction créée — un octroi DIRECT par rôle, jamais annulé par un
-- simple `revoke ... from public` (qui ne vise que le pseudo-rôle PUBLIC). Vérifié en conditions
-- réelles : `anon`/`authenticated` pouvaient appeler cette RPC directement (p_user_id entièrement
-- contrôlé par l'appelant → risque de déni de service ciblé sur le quota d'un utilisateur). Toujours
-- ajouter ce `revoke execute ... from anon, authenticated` explicite après CHAQUE
-- `create or replace function` de ce fichier qui doit rester restreinte à service_role — ne JAMAIS se
-- fier au seul `revoke ... from public` sur ce projet.
revoke all on function register_capture_usage(uuid) from public;
revoke execute on function register_capture_usage(uuid) from anon, authenticated;
grant execute on function register_capture_usage(uuid) to service_role;

-- CHANTIER "Réponses intelligentes" — protection anti-abus DÉDIÉE (2026-09-16), même principe que
-- capture_events ci-dessus mais TOTALEMENT séparée : table distincte, fonction distincte, espace de
-- verrou consultatif distinct (salt=1 au lieu de salt=0) — un incident/abus sur l'une des deux
-- fonctionnalités ne peut jamais affecter le quota de l'autre. Une ligne = un appel qui a réellement
-- franchi ce contrôle et est entré dans le pipeline IA payant — pas un simple tap sur le bouton.
create table if not exists message_suggestion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists message_suggestion_events_user_created_idx
  on message_suggestion_events (user_id, created_at desc);

alter table message_suggestion_events enable row level security;
-- Aucune policy créée volontairement — même principe que capture_events : ni anon ni authenticated
-- ne peuvent lire/écrire cette table directement, seul service_role (via l'Edge Function
-- `suggest-message`) le peut.

-- Fonction RPC ATOMIQUE — vérifie les 2 seuils ET enregistre l'appel en une seule opération, protégée
-- par un verrou consultatif PAR UTILISATEUR. AUCUN plafond mensuel (contrairement à
-- register_capture_usage) : décision produit explicite du 2026-09-16, à revisiter après mesure de
-- l'usage/coût réel. Retourne : 'ok' | 'rate_limit_minute' | 'rate_limit_hour' — jamais un chiffre de
-- seuil, jamais un compteur restant (voir MESSAGE_SUGGESTION_USAGE_ERROR_CODE côté Edge Function pour
-- le mapping en code structuré renvoyé au client).
create or replace function register_message_suggestion_usage(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minute_count integer;
  v_hour_count integer;
begin
  -- salt=1 : espace de verrou DISTINCT de register_capture_usage (salt=0) pour le même utilisateur —
  -- ne sérialise jamais les deux fonctionnalités entre elles par accident.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 1));

  select count(*) into v_minute_count from message_suggestion_events
    where user_id = p_user_id and created_at >= now() - interval '1 minute';
  if v_minute_count >= 5 then
    return 'rate_limit_minute';
  end if;

  select count(*) into v_hour_count from message_suggestion_events
    where user_id = p_user_id and created_at >= now() - interval '1 hour';
  if v_hour_count >= 20 then
    return 'rate_limit_hour';
  end if;

  insert into message_suggestion_events (user_id) values (p_user_id);
  return 'ok';
end;
$$;

-- Voir le correctif du 2026-09-16 documenté au-dessus de register_capture_usage : `revoke ... from
-- public` seul est insuffisant sur ce projet (privilèges par défaut du schéma public) — toujours
-- ajouter ce `revoke execute ... from anon, authenticated` explicite.
revoke all on function register_message_suggestion_usage(uuid) from public;
revoke execute on function register_message_suggestion_usage(uuid) from anon, authenticated;
grant execute on function register_message_suggestion_usage(uuid) to service_role;
