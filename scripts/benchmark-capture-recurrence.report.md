# Benchmark dédié — extraction des récurrences (Capture, reminder.recurrence)

Modèle : `gpt-5-mini` (production actuelle de Capture). Contexte fixe : vendredi 2026-09-18 10:00, "demain" = 2026-09-19.

## 1. Tous les jours, sans borne
Transcript : "Rappelle-moi tous les jours à 21h40 de sortir la poubelle."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}, reminder.date=2026-09-18 (jugement manuel sur la date)
- Pensées extraites (brut) : `[{"texte":"Rappelle-moi tous les jours à 21h40 de sortir la poubelle.","heardContactName":null,"event":{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":"2026-09-18","time":"21:40","heardExpression":"Rappelle-moi tous les jours à 21h40 de sortir la poubelle.","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}},"confidence":0.92}]`
- Latence : 11195ms · Tokens in/out : 3561/488 · Coût estimé : $0.001866
- Jugement manuel : 

## 2. Tous les jours pendant 5 jours
Transcript : "Rappelle-moi tous les jours à 21h40 pendant 5 jours de faire mes étirements."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours"}
- Pensées extraites (brut) : `[{"texte":"Rappelle-moi tous les jours à 21h40 pendant 5 jours de faire mes étirements.","heardContactName":null,"event":{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.6},"reminder":{"hasReminder":true,"date":null,"time":"21:40","heardExpression":"tous les jours à 21h40 pendant 5 jours","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours"}},"confidence":0.9}]`
- Latence : 8405ms · Tokens in/out : 3565/610 · Coût estimé : $0.002111
- Jugement manuel : 

## 3. Tous les jours jusqu’au 25 septembre
Transcript : "Rappelle-moi tous les jours à 21h40 jusqu’au 25 septembre de prendre mon médicament."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":"2026-09-25","heardExpression":"tous les jours"}
- Pensées extraites (brut) : `[{"texte":"Rappelle-moi tous les jours à 21h40 jusqu’au 25 septembre de prendre mon médicament.","heardContactName":null,"event":{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":"2026-09-18","time":"21:40","heardExpression":"tous les jours à 21h40 jusqu’au 25 septembre de prendre mon médicament.","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":"2026-09-25","heardExpression":"tous les jours"}},"confidence":0.93}]`
- Latence : 7740ms · Tokens in/out : 3564/625 · Coût estimé : $0.002141
- Jugement manuel : 

## 4. Du lundi au vendredi
Transcript : "Rappelle-moi du lundi au vendredi à 8h de préparer le café."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"weekly","daysOfWeek":[1,2,3,4,5],"occurrenceCount":null,"untilDate":null,"heardExpression":"du lundi au vendredi"}, time=08:00
- Pensées extraites (brut) : `[{"texte":"Rappelle-moi du lundi au vendredi à 8h de préparer le café.","heardContactName":null,"event":{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":"2026-09-18","time":"08:00","heardExpression":"du lundi au vendredi à 8h de préparer le café","confidence":0.9,"recurrence":{"detected":true,"frequency":"weekly","daysOfWeek":[1,2,3,4,5],"occurrenceCount":null,"untilDate":null,"heardExpression":"du lundi au vendredi"}},"confidence":0.9}]`
- Latence : 7382ms · Tokens in/out : 3559/566 · Coût estimé : $0.002022
- Jugement manuel : 

## 5. Chaque lundi
Transcript : "Rappelle-moi chaque lundi à 18h d’appeler Léa."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"weekly","daysOfWeek":[1],"occurrenceCount":null,"untilDate":null,"heardExpression":"chaque lundi"}
- Pensées extraites (brut) : `[{"texte":"Rappelle-moi chaque lundi à 18h d’appeler Léa.","heardContactName":"Léa","event":{"hasDate":false,"date":null,"heardExpression":null,"confidence":0},"reminder":{"hasReminder":true,"date":"2026-09-21","time":"18:00","heardExpression":"chaque lundi à 18h d’appeler Léa","confidence":0.95,"recurrence":{"detected":true,"frequency":"weekly","daysOfWeek":[1],"occurrenceCount":null,"untilDate":null,"heardExpression":"chaque lundi"}},"confidence":0.95}]`
- Latence : 5763ms · Tokens in/out : 3558/423 · Coût estimé : $0.001736
- Jugement manuel : 

