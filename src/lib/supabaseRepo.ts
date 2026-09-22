import { supabase } from './supabase';
import { Contact, Pensee } from '../data/types';
import { seedContacts, seedPensees } from '../data/seed';
import { normalizePensee, occurrenceYear, postgresTimeToEventTime } from '../data/calendar';

const AVATAR_COLORS = ['accent', 'sage', 'plum', 'accentStrong'];

function firstLetter(s: string) {
  const match = s.match(/\p{L}/u);
  return match ? match[0] : '';
}

function deriveInitials(prenom: string, nom: string) {
  return `${firstLetter(prenom)}${firstLetter(nom)}`.toUpperCase();
}

/** Couleur d'avatar stable dérivée de l'id — évite d'avoir à la stocker en base. */
function deriveColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * La colonne distante `gift_sent` reste un simple booléen (aucune migration de schéma dans ce
 * chantier) : elle est traduite en `giftPreparedYear` au moment de la lecture, en supposant qu'un
 * `true` distant concerne l'occurrence en cours à CE moment (`today`). Limite connue : si plusieurs
 * appareils se synchronisent à cheval sur un changement d'année sans qu'aucun n'ait rebasculé la
 * case entre-temps, cette traduction peut réactiver `giftPreparedYear` pour la nouvelle occurrence.
 * Le stockage local (AsyncStorage, source de vérité pour un usage mono-appareil sans Supabase) ne
 * connaît pas cette limite : il persiste directement `giftPreparedYear`.
 */
function rowToContact(row: any, today: Date): Contact {
  return {
    id: row.id,
    prenom: row.prenom,
    nom: row.nom ?? '',
    tel: row.tel ?? '',
    date: row.date_naissance,
    relation: row.relation ?? '',
    familyRole: row.family_role ?? null,
    genre: row.genre ?? null,
    initials: deriveInitials(row.prenom, row.nom ?? ''),
    color: deriveColor(row.id),
    quiz: row.quiz ?? null,
    giftPreparedYear: row.gift_sent ? occurrenceYear(row.date_naissance, today) : null,
    favorite: Boolean(row.favorite),
    birthdayReminderDays: row.birthday_reminder_days ?? null,
  };
}

/**
 * CHANTIER PENSÉES V2 : passe par normalizePensee (calendar.ts) pour que la ligne distante soit
 * comprise qu'elle porte déjà `reminder_at`/`created_at` (migration appliquée) ou encore l'ancien
 * couple `remind_offset`/`custom_offset_minutes` avec `date_evenement` obligatoire (migration SQL
 * pas encore exécutée — voir supabase/schema.sql) : dans les deux cas, le reste de l'app ne
 * manipule plus qu'un `Pensee` déjà normalisé.
 */
function rowToPensee(row: any): Pensee {
  return normalizePensee({
    id: row.id,
    date: row.date_evenement ?? null,
    endDate: row.end_date ?? null,
    texte: row.texte,
    contactId: row.contact_id,
    // `undefined` (colonne absente, migration pas encore appliquée) déclenche la dérivation
    // legacy dans normalizePensee ; une valeur explicite (y compris `null`) est utilisée telle quelle.
    reminderAt: 'reminder_at' in row ? row.reminder_at : undefined,
    remind: row.remind_offset,
    customOffsetMinutes: row.custom_offset_minutes,
    createdAt: row.created_at,
    // CHANTIER PENSÉES V3 — colonne absente (migration pas encore appliquée) → false via Boolean(),
    // même discipline que `favorite`/`gift_sent` sur les contacts (rowToContact ci-dessus).
    pinned: Boolean(row.pinned),
    // CHANTIER CAPTURE — EVENT TIME, incrément 3 (2026-09-18). `event_time` (colonne Postgres `time`)
    // revient de PostgREST au format "HH:mm:ss" — postgresTimeToEventTime l'adapte au format
    // canonique client "HH:mm" AVANT normalizePensee (qui, elle, valide strictement ce format et ne
    // fait aucune adaptation). Colonne absente (migration pas encore appliquée) ou NULL → `undefined`/
    // `null`, les deux traités identiquement par postgresTimeToEventTime (→ null), aucune dérivation
    // legacy nécessaire ici (contrairement à reminder_at) : ce champ n'a jamais existé sous une autre
    // forme.
    eventTime: postgresTimeToEventTime(row.event_time),
    // CHANTIER "persistance reminderRecurrence" (2026-09-18) — CORRECTIF. `reminder_recurrence` est
    // une colonne `jsonb` : PostgREST la désérialise déjà en objet JS, transmise TELLE QUELLE (jamais
    // de JSON.parse manuel) — normalizePensee applique ensuite normalizeReminderRecurrence dessus
    // (même validation stricte "tout ou rien" que pour toute autre source, colonne absente/NULL/JSON
    // structurellement invalide retombent tous uniformément sur `null`).
    reminderRecurrence: row.reminder_recurrence ?? null,
  });
}

