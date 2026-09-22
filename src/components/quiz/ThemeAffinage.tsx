import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '../PrimaryButton';
import { ANSWER_FILL_MS, ChoiceCard } from './ChoiceCard';
import { formatQuizText } from '../../data/quiz';
import { ThemeQuizConfig } from '../../data/themeQuizzes';
import { Contact } from '../../data/types';
import { Palette } from '../../theme/colors';

/**
 * Affinage d'un thème : une question à la fois, même registre visuel ET même animation que le
 * quiz général (bulle qui se remplit et gonfle — voir ChoiceCard) ; config pilotée par
 * ThemeQuizConfig, aucune logique de thème hardcodée ici. Une question à 2 options est à choix
 * unique et avance automatiquement, comme les questions A/B du quiz général ; à 3 options ou plus,
 * plusieurs réponses sont possibles (ex. plusieurs disciplines sportives pratiquées) — il faut
 * alors valider avec "Continuer". Chaque réponse est remontée au parent au fur et à mesure
 * (onAnswer), donc rien n'est perdu si l'utilisateur quitte en cours de route.
 *
 * CHANTIER "P0 Quiz Phase 1" (2026-09-22) — "Passer cette question"/"Passer" (dernière question)
 * appelle désormais EXPLICITEMENT `onSkip(question.id)` AVANT `advance()` : une ancienne réponse
 * déjà présente pour cette question (mode édition) doit être RETIRÉE, jamais conservée
 * silencieusement (voir audit "Skip ne fait qu'avancer l'index" — reading-light gonflé à 93 au lieu
 * de 57 par des réponses `contexte`/`besoin` jamais retouchées). `onSkip` est un appel dédié, distinct
 * d'`onAnswer('', ...)`, pour que le parent (QuizScreen.tsx) puisse RETIRER la clé plutôt que d'y
 * écrire une valeur vide — "absence de réponse = absence de clé" (consigne §2).
 */
