import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { PrimaryButton } from './PrimaryButton';

export function NamePromptModal({
  visible,
  initialValue,
  onSubmit,
}: {
  visible: boolean;
  initialValue?: string;
  onSubmit: (name: string) => void;
}) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue ?? '');

  // Le composant reste monté en arrière-plan (visible bascule juste sa présentation) : sans ça,
  // rouvrir la modale pour modifier un prénom déjà défini réafficherait l'ancienne saisie figée.
  useEffect(() => {
    if (visible) setValue(initialValue ?? '');
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.scrim]}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={styles.emoji}>👋</Text>
          <Text style={[styles.title, { color: theme.ink }]}>Bienvenue dans Pensif</Text>
          <Text style={[styles.body, { color: theme.inkSoft }]}>
            Comment tu t'appelles ? On l'utilise juste pour personnaliser ton accueil, sur cet appareil.
          </Text>
          <Text style={[styles.fieldLabel, { color: theme.inkSoft }]}>TON PRÉNOM</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="Ex. Chloé"
            placeholderTextColor={theme.inkSoft}
            style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.card }]}
            autoFocus
          />
          <PrimaryButton label="Continuer" onPress={() => value.trim() && onSubmit(value.trim())} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(20,24,28,0.5)', alignItems: 'center', justifyContent: 'center', padding: 26 },
  card: { width: '100%', maxWidth: 320, borderRadius: 22, borderWidth: 1, padding: 24, alignItems: 'center' },
  emoji: { fontSize: 32, marginBottom: 6 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  body: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  fieldLabel: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6 },
  input: { width: '100%', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16, fontSize: 15 },
});
