# Benchmark "Réponses intelligentes" — GPT-5 nano vs GPT-5 mini — run DIAGNOSTIC budget de sortie

Modèles : nano=`gpt-5-nano`, mini=`gpt-5-mini` (reasoning_effort=`low` pour les deux, prompt/contrat IDENTIQUES et INCHANGÉS par rapport au benchmark A et entre les deux modèles — mêmes `buildSystemPrompt`/`buildUserPrompt`/`buildOpenaiRequestBody` que la production, mêmes 18 cas). **Seul écart volontaire vs le benchmark A et vs la production : `max_completion_tokens` = 1000 pour ce run (au lieu de 400 en production) — appliqué UNIQUEMENT dans ce script diagnostic, providers/llm/openai.ts n'est pas modifié.** Prompt non modifié même si certaines réponses inventent des éléments ou utilisent des pensées hors sujet — ce run isole uniquement le problème de budget. 18 paires nano/mini ci-dessous pour jugement manuel — voir aussi la console pour le même contenu.

## Cas 1 — Birthday jour J — chaleureux — quiz + pensée pertinente
Ton demandé : **chaleureux**

**GPT-5 nano**
- Message : "Joyeux anniversaire, Yohan ! J’espère que ta journée est à la hauteur et que tu prends le temps de te faire plaisir. Je suis super content que tu aies enfin signé ton appart — ça mérite bien une pause et un vrai moment de calme entre deux sessions de musique et de gaming. Pour ton cadeau, j’espère que tu vas pouvoir profiter d’un casque audio et profiter encore plus de tes morceaux et de tes jeux. Gros bisous et bon anniversaire, frère."
- JSON valide : ✅ · Latence : 4258ms · Tokens in/out : 598/563 · Coût estimé : $0.000255
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=448, tokens visibles restants≈115
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Joyeux anniversaire Yohan ! Je suis vraiment content pour toi d’avoir enfin signé ton appartement, quelle bonne nouvelle — tu dois être soulagé. Profite bien de ta journée, on fêtera ça bientôt. Si tu veux, on pourra te prendre le casque audio dont tu parlais. Je t’embrasse."
- JSON valide : ✅ · Latence : 4648ms · Tokens in/out : 598/276 · Coût estimé : $0.000701
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=192, tokens visibles restants≈84
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 2 — Birthday dans 5 jours — complice — quiz riche, AUCUNE pensée
Ton demandé : **complice**

**GPT-5 nano**
- Message : "Hey Sofia, plus que 5 jours avant ton anniversaire. Complice et taquine comme d'habitude: on prévoit une petite aventure pour célébrer et mettre à l’épreuve ton éventuel appareil photo instantané — parce que tes photos de voyage et de cuisine méritent d’être imprimées tout de suite. Prépare-toi à souffler les bougies et à faire la star le soir-là."
- JSON valide : ✅ · Latence : 5268ms · Tokens in/out : 548/740 · Coût estimé : $0.000323
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=640, tokens visibles restants≈100
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Sofia, dans 5 jours c’est ton anniversaire — tu te rends compte ? Je me prépare mentalement à te taquiner toute la journée. Tu veux toujours ton appareil photo instantané ? On s’organise quelque chose pour fêter ça bientôt ?"
- JSON valide : ✅ · Latence : 4445ms · Tokens in/out : 548/325 · Coût estimé : $0.000787
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=256, tokens visibles restants≈69
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 3 — Birthday demain — court — contexte TRÈS PAUVRE (quasi rien)
Ton demandé : **court**

**GPT-5 nano**
- Message : "Bon anniversaire, Karim ! On se voit demain."
- JSON valide : ✅ · Latence : 1538ms · Tokens in/out : 493/155 · Coût estimé : $0.000087
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=128, tokens visibles restants≈27
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Bon anniversaire pour demain, Karim."
- JSON valide : ✅ · Latence : 1844ms · Tokens in/out : 493/88 · Coût estimé : $0.000299
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=64, tokens visibles restants≈24
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 4 — Thinking of you — chaleureux — pensées pertinentes
Ton demandé : **chaleureux**

