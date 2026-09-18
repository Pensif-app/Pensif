# Benchmark observationnel — isolation "tous les jours de la semaine" / "à partir de + heure" (Capture v13)

Modèle : `gpt-5-mini` (production actuelle de Capture). Contexte fixe : vendredi 2026-09-18 10:00.

Aucun prompt modifié. Rapport brut, pas de jugement PASS/FAIL.

## Cas 1 — "du lundi au vendredi, à 8h" (retire "à partir de", garde l'ancrage lexical)
Transcript : "Rappelle-moi de prendre mes cachets tous les jours de la semaine, du lundi au vendredi, à 8h."

- reminder.hasReminder : `true`
- reminder.date : `2026-09-18`
- reminder.time : `08:00`
- reminder.recurrence : `{"detected":true,"frequency":"weekly","daysOfWeek":[1,2,3,4,5],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours de la semaine, du lundi au vendredi"}`
- reminder.recurrence.heardExpression : `tous les jours de la semaine, du lundi au vendredi`
- reminder.confidence : `0.95`
- texte : `Rappelle-moi de prendre mes cachets tous les jours de la semaine, du lundi au vendredi, à 8h.`
- Latence : 8624ms · Tokens in/out : 3989/661 · Coût estimé : $0.002319

## Cas 2 — "à partir de 8h" isolé (retire l'ancrage lexical)
Transcript : "Rappelle-moi de prendre mes cachets du lundi au vendredi, à partir de 8h."

- reminder.hasReminder : `true`
- reminder.date : `2026-09-18`
- reminder.time : `08:00`
- reminder.recurrence : `{"detected":true,"frequency":"weekly","daysOfWeek":[1,2,3,4,5],"occurrenceCount":null,"untilDate":null,"heardExpression":"du lundi au vendredi"}`
- reminder.recurrence.heardExpression : `du lundi au vendredi`
- reminder.confidence : `0.9`
- texte : `Rappelle-moi de prendre mes cachets du lundi au vendredi, à partir de 8h.`
- Latence : 9188ms · Tokens in/out : 3984/770 · Coût estimé : $0.002536

## Cas 3 — ancrage lexical SEUL, sans désambiguïsation (référence attendue: unclear)
Transcript : "Rappelle-moi de prendre mes cachets tous les jours de la semaine, à partir de 8h."

- reminder.hasReminder : `true`
- reminder.date : `null`
- reminder.time : `08:00`
- reminder.recurrence : `{"detected":true,"frequency":"unclear","daysOfWeek":null,"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours de la semaine"}`
- reminder.recurrence.heardExpression : `tous les jours de la semaine`
- reminder.confidence : `0.95`
- texte : `Rappelle-moi de prendre mes cachets tous les jours de la semaine, à partir de 8h.`
- Latence : 6980ms · Tokens in/out : 3986/623 · Coût estimé : $0.002242

## Cas 4a — phrase complète originale (run 1/3)
Transcript : "Rappelle-moi de prendre mes cachets tous les jours de la semaine, du lundi au vendredi, à partir de 8h."

- reminder.hasReminder : `true`
- reminder.date : `2026-09-18`
- reminder.time : `08:00`
- reminder.recurrence : `{"detected":true,"frequency":"weekly","daysOfWeek":[1,2,3,4,5],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours de la semaine, du lundi au vendredi"}`
- reminder.recurrence.heardExpression : `tous les jours de la semaine, du lundi au vendredi`
- reminder.confidence : `0.9`
- texte : `Rappelle-moi de prendre mes cachets tous les jours de la semaine, du lundi au vendredi, à partir de 8h.`
- Latence : 9536ms · Tokens in/out : 3991/848 · Coût estimé : $0.002694

## Cas 4b — phrase complète originale (run 2/3)
Transcript : "Rappelle-moi de prendre mes cachets tous les jours de la semaine, du lundi au vendredi, à partir de 8h."

- reminder.hasReminder : `true`
- reminder.date : `2026-09-18`
- reminder.time : `08:00`
- reminder.recurrence : `{"detected":true,"frequency":"weekly","daysOfWeek":[1,2,3,4,5],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours de la semaine, du lundi au vendredi"}`
- reminder.recurrence.heardExpression : `tous les jours de la semaine, du lundi au vendredi`
- reminder.confidence : `0.95`
- texte : `Rappelle-moi de prendre mes cachets tous les jours de la semaine, du lundi au vendredi, à partir de 8h.`
- Latence : 10247ms · Tokens in/out : 3991/848 · Coût estimé : $0.002694

## Cas 4c — phrase complète originale (run 3/3)
Transcript : "Rappelle-moi de prendre mes cachets tous les jours de la semaine, du lundi au vendredi, à partir de 8h."

- reminder.hasReminder : `true`
- reminder.date : `2026-09-18`
- reminder.time : `08:00`
- reminder.recurrence : `{"detected":true,"frequency":"weekly","daysOfWeek":[1,2,3,4,5],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours de la semaine, du lundi au vendredi"}`
- reminder.recurrence.heardExpression : `tous les jours de la semaine, du lundi au vendredi`
- reminder.confidence : `0.92`
- texte : `Rappelle-moi de prendre mes cachets tous les jours de la semaine, du lundi au vendredi, à partir de 8h.`
- Latence : 10974ms · Tokens in/out : 3991/915 · Coût estimé : $0.002828

## Synthèse

- Coût total estimé : $0.015313
- Comparer cas 1 vs 3 pour juger si "du lundi au vendredi" désambiguïse "tous les jours de la semaine".
- Comparer cas 1 vs 2 pour isoler l'effet de "à partir de" sur l'heure seule (recurrence identique attendue si l'hypothèse ancrage-lexical est correcte, temps potentiellement différent).
- Comparer 4a/4b/4c pour la stabilité du cas combiné réel.