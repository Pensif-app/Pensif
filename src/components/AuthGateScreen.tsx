// CHANTIER "Data Safety P0-1 — récupération du compte / conversion anonyme → permanent" (2026-09-20).
// Rendu en overlay plein écran (même principe que SplashOverlay.tsx — sibling de RootNavigator dans
// App.tsx, jamais inséré dans la pile de navigation) UNIQUEMENT quand `store.authGate === 'choice'`
// (2 conditions : Supabase configuré ET aucune session existante, voir store.tsx). Aucun utilisateur
// anonyme temporaire n'est créé tant que l'utilisateur n'a pas explicitement choisi "Continuer" —
// et le chemin "J'ai déjà un compte" n'en crée JAMAIS (shouldCreateUser:false, authRepo.ts).
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Keyboard, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from './PrimaryButton';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import {
  OTP_MAX_LENGTH,
  describeAuthErrorCode,
  isOtpSubmittable,
  requestExistingAccountOtp,
  sanitizeOtpInput,
  verifyExistingAccountOtp,
} from '../lib/authRepo';

type Step = 'choice' | 'email' | 'otp';

export function AuthGateScreen() {
  const theme = useTheme();
  const store = useStore();
  const [step, setStep] = useState<Step>('choice');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetToChoice() {
    setStep('choice');
    setCode('');
    setError(null);
    setLoading(false);
  }

  async function handleContinueAnonymously() {
    setLoading(true);
    setError(null);
    try {
      await store.chooseAnonymous();
      // Succès → authGate repasse à 'none' côté store, ce composant n'est alors plus rendu du tout.
    } catch (e) {
      setLoading(false);
      setError(e instanceof Error ? e.message : 'Impossible de démarrer — vérifie ta connexion et réessaie.');
    }
  }

  async function handleSendCode() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Renseigne ton adresse email.');
      return;
    }
    setLoading(true);
    setError(null);
    const result = await requestExistingAccountOtp(trimmed);
    setLoading(false);
    if (!result.ok) {
      setError(describeAuthErrorCode(result.code, result.message));
      return;
    }
    Keyboard.dismiss();
    setStep('otp');
  }

  async function handleVerifyCode() {
    const trimmed = code.trim();
    if (!isOtpSubmittable(trimmed)) {
      setError('Saisis le code reçu par email.');
      return;
    }
    setLoading(true);
    setError(null);
    const result = await verifyExistingAccountOtp(email.trim(), trimmed);
    if (!result.ok) {
      setLoading(false);
      setError(describeAuthErrorCode(result.code, result.message));
      return;
    }
    try {
      // Même chemin de boot que "Continuer" (initializeForSession, voir store.tsx) — jamais une
      // seconde implémentation. `isAnonymous:false` : verifyExistingAccountOtp ne peut réussir que
      // contre un compte PERMANENT existant (jamais une session anonyme fraîchement créée ici).
      await store.completeAuthWithSession({ userId: result.userId, isAnonymous: false });
    } catch (e) {
      setLoading(false);
      setError(e instanceof Error ? e.message : 'Une erreur est survenue pendant le chargement de tes données.');
      return;
    }
    // Succès → authGate repasse à 'none', ce composant n'est alors plus rendu.
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.paper }]}>
      <SafeAreaView style={styles.safe}>
        {/* CORRECTIF "Auth P0-1 — clavier iOS" (2026-09-20) : même pattern que CalendarScreen.tsx
            (behavior="padding" iOS uniquement, offset fixe petit et non lié à un modèle d'iPhone
            précis) — le champ OTP remonte au-dessus du clavier au lieu d'être masqué dessous. */}
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.ink }]}>Pensif</Text>

          {step === 'choice' && (
            <>
              <Text style={[styles.subtitle, { color: theme.inkSoft }]}>
                Garde tes pensées et tes proches en toute simplicité.
              </Text>
              <View style={styles.actions}>
                <PrimaryButton label="Continuer" onPress={handleContinueAnonymously} />
                <PrimaryButton label="J’ai déjà un compte" variant="secondary" onPress={() => { resetToChoice(); setStep('email'); }} />
              </View>
            </>
          )}

          {step === 'email' && (
            <>
              <Text style={[styles.subtitle, { color: theme.inkSoft }]}>
                Entre l’email associé à ton compte Pensif — on t’envoie un code par email.
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="ton@email.com"
                placeholderTextColor={theme.inkSoft}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.card }]}
              />
              <View style={styles.actions}>
                <PrimaryButton label="Envoyer le code" onPress={handleSendCode} />
                <PrimaryButton label="Annuler" variant="secondary" onPress={resetToChoice} />
              </View>
            </>
          )}

          {step === 'otp' && (
            <>
              <Text style={[styles.subtitle, { color: theme.inkSoft }]}>Code envoyé à {email.trim()}.</Text>
              <TextInput
                value={code}
                onChangeText={(text) => setCode(sanitizeOtpInput(text))}
                placeholder="123456"
                placeholderTextColor={theme.inkSoft}
                keyboardType="number-pad"
                maxLength={OTP_MAX_LENGTH}
                style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.card }]}
              />
              <View style={styles.actions}>
                <PrimaryButton label="Vérifier" onPress={handleVerifyCode} disabled={!isOtpSubmittable(code)} />
                <PrimaryButton label="Renvoyer le code" variant="secondary" onPress={handleSendCode} />
                <PrimaryButton label="Modifier l’adresse email" variant="secondary" onPress={() => setStep('email')} />
                <PrimaryButton label="Annuler" variant="secondary" onPress={resetToChoice} />
              </View>
            </>
          )}

          {loading && <ActivityIndicator style={{ marginTop: 16 }} color={theme.accent} />}
          {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 16 },
  actions: { gap: 10 },
  error: { marginTop: 14, fontSize: 13, textAlign: 'center' },
});
