# Benchmark dédié — GPT-5-mini via openaiLlmProvider.extract RÉEL (cible standardisation)

Modèle CIBLE explicite : `gpt-5-mini` (ne dépend d'aucun secret `LLM_MODEL` actuel). reasoning_effort = `low`. Appel direct du provider de production réel (retry wrapper inclus).

## 0a. [OBLIGATOIRE — cas réel] 23h35, "pendant 3 jours" après l’action
Transcript : "Rappelle-moi tous les jours à 23h35 de tester Pensif pendant 3 jours." — contexte : 2026-09-18T10:00:00 (vendredi)

- Résultat : ✅ — texte="Tester Pensif", reminder={"hasReminder":true,"date":null,"time":"23:35","heardExpression":"tous les jours à 23h35 de tester Pensif pendant 3 jours","confidence":0.9,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":3,"untilDate":null,"heardExpression":"tous les jours pendant 3 jours"}}
- Pensées extraites (brut) : `[{"texte":"Tester Pensif","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.3},"reminder":{"hasReminder":true,"date":null,"time":"23:35","heardExpression":"tous les jours à 23h35 de tester Pensif pendant 3 jours","confidence":0.9,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":3,"untilDate":null,"heardExpression":"tous les jours pendant 3 jours"}},"confidence":0.9}]`
- Latence : 11921ms

## 0b. [OBLIGATOIRE — passage de minuit] 00h10, "trois jours" en toutes lettres, contexte de nuit
Transcript : "Rappelle-moi tous les jours à 00h10 de tester Pensif pendant trois jours." — contexte : 2026-09-19T00:05:00 (samedi)

- Résultat : ✅ — texte="Tester Pensif", reminder={"hasReminder":true,"date":null,"time":"00:10","heardExpression":"tous les jours à 00h10 de tester Pensif pendant trois jours","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":3,"untilDate":null,"heardExpression":"tous les jours pendant trois jours"}}
- Pensées extraites (brut) : `[{"texte":"Tester Pensif","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":null,"time":"00:10","heardExpression":"tous les jours à 00h10 de tester Pensif pendant trois jours","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":3,"untilDate":null,"heardExpression":"tous les jours pendant trois jours"}},"confidence":0.95}]`
- Latence : 7556ms

## 1. Tous les jours, sans borne
Transcript : "Rappelle-moi tous les jours à 21h40 de sortir la poubelle." — contexte : 2026-09-18T10:00:00 (vendredi)

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}, reminder.date=null (jugement manuel sur la date)
- Pensées extraites (brut) : `[{"texte":"Sortir la poubelle","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0},"reminder":{"hasReminder":true,"date":null,"time":"21:40","heardExpression":"tous les jours à 21h40","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}},"confidence":0.95}]`
- Latence : 6363ms

## 2. Tous les jours pendant 5 jours
Transcript : "Rappelle-moi tous les jours à 21h40 pendant 5 jours de faire mes étirements." — contexte : 2026-09-18T10:00:00 (vendredi)

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours à 21h40 pendant 5 jours"}
- Pensées extraites (brut) : `[{"texte":"Faire mes étirements","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0},"reminder":{"hasReminder":true,"date":null,"time":"21:40","heardExpression":"tous les jours à 21h40 pendant 5 jours","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours à 21h40 pendant 5 jours"}},"confidence":0.9}]`
- Latence : 7929ms

## 3. Tous les jours jusqu’au 25 septembre
Transcript : "Rappelle-moi tous les jours à 21h40 jusqu’au 25 septembre de prendre mon médicament." — contexte : 2026-09-18T10:00:00 (vendredi)

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":"2026-09-25","heardExpression":"tous les jours jusqu’au 25 septembre"}
- Pensées extraites (brut) : `[{"texte":"Prendre mon médicament","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":null,"time":"21:40","heardExpression":"tous les jours à 21h40 jusqu’au 25 septembre","confidence":0.98,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":"2026-09-25","heardExpression":"tous les jours jusqu’au 25 septembre"}},"confidence":0.97}]`
- Latence : 8213ms

## 4. Du lundi au vendredi
Transcript : "Rappelle-moi du lundi au vendredi à 8h de préparer le café." — contexte : 2026-09-18T10:00:00 (vendredi)

- Résultat : ✅ — recurrence={"detected":true,"frequency":"weekly","daysOfWeek":[1,2,3,4,5],"occurrenceCount":null,"untilDate":null,"heardExpression":"du lundi au vendredi"}, time=08:00
- Pensées extraites (brut) : `[{"texte":"Préparer le café","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0},"reminder":{"hasReminder":true,"date":"2026-09-18","time":"08:00","heardExpression":"du lundi au vendredi à 8h","confidence":0.95,"recurrence":{"detected":true,"frequency":"weekly","daysOfWeek":[1,2,3,4,5],"occurrenceCount":null,"untilDate":null,"heardExpression":"du lundi au vendredi"}},"confidence":0.95}]`
- Latence : 7265ms

## 5. Chaque lundi
Transcript : "Rappelle-moi chaque lundi à 18h d’appeler Léa." — contexte : 2026-09-18T10:00:00 (vendredi)

