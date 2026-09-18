# Benchmark forensique — origine de l'heure de rappel "15:00" (événement + "la veille", Capture v14)

Modèle : `gpt-5-mini` (production actuelle de Capture, AUCUN prompt/contrat modifié). Contexte fixé : `2026-09-18T15:00:00` (vendredi, Europe/Paris) — 15h00 choisi délibérément pour tester l'hypothèse "recopie de l'heure du contexte".

Aucune correction appliquée aux résultats. Rapport brut (LLM avant validation + après validateLlmOutput).

## Cas 1a (run 1/3)
Transcript : "J'ai un concert le 10 février 2027 à 20h30. Rappelle-moi la veille."

**Sortie BRUTE (avant validateLlmOutput) :**
```json
{
  "pensees": [
    {
      "texte": "J'ai un concert le 10 février 2027 à 20h30.",
      "heardContactName": null,
      "event": {
        "hasDate": true,
        "date": "2027-02-10",
        "heardExpression": "le 10 février 2027 à 20h30",
        "confidence": 0.95
      },
      "reminder": {
        "hasReminder": false,
        "date": null,
        "time": null,
        "heardExpression": null,
        "confidence": 0,
        "recurrence": null
      },
      "confidence": 0.95
    },
    {
      "texte": "Concert le 10 février 2027 à 20h30",
      "heardContactName": null,
      "event": {
        "hasDate": false,
        "date": null,
        "heardExpression": null,
        "confidence": 0
      },
      "reminder": {
        "hasReminder": true,
        "date": "2027-02-09",
        "time": null,
        "heardExpression": "la veille",
        "confidence": 0.9,
        "recurrence": null
      },
      "confidence": 0.9
    }
  ]
}
```

**Sortie APRÈS validateLlmOutput :**
- ok=true, 2 pensée(s)
  - Pensée [0]
    - texte : `J'ai un concert le 10 février 2027 à 20h30.`
    - event : `{"hasDate":true,"date":"2027-02-10","heardExpression":"le 10 février 2027 à 20h30","confidence":0.95}`
    - reminder : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0,"recurrence":null}`
    - reminder.date : `null` · reminder.time : `null` · reminder.heardExpression : `null` · reminder.confidence : `0`
  - Pensée [1]
    - texte : `Concert le 10 février 2027 à 20h30`
    - event : `{"hasDate":false,"date":null,"heardExpression":null,"confidence":0}`
    - reminder : `{"hasReminder":true,"date":"2027-02-09","time":null,"heardExpression":"la veille","confidence":0.9,"recurrence":null}`
    - reminder.date : `2027-02-09` · reminder.time : `null` · reminder.heardExpression : `la veille` · reminder.confidence : `0.9`
- Latence : 13222ms · Tokens in/out : 5231/1139 · Coût estimé : $0.003586

## Cas 1b (run 2/3)
Transcript : "J'ai un concert le 10 février 2027 à 20h30. Rappelle-moi la veille."

**Sortie BRUTE (avant validateLlmOutput) :**
```json
{
  "pensees": [
    {
      "texte": "Concert le 10 février 2027 à 20h30",
      "heardContactName": null,
      "event": {
        "hasDate": true,
        "date": "2027-02-10",
        "heardExpression": "le 10 février 2027 à 20h30",
        "confidence": 0.95
      },
      "reminder": {
        "hasReminder": false,
        "date": null,
        "time": null,
        "heardExpression": null,
        "confidence": 0,
        "recurrence": null
      },
      "confidence": 0.95
    },
    {
      "texte": "Concert le 10 février 2027 à 20h30",
      "heardContactName": null,
      "event": {
        "hasDate": true,
        "date": "2027-02-10",
        "heardExpression": "le 10 février 2027 à 20h30",
        "confidence": 0.9
      },
      "reminder": {
        "hasReminder": true,
        "date": "2027-02-09",
        "time": null,
        "heardExpression": "la veille",
        "confidence": 0.9,
        "recurrence": null
      },
      "confidence": 0.9
    }
  ]
}
```

**Sortie APRÈS validateLlmOutput :**
- ok=true, 2 pensée(s)
  - Pensée [0]
    - texte : `Concert le 10 février 2027 à 20h30`
    - event : `{"hasDate":true,"date":"2027-02-10","heardExpression":"le 10 février 2027 à 20h30","confidence":0.95}`
    - reminder : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0,"recurrence":null}`
    - reminder.date : `null` · reminder.time : `null` · reminder.heardExpression : `null` · reminder.confidence : `0`
  - Pensée [1]
    - texte : `Concert le 10 février 2027 à 20h30`
    - event : `{"hasDate":true,"date":"2027-02-10","heardExpression":"le 10 février 2027 à 20h30","confidence":0.9}`
    - reminder : `{"hasReminder":true,"date":"2027-02-09","time":null,"heardExpression":"la veille","confidence":0.9,"recurrence":null}`
    - reminder.date : `2027-02-09` · reminder.time : `null` · reminder.heardExpression : `la veille` · reminder.confidence : `0.9`
