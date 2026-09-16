import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import * as SMS from 'expo-sms';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { messageTemplates } from '../data/messages';
import { buildMessageSuggestionContext, MessageOccasion, MessageTone } from '../data/messageSuggestion';
import { MessageDrafts, messageDraftStorageKey } from '../data/messageDraftKey';
import { loadMessageDrafts, saveMessageDrafts } from '../data/messageDraftStorage';
import { requestMessageSuggestion, MessageSuggestionApiError } from '../lib/messageSuggestionApi';
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

// (typeof TONES)[number]['key'] doit toujours rester assignable à MessageTone — voir contract.ts
// côté serveur (suggest-message), mêmes 3 valeurs, jamais un 4e ton ajouté d'un seul côté.
type Tone = MessageTone;

const OCCASION_TITLES: Record<MessageOccasion, string> = {
  birthday: 'Joyeux anniversaire',
  thinking_of_you: 'Une petite pensée',
  event: 'Un message pour l’occasion',
};

export function MessageScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Message'>>();
  const { contacts, pensees, today, giftSentIds, toggleGiftSent } = useStore();
  const contact = contacts.find((c) => c.id === route.params.contactId);
  // CHANTIER RÉPONSES INTELLIGENTES (2026-09-16) — `occasion` optionnel, défaut 'birthday' pour
  // rétrocompatibilité avec les 2 appelants existants (voir navigation/types.ts). `penseeId`
  // (jamais l'objet Pensee) résolu ICI depuis le store — jamais depuis un objet figé transmis en
  // navigation, pour toujours refléter l'état local courant.
  const occasion: MessageOccasion = route.params.occasion ?? 'birthday';
  const eventPensee = occasion === 'event' && route.params.penseeId ? pensees.find((p) => p.id === route.params.penseeId) ?? null : null;

  const [tone, setTone] = useState<Tone>('chaleureux');
  // Un brouillon PAR TON, indexé par contact+occasion(+pensée) — voir messageDraftKey.ts. Un ton
  // absent de cet objet = "pas de brouillon" → valeur par défaut calculée (template pour birthday,
  // vide sinon), JAMAIS une entrée persistée pour un template intact.
  const [drafts, setDrafts] = useState<MessageDrafts>({});
  // Garde d'hydratation — AUCUNE sauvegarde tant que la lecture de LA clé courante n'est pas
  // terminée (voir l'effet de sauvegarde plus bas, qui vérifie ce flag). Remise à `false` à chaque
  // changement d'identité (contact/occasion/pensée), en même temps que `drafts` est vidé : ainsi les
  // brouillons du contact/occasion précédent ne s'affichent jamais, même brièvement, pendant qu'on
  // charge les bons.
  const [draftsHydrated, setDraftsHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Garde anti-double-tap — mutation SYNCHRONE (contrairement à un state), ferme la fenêtre entre
  // deux taps rapides avant que React n'ait re-rendu pour désactiver le bouton (même pattern que
  // CaptureScreen.tsx, savingCardIdsRef/savingAllRef).
  const generatingRef = useRef(false);
  // Identité de la lecture AsyncStorage actuellement en vol — comparée au moment où la promesse se
  // résout, pour qu'une lecture DEVENUE obsolète (l'utilisateur a changé de contact/occasion entre
  // temps) ne puisse jamais écraser les brouillons de la nouvelle identité (voir l'effet ci-dessous).
  const hydrationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!contact) return;
    const key = messageDraftStorageKey(contact.id, occasion, eventPensee?.id);
    hydrationKeyRef.current = key;
    setDraftsHydrated(false);
    setDrafts({});
    loadMessageDrafts(contact.id, occasion, eventPensee?.id).then((loaded) => {
      if (hydrationKeyRef.current !== key) return; // une identité plus récente a déjà pris le dessus
      setDrafts(loaded);
      setDraftsHydrated(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id, occasion, eventPensee?.id]);

  // Sauvegarde — JAMAIS avant hydratation (sinon on écraserait un brouillon existant avec un objet
  // vide le temps de la lecture), et JAMAIS pour un objet vide (aucun ton personnalisé = rien à
  // persister, les templates par défaut ne sont jamais écrits sur disque).
  useEffect(() => {
    if (!contact || !draftsHydrated) return;
    if (Object.keys(drafts).length === 0) return;
    void saveMessageDrafts(contact.id, occasion, drafts, eventPensee?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, draftsHydrated, contact?.id, occasion, eventPensee?.id]);

  // Construction LOCALE du contexte dès que possible (aucun réseau) — détermine si l'action IA est
  // disponible AVANT même que l'utilisateur ne voie un bouton, jamais après un tap dans le vide.
  // `event_*` (y compris `event_pensee_sensitive`, jamais révélé comme tel dans l'UI) → indisponible.
  const contextResult = useMemo(() => {
    if (!contact) return null;
    return buildMessageSuggestionContext(contact, pensees, today, occasion, eventPensee);
  }, [contact, pensees, today, occasion, eventPensee]);
  const aiAvailable = contextResult?.ok === true;

  if (!contact) {
    // Le contact a pu être supprimé entre la programmation d'un lien (notification, etc.) et son
    // ouverture — état de récupération plutôt qu'un écran blanc (voir CHANTIER PRÉ-BÊTA 1 §7). On ne
    // recrée rien et on ne redirige jamais automatiquement, juste un retour explicite.
    return (
      <Screen>
        <Text style={[styles.h1, { color: theme.ink }]}>Ce proche n’est plus disponible</Text>
        <Text style={[styles.sub, { color: theme.inkSoft }]}>Il a peut-être été supprimé.</Text>
        <Pressable onPress={() => navigation.goBack()} style={[styles.btn, { backgroundColor: theme.paperDim, marginTop: 16 }]}>
          <Text style={{ color: theme.ink, fontWeight: '700' }}>Retour</Text>
        </Pressable>
      </Screen>
    );
  }

  const sent = giftSentIds.includes(contact.id);
  // Valeurs AFFICHÉES pour le ton actif — dérivées, jamais un état séparé qui pourrait diverger de
  // `drafts`. Absence de brouillon pour ce ton = valeur par défaut (template birthday, vide sinon).
  const currentEntry = drafts[tone];
  const currentText = currentEntry?.text ?? (occasion === 'birthday' ? messageTemplates[tone](contact) : '');
  const currentAiGenerated = currentEntry?.aiGenerated ?? false;

  // Changement de ton — ne touche JAMAIS `drafts` : chaque ton affiche simplement son propre
  // brouillon (ou sa propre valeur par défaut) via `currentText`/`currentAiGenerated` ci-dessus.
  // Aucun popup, aucune génération déclenchée — le nouveau ton n'est pris en compte par l'IA qu'à la
  // PROCHAINE génération explicite (déjà garanti : `tone` est lu au moment de l'appel, voir
  // handleGenerate).
  function handleToneChange(nextTone: Tone) {
    setTone(nextTone);
  }

  function handleTextChange(nextText: string) {
    // Met à jour UNIQUEMENT l'entrée du ton actif — les 2 autres tons restent strictement inchangés.
    // Une édition d'un résultat IA CONSERVE `aiGenerated:true` (on ne touche qu'à `text` ici) ; une
    // édition d'un template jamais généré crée `{ text, aiGenerated:false }`.
    setDrafts((prev) => ({ ...prev, [tone]: { text: nextText, aiGenerated: prev[tone]?.aiGenerated ?? false } }));
  }

  async function handleGenerate() {
    if (generatingRef.current) return;
    if (!contextResult?.ok) return; // garde défensive — le bouton n'est de toute façon pas rendu sinon
    generatingRef.current = true;
    setLoading(true);
    setError(null);
    const toneAtRequestTime = tone; // le ton ACTUELLEMENT sélectionné, jamais un ton figé plus tôt
    try {
      const generated = await requestMessageSuggestion(contextResult.context, toneAtRequestTime);
      // Remplace UNIQUEMENT le brouillon du ton actif — les 2 autres tons restent intacts.
      setDrafts((prev) => ({ ...prev, [toneAtRequestTime]: { text: generated, aiGenerated: true } }));
    } catch (e) {
      // Échec : le brouillon courant (template ou précédente personnalisation) reste INTACT — jamais
      // écrasé par un échec. Erreur non destructive affichée à côté du bouton.
      setError(e instanceof MessageSuggestionApiError ? e.message : 'La personnalisation a échoué. Réessaie.');
    } finally {
      setLoading(false);
      generatingRef.current = false;
    }
  }

  async function sendSms() {
    const available = await SMS.isAvailableAsync();
    if (!available) {
      Alert.alert('SMS indisponible', "L'envoi de SMS n'est pas disponible sur cet appareil (ex. web ou simulateur).");
      return;
    }
    await SMS.sendSMSAsync([contact!.tel.replace(/\s/g, '')], currentText);
  }

  async function copyMessage() {
    await Clipboard.setStringAsync(currentText);
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
      await Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(currentText)}`);
    } catch {
      Alert.alert('WhatsApp indisponible', "Impossible d'ouvrir WhatsApp sur cet appareil.");
    }
  }

  return (
    <Screen>
      <Text style={[styles.h1, { color: theme.ink }]}>{OCCASION_TITLES[occasion]}</Text>
      <Text style={[styles.sub, { color: theme.inkSoft }]}>Message pour {contact.prenom}</Text>

      <View style={styles.toneRow}>
        {TONES.map((t) => {
          const active = t.key === tone;
          return (
            <Pressable
              key={t.key}
              onPress={() => handleToneChange(t.key)}
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

      {currentAiGenerated && (
        <Text style={[styles.aiLabel, { color: theme.accent }]}>Suggestion IA — relis avant d'envoyer</Text>
      )}
      <View style={[styles.bubble, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <TextInput
          value={currentText}
          onChangeText={handleTextChange}
          editable={draftsHydrated}
          multiline
          placeholder="Écris ou personnalise ton message…"
          placeholderTextColor={theme.inkSoft}
          style={{ color: theme.ink, fontSize: 15, lineHeight: 22, minHeight: 60 }}
        />
      </View>

      {aiAvailable && (
        <Pressable
          onPress={handleGenerate}
          disabled={loading || !draftsHydrated}
          style={[styles.aiBtn, { backgroundColor: theme.paperDim, borderColor: theme.accent, opacity: loading || !draftsHydrated ? 0.6 : 1 }]}
        >
          <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>
            {loading ? 'Génération…' : currentAiGenerated ? 'Régénérer' : 'Personnaliser avec Pensif'}
          </Text>
        </Pressable>
      )}
      {error && <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>}

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

      {occasion === 'birthday' && (
        <Pressable
          onPress={() => toggleGiftSent(contact.id)}
          style={[styles.sentToggle, { backgroundColor: theme.card, borderColor: theme.line }]}
        >
          <View style={[styles.checkbox, sent && { backgroundColor: theme.sage, borderColor: theme.sage }]} />
          <Text style={{ color: theme.ink, fontWeight: '600' }}>Cadeau déjà envoyé</Text>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2, marginBottom: 14 },
  toneRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  toneChip: { flex: 1, paddingVertical: 9, borderRadius: 11, borderWidth: 1, alignItems: 'center' },
  aiLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  bubble: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 10 },
  aiBtn: { paddingVertical: 11, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginBottom: 10 },
  errorText: { fontSize: 12, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  sentToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 13 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#999' },
});
