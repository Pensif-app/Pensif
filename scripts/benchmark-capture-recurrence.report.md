# Benchmark dédié — extraction des récurrences (Capture, reminder.recurrence)

Modèle : `gpt-5-mini` (production actuelle de Capture). Contexte fixe : vendredi 2026-09-18 10:00, "demain" = 2026-09-19.

## 1. Tous les jours, sans borne
Transcript : "Rappelle-moi tous les jours à 21h40 de sortir la poubelle."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}, reminder.date=null (jugement manuel sur la date)
- Pensées extraites (brut) : `[{"texte":"Sortir la poubelle","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":null,"time":"21:40","heardExpression":"tous les jours à 21h40","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}},"confidence":0.92}]`
- Diagnostic : HTTP=200 · finish_reason=stop · content_present=true · content_length=701 · json_parse=OK · validateLlmOutput=OK
- Champs reminder : hasReminder=true · recurrence.detected=true · frequency=daily · occurrenceCount=n/a · date=n/a · time=21:40
- Latence : 5834ms · Tokens in/out/reasoning : 6973/467/256 · Coût estimé : $0.002677
- Jugement manuel : 

## 2. Tous les jours pendant 5 jours
Transcript : "Rappelle-moi tous les jours à 21h40 pendant 5 jours de faire mes étirements."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours"}
- Pensées extraites (brut) : `[{"texte":"Faire mes étirements","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0},"reminder":{"hasReminder":true,"date":null,"time":"21:40","heardExpression":"tous les jours à 21h40 pendant 5 jours","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours"}},"confidence":0.95}]`
- Diagnostic : HTTP=200 · finish_reason=stop · content_present=true · content_length=716 · json_parse=OK · validateLlmOutput=OK
- Champs reminder : hasReminder=true · recurrence.detected=true · frequency=daily · occurrenceCount=5 · date=n/a · time=21:40
- Latence : 6134ms · Tokens in/out/reasoning : 6977/599/384 · Coût estimé : $0.002942
- Jugement manuel : 

## 3. Tous les jours jusqu’au 25 septembre
Transcript : "Rappelle-moi tous les jours à 21h40 jusqu’au 25 septembre de prendre mon médicament."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":"2026-09-25","heardExpression":"tous les jours"}
- Pensées extraites (brut) : `[{"texte":"Prendre mon médicament","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0},"reminder":{"hasReminder":true,"date":null,"time":"21:40","heardExpression":"tous les jours à 21h40 jusqu’au 25 septembre","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":"2026-09-25","heardExpression":"tous les jours"}},"confidence":0.95}]`
- Diagnostic : HTTP=200 · finish_reason=stop · content_present=true · content_length=735 · json_parse=OK · validateLlmOutput=OK
- Champs reminder : hasReminder=true · recurrence.detected=true · frequency=daily · occurrenceCount=n/a · date=n/a · time=21:40
- Latence : 6344ms · Tokens in/out/reasoning : 6976/604/384 · Coût estimé : $0.002952
- Jugement manuel : 

## 4. Du lundi au vendredi
Transcript : "Rappelle-moi du lundi au vendredi à 8h de préparer le café."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"weekly","daysOfWeek":[1,2,3,4,5],"occurrenceCount":null,"untilDate":null,"heardExpression":"du lundi au vendredi"}, time=08:00
- Pensées extraites (brut) : `[{"texte":"Préparer le café","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0},"reminder":{"hasReminder":true,"date":"2026-09-18","time":"08:00","heardExpression":"du lundi au vendredi à 8h","confidence":0.95,"recurrence":{"detected":true,"frequency":"weekly","daysOfWeek":[1,2,3,4,5],"occurrenceCount":null,"untilDate":null,"heardExpression":"du lundi au vendredi"}},"confidence":0.95}]`
- Diagnostic : HTTP=200 · finish_reason=stop · content_present=true · content_length=802 · json_parse=OK · validateLlmOutput=OK
- Champs reminder : hasReminder=true · recurrence.detected=true · frequency=weekly · occurrenceCount=n/a · date=2026-09-18 · time=08:00
- Latence : 7368ms · Tokens in/out/reasoning : 6971/684/448 · Coût estimé : $0.003111
- Jugement manuel : 

