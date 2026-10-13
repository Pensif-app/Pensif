// CHANTIER "App Review 5.1.1(i)/5.1.2(i) — consentement explicite avant partage avec une IA tierce" (2026-10-14).
// Module PUR (aucun import expo/react-native) : testable sous `npx tsx`. Deux consentements DISTINCTS, jamais
// confondus avec la permission système du micro :
//   - voiceCapture : audio -> Groq (transcription), texte transcrit -> OpenAI (analyse).
//   - smartReplies : contexte du proche -> OpenAI (rédaction d'un message).
// Un consentement est lié à UN compte (clé de stockage par userId), à UNE version du périmètre : si le périmètre du
// traitement change, on incrémente la version correspondante et l'accord est redemandé.

export type AiConsentScope = 'voiceCapture' | 'smartReplies';

export const AI_CONSENT_SCOPES: readonly AiConsentScope[] = ['voiceCapture', 'smartReplies'];

/** À incrémenter si les données envoyées, les destinataires ou les finalités d'un périmètre changent. */
export const AI_CONSENT_VERSION: Record<AiConsentScope, number> = {
  voiceCapture: 1,
  // v2 (2026-10-14) : texte du dialogue précisé (rôle familial, informations sur des tiers) — les accords v1 sont redemandés.
  smartReplies: 2,
};

export type AiConsentEntry = { version: number; grantedAt: string };
export type AiConsentRecord = Partial<Record<AiConsentScope, AiConsentEntry>>;

export const AI_CONSENT_KEY_PREFIX = 'pensif.aiConsent.';

/** Clé par compte : un accord donné pour un compte ne s'applique jamais à un autre compte du même appareil. */
export function aiConsentStorageKey(userId: string): string {
  return `${AI_CONSENT_KEY_PREFIX}${userId}`;
}

/**
 * Trace de révocation (CHANTIER "Correction finale de la révocation", 2026-10-14) — clé SÉPARÉE de l'enregistrement
 * principal, par compte. Si une scope y figure, le consentement correspondant est INVALIDE au chargement, même si
 * l'enregistrement principal le contient encore (priorité absolue de la révocation). Effacée uniquement par un nouvel
 * accord explicite. Le préfixe `pensif.` la fait purger avec le reste à la suppression du compte.
 */
export const AI_REVOCATION_KEY_PREFIX = 'pensif.aiConsentRevoked.';

export function aiConsentRevocationKey(userId: string): string {
  return `${AI_REVOCATION_KEY_PREFIX}${userId}`;
}

export type AiRevocationRecord = Partial<Record<AiConsentScope, string>>;

/** `{}` = aucune révocation (clé absente). `null` = contenu illisible/corrompu → l'appelant DOIT échouer fermé. */
export function parseRevocationRecord(raw: string | null): AiRevocationRecord | null {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: AiRevocationRecord = {};
    for (const scope of AI_CONSENT_SCOPES) {
      const value = (parsed as Record<string, unknown>)[scope];
      if (value === undefined) continue;
      if (typeof value !== 'string') return null;
      out[scope] = value;
    }
    return out;
  } catch {
    return null;
  }
}

export function hasValidConsent(record: AiConsentRecord, scope: AiConsentScope): boolean {
  const entry = record[scope];
  return Boolean(entry) && entry!.version === AI_CONSENT_VERSION[scope];
}

export function withConsentGranted(record: AiConsentRecord, scope: AiConsentScope, now: Date): AiConsentRecord {
  return { ...record, [scope]: { version: AI_CONSENT_VERSION[scope], grantedAt: now.toISOString() } };
}

export function withConsentRevoked(record: AiConsentRecord, scope: AiConsentScope): AiConsentRecord {
  const next = { ...record };
  delete next[scope];
  return next;
}

/** Lecture défensive : toute valeur illisible ou inattendue = AUCUN consentement (échec fermé). */
export function parseConsentRecord(raw: string | null): AiConsentRecord {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: AiConsentRecord = {};
    for (const scope of AI_CONSENT_SCOPES) {
      const entry = (parsed as Record<string, unknown>)[scope] as { version?: unknown; grantedAt?: unknown } | undefined;
      if (entry && typeof entry.version === 'number' && typeof entry.grantedAt === 'string') {
        out[scope] = { version: entry.version, grantedAt: entry.grantedAt };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export type AiConsentCopy = {
  /** Titre du dialogue de demande. */
  title: string;
  message: string;
  /** Libellé court (Réglages). */
  settingsLabel: string;
  /** Sous-texte (Réglages) : données et destinataires, toujours visibles même avant tout accord. */
  settingsDetail: string;
  refuseLabel: string;
  allowLabel: string;
};

export const AI_CONSENT_COPY: Record<AiConsentScope, AiConsentCopy> = {
  voiceCapture: {
    title: 'Traitement de votre capture vocale',
    message:
      "Pour transformer votre enregistrement en pensée ou en rappel, Pensif transmet votre audio à Groq pour le transcrire, puis le texte obtenu, avec la date, l’heure locale et le fuseau horaire de votre téléphone, à OpenAI pour l’analyser.\n\nCes transmissions ont lieu uniquement lorsque vous utilisez cette fonctionnalité. Les informations servent à créer les pensées et rappels demandés.\n\nAutorisez-vous l’envoi de ces données à ces services ?",
    settingsLabel: 'Capture vocale',
    settingsDetail: 'Audio envoyé à Groq (transcription), texte envoyé à OpenAI (analyse).',
    refuseLabel: 'Refuser',
    allowLabel: 'Autoriser',
  },
  smartReplies: {
    title: 'Réponses intelligentes',
    message:
      'Pour personnaliser un message, Pensif peut transmettre à OpenAI :\n\n• le prénom du proche, son genre, sa relation avec vous et son rôle familial ;\n• l’occasion concernée (pour un événement, le texte de la pensée correspondante) ;\n• ses centres d’intérêt et son souhait, issus du quiz ;\n• jusqu’à cinq pensées récentes concernant ce proche.\n\nCes contenus peuvent comporter des informations personnelles sur d’autres personnes. Ils servent uniquement à générer une suggestion de message et sont envoyés lorsque vous demandez une personnalisation.\n\nAutorisez-vous l’envoi de ces données à OpenAI ?',
    settingsLabel: 'Réponses intelligentes',
    settingsDetail: 'Informations sur le proche, occasion, quiz et pensées récentes envoyés à OpenAI.',
    refuseLabel: 'Refuser',
    allowLabel: 'Autoriser',
  },
};