- Latence : 10997ms · Tokens in/out : 5231/962 · Coût estimé : $0.003232

## Cas 1c (run 3/3)
Transcript : "J'ai un concert le 10 février 2027 à 20h30. Rappelle-moi la veille."

**Sortie BRUTE (avant validateLlmOutput) :**
```json
{
  "pensees": [
    {
      "texte": "J'ai un concert le 10 février 2027 à 20h30.",
      "heardContactName": null,
      "event": {
        "hasDate": true,
        "date": "2027-02-10",
        "heardExpression": "le 10 février 2027 à 20h30",
        "confidence": 0.95
      },
      "reminder": {
        "hasReminder": false,
        "date": null,
        "time": null,
        "heardExpression": null,
        "confidence": 0,
        "recurrence": null
      },
      "confidence": 0.95
    },
    {
      "texte": "Un concert le 10 février 2027 à 20h30",
      "heardContactName": null,
      "event": {
        "hasDate": true,
        "date": "2027-02-10",
        "heardExpression": "le 10 février 2027 à 20h30",
        "confidence": 0.95
      },
      "reminder": {
        "hasReminder": true,
        "date": "2027-02-09",
        "time": null,
        "heardExpression": "la veille",
        "confidence": 0.95,
        "recurrence": null
      },
      "confidence": 0.9
    }
  ]
}
```

**Sortie APRÈS validateLlmOutput :**
- ok=true, 2 pensée(s)
  - Pensée [0]
    - texte : `J'ai un concert le 10 février 2027 à 20h30.`
    - event : `{"hasDate":true,"date":"2027-02-10","heardExpression":"le 10 février 2027 à 20h30","confidence":0.95}`
    - reminder : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0,"recurrence":null}`
    - reminder.date : `null` · reminder.time : `null` · reminder.heardExpression : `null` · reminder.confidence : `0`
  - Pensée [1]
    - texte : `Un concert le 10 février 2027 à 20h30`
    - event : `{"hasDate":true,"date":"2027-02-10","heardExpression":"le 10 février 2027 à 20h30","confidence":0.95}`
    - reminder : `{"hasReminder":true,"date":"2027-02-09","time":null,"heardExpression":"la veille","confidence":0.95,"recurrence":null}`
    - reminder.date : `2027-02-09` · reminder.time : `null` · reminder.heardExpression : `la veille` · reminder.confidence : `0.95`
- Latence : 14947ms · Tokens in/out : 5231/1414 · Coût estimé : $0.004136

## Cas 2a (run 1/3)
Transcript : "Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30. Je veux un rappel la veille."

**Sortie BRUTE (avant validateLlmOutput) :**
```json
{
  "pensees": [
    {
      "texte": "Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30",
      "heardContactName": "Claire",
      "event": {
        "hasDate": true,
        "date": "2027-02-10",
        "heardExpression": "le 10 février 2027 à 20h30",
        "confidence": 0.9
      },
      "reminder": {
        "hasReminder": true,
        "date": "2027-02-09",
        "time": null,
        "heardExpression": "la veille",
        "confidence": 0.9,
        "recurrence": null
      },
      "confidence": 0.9
    }
  ]
}
```

**Sortie APRÈS validateLlmOutput :**
- ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30`
    - event : `{"hasDate":true,"date":"2027-02-10","heardExpression":"le 10 février 2027 à 20h30","confidence":0.9}`
    - reminder : `{"hasReminder":true,"date":"2027-02-09","time":null,"heardExpression":"la veille","confidence":0.9,"recurrence":null}`
    - reminder.date : `2027-02-09` · reminder.time : `null` · reminder.heardExpression : `la veille` · reminder.confidence : `0.9`
- Latence : 10092ms · Tokens in/out : 5242/897 · Coût estimé : $0.003105

## Cas 2b (run 2/3)
Transcript : "Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30. Je veux un rappel la veille."

**Sortie BRUTE (avant validateLlmOutput) :**
```json
{
  "pensees": [
    {
      "texte": "Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30",
      "heardContactName": "Claire",
      "event": {
        "hasDate": true,
        "date": "2027-02-10",
        "heardExpression": "le 10 février 2027 à 20h30",
        "confidence": 0.9
      },
      "reminder": {
        "hasReminder": true,
        "date": "2027-02-09",
        "time": null,
        "heardExpression": "la veille",
        "confidence": 0.9,
        "recurrence": null
      },
      "confidence": 0.9
    }
  ]
}
```