## 5. Chaque lundi
Transcript : "Rappelle-moi chaque lundi à 18h d’appeler Léa."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"weekly","daysOfWeek":[1],"occurrenceCount":null,"untilDate":null,"heardExpression":"chaque lundi"}
- Pensées extraites (brut) : `[{"texte":"Appeler Léa","heardContactName":"Léa","event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":"2026-09-21","time":"18:00","heardExpression":"chaque lundi à 18h","confidence":0.95,"recurrence":{"detected":true,"frequency":"weekly","daysOfWeek":[1],"occurrenceCount":null,"untilDate":null,"heardExpression":"chaque lundi"}},"confidence":0.92}]`
- Diagnostic : HTTP=200 · finish_reason=stop · content_present=true · content_length=436 · json_parse=OK · validateLlmOutput=OK
- Champs reminder : hasReminder=true · recurrence.detected=true · frequency=weekly · occurrenceCount=n/a · date=2026-09-21 · time=18:00
- Latence : 4333ms · Tokens in/out/reasoning : 6970/338/192 · Coût estimé : $0.002418
- Jugement manuel : 

## 6. Week-end récurrent EXPLICITE
Transcript : "Rappelle-moi tous les samedis et dimanches à 10h de faire du sport."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"weekly","daysOfWeek":[0,6],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les samedis et dimanches"}
- Pensées extraites (brut) : `[{"texte":"Faire du sport","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0},"reminder":{"hasReminder":true,"date":"2026-09-19","time":"10:00","heardExpression":"tous les samedis et dimanches à 10h de faire du sport","confidence":0.9,"recurrence":{"detected":true,"frequency":"weekly","daysOfWeek":[0,6],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les samedis et dimanches"}},"confidence":0.9}]`
- Diagnostic : HTTP=200 · finish_reason=stop · content_present=true · content_length=790 · json_parse=OK · validateLlmOutput=OK
- Champs reminder : hasReminder=true · recurrence.detected=true · frequency=weekly · occurrenceCount=n/a · date=2026-09-19 · time=10:00
- Latence : 6576ms · Tokens in/out/reasoning : 6974/619/384 · Coût estimé : $0.002981
- Jugement manuel : 

## 7. Pendant 5 jours à partir de demain
Transcript : "Rappelle-moi tous les jours pendant 5 jours à partir de demain à 9h de prendre mes vitamines."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours pendant 5 jours à partir de demain"}, reminder.date=2026-09-19, time=09:00
- Pensées extraites (brut) : `[{"texte":"Prendre mes vitamines","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":"2026-09-19","time":"09:00","heardExpression":"tous les jours pendant 5 jours à partir de demain à 9h","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":5,"untilDate":null,"heardExpression":"tous les jours pendant 5 jours à partir de demain"}},"confidence":0.92}]`
- Diagnostic : HTTP=200 · finish_reason=stop · content_present=true · content_length=776 · json_parse=OK · validateLlmOutput=OK
- Champs reminder : hasReminder=true · recurrence.detected=true · frequency=daily · occurrenceCount=5 · date=2026-09-19 · time=09:00
- Latence : 7173ms · Tokens in/out/reasoning : 6978/615/384 · Coût estimé : $0.002974
- Jugement manuel : 

## 8. "Tous les jours de la semaine" — AMBIGU, ne doit JAMAIS être tranché
Transcript : "Rappelle-moi tous les jours de la semaine à 21h40 de faire mes exercices."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"unclear","daysOfWeek":null,"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours de la semaine"} — doit être frequency="unclear", daysOfWeek=null (jamais 7j/7 ni lundi-vendredi choisi)
- Pensées extraites (brut) : `[{"texte":"Faire mes exercices","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":null,"time":"21:40","heardExpression":"tous les jours de la semaine à 21h40","confidence":0.95,"recurrence":{"detected":true,"frequency":"unclear","daysOfWeek":null,"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours de la semaine"}},"confidence":0.93}]`
- Diagnostic : HTTP=200 · finish_reason=stop · content_present=true · content_length=734 · json_parse=OK · validateLlmOutput=OK
- Champs reminder : hasReminder=true · recurrence.detected=true · frequency=unclear · occurrenceCount=n/a · date=n/a · time=21:40
- Latence : 5977ms · Tokens in/out/reasoning : 6974/536/320 · Coût estimé : $0.002816
- Jugement manuel : 

