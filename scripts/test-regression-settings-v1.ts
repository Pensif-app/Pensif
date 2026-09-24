// CHANTIER "Réglages V1" (2026-09-24) — SettingsScreen.tsx (react-native) ne peut pas être chargé sous
// tsx : câblage vérifié par source-grep ; `countScheduledReminders` (pur) est exécuté pour de vrai.
//
// Usage : npx tsx scripts/test-regression-settings-v1.ts

import * as fs from 'fs';
import * as path from 'path';
import { Pensee, ReminderRecurrence } from '../src/data/types';
import { countScheduledReminders } from '../src/data/penseeReminderRecurrence';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'SettingsScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
// Code seul : on retire commentaires bloc/ligne/JSX pour ne juger que le texte réellement affiché.
const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function makePensee(overrides: Partial<Pensee>): Pensee {
  return { id: 'p', texte: 't', contactId: null, createdAt: '2026-01-01T00:00:00.000Z', date: null, endDate: null, reminderAt: null, ...overrides };
}
const NOW = new Date(2026, 8, 24, 12, 0, 0);
const iso = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h, 0, 0).toISOString();
const daily: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null };
const weekly: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [3, 5], occurrenceCount: null, untilDate: null };
const finiteDone: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: 2, untilDate: null };

console.log('\n[Rappels programmés] countScheduledReminders (exécution réelle)');
check('one-off futur compte', countScheduledReminders([makePensee({ reminderAt: iso(2026, 8, 25, 9) })], NOW) === 1);
check('one-off passé ne compte pas', countScheduledReminders([makePensee({ reminderAt: iso(2026, 8, 20, 9) })], NOW) === 0);
check('daily infini compte (1, pas N)', countScheduledReminders([makePensee({ reminderAt: iso(2026, 8, 1, 9), reminderRecurrence: daily })], NOW) === 1);
check('weekly infini compte (1, pas N)', countScheduledReminders([makePensee({ reminderAt: iso(2026, 8, 2, 9), reminderRecurrence: weekly })], NOW) === 1);
check('récurrence finie épuisée ne compte plus', countScheduledReminders([makePensee({ reminderAt: iso(2026, 8, 1, 9), reminderRecurrence: finiteDone })], NOW) === 0);
check('pensée sans rappel ne compte pas (même avec date d’événement future)', countScheduledReminders([makePensee({ date: '2026-09-30' })], NOW) === 0);
check('somme correcte sur un mélange', countScheduledReminders([
  makePensee({ id: 'a', reminderAt: iso(2026, 8, 25, 9) }),
  makePensee({ id: 'b', reminderAt: iso(2026, 8, 20, 9) }),
  makePensee({ id: 'c', reminderAt: iso(2026, 8, 1, 9), reminderRecurrence: daily }),
  makePensee({ id: 'd' }),
], NOW) === 2);

console.log('\n[Wording] plus aucune mention utilisateur de Supabase / stockage / "uniquement depuis cet appareil"');
check('aucun texte affiché ne contient "Supabase" (hors identifiant isSupabaseConfigured)', !/Supabase/.test(code.replace(/isSupabaseConfigured/g, '').replace(/from '\.\.\/lib\/supabase'/g, '')));
check('"Connecté (Supabase)" absent', !code.includes('Connecté (Supabase)'));
check('"Local sur cet appareil" absent', !code.includes('Local sur cet appareil'));
check('"uniquement depuis cet appareil" absent', !src.includes('uniquement depuis cet appareil'));
check('ancien paragraphe "rien n’envoyé à un serveur" absent', !code.includes("rien n'est envoyé à un serveur"));

