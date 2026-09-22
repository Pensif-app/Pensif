/// <reference types="node" />
// Tests de non-régression — CHANTIER "Pré-TestFlight Phase 4D — UI Pensées mémorisées" (2026-09-22).
// PenseesScreen.tsx/MemorizedPenseesScreen.tsx (react-native) ne peuvent pas être chargés sous tsx
// (même constat que le reste de ce projet) — `memoMeta()` (nouvelle fonction, pure) est reproduite
// ici À L'IDENTIQUE de PenseesScreen.tsx ; le reste (isolation par bucket, câblage des variants,
// non-régression des autres buckets) est vérifié par lecture de source, même méthode que
// test-regression-pensees-v3.ts §F et test-regression-event-time-ui.ts §G.
//
// Usage : npx tsx scripts/test-regression-memo-pensees-ui.ts

import * as fs from 'fs';
import * as path from 'path';
import { Contact, Pensee } from '../src/data/types';
import { penseeSubtitle } from '../src/data/calendar';
import { buildPenseeCards } from '../src/data/penseesView';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function readScreen(name: string): string {
  return fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', `${name}.tsx`), 'utf8').replace(/\r\n/g, '\n');
}

const penseesSrc = readScreen('PenseesScreen');
const memorizedSrc = readScreen('MemorizedPenseesScreen');

function makeContact(overrides: Partial<Contact>): Contact {
  return {
    id: overrides.id ?? `c-${Math.random().toString(36).slice(2)}`,
    prenom: 'Léa',
    nom: '',
    tel: '',
    date: '1990-01-01',
    relation: 'Ami',
    familyRole: null,
    genre: null,
    initials: 'LM',
    color: 'sage',
    quiz: null,
    giftPreparedYear: null,
    favorite: false,
    birthdayReminderDays: null,
    ...overrides,
  };
}

// --- Reproduction fidèle de PenseesScreen.tsx::memoMeta ------------------------------------------
function memoMeta(contactId: string | null, contact: Contact | null): { label: string; hasAvatar: boolean } {
  if (contact) return { label: contact.prenom, hasAvatar: true };
  if (contactId) return { label: 'Pensée mémorisée', hasAvatar: false };
  return { label: 'Pensée personnelle', hasAvatar: false };
}
// ---------------------------------------------------------------------------------------------

console.log('\n[1] memo + contact → avatar/prénom/date présents (hasAvatar=true, label=prénom)');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa' });
  const { label, hasAvatar } = memoMeta('c-lea', lea);
  check('label = prénom du contact ("Léa")', label === 'Léa');
  check('hasAvatar = true (Avatar réutilisé, pas un second système)', hasAvatar === true);
}

console.log('\n[2] memo sans contact (contactId absent) → "Pensée personnelle", aucun avatar, aucun prénom inventé');
{
  const { label, hasAvatar } = memoMeta(null, null);
  check('label = "Pensée personnelle"', label === 'Pensée personnelle');
  check('hasAvatar = false (jamais un faux avatar)', hasAvatar === false);
}

console.log('\n[3] memo + contactId orphelin (présent mais contact introuvable) → fallback neutre "Pensée mémorisée", JAMAIS "Pensée personnelle"');
{
  // contactId réel mais aucun contact trouvé dans la liste (proche supprimé, par exemple) —
  // "Pensée personnelle" laisserait croire qu'elle n'a jamais été liée à quelqu'un : faux.
  const { label, hasAvatar } = memoMeta('c-disparu', null);
  check('label = "Pensée mémorisée" (fallback neutre choisi, voir rapport §4)', label === 'Pensée mémorisée');
  check('label ≠ "Pensée personnelle" (ne doit jamais masquer qu’un contact était lié)', label !== 'Pensée personnelle');
  check('hasAvatar = false (aucun avatar avec initiales inventées)', hasAvatar === false);
}

