# Benchmark observationnel — comportement actuel de `texte` (Capture v13, avant toute modification)

Modèle : `gpt-5-mini` (production actuelle de Capture). Contexte fixe : vendredi 2026-09-18 10:00, "demain" = 2026-09-19.

Ce rapport ne juge pas PASS/FAIL — il documente la sortie brute complète de chaque cas pour établir la baseline.

## Cas 1
Transcript : "Rappelle-moi tous les jours à 21h40 de faire mes combats sur mon jeu mobile Star Wars."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Rappelle-moi tous les jours à 21h40 de faire mes combats sur mon jeu mobile Star Wars.`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":null,"time":"21:40","heardExpression":"Rappelle-moi tous les jours à 21h40 de faire mes combats sur mon jeu mobile Star Wars.","confidence":0.9}`
    - reminder.recurrence : `{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}`
- Latence : 7824ms · Tokens in/out : 3986/426 · Coût estimé : $0.001848
- Observation manuelle : 

## Cas 2
Transcript : "Pense à appeler Yohan demain à 18h."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Pense à appeler Yohan demain à 18h.`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.5}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":"18:00","heardExpression":"demain à 18h","confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 4599ms · Tokens in/out : 3975/359 · Coût estimé : $0.001712
- Observation manuelle : 

## Cas 3
Transcript : "Rappelle-moi vendredi d'acheter du café."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Rappelle-moi vendredi d'acheter du café.`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.6}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-18","time":null,"heardExpression":"vendredi d'acheter du café","confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 5059ms · Tokens in/out : 3974/418 · Coût estimé : $0.001829
- Observation manuelle : 

## Cas 4
Transcript : "Rappelle-moi demain de demander à Yohan s'il est disponible vendredi."

- validateLlmOutput : ok=true, 2 pensée(s)
  - Pensée [0]
    - texte : `Rappelle-moi demain de demander à Yohan s'il est disponible vendredi.`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":null,"heardExpression":"Rappelle-moi demain de demander à Yohan s'il est disponible vendredi.","confidence":0.9}`
    - reminder.recurrence : `null`
  - Pensée [1]
    - texte : `demander à Yohan s'il est disponible vendredi.`
    - event : `{"hasDate":true,"date":"2026-09-18","heardExpression":"vendredi","confidence":0.8}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.8}`
    - reminder.recurrence : `null`
- Latence : 11875ms · Tokens in/out : 3979/1014 · Coût estimé : $0.003023
- Observation manuelle : 

## Cas 5
Transcript : "Sofia a un entretien vendredi."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Sofia a un entretien vendredi.`
    - event : `{"hasDate":true,"date":"2026-09-18","heardExpression":"vendredi","confidence":0.95}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 6352ms · Tokens in/out : 3970/283 · Coût estimé : $0.001558
- Observation manuelle : 

## Cas 6
Transcript : "Micka aimerait un casque audio."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Micka aimerait un casque audio.`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 3526ms · Tokens in/out : 3971/276 · Coût estimé : $0.001545
- Observation manuelle : 

## Cas 7
Transcript : "Yohan préfère son café sans sucre."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Yohan préfère son café sans sucre.`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.95}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.95}`
    - reminder.recurrence : `null`
- Latence : 3526ms · Tokens in/out : 3971/212 · Coût estimé : $0.001417
- Observation manuelle : 

## Cas 8
Transcript : "Rappelle-moi d'acheter un cadeau pour l'anniversaire de Léa samedi."

- validateLlmOutput : ok=true, 2 pensée(s)
  - Pensée [0]
    - texte : `Rappelle-moi d'acheter un cadeau pour l'anniversaire de Léa samedi.`
    - event : `{"hasDate":true,"date":"2026-09-19","heardExpression":"samedi","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
    - reminder.recurrence : `null`
  - Pensée [1]
    - texte : `Rappelle-moi d'acheter un cadeau pour l'anniversaire de Léa samedi.`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":null,"heardExpression":"samedi","confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 8888ms · Tokens in/out : 3981/756 · Coût estimé : $0.002507
- Observation manuelle : 

## Cas 9 (contrôle)
Transcript : "Rappelle-moi tous les jours pendant 5 jours à partir de demain à 21h40 de faire mes étirements."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Rappelle-moi tous les jours pendant 5 jours à partir de demain à 21h40 de faire mes étirements.`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":"21:40","heardExpression":"Rappelle-moi tous les jours pendant 5 jours à partir de demain à 21h40 de faire mes étirements.","confidence":0.95}`
    - reminder.recurrence : `{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours pendant 5 jours"}`
- Latence : 6512ms · Tokens in/out : 3990/509 · Coût estimé : $0.002015
- Observation manuelle : 

## Cas 10 (contrôle)
Transcript : "Rappelle-moi chaque lundi à 18h d'appeler Léa."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Rappelle-moi chaque lundi à 18h d'appeler Léa.`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.6}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-21","time":"18:00","heardExpression":"chaque lundi à 18h d'appeler Léa","confidence":0.95}`
    - reminder.recurrence : `{"detected":true,"frequency":"weekly","daysOfWeek":[1],"occurrenceCount":null,"untilDate":null,"heardExpression":"chaque lundi"}`
- Latence : 6030ms · Tokens in/out : 3979/487 · Coût estimé : $0.001969
- Observation manuelle : 

## Synthèse

- Coût total estimé : $0.019424
- Rappel : ce benchmark établit uniquement la baseline actuelle de `texte` — aucune règle de concision n'existe encore dans le prompt v13, donc `texte` est attendu comme "tel quel" (verbeux) dans tous les cas de rappel ci-dessus. Voir analyse séparée pour les patterns.