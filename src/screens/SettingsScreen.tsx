import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { useStore, ThemePref } from '../data/store';
import { useTheme } from '../theme';
import { isSupabaseConfigured } from '../lib/supabase';
import { ensureNotificationPermissions, getNotificationPermissionStatus, scheduleTestNotificationIn60Seconds } from '../lib/notifications';
import {
  OTP_MAX_LENGTH,
  describeAuthErrorCode,
  getExistingSession,
  isOtpSubmittable,
  requestAccountSecurityEmail,
  sanitizeOtpInput,
  verifyAccountSecurityOtp,
} from '../lib/authRepo';

// Version affichée = celle réellement configurée pour ce build (app.json `expo.version`), jamais
// une chaîne codée en dur qui pourrait diverger silencieusement — voir CHANTIER PRÉ-BÊTA 2 §4.
// `expoConfig` est absent uniquement dans des contextes exotiques (jamais en usage normal
// development/preview/production) ; secours sur "1.0.0" pour ne jamais afficher une valeur vide.
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

const THEME_OPTIONS: { key: ThemePref; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'system', label: 'Système', icon: 'phone-portrait-outline' },
  { key: 'light', label: 'Clair', icon: 'sunny-outline' },
  { key: 'dark', label: 'Sombre', icon: 'moon-outline' },
];