**GPT-5 nano**
- Message : "Coucou Léa, je pense à toi et j’espère que tout se passe bien pour ton entretien la semaine prochaine. Si jamais le stress monte, rappelle-toi que tu as commencé le yoga récemment et que ça peut aider à te recentrer. Je suis là si tu as besoin d’en parler ou de quelqu’un pour t’écouter. Gros bisou et courage, tu vas très bien t’en sortir."
- JSON valide : ✅ · Latence : 3207ms · Tokens in/out : 559/292 · Coût estimé : $0.000145
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=192, tokens visibles restants≈100
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Coucou Léa, je voulais juste prendre de tes nouvelles. Je sais que tu as un entretien la semaine prochaine et que tu es un peu stressée — je pense bien à toi. Si tu veux en parler ou te changer les idées avant, je suis là. Et comment se passe le yoga depuis que tu as recommencé ? Prends soin de toi, à bientôt."
- JSON valide : ✅ · Latence : 7098ms · Tokens in/out : 559/477 · Coût estimé : $0.001094
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=384, tokens visibles restants≈93
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 5 — Thinking of you — complice — pensées TOTALEMENT HORS SUJET (à ignorer)
Ton demandé : **complice**

**GPT-5 nano**
- Message : "Paul, j’espère que tout va bien de ton côté. Je pense à toi et à nos petites habitudes: le code promo Amazon expire le 30 et il faudrait peut-être penser à racheter du papier toilette. Tu me diras si tu as une meilleure idée pour occuper ta semaine. À bientôt."
- JSON valide : ✅ · Latence : 3106ms · Tokens in/out : 553/399 · Coût estimé : $0.000187
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=320, tokens visibles restants≈79
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Salut Paul, tu vas bien ? Je pensais à toi — tu as utilisé le code promo Amazon avant le 30 ou tu laisses expirer ça en beauté ? Et au fait, tu as pensé à racheter du papier toilette ou je dois te livrer une réserve de secours ?"
- JSON valide : ✅ · Latence : 5877ms · Tokens in/out : 553/395 · Coût estimé : $0.000928
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=320, tokens visibles restants≈75
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 6 — Thinking of you — court — PLUSIEURS pensées, UNE SEULE pertinente
Ton demandé : **court**

**GPT-5 nano**
- Message : ❌ JSON invalide : Réponse du modèle non exploitable (pas un objet JSON)
- JSON valide : ❌ · Latence : 6721ms · Tokens in/out : 580/1000 · Coût estimé : $0.000429
- Diagnostic budget : finish_reason=`length`, reasoning_tokens=1000, tokens visibles restants≈0 — **⚠️ BUDGET ÉPUISÉ (length)**
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Odile, j’espère que tu te sens mieux après ton hospitalisation la semaine dernière. Donne-moi des nouvelles quand tu peux."
- JSON valide : ✅ · Latence : 2884ms · Tokens in/out : 580/236 · Coût estimé : $0.000617
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=192, tokens visibles restants≈44
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 7 — Event (nouvelle situation pro) — chaleureux — wish exploitable, PAS à forcer
Ton demandé : **chaleureux**

**GPT-5 nano**
- Message : "Micka, super nouvelle pour toi : ton nouveau poste commence le mois prochain ! Je suis vraiment content pour toi. On se voit bientôt pour fêter ça comme il se doit. Prends soin de toi et à très vite."
- JSON valide : ✅ · Latence : 4079ms · Tokens in/out : 580/575 · Coût estimé : $0.000259
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=512, tokens visibles restants≈63
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Micka, toutes mes félicitations pour ton nouveau poste ! Je suis vraiment content pour toi. Tu commences le 1er octobre — si tu veux qu’on marque le coup ou qu’on aille choisir cette nouvelle paire de baskets de running dont tu parlais, dis-moi. Bon courage pour les préparatifs, je pense à toi."
- JSON valide : ✅ · Latence : 8289ms · Tokens in/out : 580/535 · Coût estimé : $0.001215
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=448, tokens visibles restants≈87
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 8 — Event (entretien) — complice — personnalisation possible sans invention
Ton demandé : **complice**