console.log('\n[Structure] sections et compteurs');
const order = ['>PROFIL<', '>NOTIFICATIONS<', '>APPARENCE<', '>TON PENSIF<', '>DONNÉES ET CONFIDENTIALITÉ<', '>À PROPOS<'].map((s) => code.indexOf(s));
check('sections présentes dans l’ordre PROFIL → NOTIFICATIONS → APPARENCE → TON PENSIF → DONNÉES ET CONFIDENTIALITÉ → À PROPOS', order.every((i) => i !== -1) && order.every((v, i) => i === 0 || v > order[i - 1]), order.join(','));
check('Proches suivis = contacts.length', /label="Proches suivis" value=\{String\(contacts\.length\)\}/.test(code));
check('Pensées enregistrées = pensees.length', /label="Pensées enregistrées" value=\{String\(pensees\.length\)\}/.test(code));
check('Rappels programmés = countScheduledReminders(pensees, today) avec today du Store', /label="Rappels programmés" value=\{String\(countScheduledReminders\(pensees, today\)\)\}/.test(code) && /\n\s+today,\n/.test(src));
check('Rappels programmés indépendant du switch global (notificationsEnabled absent du calcul)', !/countScheduledReminders\([^)]*notificationsEnabled/.test(code));
check('Sauvegarde et synchronisation = "Active"', /label="Sauvegarde et synchronisation" value="Active"/.test(code));
check('aucun lien Confidentialité/Conditions/Contact inventé', !/Conditions d.utilisation|Nous contacter|Confidentialité >/.test(code));

console.log('\n[Compte anonyme / sécurisé] flux OTP inchangé, CTA seulement si anonyme');
check('CTA "Sécuriser mes données" câblé sur startSecurityFlow', /onPress=\{startSecurityFlow\}[\s\S]{0,300}Sécuriser mes données/.test(code));
check('texte explicatif "Sécurise ton compte pour pouvoir récupérer tes données sur un nouvel appareil."', code.includes('Sécurise ton compte pour pouvoir récupérer tes données sur un nouvel appareil.'));
check('bloc de sécurisation gardé par isAnonymous (compte sécurisé → aucun CTA)', /\{isAnonymous && \(\s*<>\s*<View style=\{\[styles\.divider[\s\S]{0,200}securityStep === 'idle'/.test(code));
check('flux OTP conservé : requestAccountSecurityEmail / verifyAccountSecurityOtp / markAccountSecured', /requestAccountSecurityEmail\(trimmed\)/.test(code) && /verifyAccountSecurityOtp\(securityEmail\.trim\(\), trimmed\)/.test(code) && /markAccountSecured\(\)/.test(code));
check('vérification user.id avant/après conservée', /securityIdBefore && result\.userId !== securityIdBefore/.test(code));

console.log('\n[À propos] logo existant + version non codée en dur');
check('logo = assets/icon.png existant', code.includes("require('../../assets/icon.png')"));
check('version issue de APP_VERSION (Constants.expoConfig.version), non hardcodée', /Version \{APP_VERSION\}/.test(code) && /const APP_VERSION = Constants\.expoConfig\?\.version \?\? '1\.0\.0';/.test(src) && !/Version 1\.0\.0/.test(code));
check('nom "Pensif" affiché', />Pensif<\/Text>/.test(code));

console.log('\n[Non-régression] PROFIL / NOTIFICATIONS / APPARENCE conservés');
check('Prénom → openNamePrompt / "Non renseigné"', /label="Prénom"[\s\S]{0,120}Non renseigné[\s\S]{0,80}onPress=\{openNamePrompt\}/.test(code));
check('sous-texte notifications conservé', code.includes('Anniversaires, idées cadeaux à J-14, fêtes de prénom et pensées.'));
check('logique de permission conservée (handleToggleNotifications / Ouvrir les réglages du téléphone)', /onValueChange=\{handleToggleNotifications\}/.test(code) && code.includes('Ouvrir les réglages du téléphone'));
check('thèmes Système/Clair/Obscur conservés, key interne dark inchangée', /label: 'Obscur'/.test(code) && /key: 'dark'/.test(code) && /label: 'Système'/.test(code) && /label: 'Clair'/.test(code));
check('[Dev] Tester une notification reste sous __DEV__', /\{__DEV__ && \(\s*<>[\s\S]{0,600}\[Dev\] Tester une notification/.test(code));
check('[Dev] Simuler une réinstallation reste sous __DEV__', /\{__DEV__ && \(\s*<>[\s\S]{0,600}\[Dev\] Simuler une réinstallation/.test(code));
check('bouton reset démo réservé au mode local (!isSupabaseConfigured)', /\{!isSupabaseConfigured && \(\s*<Pressable onPress=\{confirmReset\}/.test(code));

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
