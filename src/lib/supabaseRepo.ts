import { supabase } from './supabase';
import { Contact, Pensee } from '../data/types';
import { seedContacts, seedPensees } from '../data/seed';
import { normalizePensee, occurrenceYear } from '../data/calendar';

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
  });
}

export type AnonSession = { userId: string; isNewAccount: boolean };

/** `isNewAccount` distingue un compte anonyme tout juste créé (session absente, on vient d'appeler
 *  signInAnonymously) d'une session existante restaurée (persistSession:true dans supabase.ts) —
 *  sert à ne peupler les données de démo qu'une seule fois, à la toute première ouverture (voir
 *  loadRemoteData ci-dessous), plutôt qu'à chaque fois que la table est vide. */
export async function ensureAnonSession(): Promise<AnonSession | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (data.session) return { userId: data.session.user.id, isNewAccount: false };
  const { data: signInData, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!signInData.session) return null;
  return { userId: signInData.session.user.id, isNewAccount: true };
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

export async function insertContactRemote(userId: string, contact: Omit<Contact, 'initials' | 'color'>): Promise<Contact> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { data, error } = await supabase
    .from('contacts')
    .insert({
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
    })
    .select()
    .single();
  if (error || !data) throw error;
  return rowToContact(data, new Date());
}

export async function updateContactRemote(contact: Contact): Promise<void> {
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
    .eq('id', contact.id);
  if (error) throw error;
}

export async function setGiftSentRemote(contactId: string, value: boolean): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { error } = await supabase.from('contacts').update({ gift_sent: value }).eq('id', contactId);
  if (error) throw error;
}

export async function deleteContactRemote(contactId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { error } = await supabase.from('contacts').delete().eq('id', contactId);
  if (error) throw error;
}

export async function deletePenseeRemote(penseeId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { error } = await supabase.from('pensees').delete().eq('id', penseeId);
  if (error) throw error;
}

export async function insertPenseeRemote(userId: string, pensee: Pensee): Promise<Pensee> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { data, error } = await supabase
    .from('pensees')
    .insert({
      id: pensee.id,
      user_id: userId,
      date_evenement: pensee.date ?? null,
      end_date: pensee.endDate ?? null,
      texte: pensee.texte,
      reminder_at: pensee.reminderAt ?? null,
      contact_id: pensee.contactId,
      created_at: pensee.createdAt,
      pinned: pensee.pinned ?? false,
    })
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
    })
    .eq('id', pensee.id);
  if (error) throw error;
}
