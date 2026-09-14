# Benchmark Capture — Claude vs GPT-5 nano vs GPT-5 mini

Modèles : Anthropic=`claude-sonnet-5`, GPT-5 nano=`gpt-5-nano`, GPT-5 mini=`gpt-5-mini` (reasoning_effort=`low` pour les deux). Contexte temporel fixe : 2026-09-18T10:00:00 (vendredi, Europe/Paris).

| Cas | Claude OK ? | GPT-5 nano OK ? | GPT-5 mini OK ? | Différence |
|---|---|---|---|---|
| 1. Simple mémo sans date | ✅ | ✅ | ✅ | — |
| 2. Rappel avec date+heure | ✅ | ✅ | ✅ | — |
| 3. Deux infos à splitter (goût + rappel) | ✅ | ✅ | ✅ | — |
| 4. Event simple (entretien) | ✅ | ✅ | ✅ | — |
| 5. Cadeau à faire (pas de date) | ✅ | ✅ | ✅ | — |
| 6. Rappel SANS heure/date dite — ne jamais inventer 09:00 | ✅ | ✅ | ✅ | — |
| 7. Rappel avec date relative + heure ("demain") | ❌ | ✅ | ✅ | Claude: reminder={"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.3} / Nano: reminder={"hasReminder":true,"date":"2026-09-19","time":"08:00","heardExpression":"à 8h demain","confidence":0.95} / Mini: reminder={"hasReminder":true,"date":"2026-09-19","time":"08:00","heardExpression":"à 8h demain","confidence":0.95} |
| 8. Plusieurs infos distinctes à splitter | ✅ | ✅ | ✅ | — |
| 9. Date sans reminder | ✅ | ✅ | ✅ | — |
| 10. Reminder + date + heure explicites | ✅ | ❌ | ✅ | Claude: reminder={"hasReminder":true,"date":"2026-09-25","time":"14:30","heardExpression":"le 25 septembre à 14h30","confidence":0.95}, contact=Yohan / Nano: reminder={"hasReminder":false,"date":null,"time":null,"heardExpression":null,"confidence":0.5}, contact=Yohan / Mini: reminder={"hasReminder":true,"date":"2026-09-25","time":"14:30","heardExpression":"le 25 septembre à 14h30","confidence":0.95}, contact=Yohan |

## Scores

- Score Claude : 9/10
- Score GPT-5 nano : 9/10
- Score GPT-5 mini : 10/10

## Erreurs critiques (échec réseau/API, pas juste une extraction incorrecte)

- Claude : aucune
- GPT-5 nano : aucune
- GPT-5 mini : aucune

## Latence, tokens, coût

| | Latence moy. | Tokens in moy. | Tokens out moy. | Coût moy./capture |
|---|---|---|---|---|
| Claude | 4134ms | 1110 | 408 | $0.009452 (tarifs approximatifs, à vérifier) |
| GPT-5 nano | 4456ms | 2050 | 788 | $0.000418 (tarifs approximatifs, à vérifier) |
| GPT-5 mini | 4736ms | 2050 | 378 | $0.001268 (tarifs approximatifs, à vérifier) |

## Projection 1 000 captures (coût réel mesuré × 1000)

- Claude : $9.45
- GPT-5 nano : $0.42
- GPT-5 mini : $1.27

## Ratios de coût

- Mini / Nano : 3.04x
- Mini / Claude : 0.13x

## Comparaison avec les runs de référence

| | Score | Latence moy. | Coût moy./capture |
|---|---|---|---|
| GPT-5 nano — 1er passage (sans renfort, `minimal`) | 3/10 | 1536ms | $0.000096 |
| GPT-5 nano — référence figée (`low`) | 9/10 | 4641ms | $0.000404 |
| GPT-5 nano — ce run (`low`) | 9/10 | 4456ms | $0.000418 |
| GPT-5 mini — ce run (`low`) | 10/10 | 4736ms | $0.001268 |
| Claude (référence) | 9/10 | 3213ms | $0.008267 |