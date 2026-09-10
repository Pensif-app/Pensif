import { supabase } from './supabase';
import { Contact, Pensee } from '../data/types';
import { seedContacts, seedPensees } from '../data/seed';

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

function rowToContact(row: any): Contact {
  return {
    id: row.id,
    prenom: row.prenom,
    nom: row.nom ?? '',
    tel: row.tel ?? '',
    date: row.date_naissance,
    relation: row.relation ?? '',
    initials: deriveInitials(row.prenom, row.nom ?? ''),
    color: deriveColor(row.id),
    q1: row.q1 ?? '',
    q2: row.q2 ?? '',
    q3: row.q3 ?? '',
    giftSent: Boolean(row.gift_sent),
    favorite: Boolean(row.favorite),
  };
}

function rowToPensee(row: any): Pensee {
  return {
    id: row.id,
    date: row.date_evenement,
    texte: row.texte,
    remind: row.remind_offset,
    customOffsetMinutes: row.custom_offset_minutes,
    contactId: row.contact_id,
  };
}

export async function ensureAnonSession(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signInData, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signInData.session?.user.id ?? null;
}

/** Peuple le compte avec les données de démo la toute première fois (table vide). */
async function seedRemote(userId: string) {
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
        q1: c.q1,
        q2: c.q2,
        q3: c.q3,
        gift_sent: false,
        favorite: false,
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
        date_evenement: p.date,
        texte: p.texte,
        remind_offset: p.remind,
        contact_id: p.contactId ? idMap[p.contactId] : null,
      })),
    )
    .select();
  if (penseeErr || !penseeRows) throw penseeErr;

  return { contacts: contactRows.map(rowToContact), pensees: penseeRows.map(rowToPensee) };
}

export async function loadRemoteData(userId: string) {
  if (!supabase) return { contacts: [] as Contact[], pensees: [] as Pensee[] };

  const [{ data: contactRows, error: cErr }, { data: penseeRows, error: pErr }] = await Promise.all([
    supabase.from('contacts').select('*').order('created_at'),
    supabase.from('pensees').select('*').order('created_at'),
  ]);
  if (cErr) throw cErr;
  if (pErr) throw pErr;

  if ((contactRows ?? []).length === 0) return seedRemote(userId);

  return { contacts: (contactRows ?? []).map(rowToContact), pensees: (penseeRows ?? []).map(rowToPensee) };
}

export async function insertContactRemote(userId: string, contact: Omit<Contact, 'id' | 'initials' | 'color'>): Promise<Contact> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      user_id: userId,
      prenom: contact.prenom,
      nom: contact.nom,
      tel: contact.tel,
      date_naissance: contact.date,
      relation: contact.relation,
      q1: contact.q1,
      q2: contact.q2,
      q3: contact.q3,
      gift_sent: contact.giftSent,
      favorite: contact.favorite,
    })
    .select()
    .single();
  if (error || !data) throw error;
  return rowToContact(data);
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
      q1: contact.q1,
      q2: contact.q2,
      q3: contact.q3,
      gift_sent: contact.giftSent,
      favorite: contact.favorite,
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

export async function insertPenseeRemote(userId: string, pensee: Omit<Pensee, 'id'>): Promise<Pensee> {
  if (!supabase) throw new Error('Supabase non configuré');
  const { data, error } = await supabase
    .from('pensees')
    .insert({
      user_id: userId,
      date_evenement: pensee.date,
      texte: pensee.texte,
      remind_offset: pensee.remind,
      custom_offset_minutes: pensee.customOffsetMinutes ?? null,
      contact_id: pensee.contactId,
    })
    .select()
    .single();
  if (error || !data) throw error;
  return rowToPensee(data);
}
