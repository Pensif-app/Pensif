// Test d'intégrité taxonomique — permanent, à lancer avant tout enrichissement de catalogue et
// idéalement en CI. Objectif : détecter mécaniquement la classe de bug trouvée deux fois à la main
// (gaming puis musique) — une taxonomy dont les clés ne correspondent pas exactement aux ids de
// question de themeQuizzes.ts, ce qui rend une dimension entière du quiz inerte pour le scoring
// sans que rien ne le signale visuellement dans le code. Deux niveaux (Phase 3, LOT 4) :
//   ERROR   — le catalogue ment ou casse le scoring (clé/valeur inconnue, mismatch de nommage).
//   WARNING — le catalogue est cohérent mais une dimension n'apporte probablement rien de concret
//             (jamais annotée, quasi-doublon entre valeurs, giftConcept manquant).
//
// Usage : node scripts/check-taxonomy-integrity.js [theme]
// Exit code 1 si au moins une ERROR est trouvée (utilisable en pre-commit/CI). Les WARNING
// n'affectent jamais le code de sortie — elles sont là pour guider le jugement humain, pas pour
// bloquer un merge.

const { parseCatalog, criteriaOf, groupByTheme } = require('./audit-catalog');
const { parseQuestionOptions } = require('./theme-quiz-parser');

const onlyTheme = process.argv[2];

/** Similarité de Jaccard entre deux Set — 1 = mêmes produits exactement, 0 = aucun produit commun. */
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

