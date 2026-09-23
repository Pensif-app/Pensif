/// <reference types="node" />
// Tests de non-régression — CHANTIER RÉPONSES INTELLIGENTES, intégration client MessageScreen.tsx
// (2026-09-16). MessageScreen.tsx importe react-native (Pressable/TextInput/...) — pas chargeable
// sous tsx, donc vérification par lecture de source (même méthode que tous les écrans de ce projet,
// voir test-regression-ux-4-improvements.ts et suivants). messageSuggestionUsageMessages.ts (pur)
// est en revanche testé RÉELLEMENT.
//
// Usage : npx tsx scripts/test-regression-message-screen-suggestion.ts

import * as fs from 'fs';
import * as path from 'path';
import { mapMessageSuggestionBlockedCodeToMessage, MESSAGE_SUGGESTION_RATE_LIMIT_MESSAGE } from '../src/data/messageSuggestionUsageMessages';
import { monthFull } from '../src/data/calendar';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function readSrc(...segments: string[]): string {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8').replace(/\r\n/g, '\n');
}

console.log('\n[§A — RÉEL] messageSuggestionUsageMessages.ts — mapping codes → messages génériques');
check('rate_limit_minute → message générique de rafale', mapMessageSuggestionBlockedCodeToMessage('MESSAGE_SUGGESTION_RATE_LIMIT_MINUTE') === MESSAGE_SUGGESTION_RATE_LIMIT_MESSAGE);
check('rate_limit_hour → même message générique', mapMessageSuggestionBlockedCodeToMessage('MESSAGE_SUGGESTION_RATE_LIMIT_HOUR') === MESSAGE_SUGGESTION_RATE_LIMIT_MESSAGE);
check('code inconnu → repli générique, jamais le code brut affiché', !mapMessageSuggestionBlockedCodeToMessage('UNKNOWN_CODE').includes('UNKNOWN_CODE'));
check('aucun message ne contient le mot "quota" ni un chiffre de seuil', ![mapMessageSuggestionBlockedCodeToMessage('MESSAGE_SUGGESTION_RATE_LIMIT_MINUTE'), mapMessageSuggestionBlockedCodeToMessage('x')].some((m) => /\d/.test(m) || m.toLowerCase().includes('quota')));

console.log('\n[§B — source] messageSuggestionApi.ts — isolation réseau/erreurs');
const apiSrc = readSrc('src', 'lib', 'messageSuggestionApi.ts');
check('appelle bien l’Edge Function "suggest-message" (pas "capture")', apiSrc.includes("supabase.functions.invoke('suggest-message'"));
check('corps envoyé = { context, tone } (contrat exact)', apiSrc.includes('body: { context, tone }'));
check('code de blocage traduit via mapMessageSuggestionBlockedCodeToMessage (jamais le code brut exposé)', apiSrc.includes('mapMessageSuggestionBlockedCodeToMessage(body.code)'));
check('aucun import réel de captureApi.ts (isolation totale de Capture — la mention en commentaire ne compte pas)', !/^import.*captureApi/m.test(apiSrc));

console.log('\n[§C — source] navigation/types.ts — route Message rétrocompatible');
const navTypesSrc = readSrc('src', 'navigation', 'types.ts');
check('occasion optionnel (défaut birthday géré côté écran, pas ici)', /Message:\s*\{\s*contactId:\s*string;\s*occasion\?:\s*MessageOccasion;\s*penseeId\?:\s*string\s*\}/.test(navTypesSrc));

console.log('\n[§D — source] MessageScreen.tsx — composer éditable, source unique pour les 3 envois');
const screenSrc = readSrc('src', 'screens', 'MessageScreen.tsx');
check('bubble = <TextInput ... value={currentText} ...> (plus un <Text> non éditable)', /<TextInput[\s\S]{0,120}value=\{currentText\}/.test(screenSrc));
check('sendSms envoie exactement `currentText` (le brouillon du ton actif, pas `message`)', /SMS\.sendSMSAsync\(\[contact!\.tel\.replace\(\/\\s\/g, ''\)\], currentText\)/.test(screenSrc));
check('copyMessage copie exactement `currentText`', /Clipboard\.setStringAsync\(currentText\)/.test(screenSrc));
check('sendWhatsApp encode exactement `currentText`', /encodeURIComponent\(currentText\)/.test(screenSrc));
check('l’ancienne constante dérivée `const message = messageTemplates[tone](contact);` a bien disparu', !screenSrc.includes('const message = messageTemplates[tone](contact);'));
check('le bubble n’affiche plus `{message}` (remplacé par le TextInput contrôlé)', !screenSrc.includes('>{message}<'));

