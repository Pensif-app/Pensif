// Phase 3 — génère des profils synthétiques et affiche ce que le moteur de recommandation
// produirait réellement (pas juste des chiffres d'audit) : pool initial, effet des filtres durs,
// effet du budget, score de chaque candidat et raisons principales, Top 3. Lancé avec ts-node
// (aucune dépendance ajoutée au projet — npx le télécharge à la volée).
//
// Usage : npx ts-node scripts/test-profiles.ts

import { Contact, QuizProfile } from '../src/data/types';
import { generateCandidates, topRecommendations, whyForContact } from '../src/data/recommendationEngine';

function makeQuiz(overrides: Partial<QuizProfile>): QuizProfile {
  return {
    answers: ['A', 'B', 'A', 'B', 'A', 'B', 'A'],
    interests: [],
    avoid: [],
    wish: '',
    completedAt: new Date().toISOString(),
    budget: null,
    themeAnswers: {},
    feedback: [],
    recommendationHistory: [],
    ...overrides,
  };
}

function makeContact(prenom: string, genre: 'homme' | 'femme', quiz: QuizProfile): Contact {
  return {
    id: `test-${prenom}`,
    prenom,
    nom: '',
    tel: '',
    date: '2000-01-01',
    relation: 'Ami',
    familyRole: null,
    genre,
    initials: prenom[0],
    color: 'sage',
    quiz,
    giftSent: false,
    favorite: false,
    birthdayReminderDays: null,
  };
}

type Profile = { label: string; contact: Contact; budgetMax: number };

const profiles: Profile[] = [
  {
    label: 'Gaming / PlayStation / Setup / Avancé / Multijoueur — budget 50€',
    contact: makeContact(
      'Gael',
      'homme',
      makeQuiz({
        interests: ['gaming'],
        themeAnswers: {
          gaming: { platform: 'playstation', focus: 'setup', equipmentLevel: 'avance', social: 'amis' },
        },
      })
    ),
    budgetMax: 50,
  },
  {
    label: 'Gaming / Xbox / Fandom — budget 30€ (doit exclure toute carte non-Xbox et tout accessoire PlayStation)',
    contact: makeContact(
      'Nora',
      'femme',
      makeQuiz({
        interests: ['gaming'],
        themeAnswers: {
          gaming: { platform: 'xbox', focus: 'fandom' },
        },
      })
    ),
    budgetMax: 30,
  },
  {
    label: 'Cuisine / Déguster / Café / Passionné / Upgrade — budget 40€',
    contact: makeContact(
      'Julie',
      'femme',
      makeQuiz({
        interests: ['cuisine'],
        themeAnswers: {
          cuisine: { rapport: 'deguster', univers: 'cafe', niveau: 'passionne', preference: 'upgrade' },
        },
      })
    ),
    budgetMax: 40,
  },
  {
    label: 'Sport / Running / Matériel — budget 40€',
    contact: makeContact(
      'Marc',
      'homme',
      makeQuiz({
        interests: ['sport'],
        themeAnswers: {
          sport: { discipline: 'running', niveau: 'regulier', besoin: 'materiel' },
        },
      })
    ),
    budgetMax: 40,
  },
  {
    label: 'Sport / Vélo / Matériel — budget 35€',
    contact: makeContact(
      'Sami',
      'homme',
      makeQuiz({
        interests: ['sport'],
        themeAnswers: {
          sport: { discipline: 'velo', niveau: 'regulier', besoin: 'materiel' },
        },
      })
    ),
    budgetMax: 35,
  },
  {
    label: 'Photo / Smartphone / Prise de vue créative — budget 60€',
    contact: makeContact(
      'Lina',
      'femme',
      makeQuiz({
        interests: ['photo'],
        themeAnswers: {
          photo: { appareil: 'smartphone', usage: 'prise-de-vue', niveau: 'amateur', besoin: 'creatif' },
        },
      })
    ),
    budgetMax: 60,
  },
  {
    label: 'Collection / TCG / Protéger + Organiser — budget 30€',
    contact: makeContact(
      'Theo',
      'homme',
      makeQuiz({
        interests: ['collection'],
        themeAnswers: {
          collection: { type: 'tcg', usage: 'proteger,organiser', niveau: 'regulier' },
        },
      })
    ),
    budgetMax: 30,
  },
  {
    label: 'Collection / Figurines / Exposer — budget 30€',
    contact: makeContact(
      'Alix',
      'femme',
      makeQuiz({
        interests: ['collection'],
        themeAnswers: {
          collection: { type: 'figurines', usage: 'exposer', niveau: 'regulier' },
        },
      })
    ),
    budgetMax: 30,
  },
  {
    label: 'Musique / Joue guitare — budget 25€',
    contact: makeContact(
      'Owen',
      'homme',
      makeQuiz({
        interests: ['musique'],
        themeAnswers: {
          musique: { mode: 'jouer', instrument: 'guitare' },
        },
      })
    ),
    budgetMax: 25,
  },
  {
    label: 'Musique / Joue piano — budget 30€',
    contact: makeContact(
      'Camille',
      'femme',
      makeQuiz({
        interests: ['musique'],
        themeAnswers: {
          musique: { mode: 'jouer', instrument: 'piano' },
        },
      })
    ),
    budgetMax: 30,
  },
  {
    label: 'Nature / Camping / Equipement — budget 40€',
    contact: makeContact(
      'Ines',
      'femme',
      makeQuiz({
        interests: ['nature'],
        themeAnswers: {
          nature: { activite: 'camping', priorite: 'equipement', niveau: 'regulier' },
        },
      })
    ),
    budgetMax: 40,
  },
  {
    label: 'Jardinage / Balcon — budget 30€',
    contact: makeContact(
      'Paul',
      'homme',
      makeQuiz({
        interests: ['jardinage'],
        themeAnswers: {
          jardinage: { lieu: 'balcon', niveau: 'debutant' },
        },
      })
    ),
    budgetMax: 30,
  },
  {
    label: 'Tech / Maison connectée débutant — budget 25€',
    contact: makeContact(
      'Sofia',
      'femme',
      makeQuiz({
        interests: ['tech'],
        themeAnswers: {
          tech: { usage: 'maison', priorite: 'automatisation', equipmentLevel: 'basique' },
        },
      })
    ),
    budgetMax: 25,
  },
  {
    label: 'Voyage / Sécurité + Organisation — budget 25€',
    contact: makeContact(
      'Karim',
      'homme',
      makeQuiz({
        interests: ['voyage'],
        themeAnswers: {
          voyage: { besoin: 'securite,organisation', type: 'weekend' },
        },
      })
    ),
    budgetMax: 25,
  },
  {
    label: 'Maison / Bureau organisation — budget 30€',
    contact: makeContact(
      'Elise',
      'femme',
      makeQuiz({
        interests: ['maison'],
        themeAnswers: {
          maison: { zone: 'bureau', besoin: 'organisation', style: 'minimaliste' },
        },
      })
    ),
    budgetMax: 30,
  },
  {
    label: 'Art / Calligraphie débutant — budget 50€',
    contact: makeContact(
      'Noe',
      'homme',
      makeQuiz({
        interests: ['art'],
        themeAnswers: {
          art: { pratique: 'calligraphie', niveau: 'debutant', support: 'manuel' },
        },
      })
    ),
    budgetMax: 50,
  },
  {
    label: 'Auto / DIY entretien — budget 40€',
    contact: makeContact(
      'Hugo',
      'homme',
      makeQuiz({
        interests: ['auto'],
        themeAnswers: {
          auto: { diy: 'oui', profil: 'entretien', besoin: 'entretien,technologie' },
        },
      })
    ),
    budgetMax: 40,
  },
  {
    label: 'Bricolage / Mécanique — budget 35€',
    contact: makeContact(
      'Yanis',
      'homme',
      makeQuiz({
        interests: ['bricolage'],
        themeAnswers: {
          bricolage: { univers: 'mecanique', outil: 'manuel' },
        },
      })
    ),
    budgetMax: 35,
  },
];