export function ThemeAffinageQuiz({
  quizConfig,
  contact,
  theme,
  answers,
  onAnswer,
  onSkip,
  onFinish,
  onExit,
}: {
  quizConfig: ThemeQuizConfig;
  contact: Pick<Contact, 'prenom' | 'genre'>;
  theme: Palette;
  answers: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
  /** Retire toute réponse existante pour cette question (voir consigne §1/§2) — jamais un
   *  `onAnswer(questionId, '')`, le parent supprime réellement la clé. */
  onSkip: (questionId: string) => void;
  onFinish: () => void;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [textDraft, setTextDraft] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [multiSelected, setMultiSelected] = useState<string[]>([]);

  // Liste des questions réellement affichées : une question avec `when` n'apparaît que si la
  // réponse précédente correspond (branchement conditionnel, ex. musique "il joue" → instrument).
  // Recalculée à chaque render à partir de `answers` donc reste cohérente si on revient en arrière
  // et change une réponse qui conditionne une question suivante.
  const visibleQuestions = quizConfig.questions.filter((q) => {
    // CHANTIER "Phase 5G" (2026-09-21) : une question `hidden: true` reste dans la config (voir
    // themeQuizzes.ts) mais n'est jamais montrée à un utilisateur réel — ex. lecture.sujet tant
    // que son catalogue de livres n'est pas sourcé.
    if (q.hidden) return false;
    if (!q.when) return true;
    const answer = answers[q.when.questionId];
    if (!answer) return false;
    return answer.split(',').some((v) => q.when!.oneOf.includes(v));
  });
  const safeIndex = Math.min(index, visibleQuestions.length - 1);
  const question = visibleQuestions[safeIndex];
  const isLast = safeIndex === visibleQuestions.length - 1;
  const isMulti = question.type === 'choice' && (question.options?.length ?? 0) > 2;

  // Réinitialise le brouillon local à chaque changement de question, en repartant de ce qui a
  // éventuellement déjà été répondu (retour arrière puis re-avance, par exemple).
  useEffect(() => {
    setTextDraft(question.type === 'text' ? answers[question.id] ?? '' : '');
    setMultiSelected(isMulti ? (answers[question.id] ? answers[question.id].split(',') : []) : []);
    setFlash(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, question.id]);

  function advance() {
    if (isLast) onFinish();
    else setIndex(safeIndex + 1);
  }

  function selectSingleChoice(key: string) {
    if (flash) return; // déjà en cours de transition, ignore un second tap
    setFlash(key);
    // Laisse le temps à ChoiceCard de finir son animation de remplissage avant de basculer.
    setTimeout(() => {
      onAnswer(question.id, key);
      advance();
    }, ANSWER_FILL_MS);
  }

  function toggleMultiChoice(key: string) {
    setMultiSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function confirmMultiChoice() {
    if (multiSelected.length > 0) onAnswer(question.id, multiSelected.join(','));
    advance();
  }

  function submitText() {
    if (textDraft.trim()) onAnswer(question.id, textDraft.trim());
    advance();
  }

  function back() {
    if (safeIndex === 0) onExit();
    else setIndex(safeIndex - 1);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={10} style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Ionicons name="chevron-back" size={18} color={theme.ink} />
        </Pressable>
        <Text style={[styles.headerLabel, { color: theme.inkSoft }]}>
          {safeIndex + 1}/{visibleQuestions.length}
        </Text>
        <View style={{ width: 34 }} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.prompt, { color: theme.ink }]}>{formatQuizText(question.prompt, contact)}</Text>
        {isMulti && <Text style={[styles.subtitle, { color: theme.inkSoft }]}>Plusieurs réponses possibles.</Text>}

        {question.type === 'choice' && question.options && !isMulti && (
          <View style={{ gap: 10, marginTop: 22, width: '100%' }}>
            {question.options.map((opt) => (
              <ChoiceCard key={opt.key} label={formatQuizText(opt.label, contact)} theme={theme} active={flash === opt.key} onPress={() => selectSingleChoice(opt.key)} />
            ))}
          </View>
        )}

        {question.type === 'choice' && question.options && isMulti && (
          <>
            <View style={{ gap: 10, marginTop: 18, width: '100%' }}>
              {question.options.map((opt) => (
                <ChoiceCard
                  key={opt.key}
                  label={formatQuizText(opt.label, contact)}
                  theme={theme}
                  active={multiSelected.includes(opt.key)}
                  onPress={() => toggleMultiChoice(opt.key)}
                />
              ))}
            </View>
            <View style={{ marginTop: 16, width: '100%' }}>
              <PrimaryButton label={isLast ? 'Terminer' : 'Continuer'} onPress={confirmMultiChoice} />
            </View>
          </>
        )}

        {question.type === 'text' && (
          <View style={{ width: '100%', marginTop: 22 }}>
            <TextInput
              value={textDraft}
              onChangeText={setTextDraft}
              placeholder={question.placeholder ?? 'Facultatif'}
              placeholderTextColor={theme.inkSoft}
              style={[styles.textInput, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.card }]}
            />
            <Pressable onPress={submitText} style={[styles.continueBtn, { backgroundColor: theme.accentStrong }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{isLast ? 'Terminer' : 'Continuer'}</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={() => {
            // Retire d'abord toute ancienne réponse pour CETTE question (consigne §1/§3 : y compris
            // pour la dernière question, "Passer" doit aussi effacer avant de terminer), puis avance
            // — jamais l'inverse, pour ne jamais laisser `advance()`/`onFinish()` s'exécuter sur un
            // état pas encore nettoyé.
            onSkip(question.id);
            advance();
          }}
          style={{ marginTop: 20, alignItems: 'center' }}
        >
          <Text style={{ color: theme.inkSoft, fontSize: 13 }}>{isLast ? 'Passer' : 'Passer cette question'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6 },
  backBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  prompt: { fontSize: 20, fontWeight: '700', lineHeight: 27, textAlign: 'center' },
  subtitle: { fontSize: 13, marginTop: 4, textAlign: 'center' },
  textInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14 },
  continueBtn: { marginTop: 14, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
});