## 9. Récurrence SANS heure — jamais d’heure inventée
Transcript : "Rappelle-moi tous les jours de faire une pause."

- Résultat : ✅ — recurrence={"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}, time=null (doit rester null, jamais "09:00")
- Pensées extraites (brut) : `[{"texte":"Faire une pause","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0},"reminder":{"hasReminder":true,"date":null,"time":null,"heardExpression":"tous les jours","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":null,"untilDate":null,"heardExpression":"tous les jours"}},"confidence":0.9}]`
- Diagnostic : HTTP=200 · finish_reason=stop · content_present=true · content_length=423 · json_parse=OK · validateLlmOutput=OK
- Champs reminder : hasReminder=true · recurrence.detected=true · frequency=daily · occurrenceCount=n/a · date=n/a · time=n/a
- Latence : 4355ms · Tokens in/out/reasoning : 6966/389/256 · Coût estimé : $0.002520
- Jugement manuel : 

## 10. Rappel PONCTUEL classique — non-régression
Transcript : "Rappelle-moi demain à 18h d’appeler Micka."

- Résultat : ✅ — reminder={"hasReminder":true,"date":"2026-09-19","time":"18:00","heardExpression":"demain à 18h","confidence":0.95,"recurrence":null}
- Pensées extraites (brut) : `[{"texte":"Appeler Micka","heardContactName":"Micka","event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0},"reminder":{"hasReminder":true,"date":"2026-09-19","time":"18:00","heardExpression":"demain à 18h","confidence":0.95,"recurrence":null},"confidence":0.95}]`
- Diagnostic : HTTP=200 · finish_reason=stop · content_present=true · content_length=492 · json_parse=OK · validateLlmOutput=OK
- Champs reminder : hasReminder=true · recurrence.detected=n/a · frequency=n/a · occurrenceCount=n/a · date=2026-09-19 · time=18:00
- Latence : 4125ms · Tokens in/out/reasoning : 6969/358/192 · Coût estimé : $0.002458
- Jugement manuel : 

## 11. Phrase SANS rappel — non-régression
Transcript : "Micka aime le café."

- Résultat : ✅ — reminder={"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9,"recurrence":null}, event={"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9}
- Pensées extraites (brut) : `[{"texte":"Micka aime le café.","heardContactName":"Micka","event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9,"recurrence":null},"confidence":0.9}]`
- Diagnostic : HTTP=200 · finish_reason=stop · content_present=true · content_length=476 · json_parse=OK · validateLlmOutput=OK
- Champs reminder : hasReminder=false · recurrence.detected=n/a · frequency=n/a · occurrenceCount=n/a · date=n/a · time=n/a
- Latence : 3145ms · Tokens in/out/reasoning : 6960/280/128 · Coût estimé : $0.002300
- Jugement manuel : 

## 12. [DIAGNOSTIC] "pendant N jours" APRÈS l’action (phrase iPhone fautive)
Transcript : "Rappelle-moi tous les jours à 20h39 de tester Pensif pendant 3 jours."

- Résultat : ✅ — reminder={"hasReminder":true,"date":null,"time":"20:39","heardExpression":"tous les jours à 20h39 pendant 3 jours","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":3,"untilDate":null,"heardExpression":"tous les jours pendant 3 jours"}}
- Pensées extraites (brut) : `[{"texte":"Tester Pensif","heardContactName":null,"event":{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9},"reminder":{"hasReminder":true,"date":null,"time":"20:39","heardExpression":"tous les jours à 20h39 pendant 3 jours","confidence":0.95,"recurrence":{"detected":true,"frequency":"daily","daysOfWeek":[],"occurrenceCount":3,"untilDate":null,"heardExpression":"tous les jours pendant 3 jours"}},"confidence":0.9}]`
- Diagnostic : HTTP=200 · finish_reason=stop · content_present=true · content_length=724 · json_parse=OK · validateLlmOutput=OK
- Champs reminder : hasReminder=true · recurrence.detected=true · frequency=daily · occurrenceCount=3 · date=n/a · time=20:39
- Latence : 8478ms · Tokens in/out/reasoning : 6975/729/512 · Coût estimé : $0.003202
- Jugement manuel : 

## Synthèse

- Score : 12/12
- Attention particulière : cas 8 (ambiguïté "tous les jours de la semaine" jamais tranchée) et cas 9 (aucune heure inventée pour une récurrence).