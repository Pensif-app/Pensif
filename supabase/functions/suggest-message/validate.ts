// Validation STRICTE — CHANTIER RÉPONSES INTELLIGENTES, incrément 1. Deux directions, jamais
// mélangées : `validateRequestContext` re-vérifie ce que le CLIENT envoie (ne jamais faire confiance
// à un payload externe, même produit par notre propre app — voir la garde `event` ci-dessous, qui
// existe pour la même raison que côté client : ne jamais construire un message sur une occasion
// inventée) ; `validateLlmOutput` re-vérifie ce que le MODÈLE renvoie (jamais un cast direct du JSON).
import { MessageOccasion, MessageSuggestionContext, MessageTone, SuggestMessageContract } from './contract.ts';

const TONES: readonly MessageTone[] = ['chaleureux', 'complice', 'court'];
const OCCASIONS: readonly MessageOccasion[] = ['birthday', 'thinking_of_you', 'event'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PENSEES = 5;
const MAX_PENSEE_LENGTH = 2000;
const MAX_WISH_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 2000;

export type RequestValidationOutcome =
  | { ok: true; context: MessageSuggestionContext; tone: MessageTone }
  | { ok: false; message: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateOccasion(raw: unknown): { ok: true; occasion: MessageSuggestionContext['occasion'] } | { ok: false; message: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, message: 'occasion manquante ou invalide' };
  const obj = raw as Record<string, unknown>;
  if (!OCCASIONS.includes(obj.occasion as MessageOccasion)) return { ok: false, message: `occasion inconnue : "${String(obj.occasion)}"` };

  if (obj.occasion === 'birthday') {
    if (typeof obj.daysUntil !== 'number' || !Number.isFinite(obj.daysUntil) || obj.daysUntil < 0) {
      return { ok: false, message: 'occasion "birthday" : daysUntil manquant ou invalide' };
    }
    return { ok: true, occasion: { occasion: 'birthday', daysUntil: obj.daysUntil } };
  }
  if (obj.occasion === 'thinking_of_you') {
    return { ok: true, occasion: { occasion: 'thinking_of_you' } };
  }
  // 'event' — même garde que côté client (messageSuggestion.ts) : jamais d'occasion "event" sans un
  // fait réellement daté. Le serveur ne fait JAMAIS confiance au client sur ce point précis.
  if (!isNonEmptyString(obj.texte)) return { ok: false, message: 'occasion "event" : texte manquant' };
  if (typeof obj.date !== 'string' || !DATE_PATTERN.test(obj.date)) {
    return { ok: false, message: 'occasion "event" : date manquante ou mal formée (attendu YYYY-MM-DD)' };
  }
  return { ok: true, occasion: { occasion: 'event', texte: obj.texte.trim(), date: obj.date } };
}

function validateQuiz(raw: unknown): { ok: true; quiz: MessageSuggestionContext['quiz'] } | { ok: false; message: string } {
  if (raw === null) return { ok: true, quiz: null };
  if (typeof raw !== 'object') return { ok: false, message: 'quiz doit être null ou un objet' };
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.interests) || !obj.interests.every((v) => typeof v === 'string')) {
    return { ok: false, message: 'quiz.interests doit être un tableau de chaînes' };
  }
  if (typeof obj.wish !== 'string' || obj.wish.length > MAX_WISH_LENGTH) {
    return { ok: false, message: 'quiz.wish manquant ou trop long' };
  }
  return { ok: true, quiz: { interests: obj.interests as string[], wish: obj.wish } };
}

function validatePensees(raw: unknown): { ok: true; pensees: MessageSuggestionContext['pensees'] } | { ok: false; message: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, message: 'pensees manquant ou invalide' };
  const obj = raw as Record<string, unknown>;
  if (obj.optional !== true) return { ok: false, message: 'pensees.optional doit être exactement true' };
  if (!Array.isArray(obj.items) || obj.items.length > MAX_PENSEES) {
    return { ok: false, message: `pensees.items doit être un tableau d’au plus ${MAX_PENSEES} éléments` };
  }
  if (!obj.items.every((v) => typeof v === 'string' && v.length <= MAX_PENSEE_LENGTH)) {
    return { ok: false, message: 'pensees.items doit contenir uniquement des chaînes' };
  }
  return { ok: true, pensees: { optional: true, items: obj.items as string[] } };
}

