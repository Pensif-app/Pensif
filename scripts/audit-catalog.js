// Audit de couverture du catalogue de cadeaux (src/data/giftCatalog.ts).
// Script Node autonome (pas de ts-node) : parse le fichier ligne par ligne avec des regex, comme
// les scripts d'insertion déjà utilisés pour peupler imageUrl/pitch. Objectif : dire précisément
// où le catalogue est trop maigre (par thème, par valeur de dimension, par combinaison, par
// tranche de budget) AVANT de faire grossir le catalogue à l'aveugle — voir le plan de refonte
// "moteur de réduction progressive" (phases 1, 2 et 3).
//
// Usage : node scripts/audit-catalog.js [theme]

const fs = require('fs');
const path = require('path');
const { parseWhenMap, isApplicablePair, parseQuestionOptions } = require('./theme-quiz-parser');

const CATALOG_PATH = path.join(__dirname, '..', 'src', 'data', 'giftCatalog.ts');
const onlyTheme = process.argv[2];

// Seuils Phase 3 (validés) — 4 paliers plutôt que 3, par granularité de combinaison.
const THRESHOLDS = {
  value: { good: 8, ok: 4 }, // >=8 ✅, 4-7 🟡, 1-3 ⚠️, 0 ❌
  combo2: { good: 5, ok: 3 }, // >=5 ✅, 3-4 🟡, 1-2 ⚠️, 0 ❌
  combo3: { good: 3, ok: 2 }, // >=3 ✅, 2 🟡, 1 ⚠️, 0 ❌
  budget: { good: 2, ok: 1 }, // >=2 ✅, 1 🟡 (ok fusionné avec good ici, pas de palier séparé), 0 ❌
};

function flag(count, thresholds) {
  if (count >= thresholds.good) return '✅';
  if (count >= thresholds.ok) return '🟡';
  if (count > 0) return '⚠️';
  return '❌';
}

const BUDGET_BUCKETS = ['<20€', '20-50€', '50-100€', '100€+'];

function extractField(line, field) {
  // Champs simples entre quotes : id, theme, tier, title, asin, emoji, trait, giftConcept
  const m = line.match(new RegExp(`${field}: '([^']*)'`));
  return m ? m[1] : undefined;
}

function extractNumber(line, field) {
  const m = line.match(new RegExp(`${field}: (\\d+(?:\\.\\d+)?)`));
  return m ? Number(m[1]) : undefined;
}

