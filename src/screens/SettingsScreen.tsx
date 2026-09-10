import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { useStore, ThemePref } from '../data/store';
import { useTheme } from '../theme';
import { isSupabaseConfigured } from '../lib/supabase';
import { ensureNotificationPermissions, getNotificationPermissionStatus } from '../lib/notifications';

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
  } = useStore();

  const [permStatus, setPermStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unsupported'>('undetermined');

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
        <Row theme={theme} icon="people-outline" label="Contacts suivis" value={String(contacts.length)} />
        <View style={[styles.divider, { backgroundColor: theme.line }]} />
        <Row theme={theme} icon="chatbubble-ellipses-outline" label="Pensées enregistrées" value={String(pensees.length)} />
      </Card>

      {!isSupabaseConfigured && (
        <Pressable onPress={confirmReset} style={styles.dangerBtn}>
          <Ionicons name="refresh-outline" size={15} color={theme.danger} />
          <Text style={[styles.dangerText, { color: theme.danger }]}>Réinitialiser les données de démo</Text>
        </Pressable>
      )}

      <SectionLabel theme={theme}>À PROPOS</SectionLabel>
      <Card theme={theme}>
        <Row theme={theme} icon="information-circle-outline" label="Version" value="1.0.0" />
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
});