/** Point d'entrée : valide le corps de requête BRUT reçu par l'Edge Function. Ne fait JAMAIS
 *  confiance au client — même si `src/data/messageSuggestion.ts` construit déjà un contexte
 *  correctement formé côté app, cette fonction est la seule garde qui compte réellement (défense en
 *  profondeur, même principe que la garde `event` déjà présente côté client). */
export function validateRequestContext(raw: unknown): RequestValidationOutcome {
  if (typeof raw !== 'object' || raw === null) return { ok: false, message: 'corps de requête invalide' };
  const body = raw as Record<string, unknown>;

  if (!TONES.includes(body.tone as MessageTone)) return { ok: false, message: `tone inconnu : "${String(body.tone)}"` };

  const ctxRaw = body.context;
  if (typeof ctxRaw !== 'object' || ctxRaw === null) return { ok: false, message: 'context manquant' };
  const ctx = ctxRaw as Record<string, unknown>;

  const contactRaw = ctx.contact;
  if (typeof contactRaw !== 'object' || contactRaw === null) return { ok: false, message: 'context.contact manquant' };
  const contact = contactRaw as Record<string, unknown>;
  if (!isNonEmptyString(contact.prenom)) return { ok: false, message: 'context.contact.prenom manquant' };
  if (contact.genre !== 'homme' && contact.genre !== 'femme' && contact.genre !== null) {
    return { ok: false, message: 'context.contact.genre invalide' };
  }
  if (typeof contact.relation !== 'string') return { ok: false, message: 'context.contact.relation manquant' };
  if (typeof contact.familyRole !== 'string' && contact.familyRole !== null) {
    return { ok: false, message: 'context.contact.familyRole invalide' };
  }

  const occasionResult = validateOccasion(ctx.occasion);
  if (!occasionResult.ok) return occasionResult;

  const quizResult = validateQuiz(ctx.quiz);
  if (!quizResult.ok) return quizResult;

  const penseesResult = validatePensees(ctx.pensees);
  if (!penseesResult.ok) return penseesResult;

  return {
    ok: true,
    tone: body.tone as MessageTone,
    context: {
      contact: {
        prenom: contact.prenom.trim(),
        genre: contact.genre as 'homme' | 'femme' | null,
        relation: contact.relation,
        familyRole: contact.familyRole as string | null,
      },
      occasion: occasionResult.occasion,
      quiz: quizResult.quiz,
      pensees: penseesResult.pensees,
    },
  };
}

export type LlmOutputValidationOutcome = { ok: true; message: string } | { ok: false; parseError: string };

/** Valide la sortie BRUTE du LLM — jamais un cast direct. Un message vide/trop long/absent est un
 *  échec de validation, jamais silencieusement corrigé (contrairement à validate.ts de Capture, qui
 *  peut normaliser un champ manquant : ici il n'y a qu'UN champ, donc rien à repêcher partiellement —
 *  soit le message est exploitable tel quel, soit la réponse est rejetée). */
export function validateLlmOutput(raw: unknown): LlmOutputValidationOutcome {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, parseError: 'Réponse du modèle non exploitable (pas un objet JSON)' };
  }
  const message = (raw as Record<string, unknown>).message;
  if (typeof message !== 'string' || !message.trim()) {
    return { ok: false, parseError: 'Réponse du modèle non exploitable (champ "message" absent ou vide)' };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, parseError: 'Réponse du modèle rejetée (message anormalement long)' };
  }
  return { ok: true, message: message.trim() };
}

export function buildSuggestMessageContract(outcome: LlmOutputValidationOutcome): SuggestMessageContract | null {
  return outcome.ok ? { message: outcome.message } : null;
}
