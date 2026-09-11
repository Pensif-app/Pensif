// Parse src/data/themeQuizzes.ts (regex + comptage d'accolades, pas de ts-node) pour extraire, par
// thème, la carte des dépendances `when` entre questions — utilisé par l'audit pour distinguer un
// vrai trou catalogue d'une combinaison structurellement non pertinente (voir Phase 3A : "fandom ×
// equipmentLevel" n'est pas un trou, c'est une dimension qui ne s'applique pas à cette branche).

const fs = require('fs');
const path = require('path');

const QUIZZES_PATH = path.join(__dirname, '..', 'src', 'data', 'themeQuizzes.ts');

/** Renvoie l'index de la '}' qui ferme la '{' à openIndex (comptage de profondeur simple, aucune
 *  accolade dans une chaîne de ce fichier). */
function matchingBrace(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function matchingBracket(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Découpe un tableau `[ {...}, {...}, ... ]` (texte entre les crochets, exclus) en la liste des
 *  sous-textes de chaque objet top-level `{...}`. */
function splitTopLevelObjects(arrayInnerText) {
  const objects = [];
  let i = 0;
  while (i < arrayInnerText.length) {
    const start = arrayInnerText.indexOf('{', i);
    if (start === -1) break;
    const end = matchingBrace(arrayInnerText, start);
    if (end === -1) break;
    objects.push(arrayInnerText.slice(start, end + 1));
    i = end + 1;
  }
  return objects;
}

/**
 * Renvoie { [theme]: { [questionId]: { questionId: string, oneOf: string[] } | undefined } } —
 * uniquement les questions qui déclarent un `when`, indexées par LEUR PROPRE id (la question qui a
 * une condition, pas celle dont elle dépend).
 */
function parseWhenMap() {
  const src = fs.readFileSync(QUIZZES_PATH, 'utf8');
  const declStart = src.indexOf('const DEDICATED_QUIZZES');
  const objStart = src.indexOf('{', declStart);
  const objEnd = matchingBrace(src, objStart);
  const body = src.slice(objStart + 1, objEnd);

  const whenMap = {};
  // Chaque entrée de thème ressemble à : `  gaming: {\n    theme: 'gaming',\n    questions: [ ... ],\n  },`
  const themeKeyRe = /(\w+): \{\s*theme: '(\w+)'/g;
  let m;
  while ((m = themeKeyRe.exec(body))) {
    const theme = m[2];
    const themeBlockStart = m.index;
    const themeBraceStart = body.indexOf('{', themeKeyRe.lastIndex - 1 >= themeBlockStart ? m.index : themeBlockStart);
    // Repère la '{' qui ouvre CE thème (juste après "theme_key: ")
    const openBrace = body.indexOf('{', m.index);
    const closeBrace = matchingBrace(body, openBrace);
    const themeBlock = body.slice(openBrace, closeBrace + 1);

    const questionsIdx = themeBlock.indexOf('questions: [');
    if (questionsIdx === -1) continue;
    const bracketStart = themeBlock.indexOf('[', questionsIdx);
    const bracketEnd = matchingBracket(themeBlock, bracketStart);
    const questionsInner = themeBlock.slice(bracketStart + 1, bracketEnd);

    const questionObjects = splitTopLevelObjects(questionsInner);
    whenMap[theme] = whenMap[theme] || {};
    for (const qText of questionObjects) {
      const idMatch = qText.match(/id: '([^']+)'/);
      if (!idMatch) continue;
      const qid = idMatch[1];
      const whenMatch = qText.match(/when:\s*\{\s*questionId:\s*'([^']+)',\s*oneOf:\s*\[([^\]]*)\]\s*\}/);
      if (whenMatch) {
        const oneOf = whenMatch[2]
          .split(',')
          .map((s) => s.trim().replace(/^'|'$/g, ''))
          .filter(Boolean);
        whenMap[theme][qid] = { questionId: whenMatch[1], oneOf };
      }
    }
  }
  return whenMap;
}

/**
 * Un croisement (dimA=valA, dimB=valB) est INAPPLICABLE si l'une des deux dimensions déclare un
 * `when` sur l'autre et que la valeur donnée n'est pas dans la liste autorisée. Symétrique : on
 * teste les deux sens (dimA dépend de dimB, et dimB dépend de dimA).
 */
function isApplicablePair(whenMap, theme, dimA, valA, dimB, valB) {
  const themeWhens = whenMap[theme] || {};
  const whenA = themeWhens[dimA];
  if (whenA && whenA.questionId === dimB && !whenA.oneOf.includes(valB)) return false;
  const whenB = themeWhens[dimB];
  if (whenB && whenB.questionId === dimA && !whenB.oneOf.includes(valA)) return false;
  return true;
}

// Clés d'option conventionnellement NEUTRES : une réponse de quiz n'est pas forcément une valeur
// de taxonomie produit à couvrir. 'autre' est une case ouverte/fallback (Phase 3 LOT 2) ; 'inconnu'
// (et équivalents) signifie "on ne sait pas" côté contact — ce n'est jamais une propriété produit
// à chercher sur Amazon, le moteur doit juste ne pas appliquer ce critère (voir Phase 3 LOT 4,
// bienetre.parfum : 'oui' pousse les produits parfumés, 'non' les exclut/pénalise, 'inconnu' n'a
// aucun effet — très différent d'un vrai trou catalogue).
const NEUTRAL_OPTION_KEYS = new Set(['autre', 'inconnu']);

/**
 * Renvoie { [theme]: [{ id, options: [{ key, label, coverageRequired }] }] } — uniquement les
 * questions à choix (type 'choice'), avec `coverageRequired: false` sur les valeurs neutres
 * (voir NEUTRAL_OPTION_KEYS) : jamais un vrai trou catalogue, elles existent pour l'UX/l'honnêteté
 * du contact répondant, pas pour être couvertes produit par produit.
 */
function parseQuestionOptions() {
  const src = fs.readFileSync(QUIZZES_PATH, 'utf8');
  const declStart = src.indexOf('const DEDICATED_QUIZZES');
  const objStart = src.indexOf('{', declStart);
  const objEnd = matchingBrace(src, objStart);
  const body = src.slice(objStart + 1, objEnd);

  const result = {};
  const themeKeyRe = /(\w+): \{\s*theme: '(\w+)'/g;
  let m;
  while ((m = themeKeyRe.exec(body))) {
    const theme = m[2];
    const openBrace = body.indexOf('{', m.index);
    const closeBrace = matchingBrace(body, openBrace);
    const themeBlock = body.slice(openBrace, closeBrace + 1);

    const questionsIdx = themeBlock.indexOf('questions: [');
    if (questionsIdx === -1) continue;
    const bracketStart = themeBlock.indexOf('[', questionsIdx);
    const bracketEnd = matchingBracket(themeBlock, bracketStart);
    const questionsInner = themeBlock.slice(bracketStart + 1, bracketEnd);

    const questionObjects = splitTopLevelObjects(questionsInner);
    result[theme] = [];
    for (const qText of questionObjects) {
      const idMatch = qText.match(/id: '([^']+)'/);
      const typeMatch = qText.match(/type: '([^']+)'/);
      if (!idMatch || !typeMatch || typeMatch[1] !== 'choice') continue;
      const optionsIdx = qText.indexOf('options: [');
      if (optionsIdx === -1) continue;
      const optBracketStart = qText.indexOf('[', optionsIdx);
      const optBracketEnd = matchingBracket(qText, optBracketStart);
      const optionsInner = qText.slice(optBracketStart + 1, optBracketEnd);
      const options = [];
      const optRe = /key: '([^']+)'/g;
      let om;
      while ((om = optRe.exec(optionsInner))) {
        options.push({ key: om[1], coverageRequired: !NEUTRAL_OPTION_KEYS.has(om[1]) });
      }
      result[theme].push({ id: idMatch[1], options });
    }
  }
  return result;
}

module.exports = { parseWhenMap, isApplicablePair, parseQuestionOptions };
