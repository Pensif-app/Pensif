# Benchmark de non-régression ciblé — durcissement complice (2026-09-17)

Modèle : `gpt-5-mini` (valeurs de production, sans override). Tous les cas `tone === 'complice'` du corpus (2, 5, 8, 10, 14, 17, 19, 20) — inclut les 2 cas réels 19/20 reproduisant les défauts observés sur iPhone, et tous les cas complice déjà validés précédemment (non-régression). Détection automatique de marqueurs connus (habitude inventée, intention/fête inventée) en complément du jugement manuel — une absence de marqueur ne prouve pas l'absence de toute invention, mais une présence confirme sans ambiguïté une régression connue.

## Cas 2 — Birthday dans 5 jours — complice — quiz riche, AUCUNE pensée

- Message : "Dans 5 jours, c’est ton anniversaire, Sofia. Alors, l’appareil photo instantané, il arrive quand ? J’imagine déjà les premières photos ratées... ou géniales, qui sait. Profite bien de ces derniers jours avant le jour J, et donne-moi de tes nouvelles."
- JSON valide : ✅ · Latence : 6870ms · Tokens in/out : 1385/590 · Coût estimé : $0.001526
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=512, tokens visibles≈78
- Marqueur habitude inventée ("toujours"/"comme d'habitude"/"fidèle au poste") : aucun
- Marqueur intention/fête inventée ("j'ai hâte de..."/"après la fête"...) : aucun
- Mentions interdites détectées : aucune

**À vérifier : pas de nouvelle régression introduite par COMPLICE_REINFORCEMENT sur un cas déjà validé.**
- Jugement manuel : 

## Cas 5 — Thinking of you — complice — pensées TOTALEMENT HORS SUJET (à ignorer)

- Message : "Paul, je pensais à toi. Alors, quoi de neuf ? Ça va ? Donne-moi des nouvelles quand tu veux, et ne me fais pas trop attendre."
- JSON valide : ✅ · Latence : 6369ms · Tokens in/out : 1390/562 · Coût estimé : $0.001471
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=512, tokens visibles≈50
- Marqueur habitude inventée ("toujours"/"comme d'habitude"/"fidèle au poste") : aucun
- Marqueur intention/fête inventée ("j'ai hâte de..."/"après la fête"...) : aucun
- Mentions interdites détectées : aucune

**À vérifier : pas de nouvelle régression introduite par COMPLICE_REINFORCEMENT sur un cas déjà validé.**
- Jugement manuel : 

## Cas 8 — Event (entretien) — complice — personnalisation possible sans invention

- Message : "Jean-Luc, le 22 septembre c’est le jour du permis. Je sais que tu l’as déjà tenté une fois et que tu es un peu nerveux, alors je te taquine un peu: montre-leur qui commande. Respire, reste concentré, et donne-moi des nouvelles après."
- JSON valide : ✅ · Latence : 7004ms · Tokens in/out : 1406/718 · Coût estimé : $0.001788
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=640, tokens visibles≈78
- Marqueur habitude inventée ("toujours"/"comme d'habitude"/"fidèle au poste") : aucun
- Marqueur intention/fête inventée ("j'ai hâte de..."/"après la fête"...) : aucun
- Mentions interdites détectées : aucune

**À vérifier : pas de nouvelle régression introduite par COMPLICE_REINFORCEMENT sur un cas déjà validé.**
- Jugement manuel : 

## Cas 10 — Birthday jour J — complice — contexte pauvre (prénom + genre null)

- Message : "Joyeux anniversaire Camille ! Profite bien de ta journée, fais-toi plaisir. Ne fais pas trop de bêtises (ou au moins prends des photos), et raconte-moi comment c'était."
- JSON valide : ✅ · Latence : 4230ms · Tokens in/out : 1329/442 · Coût estimé : $0.001216
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=384, tokens visibles≈58
- Marqueur habitude inventée ("toujours"/"comme d'habitude"/"fidèle au poste") : aucun
- Marqueur intention/fête inventée ("j'ai hâte de..."/"après la fête"...) : aucun
- Mentions interdites détectées : aucune

**À vérifier : pas de nouvelle régression introduite par COMPLICE_REINFORCEMENT sur un cas déjà validé.**
- Jugement manuel : 

## Cas 14 — Thinking of you — complice — contexte TRÈS PAUVRE