**GPT-5 nano**
- Message : "Jean-Luc, tu as passé ton permis de conduire ? Super nouvelle si c’est le cas. Je me souviens que tu avais raté une fois, t’étais un peu nerveux à ce sujet. On en parle quand tu veux et on célèbre comme il faut."
- JSON valide : ✅ · Latence : 4502ms · Tokens in/out : 569/647 · Coût estimé : $0.000287
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=576, tokens visibles restants≈71
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Jean-Luc, le grand jour pour le permis, c’est le 22/09/2026 — je te préviens, pas de panique ! Après le premier coup manqué, tu vas gérer cette fois. Respire, garde ton calme et évite de klaxonner pour célébrer avant l’heure. On fêtera ça comme il se doit dès que tu rentres."
- JSON valide : ✅ · Latence : 4589ms · Tokens in/out : 569/352 · Coût estimé : $0.000846
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=256, tokens visibles restants≈96
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 9 — Event (déménagement) — court — contexte pauvre (texte+date seuls)
Ton demandé : **court**

**GPT-5 nano**
- Message : "Félicitations pour ton nouvel appartement, Fatima."
- JSON valide : ✅ · Latence : 1928ms · Tokens in/out : 528/222 · Coût estimé : $0.000115
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=192, tokens visibles restants≈30
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Félicitations pour ton nouvel appartement, Fatima."
- JSON valide : ✅ · Latence : 2305ms · Tokens in/out : 528/93 · Coût estimé : $0.000318
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=64, tokens visibles restants≈29
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 10 — Birthday jour J — complice — contexte pauvre (prénom + genre null)
Ton demandé : **complice**

**GPT-5 nano**
- Message : "Joyeux anniversaire, Camille ! Complice et taquine, comme entre nous. Je te souhaite une journée aussi pétillante que toi. Profite bien et prépare-toi, on sait jamais ce que je vais te lancer en plein milieu de la journée. Bisous."
- JSON valide : ✅ · Latence : 4903ms · Tokens in/out : 492/712 · Coût estimé : $0.000309
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=640, tokens visibles restants≈72
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Joyeux anniversaire Camille ! Profite bien de ta journée — je pense à toi et t’envoie d’avance toutes mes taquineries. Hâte d’avoir de tes nouvelles."
- JSON valide : ✅ · Latence : 8718ms · Tokens in/out : 492/758 · Coût estimé : $0.001639
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=704, tokens visibles restants≈54
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 11 — Birthday dans 14 jours — court — pensées HORS SUJET (à ignorer)
Ton demandé : **court**

**GPT-5 nano**
- Message : "Joyeux anniversaire, Thomas. La réunion est reportée à mardi."
- JSON valide : ✅ · Latence : 2708ms · Tokens in/out : 537/352 · Coût estimé : $0.000168
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=320, tokens visibles restants≈32
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Thomas — ton anniversaire dans 14 jours."
- JSON valide : ✅ · Latence : 2884ms · Tokens in/out : 537/218 · Coût estimé : $0.000570
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=192, tokens visibles restants≈26
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 12 — Birthday jour J — court — plusieurs pensées, UNE SEULE pertinente
Ton demandé : **court**

**GPT-5 nano**
- Message : "Joyeux anniversaire, Alice. Bonne journée et courage pour la facture d'électricité à régler avant le 10, et félicitations pour le chaton. Bon rendez-vous chez le coiffeur samedi."
- JSON valide : ✅ · Latence : 3755ms · Tokens in/out : 562/443 · Coût estimé : $0.000205
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=384, tokens visibles restants≈59
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Joyeux anniversaire Alice. Profite bien de ta journée."
- JSON valide : ✅ · Latence : 1754ms · Tokens in/out : 562/94 · Coût estimé : $0.000329
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=64, tokens visibles restants≈30
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 13 — Thinking of you — chaleureux — quiz riche + wish, aucune pensée
Ton demandé : **chaleureux**

