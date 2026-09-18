# Benchmark — TEXTE CONCIS étendu aux événements (CHANTIER CAPTURE EVENT TIME, incrément 2, non déployé)

Modèle : `gpt-5-mini`. Contexte fixe : vendredi 2026-09-18 10:00, "vendredi" = aujourd'hui, "samedi" = 2026-09-19, "lundi" = 2026-09-21.

## Cas 1
Transcript : "Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Concert de Claire Obscure Expédition 33 à Clermont-Ferrand`
    - event : `{"hasDate":true,"date":"2027-02-10","time":"20:30","heardExpression":"le 10 février 2027 à 20h30","confidence":0.95}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 4340ms · Tokens in/out : 6982/373 · Coût estimé : $0.002492
- Jugement manuel : 

## Cas 2
Transcript : "J'ai un concert vendredi à 20h. Rappelle-moi la veille."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Concert`
    - event : `{"hasDate":true,"date":"2026-09-18","time":"20:00","heardExpression":"vendredi à 20h","confidence":0.95}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-17","time":null,"heardExpression":"la veille","confidence":0.9}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 6249ms · Tokens in/out : 6971/617 · Coût estimé : $0.002977
- Jugement manuel : 

## Cas 3a (run 1/3)
Transcript : "J'ai un concert vendredi à 20h. Rappelle-moi la veille à 18h."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Concert`
    - event : `{"hasDate":true,"date":"2026-09-18","time":"20:00","heardExpression":"vendredi à 20h","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-17","time":"18:00","heardExpression":"la veille à 18h","confidence":0.9}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 6027ms · Tokens in/out : 6975/624 · Coût estimé : $0.002992
- Jugement manuel : 

## Cas 3b (run 2/3)
Transcript : "J'ai un concert vendredi à 20h. Rappelle-moi la veille à 18h."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Concert`
    - event : `{"hasDate":true,"date":"2026-09-18","time":"20:00","heardExpression":"vendredi à 20h","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-17","time":"18:00","heardExpression":"la veille à 18h","confidence":0.9}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 7021ms · Tokens in/out : 6975/624 · Coût estimé : $0.002992
- Jugement manuel : 

## Cas 3c (run 3/3)
Transcript : "J'ai un concert vendredi à 20h. Rappelle-moi la veille à 18h."

- 2 pensée(s)
  - Pensée [0]
    - texte : `Concert`
    - event : `{"hasDate":true,"date":"2026-09-18","time":"20:00","heardExpression":"vendredi à 20h","confidence":0.95}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
  - Pensée [1]
    - texte : `Concert`
    - event : `{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-17","time":"18:00","heardExpression":"la veille à 18h","confidence":0.95}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 11769ms · Tokens in/out : 6975/1192 · Coût estimé : $0.004128
- Jugement manuel : 

## Cas 4a (run 1/3)
Transcript : "Dîner avec Yohan vendredi à 19h pour parler de son entretien lundi."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Dîner avec Yohan pour parler de son entretien lundi.`
    - event : `{"hasDate":true,"date":"2026-09-18","time":"19:00","heardExpression":"vendredi à 19h","confidence":0.95}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 6651ms · Tokens in/out : 6971/621 · Coût estimé : $0.002985
- Jugement manuel : 

## Cas 4b (run 2/3)
Transcript : "Dîner avec Yohan vendredi à 19h pour parler de son entretien lundi."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Dîner avec Yohan pour parler de son entretien lundi.`
    - event : `{"hasDate":true,"date":"2026-09-18","time":"19:00","heardExpression":"vendredi à 19h","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 7527ms · Tokens in/out : 6971/685 · Coût estimé : $0.003113
- Jugement manuel : 

## Cas 4c (run 3/3)
Transcript : "Dîner avec Yohan vendredi à 19h pour parler de son entretien lundi."

- 2 pensée(s)
  - Pensée [0]
    - texte : `Dîner avec Yohan`
    - event : `{"hasDate":true,"date":"2026-09-18","time":"19:00","heardExpression":"vendredi à 19h","confidence":0.95}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
  - Pensée [1]
    - texte : `Entretien`
    - event : `{"hasDate":true,"date":"2026-09-21","time":null,"heardExpression":"lundi","confidence":0.85}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 9613ms · Tokens in/out : 6971/938 · Coût estimé : $0.003619
- Jugement manuel : 

## Cas 5
Transcript : "Dîner avec Yohan vendredi à 19h pour parler de son entretien lundi à 9h."

- 2 pensée(s)
  - Pensée [0]
    - texte : `Dîner avec Yohan pour parler de son entretien`
    - event : `{"hasDate":true,"date":"2026-09-18","time":"19:00","heardExpression":"vendredi à 19h","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
  - Pensée [1]
    - texte : `Entretien (son)`
    - event : `{"hasDate":true,"date":"2026-09-21","time":"09:00","heardExpression":"lundi à 9h","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 11526ms · Tokens in/out : 6975/1208 · Coût estimé : $0.004160
- Jugement manuel : 

## Cas 6
Transcript : "Train samedi à 7h12, rappelle-moi vendredi à 20h de préparer ma valise."

- 2 pensée(s)
  - Pensée [0]
    - texte : `Train`
    - event : `{"hasDate":true,"date":"2026-09-19","time":"07:12","heardExpression":"samedi à 7h12","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
  - Pensée [1]
    - texte : `Préparer ma valise`
    - event : `{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-18","time":"20:00","heardExpression":"vendredi à 20h","confidence":0.9}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 7573ms · Tokens in/out : 6975/685 · Coût estimé : $0.003114
- Jugement manuel : 

## Cas 7
Transcript : "Sofia a un entretien vendredi."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Sofia a un entretien`
    - event : `{"hasDate":true,"date":"2026-09-18","time":null,"heardExpression":"vendredi","confidence":0.95}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 5221ms · Tokens in/out : 6961/480 · Coût estimé : $0.002700
- Jugement manuel : 

## Cas 8a (run 1/3)
Transcript : "Acheter un cadeau pour l'anniversaire de Léa samedi."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Acheter un cadeau pour l'anniversaire de Léa`
    - event : `{"hasDate":true,"date":"2026-09-19","time":null,"heardExpression":"samedi","confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 8291ms · Tokens in/out : 6967/807 · Coût estimé : $0.003356
- Jugement manuel : 

## Cas 8b (run 2/3)
Transcript : "Acheter un cadeau pour l'anniversaire de Léa samedi."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Acheter un cadeau pour l'anniversaire de Léa samedi.`
    - event : `{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.6}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 4673ms · Tokens in/out : 6967/416 · Coût estimé : $0.002574
- Jugement manuel : 

## Cas 8c (run 3/3)
Transcript : "Acheter un cadeau pour l'anniversaire de Léa samedi."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Acheter un cadeau pour l'anniversaire de Léa samedi.`
    - event : `{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.6}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.6}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 6290ms · Tokens in/out : 6967/608 · Coût estimé : $0.002958
- Jugement manuel : 

## Cas 9
Transcript : "Micka aimerait un casque audio."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Micka aimerait un casque audio.`
    - event : `{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.8}`
    - reminder (sans recurrence) : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.8}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 3507ms · Tokens in/out : 6962/282 · Coût estimé : $0.002305
- Jugement manuel : 

## Cas 10
Transcript : "Rappelle-moi demain de demander à Yohan s'il est disponible vendredi."

- 1 pensée(s)
  - Pensée [0]
    - texte : `Demander à Yohan s'il est disponible vendredi`
    - event : `{"hasDate":false,"date":null,"time":null,"heardExpression":null,"confidence":0.9}`
    - reminder (sans recurrence) : `{"hasReminder":true,"date":"2026-09-19","time":null,"heardExpression":"demain","confidence":0.95}`
- Vérification perte d'information : ✅ aucune perte détectée par l'heuristique (à confirmer manuellement ci-dessous)
- Latence : 4609ms · Tokens in/out : 6970/421 · Coût estimé : $0.002584
- Jugement manuel : 

## Synthèse

- Coût total estimé : $0.049046
- Cas 4/5 particulièrement importants : vérifier que "lundi" (entretien de Yohan) reste représenté (soit dans une 2e pensée avec son propre event.date, soit conservé dans le texte de la même pensée si non extrait séparément) — jamais silencieusement perdu.
- Cas 8 (x3) : vérifier la stabilité de la conservation de "samedi" dans texte face à l'ambiguïté rappel/événement.