- Message : "Salut Marc, juste un petit message pour te dire que je pense à toi. Raconte-moi ce que tu deviens quand tu as un moment, je veux des nouvelles, fais pas le mystérieux."
- JSON valide : ✅ · Latence : 4328ms · Tokens in/out : 1341/379 · Coût estimé : $0.001093
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=320, tokens visibles≈59
- Marqueur habitude inventée ("toujours"/"comme d'habitude"/"fidèle au poste") : aucun
- Marqueur intention/fête inventée ("j'ai hâte de..."/"après la fête"...) : aucun
- Mentions interdites détectées : aucune

**À vérifier : pas de nouvelle régression introduite par COMPLICE_REINFORCEMENT sur un cas déjà validé.**
- Jugement manuel : 

## Cas 17 — Event (naissance) — complice — pensées pertinentes riches

- Message : "Amine, félicitations pour la naissance de ta fille et pour ce deuxième enfant ! Je sais que tu étais super stressé avant l’accouchement, mais tout s’est bien passé finalement, bravo à toi. Profite de ces premiers moments avec ton petit garçon de 3 ans et ta nouvelle arrivée, donne-moi des nouvelles quand tu veux."
- JSON valide : ✅ · Latence : 4694ms · Tokens in/out : 1426/409 · Coût estimé : $0.001174
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=320, tokens visibles≈89
- Marqueur habitude inventée ("toujours"/"comme d'habitude"/"fidèle au poste") : aucun
- Marqueur intention/fête inventée ("j'ai hâte de..."/"après la fête"...) : aucun
- Mentions interdites détectées : aucune

**À vérifier : pas de nouvelle régression introduite par COMPLICE_REINFORCEMENT sur un cas déjà validé.**
- Jugement manuel : 

## Cas 19 — Birthday demain — complice — RÉGRESSION RÉELLE (café sans sucre forcé, "après la fête" inventé)

- Message : "Demain c’est ton anniversaire, Lucas. Passe une super journée. Si quelqu’un te demande ce que tu veux, réponds « un appareil photo » ; et n’oublie pas le sucre pour ton café. Profite bien et donne-moi de tes nouvelles."
- JSON valide : ✅ · Latence : 5551ms · Tokens in/out : 1415/518 · Coût estimé : $0.001390
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=448, tokens visibles≈70
- Marqueur habitude inventée ("toujours"/"comme d'habitude"/"fidèle au poste") : aucun
- Marqueur intention/fête inventée ("j'ai hâte de..."/"après la fête"...) : aucun
- Mentions interdites détectées : aucune

**À vérifier en priorité (cas réel) : "café sans sucre" peut être totalement ignoré, aucune fête/intention inventée, naturel et réellement complice.**
- Jugement manuel : 

## Cas 20 — Thinking of you — complice — RÉGRESSION RÉELLE ("j'ai hâte de voir tes photos"/"toujours fidèle au poste" inventés)

- Message : "Salut Lucas, je pense à toi. Ton vernissage samedi me revient en tête. N’oublie pas ton sucre pour le café. Et pour l’appareil photo, tu as trouvé quelque chose ou tu cherches toujours ? Donne-moi des nouvelles."
- JSON valide : ✅ · Latence : 7602ms · Tokens in/out : 1438/644 · Coût estimé : $0.001648
- Diagnostic budget : finish_reason=`stop`, reasoning_tokens=576, tokens visibles≈68
- Marqueur habitude inventée ("toujours"/"comme d'habitude"/"fidèle au poste") : ⚠️ toujours
- Marqueur intention/fête inventée ("j'ai hâte de..."/"après la fête"...) : aucun
- Mentions interdites détectées : aucune

**À vérifier en priorité (cas réel) : "café sans sucre" peut être totalement ignoré, aucune fête/intention inventée, naturel et réellement complice.**
- Jugement manuel : 

## Synthèse

- JSON valides : 8/8
- Cas ayant atteint la limite de 1200 : 0/8
- Cas avec marqueur d'habitude inventée détecté automatiquement : 1/8
- Cas avec marqueur d'intention/fête inventée détecté automatiquement : 0/8
- Jugement qualitatif complet (naturel, complicité réelle par le style) à faire sur les blocs ci-dessus, en particulier 19 et 20.