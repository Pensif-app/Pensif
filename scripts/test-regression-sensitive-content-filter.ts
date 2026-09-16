/// <reference types="node" />
// Tests de non-régression — CHANTIER RÉPONSES INTELLIGENTES : filet de sécurité V1 pour les données
// sensibles (sensitiveContentFilter.ts, 2026-09-16). Heuristique lexicale déterministe — PAS une
// classification exhaustive, voir le commentaire d'en-tête du module. Tous les tests ci-dessous sont
// RÉELLEMENT EXÉCUTÉS contre les vraies fonctions (isSensitiveText/detectSensitiveCategories).
//
// Usage : npx tsx scripts/test-regression-sensitive-content-filter.ts

import { detectSensitiveCategories, isSensitiveText } from '../src/data/sensitiveContentFilter';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n[1] Chaque catégorie V1 — au moins un exemple détecté');
check('santé physique — "Diagnostic de cancer confirmé la semaine dernière."', isSensitiveText('Diagnostic de cancer confirmé la semaine dernière.'));
check('santé physique — "A été hospitalisée deux jours."', isSensitiveText('A été hospitalisée deux jours.'));
check('santé mentale — "Traverse une dépression depuis quelques mois."', isSensitiveText('Traverse une dépression depuis quelques mois.'));
check('santé mentale — "Suivi en thérapie chez un psychologue."', isSensitiveText('Suivi en thérapie chez un psychologue.'));
check('deuil — "Le décès de son père l’a beaucoup affecté."', isSensitiveText('Le décès de son père l’a beaucoup affecté.'));
check('deuil — "Obsèques prévues vendredi."', isSensitiveText('Obsèques prévues vendredi.'));
check('addictions — "Lutte contre son alcoolisme depuis un an."', isSensitiveText('Lutte contre son alcoolisme depuis un an.'));
check('addictions — "En cure de désintox depuis mars."', isSensitiveText('En cure de désintox depuis mars.'));
check('violence/abus — "A porté plainte pour agression."', isSensitiveText('A porté plainte pour agression.'));
check('violence/abus — "Situation de harcèlement au travail."', isSensitiveText('Situation de harcèlement au travail.'));

console.log('\n[2] Accents, casse, pluriels/variantes de suffixe');
check('accents — "DÉPRESSION" (majuscules + accent)', isSensitiveText('DÉPRESSION en ce moment.'));
check('casse — "Hospitalisé" vs "hospitalisé"', isSensitiveText('Hospitalisé la semaine dernière.') === isSensitiveText('hospitalisé la semaine dernière.'));
check('pluriel — "hospitalisations" (suffixe absorbé par \\w*)', isSensitiveText('Plusieurs hospitalisations cette année.'));
check('variante — "hospitalisée" (accord féminin)', isSensitiveText('Elle a été hospitalisée.'));
check('variante — "addictions" (pluriel)', isSensitiveText('Plusieurs addictions à gérer.'));
check('variante — "agressée" (accord féminin)', isSensitiveText('A été agressée dans la rue.'));
check('accent supprimé côté terme — "décès"/"deces" détectés de façon identique', isSensitiveText('Le décès de sa tante.') === isSensitiveText('Le deces de sa tante.'));

console.log('\n[3] Faux positifs de sous-chaînes — NE DOIVENT PAS être détectés');
check('"violette" (couleur/fleur) ne matche pas "viol" — ensemble fermé, pas de racine ouverte', !isSensitiveText('Il préfère la couleur violette.'));
check('"violon"/"violoniste" ne matchent pas "viol"', !isSensitiveText('Elle joue du violon depuis 10 ans.') && !isSensitiveText('C’est une violoniste talentueuse.'));
check('"violence" reste bien détectée (via la racine "violen", pas "viol")', detectSensitiveCategories('violence conjugale').every((c) => c === 'violence_abus'));
check('"mort de rire" — pas de faux positif générique (mort/mourir volontairement hors scope, trop idiomatique)', !isSensitiveText('Mort de rire à cette blague !'));
check('"trouble" seul (trop générique) non listé comme terme sensible', !isSensitiveText('Ça me trouble un peu.'));
check('"abusé" détecté comme prévu (terme volontairement inclus dans violence_abus, pas un faux positif)', isSensitiveText('Il a été abusé de sa confiance.'));
check('"viol"/"violée" (formes exactes de l’ensemble fermé) bien détectées', isSensitiveText('A été victime de viol.') && isSensitiveText('A été violée l’an dernier.'));
check('"violent"/"violente"/"violemment" désormais détectés (racine "violen", comblait un trou de couverture)', isSensitiveText('Un père très violent.') && isSensitiveText('Une dispute violente hier soir.') && isSensitiveText('A réagi violemment.'));

console.log('\n[4] Pensées/textes ordinaires — jamais détectés');
check('pensée neutre — anniversaire', !isSensitiveText('A adoré son cadeau d’anniversaire cette année.'));
check('pensée neutre — loisir', !isSensitiveText('Prépare un semi-marathon pour le mois prochain.'));
check('pensée neutre — logistique', !isSensitiveText('Rendez-vous garagiste jeudi 14h.'));
check('texte vide — jamais détecté, jamais d’erreur', !isSensitiveText(''));
check('texte très court — jamais d’erreur', !isSensitiveText('Ok'));

console.log('\n[5] detectSensitiveCategories — catégories exactes retournées, jamais un booléen approximatif');
{
  const cats = detectSensitiveCategories('Diagnostic de cancer et suivi en thérapie.');
  check('2 catégories détectées (santé physique + santé mentale)', cats.includes('sante_physique') && cats.includes('sante_mentale'));
}
{
  const cats = detectSensitiveCategories('Adore les randonnées le week-end.');
  check('aucune catégorie sur un texte neutre', cats.length === 0);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
