import { RouteProp, useRoute } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as SMS from 'expo-sms';
import React, { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { messageTemplates } from '../data/messages';
import { RootStackParamList } from '../navigation/types';

/** Convertit un numéro français local (06 xx xx xx xx) au format international sans "+" attendu
 *  par wa.me — best-effort, pas de champ pays dédié dans la fiche contact. */
function toWhatsAppNumber(tel: string): string {
  const digits = tel.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('0') ? `33${digits.slice(1)}` : digits;
}

const TONES = [
  { key: 'chaleureux', label: 'Chaleureux' },
  { key: 'complice', label: 'Complice' },
  { key: 'court', label: 'Court' },
] as const;

export function MessageScreen() {
  const theme = useTheme();
  const route = useRoute<RouteProp<RootStackParamList, 'Message'>>();
  const { contacts, giftSentIds, toggleGiftSent } = useStore();
  const contact = contacts.find((c) => c.id === route.params.contactId);
  const [tone, setTone] = useState<(typeof TONES)[number]['key']>('chaleureux');

  if (!contact) return null;

  const message = messageTemplates[tone](contact);
  const sent = giftSentIds.includes(contact.id);

  async function sendSms() {
    const available = await SMS.isAvailableAsync();
    if (!available) {
      Alert.alert('SMS indisponible', "L'envoi de SMS n'est pas disponible sur cet appareil (ex. web ou simulateur).");
      return;
    }
    await SMS.sendSMSAsync([contact!.tel.replace(/\s/g, '')], message);
  }

  async function copyMessage() {
    await Clipboard.setStringAsync(message);
    Alert.alert('Copié', 'Le message a été copié dans le presse-papiers.');
  }

  async function sendWhatsApp() {
    const number = toWhatsAppNumber(contact!.tel);
    if (!number) {
      Alert.alert('Numéro manquant', 'Ajoute le numéro de téléphone de ce contact pour utiliser WhatsApp.');
      return;
    }
    try {
      // Lien universel wa.me plutôt que le schéma whatsapp:// — ouvre l'appli si installée, sinon
      // WhatsApp Web, sans avoir besoin de déclarer de permission de requête de schéma particulière.
      await Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(message)}`);
    } catch {
      Alert.alert('WhatsApp indisponible', "Impossible d'ouvrir WhatsApp sur cet appareil.");
    }
  }

  return (
    <Screen>
      <Text style={[styles.h1, { color: theme.ink }]}>Joyeux anniversaire</Text>
      <Text style={[styles.sub, { color: theme.inkSoft }]}>Message pour {contact.prenom}</Text>

      <View style={styles.toneRow}>
        {TONES.map((t) => {
          const active = t.key === tone;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTone(t.key)}
              style={[
                styles.toneChip,
                { backgroundColor: active ? theme.accent : theme.paperDim, borderColor: active ? theme.accent : theme.line },
              ]}
            >
              <Text style={{ color: active ? '#FFFFFF' : theme.inkSoft, fontWeight: '700', fontSize: 13 }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.bubble, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <Text style={{ color: theme.ink, fontSize: 15, lineHeight: 22 }}>{message}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={copyMessage} style={[styles.btn, { backgroundColor: theme.paperDim, flex: 1 }]}>
          <Text style={{ color: theme.ink, fontWeight: '700' }}>Copier</Text>
        </Pressable>
        <Pressable onPress={sendSms} style={[styles.btn, { backgroundColor: theme.accentStrong, flex: 1 }]}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>SMS</Text>
        </Pressable>
        <Pressable onPress={sendWhatsApp} style={[styles.btn, { backgroundColor: theme.sage, flex: 1 }]}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>WhatsApp</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => toggleGiftSent(contact.id)}
        style={[styles.sentToggle, { backgroundColor: theme.card, borderColor: theme.line }]}
      >
        <View style={[styles.checkbox, sent && { backgroundColor: theme.sage, borderColor: theme.sage }]} />
        <Text style={{ color: theme.ink, fontWeight: '600' }}>Cadeau déjà envoyé</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2, marginBottom: 14 },
  toneRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  toneChip: { flex: 1, paddingVertical: 9, borderRadius: 11, borderWidth: 1, alignItems: 'center' },
  bubble: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  sentToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 13 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#999' },
});
