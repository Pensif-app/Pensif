# Benchmark — event.time bout en bout (CHANTIER CAPTURE EVENT TIME, incrément 1, non déployé)

Modèle : `gpt-5-mini`. Contexte fixe : vendredi 2026-09-18 10:00, "vendredi" = aujourd'hui, "samedi" = 2026-09-19.

## Cas 1
Transcript : "Concert à Lyon le 7 mars 2027 à 20h."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Concert à Lyon le 7 mars 2027 à 20h.`
    - event : `{"hasDate":true,"date":"2027-03-07","time":"20:00","heardExpression":"le 7 mars 2027 à 20h","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
- Latence : 5924ms · Tokens in/out : 5998/435 · Coût estimé : $0.002370

## Cas 2
Transcript : "Sofia a un entretien vendredi."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Sofia a un entretien vendredi.`
    - event : `{"hasDate":true,"date":"2026-09-18","time":null,"heardExpression":"vendredi","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
- Latence : 4993ms · Tokens in/out : 5990/353 · Coût estimé : $0.002203

## Cas 3
Transcript : "J'ai un concert vendredi à 20h. Rappelle-moi la veille."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Concert vendredi à 20h`
    - event : `{"hasDate":true,"date":"2026-09-18","time":"20:00","heardExpression":"vendredi à 20h","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-17","time":null,"heardExpression":"la veille","confidence":0.9}`
- Latence : 8542ms · Tokens in/out : 6000/686 · Coût estimé : $0.002872

## Cas 4
Transcript : "J'ai un concert vendredi à 20h. Rappelle-moi la veille à 18h."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Concert`
    - event : `{"hasDate":true,"date":"2026-09-18","time":"20:00","heardExpression":"vendredi à 20h","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-17","time":"18:00","heardExpression":"la veille à 18h","confidence":0.9}`
- Latence : 7335ms · Tokens in/out : 6004/560 · Coût estimé : $0.002621

## Cas 5
Transcript : "Rappelle-moi vendredi à 18h d'appeler Yohan."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Appeler Yohan`
    - event : `{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.5}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-18","time":"18:00","heardExpression":"vendredi à 18h","confidence":0.95}`
- Latence : 5958ms · Tokens in/out : 5998/422 · Coût estimé : $0.002344

## Cas 6
Transcript : "Dîner avec Yohan vendredi à 19h pour parler de son entretien lundi."

- 2 pensée(s)
  - Pensée [0]
    - texte : `Dîner avec Yohan vendredi à 19h pour parler de son entretien lundi.`
    - event : `{"hasDate":true,"date":"2026-09-18","time":"19:00","heardExpression":"vendredi à 19h","confidence":0.95}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
  - Pensée [1]
    - texte : `Entretien de Yohan lundi`
    - event : `{"hasDate":true,"date":"2026-09-21","time":null,"heardExpression":"lundi","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
- Latence : 12860ms · Tokens in/out : 6000/1081 · Coût estimé : $0.003662

## Cas 7 (cas critique — 2 heures distinctes)
Transcript : "Train samedi à 7h12, rappelle-moi vendredi à 20h de préparer ma valise."

- 2 pensée(s)
  - Pensée [0]
    - texte : `Train samedi à 7h12`
    - event : `{"hasDate":true,"date":"2026-09-19","time":"07:12","heardExpression":"samedi à 7h12","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
  - Pensée [1]
    - texte : `Préparer ma valise`
    - event : `{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-18","time":"20:00","heardExpression":"vendredi à 20h","confidence":0.9}`
- Latence : 10747ms · Tokens in/out : 6004/883 · Coût estimé : $0.003267

## Synthèse

- Coût total estimé : $0.019338
- Cas 7 particulièrement important : event.time attendu = "07:12" (train), reminder.time attendu = "20:00" (rappel) — deux heures distinctes dans la même dictée, jamais interverties ni confondues.