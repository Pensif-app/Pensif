# Benchmark observationnel — `texte` APRÈS l'incrément prompt "texte concis + anti-SPLIT" (non déployé)

Modèle : `gpt-5-mini` (production actuelle de Capture). Contexte fixe : vendredi 2026-09-18 10:00, "demain" = 2026-09-19.

Ce rapport ne juge pas PASS/FAIL — il documente la sortie brute complète de chaque cas pour établir la baseline.

## Cas 1
Transcript : "Rappelle-moi tous les jours à 21h40 de faire mes combats sur mon jeu mobile Star Wars."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Faire mes combats sur mon jeu mobile Star Wars`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":null,"time":"21:40","heardExpression":"tous les jours à 21h40","confidence":0.95}`
    - reminder.recurrence : `{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}`
- Latence : 6950ms · Tokens in/out : 5230/592 · Coût estimé : $0.002491
- Observation manuelle : 

## Cas 2
Transcript : "Pense à appeler Yohan demain à 18h."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Appeler Yohan`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":"18:00","heardExpression":"demain à 18h","confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 5070ms · Tokens in/out : 5219/416 · Coût estimé : $0.002137
- Observation manuelle : 

## Cas 3
Transcript : "Rappelle-moi vendredi d'acheter du café."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Acheter du café`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.6}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-18","time":null,"heardExpression":"vendredi","confidence":0.95}`
    - reminder.recurrence : `null`
- Latence : 4499ms · Tokens in/out : 5218/343 · Coût estimé : $0.001991
- Observation manuelle : 

## Cas 4a (run 1/3 — ex-SPLIT observé sur v13)
Transcript : "Rappelle-moi demain de demander à Yohan s'il est disponible vendredi."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Demander à Yohan s'il est disponible vendredi`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":null,"heardExpression":"demain","confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 5958ms · Tokens in/out : 5223/415 · Coût estimé : $0.002136
- Observation manuelle : 

## Cas 4b (run 2/3)
Transcript : "Rappelle-moi demain de demander à Yohan s'il est disponible vendredi."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Demander à Yohan s'il est disponible vendredi`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":null,"heardExpression":"demain","confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 4319ms · Tokens in/out : 5223/351 · Coût estimé : $0.002008
- Observation manuelle : 

## Cas 4c (run 3/3)
Transcript : "Rappelle-moi demain de demander à Yohan s'il est disponible vendredi."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Demander à Yohan s'il est disponible vendredi`
    - event : `{"hasDate":true,"date":"2026-09-18","heardExpression":"vendredi","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":null,"heardExpression":"demain","confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 6626ms · Tokens in/out : 5223/615 · Coût estimé : $0.002536
- Observation manuelle : 

## Cas 5
Transcript : "Sofia a un entretien vendredi."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Sofia a un entretien vendredi.`
    - event : `{"hasDate":true,"date":"2026-09-18","heardExpression":"vendredi","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.8}`
    - reminder.recurrence : `null`
- Latence : 4502ms · Tokens in/out : 5214/347 · Coût estimé : $0.001998
- Observation manuelle : 

## Cas 6
Transcript : "Micka aimerait un casque audio."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Micka aimerait un casque audio.`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 3202ms · Tokens in/out : 5215/212 · Coût estimé : $0.001728
- Observation manuelle : 

## Cas 7
Transcript : "Yohan préfère son café sans sucre."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Yohan préfère son café sans sucre.`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 3779ms · Tokens in/out : 5215/340 · Coût estimé : $0.001984
- Observation manuelle : 

## Cas 8a (run 1/3 — ex-SPLIT observé sur v13, 2 hypothèses sur "samedi")
Transcript : "Rappelle-moi d'acheter un cadeau pour l'anniversaire de Léa samedi."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Acheter un cadeau pour l'anniversaire de Léa samedi`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.6}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":null,"time":null,"heardExpression":"acheter un cadeau pour l'anniversaire de Léa samedi","confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 9387ms · Tokens in/out : 5225/869 · Coût estimé : $0.003044
- Observation manuelle : 

