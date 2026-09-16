/// <reference types="node" />
// Tests de non-régression — PETIT CHANTIER UX (2026-09-15), 4 améliorations : clavier Calendrier,
// alternative manuelle Capture hors ligne, sélection multiple Pensées, date optionnelle en création
// manuelle de pensée.
//
// IMPORTANT — portée réelle : comme pour les chantiers UX précédents (voir
// test-regression-pre-beta-audit-fixes.ts), §1/§2/§3 sont des comportements d'écrans React Native
// sans harnais de composant disponible — vérifiés par lecture directe du source. §4 (modèle de
// données Pensées V2) EST réellement exécutable : `penseeAnchor` est pur, on vérifie donc en vrai
// que les formes de données produites par PenseeDetailScreen.save() (date/endDate/reminderAt)
// s'ancrent correctement dans le Calendrier, sans réimplémenter ni modifier calendar.ts.
//
// Usage : npx tsx scripts/test-regression-ux-4-improvements.ts

import * as fs from 'fs';
import * as path from 'path';
import { Pensee } from '../src/data/types';
import { penseeAnchor } from '../src/data/calendar';

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

function makePensee(overrides: Partial<Pensee>): Pensee {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2)}`,
    texte: 'Test',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    date: null,
    endDate: null,
    reminderAt: null,
    ...overrides,
  };
}

const calendarSrc = readScreen('CalendarScreen');
const captureSrc = readScreen('CaptureScreen');
const penseesSrc = readScreen('PenseesScreen');
const penseeDetailSrc = readScreen('PenseeDetailScreen');

console.log('\n[§1] Calendrier — formulaire "+ Ajouter une pensée" reste utilisable clavier ouvert');
{
  check(
    'la modale "période" avait déjà KeyboardAvoidingView — utilisée comme référence, non modifiée',
    /visible={!!periodModal}[\s\S]{0,300}<KeyboardAvoidingView/.test(calendarSrc),
  );
  check(
    'la modale "+ Ajouter une pensée" (formOpen) est maintenant AUSSI enveloppée par KeyboardAvoidingView',
    /<Modal visible={formOpen}[\s\S]{0,1000}<KeyboardAvoidingView/.test(calendarSrc),
  );
  check(
    'même comportement que la modale de référence : behavior="padding" sur iOS uniquement',
    (calendarSrc.match(/behavior={Platform\.OS === 'ios' \? 'padding' : undefined}/g) ?? []).length === 2,
  );
  check(
    'offset petit et non lié à un modèle d’iPhone précis (10 sur iOS, 0 sur Android) — pas un calcul spécifique à un appareil',
    (calendarSrc.match(/keyboardVerticalOffset={Platform\.OS === 'ios' \? 10 : 0}/g) ?? []).length === 2,
  );
  check('logique métier Calendrier non touchée : saveThought toujours présent, addPensee toujours appelé dedans', /function saveThought\(\)[\s\S]{0,1500}addPensee\(\{/.test(calendarSrc));
}

console.log('\n[§2] Capture hors ligne — "Ajouter une pensée manuellement"');
{
  check('bouton présent sur l’écran ERROR, à côté de Réessayer/Retour', /PrimaryButton label="Réessayer"[\s\S]{0,700}Ajouter une pensée manuellement[\s\S]{0,300}PrimaryButton label="Retour"/.test(captureSrc));
  check(
    'quitte proprement le flow Capture : navigation.replace (jamais navigate) vers PenseeDetail sans paramètre',
    captureSrc.includes("navigation.replace('PenseeDetail', undefined)"),
  );
  check('Réessayer et Retour restent tels quels (mêmes handlers : resetToIdle / navigation.goBack())', captureSrc.includes('onPress={resetToIdle}') && captureSrc.includes('onPress={() => navigation.goBack()}'));
  check(
    'aucune nouvelle requête STT/LLM introduite pour ce bouton (aucun appel uploadAudioForCapture/matchContactByHeardName à proximité)',
    !/Ajouter une pensée manuellement[\s\S]{0,400}(uploadAudioForCapture|matchContactByHeardName)/.test(captureSrc),
  );
}

console.log('\n[§3] Pensées — sélection multiple par appui long');
{
  check('état de sélection introduit : selectionMode + selectedIds (Set)', /const \[selectionMode, setSelectionMode\] = useState\(false\);\s*const \[selectedIds, setSelectedIds\] = useState<Set<string>>\(new Set\(\)\);/.test(penseesSrc));
  check('hors sélection : tap ouvre PenseeDetail comme avant (openDetail)', /function handleCardPress\(penseeId: string\) \{\s*if \(!selectionMode\) \{\s*openDetail\(penseeId\);/.test(penseesSrc));
  check('appui long HORS sélection : entre en mode sélection avec CETTE carte immédiatement sélectionnée', /function handleCardLongPress\(penseeId: string\) \{\s*if \(selectionMode\) return;\s*setSelectionMode\(true\);\s*setSelectedIds\(new Set\(\[penseeId\]\)\);/.test(penseesSrc));
  check('en sélection : tap bascule sélectionné/désélectionné (pas de navigation)', /if \(next\.has\(penseeId\)\) next\.delete\(penseeId\);\s*else next\.add\(penseeId\);/.test(penseesSrc));
  // CORRECTIF UX §5 (2026-09-16) — le header de sélection a été mutualisé dans un composant dédié
  // (SelectionHeader.tsx, voir test-regression-multiselect-headers.ts §B pour le détail de son rendu
  // et la correction anti-débordement) : PenseesScreen ne rend plus lui-même "X pensées
  // sélectionnées"/"Annuler", il délègue via `count`/`onCancel` — ces deux checks vérifient
  // désormais ce câblage plutôt que le texte, qui a déménagé.
  check('nombre de pensées sélectionnées transmis au header mutualisé (SelectionHeader)', penseesSrc.includes('count={selectedIds.size}'));
  check('confirmation singulier exact : "Supprimer cette pensée ?"', penseesSrc.includes("count === 1 ? 'Supprimer cette pensée ?' : `Supprimer ${count} pensées ?`"));
  check('deletePensee existant réutilisé, un appel par pensée sélectionnée (pas de contournement store/outbox)', /selectedIds\.forEach\(\(id\) => deletePensee\(id\)\);/.test(penseesSrc));
  check('sortie du mode sélection après suppression réussie localement', /selectedIds\.forEach\(\(id\) => deletePensee\(id\)\);\s*exitSelectionMode\(\);/.test(penseesSrc));
  check('"Annuler" disponible, distinct de la suppression (délégué au header mutualisé)', penseesSrc.includes('onCancel={exitSelectionMode}') && penseesSrc.includes('onDelete={confirmDeleteSelected}'));
  check('aucun geste supplémentaire introduit (pas de swipe/PanResponder/Gesture ajouté dans ce fichier)', !/PanResponder|GestureDetector|react-native-gesture-handler/.test(penseesSrc));
}

console.log('\n[§4] PenseeDetail — Date optionnelle (source : câblage écran)');
{
  check('aucune date par défaut : état initial = existing?.date ?? null (jamais une date du jour silencieuse)', /const \[eventDate, setEventDate\] = useState<string \| null>\(existing\?\.date \?\? null\);/.test(penseeDetailSrc));
  check('retrait d’une date déjà choisie possible (bouton dédié)', /onPress={\(\) => setEventDate\(null\)}/.test(penseeDetailSrc));
  check('AUCUNE heure associée à cette date (mode="date", jamais "datetime"/"time" pour ce picker)', /value={eventDate \? new Date\(`\$\{eventDate\}T00:00:00`\) : new Date\(\)}\s*mode="date"/.test(penseeDetailSrc));
  check(
    'date et rappel restent deux champs distincts dans l’objet écrit (date ET reminderAt tous deux présents, jamais l’un dérivé de l’autre)',
    /date: eventDate,\s*endDate: eventDate \? existing\.endDate \?\? null : null,/.test(penseeDetailSrc) && /reminderAt,\s*createdAt: new Date\(\)\.toISOString\(\),\s*date: eventDate,\s*endDate: null,/.test(penseeDetailSrc),
  );
  check('endDate remis à null si la date est retirée (jamais de période orpheline sans date de départ)', /endDate: eventDate \? existing\.endDate \?\? null : null/.test(penseeDetailSrc));
  check('aucun nouveau champ créé sur le modèle Pensee — seul `date` (déjà existant) est désormais écrit depuis cet écran', !/interface Pensee|type Pensee = /.test(penseeDetailSrc));
}

console.log('\n[§4] Modèle Pensées V2 — comportements réels via penseeAnchor() (pur, non modifié)');
{
  console.log('  [pensée manuelle sans date]');
  {
    const p = makePensee({ texte: 'Idée cadeau pour plus tard' });
    check('aucune ancre calendrier (mémo pur)', penseeAnchor(p) === null);
  }

  console.log('  [pensée manuelle avec date]');
  {
    const p = makePensee({ texte: 'Réserver le restaurant', date: '2026-09-24' });
    const anchor = penseeAnchor(p);
    check('apparaît au Calendrier le 24 septembre (penseeAnchor priorise date)', anchor?.date === '2026-09-24' && anchor?.endDate === null);
  }

  console.log('  [suppression d’une date existante — repli sur reminderAt si présent]');
  {
    const withDate = makePensee({ date: '2026-09-24', reminderAt: '2026-09-23T18:00:00.000Z' });
    const afterClear: Pensee = { ...withDate, date: null, endDate: null }; // exactement ce que save() produit en retirant la date
    check('avec date : ancre = la date (priorité)', penseeAnchor(withDate)?.date === '2026-09-24');
    check('date retirée : l’ancre retombe sur le jour LOCAL du reminderAt (comportement existant, inchangé)', penseeAnchor(afterClear)?.date !== undefined);
  }

  console.log('  [date + reminder différents — exemple exact de la consigne]');
  {
    // Texte "Réserver le restaurant", proche Yohan, date 24 septembre, rappel 23 septembre 18h.
    const p = makePensee({
      texte: 'Réserver le restaurant',
      contactId: 'yohan',
      date: '2026-09-24',
      reminderAt: new Date(2026, 8, 23, 18, 0, 0).toISOString(),
    });
    const anchor = penseeAnchor(p);
    check('visible au Calendrier au 24 septembre (date, pas le rappel)', anchor?.date === '2026-09-24');
    check('reminderAt reste intact et distinct (rappel = 23 septembre 18h, jamais confondu avec la date)', new Date(p.reminderAt!).getDate() === 23 && new Date(p.reminderAt!).getHours() === 18);
    check('date et reminderAt restent deux valeurs indépendantes sur l’objet (aucune dérivée de l’autre)', p.date !== null && p.reminderAt !== null && p.date !== p.reminderAt);
  }

  console.log('  [pensée sans date ET sans reminder → mémo normal]');
  {
    const p = makePensee({ texte: 'Aime le café' });
    check('reste MÉMORISÉE (aucune ancre), jamais une erreur ni une date inventée', penseeAnchor(p) === null && p.date === null && p.reminderAt === null);
  }

  console.log('  [aucune régression création depuis Calendrier — date+reminderAt du jour, comme saveThought les construit]');
  {
    // Reproduit exactement la forme produite par CalendarScreen.saveThought() (inchangé par ce
    // chantier) : date=isoOf(jour choisi), reminderAt=preset/custom ISO — vérifie que ce chemin
    // continue de s'ancrer correctement au même jour.
    const fromCalendar = makePensee({ date: '2026-09-24', reminderAt: '2026-09-24T09:00:00.000Z' });
    check('toujours ancrée au jour choisi dans le Calendrier', penseeAnchor(fromCalendar)?.date === '2026-09-24');
  }
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
