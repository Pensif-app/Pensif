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
  date_evenement date not null,
  -- Renseigné uniquement pour une pensée de période (surlignage type "Vacances en Italie").
  end_date date,
  texte text not null,
  remind_offset text not null default '3',
  custom_offset_minutes integer,
  created_at timestamptz default now()
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
