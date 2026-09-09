# Pensif

App mobile (React Native / Expo) : anniversaires, petit quizz par contact, idées cadeaux, calendrier avec jours fériés et fêtes de prénoms, messages pré-écrits.

## Lancer le projet

```bash
npm install
npm run web      # aperçu rapide dans le navigateur
npm run ios      # nécessite un Mac ou EAS
npm run android  # nécessite Android Studio / un appareil
```

## État actuel

L'app fonctionne dès aujourd'hui, avec ou sans Supabase configuré :

- **Sans Supabase** (par défaut) — données de démo stockées en local (`AsyncStorage`), rien à configurer pour l'essayer.
- **Avec Supabase** — dès que les clés sont renseignées (voir ci-dessous), l'app bascule automatiquement en mode connecté : connexion anonyme, contacts et pensées lus/écrits en base, et un jeu de données de démo est créé automatiquement au tout premier lancement si la base est vide.

Fonctionnalités en place :

- **Accueil** — anniversaires du jour et à venir, avec le prénom personnalisé au premier lancement.
- **Contacts** — liste + fiche (import possible depuis les contacts du téléphone via `expo-contacts`).
- **Fiche contact** — infos + petit quizz en 3 questions.
- **Cadeaux** — idées générées à partir des réponses au quizz (`src/data/giftEngine.ts` : recherche de mots-clés dans les 3 réponses, avec une petite phrase qui cite la réponse concernée), filtrables par budget.
- **Calendrier** — vue mois et semaine, jours fériés français, fête des Mères/Pères/Grands-mères/Grands-pères calculées automatiquement, fête du prénom (table simplifiée), pensées personnalisées avec rappel paramétrable.
- **Message** — 3 tons de message pré-écrit, copie ou envoi SMS natif (`expo-sms`).
- **Réglages** (icône engrenage sur l'accueil) — prénom, activer/désactiver les rappels, thème clair/sombre/système, état du stockage (local ou Supabase), et réinitialisation des données de démo en mode local.
- **Rappels locaux** (`expo-notifications`) — reprogrammés à chaque changement de données : anniversaire le jour J, rappel cadeaux à J-14 (si le quizz est rempli), fête du prénom, et chaque pensée selon le délai choisi. Fonctionne hors ligne, pas de serveur de push nécessaire. Non disponible sur le web (limitation du navigateur), fonctionne sur iOS/Android.
- **Navigation** — les 4 onglets se swipent au doigt (gauche/droite) en plus de la barre du bas ; toutes les pages empilées (fiche, réglages, message) ont une flèche retour visible en haut à gauche, qui revient automatiquement à l'écran d'où on est venu.

## Brancher Supabase

Le schéma est prêt dans `supabase/schema.sql` et le client dans `src/lib/supabase.ts` :

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Colle le contenu de `supabase/schema.sql` dans l'éditeur SQL du projet.
3. Dans **Authentication → Sign In / Providers**, active **Anonymous Sign-Ins** (l'app connecte chaque appareil anonymement, sans mot de passe ni email — c'est ce qui permet à Row Level Security de séparer les données de chacun).
4. Copie `.env.example` vers `.env` et renseigne `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API).
5. Relance `npm run web` / `npm run ios` / `npm run android` — l'app se connecte automatiquement.

## Autres pistes

- Remplacer le petit moteur de mots-clés (`src/data/giftEngine.ts`) par un vrai catalogue produit avec liens d'affiliation, ou par un appel à un LLM pour des suggestions plus fines.
- Étendre la table des prénoms (`src/data/calendar.ts`) ou la brancher sur une vraie API du calendrier des prénoms.
- Un vrai compte (email/mot de passe) si un jour l'app doit être utilisable sur plusieurs appareils par la même personne — la connexion anonyme actuelle est liée à l'appareil.
