# Benchmark de non-régression ciblé — cas 4, 7, 8, 14, 17 — GPT-5 mini

Modèle : `gpt-5-mini` (valeurs de production, sans override : reasoning_effort=low, max_completion_tokens=1200, prompt durci 2 fois — sélection du contexte + interdiction d'inventer, puis ton limité à la formulation + état émotionnel jamais affirmé). Objectif : vérifier que le cas 14 (hallucination "café trop fort"/"recette miracle" en ton complice sur contexte pauvre) est corrigé, sans régresser 4/7/8/17.

## Cas 4 — Thinking of you — chaleureux — pensées pertinentes
Ton demandé : **chaleureux**

- Message : "Coucou Léa, je pensais à toi — comment tu vas ? Je sais que tu as un entretien la semaine prochaine et que tu es un peu stressée ; si tu veux en parler ou te changer les idées, ça me ferait plaisir. Je suis aussi contente que tu aies recommencé le yoga, j’espère que ça te fait du bien. Donne-moi de tes nouvelles quand tu peux. Bisous"
- JSON valide : ✅ · Latence : 6797ms · Tokens in/out : 924/420 · Coût estimé : $0.001071
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=320, tokens visibles restants≈100
- Mentions interdites détectées : aucune

**À vérifier : toujours pas de régression (fidélité factuelle, aucune émotion affirmée non fournie, aucune invention d’action/état).**
- Jugement manuel : 

## Cas 7 — Event (nouvelle situation pro) — chaleureux — wish exploitable, PAS à forcer
Ton demandé : **chaleureux**

- Message : "Micka, félicitations pour ton nouveau poste ! Je suis vraiment content pour toi. Bon courage pour le début le mois prochain — pense à me raconter comment ça se passe quand tu auras pris tes marques. À très vite !"
- JSON valide : ✅ · Latence : 7189ms · Tokens in/out : 945/384 · Coût estimé : $0.001004
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=320, tokens visibles restants≈64
- Mentions interdites détectées : aucune

**À vérifier : toujours pas de régression (fidélité factuelle, aucune émotion affirmée non fournie, aucune invention d’action/état).**
- Jugement manuel : 

## Cas 8 — Event (entretien) — complice — personnalisation possible sans invention
Ton demandé : **complice**

- Message : "Jean-Luc, le 22/09/2026 c’est le grand jour pour ton permis. Je sais que tu as déjà raté une fois et que tu étais un peu nerveux, alors reste cool et fais-toi confiance. Je pense à toi — donne-moi des nouvelles quand tu peux."
- JSON valide : ✅ · Latence : 13840ms · Tokens in/out : 934/655 · Coût estimé : $0.001543
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=576, tokens visibles restants≈79
- Mentions interdites détectées : aucune

**À vérifier : toujours pas de régression (fidélité factuelle, aucune émotion affirmée non fournie, aucune invention d’action/état).**
- Jugement manuel : 

## Cas 14 — Thinking of you — complice — contexte TRÈS PAUVRE
Ton demandé : **complice**

- Message : "Salut Marc, je pensais à toi et je voulais prendre des nouvelles — alors, quoi de neuf ? Raconte-moi quelque chose d’intéressant ou fais-moi rire un peu. Donne-moi de tes nouvelles quand tu veux."
- JSON valide : ✅ · Latence : 11107ms · Tokens in/out : 869/447 · Coût estimé : $0.001111
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=384, tokens visibles restants≈63
- Mentions interdites détectées : aucune

**À vérifier en priorité : aucune anecdote/habitude/blague inventée (ex. plus de "café trop fort" ni "recette miracle") — complicité uniquement par le style.**
- Jugement manuel : 

## Cas 17 — Event (naissance) — complice — pensées pertinentes riches
Ton demandé : **complice**

- Message : "Amine, félicitations pour l’arrivée de ta petite fille ! Je sais que tu étais super stressé avant l’accouchement, et je suis content que tout se soit bien passé. Vous voilà donc parents de deux, avec ton fils de 3 ans et maintenant une fille — bienvenue au club. Repose-toi un peu et donne-moi des nouvelles quand tu veux."
- JSON valide : ✅ · Latence : 6791ms · Tokens in/out : 954/543 · Coût estimé : $0.001324
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=448, tokens visibles restants≈95
- Mentions interdites détectées : aucune

**À vérifier : toujours pas de régression (fidélité factuelle, aucune émotion affirmée non fournie, aucune invention d’action/état).**
- Jugement manuel : 

## Synthèse

- JSON valides : 5/5
- Cas ayant atteint la limite de 1200 : 0/5
- Jugement qualitatif (invention/émotion/ton) à faire sur les 5 blocs ci-dessus, en particulier le cas 14.