**Sortie APRÈS validateLlmOutput :**
- ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30`
    - event : `{"hasDate":true,"date":"2027-02-10","heardExpression":"le 10 février 2027 à 20h30","confidence":0.9}`
    - reminder : `{"hasReminder":true,"date":"2027-02-09","time":null,"heardExpression":"la veille","confidence":0.9,"recurrence":null}`
    - reminder.date : `2027-02-09` · reminder.time : `null` · reminder.heardExpression : `la veille` · reminder.confidence : `0.9`
- Latence : 9112ms · Tokens in/out : 5242/705 · Coût estimé : $0.002720

## Cas 2c (run 3/3)
Transcript : "Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30. Je veux un rappel la veille."

**Sortie BRUTE (avant validateLlmOutput) :**
```json
{
  "pensees": [
    {
      "texte": "Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30",
      "heardContactName": "Claire",
      "event": {
        "hasDate": true,
        "date": "2027-02-10",
        "heardExpression": "le 10 février 2027 à 20h30",
        "confidence": 0.95
      },
      "reminder": {
        "hasReminder": true,
        "date": "2027-02-09",
        "time": null,
        "heardExpression": "la veille",
        "confidence": 0.9,
        "recurrence": null
      },
      "confidence": 0.92
    }
  ]
}
```

**Sortie APRÈS validateLlmOutput :**
- ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30`
    - event : `{"hasDate":true,"date":"2027-02-10","heardExpression":"le 10 février 2027 à 20h30","confidence":0.95}`
    - reminder : `{"hasReminder":true,"date":"2027-02-09","time":null,"heardExpression":"la veille","confidence":0.9,"recurrence":null}`
    - reminder.date : `2027-02-09` · reminder.time : `null` · reminder.heardExpression : `la veille` · reminder.confidence : `0.9`
- Latence : 8972ms · Tokens in/out : 5242/833 · Coût estimé : $0.002976

## Cas 3 (heure explicite 18h — contrôle)
Transcript : "Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30. Rappelle-moi la veille à 18h."

**Sortie BRUTE (avant validateLlmOutput) :**
```json
{
  "pensees": [
    {
      "texte": "Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30",
      "heardContactName": "Claire",
      "event": {
        "hasDate": true,
        "date": "2027-02-10",
        "heardExpression": "le 10 février 2027 à 20h30",
        "confidence": 0.9
      },
      "reminder": {
        "hasReminder": true,
        "date": "2027-02-09",
        "time": "18:00",
        "heardExpression": "la veille à 18h",
        "confidence": 0.9,
        "recurrence": null
      },
      "confidence": 0.9
    }
  ]
}
```

**Sortie APRÈS validateLlmOutput :**
- ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30`
    - event : `{"hasDate":true,"date":"2027-02-10","heardExpression":"le 10 février 2027 à 20h30","confidence":0.9}`
    - reminder : `{"hasReminder":true,"date":"2027-02-09","time":"18:00","heardExpression":"la veille à 18h","confidence":0.9,"recurrence":null}`
    - reminder.date : `2027-02-09` · reminder.time : `18:00` · reminder.heardExpression : `la veille à 18h` · reminder.confidence : `0.9`
- Latence : 9563ms · Tokens in/out : 5246/840 · Coût estimé : $0.002992

## Cas 4 (sans rappel — contrôle)
Transcript : "Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30."

**Sortie BRUTE (avant validateLlmOutput) :**
```json
{
  "pensees": [
    {
      "texte": "Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30.",
      "heardContactName": "Claire",
      "event": {
        "hasDate": true,
        "date": "2027-02-10",
        "heardExpression": "le 10 février 2027 à 20h30",
        "confidence": 0.9
      },
      "reminder": {
        "hasReminder": false,
        "date": null,
        "time": null,
        "heardExpression": null,
        "confidence": 0,
        "recurrence": null
      },
      "confidence": 0.9
    }
  ]
}
```

**Sortie APRÈS validateLlmOutput :**
- ok=true, 1 pensée(s)
  - Pensée [0]
    - texte : `Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30.`
    - event : `{"hasDate":true,"date":"2027-02-10","heardExpression":"le 10 février 2027 à 20h30","confidence":0.9}`
    - reminder : `{"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0,"recurrence":null}`
    - reminder.date : `null` · reminder.time : `null` · reminder.heardExpression : `null` · reminder.confidence : `0`
- Latence : 8400ms · Tokens in/out : 5235/697 · Coût estimé : $0.002703

## Synthèse factuelle

- Coût total estimé : $0.025449
- Contexte utilisé pour TOUS les runs : `2026-09-18T15:00:00`.
- Comparer 1a/1b/1c et 2a/2b/2c pour la stabilité de reminder.date/time sur "la veille" sans heure explicite.
- Si reminder.time == "15:00" sur les cas 1/2 → confirme la recopie du contexte (hypothèse de l'audit). Si reminder.time == null → confirme l'application correcte de la règle "jamais d'heure par défaut", et l'observation iPhone aurait une autre origine (à ré-auditer ailleurs).
- Cas 3 : reminder.time attendu = "18:00" (heure explicitement dite) — vérifie que l'heure dite n'est jamais écrasée par le contexte.
- Cas 4 : reminder.hasReminder attendu = false, event.hasDate=true, event.date="2027-02-10" — vérifie qu'aucune heure de rappel n'apparaît sans demande de rappel, et que "20h30" reste uniquement dans `texte`/`event.heardExpression` faute de `event.time` structuré (voir audit précédent).