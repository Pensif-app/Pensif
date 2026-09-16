# Benchmark FINAL — GPT-5 mini seul (candidat retenu) — Réponses intelligentes

Modèle : `gpt-5-mini`. Valeurs de PRODUCTION, sans override (reasoning_effort=low, max_completion_tokens=1200, prompt durci — 2 règles ajoutées : sélection du contexte / interdiction d'inventer). Mêmes 18 cas que le run diagnostic A/B, import direct du même corpus.

## Cas 1 — Birthday jour J — chaleureux — quiz + pensée pertinente
Ton demandé : **chaleureux**

- Message : "Joyeux anniversaire Yohan ! Je te souhaite une très belle journée, pleine de moments simples qui te font plaisir. Prends du temps pour écouter de la bonne musique ou te plonger dans une partie si ça te tente. Je t’envoie tout mon amour fraternel — profite bien et donne-moi de tes nouvelles quand tu veux."
- JSON valide : ✅ · Latence : 4691ms · Tokens in/out : 826/278 · Coût estimé : $0.000762
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=192, tokens visibles restants≈86
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 2 — Birthday dans 5 jours — complice — quiz riche, AUCUNE pensée
Ton demandé : **complice**

- Message : "Sofia, dans 5 jours c'est ton anniversaire — déjà ! Profite bien de ta journée quand elle arrivera. Petite taquinerie : je n'ai pas oublié ta lubie pour un appareil photo instantané, j'imagine déjà ta collection de clichés de voyages et de plats. Donne-moi de tes nouvelles quand tu veux. Joyeux anniversaire en avance !"
- JSON valide : ✅ · Latence : 11280ms · Tokens in/out : 776/924 · Coût estimé : $0.002042
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=832, tokens visibles restants≈92
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 3 — Birthday demain — court — contexte TRÈS PAUVRE (quasi rien)
Ton demandé : **court**

- Message : "Joyeux anniversaire Karim ! Passe une bonne journée."
- JSON valide : ✅ · Latence : 1779ms · Tokens in/out : 721/92 · Coût estimé : $0.000364
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=64, tokens visibles restants≈28
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 4 — Thinking of you — chaleureux — pensées pertinentes
Ton demandé : **chaleureux**

- Message : "Coucou Léa, je pensais à toi et je voulais prendre des nouvelles — comment tu vas ? J’espère que le yoga que tu as repris t’apporte un peu de calme en vue de ton entretien la semaine prochaine. Si tu veux en parler ou juste te changer les idées, je suis là. Prends soin de toi."
- JSON valide : ✅ · Latence : 6618ms · Tokens in/out : 787/340 · Coût estimé : $0.000877
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=256, tokens visibles restants≈84
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 5 — Thinking of you — complice — pensées TOTALEMENT HORS SUJET (à ignorer)
Ton demandé : **complice**

- Message : "Paul, je pense à toi. Raconte-moi quelque chose d'improbable la prochaine fois — j'accepte même les petits mensonges inventifs. Donne-moi de tes nouvelles quand tu veux, je suis prêt à être surpris."
- JSON valide : ✅ · Latence : 5957ms · Tokens in/out : 781/514 · Coût estimé : $0.001223
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=448, tokens visibles restants≈66
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 6 — Thinking of you — court — PLUSIEURS pensées, UNE SEULE pertinente
Ton demandé : **court**

- Message : "Bonjour Odile, je voulais juste prendre de tes nouvelles. J’ai appris que tu as été hospitalisée deux jours la semaine dernière ; ça me fait plaisir que tu ailles mieux. Donne-moi de tes nouvelles quand tu peux."
- JSON valide : ✅ · Latence : 4660ms · Tokens in/out : 808/320 · Coût estimé : $0.000842
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=256, tokens visibles restants≈64
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 7 — Event (nouvelle situation pro) — chaleureux — wish exploitable, PAS à forcer
Ton demandé : **chaleureux**

- Message : "Micka, félicitations pour ton nouveau poste ! Je suis vraiment content pour toi. Commencer le mois prochain, quelle super nouvelle. C’est l’occasion idéale pour souffler un peu — et peut‑être pour ces nouvelles baskets de running dont tu parlais. Prends soin de toi et donne-moi de tes nouvelles quand tu veux."
- JSON valide : ✅ · Latence : 5542ms · Tokens in/out : 808/342 · Coût estimé : $0.000886
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=256, tokens visibles restants≈86
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 8 — Event (entretien) — complice — personnalisation possible sans invention
Ton demandé : **complice**

- Message : "Jean-Luc, c’est le grand jour pour le permis le 22 septembre 2026 — je pense à toi ! Je sais que tu es un peu nerveux après avoir déjà raté une fois, mais je me permets d’être confiant : fais-toi confiance et montre-leur. Allez, courage — donne-moi de tes nouvelles après !"
- JSON valide : ✅ · Latence : 6429ms · Tokens in/out : 797/601 · Coût estimé : $0.001401
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=512, tokens visibles restants≈89
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 9 — Event (déménagement) — court — contexte pauvre (texte+date seuls)
Ton demandé : **court**

- Message : "Félicitations pour ton nouvel appartement, Fatima !"
- JSON valide : ✅ · Latence : 2426ms · Tokens in/out : 756/157 · Coût estimé : $0.000503
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=128, tokens visibles restants≈29
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 10 — Birthday jour J — complice — contexte pauvre (prénom + genre null)
Ton demandé : **complice**

- Message : "Joyeux anniversaire Camille ! Alors, encore un an de sagesse en plus... ou juste un an de plus, c’est selon. Profite bien de ta journée, fais-toi plaisir, et raconte-moi comment tu la fêtes quand tu as une minute. Je t’embrasse fort."
- JSON valide : ✅ · Latence : 3438ms · Tokens in/out : 720/269 · Coût estimé : $0.000718
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=192, tokens visibles restants≈77
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 11 — Birthday dans 14 jours — court — pensées HORS SUJET (à ignorer)
Ton demandé : **court**

- Message : "Bon anniversaire en avance, Thomas."
- JSON valide : ✅ · Latence : 1914ms · Tokens in/out : 765/88 · Coût estimé : $0.000367
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=64, tokens visibles restants≈24
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 12 — Birthday jour J — court — plusieurs pensées, UNE SEULE pertinente
Ton demandé : **court**

- Message : "Joyeux anniversaire Alice ! Bravo pour ton chaton, profite bien. Bisous."
- JSON valide : ✅ · Latence : 5349ms · Tokens in/out : 790/291 · Coût estimé : $0.000780
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=256, tokens visibles restants≈35
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 13 — Thinking of you — chaleureux — quiz riche + wish, aucune pensée
Ton demandé : **chaleureux**

- Message : "Coucou Nadia, je pensais à toi et voulais prendre de tes nouvelles. Comment vas-tu ? J’espère que tu trouves du temps pour lire et te ressourcer en pleine nature. Tu avais mentionné l’idée d’un abonnement à une box thé — l’as-tu déjà essayé ? Donne-moi de tes nouvelles quand tu veux. Je t’embrasse."
- JSON valide : ✅ · Latence : 4650ms · Tokens in/out : 791/283 · Coût estimé : $0.000764
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=192, tokens visibles restants≈91
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 14 — Thinking of you — complice — contexte TRÈS PAUVRE
Ton demandé : **complice**

- Message : "Hé Marc, je pensais à toi et je me demande ce que tu deviens — toujours en train de batailler avec ton café trop fort ou as-tu enfin trouvé la recette miracle ? Raconte-moi tout quand tu as une minute, j’ai besoin de potins (et de me moquer un peu)."
- JSON valide : ✅ · Latence : 2878ms · Tokens in/out : 732/145 · Coût estimé : $0.000473
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=64, tokens visibles restants≈81
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 15 — Event (nouveau poste) — court — plusieurs pensées, une seule pertinente + quiz
Ton demandé : **court**

- Message : "Julien, félicitations pour la signature de ton contrat pour ce nouveau poste — après ces mois de recherche, bravo !"
- JSON valide : ✅ · Latence : 3983ms · Tokens in/out : 820/298 · Coût estimé : $0.000801
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=256, tokens visibles restants≈42
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 16 — Birthday dans 14 jours — chaleureux — wish exploitable, PAS à forcer, aucune pensée
Ton demandé : **chaleureux**

- Message : "Maman, dans 14 jours c’est ton anniversaire et je pense à toi. Je te souhaite d’avance une belle journée remplie de moments agréables. Tu avais mentionné vouloir de nouveaux outils de jardinage — si tu veux, dis-moi ce que tu aimerais exactement. Je t’embrasse fort."
- JSON valide : ✅ · Latence : 4842ms · Tokens in/out : 779/337 · Coût estimé : $0.000869
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=256, tokens visibles restants≈81
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 17 — Event (naissance) — complice — pensées pertinentes riches
Ton demandé : **complice**

- Message : "Amine, félicitations pour la naissance de votre fille ! Je sais que tu étais super stressé avant l’accouchement — quel soulagement que tout se soit bien passé. Et voilà papa de deux : ton fils de 3 ans et maintenant une petite fille. Trop content pour vous. Hâte d’avoir des nouvelles et, bien sûr, les premières photos quand vous pourrez."
- JSON valide : ✅ · Latence : 8020ms · Tokens in/out : 817/672 · Coût estimé : $0.001548
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=576, tokens visibles restants≈96
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Cas 18 — Thinking of you — court — contexte permettant un message personnel SANS RIEN inventer
Ton demandé : **court**

- Message : "Salut Bastien, ça va ? Comment se passent les entraînements pour le semi ? Donne des nouvelles."
- JSON valide : ✅ · Latence : 2836ms · Tokens in/out : 795/231 · Coût estimé : $0.000661
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=192, tokens visibles restants≈39
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**
- Mini : 

## Synthèse

- JSON valides : 18/18
- Cas ayant atteint la limite de 1200 (finish_reason="length") : 0/18
- reasoning_tokens moyen / max : 277 / 832
- tokens visibles moyens : 66
- Latence moyenne : 4849ms
- Coût moyen/message : $0.000882
- Projection 1000 messages : $0.88

Fidélité factuelle, naturel, respect du ton, pertinence, capacité à ignorer l’inutile et absence d’invention d’action/état restent à juger sur les 18 blocs ci-dessus.