console.log('\n[§E — source] SUPERSEDÉ (2026-09-16) — état par ton (drafts) remplace le hasCustomizedText/text global.');
console.log('  Voir test-regression-message-draft-persistence.ts §A/§B pour la couverture complète (brouillons indépendants par ton).');
check('plus de state global hasCustomizedText (remplacé par `drafts`, par ton)', !screenSrc.includes('const [hasCustomizedText, setHasCustomizedText]'));
check('handleTextChange met à jour uniquement drafts[tone] (voir détail dans test-regression-message-draft-persistence.ts)', screenSrc.includes('function handleTextChange(nextText: string) {') && screenSrc.includes('setDrafts((prev) => ({ ...prev, [tone]:'));

console.log('\n[§F — source] changement de ton — ne touche plus JAMAIS au texte (chaque ton dérive son propre brouillon, voir draft-persistence.ts)');
const toneFnMatch = screenSrc.match(/function handleToneChange\(nextTone: Tone\) \{[\s\S]*?\n  \}/);
const toneFnBody = toneFnMatch ? toneFnMatch[0] : '';
check('handleToneChange trouvé', toneFnBody.length > 0);
check('se limite STRICTEMENT à setTone(nextTone) — plus aucune logique de template/texte ici (déplacée dans currentText, dérivé)', toneFnBody.replace(/\s/g, '') === 'functionhandleToneChange(nextTone:Tone){setTone(nextTone);}');
check('aucun Alert/popup de confirmation dans le changement de ton', !/Alert\.alert/.test(toneFnBody));

