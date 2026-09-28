// CHANTIER "Réglages — liens utiles" (2026-09-27). La logique pure (data/publicLinks.ts) est EXÉCUTÉE avec de faux ouvreurs ;
// le câblage de SettingsScreen (rendu des 4 lignes, navigateur système, alerte d'échec) est vérifié par source-grep.
//
// Usage : npx tsx scripts/test-regression-public-links.ts

import * as fs from 'fs';
import * as path from 'path';
import { PUBLIC_LINKS, PUBLIC_SITE_ORIGIN, isValidPublicUrl, openPublicUrl } from '../src/data/publicLinks';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');

async function main() {
  console.log('1. Liens centralisés');
  check('origine du site = https://pensif-app.fr', PUBLIC_SITE_ORIGIN === 'https://pensif-app.fr');
  check('exactement 4 liens', PUBLIC_LINKS.length === 4);
  const byId = Object.fromEntries(PUBLIC_LINKS.map((l) => [l.id, l]));
  check('Politique de confidentialité → /confidentialite.html', byId.privacy?.label === 'Politique de confidentialité' && byId.privacy?.url === 'https://pensif-app.fr/confidentialite.html');
  check('Support → /support.html', byId.support?.label === 'Support' && byId.support?.url === 'https://pensif-app.fr/support.html');
  check('Conditions d’utilisation → /conditions-utilisation.html', byId.terms?.label === 'Conditions d’utilisation' && byId.terms?.url === 'https://pensif-app.fr/conditions-utilisation.html');
  check('Contact → /contact.html', byId.contact?.label === 'Contact' && byId.contact?.url === 'https://pensif-app.fr/contact.html');
  check('ordre : confidentialité, support, conditions, contact', PUBLIC_LINKS.map((l) => l.id).join(',') === 'privacy,support,terms,contact');
  check('mentions légales et partenaires ne sont PAS dans l’app', !PUBLIC_LINKS.some((l) => /mentions|partenaires/i.test(l.url + l.label)));
  check('toutes les URLs sont valides (https, origine Pensif)', PUBLIC_LINKS.every((l) => isValidPublicUrl(l.url)));

  console.log('2. Validation d’URL');
  check('URL arbitraire refusée', !isValidPublicUrl('https://example.com/x') && !isValidPublicUrl('http://pensif-app.fr/support.html') && !isValidPublicUrl('javascript:alert(1)') && !isValidPublicUrl('https://pensif-app.fr.evil.com/'));
  check('URL avec espace refusée', !isValidPublicUrl('https://pensif-app.fr/a b'));

  console.log('3. Ouverture : chaque ligne appelle la bonne destination, jamais de crash');
  for (const link of PUBLIC_LINKS) {
    const opened: string[] = [];
    const ok = await openPublicUrl(link.url, async (u) => {
      opened.push(u);
    });
    check(`"${link.label}" ouvre exactement ${link.url}`, ok === true && opened.length === 1 && opened[0] === link.url);
  }
  {
    const calls: string[] = [];
    const ok = await openPublicUrl('https://example.com', async (u) => {
      calls.push(u);
    });
    check('URL invalide → false, opener jamais appelé', ok === false && calls.length === 0);
    const failed = await openPublicUrl(PUBLIC_LINKS[0].url, async () => {
      throw new Error('cannot open');
    });
    check('ouverture impossible (erreur) → false, aucune exception propagée', failed === false);
  }

  console.log('4. Câblage SettingsScreen (source-grep)');
  const src = read('src', 'screens', 'SettingsScreen.tsx');
  const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('section "LIENS UTILES" présente, avant "À PROPOS"', code.indexOf('>LIENS UTILES<') !== -1 && code.indexOf('>LIENS UTILES<') < code.indexOf('>À PROPOS<'));
  check('lignes rendues depuis PUBLIC_LINKS (aucune URL dupliquée dans l’écran)', /PUBLIC_LINKS\.map/.test(code) && !/https:\/\/pensif-app\.fr/.test(code));
  check('chaque ligne appelle openUsefulLink(item.url)', /onPress=\{\(\) => void openUsefulLink\(item\.url\)\}/.test(code));
  check('ouverture par le navigateur système (Linking.openURL) via openPublicUrl', /openPublicUrl\(url, \(u\) => Linking\.openURL\(u\)\)/.test(code));
  check('échec → alerte minimale, pas de crash', /Impossible d’ouvrir le lien/.test(code));
  check('aucune WebView interne', !/WebView/.test(code));
  check('icône + chevron : mêmes composants Row / Card / séparateurs que les autres cartes', /<Row theme=\{theme\} icon=\{item\.icon\}/.test(code) && /index > 0 && <View style=\{\[styles\.divider/.test(code));
  check('Mentions légales / Partenaires absents de l’écran', !/Mentions légales|Partenaires/.test(code));
  check('icônes Ionicons : shield-checkmark / help-circle / document-text / mail', /shield-checkmark-outline/.test(read('src', 'data', 'publicLinks.ts')) && /help-circle-outline/.test(read('src', 'data', 'publicLinks.ts')) && /document-text-outline/.test(read('src', 'data', 'publicLinks.ts')) && /mail-outline/.test(read('src', 'data', 'publicLinks.ts')));
  check('aucun changement des flux auth/suppression : appels existants toujours présents', /deleteAllUserData/.test(code) && /requestAccountSecurityEmail/.test(code) && /startSecurityFlow/.test(code));

  console.log('');
  if (failures > 0) {
    console.log(`${failures} ÉCHEC(S).`);
    process.exit(1);
  }
  console.log('Tous les tests des liens utiles passent.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
