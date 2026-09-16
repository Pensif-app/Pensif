// Corpus fixe partagé — CHANTIER RÉPONSES INTELLIGENTES. Extrait de
// benchmark-suggest-message-llm-models.ts (run diagnostic A/B) pour être réutilisé À L'IDENTIQUE par
// le benchmark final mini-only (benchmark-suggest-message-final-mini.ts) — garantit "mêmes 18 cas",
// pas une simple ressemblance visuelle entre deux copies.
//
// 18 cas, couvre explicitement : birthday jour J et à venir, thinking_of_you, event, les 3 tons,
// contexte très pauvre, quiz riche sans pensée, pensées pertinentes, pensées hors sujet, plusieurs
// pensées dont une seule pertinente, wish exploitable mais pas à forcer, contexte permettant une
// personnalisation sans invention.
import { MessageSuggestionContext, MessageTone } from '../supabase/functions/suggest-message/contract.ts';

export type Case = { id: string; label: string; tone: MessageTone; context: MessageSuggestionContext };

export const CASES: Case[] = [
  {
    id: '1',
    label: 'Birthday jour J — chaleureux — quiz + pensée pertinente',
    tone: 'chaleureux',
    context: {
      contact: { prenom: 'Yohan', genre: 'homme', relation: 'Famille', familyRole: 'Frère' },
      occasion: { occasion: 'birthday', daysUntil: 0 },
      quiz: { interests: ['musique', 'gaming'], wish: 'Un casque audio' },
      pensees: { optional: true, items: ['A galéré à trouver un appart ce mois-ci, super soulagé d’avoir enfin signé.'] },
    },
  },
  {
    id: '2',
    label: 'Birthday dans 5 jours — complice — quiz riche, AUCUNE pensée',
    tone: 'complice',
    context: {
      contact: { prenom: 'Sofia', genre: 'femme', relation: 'Amie', familyRole: null },
      occasion: { occasion: 'birthday', daysUntil: 5 },
      quiz: { interests: ['voyage', 'cuisine', 'photo'], wish: 'Un appareil photo instantané' },
      pensees: { optional: true, items: [] },
    },
  },
  {
    id: '3',
    label: 'Birthday demain — court — contexte TRÈS PAUVRE (quasi rien)',
    tone: 'court',
    context: {
      contact: { prenom: 'Karim', genre: null, relation: 'Collègue', familyRole: null },
      occasion: { occasion: 'birthday', daysUntil: 1 },
      quiz: null,
      pensees: { optional: true, items: [] },
    },
  },
  {
    id: '4',
    label: 'Thinking of you — chaleureux — pensées pertinentes',
    tone: 'chaleureux',
    context: {
      contact: { prenom: 'Léa', genre: 'femme', relation: 'Amie', familyRole: null },
      occasion: { occasion: 'thinking_of_you' },
      quiz: null,
      pensees: { optional: true, items: ['Passe un entretien important la semaine prochaine, un peu stressée.', 'A recommencé le yoga récemment.'] },
    },
  },
  {
    id: '5',
    label: 'Thinking of you — complice — pensées TOTALEMENT HORS SUJET (à ignorer)',
    tone: 'complice',
    context: {
      contact: { prenom: 'Paul', genre: 'homme', relation: 'Ami', familyRole: null },
      occasion: { occasion: 'thinking_of_you' },
      quiz: null,
      pensees: { optional: true, items: ['Le code promo Amazon expire le 30.', 'Penser à racheter du papier toilette.'] },
    },
  },
  {
    id: '6',
    label: 'Thinking of you — court — PLUSIEURS pensées, UNE SEULE pertinente',
    tone: 'court',
    context: {
      contact: { prenom: 'Odile', genre: 'femme', relation: 'Famille', familyRole: 'Grand-mère' },
      occasion: { occasion: 'thinking_of_you' },
      quiz: null,
      pensees: {
        optional: true,
        items: [
          'Rendez-vous garagiste jeudi 14h.',
          'A été hospitalisée deux jours la semaine dernière, va mieux maintenant.',
          'Code wifi du bureau : PENSIF2026.',
        ],
      },
    },
  },
  {
    id: '7',
    label: 'Event (nouvelle situation pro) — chaleureux — wish exploitable, PAS à forcer',
    tone: 'chaleureux',
    context: {
      contact: { prenom: 'Micka', genre: 'homme', relation: 'Ami', familyRole: null },
      occasion: { occasion: 'event', texte: 'A décroché un nouveau poste, commence le mois prochain', date: '2026-10-01' },
      quiz: { interests: ['sport', 'tech'], wish: 'Une nouvelle paire de baskets de running' },
      pensees: { optional: true, items: [] },
    },
  },
  {
    id: '8',
    label: 'Event (entretien) — complice — personnalisation possible sans invention',
    tone: 'complice',
    context: {
      contact: { prenom: 'Jean-Luc', genre: 'homme', relation: 'Famille', familyRole: 'Oncle' },
      occasion: { occasion: 'event', texte: 'Passe son permis de conduire', date: '2026-09-22' },
      quiz: null,
      pensees: { optional: true, items: ['A déjà raté une fois, un peu nerveux à ce sujet.'] },
    },
  },
  {
    id: '9',
    label: 'Event (déménagement) — court — contexte pauvre (texte+date seuls)',
    tone: 'court',
    context: {
      contact: { prenom: 'Fatima', genre: 'femme', relation: 'Connaissance', familyRole: null },
      occasion: { occasion: 'event', texte: 'Déménage dans son nouvel appartement', date: '2026-09-25' },
      quiz: null,
      pensees: { optional: true, items: [] },
    },
  },
  {
    id: '10',
    label: 'Birthday jour J — complice — contexte pauvre (prénom + genre null)',
    tone: 'complice',
    context: {
      contact: { prenom: 'Camille', genre: null, relation: 'Amie', familyRole: null },
      occasion: { occasion: 'birthday', daysUntil: 0 },
      quiz: null,
      pensees: { optional: true, items: [] },
    },
  },
  {
    id: '11',
    label: 'Birthday dans 14 jours — court — pensées HORS SUJET (à ignorer)',
    tone: 'court',
    context: {
      contact: { prenom: 'Thomas', genre: 'homme', relation: 'Collègue', familyRole: null },
      occasion: { occasion: 'birthday', daysUntil: 14 },
      quiz: null,
      pensees: { optional: true, items: ['Réunion équipe reportée à mardi.'] },
    },
  },
  {
    id: '12',
    label: 'Birthday jour J — court — plusieurs pensées, UNE SEULE pertinente',
    tone: 'court',
    context: {
      contact: { prenom: 'Alice', genre: 'femme', relation: 'Amie', familyRole: null },
      occasion: { occasion: 'birthday', daysUntil: 0 },
      quiz: null,
      pensees: {
        optional: true,
        items: ['Facture électricité à régler avant le 10.', 'Vient d’adopter un chaton, hyper contente.', 'Rendez-vous coiffeur samedi.'],
      },
    },
  },
  {
    id: '13',
    label: 'Thinking of you — chaleureux — quiz riche + wish, aucune pensée',
    tone: 'chaleureux',
    context: {
      contact: { prenom: 'Nadia', genre: 'femme', relation: 'Famille', familyRole: 'Cousine' },
      occasion: { occasion: 'thinking_of_you' },
      quiz: { interests: ['lecture', 'bien-être', 'nature'], wish: 'Un abonnement à une box thé' },
      pensees: { optional: true, items: [] },
    },
  },
  {
    id: '14',
    label: 'Thinking of you — complice — contexte TRÈS PAUVRE',
    tone: 'complice',
    context: {
      contact: { prenom: 'Marc', genre: 'homme', relation: 'Ami', familyRole: null },
      occasion: { occasion: 'thinking_of_you' },
      quiz: null,
      pensees: { optional: true, items: [] },
    },
  },
  {
    id: '15',
    label: 'Event (nouveau poste) — court — plusieurs pensées, une seule pertinente + quiz',
    tone: 'court',
    context: {
      contact: { prenom: 'Julien', genre: 'homme', relation: 'Ami', familyRole: null },
      occasion: { occasion: 'event', texte: 'Signe son contrat pour son nouveau poste', date: '2026-09-19' },
      quiz: { interests: ['gaming'], wish: '' },
      pensees: { optional: true, items: ['Cherchait ce poste depuis des mois.', 'A changé de voiture en août.'] },
    },
  },
  {
    id: '16',
    label: 'Birthday dans 14 jours — chaleureux — wish exploitable, PAS à forcer, aucune pensée',
    tone: 'chaleureux',
    context: {
      contact: { prenom: 'Isabelle', genre: 'femme', relation: 'Famille', familyRole: 'Mère' },
      occasion: { occasion: 'birthday', daysUntil: 14 },
      quiz: { interests: ['jardinage'], wish: 'De nouveaux outils de jardinage' },
      pensees: { optional: true, items: [] },
    },
  },
  {
    id: '17',
    label: 'Event (naissance) — complice — pensées pertinentes riches',
    tone: 'complice',
    context: {
      contact: { prenom: 'Amine', genre: 'homme', relation: 'Ami', familyRole: null },
      occasion: { occasion: 'event', texte: 'Vient d’avoir son deuxième enfant', date: '2026-09-14' },
      quiz: null,
      pensees: { optional: true, items: ['Super stressé avant l’accouchement, tout s’est bien passé au final.', 'Avait déjà un fils de 3 ans, ravi d’avoir une fille cette fois.'] },
    },
  },
  {
    id: '18',
    label: 'Thinking of you — court — contexte permettant un message personnel SANS RIEN inventer',
    tone: 'court',
    context: {
      contact: { prenom: 'Bastien', genre: 'homme', relation: 'Ami', familyRole: null },
      occasion: { occasion: 'thinking_of_you' },
      quiz: { interests: ['sport'], wish: '' },
      pensees: { optional: true, items: ['Prépare un semi-marathon pour le mois prochain.'] },
    },
  },
];