profiles.push(
  {
    label: 'Bien-être / Relaxation sans parfum — budget 30€',
    contact: makeContact(
      'Alma',
      'femme',
      makeQuiz({
        interests: ['bienetre'],
        themeAnswers: {
          bienetre: { besoin: 'relaxation', parfum: 'non', format: 'simple' },
        },
      })
    ),
    budgetMax: 30,
  },
  {
    label: 'Lecture / Organisation + mobilité — budget 25€',
    contact: makeContact(
      'Victor',
      'homme',
      makeQuiz({
        interests: ['lecture'],
        themeAnswers: {
          lecture: { besoin: 'organisation', contexte: 'mobilite' },
        },
      })
    ),
    budgetMax: 25,
  },
  {
    label: 'Mode / Vêtement casual, taille inconnue — budget 25€',
    contact: makeContact(
      'Zoe',
      'femme',
      makeQuiz({
        interests: ['mode'],
        themeAnswers: {
          mode: { categorie: 'vetements', style: 'casual', tailleConnue: 'non' },
        },
      })
    ),
    budgetMax: 25,
  },
  {
    label: 'Cinéma / Sortie ciné — budget 30€',
    contact: makeContact(
      'Adam',
      'homme',
      makeQuiz({
        interests: ['cinema'],
        themeAnswers: {
          cinema: { contexte: 'cinema', besoin: 'experience' },
        },
      })
    ),
    budgetMax: 30,
  },
  {
    label: 'Danse / Studio confort — budget 30€',
    contact: makeContact(
      'Lea',
      'femme',
      makeQuiz({
        interests: ['danse'],
        themeAnswers: {
          danse: { lieu: 'studio', besoin: 'confort,accessoires' },
        },
      })
    ),
    budgetMax: 30,
  }
);

for (const p of profiles) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`PROFILE — ${p.label}`);
  console.log('='.repeat(70));

  const allCandidates = generateCandidates(p.contact, { maxEuros: Infinity });
  const withinBudget = generateCandidates(p.contact, { maxEuros: p.budgetMax });

  console.log(`Pool initial (intérêts du contact, tout budget) : ${allCandidates.length}`);
  console.log(`Après budget (<= ${p.budgetMax}€) : ${withinBudget.length}`);

  const top3 = topRecommendations(withinBudget, 3);
  if (top3.length === 0) {
    console.log('Aucun candidat — vérifier si le budget est trop bas ou si un filtre dur élimine tout le pool.');
  }
  top3.forEach((c, i) => {
    const r = c.reasons;
    const reasonBits: string[] = [];
    if (r.interest) reasonBits.push('intérêt');
    if (r.trait) reasonBits.push(`trait ${r.trait}`);
    if (r.themeAnswer) reasonBits.push('réponse affinage');
    if (r.genericAnswer) reasonBits.push('réponse générique');
    if (r.wishMatch) reasonBits.push('texte libre');
    if (r.favoriteText) reasonBits.push(`favori: ${r.favoriteText}`);
    if (r.likedSimilar) reasonBits.push('similaire à un like');
    console.log(`\n${i + 1}. ${c.gift.title} (${c.gift.price}€) — score ${Math.round(c.score)}`);
    console.log(`   concept: ${c.gift.giftConcept ?? '(non renseigné)'} — raisons: ${reasonBits.join(', ') || 'aucune (fallback prix/tri)'}`);
    console.log(`   "${whyForContact(c, p.contact)}"`);
  });
}