export function SettingsScreen() {
  const theme = useTheme();
  const {
    userName,
    openNamePrompt,
    contacts,
    pensees,
    themePref,
    setThemePref,
    notificationsEnabled,
    setNotificationsEnabled,
    resetLocalDemoData,
    isAnonymous,
    markAccountSecured,
    devSimulateReinstall,
  } = useStore();

  const [permStatus, setPermStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unsupported'>('undetermined');

  // CHANTIER "Data Safety P0-1" (2026-09-20) — état local du flux "SÉCURISER MES DONNÉES", jamais
  // dans le store global (comme le reste des flux d'écran de cette app, ex. CaptureScreen/
  // PenseeDetailScreen). `securityIdBefore` capture le `user.id` juste avant de lancer le flux — sert
  // UNIQUEMENT à la vérification explicite "user.id avant === user.id après" (consigne §2), jamais à
  // autre chose.
  const [securityStep, setSecurityStep] = useState<'idle' | 'email' | 'otp' | 'success'>('idle');
  const [securityEmail, setSecurityEmail] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityIdBefore, setSecurityIdBefore] = useState<string | null>(null);

  function resetSecurityFlow() {
    setSecurityStep('idle');
    setSecurityEmail('');
    setSecurityCode('');
    setSecurityError(null);
    setSecurityLoading(false);
    setSecurityIdBefore(null);
  }

  async function startSecurityFlow() {
    setSecurityError(null);
    const session = await getExistingSession();
    setSecurityIdBefore(session?.userId ?? null);
    setSecurityStep('email');
  }

  async function sendSecurityCode() {
    const trimmed = securityEmail.trim();
    if (!trimmed) {
      setSecurityError('Renseigne ton adresse email.');
      return;
    }
    setSecurityLoading(true);
    setSecurityError(null);
    const result = await requestAccountSecurityEmail(trimmed);
    setSecurityLoading(false);
    if (!result.ok) {
      // "email déjà associé" (email_exists/identity_already_exists) — STOP explicite (consigne §3) :
      // jamais de fusion, la session anonyme actuelle reste totalement intacte (aucun appel
      // supplémentaire n'a modifié quoi que ce soit à ce stade). Message dédié + indication du
      // recours (récupération depuis "J'ai déjà un compte" sur une installation SANS session, pas
      // implémenté ici — voir consigne "aucun changement de compte depuis Settings dans cette passe").
      if (result.code === 'email_exists' || result.code === 'identity_already_exists') {
        setSecurityError(
          'Un compte Pensif existe déjà avec cet email. Pour le récupérer, réinstalle Pensif (ou efface ses données) et choisis "J’ai déjà un compte" au premier lancement.',
        );
        return;
      }
      setSecurityError(describeAuthErrorCode(result.code, result.message));
      return;
    }
    setSecurityStep('otp');
  }

  async function verifySecurityCode() {
    const trimmed = securityCode.trim();
    if (!isOtpSubmittable(trimmed)) {
      setSecurityError('Saisis le code reçu par email.');
      return;
    }
    setSecurityLoading(true);
    setSecurityError(null);
    const result = await verifyAccountSecurityOtp(securityEmail.trim(), trimmed);
    setSecurityLoading(false);
    if (!result.ok) {
      setSecurityError(describeAuthErrorCode(result.code, result.message));
      return;
    }
    // Consigne §2 — vérification EXPLICITE, jamais supposée : si le user.id a changé, c'est une
    // erreur CRITIQUE (ne devrait structurellement jamais arriver sur ce chemin, updateUser ne crée
    // jamais de nouvel utilisateur) — on ne continue JAMAIS silencieusement dans ce cas.
    if (securityIdBefore && result.userId !== securityIdBefore) {
      setSecurityError("Erreur critique : l'identifiant de compte a changé de façon inattendue. Contacte le support avant de continuer.");
      return;
    }
    // Aucun reload/purge — le user.id est resté identique par construction (consigne §2).
    markAccountSecured();
    setSecurityStep('success');
  }

  useEffect(() => {
    getNotificationPermissionStatus().then(setPermStatus);
  }, [notificationsEnabled]);

  async function handleToggleNotifications(value: boolean) {
    if (value) {
      const granted = await ensureNotificationPermissions();
      setPermStatus(await getNotificationPermissionStatus());
      if (!granted) {
        Alert.alert(
          'Notifications désactivées',
          "Pensif n'a pas la permission d'envoyer des rappels. Active-la dans les réglages de ton téléphone si tu changes d'avis.",
        );
        return;
      }
    }
    setNotificationsEnabled(value);
  }

  function confirmReset() {
    Alert.alert(
      'Réinitialiser les données ?',
      'Tes contacts et pensées seront remplacés par les données de démo. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Réinitialiser', style: 'destructive', onPress: resetLocalDemoData },
      ],
    );
  }

  const permLabel =
    permStatus === 'granted' ? 'Autorisées' : permStatus === 'denied' ? 'Refusées par le téléphone' : permStatus === 'unsupported' ? 'Indisponibles sur le web' : 'Pas encore demandées';

  async function openSystemSettings() {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert('Impossible d’ouvrir les réglages', "Ouvre manuellement les réglages de ton téléphone pour autoriser les notifications.");
    }
  }

  // OUTIL DEV UNIQUEMENT (CHANTIER "Data Safety P0-1 — test récupération sans réinstallation",
  // 2026-09-20) — simule une perte complète session/cache local (équivalent d'une réinstallation)
  // sans désinstaller Expo Go, pour tester "J'ai déjà un compte" → récupération. Confirmation
  // demandée avant d'agir (purge locale, même si non destructif côté serveur — les données restent
  // sur Supabase, récupérables via OTP). `devSimulateReinstall` (store.tsx) est elle-même gardée par
  // `__DEV__` ; ce bouton n'est de toute façon jamais rendu hors `__DEV__` (voir plus bas), double
  // protection volontaire contre toute présence en build production.
  function confirmSimulateReinstall() {
    Alert.alert(
      '[Dev] Simuler une réinstallation ?',
      "Déconnecte la session et efface le cache local (contacts/pensées/outbox) de cet appareil, comme après une réinstallation. Tes données restent sur Supabase — testé via \"J'ai déjà un compte\".",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Simuler', style: 'destructive', onPress: () => { void devSimulateReinstall(); } },
      ],
    );
  }

  // Dev helper temporaire (BUG NOTIFICATIONS PENSÉES V2) — indépendant des pensées/contacts, pour
  // distinguer un problème de délivrance OS/Expo d'un problème du planificateur Pensées V2.
  async function testNotification() {
    const identifier = await scheduleTestNotificationIn60Seconds();
    Alert.alert(
      identifier ? 'Notification de test programmée' : 'Échec',
      identifier ? 'Dans 60 secondes environ (voir la console pour l’identifiant).' : 'Permission refusée ou plateforme non supportée (web).',
    );
  }

  return (
    <Screen>
      <SectionLabel theme={theme}>PROFIL</SectionLabel>
      <Card theme={theme}>
        <Row
          theme={theme}
          icon="person-circle-outline"
          label="Prénom"
          value={userName ?? 'Non renseigné'}
          onPress={openNamePrompt}
        />
      </Card>

      <SectionLabel theme={theme}>NOTIFICATIONS</SectionLabel>
      <Card theme={theme}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: theme.ink }]}>Rappels activés</Text>
            <Text style={[styles.rowSub, { color: theme.inkSoft }]}>
              Anniversaires, idées cadeaux à J-14, fêtes de prénom et pensées.
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleToggleNotifications}
            trackColor={{ false: theme.paperDim, true: theme.accent }}
            thumbColor="#fff"
          />
        </View>
        <View style={[styles.divider, { backgroundColor: theme.line }]} />
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.ink, flex: 1 }]}>Permission système</Text>
          <Text style={[styles.rowValue, { color: theme.inkSoft }]}>{permLabel}</Text>
        </View>
        {permStatus === 'denied' && (
          <>
            <View style={[styles.divider, { backgroundColor: theme.line }]} />
            <Pressable onPress={openSystemSettings} style={styles.row}>
              <Ionicons name="settings-outline" size={16} color={theme.accent} style={{ marginRight: 10 }} />
              <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>Ouvrir les réglages du téléphone</Text>
            </Pressable>
          </>
        )}
        {__DEV__ && (
          <>
            <View style={[styles.divider, { backgroundColor: theme.line }]} />
            <Pressable onPress={testNotification} style={styles.row}>
              <Ionicons name="flask-outline" size={16} color={theme.accent} style={{ marginRight: 10 }} />
              <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>
                [Dev] Tester une notification (+60s)
              </Text>
            </Pressable>
          </>
        )}
      </Card>

      <SectionLabel theme={theme}>APPARENCE</SectionLabel>
      <View style={[styles.segmented, { backgroundColor: theme.paperDim }]}>
        {THEME_OPTIONS.map((opt) => {
          const active = themePref === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setThemePref(opt.key)}
              style={[styles.segmentBtn, active && { backgroundColor: theme.card }]}
            >
              <Ionicons name={opt.icon} size={15} color={active ? theme.ink : theme.inkSoft} />
              <Text style={{ color: active ? theme.ink : theme.inkSoft, fontWeight: '700', fontSize: 12 }}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionLabel theme={theme}>DONNÉES</SectionLabel>
      <Card theme={theme}>
        <Row
          theme={theme}
          icon={isSupabaseConfigured ? 'cloud-done-outline' : 'phone-portrait-outline'}
          label="Stockage"
          value={isSupabaseConfigured ? 'Connecté (Supabase)' : 'Local sur cet appareil'}
        />
        <View style={[styles.divider, { backgroundColor: theme.line }]} />
        <Row theme={theme} icon="people-outline" label="Proches suivis" value={String(contacts.length)} />
        <View style={[styles.divider, { backgroundColor: theme.line }]} />
        <Row theme={theme} icon="chatbubble-ellipses-outline" label="Pensées enregistrées" value={String(pensees.length)} />
        {__DEV__ && isSupabaseConfigured && (
          <>
            <View style={[styles.divider, { backgroundColor: theme.line }]} />
            <Pressable onPress={confirmSimulateReinstall} style={styles.row}>
              <Ionicons name="refresh-circle-outline" size={16} color={theme.danger} style={{ marginRight: 10 }} />
              <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 13, flex: 1 }}>[Dev] Simuler une réinstallation</Text>
            </Pressable>
          </>
        )}
      </Card>

      {!isSupabaseConfigured && (
        <Pressable onPress={confirmReset} style={styles.dangerBtn}>
          <Ionicons name="refresh-outline" size={15} color={theme.danger} />
          <Text style={[styles.dangerText, { color: theme.danger }]}>Réinitialiser les données de démo</Text>
        </Pressable>
      )}

      {/* CHANTIER "Data Safety P0-1" (2026-09-20) — visible UNIQUEMENT pour une session anonyme
          (`session.user.is_anonymous === true`, voir store.tsx `isAnonymous`) sur un projet Supabase
          configuré. Une session déjà sécurisée, ou le mode 100% local (`isAnonymous` reste `false`
          par défaut, jamais mis à jour dans ce mode), ne l'affichent jamais. */}
      {isSupabaseConfigured && isAnonymous && (
        <>
          <SectionLabel theme={theme}>COMPTE</SectionLabel>
          <Card theme={theme}>
            {securityStep === 'idle' && (
              <>
                <Text style={[styles.privacyText, { color: theme.inkSoft, marginBottom: 12 }]}>
                  Tes données sont pour l’instant liées uniquement à cet appareil. Ajoute un email pour
                  pouvoir les récupérer si tu changes de téléphone.
                </Text>
                <Pressable onPress={startSecurityFlow} style={styles.securityBtn}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={theme.accent} />
                  <Text style={[styles.securityBtnText, { color: theme.accent }]}>SÉCURISER MES DONNÉES</Text>
                </Pressable>
              </>
            )}

            {securityStep === 'email' && (
              <>
                <Text style={[styles.privacyText, { color: theme.inkSoft, marginBottom: 10 }]}>
                  Quel est ton email ? On t’envoie un code par email.
                </Text>
                <TextInput
                  value={securityEmail}
                  onChangeText={setSecurityEmail}
                  placeholder="ton@email.com"
                  placeholderTextColor={theme.inkSoft}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={[styles.securityInput, { borderColor: theme.line, color: theme.ink }]}
                />
                <View style={styles.securityRow}>
                  <Pressable onPress={resetSecurityFlow} style={styles.actionBtn}>
                    <Text style={{ color: theme.inkSoft, fontWeight: '700', fontSize: 13 }}>Annuler</Text>
                  </Pressable>
                  <Pressable onPress={sendSecurityCode} style={styles.actionBtn}>
                    <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Envoyer le code</Text>
                  </Pressable>
                </View>
              </>
            )}

            {securityStep === 'otp' && (
              <>
                <Text style={[styles.privacyText, { color: theme.inkSoft, marginBottom: 10 }]}>
                  Code envoyé à {securityEmail.trim()}.
                </Text>
                <TextInput
                  value={securityCode}
                  onChangeText={(text) => setSecurityCode(sanitizeOtpInput(text))}
                  placeholder="123456"
                  placeholderTextColor={theme.inkSoft}
                  keyboardType="number-pad"
                  maxLength={OTP_MAX_LENGTH}
                  style={[styles.securityInput, { borderColor: theme.line, color: theme.ink }]}
                />
                <View style={styles.securityRow}>
                  <Pressable onPress={resetSecurityFlow} style={styles.actionBtn}>
                    <Text style={{ color: theme.inkSoft, fontWeight: '700', fontSize: 13 }}>Annuler</Text>
                  </Pressable>
                  <Pressable onPress={() => setSecurityStep('email')} style={styles.actionBtn}>
                    <Text style={{ color: theme.inkSoft, fontWeight: '700', fontSize: 13 }}>Modifier l’email</Text>
                  </Pressable>
                  <Pressable onPress={sendSecurityCode} style={styles.actionBtn}>
                    <Text style={{ color: theme.inkSoft, fontWeight: '700', fontSize: 13 }}>Renvoyer</Text>
                  </Pressable>
                  <Pressable onPress={verifySecurityCode} disabled={!isOtpSubmittable(securityCode)} style={[styles.actionBtn, !isOtpSubmittable(securityCode) && { opacity: 0.4 }]}>
                    <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Vérifier</Text>
                  </Pressable>
                </View>
              </>
            )}

            {securityStep === 'success' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={18} color={theme.sage} />
                <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 13 }}>Compte sécurisé</Text>
              </View>
            )}

            {securityLoading && <ActivityIndicator style={{ marginTop: 10 }} color={theme.accent} />}
            {securityError && <Text style={[styles.securityError, { color: theme.danger }]}>{securityError}</Text>}
          </Card>
        </>
      )}

      <SectionLabel theme={theme}>À PROPOS</SectionLabel>
      <Card theme={theme}>
        <Row theme={theme} icon="information-circle-outline" label="Version" value={APP_VERSION} />
        <View style={[styles.divider, { backgroundColor: theme.line }]} />
        <View style={styles.row}>
          <Text style={[styles.privacyText, { color: theme.inkSoft }]}>
            {isSupabaseConfigured
              ? 'Tes contacts et pensées sont stockés sur ton compte Supabase, accessibles uniquement depuis cet appareil.'
              : "Tes données restent sur cet appareil — rien n'est envoyé à un serveur."}
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