/** Peuple un compte avec les données de démo — DÉLIBÉRÉMENT plus appelé automatiquement à la
 *  création d'un compte (voir CHANTIER PRÉ-BÊTA 1 §2 : un vrai nouvel utilisateur commence à zéro
 *  proche/pensée). Conservée pour un éventuel mode démo explicite futur — non câblée nulle part
 *  pour l'instant. */
export async function seedRemote(userId: string) {
  if (!supabase) return { contacts: [] as Contact[], pensees: [] as Pensee[] };

  const { data: contactRows, error: contactErr } = await supabase
    .from('contacts')
    .insert(
      seedContacts.map((c) => ({
        user_id: userId,
        prenom: c.prenom,
        nom: c.nom,
        tel: c.tel,
        date_naissance: c.date,
        relation: c.relation,
        family_role: c.familyRole,
        genre: c.genre,
        quiz: c.quiz,
        gift_sent: false,
        favorite: false,
        birthday_reminder_days: c.birthdayReminderDays,
      })),
    )
    .select();
  if (contactErr || !contactRows) throw contactErr;

  const idMap: Record<string, string> = {};
  seedContacts.forEach((c, i) => {
    idMap[c.id] = contactRows[i].id;
  });

  const { data: penseeRows, error: penseeErr } = await supabase
    .from('pensees')
    .insert(
      seedPensees.map((p) => ({
        user_id: userId,
        date_evenement: p.date ?? null,
        texte: p.texte,
        reminder_at: p.reminderAt ?? null,
        contact_id: p.contactId ? idMap[p.contactId] : null,
        created_at: p.createdAt,
      })),
    )
    .select();
  if (penseeErr || !penseeRows) throw penseeErr;

  const today = new Date();
  return { contacts: contactRows.map((r) => rowToContact(r, today)), pensees: penseeRows.map(rowToPensee) };
}

export async function loadRemoteData(userId: string, isNewAccount: boolean) {
  if (!supabase) return { contacts: [] as Contact[], pensees: [] as Pensee[] };

  const [{ data: contactRows, error: cErr }, { data: penseeRows, error: pErr }] = await Promise.all([
    supabase.from('contacts').select('*').order('created_at'),
    supabase.from('pensees').select('*').order('created_at'),
  ]);
  if (cErr) throw cErr;
  if (pErr) throw pErr;

  // Un compte tout juste créé démarre à zéro proche/pensée, comme un utilisateur local sans
  // Supabase (voir CHANTIER PRÉ-BÊTA 1 §2) — `isNewAccount` n'est plus utilisé pour peupler quoi que
  // ce soit automatiquement, il ne sert plus qu'à documenter l'intention de l'appelant.
  void isNewAccount;

  const today = new Date();
  return { contacts: (contactRows ?? []).map((r) => rowToContact(r, today)), pensees: (penseeRows ?? []).map(rowToPensee) };
}

/**
 * CHANTIER "Data Safety P0-2 — idempotence outbox" (2026-09-20). `upsert` (conflict target = `id`,
 * la clé primaire) plutôt qu'`insert` — BUG CORRIGÉ : un `insert` réussi côté serveur dont la
 * réponse réseau est perdue faisait échouer TOUT retry suivant (conflit de clé primaire), laissant
 * l'op bloquée en tête de FIFO indéfiniment (voir audit Data Safety pré-bêta, `store.tsx`
 * `executeOutboxOp`, dette désormais corrigée). `upsert` convertit ce cas en UPDATE idempotent de la
 * MÊME ligne : si l'utilisateur a modifié localement entre-temps (payload coalescé dans le même op
 * `isNew:true`, voir `enqueueUpsert`/outbox.ts), le retry envoie directement le DERNIER payload —
 * Supabase converge vers cette valeur, jamais l'ancienne. Isolation utilisateur INCHANGÉE : la policy
 * RLS existante (`FOR ALL USING auth.uid()=user_id WITH CHECK auth.uid()=user_id`) reste seule
 * responsable — sur un conflit d'id appartenant à un AUTRE utilisateur, `USING` échoue pour la ligne
 * existante et Postgres rejette l'upsert (erreur), jamais un succès silencieux ni un service_role.
 * `user_id` reste exclusivement `userId` (paramètre, dérivé de `session.user.id` par l'appelant,
 * jamais une valeur contrôlable par l'utilisateur) — identique à l'ancien `insert`.
 */
export async function insertContactRemote(userId: string, contact: Omit<Contact, 'initials' | 'color'>): Promise<Contact> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { data, error } = await supabase
    .from('contacts')
    .upsert(
      {
        // Id généré côté client (voir lib/id.ts) et réutilisé tel quel ici : l'id local et l'id
        // distant sont donc identiques dès la création, pas besoin d'attendre la réponse réseau
        // pour connaître l'id définitif du contact.
        id: contact.id,
        user_id: userId,
        prenom: contact.prenom,
        nom: contact.nom,
        tel: contact.tel,
        date_naissance: contact.date,
        relation: contact.relation,
        family_role: contact.familyRole,
        genre: contact.genre,
        quiz: contact.quiz,
        gift_sent: contact.giftPreparedYear != null,
        favorite: contact.favorite,
        birthday_reminder_days: contact.birthdayReminderDays,
      },
      { onConflict: 'id' },
    )
    .select()
    .single();
  if (error || !data) throw error;
  return rowToContact(data, new Date());
}

