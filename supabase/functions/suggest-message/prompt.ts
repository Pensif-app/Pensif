// Prompt — CHANTIER RÉPONSES INTELLIGENTES, incrément 1 (2026-09-16). Séparé du prompt Capture
// (business totalement différente : ici on RÉDIGE un message à partir d'un contexte déjà connu,
// Capture EXTRAIT une structure depuis une dictée) — aucun texte partagé entre les deux.
import { MessageSuggestionContext, MessageTone } from './contract.ts';

const TONE_DESCRIPTIONS: Record<MessageTone, string> = {
  chaleureux: 'chaleureux et sincère, avec de l’affection sans excès',
  complice: 'complice et taquin, comme entre deux personnes proches',
  court: 'court, direct, sans fioritures — quelques mots suffisent',
};

/**
 * Règles NON négociables. Durci une 2e fois le 2026-09-16 (règles 4 et 6, ci-dessous) suite au
 * benchmark final GPT-5 mini : contexte très pauvre + ton complice → le modèle fabriquait une
 * anecdote ("café trop fort", "recette miracle") pour créer artificiellement de la complicité, et
 * déduisait une émotion non fournie à partir d'un événement fourni (ex. "tout s'est bien passé" →
 * "quel soulagement"). Volontairement des règles GÉNÉRALES, jamais une liste de cas particuliers —
 * elles doivent se généraliser à n'importe quel contact/occasion, pas seulement au corpus de
 * benchmark. Première passe de durcissement (règles 2 et 4 ci-dessous) : voir commentaire historique
 * conservé sur chaque règle concernée.
 */
export function buildSystemPrompt(): string {
  return `Tu rédiges un message personnel qu'une personne va envoyer à un proche, en français.

Règles strictes, à respecter systématiquement :
1. N'utilise QUE les faits explicitement présents dans le contexte fourni. N'invente et ne suppose jamais un détail, un événement, un goût ou une information qui n'y figure pas.
2. Le fait qu'une information soit fournie ne signifie PAS qu'elle doit apparaître dans le message. N'utilise une note personnelle ou une information du quiz que si elle est DIRECTEMENT pertinente pour l'occasion et rend le message réellement plus naturel — en cas de doute, ignore-la. Pour un anniversaire ou un message sans occasion précise, ignore systématiquement tout ce qui est de nature administrative, logistique ou pratique (rendez-vous sans lien avec la relation, tâches à faire, achats, codes/informations pratiques...) : ce n'est jamais pertinent pour ce type de message. Un message simple et naturel, sans détail personnel forcé, vaut toujours mieux qu'une personnalisation plaquée artificiellement.
3. Ne déduis ni n'extrapole rien sur la personne au-delà de ce qui est écrit — pas de supposition sur son caractère, sa situation, ses préférences non mentionnées.
4. N'invente JAMAIS une action, un événement futur ou un état qui n'est pas explicitement donné dans le contexte — en particulier : une rencontre à venir ("on se voit bientôt/demain"), une célébration prévue, une visite, un cadeau que l'expéditeur va acheter ou offrir, une promesse d'action de l'expéditeur, l'état émotionnel du proche, ou le résultat d'un événement futur. N'affirme JAMAIS un état émotionnel non fourni — même lorsqu'un événement du contexte permettrait raisonnablement de le déduire (ex. "tout s'est bien passé" ne doit jamais devenir "quel soulagement" ou toute autre émotion non écrite explicitement). Des formulations génériques et non factuelles restent bien sûr possibles : "je pense à toi", "profite bien de ta journée", "donne-moi de tes nouvelles".
5. Le message doit sonner comme quelque chose qu'une vraie personne écrirait spontanément à quelqu'un qu'elle connaît — jamais comme un texte rédigé par un assistant. Pas de formules génériques d'IA, pas de ton commercial, pas de liste, pas d'emoji excessif.
6. Respecte strictement le registre de ton demandé. Le ton modifie UNIQUEMENT la manière de formuler les informations disponibles — il n'autorise JAMAIS l'ajout d'un fait, d'une anecdote, d'une habitude, d'une blague supposant un vécu commun, ou de tout autre détail personnel absent du contexte. Si le contexte est pauvre, le message doit rester simple : pour un ton complice sans information personnelle exploitable, crée la complicité uniquement par le style et la formulation, jamais en inventant un souvenir ou une habitude partagée.
7. Ne mentionne JAMAIS "Pensif", un "quiz", des "pensées enregistrées", un "profil", un "contexte fourni", ni la provenance d'une information quelconque. Le message doit se lire comme si l'expéditeur savait déjà tout cela lui-même.
8. N'utilise JAMAIS de tiret cadratin (—) ni de demi-cadratin (–) dans le message, même pour marquer une pause ou une incise. Utilise uniquement une ponctuation française naturelle à la place : virgule, point, deux-points, point-virgule.
9. Réponds UNIQUEMENT avec l'objet JSON demandé par le schéma — jamais de texte hors de ce format, jamais d'explication de ton raisonnement.`;
}

function formatOccasion(context: MessageSuggestionContext): string {
  const o = context.occasion;
  if (o.occasion === 'birthday') {
    if (o.daysUntil === 0) return "Occasion : c'est son anniversaire aujourd'hui.";
    if (o.daysUntil === 1) return "Occasion : son anniversaire est demain.";
    return `Occasion : son anniversaire est dans ${o.daysUntil} jours.`;
  }
  if (o.occasion === 'thinking_of_you') {
    return "Occasion : prendre des nouvelles / penser à cette personne, sans événement précis à mentionner.";
  }
  return `Occasion : un fait réel enregistré par l'utilisateur à propos de cette personne — "${o.texte}" (daté du ${o.date}).`;
}

function familyDescriptor(contact: MessageSuggestionContext['contact']): string {
  if (contact.relation === 'Famille' && contact.familyRole) return `${contact.familyRole.toLowerCase()} de l'utilisateur`;
  return contact.relation ? contact.relation.toLowerCase() : 'proche de l’utilisateur';
}

/** Construit le message "user" envoyé au modèle — assemble uniquement des faits déjà validés
 *  (validate.ts), jamais de texte libre venant directement d'un champ non contrôlé. */
export function buildUserPrompt(context: MessageSuggestionContext, tone: MessageTone): string {
  const lines: string[] = [];
  lines.push(formatOccasion(context));
  lines.push(`Ton demandé : ${TONE_DESCRIPTIONS[tone]}.`);
  lines.push(`Prénom du destinataire : ${context.contact.prenom} (${familyDescriptor(context.contact)}).`);
  if (context.contact.genre) lines.push(`Genre : ${context.contact.genre}.`);

  if (context.quiz) {
    if (context.quiz.interests.length > 0) {
      lines.push(`Centres d'intérêt connus (facultatif, à n'utiliser que si pertinent) : ${context.quiz.interests.join(', ')}.`);
    }
    if (context.quiz.wish.trim()) {
      lines.push(`Envie exprimée par cette personne (facultatif, à n'utiliser que si pertinent) : "${context.quiz.wish.trim()}".`);
    }
  }

  if (context.pensees.items.length > 0) {
    lines.push('Notes personnelles récentes sur cette personne (facultatif, à n’utiliser que si pertinent — tu peux n’en retenir aucune) :');
    for (const texte of context.pensees.items) lines.push(`- "${texte}"`);
  }

  lines.push('Rédige un unique message prêt à être envoyé tel quel, respectant strictement les règles ci-dessus.');
  return lines.join('\n');
}
