// CHANTIER "App Review 5.1.1(i)/5.1.2(i)" (2026-10-14) — verrou au niveau RÉSEAU. Les trois fonctions qui envoient des
// données à un service d'IA tiers (captureApi.ts, messageSuggestionApi.ts) appellent `assertAiConsent` AVANT toute requête :
// aucun écran, nouvelle tentative, reprise après erreur ou futur appelant ne peut donc contourner le consentement.
// Module PUR (aucun import expo/react-native). Le store en est l'unique écrivain (`setAiConsentSnapshot`).
// Par défaut (aucun snapshot) = AUCUN consentement : échec fermé.
import { AiConsentRecord, AiConsentScope, hasValidConsent } from '../data/aiConsent';

let snapshot: { userId: string | null; record: AiConsentRecord } = { userId: null, record: {} };

export function setAiConsentSnapshot(userId: string | null, record: AiConsentRecord): void {
  snapshot = { userId, record };
}

export function isAiConsentGranted(scope: AiConsentScope): boolean {
  return snapshot.userId !== null && hasValidConsent(snapshot.record, scope);
}

export class AiConsentRequiredError extends Error {
  constructor(public readonly scope: AiConsentScope) {
    super('Autorisation requise avant l’envoi de ces données à un service d’IA.');
  }
}

export function assertAiConsent(scope: AiConsentScope): void {
  if (!isAiConsentGranted(scope)) throw new AiConsentRequiredError(scope);
}
