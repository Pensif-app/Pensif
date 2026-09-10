/**
 * Identifiant client généré une seule fois à la création (contact/pensée), utilisé à la fois en
 * local ET envoyé tel quel à Supabase (colonne uuid) — évite que l'id change sous les pieds de
 * l'app une fois l'insert distant résolu (voir upsertContact/addPensee dans store.tsx), ce qui
 * cassait la sauvegarde quand on enchaînait fiche + quizz très vite après une création.
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
