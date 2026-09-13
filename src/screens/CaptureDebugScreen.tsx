import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme';
import { useStore } from '../data/store';
import { uploadAudioForCapture, CaptureApiError } from '../lib/captureApi';
import { CaptureResult } from '../data/captureTypes';
import { matchContactByHeardName } from '../data/contactMatching';
import { buildInitialCards, needsReview, CaptureCard } from '../data/captureReview';

/**
 * CHANTIER CAPTURE INTELLIGENTE — étape "intégration audio réelle" : chemin complet micro → Edge
 * Function → réponse structurée, SANS l'écran de validation final (CaptureReview viendra ensuite).
 * Écran de DEBUG volontairement brut (affiche l'URI/nom/mime/JSON complet) — pas la version finale.
 */
export function CaptureDebugScreen() {
  const theme = useTheme();
  const { contacts } = useStore();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  const [recordedInfo, setRecordedInfo] = useState<{ uri: string; filename: string; mimeType: string; durationMs: number } | null>(null);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);
  // Observabilité debug UNIQUEMENT — mêmes fonctions que CaptureReview (buildInitialCards,
  // needsReview), jamais de logique de matching réimplémentée ici. Aligné index-à-index avec
  // result.pensees dans le cas normal (voir buildInitialCards : repli 1 carte unique si
  // parseError/pensees vide, donc pas d'alignement garanti dans ce cas limite — géré par le
  // lookup optionnel côté rendu).
  const [debugCards, setDebugCards] = useState<CaptureCard[]>([]);

  async function handleStart() {
    setPermissionMessage(null);
    setUploadError(null);
    setResult(null);
    setDebugCards([]);
    setRecordedInfo(null);

    // Réseau requis avant même de demander la permission micro — inutile de faire enregistrer
    // l'utilisateur pour échouer ensuite à l'envoi (voir architecture Capture Intelligente : V1
    // online-only, pas de file d'attente audio hors ligne).
    const net = await NetInfo.fetch();
    if (!(net.isConnected && net.isInternetReachable !== false)) {
      Alert.alert('Connexion requise', 'La capture intelligente nécessite une connexion Internet.');
      return;
    }

    let status = await getRecordingPermissionsAsync();
    if (status.status !== 'granted') {
      status = await requestRecordingPermissionsAsync();
    }
    if (status.status !== 'granted') {
      // Jamais de crash — juste un message, et un accès direct aux réglages si le refus est
      // définitif (canAskAgain === false).
      setPermissionMessage(
        status.canAskAgain
          ? 'Permission micro refusée. Tu peux réessayer.'
          : 'Permission micro refusée définitivement. Ouvre les réglages du téléphone pour l’autoriser.',
      );
      return;
    }

    try {
      // BUG CORRIGÉ (test réel iPhone) : sur iOS, l'enregistrement échoue avec
      // RecordingDisabledException tant que la session audio n'a pas explicitement `allowsRecording:
      // true` (catégorie AVAudioSession .playAndRecord) — indépendant de la permission micro système,
      // déjà accordée à ce stade. `allowsRecording` n'a pas d'effet sur Android (champ iOS-only, voir
      // Audio.types.ts) donc ce réglage est sans risque cross-plateforme.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      Alert.alert('Erreur micro', e instanceof Error ? e.message : String(e));
    }
  }

  async function handleStop() {
    try {
      await recorder.stop();
    } catch (e) {
      Alert.alert('Erreur à l’arrêt de l’enregistrement', e instanceof Error ? e.message : String(e));
      return;
    }
    // Referme la session d'enregistrement iOS dès que possible — évite de laisser le téléphone
    // configuré inutilement en mode .playAndRecord (impact micro/routage audio) une fois la capture
    // terminée.
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = recorder.uri;
    if (!uri) {
      Alert.alert('Erreur', 'Aucun fichier produit par l’enregistrement.');
      return;
    }
    // Nom de fichier RÉEL avec extension — jamais renommé en "audio" sans extension (voir bug déjà
    // rencontré côté adaptateur STT backend). RecordingPresets.HIGH_QUALITY produit un .m4a sur
    // Android (conteneur mpeg4/aac standard, pas le conteneur QuickTime problématique rencontré
    // avec les fichiers de test précédents).
    const filename = uri.split('/').pop() || `capture-${Date.now()}.m4a`;
    const extension = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'm4a';
    const mimeType = extension === 'm4a' ? 'audio/m4a' : extension === 'wav' ? 'audio/wav' : `audio/${extension}`;
    setRecordedInfo({ uri, filename, mimeType, durationMs: recorderState.durationMillis });
  }

  async function handleUpload() {
    if (!recordedInfo) return;
    setUploading(true);
    setUploadError(null);
    setResult(null);
    const start = Date.now();
    try {
      const captureResult = await uploadAudioForCapture(recordedInfo);
      setLatencyMs(Date.now() - start);
      setResult(captureResult);
      setDebugCards(buildInitialCards(captureResult, (heard) => matchContactByHeardName(heard, contacts)));
    } catch (e) {
      setLatencyMs(Date.now() - start);
      setUploadError(e instanceof CaptureApiError ? `${e.message}${e.status ? ` (HTTP ${e.status})` : ''}` : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.ink }]}>Capture — debug</Text>
        <Text style={[styles.sub, { color: theme.inkSoft }]}>
          Écran temporaire pour valider le chemin micro → backend, avant l’écran final.
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <Pressable
            onPress={handleStart}
            disabled={recorderState.isRecording}
            style={[styles.btn, { backgroundColor: recorderState.isRecording ? theme.paperDim : theme.accent }]}
          >
            <Ionicons name="mic" size={18} color="#fff" />
            <Text style={styles.btnLabel}>Démarrer</Text>
          </Pressable>
          <Pressable
            onPress={handleStop}
            disabled={!recorderState.isRecording}
            style={[styles.btn, { backgroundColor: recorderState.isRecording ? theme.danger : theme.paperDim }]}
          >
            <Ionicons name="stop" size={18} color="#fff" />
            <Text style={styles.btnLabel}>Arrêter</Text>
          </Pressable>
        </View>

        {recorderState.isRecording ? (
          <Text style={[styles.info, { color: theme.ink }]}>● Enregistrement… {(recorderState.durationMillis / 1000).toFixed(1)}s</Text>
        ) : null}

        {permissionMessage ? (
          <View style={[styles.card, { borderColor: theme.line, backgroundColor: theme.card }]}>
            <Text style={{ color: theme.danger }}>{permissionMessage}</Text>
            {!recorderState.isRecording && permissionMessage.includes('réglages') ? (
              <Pressable onPress={() => Linking.openSettings().catch(() => {})} style={{ marginTop: 8 }}>
                <Text style={{ color: theme.accent, fontWeight: '700' }}>Ouvrir les réglages du téléphone</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {recordedInfo ? (
          <View style={[styles.card, { borderColor: theme.line, backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Fichier enregistré</Text>
            <DebugRow label="URI" value={recordedInfo.uri} theme={theme} />
            <DebugRow label="Nom de fichier" value={recordedInfo.filename} theme={theme} />
            <DebugRow label="MIME type" value={recordedInfo.mimeType} theme={theme} />
            <DebugRow label="Durée" value={`${(recordedInfo.durationMs / 1000).toFixed(2)}s`} theme={theme} />
            <DebugRow label="Plateforme" value={Platform.OS} theme={theme} />

            <Pressable onPress={handleUpload} disabled={uploading} style={[styles.btn, { backgroundColor: theme.accent, marginTop: 12 }]}>
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.btnLabel}>{uploading ? 'Envoi en cours…' : 'Envoyer à Capture'}</Text>
            </Pressable>
          </View>
        ) : null}

        {latencyMs !== null ? <Text style={[styles.info, { color: theme.inkSoft }]}>Latence totale : {latencyMs}ms</Text> : null}

        {uploadError ? (
          <View style={[styles.card, { borderColor: theme.danger, backgroundColor: theme.card }]}>
            <Text style={{ color: theme.danger, fontWeight: '700' }}>Erreur</Text>
            <Text style={{ color: theme.danger }}>{uploadError}</Text>
          </View>
        ) : null}

        {result ? (
          <View style={[styles.card, { borderColor: theme.line, backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Résultat Capture</Text>
            <DebugRow label="transcript" value={result.transcript} theme={theme} />
            <DebugRow label="parseError" value={result.parseError ?? '(null)'} theme={theme} />
            <DebugRow label="nb pensées" value={String(result.pensees.length)} theme={theme} />
            <DebugRow label="meta" value={JSON.stringify(result.meta ?? {})} theme={theme} />
            {result.pensees.map((p, i) => {
              // Alignement index-à-index avec debugCards — valable dans le cas normal (voir
              // commentaire sur debugCards ci-dessus). card undefined seulement dans le cas limite
              // de repli (parseError/pensees vide), non affiché ici car result.pensees serait vide.
              const card = debugCards[i];
              const matchedContact = card?.contactId ? contacts.find((c) => c.id === card.contactId) : undefined;
              return (
                <View key={i} style={[styles.penseeBlock, { borderColor: theme.line }]}>
                  <Text style={[styles.cardTitle, { color: theme.ink, fontSize: 13 }]}>Pensée {i + 1}</Text>
                  <DebugRow label="texte" value={p.texte} theme={theme} />
                  <DebugRow label="heardContactName" value={p.heardContactName ?? '(null)'} theme={theme} />
                  <DebugRow label="event" value={JSON.stringify(p.event)} theme={theme} />
                  <DebugRow label="reminder" value={JSON.stringify(p.reminder)} theme={theme} />
                  <DebugRow label="confidence" value={String(p.confidence)} theme={theme} />
                  {card ? (
                    <>
                      <Text style={[styles.cardTitle, { color: theme.inkSoft, fontSize: 11, marginTop: 8 }]}>Matching contact (debug)</Text>
                      <DebugRow label="matching.kind" value={card.contactMatch.kind} theme={theme} />
                      <DebugRow
                        label="contactId"
                        value={
                          'contactId' in card.contactMatch
                            ? card.contactMatch.contactId
                            : 'candidateContactIds' in card.contactMatch
                              ? `candidats: ${card.contactMatch.candidateContactIds.join(', ')}`
                              : '(aucun)'
                        }
                        theme={theme}
                      />
                      <DebugRow label="prénom contact résolu" value={matchedContact?.prenom ?? '(aucun)'} theme={theme} />
                      <DebugRow label="preselected (CaptureReview)" value={card.contactId ? 'true' : 'false'} theme={theme} />
                      <DebugRow label="needsReview (CaptureReview)" value={String(needsReview(card))} theme={theme} />
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function DebugRow({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ marginTop: 4 }}>
      <Text style={{ color: theme.inkSoft, fontSize: 11, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: theme.ink, fontSize: 13 }} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, flex: 1 },
  btnLabel: { color: '#fff', fontWeight: '700' },
  info: { marginTop: 10, fontSize: 13 },
  card: { marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1 },
  cardTitle: { fontWeight: '800', fontSize: 14, marginBottom: 6 },
  penseeBlock: { marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
});