function extractStringArray(line, field) {
  // ex. tags: ['setup', 'fandom']
  const m = line.match(new RegExp(`${field}: \\[([^\\]]*)\\]`));
  if (!m) return undefined;
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

function extractObjectBlock(line, field) {
  // ex. taxonomy: { primaryUse: ['setup'], equipmentLevel: ['intermediaire','avance'] }
  // Trouve l'accolade ouvrante du champ puis capture jusqu'à sa fermeture correspondante (pas de
  // nesting profond dans ce fichier, donc un simple compteur d'accolades suffit).
  const start = line.indexOf(`${field}: {`);
  if (start === -1) return undefined;
  let i = line.indexOf('{', start);
  let depth = 0;
  let end = i;
  for (; i < line.length; i++) {
    if (line[i] === '{') depth++;
    if (line[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const block = line.slice(line.indexOf('{', start), end + 1);
  const result = {};
  const dimRe = /(\w+): \[([^\]]*)\]/g;
  let dm;
  while ((dm = dimRe.exec(block))) {
    result[dm[1]] = dm[2]
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);
  }
  return result;
}

function parseCatalog() {
  const src = fs.readFileSync(CATALOG_PATH, 'utf8');
  const lines = src.split('\n').filter((l) => /^\s*\{ id: '/.test(l));
  return lines.map((line) => ({
    id: extractField(line, 'id'),
    theme: extractField(line, 'theme'),
    price: extractNumber(line, 'price'),
    trait: extractField(line, 'trait'),
    tags: extractStringArray(line, 'tags'),
    taxonomy: extractObjectBlock(line, 'taxonomy'),
    hardRequirements: extractObjectBlock(line, 'hardRequirements'),
    hardExclusions: extractObjectBlock(line, 'hardExclusions'),
    giftConcept: extractField(line, 'giftConcept'),
  }));
}

function budgetBucket(price) {
  if (price < 20) return '<20€';
  if (price < 50) return '20-50€';
  if (price < 100) return '50-100€';
  return '100€+';
}

/** Toutes les paires dimension=valeur portées par un produit. `tags` est ignoré dès qu'une vraie
 *  `taxonomy` existe : sur les thèmes migrés, tags ne fait que dupliquer les mêmes valeurs (ex.
 *  gaming : tags=['setup'] ET taxonomy.focus=['setup']) — les compter comme deux dimensions
 *  distinctes créerait des combinaisons fantômes. */
function criteriaOf(product) {
  if (product.taxonomy) {
    return Object.entries(product.taxonomy).flatMap(([dim, vs]) => vs.map((v) => `${dim}=${v}`));
  }
  return product.tags ? product.tags.map((t) => `tags=${t}`) : [];
}

function combosOfSize(criteriaLists, size) {
  const counts = {};
  for (const criteria of criteriaLists) {
    if (criteria.length < size) continue;
    const combos = kCombinations(criteria, size);
    for (const combo of combos) {
      const key = combo.slice().sort().join(' + ');
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

function kCombinations(arr, k) {
  if (k === 1) return arr.map((x) => [x]);
  const result = [];
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of kCombinations(arr.slice(i + 1), k - 1)) {
      result.push([arr[i], ...rest]);
    }
  }
  return result;
}

function splitDim(criterionKey) {
  const idx = criterionKey.indexOf('=');
  return [criterionKey.slice(0, idx), criterionKey.slice(idx + 1)];
}

/** Nombre de giftConcept DISTINCTS parmi les produits portant ce critère — un chemin avec beaucoup
 *  de produits mais un seul concept (ex. 5 souris différentes) est un faux catalogue riche. */
function conceptDiversity(products, key) {
  const matching = products.filter((p) => criteriaOf(p).includes(key));
  const concepts = new Set(matching.map((p) => p.giftConcept).filter(Boolean));
  const withoutConcept = matching.some((p) => !p.giftConcept);
  return { productCount: matching.length, conceptCount: concepts.size, hasUnannotated: withoutConcept };
}

/**
 * Audite un thème et renvoie ses stats de "chemins morts" — uniquement les combinaisons
 * APPLICABLES (voir theme-quiz-parser.js : les combinaisons structurellement non pertinentes,
 * comme "fandom × equipmentLevel" en gaming, sont exclues du calcul, marquées "N/A" à la place).
 */
function auditTheme(theme, products, whenMap, questionOptions) {
  console.log(`\n=== ${theme} (${products.length} produits) ===`);

  const criteriaListsForValues = products.map(criteriaOf);
  const depth1ForValues = combosOfSize(criteriaListsForValues, 1);
  const themeQuestions = questionOptions[theme] || [];
  let valueGapsRequired = 0;
  let valueGapsChecked = 0;
  if (themeQuestions.length > 0) {
    console.log('  Niveau A — Couverture de valeur (par rapport aux options réelles du quiz) :');
    for (const q of themeQuestions) {
      for (const opt of q.options) {
        const key = `${q.id}=${opt.key}`;
        const count = depth1ForValues[key] || 0;
        if (!opt.coverageRequired) {
          console.log(`    — ${key} : ${count} (OPEN/FALLBACK, non compté)`);
          continue;
        }
        valueGapsChecked++;
        if (count === 0) valueGapsRequired++;
        console.log(`    ${flag(count, THRESHOLDS.value)} ${key} : ${count}`);
      }
    }
  }

  // --- Répartition par tranche de budget (globale) ---
  const budgetCounts = Object.fromEntries(BUDGET_BUCKETS.map((b) => [b, 0]));
  for (const p of products) budgetCounts[budgetBucket(p.price)]++;
  console.log('  Budget (tous produits) :');
  for (const b of BUDGET_BUCKETS) {
    console.log(`    ${flag(budgetCounts[b], THRESHOLDS.budget)} ${b}: ${budgetCounts[b]}`);
  }

  const criteriaLists = products.map(criteriaOf);

  // --- Profondeur 1 : une valeur de dimension (+ diversité de concepts) ---
  const depth1 = combosOfSize(criteriaLists, 1);
  const depth1Entries = Object.entries(depth1);
  if (depth1Entries.length === 0) {
    console.log('  Profondeur 1 : (aucune taxonomy/tags — thème pas encore migré ou catalogue vide)');
  } else {
    console.log('  Profondeur 1 (par valeur) :');
    for (const [key, count] of depth1Entries.sort((a, b) => b[1] - a[1])) {
      const { conceptCount, hasUnannotated } = conceptDiversity(products, key);
      const conceptStr = hasUnannotated && conceptCount === 0 ? '' : `  — concepts: ${conceptCount}${conceptCount > 0 && conceptCount < 3 ? ' ⚠️' : ''}`;
      console.log(`    ${flag(count, THRESHOLDS.value)} ${key} : ${count}${conceptStr}`);
    }
  }

  // --- Profondeur 2 : combinaisons à 2 critères (N/A exclu) ---
  const depth2 = combosOfSize(criteriaLists, 2);
  const depth2Entries = Object.entries(depth2);
  if (depth2Entries.length > 0) {
    console.log('  Profondeur 2 (2 critères) :');
    for (const [key, count] of depth2Entries.sort((a, b) => b[1] - a[1])) {
      console.log(`    ${flag(count, THRESHOLDS.combo2)} ${key} : ${count}`);
    }
  }

  // --- Profondeur 3 : combinaisons à 3 critères ---
  const depth3 = combosOfSize(criteriaLists, 3);
  const depth3Entries = Object.entries(depth3);
  if (depth3Entries.length > 0) {
    console.log('  Profondeur 3 (3 critères) :');
    for (const [key, count] of depth3Entries.sort((a, b) => b[1] - a[1])) {
      console.log(`    ${flag(count, THRESHOLDS.combo3)} ${key} : ${count}`);
    }
  }

  // --- Chemins morts / N/A : paires de valeurs qui existent chacune individuellement (>=1 produit)
  // mais dont le croisement ne donne AUCUN produit. Une paire structurellement non pertinente (voir
  // `when` dans themeQuizzes.ts, ex. fandom × equipmentLevel) est classée N/A et EXCLUE du taux —
  // ce n'est pas un trou catalogue, c'est une dimension qui ne s'applique pas à cette branche.
  const depth1Keys = Object.keys(depth1);
  let deadPaths = 0;
  let checkedPaths = 0;
  let naPaths = 0;
  const deadPathList = [];
  const naPathList = [];
  for (let i = 0; i < depth1Keys.length; i++) {
    for (let j = i + 1; j < depth1Keys.length; j++) {
      const [dimA, valA] = splitDim(depth1Keys[i]);
      const [dimB, valB] = splitDim(depth1Keys[j]);
      if (dimA === dimB) continue; // deux valeurs de la MÊME dimension ne se combinent jamais sur un produit
      const key = [depth1Keys[i], depth1Keys[j]].sort().join(' + ');
      if (!isApplicablePair(whenMap, theme, dimA, valA, dimB, valB)) {
        naPaths++;
        naPathList.push(key);
        continue; // N/A : ne compte ni dans checkedPaths ni dans deadPaths
      }
      checkedPaths++;
      if (!depth2[key]) {
        deadPaths++;
        deadPathList.push(key);
      }
    }
  }
  if (naPaths > 0) {
    console.log(`  Combinaisons N/A (non applicables, exclues du taux) : ${naPaths}`);
    for (const key of naPathList.slice(0, 10)) console.log(`    — ${key} : N/A`);
    if (naPathList.length > 10) console.log(`    … et ${naPathList.length - 10} autres`);
  }
  if (checkedPaths > 0) {
    const rate = Math.round((deadPaths / checkedPaths) * 100);
    console.log(`  Chemins morts (combinaisons applicables mais 0 produit) : ${deadPaths}/${checkedPaths} (${rate}%)`);
    if (deadPathList.length > 0 && deadPathList.length <= 20) {
      for (const key of deadPathList) console.log(`    ❌ ${key} : 0`);
    } else if (deadPathList.length > 20) {
      for (const key of deadPathList.slice(0, 20)) console.log(`    ❌ ${key} : 0`);
      console.log(`    … et ${deadPathList.length - 20} autres combinaisons à 0 produit`);
    }
  }

  // --- Budget après filtrage : pour chaque valeur de profondeur 1, répartition par tranche ---
  if (depth1Entries.length > 0) {
    console.log('  Budget après filtrage (par valeur) :');
    for (const [key] of depth1Entries.sort((a, b) => b[1] - a[1])) {
      const matching = products.filter((p) => criteriaOf(p).includes(key));
      const counts = BUDGET_BUCKETS.map((b) => matching.filter((p) => budgetBucket(p.price) === b).length);
      const summary = BUDGET_BUCKETS.map((b, idx) => `${flag(counts[idx], THRESHOLDS.budget)}${b}:${counts[idx]}`).join('  ');
      console.log(`    ${key} → ${summary}`);
    }
  }

  // --- Filtres durs déclarés ---
  const hardCount = products.filter((p) => p.hardRequirements || p.hardExclusions).length;
  if (hardCount > 0) {
    console.log(`  Filtres durs déclarés sur ${hardCount}/${products.length} produits.`);
  }

  return { deadPaths, checkedPaths, naPaths, valueGapsRequired, valueGapsChecked };
}

function groupByTheme(products) {
  const byTheme = {};
  for (const p of products) {
    if (!p.theme) continue;
    byTheme[p.theme] = byTheme[p.theme] || [];
    byTheme[p.theme].push(p);
  }
  return byTheme;
}

function main() {
  const products = parseCatalog();
  const byTheme = groupByTheme(products);
  const whenMap = parseWhenMap();
  const questionOptions = parseQuestionOptions();

  const themes = onlyTheme ? [onlyTheme] : Object.keys(byTheme).sort();
  console.log(`Audit de couverture — ${products.length} produits au total, ${Object.keys(byTheme).length} thèmes couverts.`);
  console.log(
    `Seuils : valeur ✅>=${THRESHOLDS.value.good} 🟡>=${THRESHOLDS.value.ok} ⚠️>0 ❌0 · combo2 ✅>=${THRESHOLDS.combo2.good} 🟡>=${THRESHOLDS.combo2.ok} · combo3 ✅>=${THRESHOLDS.combo3.good} 🟡>=${THRESHOLDS.combo3.ok} · budget ✅>=${THRESHOLDS.budget.good} 🟡>=${THRESHOLDS.budget.ok}`
  );

  let totalDeadPaths = 0;
  let totalCheckedPaths = 0;
  let totalNaPaths = 0;
  let totalValueGapsRequired = 0;
  let totalValueGapsChecked = 0;

  for (const theme of themes) {
    const themeProducts = byTheme[theme];
    if (!themeProducts) {
      console.log(`\n=== ${theme} (0 produit) ===\n  ❌ Aucun produit pour ce thème.`);
      continue;
    }
    const { deadPaths, checkedPaths, naPaths, valueGapsRequired, valueGapsChecked } = auditTheme(theme, themeProducts, whenMap, questionOptions);
    totalDeadPaths += deadPaths;
    totalCheckedPaths += checkedPaths;
    totalNaPaths += naPaths;
    totalValueGapsRequired += valueGapsRequired;
    totalValueGapsChecked += valueGapsChecked;
  }

  if (totalCheckedPaths > 0) {
    const globalRate = Math.round((totalDeadPaths / totalCheckedPaths) * 100);
    console.log(`\n=== Global ===`);
    console.log(
      `Niveau A — valeurs de quiz sans AUCUN produit (hors OPEN/FALLBACK) : ${totalValueGapsRequired}/${totalValueGapsChecked}`
    );
    console.log(`Taux global de chemins morts — combinaisons (N/A exclues) : ${totalDeadPaths}/${totalCheckedPaths} (${globalRate}%)`);
    console.log(`Combinaisons N/A exclues du calcul : ${totalNaPaths}`);
  }
}

module.exports = {
  CATALOG_PATH,
  BUDGET_BUCKETS,
  THRESHOLDS,
  parseCatalog,
  budgetBucket,
  criteriaOf,
  combosOfSize,
  kCombinations,
  groupByTheme,
  splitDim,
  conceptDiversity,
};

if (require.main === module) {
  main();
}