- Résultat : ✅ — recurrence={"detected":true,"frequency":"weekly","daysOfWeek":[1],"occurrenceCount":null,"untilDate":null,"heardExpression":"chaque lundi"}
- Pensées extraites (brut) : `[{"texte":"Appeler Léa","heardContactName":"Léa","event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":"2026-09-21","time":"18:00","heardExpression":"chaque lundi à 18h","confidence":0.95,"recurrence":{"detected":true,"frequency":"weekly","daysOfWeek":[1],"occurrenceCount":null,"untilDate":null,"heardExpression":"chaque lundi"}},"confidence":0.92}]`
- Latence : 5533ms

## 6. Week-end récurrent EXPLICITE
Transcript : "Rappelle-moi tous les samedis et dimanches à 10h de faire du sport." — contexte : 2026-09-18T10:00:00 (vendredi)

- Résultat : ✅ — recurrence={"detected":true,"frequency":"weekly","daysOfWeek":[0,6],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les samedis et dimanches"}
- Pensées extraites (brut) : `[{"texte":"Faire du sport","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0},"reminder":{"hasReminder":true,"date":"2026-09-19","time":"10:00","heardExpression":"tous les samedis et dimanches à 10h","confidence":0.9,"recurrence":{"detected":true,"frequency":"weekly","daysOfWeek":[0,6],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les samedis et dimanches"}},"confidence":0.9}]`
- Latence : 9067ms

## 7. Pendant 5 jours à partir de demain
Transcript : "Rappelle-moi tous les jours pendant 5 jours à partir de demain à 9h de prendre mes vitamines." — contexte : 2026-09-18T10:00:00 (vendredi)

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours pendant 5 jours"}, reminder.date=2026-09-19, time=09:00
- Pensées extraites (brut) : `[{"texte":"Prendre mes vitamines","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":"2026-09-19","time":"09:00","heardExpression":"tous les jours pendant 5 jours à partir de demain à 9h","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours pendant 5 jours"}},"confidence":0.92}]`
- Latence : 6636ms

## 8. "Tous les jours de la semaine" — AMBIGU, ne doit JAMAIS être tranché
Transcript : "Rappelle-moi tous les jours de la semaine à 21h40 de faire mes exercices." — contexte : 2026-09-18T10:00:00 (vendredi)

- Résultat : ✅ — recurrence={"detected":true,"frequency":"unclear","daysOfWeek":null,"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours de la semaine"} — doit être frequency="unclear", daysOfWeek=null
- Pensées extraites (brut) : `[{"texte":"Faire mes exercices","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0},"reminder":{"hasReminder":true,"date":null,"time":"21:40","heardExpression":"tous les jours de la semaine à 21h40","confidence":0.95,"recurrence":{"detected":true,"frequency":"unclear","daysOfWeek":null,"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours de la semaine"}},"confidence":0.95}]`
- Latence : 7380ms

## 9. Récurrence SANS heure — jamais d’heure inventée
Transcript : "Rappelle-moi tous les jours de faire une pause." — contexte : 2026-09-18T10:00:00 (vendredi)

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}, time=null (doit rester null, jamais "09:00")
- Pensées extraites (brut) : `[{"texte":"Faire une pause","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0},"reminder":{"hasReminder":true,"date":null,"time":null,"heardExpression":"tous les jours","confidence":0.9,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}},"confidence":0.9}]`
- Latence : 6349ms

## 10. Rappel PONCTUEL classique — non-régression
Transcript : "Rappelle-moi demain à 18h d’appeler Micka." — contexte : 2026-09-18T10:00:00 (vendredi)

- Résultat : ✅ — reminder={"hasReminder":true,"date":"2026-09-19","time":"18:00","heardExpression":"demain à 18h","confidence":0.95,"recurrence":null}
- Pensées extraites (brut) : `[{"texte":"Appeler Micka","heardContactName":"Micka","event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":"2026-09-19","time":"18:00","heardExpression":"demain à 18h","confidence":0.95,"recurrence":null},"confidence":0.95}]`
- Latence : 4456ms

## 11. Phrase SANS rappel — non-régression
Transcript : "Micka aime le café." — contexte : 2026-09-18T10:00:00 (vendredi)

- Résultat : ✅ — reminder={"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.98,"recurrence":null}, event={"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.98}
- Pensées extraites (brut) : `[{"texte":"Micka aime le café.","heardContactName":"Micka","event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.98},"reminder":{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.98,"recurrence":null},"confidence":0.95}]`
- Latence : 4055ms

## 12. "pendant N jours" APRÈS l’action (structure iPhone, contexte matin)
Transcript : "Rappelle-moi tous les jours à 20h39 de tester Pensif pendant 3 jours." — contexte : 2026-09-18T10:00:00 (vendredi)

- Résultat : ✅ — reminder={"hasReminder":true,"date":null,"time":"20:39","heardExpression":"Rappelle-moi tous les jours à 20h39 de tester Pensif pendant 3 jours","confidence":0.9,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":3,"untilDate":null,"heardExpression":"tous les jours pendant 3 jours"}}
- Pensées extraites (brut) : `[{"texte":"Tester Pensif","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":null,"time":"20:39","heardExpression":"Rappelle-moi tous les jours à 20h39 de tester Pensif pendant 3 jours","confidence":0.9,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":3,"untilDate":null,"heardExpression":"tous les jours pendant 3 jours"}},"confidence":0.9}]`
- Latence : 6148ms

## Synthèse

- Score : 14/14
- Cas 0a/0b sont les cas RÉELS du diagnostic iPhone (23h35 et 00h10, passage de minuit inclus).