## Cas 8b (run 2/3)
Transcript : "Rappelle-moi d'acheter un cadeau pour l'anniversaire de Léa samedi."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Acheter un cadeau pour l'anniversaire de Léa samedi`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.8}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":null,"heardExpression":"samedi","confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 12804ms · Tokens in/out : 5225/1250 · Coût estimé : $0.003806
- Observation manuelle : 

## Cas 8c (run 3/3)
Transcript : "Rappelle-moi d'acheter un cadeau pour l'anniversaire de Léa samedi."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Acheter un cadeau pour l'anniversaire de Léa samedi.`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.4}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":null,"time":null,"heardExpression":"samedi","confidence":0.8}`
    - reminder.recurrence : `null`
- Latence : 8476ms · Tokens in/out : 5225/796 · Coût estimé : $0.002898
- Observation manuelle : 

## Cas 9 (contrôle)
Transcript : "Rappelle-moi tous les jours pendant 5 jours à partir de demain à 21h40 de faire mes étirements."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Faire mes étirements`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":"21:40","heardExpression":"tous les jours pendant 5 jours à partir de demain à 21h40","confidence":0.95}`
    - reminder.recurrence : `{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours pendant 5 jours"}`
- Latence : 5821ms · Tokens in/out : 5234/543 · Coût estimé : $0.002394
- Observation manuelle : 

## Cas 10 (contrôle)
Transcript : "Rappelle-moi chaque lundi à 18h d'appeler Léa."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Appeler Léa`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-21","time":"18:00","heardExpression":"chaque lundi à 18h","confidence":0.95}`
    - reminder.recurrence : `{"detected":true,"frequency":"weekly","daysOfWeek":[1],"occurrenceCount":null,"untilDate":null,"heardExpression":"chaque lundi"}`
- Latence : 5418ms · Tokens in/out : 5223/471 · Coût estimé : $0.002248
- Observation manuelle : 

## Cas 11 (nouveau — vrai multi-pensées à préserver)
Transcript : "Micka aimerait un casque audio et rappelle-moi demain à 18h d'appeler Yohan."

- validateLlmOutput : ok=true, 2 pensée(s)
  - Pensée [0]
    - texte : `Micka aimerait un casque audio`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9}`
    - reminder.recurrence : `null`
  - Pensée [1]
    - texte : `Appeler Yohan`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.95}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":"18:00","heardExpression":"demain à 18h","confidence":0.95}`
    - reminder.recurrence : `null`
- Latence : 5558ms · Tokens in/out : 5228/538 · Coût estimé : $0.002383
- Observation manuelle : 

## Cas 12 (nouveau — 2 rappels indépendants)
Transcript : "Rappelle-moi demain à 18h d'appeler Yohan et pense à acheter du café samedi à 10h."

- validateLlmOutput : ok=true, 2 pensée(s)
  - Pensée [0]
    - texte : `Appeler Yohan`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":"18:00","heardExpression":"demain à 18h","confidence":0.9}`
    - reminder.recurrence : `null`
  - Pensée [1]
    - texte : `Acheter du café`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":"10:00","heardExpression":"samedi à 10h","confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 5859ms · Tokens in/out : 5233/548 · Coût estimé : $0.002404
- Observation manuelle : 

## Cas 13 (nouveau — événement historique, ne pas raccourcir)
Transcript : "Sofia a un entretien vendredi."

- validateLlmOutput : ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Sofia a un entretien vendredi.`
    - event : `{"hasDate":true,"date":"2026-09-18","heardExpression":"vendredi","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9}`
    - reminder.recurrence : `null`
- Latence : 4806ms · Tokens in/out : 5214/347 · Coût estimé : $0.001998
- Observation manuelle : 

## Synthèse

- Coût total estimé : $0.040183
- Rappel : ce benchmark mesure le comportement de `texte` APRÈS l'incrément prompt "texte concis + anti-SPLIT" (règle 1 SPLIT corrigée + nouvelle règle 2 TEXTE CONCIS) — non déployé au moment de ce run. `texte` est donc attendu concis (sans la formulation de déclenchement du rappel ni sa date/heure/récurrence quand leur rattachement est certain) sur les cas de rappel ci-dessus, et inchangé sur les cas sans rappel.