// CHANTIER "Pré-TestFlight Phase 2 — Hardening release" (2026-09-22) — défense en profondeur :
// `.eq('user_id', userId)` s'ajoute à `.eq('id', ...)` sur les 4 mutations ci-dessous (update/delete
// contact, update gift_sent, delete pensée). La policy RLS (`auth.uid()=user_id`, voir
// supabase/schema.sql) reste la SEULE protection réellement nécessaire et n'est pas modifiée : une
// requête ciblant la ligne d'un autre utilisateur était déjà rejetée par Postgres avant ce chantier.
// Ce filtre supplémentaire ne change donc AUCUN comportement observable (même succès/échec
// qu'avant, RLS inchangée) — il rend simplement explicite, côté client, une intention qui reposait
// jusqu'ici implicitement sur la base. `userId` provient du même paramètre déjà utilisé par
// `insertContactRemote`/`insertPenseeRemote` (session Supabase active, voir `userIdRef.current` dans
// store.tsx) — jamais une valeur devinée ou optionnelle.
export async function updateContactRemote(contact: Contact, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { error } = await supabase
    .from('contacts')
    .update({
      prenom: contact.prenom,
      nom: contact.nom,
      tel: contact.tel,
      date_naissance: contact.date,
      relation: contact.relation,
      family_role: contact.familyRole,
      genre: contact.genre,
      quiz: contact.quiz,
      gift_sent: contact.giftPreparedYear != null,
      favorite: contact.favorite,
      birthday_reminder_days: contact.birthdayReminderDays,
    })
    .eq('id', contact.id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function setGiftSentRemote(contactId: string, value: boolean, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { error } = await supabase.from('contacts').update({ gift_sent: value }).eq('id', contactId).eq('user_id', userId);
  if (error) throw error;
}

export async function deleteContactRemote(contactId: string, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { error } = await supabase.from('contacts').delete().eq('id', contactId).eq('user_id', userId);
  if (error) throw error;
}

export async function deletePenseeRemote(penseeId: string, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { error } = await supabase.from('pensees').delete().eq('id', penseeId).eq('user_id', userId);
  if (error) throw error;
}

/** CHANTIER "Data Safety P0-2 — idempotence outbox" (2026-09-20) — même correctif que
 *  `insertContactRemote` ci-dessus (`upsert`/conflict target `id`, voir sa docstring pour le
 *  raisonnement complet : converge vers le dernier payload coalescé, RLS inchangée, jamais de
 *  succès silencieux sur une ligne d'un autre utilisateur, jamais de `service_role`). */
export async function insertPenseeRemote(userId: string, pensee: Pensee): Promise<Pensee> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { data, error } = await supabase
    .from('pensees')
    .upsert({
      id: pensee.id,
      user_id: userId,
      date_evenement: pensee.date ?? null,
      end_date: pensee.endDate ?? null,
      texte: pensee.texte,
      reminder_at: pensee.reminderAt ?? null,
      contact_id: pensee.contactId,
      created_at: pensee.createdAt,
      pinned: pensee.pinned ?? false,
      // CHANTIER CAPTURE — EVENT TIME, incrément 3 (2026-09-18) — format client "HH:mm" envoyé tel
      // quel : Postgres (colonne `time`) l'accepte directement, aucune adaptation nécessaire en
      // écriture (voir rowToPensee pour l'adaptation symétrique en lecture).
      event_time: pensee.eventTime ?? null,
      // CHANTIER "persistance reminderRecurrence" (2026-09-18) — CORRECTIF. Objet JS envoyé TEL QUEL
      // à une colonne `jsonb` (aucune sérialisation JSON manuelle — supabase-js s'en charge) ; `null`
      // pour une pensée sans récurrence, même convention que tous les autres champs nullable ci-dessus.
      reminder_recurrence: pensee.reminderRecurrence ?? null,
    }, { onConflict: 'id' })
    .select()
    .single();
  if (error || !data) throw error;
  return rowToPensee(data);
}

/**
 * CHANTIER PENSÉES V2 : la fiche pensée (édition) peut désormais modifier le texte, le proche lié
 * et le rappel d'une pensée existante — il fallait donc un update distant, qui n'existait pas
 * encore pour les pensées (seuls insert/delete existaient jusqu'ici, voir updateContactRemote pour
 * le même besoin côté contacts).
 */
export async function updatePenseeRemote(pensee: Pensee): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { error } = await supabase
    .from('pensees')
    .update({
      date_evenement: pensee.date ?? null,
      end_date: pensee.endDate ?? null,
      texte: pensee.texte,
      reminder_at: pensee.reminderAt ?? null,
      contact_id: pensee.contactId,
      pinned: pensee.pinned ?? false,
      event_time: pensee.eventTime ?? null,
      reminder_recurrence: pensee.reminderRecurrence ?? null,
    })
    .eq('id', pensee.id);
  if (error) throw error;
}
