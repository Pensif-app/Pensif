// Phase 3 — génère catalog-coverage-backlog.json à partir de l'audit réel du catalogue.
// Objectif : transformer les trous mesurés par audit-catalog.js en une liste priorisée et
// exploitable (P0-P4), pour piloter l'enrichissement du catalogue au lieu d'ajouter des produits
// au hasard. Ne modifie jamais le catalogue — lecture seule.
//
// Phase 3A : chaque combinaison est d'abord vérifiée contre les `when` de themeQuizzes.ts — une
// combinaison structurellement non pertinente (ex. gaming fandom × equipmentLevel) n'entre jamais
// dans le backlog, elle n'est pas un trou catalogue.
//
// Usage : node scripts/generate-coverage-backlog.js [--top=20]

const fs = require('fs');
const path = require('path');
const { parseCatalog, budgetBucket, criteriaOf, combosOfSize, groupByTheme, splitDim, conceptDiversity, BUDGET_BUCKETS } = require('./audit-catalog');
const { parseWhenMap, isApplicablePair, parseQuestionOptions } = require('./theme-quiz-parser');

const OUTPUT_PATH = path.join(__dirname, '..', 'catalog-coverage-backlog.json');
const topArg = process.argv.find((a) => a.startsWith('--top='));
const TOP_N = topArg ? Number(topArg.split('=')[1]) : 20;

// Seuils Phase 3 (section 3 du brief).
const COMBO2_TARGET = 5; // >= 5 produits sur une combinaison à 2 critères = ✅
const BUDGET_TARGET = 2; // au moins 2 produits par tranche de budget sur une branche bien couverte
const MIN_CONCEPTS = 3; // une branche bien couverte en nombre doit avoir au moins 3 idées distinctes

// Une valeur de dimension n'est considérée "importante" (donc digne d'entrer dans le backlog en
// croisement) que si elle a déjà au moins 2 produits — évite de faire remonter du bruit sur des
// valeurs quasi jamais utilisées dans le catalogue actuel.
const MIN_IMPORTANCE = 2;

function priorityFor(count) {
  if (count === 0) return 'P0';
  if (count === 1) return 'P1';
  if (count === 2) return 'P2';
  return null; // >= 3, déjà correct pour ce seuil
}

function parseCombo(key) {
  // "dimA=valA + dimB=valB" -> { dimA: valA, dimB: valB }
  const criteria = {};
  for (const part of key.split(' + ')) {
    const [dim, val] = part.split('=');
    criteria[dim] = val;
  }
  return criteria;
}