## 6. Week-end récurrent EXPLICITE
Transcript : "Rappelle-moi tous les samedis et dimanches à 10h de faire du sport."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"weekly","daysOfWeek":[6,0],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les samedis et dimanches"}
- Pensées extraites (brut) : `[{"texte":"Rappelle-moi tous les samedis et dimanches à 10h de faire du sport.","heardContactName":null,"event":{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.2},"reminder":{"hasReminder":true,"date":"2026-09-19","time":"10:00","heardExpression":"tous les samedis et dimanches à 10h","confidence":0.95,"recurrence":{"detected":true,"frequency":"weekly","daysOfWeek":[6,0],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les samedis et dimanches"}},"confidence":0.95}]`
- Latence : 6200ms · Tokens in/out : 3562/433 · Coût estimé : $0.001757
- Jugement manuel : 

## 7. Pendant 5 jours à partir de demain
Transcript : "Rappelle-moi tous les jours pendant 5 jours à partir de demain à 9h de prendre mes vitamines."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours pendant 5 jours à partir de demain"}, reminder.date=2026-09-19, time=09:00
- Pensées extraites (brut) : `[{"texte":"Rappelle-moi tous les jours pendant 5 jours à partir de demain à 9h de prendre mes vitamines.","heardContactName":null,"event":{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.8},"reminder":{"hasReminder":true,"date":"2026-09-19","time":"09:00","heardExpression":"Rappelle-moi tous les jours pendant 5 jours à partir de demain à 9h de prendre mes vitamines.","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours pendant 5 jours à partir de demain"}},"confidence":0.9}]`
- Latence : 8286ms · Tokens in/out : 3566/699 · Coût estimé : $0.002289
- Jugement manuel : 

## 8. "Tous les jours de la semaine" — AMBIGU, ne doit JAMAIS être tranché
Transcript : "Rappelle-moi tous les jours de la semaine à 21h40 de faire mes exercices."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"unclear","daysOfWeek":null,"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours de la semaine"} — doit être frequency="unclear", daysOfWeek=null (jamais 7j/7 ni lundi-vendredi choisi)
- Pensées extraites (brut) : `[{"texte":"Rappelle-moi tous les jours de la semaine à 21h40 de faire mes exercices.","heardContactName":null,"event":{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":null,"time":"21:40","heardExpression":"Rappelle-moi tous les jours de la semaine à 21h40 de faire mes exercices.","confidence":0.95,"recurrence":{"detected":true,"frequency":"unclear","daysOfWeek":null,"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours de la semaine"}},"confidence":0.92}]`
- Latence : 6007ms · Tokens in/out : 3562/553 · Coût estimé : $0.001997
- Jugement manuel : 

## 9. Récurrence SANS heure — jamais d’heure inventée
Transcript : "Rappelle-moi tous les jours de faire une pause."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}, time=null (doit rester null, jamais "09:00")
- Pensées extraites (brut) : `[{"texte":"Rappelle-moi tous les jours de faire une pause.","heardContactName":null,"event":{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":null,"time":null,"heardExpression":"tous les jours de faire une pause","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}},"confidence":0.94}]`
- Latence : 5142ms · Tokens in/out : 3554/398 · Coût estimé : $0.001685
- Jugement manuel : 

## 10. Rappel PONCTUEL classique — non-régression
Transcript : "Rappelle-moi demain à 18h d’appeler Micka."

- Résultat : ✅ — reminder={"hasReminder":true,"date":"2026-09-19","time":"18:00","heardExpression":"demain à 18h","confidence":0.95,"recurrence":null}
- Pensées extraites (brut) : `[{"texte":"Rappelle-moi demain à 18h d’appeler Micka.","heardContactName":"Micka","event":{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.3},"reminder":{"hasReminder":true,"date":"2026-09-19","time":"18:00","heardExpression":"demain à 18h","confidence":0.95,"recurrence":null},"confidence":0.95}]`
- Latence : 5998ms · Tokens in/out : 3557/298 · Coût estimé : $0.001485
- Jugement manuel : 

## 11. Phrase SANS rappel — non-régression
Transcript : "Micka aime le café."

- Résultat : ✅ — reminder={"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9,"recurrence":null}, event={"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9}
- Pensées extraites (brut) : `[{"texte":"Micka aime le café.","heardContactName":"Micka","event":{"hasDate":false,"date":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9,"recurrence":null},"confidence":0.9}]`
- Latence : 3866ms · Tokens in/out : 3548/210 · Coût estimé : $0.001307
- Jugement manuel : 

## Synthèse

- Score : 11/11
- Attention particulière : cas 8 (ambiguïté "tous les jours de la semaine" jamais tranchée) et cas 9 (aucune heure inventée pour une récurrence).