function main() {
  const products = parseCatalog();
  const byTheme = groupByTheme(products);
  const questionOptions = parseQuestionOptions();

  const themes = onlyTheme ? [onlyTheme] : Object.keys(questionOptions).sort();

  let unknownKeys = 0;
  let unknownValues = 0;
  let namingMismatches = 0;
  let invalidHardRequirements = 0;

  let uncoveredDimensions = 0;
  let uncoveredValues = 0;
  let lowDiscrimination = 0;
  let noDiscrimination = 0;
  let missingConcepts = 0;

  console.log('TAXONOMY INTEGRITY\n');

  for (const theme of themes) {
    const questions = questionOptions[theme] || [];
    const themeProducts = byTheme[theme] || [];
    if (questions.length === 0) continue;

    const questionOptionSets = new Map();
    for (const q of questions) {
      questionOptionSets.set(q.id, new Set(q.options.map((o) => o.key)));
    }
    const coverageRequired = new Map();
    for (const q of questions) {
      for (const o of q.options) coverageRequired.set(`${q.id}=${o.key}`, o.coverageRequired);
    }

    // clé utilisée dans le catalogue (taxonomy OU hardRequirements/hardExclusions) -> Set des
    // valeurs réellement vues. Un filtre dur compte comme "la dimension influence le scoring" au
    // même titre qu'un tag souple.
    const usedKeys = new Map();
    // clé=valeur -> Set des ids produits qui la portent (pour le calcul de discrimination).
    const productsByValue = new Map();
    for (const p of themeProducts) {
      const sources = [p.taxonomy, p.hardRequirements, p.hardExclusions].filter(Boolean);
      for (const source of sources) {
        for (const [key, values] of Object.entries(source)) {
          if (!usedKeys.has(key)) usedKeys.set(key, new Set());
          for (const v of values) {
            usedKeys.get(key).add(v);
            const vk = `${key}=${v}`;
            if (!productsByValue.has(vk)) productsByValue.set(vk, new Set());
            productsByValue.get(vk).add(p.id);
          }
        }
      }
    }

    const errorLines = [];
    const warningLines = [];
    const statusLines = [];

    // === ERROR : clé/valeur/nommage ===
    for (const [qid, optionSet] of questionOptionSets) {
      if (!usedKeys.has(qid)) {
        let mismatchKey = null;
        for (const [usedKey, usedValues] of usedKeys) {
          if (questionOptionSets.has(usedKey)) continue;
          const overlap = [...usedValues].filter((v) => optionSet.has(v));
          if (overlap.length > 0 && overlap.length === usedValues.size) {
            mismatchKey = usedKey;
            break;
          }
        }
        if (mismatchKey) {
          namingMismatches++;
          errorLines.push(`  ❌ TAXONOMY KEY MISMATCH\n     Quiz question id: "${qid}"\n     Catalogue utilise: taxonomy.${mismatchKey} = [${[...usedKeys.get(mismatchKey)].join(', ')}]\n     Expected: ${qid}\n     Found: ${mismatchKey}`);
          statusLines.push(`  ${theme}.${qid.padEnd(20)} ❌ MISMATCH (voir taxonomy.${mismatchKey})`);
        } else {
          uncoveredDimensions++;
          warningLines.push(`  ⚠️  ${theme}.${qid} — dimension jamais utilisée (0 produit ne porte cette clé)`);
          statusLines.push(`  ${theme}.${qid.padEnd(20)} ⚠️  jamais utilisée`);
        }
        continue;
      }

      const usedValues = usedKeys.get(qid);
      const unknown = [...usedValues].filter((v) => !optionSet.has(v));
      if (unknown.length > 0) {
        unknownValues += unknown.length;
        errorLines.push(`  ❌ UNKNOWN TAXONOMY VALUE(S) sur ${theme}.${qid} : ${unknown.join(', ')} (absentes des options du quiz)`);
        statusLines.push(`  ${theme}.${qid.padEnd(20)} ❌ valeur(s) inconnue(s): ${unknown.join(', ')}`);
      } else {
        statusLines.push(`  ${theme}.${qid.padEnd(20)} OK`);
      }

      // WARNING : options coverageRequired=true jamais vues, dans une dimension par ailleurs active.
      for (const opt of optionSet) {
        const key = `${qid}=${opt}`;
        if (coverageRequired.get(key) === false) continue; // OPEN/FALLBACK
        if (!usedValues.has(opt)) {
          uncoveredValues++;
          warningLines.push(`  ⚠️  ${key} — 0 produit (option coverageRequired=true)`);
        }
      }

      // WARNING : discrimination — les valeurs de cette dimension pointent-elles vers des pools
      // de produits vraiment différents, ou quasi les mêmes (la réponse ne changerait presque
      // rien au classement) ?
      const valuesWithProducts = [...optionSet].filter((v) => productsByValue.has(`${qid}=${v}`) && productsByValue.get(`${qid}=${v}`).size > 0);
      if (valuesWithProducts.length >= 2) {
        const sets = valuesWithProducts.map((v) => productsByValue.get(`${qid}=${v}`));
        let sims = [];
        for (let i = 0; i < sets.length; i++) {
          for (let j = i + 1; j < sets.length; j++) sims.push(jaccard(sets[i], sets[j]));
        }
        const avgSim = sims.reduce((a, b) => a + b, 0) / sims.length;
        if (avgSim >= 0.95) {
          noDiscrimination++;
          warningLines.push(`  ⚠️  ${theme}.${qid} — AUCUNE discrimination : toutes les valeurs pointent quasi vers les mêmes produits (similarité ${Math.round(avgSim * 100)}%)`);
        } else if (avgSim >= 0.6) {
          lowDiscrimination++;
          warningLines.push(`  ⚠️  ${theme}.${qid} — discrimination faible entre valeurs (similarité moyenne ${Math.round(avgSim * 100)}%)`);
        }
      }
    }

    // --- Clés du catalogue sans question correspondante (hors mismatch déjà signalé) ---
    for (const [usedKey] of usedKeys) {
      if (questionOptionSets.has(usedKey)) continue;
      const alreadyFlagged = errorLines.some((e) => e.includes(`taxonomy.${usedKey} `));
      if (alreadyFlagged) continue;
      unknownKeys++;
      errorLines.push(`  ❌ UNKNOWN TAXONOMY KEY "${usedKey}" sur ${theme} — ne correspond à aucun id de question dans themeQuizzes.ts`);
    }

    // --- hardRequirements/hardExclusions dont la clé n'est pas une question à choix connue du thème ---
    for (const p of themeProducts) {
      for (const source of [p.hardRequirements, p.hardExclusions].filter(Boolean)) {
        for (const [key, values] of Object.entries(source)) {
          if (!questionOptionSets.has(key)) continue; // déjà couvert par "unknown key" ci-dessus si vraiment orphelin
          const optionSet = questionOptionSets.get(key);
          const invalid = values.filter((v) => !optionSet.has(v));
          if (invalid.length > 0) {
            invalidHardRequirements++;
            errorLines.push(`  ❌ INVALID HARD REQUIREMENT sur ${p.id} : ${key}=${invalid.join(',')} n'existe pas dans les options de la question`);
          }
        }
      }
    }

    // --- giftConcept manquant ---
    const withoutConcept = themeProducts.filter((p) => !p.giftConcept);
    if (withoutConcept.length > 0) {
      missingConcepts += withoutConcept.length;
      warningLines.push(`  ⚠️  giftConcept absent sur ${withoutConcept.length}/${themeProducts.length} produit(s) : ${withoutConcept.map((p) => p.id).join(', ')}`);
    }

    console.log(`=== ${theme} ===`);
    for (const l of statusLines) console.log(l);
    if (errorLines.length > 0) {
      console.log('\n  -- ERROR --');
      for (const e of errorLines) console.log(e);
    }
    if (warningLines.length > 0) {
      console.log('\n  -- WARNING --');
      for (const w of warningLines) console.log(w);
    }
    console.log('');
  }

  console.log('ERROR');
  console.log(`${unknownKeys} unknown taxonomy key(s)`);
  console.log(`${unknownValues} unknown taxonomy value(s)`);
  console.log(`${namingMismatches} question/taxonomy naming mismatch(es)`);
  console.log(`${invalidHardRequirements} invalid hardRequirement/hardExclusion(s)`);

  console.log('\nWARNING');
  console.log(`${uncoveredDimensions} dimension(s) jamais utilisée(s)`);
  console.log(`${uncoveredValues} option(s) coverageRequired=true à 0 produit`);
  console.log(`${lowDiscrimination} dimension(s) à discrimination faible`);
  console.log(`${noDiscrimination} dimension(s) SANS AUCUNE discrimination`);
  console.log(`${missingConcepts} produit(s) sans giftConcept`);

  const totalErrors = unknownKeys + unknownValues + namingMismatches + invalidHardRequirements;
  if (totalErrors > 0) {
    console.log(`\n${totalErrors} erreur(s) bloquante(s) trouvée(s).`);
    process.exitCode = 1;
  } else {
    console.log('\n0 erreur bloquante.');
  }
}

main();