**GPT-5 nano**
- Message : "Coucou Nadia, juste un petit coucou pour te dire que tu me manques et que je pense à toi. J’espère que tu vas bien et que tu prends soin de toi. Si l’envie te prend, on peut se faire une petite soirée lecture ou une balade dans la nature, selon ce qui te fait du bien. Et si tu as envie d’un moment cosy, une box thé te ferait peut-être plaisir. Qu’on se capte bientôt, gros bisous."
- JSON valide : ✅ · Latence : 3731ms · Tokens in/out : 563/498 · Coût estimé : $0.000227
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=384, tokens visibles restants≈114
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Coucou Nadia, je pensais à toi et je voulais prendre de tes nouvelles. Comment vas-tu ces temps-ci ? J'espère que tout va bien pour toi. Si tu as envie de discuter ou de raconter ce que tu deviens, je suis là. Je t'embrasse fort, ta cousine."
- JSON valide : ✅ · Latence : 3697ms · Tokens in/out : 563/271 · Coût estimé : $0.000683
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=192, tokens visibles restants≈79
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 14 — Thinking of you — complice — contexte TRÈS PAUVRE
Ton demandé : **complice**

**GPT-5 nano**
- Message : "Salut Marc, comment tu vas ? Je pensais à toi et ça m’a fait sourire. On prend des nouvelles quand tu veux, histoire de rattraper le temps perdu."
- JSON valide : ✅ · Latence : 4307ms · Tokens in/out : 504/564 · Coût estimé : $0.000251
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=512, tokens visibles restants≈52
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Salut Marc, je pensais à toi et je voulais prendre de tes nouvelles. Alors, quoi de neuf ? Ne fais pas le mystérieux, je veux tout savoir — ou au moins une petite anecdote qui me fasse rire. À très vite ?"
- JSON valide : ✅ · Latence : 5478ms · Tokens in/out : 504/450 · Coût estimé : $0.001026
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=384, tokens visibles restants≈66
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 15 — Event (nouveau poste) — court — plusieurs pensées, une seule pertinente + quiz
Ton demandé : **court**

**GPT-5 nano**
- Message : "Julien, félicitations pour la signature de ton contrat pour ton nouveau poste, le 19 septembre 2026."
- JSON valide : ✅ · Latence : 3197ms · Tokens in/out : 592/426 · Coût estimé : $0.000200
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=384, tokens visibles restants≈42
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Bravo pour la signature du contrat, Julien !"
- JSON valide : ✅ · Latence : 2808ms · Tokens in/out : 592/155 · Coût estimé : $0.000458
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=128, tokens visibles restants≈27
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 16 — Birthday dans 14 jours — chaleureux — wish exploitable, PAS à forcer, aucune pensée
Ton demandé : **chaleureux**

**GPT-5 nano**
- Message : "Isabelle, avec tout mon amour, je pense à toi pour ton anniversaire dans 14 jours. Je te souhaite une journée aussi belle et douce que le jardin que tu prends soin d'entretenir. Puissent les moments de cette journée t’apporter de la joie et de la sérénité. Si tu rêves de nouveaux outils de jardinage, j’espère que cela fera partie de tes envies et que cela t’apportera du plaisir dans tes projets."
- JSON valide : ✅ · Latence : 3890ms · Tokens in/out : 551/493 · Coût estimé : $0.000225
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=384, tokens visibles restants≈109
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Dans 14 jours c’est ton anniversaire et je voulais te dire à quel point tu comptes pour moi. J’aimerais qu’on le fête simplement, comme tu veux. Si tu as envie de quelque chose en particulier, dis-le moi — je me souviens que tu avais parlé de nouveaux outils de jardinage, si c’est toujours le cas je peux m’en occuper. Je t’embrasse très fort."
- JSON valide : ✅ · Latence : 4082ms · Tokens in/out : 551/294 · Coût estimé : $0.000726
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=192, tokens visibles restants≈102
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 17 — Event (naissance) — complice — pensées pertinentes riches
Ton demandé : **complice**