function SectionLabel({ children, theme }: { children: React.ReactNode; theme: any }) {
  return <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>{children}</Text>;
}

function Card({ children, theme }: { children: React.ReactNode; theme: any }) {
  return <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>{children}</View>;
}

function Row({
  theme,
  icon,
  label,
  value,
  onPress,
}: {
  theme: any;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={styles.row}>
      <Ionicons name={icon} size={18} color={theme.inkSoft} style={{ marginRight: 10 }} />
      <Text style={[styles.rowLabel, { color: theme.ink, flex: 1 }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.inkSoft }]}>{value}</Text>
      {onPress && <Ionicons name="chevron-forward" size={16} color={theme.inkSoft} style={{ marginLeft: 6 }} />}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  rowLabel: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  rowValue: { fontSize: 13 },
  divider: { height: 1 },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 9 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 16 },
  dangerText: { fontWeight: '700', fontSize: 13 },
  privacyText: { fontSize: 12, lineHeight: 18, flex: 1 },
  // CHANTIER "Data Safety P0-1" (2026-09-20) — flux "SÉCURISER MES DONNÉES".
  securityBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12 },
  securityBtnText: { fontWeight: '700', fontSize: 13 },
  securityInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  securityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingBottom: 4 },
  actionBtn: { paddingVertical: 4 },
  securityError: { marginTop: 10, fontSize: 12, lineHeight: 17 },
});
