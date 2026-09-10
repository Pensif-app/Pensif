-- Schéma Pensif — à exécuter dans l'éditeur SQL de ton projet Supabase.
-- Une fois appliqué, l'app pourra être branchée dessus (voir src/lib/supabase.ts et le README).
--
-- Si ta table "contacts" existe déjà (tu as déjà exécuté une version précédente de ce fichier),
-- les "create table if not exists" ci-dessous ne rejoueront pas les nouvelles colonnes. Lance
-- plutôt cette ligne une fois dans l'éditeur SQL pour la mettre à jour :
--   alter table contacts add column if not exists favorite boolean default false;
--   alter table pensees add column if not exists custom_offset_minutes integer;

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prenom text not null,
  nom text default '',
  tel text default '',
  date_naissance date not null,
  relation text default '',
  q1 text default '',
  q2 text default '',
  q3 text default '',
  gift_sent boolean default false,
  favorite boolean default false,
  created_at timestamptz default now()
);

create table if not exists pensees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  date_evenement date not null,
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
