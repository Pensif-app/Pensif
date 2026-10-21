// Build 9, lot C : fiche du proche en LECTURE (cartes dépliables) + mode MODIFIER. Vérifications sur le code source
// (l'écran importe react-native et ne peut pas être monté sous tsx) ; le comportement visuel se valide sur iPhone.
import * as fs from 'fs';
import * as path from 'path';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` : ${detail}` : ''}`);
  }
}
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'FicheScreen.tsx'), 'utf8');

// Découpage : branche lecture / branche formulaire (création ou modification)
const viewStart = src.indexOf("{existing && mode === 'view' ? (");
const formStart = src.indexOf('      ) : (\n        <>', viewStart);
const formEnd = src.indexOf('/** Carte dépliable de la fiche en lecture');
const viewBranch = src.slice(viewStart, formStart);
const formBranch = src.slice(formStart, formEnd);

console.log('\n[1] Ouverture : lecture pour un proche existant, modification pour un nouveau');
check('mode initial : lecture si le proche existe, modification sinon', src.includes("useState<'view' | 'edit'>(existing ? 'view' : 'edit')"));
check('le bouton d’import reste réservé à la création', /\{!existing && \(\s*<Pressable\s*\n\s*onPress=\{importFromContacts\}/.test(formBranch));
check('création : « Enregistrer » ferme l’écran comme avant (goBack)', /\} else \{\s*navigation\.goBack\(\);\s*\}/.test(src));
check('proche existant : « Enregistrer » revient en lecture et relâche le garde anti-double-tap', /if \(existing\) \{[\s\S]{0,320}savingRef\.current = false;[\s\S]{0,120}setMode\('view'\);/.test(src));
check('champs obligatoires inchangés (prénom, date) avant d’enregistrer', src.includes("Prénom manquant") && src.includes("Date manquante"));

console.log('\n[2] Fiche en lecture : cinq éléments, cartes dépliables');
for (const t of ['Idées cadeaux', 'Portrait', 'Pensées liées', 'Rappel d’anniversaire']) check(`carte « ${t} »`, viewBranch.includes(`title="${t}"`));
check('« Écrire un message » : bouton direct, non dépliable', viewBranch.includes('Écrire un message') && !/title="Écrire un message"/.test(viewBranch));
check('une seule carte dépliée à la fois (un seul état openCard)', src.includes("useState<'idees' | 'portrait' | 'pensees' | 'rappel' | null>(null)") && src.includes('prev === card ? null : card'));
check('une ligne de résumé par carte (numberOfLines=1)', /numberOfLines=\{1\}/.test(src.slice(formEnd)));
check('les cartes sont repliées par défaut', src.includes("useState<'idees' | 'portrait' | 'pensees' | 'rappel' | null>(null)"));
check('crayon « Modifier » dans la barre de titre, en lecture seulement', src.includes('accessibilityLabel="Modifier la fiche"') && src.includes("const viewing = !!existing && mode === 'view'"));
check('portrait : refaire le quiz garde push + mode edit (anti-bug historique)', viewBranch.includes("navigation.push('Quiz', { contactId: existing.id, mode: isQuizComplete(existing.quiz) ? 'edit' : 'default' })"));
check('idées : accès à « Mes idées » et aux nouvelles idées', viewBranch.includes("navigate('MesIdees'") && viewBranch.includes("navigate('Cadeaux'"));
check('nouvelles idées : proposées seulement quand le portrait est fait', /quizDone \? \(\s*<Pressable[\s\S]{0,200}navigate\('Cadeaux'/.test(viewBranch));
check('pensées : lien vers l’onglet Pensées filtré sur le proche', viewBranch.includes("navigate('Tabs', { screen: 'Pensées', params: { contactId: existing.id } })"));

console.log('\n[3] Actions immédiates en lecture');
check('rappel : un choix s’enregistre tout de suite (upsertContact), sans passer par « Enregistrer »', /onPress=\{\(\) => upsertContact\(\{ \.\.\.existing, birthdayReminderDays:/.test(viewBranch));
check('étoile : en lecture, le favori s’enregistre tout de suite', src.includes('upsertContact({ ...existing, favorite: !existing.favorite })'));
check('le rappel n’est plus dans le formulaire (conservé tel quel à l’enregistrement)', !formBranch.includes('RAPPEL ANNIVERSAIRE') && src.includes('birthdayReminderDays: existing?.birthdayReminderDays ?? null'));

console.log('\n[4] Mode Modifier : seulement ce qui se règle');
for (const t of ['Prénom', 'Nom', 'Téléphone', 'Anniversaire', 'Genre', 'Lien précis']) check(`champ « ${t} » dans le formulaire`, formBranch.includes(`label="${t}"`));
check('relation dans le formulaire', formBranch.includes('RELATION'));
check('ni quiz, ni pensées, ni message dans le formulaire', !formBranch.includes('LE PETIT QUIZZ') && !formBranch.includes('PENSÉES LIÉES') && !formBranch.includes("occasion: 'thinking_of_you'") && !formBranch.includes('QuizSummaryCard'));
check('Annuler et Supprimer seulement pour un proche existant', /\{existing && \(\s*<>\s*<Pressable onPress=\{cancelEditing\}[\s\S]{0,700}Supprimer ce proche/.test(formBranch));
check('suppression absente de la fiche en lecture', !viewBranch.includes('Supprimer ce proche') && !viewBranch.includes('remove'));
check('modifier repart des valeurs enregistrées (startEditing)', /function startEditing\(\)[\s\S]{0,700}setMode\('edit'\)/.test(src));
check('annuler revient en lecture sans enregistrer', /function cancelEditing\(\)[\s\S]{0,120}setMode\('view'\)/.test(src));

console.log('\n[5] Contraintes');
check('aucun âge affiché dans la fiche', !/ageTurning|plausibleAge| ans\b/.test(src));
check('aucun tiret cadratin dans les textes de la fiche (hors commentaires)', !/^[^/\n]*['"`][^'"`\n]*[—–][^'"`\n]*['"`]/m.test(src.split('\n').filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l)).join('\n')));
check('proche supprimé pendant que l’écran est ouvert : message de récupération conservé', src.includes('Ce proche n’est plus disponible'));
check('navigation vers la fiche inchangée (aucun nouveau paramètre requis)', fs.readFileSync(path.join(__dirname, '..', 'src', 'navigation', 'types.ts'), 'utf8').includes('Fiche: { contactId?: string } | undefined'));

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
