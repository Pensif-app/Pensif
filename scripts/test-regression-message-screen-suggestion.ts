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
check('le bouton IA n’est rendu QUE si aiAvailable (absent, pas juste désactivé, pour un event bloqué/sensible)', /\{aiAvailable && \(\s*<Pressable\s*\n\s*onPress=\{handleGenerate\}/.test(screenSrc));
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

console.log('\n[§K — source] libellé "Suggestion IA" — affiché seulement après une génération réussie');
check('libellé exact présent', screenSrc.includes("Suggestion IA — relis avant d'envoyer"));
check('conditionné à currentAiGenerated — dérivé du ton actif (jamais affiché sur une simple édition manuelle, ni pour un autre ton)', /\{currentAiGenerated && \([\s\S]{0,120}Suggestion IA/.test(screenSrc));

console.log('\n[§L — source] titre et "Cadeau déjà envoyé" adaptés à l’occasion (non-régression du flux birthday existant)');
check('titre dépend de l’occasion (plus jamais "Joyeux anniversaire" figé pour thinking_of_you/event)', screenSrc.includes('OCCASION_TITLES[occasion]') && screenSrc.includes("birthday: 'Joyeux anniversaire'"));
check('"Cadeau déjà envoyé" réservé à birthday (notion liée à l’occurrence annuelle, non pertinente ailleurs)', /\{occasion === 'birthday' && \(\s*<Pressable\s*\n\s*onPress=\{\(\) => toggleGiftSent/.test(screenSrc));

console.log('\n[§M — source] non-régression des 2 points d’entrée existants (aucun changement requis de leur côté)');
const homeAttentionSrc = readSrc('src', 'data', 'homeAttention.ts');
const giftsScreenSrc = readSrc('src', 'screens', 'GiftsScreen.tsx');
check("navigateToAttention appelle toujours navigate('Message', { contactId: action.contactId }) sans occasion — le défaut 'birthday' s'applique", homeAttentionSrc.includes("navigate('Message', { contactId: action.contactId });"));
check("GiftsScreen appelle toujours navigate('Message', { contactId: contact.id }) sans occasion", giftsScreenSrc.includes("navigation.navigate('Message', { contactId: contact.id })"));

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
