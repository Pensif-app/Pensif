import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatQuizText } from '../../data/quiz';
import { ThemeQuizConfig } from '../../data/themeQuizzes';
import { Contact } from '../../data/types';
import { Palette } from '../../theme/colors';

/**
 * Affinage d'un thème : une question à la fois (même registre visuel que le quiz général), config
 * pilotée par ThemeQuizConfig — aucune logique de thème hardcodée ici, ajouter un thème dédié se
 * fait entièrement dans themeQuizzes.ts. Auto-avance dès qu'un choix est fait (comme les questions
 * A/B du quiz général) ; chaque réponse est remontée au parent au fur et à mesure (onAnswer), donc
 * rien n'est perdu si l'utilisateur quitte en cours de route.
 */
export function ThemeAffinageQuiz({
  quizConfig,
  contact,
  theme,
  answers,
  onAnswer,
  onFinish,
  onExit,
}: {
  quizConfig: ThemeQuizConfig;
  contact: Pick<Contact, 'prenom' | 'genre'>;
  theme: Palette;
  answers: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
  onFinish: () => void;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [textDraft, setTextDraft] = useState('');
  const question = quizConfig.questions[index];
  const isLast = index === quizConfig.questions.length - 1;

  function advance() {
    if (isLast) onFinish();
    else {
      setIndex((i) => i + 1);
      setTextDraft('');
    }
  }

  function selectChoice(key: string) {
    onAnswer(question.id, key);
    advance();
  }

  function submitText() {
    if (textDraft.trim()) onAnswer(question.id, textDraft.trim());
    advance();
  }

  function back() {
    if (index === 0) onExit();
    else setIndex((i) => i - 1);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={10} style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Ionicons name="chevron-back" size={18} color={theme.ink} />
        </Pressable>
        <Text style={[styles.headerLabel, { color: theme.inkSoft }]}>
          {index + 1}/{quizConfig.questions.length}
        </Text>
        <View style={{ width: 34 }} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.prompt, { color: theme.ink }]}>{formatQuizText(question.prompt, contact)}</Text>

        {question.type === 'choice' && question.options && (
          <View style={{ gap: 10, marginTop: 22, width: '100%' }}>
            {question.options.map((opt) => {
              const active = answers[question.id] === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => selectChoice(opt.key)}
                  style={[
                    styles.optionRow,
                    { borderColor: active ? theme.accent : theme.line, backgroundColor: active ? theme.accentTint : theme.card },
                  ]}
                >
                  <Text style={{ color: theme.ink, fontWeight: '600' }}>{opt.label}</Text>
                  {active && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
                </Pressable>
              );
            })}
          </View>
        )}

        {question.type === 'text' && (
          <View style={{ width: '100%', marginTop: 22 }}>
            <TextInput
              value={textDraft}
              onChangeText={setTextDraft}
              placeholder="Facultatif"
              placeholderTextColor={theme.inkSoft}
              style={[styles.textInput, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.card }]}
            />
            <Pressable onPress={submitText} style={[styles.continueBtn, { backgroundColor: theme.accentStrong }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{isLast ? 'Terminer' : 'Continuer'}</Text>
            </Pressable>
          </View>
        )}

        <Pressable onPress={advance} style={{ marginTop: 20, alignItems: 'center' }}>
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
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 14, padding: 16 },
  textInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14 },
  continueBtn: { marginTop: 14, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
});