console.log('\n[4] Isolation par bucket — PenseeRow route explicitement sur card.bucket === \'memo\', jamais une autre condition');
{
  check(
    'PenseeRow délègue à MemoPenseeRow exactement quand card.bucket === \'memo\'',
    /if \(card\.bucket === 'memo'\) \{\s*return \(\s*<MemoPenseeRow/.test(penseesSrc),
  );
}

console.log('\n[5] Rendu Aujourd’hui/À venir/Passées/rappels — code source INTACT (branche non-memo jamais touchée)');
{
  // Extrait le corps exact de la branche non-memo (entre son "return (" final et la fermeture de
  // PenseeRow) pour vérifier chaque élément structurel sans dépendre d'une distance regex fragile.
  const start = penseesSrc.indexOf("Coche visible UNIQUEMENT en mode sélection (voir §3 chantier UX) — jamais en usage normal.");
  const end = penseesSrc.indexOf('/** Libellé + éventuel avatar', start);
  const nonMemoBranch = penseesSrc.slice(start, end);
  check('branche non-memo trouvée (bloc entre le commentaire "Coche visible..." et memoMeta)', start !== -1 && end !== -1 && nonMemoBranch.length > 0);
  check('checkbox de sélection inchangée (Ionicons checkmark-circle/ellipse-outline)', /Ionicons name=\{selected \? 'checkmark-circle' : 'ellipse-outline'\}/.test(nonMemoBranch));
  check('pin inchangé (card.pensee.pinned && Ionicons "pin")', /card\.pensee\.pinned && <Ionicons name="pin" size=\{12\} color=\{theme\.plum\} \/>/.test(nonMemoBranch));
  check('texte principal toujours numberOfLines={3} (styles.text, jamais tronqué différemment)', /style=\{\[styles\.text, \{ color: theme\.ink, flexShrink: 1 \}\]\} numberOfLines=\{3\}/.test(nonMemoBranch));
  // CORRECTIF Phase 4D.1 : la ligne de méta n'est plus un unique <Text>{card.subtitle}</Text> — elle
  // reste `card.subtitle` (comportement historique) UNIQUEMENT quand aucun contact valide n'est
  // trouvé ; voir §[12]-[14] plus bas pour la couverture complète du nouveau câblage (date + avatar).
  check('sous-titre : card.subtitle utilisé tel quel comme repli quand `contact` est null (comportement historique préservé pour ce cas)', /\{contact \? `\$\{contact\.prenom\} · \$\{penseeSubtitle\(card\.pensee, \[\], false\)\}` : card\.subtitle\}/.test(nonMemoBranch));
  check('card.reminderLabel toujours rendu via <Pill> pour la branche non-memo (rappel inchangé)', /card\.reminderLabel && <Pill label=\{card\.reminderLabel\} tone="muted" theme=\{theme\} \/>/.test(nonMemoBranch));
}

console.log('\n[6] Tap memo → PenseeDetail inchangé (onPress délégué tel quel, aucune navigation différente pour memo)');
{
  // MemoPenseeRow reçoit onPress en prop et l'attache directement au Pressable englobant — aucune
  // logique de navigation dupliquée/différente pour le cas memo (handleCardPress reste la seule
  // source, identique aux autres buckets).
  const memoStart = penseesSrc.indexOf('function MemoPenseeRow');
  const memoBody = penseesSrc.slice(memoStart, memoStart + 2000);
  check(
    'MemoPenseeRow attache onPress/onLongPress reçus en props directement au Pressable englobant (pas de nouvelle logique de navigation)',
    /<Pressable\s*onPress=\{onPress\}\s*onLongPress=\{onLongPress\}/.test(memoBody),
  );
  check('handleCardPress (PenseesScreen) reste la seule fonction qui appelle openDetail → navigate(\'PenseeDetail\')', /navigation\.navigate\('PenseeDetail', \{ penseeId \}\)/.test(penseesSrc));
}

console.log('\n[7] pinned memo → pin toujours présent (icône "pin", même condition card.pensee.pinned, aucune nouvelle logique/état)');
{
  const pinOccurrences = (penseesSrc.match(/card\.pensee\.pinned && <Ionicons name="pin" size=\{12\} color=\{theme\.plum\} \/>/g) ?? []).length;
  // 3 occurrences attendues : branche non-memo, variant 'rich', variant 'compact' (MemoPenseeRow) —
  // toutes la MÊME condition/icône, jamais une variante différente ni un nouvel état introduit.
  check('exactement 3 occurrences de la même condition/icône pin (non-memo, rich, compact) — aucune dupliquée avec une logique différente', pinOccurrences === 3, String(pinOccurrences));
  check('aucun nouvel état "pinned" introduit (pas de useState pin* dans ce fichier)', !/useState.*[Pp]inned/.test(penseesSrc));
}

console.log('\n[8] Les deux emplacements memo (PenseesScreen compact, MemorizedPenseesScreen rich) partagent le même PenseeRow — aucun second design');
{
  check('MemorizedPenseesScreen importe PenseeRow depuis PenseesScreen.tsx (réutilisation stricte, pas un composant parallèle)', /import \{ PenseeRow \} from '\.\/PenseesScreen'/.test(memorizedSrc));
  check('MemorizedPenseesScreen passe memoVariant="rich"', /memoVariant="rich"/.test(memorizedSrc));
  check('MemorizedPenseesScreen résout le contact directement (contacts.find), sans réinventer memoMeta', /contacts\.find\(\(c\) => c\.id === item\.pensee\.contactId\)/.test(memorizedSrc));
  check('PenseesScreen utilise memoVariant="compact" pour ses propres sections', (penseesSrc.match(/memoVariant="compact"/g) ?? []).length === 5, String((penseesSrc.match(/memoVariant="compact"/g) ?? []).length));
}

console.log('\n[9] Filtrage/recherche/navigation Phase 4D — aucune régression (hors périmètre de cette passe, doit rester intact)');
{
  check('route.params.contactId toujours utilisé pour le filtre contextuel PenseesScreen (inchangé)', /const filterContactId = route\.params\?\.contactId;/.test(penseesSrc));
  check('recherche texte MemorizedPenseesScreen (matchesSearch) toujours présente (inchangée)', /matchesSearch\(/.test(memorizedSrc));
  check('ContactPicker toujours utilisé pour le filtre MemorizedPenseesScreen (inchangé)', /<ContactPicker/.test(memorizedSrc));
}

console.log('\n[10] Aucun nouveau package, Avatar existant réutilisé, aucun swipe/action supplémentaire introduits');
{
  check('Avatar importé depuis ../components/Avatar (composant existant, pas un second système)', /import \{ Avatar \} from '\.\.\/components\/Avatar';/.test(penseesSrc));
  check('aucune bibliothèque de gestes/swipe introduite dans ce fichier', !/PanResponder|GestureDetector|react-native-gesture-handler|Swipeable/.test(penseesSrc));
}

// --- CHANTIER "Pré-TestFlight Phase 4D.1 — Identité contact dans les pensées temporelles"
// (2026-09-22) — today/upcoming/past enrichis d'un petit Avatar (18px)+prénom sur la ligne de méta
// existante quand un contact valide est trouvé, DATE toujours en premier. `penseeSubtitle` (fonction
// pure, calendar.ts) réellement exécutée (pas une reproduction) — seule la partie "câblage JSX" est
// vérifiée par lecture de source, même méthode que le reste de ce fichier.

function makePensee(overrides: Partial<Pensee>): Pensee {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2)}`,
    texte: 'Envoyer un message',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    date: '2026-09-23',
    endDate: null,
    reminderAt: null,
    pinned: false,
    ...overrides,
  } as Pensee;
}

console.log('\n[11] penseeSubtitle(..., false) — partie date SEULE, réutilisée telle quelle (pas une 2e implémentation)');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa', nom: 'Martin' });
  const p = makePensee({ contactId: 'c-lea', date: '2026-09-23' });
  const withName = penseeSubtitle(p, [lea]);
  const dateOnly = penseeSubtitle(p, [], false);
  check('avec contacts + includeContactName par défaut (true) : "23 sept · Léa Martin" (comportement historique strictement inchangé)', withName === '23 sept · Léa Martin', withName);
  check('avec includeContactName=false : "23 sept" (date seule, jamais le nom)', dateOnly === '23 sept', dateOnly);
  check('appel 2-arg (homeAttention.ts, penseesView.ts) : includeContactName reste true par défaut, comportement identique à avant cette passe', penseeSubtitle(p, [lea]) === withName);
}

// CHANTIER "Pré-TestFlight Phase 4D.2 — Unifier la méta contact/date" (2026-09-22) — CORRECTIF :
// l'ordre Phase 4D.1 (date puis Avatar+prénom) était incohérent avec MÉMORISÉES ("[Avatar] Prénom ·
// Date") — inversé pour "[Avatar] Prénom · Date" dans les 3 buckets temporels aussi. Assertion [12]
// mise à jour en conséquence (seule assertion concernée, comme demandé).

console.log('\n[12] upcoming/today/past + contact — câblage JSX : Avatar+prénom AVANT la date, sur la même ligne, cohérent avec MÉMORISÉES (aucune nouvelle ligne)');
{
  const nonMemoStart = penseesSrc.indexOf("Coche visible UNIQUEMENT en mode sélection (voir §3 chantier UX) — jamais en usage normal.");
  const nonMemoEnd = penseesSrc.indexOf('/** Libellé + éventuel avatar', nonMemoStart);
  const nonMemoBranch = penseesSrc.slice(nonMemoStart, nonMemoEnd);
  check(
    'la ligne de méta reste une SEULE View row (Avatar+prénom puis, si contact, "· date") — pas un nouveau bloc/ligne séparé',
    /\{contact && <Avatar initials=\{contact\.initials\} colorKey=\{contact\.color\} theme=\{theme\} size=\{18\} \/>\}[\s\S]{0,700}\{contact \? `\$\{contact\.prenom\} · \$\{penseeSubtitle\(card\.pensee, \[\], false\)\}` : card\.subtitle\}/.test(
      nonMemoBranch,
    ),
  );
  check('Avatar taille 18 (identique au variant memo compact, §2 de la consigne Phase 4D.1, inchangé)', /<Avatar initials=\{contact\.initials\} colorKey=\{contact\.color\} theme=\{theme\} size=\{18\} \/>/.test(nonMemoBranch));
  check(
    'prénom puis date, dans cet ordre exact, cohérent avec MÉMORISÉES : `${contact.prenom} · ${penseeSubtitle(...)}`',
    /\{contact \? `\$\{contact\.prenom\} · \$\{penseeSubtitle\(card\.pensee, \[\], false\)\}` : card\.subtitle\}/.test(nonMemoBranch),
  );
}

console.log('\n[13] upcoming/today/past SANS contact (aucun contactId) — rendu strictement historique, aucun "Pensée personnelle"');
{
  const p = makePensee({ contactId: null, date: '2026-09-23' });
  const subtitle = penseeSubtitle(p, []);
  check('subtitle historique = date seule ("23 sept"), jamais "Pensée personnelle" (placeholder réservé au bucket memo, hors périmètre ici)', subtitle === '23 sept', subtitle);
  check('"Pensée personnelle" n’apparaît nulle part dans la branche non-memo (placeholder réservé à MemoPenseeRow)', (() => {
    const nonMemoStart = penseesSrc.indexOf("Coche visible UNIQUEMENT en mode sélection (voir §3 chantier UX) — jamais en usage normal.");
    const nonMemoEnd = penseesSrc.indexOf('/** Libellé + éventuel avatar', nonMemoStart);
    return !penseesSrc.slice(nonMemoStart, nonMemoEnd).includes('Pensée personnelle');
  })());
}

console.log('\n[14] upcoming/today/past + contactId ORPHELIN (contact introuvable) — date seule, aucun faux avatar');
{
  // Même mécanisme que le memo orphelin (Phase 4D) : contactName() renvoie '' pour un id introuvable,
  // donc penseeSubtitle(..., true) — le comportement HISTORIQUE, utilisé ici puisque contact=null —
  // retombe déjà sur la date seule, sans jamais avoir mentionné ce contact. Aucun avatar ne peut être
  // construit sans initiales/couleur réelles (contact === null → branche `{contact && ...}` ignorée).
  const orphanContactId = 'c-disparu';
  const p = makePensee({ contactId: orphanContactId, date: '2026-09-23' });
  const subtitle = penseeSubtitle(p, []); // aucun contact dans la liste → contactName renvoie ''
  check('subtitle = date seule ("23 sept"), le contactId orphelin ne fuite jamais dans le texte', subtitle === '23 sept', subtitle);
}

console.log('\n[15] Pill Rappel — texte/position inchangés (non touchés par cette passe)');
{
  const nonMemoStart = penseesSrc.indexOf("Coche visible UNIQUEMENT en mode sélection (voir §3 chantier UX) — jamais en usage normal.");
  const nonMemoEnd = penseesSrc.indexOf('/** Libellé + éventuel avatar', nonMemoStart);
  const nonMemoBranch = penseesSrc.slice(nonMemoStart, nonMemoEnd);
  check('<Pill label={card.reminderLabel} .../> reste EN DEHORS de <View style={{flex:1}}> (même position qu’avant, après le View principal)', /<\/View>\s*\{card\.reminderLabel && <Pill label=\{card\.reminderLabel\} tone="muted" theme=\{theme\} \/>\}\s*<\/Pressable>/.test(nonMemoBranch));
}

console.log('\n[16] Tri temporel — buildPenseeCards/groupPenseeCards non touchés par cette passe (exécution réelle)');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa' });
  const near = makePensee({ id: 'p-near', date: '2026-09-20', contactId: 'c-lea' });
  const far = makePensee({ id: 'p-far', date: '2026-09-25', contactId: 'c-lea' });
  const today = new Date(2026, 8, 18);
  const cards = buildPenseeCards([far, near], [lea], today);
  check('bucket upcoming pour les deux (aucun changement de classification)', cards.every((c) => c.bucket === 'upcoming'));
  check('daysFromToday cohérent (tri toujours possible sur cette valeur, non modifiée)', cards.find((c) => c.id === 'p-near')!.daysFromToday < cards.find((c) => c.id === 'p-far')!.daysFromToday);
}

console.log('\n[17] Memo (variant compact/rich, "Pensée personnelle", fallback orphelin) — non touché par cette passe');
{
  check('memoMeta / MemoPenseeRow toujours présents tels quels (aucune signature modifiée)', /function memoMeta\(contactId: string \| null, contact: Contact \| null\)/.test(penseesSrc) && /function MemoPenseeRow\(/.test(penseesSrc));
  check('"Pensée personnelle" toujours utilisé exclusivement par memoMeta (bucket memo)', penseesSrc.includes("return { label: 'Pensée personnelle', hasAvatar: false };"));
  check('"Pensée mémorisée" (fallback orphelin memo) toujours présent', penseesSrc.includes("return { label: 'Pensée mémorisée', hasAvatar: false };"));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