**GPT-5 nano**
- Message : "Amine, t’es officiellement papa d’un deuxième, félicitations ! J’imagine le stress avant l’accouchement, mais tout s’est bien passé au final, c’est top. Avec un petit garçon de 3 ans, tu dois être ravi d’avoir une fille cette fois. On fête ça quand tu veux, je passe dès que possible !"
- JSON valide : ✅ · Latence : 3356ms · Tokens in/out : 589/409 · Coût estimé : $0.000193
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=320, tokens visibles restants≈89
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Amine, félicitations pour l’arrivée de votre deuxième enfant ! Je suis vraiment soulagé que tout se soit bien passé après le stress avant l’accouchement. Et une petite fille cette fois — quelle nouvelle ! Dis à ton grand de 3 ans qu’il a désormais une mission officielle : prendre soin de la petite (et de son futur empire de jouets). Repose-toi bien tous les deux, et dis-moi quand vous êtes prêts à recevoir du monde ou juste une visite tranquille — j’apporte le café (et peut-être une paire de lunettes anti-buée pour les nuits)."
- JSON valide : ✅ · Latence : 5405ms · Tokens in/out : 589/459 · Coût estimé : $0.001065
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=320, tokens visibles restants≈139
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Cas 18 — Thinking of you — court — contexte permettant un message personnel SANS RIEN inventer
Ton demandé : **court**

**GPT-5 nano**
- Message : "Salut Bastien, ça va ? comment se passe ta préparation pour le semi-marathon du mois prochain ?"
- JSON valide : ✅ · Latence : 1926ms · Tokens in/out : 567/230 · Coût estimé : $0.000120
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=192, tokens visibles restants≈38
- Mentions interdites détectées : aucune

**GPT-5 mini**
- Message : "Salut Bastien, ça va ? Où en es-tu pour le semi le mois prochain ?"
- JSON valide : ✅ · Latence : 2264ms · Tokens in/out : 567/163 · Coût estimé : $0.000468
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=128, tokens visibles restants≈35
- Mentions interdites détectées : aucune

**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**
- Nano : 
- Mini : 

## Synthèse objective (JSON valide + mentions interdites uniquement — le reste est à juger manuellement ci-dessus)

| | JSON valide | Mentions interdites détectées | Latence moy. | Tokens in/out moy. | Coût moy./message |
|---|---|---|---|---|---|
| GPT-5 nano | 17/18 | 0/18 | 3688ms | 554/484 | $0.000221 |
| GPT-5 mini | 18/18 | 0/18 | 4393ms | 554/313 | $0.000765 |

Ce tableau ne couvre que ce qui est objectivement vérifiable (format JSON, mots interdits). Fidélité factuelle, naturel, respect du ton, pertinence de la personnalisation et capacité à ignorer l’inutile restent à juger sur les 18 paires ci-dessus.

## Diagnostic budget de sortie (max_completion_tokens=400, providers/llm/openai.ts)

| | Cas avec finish_reason="length" | reasoning_tokens moy. | reasoning_tokens max | tokens visibles moy. |
|---|---|---|---|---|
| GPT-5 nano | 1/18 | 418 | 1000 | 66 |
| GPT-5 mini | 0/18 | 249 | 704 | 64 |

Détail cas par cas des échecs `finish_reason="length"` :
- GPT-5 nano, cas 6 : reasoning_tokens=1000, tokens visibles restants≈0 (budget de raisonnement seul a consommé toute la limite, 0 token restait pour écrire le JSON).
- GPT-5 mini : aucun cas en `length`.