function buildBacklog() {
  const products = parseCatalog();
  const byTheme = groupByTheme(products);
  const whenMap = parseWhenMap();
  const questionOptions = parseQuestionOptions();
  const entries = [];
  let totalNa = 0;

  for (const [theme, themeProducts] of Object.entries(byTheme)) {
    const criteriaLists = themeProducts.map(criteriaOf);
    const depth1 = combosOfSize(criteriaLists, 1);
    const depth2 = combosOfSize(criteriaLists, 2);

    // --- Niveau A / VALUE : une option du quiz réellement proposée (coverageRequired) sans AUCUN
    // produit — plus grave qu'une combinaison faible, voir diagnostic LOT 2. 'autre' (et toute
    // option marquée coverageRequired: false) est une case ouverte/fallback : jamais un trou.
    for (const q of questionOptions[theme] || []) {
      for (const opt of q.options) {
        if (!opt.coverageRequired) continue;
        const key = `${q.id}=${opt.key}`;
        const count = depth1[key] || 0;
        if (count > 0) continue;
        entries.push({
          theme,
          level: 'value',
          criteria: { [q.id]: opt.key },
          budget: null,
          currentCount: 0,
          targetCount: 1,
          missing: 1,
          priority: 'P0',
          reason: `valeur de quiz réellement proposée, 0 produit ne la couvre (question "${q.id}")`,
        });
      }
    }

    const importantValues = Object.entries(depth1)
      .filter(([, count]) => count >= MIN_IMPORTANCE)
      .map(([key]) => key);

    // --- P0/P1/P2 : combinaisons à 2 critères importantes, applicables, sous le seuil cible ---
    for (let i = 0; i < importantValues.length; i++) {
      for (let j = i + 1; j < importantValues.length; j++) {
        const [dimA, valA] = splitDim(importantValues[i]);
        const [dimB, valB] = splitDim(importantValues[j]);
        if (dimA === dimB) continue;
        if (!isApplicablePair(whenMap, theme, dimA, valA, dimB, valB)) {
          totalNa++;
          continue; // combinaison non pertinente — pas un trou catalogue
        }
        const key = [importantValues[i], importantValues[j]].sort().join(' + ');
        const count = depth2[key] || 0;
        if (count >= COMBO2_TARGET) continue;
        const priority = priorityFor(count) ?? 'P2';
        entries.push({
          theme,
          level: 'combo',
          criteria: parseCombo(key),
          budget: null,
          currentCount: count,
          targetCount: COMBO2_TARGET,
          missing: COMBO2_TARGET - count,
          priority,
          reason: count === 0 ? 'combinaison importante, 0 produit' : `combinaison importante, seulement ${count} produit(s)`,
        });
      }
    }

    // --- P3 : branches bien couvertes globalement mais trou de budget ---
    for (const [key, count] of Object.entries(depth1)) {
      if (count < COMBO2_TARGET) continue; // pas "bien couverte" au sens Phase 3
      const matching = themeProducts.filter((p) => criteriaOf(p).includes(key));
      for (const bucket of BUDGET_BUCKETS) {
        const bucketCount = matching.filter((p) => budgetBucket(p.price) === bucket).length;
        if (bucketCount >= BUDGET_TARGET) continue;
        entries.push({
          theme,
          level: 'combo',
          criteria: parseCombo(key),
          budget: bucket,
          currentCount: bucketCount,
          targetCount: BUDGET_TARGET,
          missing: BUDGET_TARGET - bucketCount,
          priority: 'P3',
          reason: bucketCount === 0 ? `branche bien couverte mais 0 produit en ${bucket}` : `branche bien couverte mais seulement ${bucketCount} produit en ${bucket}`,
        });
      }
    }

    // --- P4 : diversité de concepts insuffisante malgré un bon volume de produits ---
    for (const [key, count] of Object.entries(depth1)) {
      if (count < COMBO2_TARGET) continue; // en dessous du seuil, c'est déjà couvert par P0-P2
      const { conceptCount } = conceptDiversity(themeProducts, key);
      if (conceptCount === 0) continue; // giftConcept pas encore renseigné sur ce chemin, rien à mesurer
      if (conceptCount >= MIN_CONCEPTS) continue;
      entries.push({
        theme,
        level: 'combo',
        criteria: parseCombo(key),
        budget: null,
        currentCount: count,
        targetCount: MIN_CONCEPTS,
        missing: MIN_CONCEPTS - conceptCount,
        priority: 'P4',
        reason: `${count} produits mais seulement ${conceptCount} idée(s) cadeau distincte(s) (giftConcept) — faux catalogue riche`,
      });
    }
  }

  // Tri : Niveau A (value) toujours avant Niveau B (combo) — une valeur de quiz jamais couverte
  // est plus grave qu'une combinaison faible — puis priorité (P0 > P1 > P2 > P3 > P4), puis par
  // nombre de produits manquants décroissant.
  const levelOrder = { value: 0, combo: 1 };
  const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
  entries.sort(
    (a, b) => levelOrder[a.level] - levelOrder[b.level] || priorityOrder[a.priority] - priorityOrder[b.priority] || b.missing - a.missing
  );

  return { entries, totalNa };
}

function main() {
  const { entries, totalNa } = buildBacklog();
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf8');

  const valueCount = entries.filter((e) => e.level === 'value').length;
  const counts = entries.reduce((acc, e) => {
    acc[e.priority] = (acc[e.priority] || 0) + 1;
    return acc;
  }, {});
  console.log(`Backlog généré : ${entries.length} entrées → ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`  Niveau A (valeur de quiz sans produit) : ${valueCount}`);
  console.log(`  Niveau B (combinaisons) — P0: ${counts.P0 - valueCount || 0}  P1: ${counts.P1 || 0}  P2: ${counts.P2 || 0}  P3: ${counts.P3 || 0}  P4: ${counts.P4 || 0}`);
  console.log(`  Combinaisons N/A écartées avant même d'entrer dans le backlog : ${totalNa}`);
  console.log(`\nTop ${TOP_N} trous (niveau A d'abord, puis priorité, puis nombre manquant) :\n`);

  for (const e of entries.slice(0, TOP_N)) {
    const criteriaStr = Object.entries(e.criteria).map(([k, v]) => `${k}=${v}`).join(', ');
    const budgetStr = e.budget ? `, budget=${e.budget}` : '';
    console.log(`  [${e.level === 'value' ? 'VALUE' : e.priority}] ${e.theme} → ${criteriaStr}${budgetStr} — ${e.currentCount}/${e.targetCount} (manque ${e.missing}) — ${e.reason}`);
  }
}

main();
