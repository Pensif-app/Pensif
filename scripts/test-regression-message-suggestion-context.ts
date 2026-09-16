/// <reference types="node" />
// Tests de non-régression — CHANTIER RÉPONSES INTELLIGENTES, incrément 0 (2026-09-16) : contexte pur
// `buildMessageSuggestionContext` (messageSuggestion.ts). Aucun réseau, aucune UI, aucune décision
// IA — uniquement la construction déterministe du contexte transmis plus tard à l'Edge Function
// (pas encore écrite, incrément 1).
//
// Usage : npx tsx scripts/test-regression-message-suggestion-context.ts

import { Contact, Pensee, QuizProfile } from '../src/data/types';
import { buildMessageSuggestionContext } from '../src/data/messageSuggestion';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function makeContact(overrides: Partial<Contact>): Contact {
  return {
    id: overrides.id ?? 'c-1',
    prenom: 'Yohan',
    nom: 'Martin',
    tel: '',
    date: '1990-06-15',
    relation: 'Famille',
    familyRole: 'Frère',
    genre: 'homme',
    initials: 'YM',
    color: 'sage',
    quiz: null,
    giftPreparedYear: null,
    favorite: false,
    birthdayReminderDays: null,
    ...overrides,
  };
}

function makePensee(overrides: Partial<Pensee>): Pensee {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2)}`,
    texte: 'Test',
    contactId: 'c-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    date: null,
    endDate: null,
    reminderAt: null,
    pinned: false,
    ...overrides,
  } as Pensee;
}

function makeCompleteQuiz(overrides: Partial<QuizProfile> = {}): QuizProfile {
  return {
    answers: ['A', 'B', 'A', 'B', 'A', 'B', 'A'],
    interests: ['musique', 'gaming'],
    avoid: [],
    wish: 'Un casque audio',
    completedAt: '2026-01-01T00:00:00.000Z',
    themeAnswers: {},
    feedback: [],
    recommendationHistory: [],
    budget: null,
    ...overrides,
  };
}

const TODAY = new Date(2026, 5, 10); // 10 juin 2026 — 5 jours avant l'anniversaire du contact (15 juin)

console.log('\n[1] Occasion birthday — daysUntil calculé côté client (calendar.ts), jamais halluciné');
{
  const contact = makeContact({});
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'birthday');
  check('résultat ok', result.ok === true);
  if (result.ok) {
    check('occasion = birthday', result.context.occasion.occasion === 'birthday');
    check('daysUntil = 5 (15 juin - 10 juin)', result.context.occasion.occasion === 'birthday' && result.context.occasion.daysUntil === 5, JSON.stringify(result.context.occasion));
  }
}

console.log('\n[2] Occasion birthday — jour J (daysUntil = 0)');
{
  const contact = makeContact({ date: '1990-06-10' });
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'birthday');
  check('daysUntil = 0 le jour J', result.ok && result.context.occasion.occasion === 'birthday' && result.context.occasion.daysUntil === 0);
}

console.log('\n[3] Occasion thinking_of_you — contexte minimal, aucun champ inventé');
{
  const contact = makeContact({});
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'thinking_of_you');
  check('résultat ok', result.ok === true);
  check('occasion = thinking_of_you, aucun champ supplémentaire', result.ok && JSON.stringify(result.context.occasion) === JSON.stringify({ occasion: 'thinking_of_you' }));
}

console.log('\n[4] Quiz — présent uniquement si isQuizComplete, jamais un profil partiel deviné');
{
  const withQuiz = makeContact({ quiz: makeCompleteQuiz() });
  const r1 = buildMessageSuggestionContext(withQuiz, [], TODAY, 'thinking_of_you');
  check('quiz complet → interests/wish transmis', r1.ok && r1.context.quiz?.wish === 'Un casque audio' && r1.context.quiz.interests.includes('musique'));

  const noQuiz = makeContact({ quiz: null });
  const r2 = buildMessageSuggestionContext(noQuiz, [], TODAY, 'thinking_of_you');
  check('quiz absent → null (jamais inventé)', r2.ok && r2.context.quiz === null);

  const incompleteQuiz = makeContact({ quiz: { ...makeCompleteQuiz(), completedAt: '' } as QuizProfile });
  const r3 = buildMessageSuggestionContext(incompleteQuiz, [], TODAY, 'thinking_of_you');
  check('quiz non complété (completedAt vide) → null malgré des réponses présentes', r3.ok && r3.context.quiz === null);
}

console.log('\n[5] Pensées liées — max 5, plus récentes, triées, marquées facultatives, autres contacts exclus');
{
  const contact = makeContact({});
  const pensees: Pensee[] = [
    makePensee({ id: 'p1', texte: 'Ancienne 1', createdAt: '2026-01-01T00:00:00.000Z' }),
    makePensee({ id: 'p2', texte: 'Récente 2', createdAt: '2026-01-02T00:00:00.000Z' }),
    makePensee({ id: 'p3', texte: 'Récente 3', createdAt: '2026-01-03T00:00:00.000Z' }),
    makePensee({ id: 'p4', texte: 'Récente 4', createdAt: '2026-01-04T00:00:00.000Z' }),
    makePensee({ id: 'p5', texte: 'Récente 5', createdAt: '2026-01-05T00:00:00.000Z' }),
    makePensee({ id: 'p6', texte: 'La plus récente', createdAt: '2026-01-06T00:00:00.000Z' }),
    makePensee({ id: 'p-other', texte: 'Pensée d’un autre contact', contactId: 'c-autre', createdAt: '2026-01-07T00:00:00.000Z' }),
  ];
  const result = buildMessageSuggestionContext(contact, pensees, TODAY, 'thinking_of_you');
  check('résultat ok', result.ok === true);
  if (result.ok) {
    check('exactement 5 pensées (sur 6 liées à ce contact)', result.context.pensees.items.length === 5, String(result.context.pensees.items.length));
    check('les 5 sont les plus récentes, triées de la plus récente à la plus ancienne', result.context.pensees.items.join(',') === ['La plus récente', 'Récente 5', 'Récente 4', 'Récente 3', 'Récente 2'].join(','), result.context.pensees.items.join(' | '));
    check('la pensée la plus ancienne (p1) est exclue (au-delà des 5)', !result.context.pensees.items.includes('Ancienne 1'));
    check('la pensée d’un autre contact n’apparaît jamais', !result.context.pensees.items.includes('Pensée d’un autre contact'));
    check('marquage explicite optional:true transmis au futur prompt', result.context.pensees.optional === true);
  }
}

console.log('\n[6] Pensées liées — aucune pensée : contexte construit quand même, tableau vide, pas d’erreur');
{
  const contact = makeContact({});
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'thinking_of_you');
  check('résultat ok même sans aucune pensée', result.ok === true);
  check('tableau vide, toujours marqué optional', result.ok && result.context.pensees.items.length === 0 && result.context.pensees.optional === true);
}

console.log('\n[7] Occasion event — refuse proprement sans pensée fournie (jamais d’occasion inventée)');
{
  const contact = makeContact({});
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'event');
  check('refuse (ok:false)', result.ok === false);
  check('raison = event_missing_pensee', !result.ok && result.reason === 'event_missing_pensee');
}

console.log('\n[8] Occasion event — refuse si la pensée fournie n’a pas de date (pas une ancre réelle)');
{
  const contact = makeContact({});
  const undatedPensee = makePensee({ texte: 'Une note sans date', date: null });
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'event', undatedPensee);
  check('refuse (ok:false)', result.ok === false);
  check('raison = event_pensee_missing_date', !result.ok && result.reason === 'event_pensee_missing_date');
}

console.log('\n[9] Occasion event — refuse si la pensée fournie appartient à un AUTRE contact (garde du penseeId résolu)');
{
  const contact = makeContact({ id: 'c-1' });
  const wrongContactPensee = makePensee({ texte: 'Anniversaire de mariage', date: '2026-07-01', contactId: 'c-2' });
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'event', wrongContactPensee);
  check('refuse (ok:false)', result.ok === false);
  check('raison = event_pensee_wrong_contact', !result.ok && result.reason === 'event_pensee_wrong_contact');
}

console.log('\n[10] Occasion event — réussit avec une pensée datée valide appartenant à ce contact, texte/date fidèles');
{
  const contact = makeContact({ id: 'c-1' });
  const eventPensee = makePensee({ texte: 'Décroche son nouveau poste', date: '2026-09-20', contactId: 'c-1' });
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'event', eventPensee);
  check('résultat ok', result.ok === true);
  if (result.ok) {
    check('occasion = event', result.context.occasion.occasion === 'event');
    check('texte fidèle à la pensée, rien de reformulé/interprété', result.context.occasion.occasion === 'event' && result.context.occasion.texte === 'Décroche son nouveau poste');
    check('date fidèle à la pensée', result.context.occasion.occasion === 'event' && result.context.occasion.date === '2026-09-20');
  }
}

console.log('\n[11] Déterminisme — deux appels identiques produisent exactement le même contexte');
{
  const contact = makeContact({ quiz: makeCompleteQuiz() });
  const pensees = [makePensee({ texte: 'Une pensée' })];
  const r1 = buildMessageSuggestionContext(contact, pensees, TODAY, 'birthday');
  const r2 = buildMessageSuggestionContext(contact, pensees, TODAY, 'birthday');
  check('résultats strictement identiques (aucun aléatoire, aucune horloge implicite)', JSON.stringify(r1) === JSON.stringify(r2));
}

console.log('\n[12] Aucun réseau/IA — fonction strictement synchrone (pas de Promise)');
{
  const contact = makeContact({});
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'thinking_of_you');
  check('le résultat n’est pas une Promise (aucun appel asynchrone/réseau possible ici)', !(result instanceof Promise));
}

// --- CHANTIER RÉPONSES INTELLIGENTES — filet de sécurité données sensibles (2026-09-16) -----------
// Réutilise le VRAI filtre (sensitiveContentFilter.ts), jamais une réimplémentation — ces tests
// vérifient exclusivement le CÂBLAGE (où/quand le filtre s'applique dans buildMessageSuggestionContext),
// la couverture des catégories elle-même est testée dans test-regression-sensitive-content-filter.ts.

console.log('\n[13] Pensée sensible parmi >5 pensées — exclue AVANT le tri/slice (ne prend jamais la place d’une pensée ordinaire)');
{
  const contact = makeContact({});
  const pensees: Pensee[] = [
    makePensee({ id: 'p1', texte: 'Ordinaire 1', createdAt: '2026-01-01T00:00:00.000Z' }),
    makePensee({ id: 'p2', texte: 'Ordinaire 2', createdAt: '2026-01-02T00:00:00.000Z' }),
    makePensee({ id: 'p3', texte: 'Ordinaire 3', createdAt: '2026-01-03T00:00:00.000Z' }),
    makePensee({ id: 'p4', texte: 'Ordinaire 4', createdAt: '2026-01-04T00:00:00.000Z' }),
    makePensee({ id: 'p5', texte: 'Ordinaire 5', createdAt: '2026-01-05T00:00:00.000Z' }),
    // La plus récente de toutes — mais sensible, ne doit JAMAIS apparaître, ni prendre la place
    // d’"Ordinaire 1" dans le top 5.
    makePensee({ id: 'p6-sensible', texte: 'Diagnostic de cancer confirmé cette semaine.', createdAt: '2026-01-06T00:00:00.000Z' }),
  ];
  const result = buildMessageSuggestionContext(contact, pensees, TODAY, 'thinking_of_you');
  check('résultat ok', result.ok === true);
  if (result.ok) {
    check('la pensée sensible n’apparaît jamais dans le contexte', !result.context.pensees.items.some((t) => t.includes('cancer')));
    check('exactement 5 pensées, toutes ordinaires (Ordinaire 1 à 5, la sensible n’a pris la place d’aucune)', result.context.pensees.items.length === 5 && result.context.pensees.items.includes('Ordinaire 1'));
    check('toujours marqué optional:true', result.context.pensees.optional === true);
  }
}

console.log('\n[14] quiz.wish sensible → remplacé par une chaîne vide, le reste du quiz (interests) intact');
{
  const contact = makeContact({ quiz: makeCompleteQuiz({ interests: ['musique', 'gaming'], wish: 'Se remettre de sa dépression, un peu de repos lui ferait du bien' }) });
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'thinking_of_you');
  check('résultat ok', result.ok === true);
  if (result.ok) {
    check('wish devient une chaîne vide (sensible)', result.context.quiz?.wish === '');
    check('interests reste intact, non affecté par le filtre', result.context.quiz?.interests.length === 2 && result.context.quiz.interests.includes('musique'));
  }
}

console.log('\n[15] quiz.wish ordinaire — jamais altéré par le filtre');
{
  const contact = makeContact({ quiz: makeCompleteQuiz({ wish: 'Un casque audio' }) });
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'thinking_of_you');
  check('wish ordinaire transmis tel quel', result.ok && result.context.quiz?.wish === 'Un casque audio');
}

console.log('\n[16] Pensées ordinaires — jamais affectées par le filtre (non-régression du cas nominal)');
{
  const contact = makeContact({});
  const pensees = [
    makePensee({ texte: 'Adore les randonnées le week-end.', createdAt: '2026-01-01T00:00:00.000Z' }),
    makePensee({ texte: 'Prépare un semi-marathon.', createdAt: '2026-01-02T00:00:00.000Z' }),
  ];
  const result = buildMessageSuggestionContext(contact, pensees, TODAY, 'thinking_of_you');
  check('les 2 pensées ordinaires sont bien conservées', result.ok && result.context.pensees.items.length === 2);
}

console.log('\n[17] Aucune régression sur la construction du contexte event/birthday/thinking_of_you (le filtre ne touche que pensées/wish)');
{
  const contact = makeContact({ date: '1990-06-15' });
  const rBirthday = buildMessageSuggestionContext(contact, [], new Date(2026, 5, 10), 'birthday');
  check('birthday : occasion/daysUntil inchangés', rBirthday.ok && rBirthday.context.occasion.occasion === 'birthday' && rBirthday.context.occasion.daysUntil === 5);

  const rThinking = buildMessageSuggestionContext(contact, [], TODAY, 'thinking_of_you');
  check('thinking_of_you : occasion inchangée', rThinking.ok && rThinking.context.occasion.occasion === 'thinking_of_you');

  const eventPensee = makePensee({ id: 'ev', texte: 'Décroche son nouveau poste', date: '2026-09-20', contactId: contact.id });
  const rEvent = buildMessageSuggestionContext(contact, [], TODAY, 'event', eventPensee);
  check(
    'event : texte/date de l’ancre transmis fidèlement, non affectés par le filtre (le filtre ne s’applique qu’aux pensées liées optionnelles et au wish, pas à l’ancre event elle-même)',
    rEvent.ok && rEvent.context.occasion.occasion === 'event' && rEvent.context.occasion.texte === 'Décroche son nouveau poste' && rEvent.context.occasion.date === '2026-09-20',
  );
}

// --- CHANTIER RÉPONSES INTELLIGENTES — l'ancre event elle-même ne doit jamais contourner le filtre --
// (2026-09-16). Une pensée datée sensible servant d'ancre à occasion="event" doit bloquer TOUTE
// génération pour cet événement — jamais un repli thinking_of_you, jamais un texte vidé.

console.log('\n[18] Ancre event sensible — santé physique → bloquée');
{
  const contact = makeContact({ id: 'c-18' });
  const eventPensee = makePensee({ texte: 'Diagnostic de cancer confirmé la semaine dernière.', date: '2026-09-20', contactId: 'c-18' });
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'event', eventPensee);
  check('résultat bloqué (ok:false)', result.ok === false);
  check('raison = event_pensee_sensitive', !result.ok && result.reason === 'event_pensee_sensitive');
}

console.log('\n[19] Ancre event sensible — santé mentale → bloquée');
{
  const contact = makeContact({ id: 'c-19' });
  const eventPensee = makePensee({ texte: 'Début d’un suivi en thérapie pour sa dépression.', date: '2026-09-20', contactId: 'c-19' });
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'event', eventPensee);
  check('résultat bloqué (ok:false)', result.ok === false);
  check('raison = event_pensee_sensitive', !result.ok && result.reason === 'event_pensee_sensitive');
}

console.log('\n[20] Ancre event sensible — deuil → bloquée');
{
  const contact = makeContact({ id: 'c-20' });
  const eventPensee = makePensee({ texte: 'Obsèques de son grand-père prévues ce jour-là.', date: '2026-09-20', contactId: 'c-20' });
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'event', eventPensee);
  check('résultat bloqué (ok:false)', result.ok === false);
  check('raison = event_pensee_sensitive', !result.ok && result.reason === 'event_pensee_sensitive');
}

console.log('\n[21] Ancre event sensible — addiction → bloquée');
{
  const contact = makeContact({ id: 'c-21' });
  const eventPensee = makePensee({ texte: 'Entre en cure de désintox ce jour-là.', date: '2026-09-20', contactId: 'c-21' });
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'event', eventPensee);
  check('résultat bloqué (ok:false)', result.ok === false);
  check('raison = event_pensee_sensitive', !result.ok && result.reason === 'event_pensee_sensitive');
}

console.log('\n[22] Ancre event sensible — violence/abus → bloquée');
{
  const contact = makeContact({ id: 'c-22' });
  const eventPensee = makePensee({ texte: 'Audience pour son dossier d’agression ce jour-là.', date: '2026-09-20', contactId: 'c-22' });
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'event', eventPensee);
  check('résultat bloqué (ok:false)', result.ok === false);
  check('raison = event_pensee_sensitive', !result.ok && result.reason === 'event_pensee_sensitive');
}

console.log('\n[23] Ancre event ORDINAIRE — inchangée, toujours acceptée normalement');
{
  const contact = makeContact({ id: 'c-23' });
  const eventPensee = makePensee({ texte: 'Décroche son nouveau poste, commence le mois prochain.', date: '2026-09-20', contactId: 'c-23' });
  const result = buildMessageSuggestionContext(contact, [], TODAY, 'event', eventPensee);
  check('résultat ok (aucune régression sur un événement ordinaire)', result.ok === true);
  if (result.ok) {
    check('occasion = event, texte/date fidèles', result.context.occasion.occasion === 'event' && result.context.occasion.texte === eventPensee.texte && result.context.occasion.date === '2026-09-20');
  }
}

console.log('\n[24] Événement sensible bloqué — jamais de repli thinking_of_you, jamais un texte vidé, aucun contexte partiel retourné');
{
  const contact = makeContact({ id: 'c-24', quiz: makeCompleteQuiz({ wish: 'Un cadeau ordinaire' }) });
  const linkedPensees = [makePensee({ texte: 'Une pensée ordinaire liée.', contactId: 'c-24', createdAt: '2026-01-01T00:00:00.000Z' })];
  const eventPensee = makePensee({ texte: 'Hospitalisée en urgence hier soir.', date: '2026-09-20', contactId: 'c-24' });
  const result = buildMessageSuggestionContext(contact, linkedPensees, TODAY, 'event', eventPensee);
  check('bloqué, pas un objet "ok:true" avec occasion=thinking_of_you déguisée', result.ok === false && (result.ok || result.reason === 'event_pensee_sensitive'));
  check('aucun champ "context" du tout dans le résultat bloqué (pas de fuite partielle)', !('context' in result));
}

console.log('\n[25] Aucune requête suggest-message ne peut être construite depuis un événement sensible — la fonction retourne, ne jette jamais, l’appelant ne peut matérialiser aucun payload réseau');
{
  const contact = makeContact({ id: 'c-25' });
  const eventPensee = makePensee({ texte: 'Diagnostic de cancer confirmé.', date: '2026-09-20', contactId: 'c-25' });
  let threw = false;
  let result: ReturnType<typeof buildMessageSuggestionContext> | undefined;
  try {
    result = buildMessageSuggestionContext(contact, [], TODAY, 'event', eventPensee);
  } catch {
    threw = true;
  }
  check('aucune exception levée (résultat typé explicite, pas un flux d’erreur)', !threw);
  check('result.ok === false → l’appelant ne peut PAS construire de corps de requête (pas de "context" à sérialiser)', result !== undefined && result.ok === false);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