console.log('\n[§G — source] génération IA — anti-double-tap, échec non destructif, disponibilité pré-calculée');
const genFnMatch = screenSrc.match(/async function handleGenerate\(\) \{[\s\S]*?\n  \}/);
const genFnBody = genFnMatch ? genFnMatch[0] : '';
check('handleGenerate trouvé', genFnBody.length > 0);
check('garde anti-double-tap en tout premier (ref synchrone, pas un state)', genFnBody.trimStart().startsWith('async function handleGenerate() {\n    if (generatingRef.current) return;'));
check('garde défensive sur contextResult.ok avant tout appel réseau', genFnBody.includes('if (!contextResult?.ok) return;'));
check('envoie contextResult.context + le ton figé AU MOMENT DE L’APPEL (toneAtRequestTime) à requestMessageSuggestion', genFnBody.includes('requestMessageSuggestion(contextResult.context, toneAtRequestTime)'));
check('le brouillon n’est modifié QUE dans le bloc succès (try), jamais dans le catch — échec = brouillon intact', /catch \(e\) \{[\s\S]*?setError\([\s\S]*?\}\s*finally/.test(genFnBody) && !/catch \(e\) \{[\s\S]*?setDrafts/.test(genFnBody));
check('erreur toujours issue de MessageSuggestionApiError (jamais un texte serveur brut non contrôlé)', genFnBody.includes('e instanceof MessageSuggestionApiError ? e.message'));
check('generatingRef relâché dans un finally (retry toujours possible après échec)', /finally \{\s*setLoading\(false\);\s*generatingRef\.current = false;/.test(genFnBody));

console.log('\n[§H — source] disponibilité de l’action IA — calculée AVANT tout tap, jamais après un échec réseau');
check('contextResult construit via useMemo (local, aucun réseau)', /const contextResult = useMemo\(\(\) => \{[\s\S]*?buildMessageSuggestionContext\(contact, pensees, today, occasion, eventPensee\)/.test(screenSrc));
check('aiAvailable = contextResult?.ok === true — inclut event_pensee_sensitive et tous les autres event_* invalides', screenSrc.includes('const aiAvailable = contextResult?.ok === true;'));
check(
  'le bouton IA n’est rendu QUE si aiAvailable (absent, pas juste désactivé, pour un event bloqué/sensible)',
  /\{aiAvailable && \(\s*<Pressable\s*\n\s*onPress=\{handleGenerateButtonPress\}/.test(screenSrc),
);
{
  const titlesBlockMatch = screenSrc.match(/const OCCASION_TITLES: Record<MessageOccasion, string> = \{([\s\S]*?)\};/);
  const titlesBlock = titlesBlockMatch ? titlesBlockMatch[1] : '';
  check('bloc OCCASION_TITLES trouvé (3 occasions)', titlesBlock.length > 0);
  check('aucun des titres réellement affichés ne mentionne santé/sensible (extrait du VRAI code, pas dupliqué à la main)', !/sensible|sensitive|santé|medical/i.test(titlesBlock));
}

console.log('\n[§I — source] penseeId résolu depuis le store, jamais un objet Pensee transmis en navigation');
check('eventPensee résolu via pensees.find sur route.params.penseeId (store, pas les params)', screenSrc.includes('pensees.find((p) => p.id === route.params.penseeId)'));
check('occasion défaut birthday pour rétrocompatibilité', screenSrc.includes("route.params.occasion ?? 'birthday'"));

console.log('\n[§J — source] aucune génération automatique — uniquement un tap explicite');
check('aucun useEffect n’appelle handleGenerate/requestMessageSuggestion automatiquement', !/useEffect\([^)]*\{[\s\S]*?(handleGenerate|requestMessageSuggestion)/.test(screenSrc));
check('requestMessageSuggestion n’est appelé que dans handleGenerate (un seul point d’appel)', (screenSrc.match(/requestMessageSuggestion\(/g) ?? []).length === 1);

console.log('\n[§K — source] libellé après génération IA (2026-09-17, texte mis à jour Post-TestFlight Phase 6) — affiché seulement après une génération réussie');
// CHANTIER "Post-TestFlight Phase 6 — Disclaimer Messages" (2026-09-23) — COPY uniquement, le texte a
// changé mais la structure/condition d'affichage vérifiée ici reste strictement la même.
check('nouveau libellé exact présent', screenSrc.includes("Pensif s'appuie sur ce qu'il connaît de vous.\\nRelis toujours avant d'envoyer."));
check('ancien libellé "Suggestion IA" a bien disparu', !screenSrc.includes('Suggestion IA'));
check('ancien texte "Pensif peut se tromper" a bien disparu', !screenSrc.includes('Pensif peut se tromper'));
check('conditionné à currentAiGenerated — dérivé du ton actif (jamais affiché sur une simple édition manuelle, ni pour un autre ton)', /\{currentAiGenerated && \([\s\S]{0,150}Pensif s'appuie/.test(screenSrc));

console.log('\n[§L — source] titre et "Cadeau déjà envoyé" adaptés à l’occasion (non-régression du flux birthday existant)');
check('titre dépend de l’occasion (plus jamais "Joyeux anniversaire" figé pour thinking_of_you/event)', screenSrc.includes('OCCASION_TITLES[occasion]') && screenSrc.includes("birthday: 'Joyeux anniversaire'"));
check('"Cadeau déjà envoyé" réservé à birthday (notion liée à l’occurrence annuelle, non pertinente ailleurs)', /\{occasion === 'birthday' && \(\s*<Pressable\s*\n\s*onPress=\{\(\) => toggleGiftSent/.test(screenSrc));

console.log('\n[§M — source] non-régression des 2 points d’entrée existants (aucun changement requis de leur côté)');
const homeAttentionSrc = readSrc('src', 'data', 'homeAttention.ts');
const giftsScreenSrc = readSrc('src', 'screens', 'GiftsScreen.tsx');
check("navigateToAttention appelle toujours navigate('Message', { contactId: action.contactId }) sans occasion — le défaut 'birthday' s'applique", homeAttentionSrc.includes("navigate('Message', { contactId: action.contactId });"));
check("GiftsScreen appelle toujours navigate('Message', { contactId: contact.id }) sans occasion", giftsScreenSrc.includes("navigation.navigate('Message', { contactId: contact.id })"));

console.log('\n[§N — source] CalendarScreen.tsx — tap sur une carte "pensée" ouvre PenseeDetail, jamais directement la fiche');
const calendarSrc = readSrc('src', 'screens', 'CalendarScreen.tsx');
{
  const openEventMatch = calendarSrc.match(/function openEvent\([\s\S]*?\n  \}/);
  const openEventBody = openEventMatch ? openEventMatch[0] : '';
  check('openEvent() trouvé', openEventBody.length > 0);
  check("type === 'pensee' avec penseeId → navigate('PenseeDetail', { penseeId })", /ev\.type === 'pensee' && ev\.penseeId\) \{\s*navigation\.navigate\('PenseeDetail', \{ penseeId: ev\.penseeId \}\);/.test(openEventBody));
  check('sinon (anniversaire/fête/férié) → comportement inchangé via goto(contactId)', /return;\s*\}\s*goto\(ev\.contactId\);/.test(openEventBody));
}
check(
  'les deux EventRow (vue semaine ET vue mois) utilisent openEvent(ev), plus goto(ev.contactId) directement au tap',
  (calendarSrc.match(/onPress=\{ev\.type === 'pensee' \|\| ev\.contactId \? \(\) => openEvent\(ev\) : undefined\}/g) ?? []).length === 2,
);
check('onDelete inchangé (toujours confirmDeletePensee, non affecté par ce changement)', (calendarSrc.match(/onDelete=\{ev\.penseeId \? \(\) => confirmDeletePensee\(ev\.penseeId!\) : undefined\}/g) ?? []).length === 2);

console.log('\n[§O — source] PenseeDetailScreen.tsx — action "Préparer un message" (occasion event)');
const penseeDetailSrc = readSrc('src', 'screens', 'PenseeDetailScreen.tsx');
check('libellé exact présent', penseeDetailSrc.includes('Préparer un message'));
check(
  'visible uniquement si existing.contactId ET existing.date (ancre canonique, jamais reminderAt seul)',
  penseeDetailSrc.includes('{existing && existing.contactId && existing.date && ('),
);
check(
  "navigate('Message', { contactId, occasion: 'event', penseeId }) — jamais l'objet Pensee complet",
  /navigation\.navigate\('Message', \{ contactId: existing\.contactId!, occasion: 'event', penseeId: existing\.id \}\)/.test(penseeDetailSrc),
);
check('aucun appel réseau/génération IA dans ce handler (juste navigation.navigate)', !/onPress=\{\(\) =>\s*navigation\.navigate\('Message'[\s\S]{0,10}requestMessageSuggestion/.test(penseeDetailSrc));

console.log('\n[§P — source] FicheScreen.tsx — action "Écrire un message" (occasion thinking_of_you)');
const ficheSrc = readSrc('src', 'screens', 'FicheScreen.tsx');
check('libellé exact présent', ficheSrc.includes('Écrire un message'));
check(
  "navigate('Message', { contactId, occasion: 'thinking_of_you' }) — AUCUN penseeId",
  /navigation\.navigate\('Message', \{ contactId: existing\.id, occasion: 'thinking_of_you' \}\)/.test(ficheSrc),
);
check('le bloc "Écrire un message" ne passe pas penseeId (absent de l’appel, contrairement à PenseeDetailScreen)', !/occasion: 'thinking_of_you', penseeId/.test(ficheSrc));
check('visible uniquement pour un contact existant (existing && ...), jamais en mode création', /\{existing && \(\s*<Pressable\s*\n\s*onPress=\{\(\) => navigation\.navigate\('Message', \{ contactId: existing\.id, occasion: 'thinking_of_you' \}\)\}/.test(ficheSrc));

console.log('\n[§Q — source] Accueil (homeAttention.ts) — non-régression explicite : pas de carte auto pour thinking_of_you');
check(
  'aucune référence à "thinking_of_you" dans homeAttention.ts (aucune carte automatique créée par ce chantier)',
  !homeAttentionSrc.includes('thinking_of_you'),
);

console.log('\n[§R — source] event continue de résoudre la pensée depuis le store (non-régression, déjà couvert §I, revérifié après l’ajout du point d’entrée)');
check('eventPensee toujours résolu via pensees.find sur route.params.penseeId', screenSrc.includes('pensees.find((p) => p.id === route.params.penseeId)'));
check('aiAvailable reste conditionné à contextResult.ok — un event_pensee_sensitive bloque toujours l’IA sans le révéler', screenSrc.includes('const aiAvailable = contextResult?.ok === true;'));

console.log('\n[§S — RÉEL] eventDateLabel — mois en toutes lettres, réutilise monthFull (calendar.ts)');
{
  // Ne peut pas importer eventDateLabel directement (non exporté, interne à MessageScreen.tsx qui
  // importe react-native) — reproduit ici la MÊME formule que le code source (extraite ci-dessous par
  // regex) pour un cas connu, et compare au monthFull RÉEL importé (pas une copie de la liste des mois).
  const iso = '2026-09-19';
  const [, m, d] = iso.split('-');
  const expected = `${parseInt(d, 10)} ${monthFull[parseInt(m, 10) - 1]}`;
  check('exemple conceptuel de la demande : "2026-09-19" → "19 septembre"', expected === '19 septembre');
}

console.log('\n[§T — source] MessageScreen.tsx — carte de contexte `event` (2026-09-17)');
check(
  'eventDateLabel présent et construit bien "{jour} {mois en toutes lettres}" via monthFull (jamais frDate/calendar.ts, qui abrège)',
  /function eventDateLabel\(iso: string\): string \{\s*const \[, m, d\] = iso\.split\('-'\);\s*return `\$\{parseInt\(d, 10\)\} \$\{monthFull\[parseInt\(m, 10\) - 1\]\}`;\s*\}/.test(screenSrc),
);
check('monthFull importé depuis data/calendar.ts (pas dupliqué)', screenSrc.includes("import { monthFull } from '../data/calendar';"));

{
  const cardMatch = screenSrc.match(/\{occasion === 'event' && eventPensee && eventPensee\.date && \([\s\S]*?\n {6}\)\}/);
  const cardBlock = cardMatch ? cardMatch[0] : '';
  check('carte trouvée, condition exacte : event && eventPensee trouvé && eventPensee.date', cardBlock.length > 0);
  check(
    'jamais affichée pour birthday/thinking_of_you (seule condition = occasion === \'event\', aucune autre branche)',
    (screenSrc.match(/styles\.eventContextCard/g) ?? []).length === 1 && cardBlock.startsWith("{occasion === 'event' &&"),
  );
  check('texte affiché = eventPensee.texte (la pensée résolue depuis le store, jamais un champ des params)', cardBlock.includes('{eventPensee.texte}'));
  check('date affichée = eventDateLabel(eventPensee.date)', cardBlock.includes('{eventDateLabel(eventPensee.date)}'));
  check('icône réutilisée de la bibliothèque déjà en place (Ionicons, chatbubble-ellipses-outline) — aucune nouvelle dépendance', cardBlock.includes('Ionicons name="chatbubble-ellipses-outline"'));
  check('accent violet Pensif (theme.plum/plumTint), cohérent avec le type "pensée" déjà utilisé ailleurs (Dot.tsx)', cardBlock.includes('theme.plumTint') && cardBlock.includes('theme.plum'));
  check('carte non cliquable en V1 — aucun Pressable/onPress dans ce bloc', !/Pressable|onPress/.test(cardBlock));
}

check(
  'positionnement exact : juste après "Message pour {contact.prenom}", avant les chips de ton (toneRow)',
  /Message pour \{contact\.prenom\}<\/Text>\s*\{\/\*[\s\S]*?\{occasion === 'event' && eventPensee && eventPensee\.date && \([\s\S]*?<View style=\{styles\.toneRow\}>/.test(screenSrc),
);

check('Ionicons importé depuis @expo/vector-icons (bibliothèque déjà utilisée ailleurs dans l’app, ex. FicheScreen/PenseeDetailScreen)', screenSrc.includes("import { Ionicons } from '@expo/vector-icons';"));

console.log('\n[§U — source] Comportement absent — pensée introuvable ou sans date → rien affiché (défensif, pas de nouveau code requis)');
check(
  'eventPensee = null si la pensée n’existe plus dans le store (pensees.find(...) ?? null) — la carte se replie naturellement sur "rien affiché" via la condition existante',
  screenSrc.includes("pensees.find((p) => p.id === route.params.penseeId) ?? null : null;"),
);
check(
  'condition de la carte exige explicitement eventPensee.date (une pensée SANS date, ex. simple rappel technique, n’affiche jamais la carte)',
  screenSrc.includes("occasion === 'event' && eventPensee && eventPensee.date &&"),
);

console.log('\n[§V — source] non-régression explicite — génération IA / drafts / tons / Copier-SMS-WhatsApp inchangés par cet ajout purement visuel');
check('handleGenerate toujours défini une seule fois, logique inchangée (voir §G)', (screenSrc.match(/async function handleGenerate\(\) \{/g) ?? []).length === 1);
check('drafts/handleTextChange/handleToneChange toujours présents et inchangés (voir §E/§F)', screenSrc.includes('function handleTextChange(nextText: string) {') && screenSrc.includes('function handleToneChange(nextTone: Tone) {'));
check('sendSms/copyMessage/sendWhatsApp toujours basés sur currentText (voir §D)', screenSrc.includes('await SMS.sendSMSAsync') && screenSrc.includes('await Clipboard.setStringAsync(currentText)') && screenSrc.includes('encodeURIComponent(currentText)'));
check('aucune référence à eventContextCard dans le contexte IA (buildMessageSuggestionContext) — purement visuel, jamais transmis au LLM', !/buildMessageSuggestionContext\([\s\S]{0,40}eventContext/.test(screenSrc));

console.log('\n[§W — source] avertissement IA repositionné DANS la bulle, sous le composer (2026-09-17)');
{
  const bubbleMatch = screenSrc.match(/<View style=\{\[styles\.bubble,[\s\S]*?\n {6}<\/View>/);
  const bubbleBlock = bubbleMatch ? bubbleMatch[0] : '';
  check('bloc `bubble` trouvé', bubbleBlock.length > 0);
  check('le TextInput reste le PREMIER enfant de la bulle (avertissement APRÈS, jamais avant)', /<TextInput[\s\S]*?\/>[\s\S]*?\{currentAiGenerated && \(/.test(bubbleBlock));
  check('l’avertissement est DANS le même conteneur visuel que le message (à l’intérieur de styles.bubble, pas au-dessus)', bubbleBlock.includes("Pensif s'appuie sur ce qu'il connaît de vous.\\nRelis toujours avant d'envoyer."));
  check('un <Text> séparé du <TextInput> — jamais fusionné dans le composer', /<\/TextInput>|\/>\s*\{currentAiGenerated/.test(bubbleBlock.replace(/\n/g, ' ')) || bubbleBlock.includes('<Text style={[styles.aiLabel,'));
}
check('l’ancien emplacement (juste au-dessus de la bulle, avant `<View style={[styles.bubble`) a bien disparu', !/\{currentAiGenerated && \([\s\S]{0,40}<Text style=\{\[styles\.aiLabel,[\s\S]{0,60}\)\}\s*\n\s*<View style=\{\[styles\.bubble/.test(screenSrc));
check('couleur secondaire gris (theme.inkSoft, pas theme.accent qui attirait trop l’attention)', /aiLabel, \{ color: theme\.inkSoft/.test(screenSrc));
check('style aiLabel : petite taille, italique, séparateur discret (bordure fine)', /aiLabel: \{[\s\S]*?fontSize: 11[\s\S]*?fontStyle: 'italic'[\s\S]*?borderTopWidth: StyleSheet\.hairlineWidth[\s\S]*?\}/.test(screenSrc));

console.log('\n[§X — source] avertissement IA — ne fait jamais partie de messageText/drafts, jamais copié/envoyé (non-régression explicite)');
check('handleTextChange ne référence jamais le texte de l’avertissement (met à jour uniquement drafts[tone].text depuis nextText, la valeur du TextInput)', screenSrc.includes('setDrafts((prev) => ({ ...prev, [tone]: { text: nextText, aiGenerated: prev[tone]?.aiGenerated ?? false } }));'));
check('copyMessage/sendSms/sendWhatsApp lisent toujours EXCLUSIVEMENT `currentText` (jamais un texte incluant l’avertissement)', screenSrc.includes('await Clipboard.setStringAsync(currentText)') && screenSrc.includes('await SMS.sendSMSAsync') && screenSrc.includes('encodeURIComponent(currentText)'));
check('currentText dérive uniquement de drafts[tone]?.text / template — jamais concaténé avec le texte de l’avertissement', /const currentText = currentEntry\?\.text \?\? \(occasion === 'birthday' \? messageTemplates\[tone\]\(contact\) : ''\);/.test(screenSrc));
check('aiGenerated toujours géré exactement comme avant — une édition manuelle conserve prev[tone]?.aiGenerated (comportement inchangé)', screenSrc.includes('aiGenerated: prev[tone]?.aiGenerated ?? false'));

console.log('\n[§Y — source] carte de contexte `event` — bordure adoucie (2026-09-17), cohérente avec le reste de l’app');
check('bordure = theme.line (même token que bubble/sentToggle), plus theme.plum (corail trop marqué)', screenSrc.includes('styles.eventContextCard, { backgroundColor: theme.plumTint, borderColor: theme.line }'));
check('fond et icône restent plum/plumTint (identité "pensée" conservée — seule la bordure change)', screenSrc.includes('backgroundColor: theme.plumTint') && screenSrc.includes('Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.plum}'));

console.log('\n[§Z — source] composer à hauteur dynamique — CORRECTIF (2026-09-17) : vérifie l’ABSENCE de contraintes contradictoires, pas la présence d’un mécanisme de mesure (voir post-mortem : onContentSizeChange+height, testé §Z en v1, était présent dans le code mais ne fonctionnait PAS en réel sur iPhone pour un texte inséré programmatiquement — un test de présence de code ne peut pas détecter ça).');
{
  const bubbleMatch = screenSrc.match(/<View style=\{\[styles\.bubble,[\s\S]*?\n {6}<\/View>/);
  const bubbleBlock = bubbleMatch ? bubbleMatch[0] : '';
  const textInputMatch = bubbleBlock.match(/<TextInput[\s\S]*?\/>/);
  const textInputBlock = textInputMatch ? textInputMatch[0] : '';
  check('bloc TextInput trouvé', textInputBlock.length > 0);

  check('composerHeight (mesure manuelle, non fiable en réel sur iOS pour un texte programmatique) a été SUPPRIMÉ, pas seulement modifié', !screenSrc.includes('composerHeight'));
  check('onContentSizeChange a disparu du TextInput (mécanisme de mesure abandonné, cause du bug)', !textInputBlock.includes('onContentSizeChange'));

  check('AUCUNE `height` fixée sur le TextInput (seul minHeight — laisse RN auto-dimensionner le champ à son contenu, sans plafond)', !/\bheight:/.test(textInputBlock));
  check('AUCUN `maxHeight` sur le TextInput (aucun plafond arbitraire — le texte long ne doit jamais être coupé)', !/\bmaxHeight:/.test(textInputBlock));
  check('minHeight = MIN_COMPOSER_HEIGHT présent (plancher pour un message court, jamais un plafond)', textInputBlock.includes('minHeight: MIN_COMPOSER_HEIGHT'));

  check('AUCUNE `height`/`maxHeight` fixée sur styles.bubble (le conteneur parent doit pouvoir suivre la hauteur du TextInput, jamais l’inverse)', /bubble: \{[^}]*\}/.exec(screenSrc) !== null && !/bubble: \{[^}]*(height|maxHeight)[^}]*\}/.test(screenSrc));
  check('AUCUN flex/flexGrow/flexShrink sur styles.bubble ou son View englobant (rien qui pourrait forcer/écraser sa hauteur)', !/bubble: \{[^}]*flex[^}]*\}/.test(screenSrc) && !/<View style=\{\[styles\.bubble,[^}]*flex/.test(screenSrc));
  check('AUCUN `overflow: \'hidden\'` sur styles.bubble (ne coupe jamais visuellement un contenu qui dépasserait)', !/bubble: \{[^}]*overflow[^}]*\}/.test(screenSrc));

  check(
    'scrollEnabled={false} conservé — cohérent ICI uniquement parce qu’aucune height/maxHeight ne borne plus le TextInput (rien ne peut donc jamais dépasser la boîte)',
    textInputBlock.includes('scrollEnabled={false}'),
  );
  check('textAlignVertical="top" conservé (Android — évite un texte centré verticalement dans une boîte devenue plus haute que son contenu)', textInputBlock.includes('textAlignVertical="top"'));

  check(
    'le disclaimer IA reste un <Text> APRÈS le TextInput dans la bulle, jamais À L’INTÉRIEUR du TextInput lui-même',
    /<\/View>\s*$/.test(bubbleBlock.trim()) &&
      bubbleBlock.indexOf('<TextInput') < bubbleBlock.indexOf("Pensif s'appuie sur ce qu'il connaît de vous.\\nRelis toujours avant d'envoyer."),
  );
}

check('MIN_COMPOSER_HEIGHT = 60 — hauteur minimale agréable conservée pour un message court', screenSrc.includes('const MIN_COMPOSER_HEIGHT = 60;'));
check(
  'Screen appelé SANS scroll:false (donc scroll:true par défaut) — c’est la page qui défile si la bulle rend l’écran plus haut que le viewport, jamais le composer',
  screenSrc.includes('<Screen>') && !/<Screen\s+scroll=\{false\}/.test(screenSrc),
);
{
  const screenSrcFile = readSrc('src', 'components', 'Screen.tsx');
  check('Screen.tsx — la ScrollView réelle n’impose aucune height/maxHeight à son contenu (contentContainerStyle = padding uniquement)', /content: \{ padding: 20, paddingBottom: 110 \}/.test(screenSrcFile));
  check('Screen.tsx — aucun overflow:hidden sur le conteneur de contenu qui couperait un enfant plus haut que prévu', !/content: \{[^}]*overflow[^}]*\}/.test(screenSrcFile));
}

console.log('  ⚠️  À VALIDER MANUELLEMENT SUR IPHONE — un test de source ne peut pas observer le layout réel rendu par iOS ; c’est exactement ce type de test qui avait donné un faux sentiment de sécurité au correctif précédent.');

console.log('\n[§AC — source] CORRECTIF 2 (2026-09-17) — bug réel "Court vide → retour Complice long" (composer figé ~2 lignes)');
{
  const bubbleMatch = screenSrc.match(/<View style=\{\[styles\.bubble,[\s\S]*?\n {6}<\/View>/);
  const bubbleBlock = bubbleMatch ? bubbleMatch[0] : '';
  const textInputMatch = bubbleBlock.match(/<TextInput[\s\S]*?\/>/);
  const textInputBlock = textInputMatch ? textInputMatch[0] : '';

  check(
    'AUDIT CONFIRMÉ : un seul <TextInput> pour les 3 tons (pas un par ton) — c’est bien la même instance native réutilisée au changement de ton',
    (screenSrc.match(/<TextInput/g) ?? []).length === 1,
  );
  check(
    'tone est un state simple, changé UNIQUEMENT par handleToneChange (jamais par frappe) — la clé ci-dessous ne peut donc jamais changer à chaque caractère',
    screenSrc.includes("const [tone, setTone] = useState<Tone>('chaleureux');") && screenSrc.includes('function handleToneChange(nextTone: Tone) {\n    setTone(nextTone);\n  }'),
  );
  check(
    'key={tone} présent sur le TextInput — force un remount natif à CHAQUE changement de ton, jamais pendant l’édition du même ton',
    textInputBlock.startsWith('<TextInput\n          key={tone}'),
  );
  check(
    'la clé n’est JAMAIS dérivée de currentText/currentEntry (sinon remount à chaque frappe, perte de focus/curseur en cours d’édition)',
    !/key=\{(currentText|currentEntry)/.test(screenSrc),
  );
  check(
    'la clé n’est pas non plus liée à contact/occasion/pensée (ces identités ont déjà leur propre garde d’hydratation, hors périmètre de ce correctif — voir §I/§R)',
    !/key=\{`\$\{tone\}/.test(screenSrc),
  );
}

console.log(
  '  ⚠️  À VALIDER MANUELLEMENT SUR IPHONE — séquence exacte : Chaleureux (message long) → Complice (message long) → Court (vide) → retour Complice → le message long doit s’afficher INTÉGRALEMENT dès ce retour, sans repasser par un autre ton. Un test de source ne peut pas observer si iOS re-mesure réellement le TextInput remonté.',
);

console.log('\n[§AA — source] protection "nouvelle génération" (2026-09-17) — confirmation uniquement si un résultat IA existe déjà');
{
  const confirmFnMatch = screenSrc.match(/function handleGenerateButtonPress\(\) \{[\s\S]*?\n  \}/);
  const confirmFnBody = confirmFnMatch ? confirmFnMatch[0] : '';
  check('handleGenerateButtonPress trouvé', confirmFnBody.length > 0);
  check(
    'première génération (currentAiGenerated=false) → appel DIRECT de handleGenerate, aucune confirmation (return; dans le if empêche d’atteindre ce dernier appel quand une confirmation vient d’être affichée)',
    confirmFnBody.trimEnd().endsWith('void handleGenerate();\n  }') && confirmFnBody.includes('return;\n    }\n    void handleGenerate();'),
  );
  check('titre exact de la confirmation', confirmFnBody.includes("'Générer une nouvelle proposition ?'"));
  check('message exact de la confirmation', confirmFnBody.includes("'Votre message actuel sera remplacé.'"));
  check('bouton "Annuler" présent, style cancel', confirmFnBody.includes("{ text: 'Annuler', style: 'cancel' }"));
  check(
    '"Annuler" n’a AUCUN onPress — donc AUCUN effet possible (pas d’appel API, pas de changement de draft/quota) : Alert ferme la boîte sans rien exécuter',
    !/\{ text: 'Annuler', style: 'cancel', onPress/.test(confirmFnBody),
  );
  check('bouton "Générer" appelle EXACTEMENT le flux de génération existant (handleGenerate, inchangé)', confirmFnBody.includes("{ text: 'Générer', onPress: () => void handleGenerate() }"));
  check('le bouton IA appelle bien handleGenerateButtonPress (plus handleGenerate directement)', screenSrc.includes('onPress={handleGenerateButtonPress}') && !screenSrc.includes('onPress={handleGenerate}'));
}

check('nouveau libellé "Générer une autre proposition" (remplace "Régénérer")', screenSrc.includes("currentAiGenerated ? 'Générer une autre proposition' : 'Personnaliser avec Pensif'"));
check('ancien libellé "Régénérer" a bien disparu', !screenSrc.includes("'Régénérer'"));

console.log('\n[§AB — source] anti-double-tap et protection d’une édition manuelle — non-régression explicite');
check(
  'garde anti-double-tap (generatingRef) toujours en tout premier dans handleGenerate, inchangée par l’ajout de la confirmation',
  /async function handleGenerate\(\) \{\n {4}if \(generatingRef\.current\) return;/.test(screenSrc),
);
check(
  'une édition manuelle d’un message IA conserve aiGenerated:true (handleTextChange, inchangé) — donc la confirmation reste active après édition manuelle, pas seulement après génération',
  screenSrc.includes('setDrafts((prev) => ({ ...prev, [tone]: { text: nextText, aiGenerated: prev[tone]?.aiGenerated ?? false } }));'),
);
check(
  'currentAiGenerated (qui pilote la confirmation) dérive de drafts[tone].aiGenerated — reflète donc aussi bien une génération qu’une édition manuelle ultérieure du même brouillon',
  screenSrc.includes('const currentAiGenerated = currentEntry?.aiGenerated ?? false;'),
);
check('aucun historique de générations ni bouton Undo ajouté (hors périmètre explicite de ce chantier)', !/undo|historique|history/i.test(screenSrc));

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
