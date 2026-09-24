// CHANTIER "Mini tutoriel onboarding global" (2026-09-24) — maquettes STATIQUES des écrans montrés par le
// tutoriel (Accueil, Proches, Nouveau proche, Pensées, Capture, Calendrier Mois/Semaine), alimentées de
// données fictives : jamais les vrais écrans (vides pour un nouvel utilisateur, dépendants du Store).
// DA sombre/néon fixe, indépendante du thème Pensif choisi (le tutoriel est un moment "immersif").
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TutorialMockId } from '../data/tutorial';

export const NEON = { blue: '#4CC9FF', pink: '#FF5CAA', violet: '#9B7CFF' };
const C = { card: 'rgba(255,255,255,0.07)', line: 'rgba(255,255,255,0.14)', ink: '#F4F2FF', soft: '#A9A5C9', red: '#FF5A6B' };

function Bar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={s.bar}>
      <Text style={s.barTitle}>{title}</Text>
      {right}
    </View>
  );
}
function Card({ children, tone }: { children: React.ReactNode; tone?: 'red' | 'violet' }) {
  return <View style={[s.card, tone === 'red' && { borderColor: C.red, backgroundColor: 'rgba(255,90,107,0.14)' }, tone === 'violet' && { borderColor: NEON.violet }]}>{children}</View>;
}
function Label({ children }: { children: string }) {
  return <Text style={s.label}>{children}</Text>;
}
function Line({ title, sub, dot }: { title: string; sub?: string; dot?: string }) {
  return (
    <View style={s.line}>
      <View style={[s.dot, { backgroundColor: dot ?? NEON.violet }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.lineTitle}>{title}</Text>
        {sub ? <Text style={s.lineSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}
function TabBar({ active }: { active: number }) {
  const tabs: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { icon: 'home-outline', label: 'Accueil' },
    { icon: 'chatbubble-ellipses-outline', label: 'Pensées' },
    { icon: 'calendar-outline', label: 'Calendrier' },
    { icon: 'people-outline', label: 'Proches' },
    { icon: 'gift-outline', label: 'Cadeaux' },
  ];
  return (
    <View style={s.tabBar}>
      {tabs.map((t, i) => (
        <View key={t.label} style={s.tab}>
          <Ionicons name={t.icon} size={18} color={i === active ? NEON.violet : C.soft} />
          <Text style={[s.tabLabel, { color: i === active ? NEON.violet : C.soft }]}>{t.label}</Text>
        </View>
      ))}
    </View>
  );
}
function Fab({ icon }: { icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={s.fab}>
      <Ionicons name={icon} size={22} color="#fff" />
    </View>
  );
}

function Home() {
  return (
    <>
      <Bar title="Bonjour Camille" right={<Ionicons name="settings-outline" size={18} color={C.soft} />} />
      <Label>AUJOURD’HUI</Label>
      <Card tone="red"><Line title="Anniversaire de Léa" sub="Aujourd’hui · 32 ans" dot={C.red} /></Card>
      <Card tone="red"><Line title="Rappel : appeler Papa" sub="Aujourd’hui · 18h30" dot={C.red} /></Card>
      <Label>CETTE SEMAINE</Label>
      <Card><Line title="Idée cadeau pour Marc" sub="Vendredi" /></Card>
      <Label>À ANTICIPER</Label>
      <Card><Line title="Anniversaire de Nora" sub="Dans 3 semaines" dot={NEON.blue} /></Card>
      <View style={{ flex: 1 }} />
      <TabBar active={0} />
    </>
  );
}
function Proches() {
  return (
    <>
      <Bar title="Mes proches" />
      <Card><Line title="Léa" sub="Quiz complet · 12 goûts" dot={NEON.pink} /></Card>
      <Card><Line title="Marc" sub="Quiz à compléter" dot={NEON.blue} /></Card>
      <Card><Line title="Papa" sub="Quiz complet · 9 goûts" dot={NEON.violet} /></Card>
      <Card><Line title="Nora" sub="Quiz non commencé" dot={C.soft} /></Card>
      <View style={{ flex: 1 }} />
      <Fab icon="add" />
      <TabBar active={3} />
    </>
  );
}
function NouveauProche() {
  return (
    <>
      <Bar title="Nouveau proche" />
      <Card tone="violet"><Line title="Importer depuis mes contacts" dot={NEON.blue} /></Card>
      <Card><Line title="Prénom" sub="Léa" /></Card>
      <Card><Line title="Date de naissance" sub="14 mars" /></Card>
      <Card><Line title="Relation" sub="Amie" /></Card>
      <Card><Line title="Ce qu’elle aime" sub="Thé, plantes, cinéma" dot={NEON.pink} /></Card>
      <View style={{ flex: 1 }} />
      <TabBar active={3} />
    </>
  );
}
function Pensees() {
  return (
    <>
      <Bar title="Pensées" right={<Ionicons name="filter-outline" size={18} color={NEON.pink} />} />
      <Label>AUJOURD’HUI</Label>
      <Card tone="red"><Line title="Appeler Papa pour son rendez-vous" sub="Rappel 18h30" dot={C.red} /></Card>
      <Label>À VENIR</Label>
      <Card><Line title="Marc cherche un nouveau casque" sub="Vendredi" /></Card>
      <Label>MÉMORISÉES</Label>
      <Card><Line title="Léa adore les pivoines" dot={NEON.pink} /></Card>
      <View style={{ flex: 1 }} />
      <View style={s.fabRow}>
        <Fab icon="add" />
        <Fab icon="mic" />
      </View>
      <TabBar active={1} />
    </>
  );
}
function Capture() {
  return (
    <>
      <Bar title="Capture" />
      <View style={s.micWrap}>
        <View style={s.micRing}><Ionicons name="mic" size={40} color="#fff" /></View>
        <Text style={s.micHint}>Maintiens pour parler</Text>
      </View>
      <Card tone="violet">
        <Text style={s.lineTitle}>Rappelle-moi demain à 18h d’appeler Papa</Text>
        <Text style={s.lineSub}>Rappel demain · 18:00 · Papa</Text>
      </Card>
      <View style={{ flex: 1 }} />
      <View style={s.cta}><Text style={s.ctaText}>Faire confiance à Pensif</Text></View>
    </>
  );
}
function Mois() {
  const days = Array.from({ length: 35 }, (_, i) => i + 1);
  const marks: Record<number, string> = { 6: NEON.pink, 12: NEON.blue, 14: NEON.violet, 21: NEON.pink, 27: NEON.blue };
  return (
    <>
      <Bar title="Calendrier" right={<Text style={s.seg}>Mois · Semaine</Text>} />
      <Text style={s.month}>Septembre 2026</Text>
      <View style={s.grid}>
        {days.map((d) => (
          <View key={d} style={s.cell}>
            <Text style={[s.cellText, d > 30 && { opacity: 0.25 }]}>{d > 30 ? d - 30 : d}</Text>
            {marks[d] ? <View style={[s.mark, { backgroundColor: marks[d] }]} /> : null}
          </View>
        ))}
      </View>
      <Card><Line title="14 septembre · Anniversaire de Léa" dot={NEON.violet} /></Card>
      <View style={{ flex: 1 }} />
      <Fab icon="add" />
      <TabBar active={2} />
    </>
  );
}
function Semaine() {
  const week = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  return (
    <>
      <Bar title="Calendrier" right={<Text style={s.seg}>Mois · Semaine</Text>} />
      <Text style={s.month}>Semaine du 21 septembre</Text>
      <View style={s.weekRow}>
        {week.map((d, i) => (
          <View key={d} style={[s.weekCell, i === 2 && { borderColor: NEON.violet }]}>
            <Text style={s.cellText}>{d}</Text>
            <Text style={s.cellText}>{21 + i}</Text>
          </View>
        ))}
      </View>
      <Card><Line title="Mer · Rappel appeler Papa" sub="18:30" dot={C.red} /></Card>
      <Card><Line title="Ven · Idée cadeau pour Marc" dot={NEON.blue} /></Card>
      <Card><Line title="Sam · Fête de Léa" dot={NEON.pink} /></Card>
      <View style={{ flex: 1 }} />
      <TabBar active={2} />
    </>
  );
}

const MOCKS: Record<TutorialMockId, () => React.ReactElement> = {
  home: Home,
  proches: Proches,
  nouveauProche: NouveauProche,
  pensees: Pensees,
  capture: Capture,
  calendrierMois: Mois,
  calendrierSemaine: Semaine,
};

export function TutorialMock({ id }: { id: TutorialMockId }) {
  const Comp = MOCKS[id];
  return (
    <View style={s.screen}>
      <Comp />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: 'rgba(12,10,32,0.85)', padding: 12, gap: 8, overflow: 'hidden' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  barTitle: { color: C.ink, fontSize: 17, fontWeight: '800' },
  seg: { color: NEON.blue, fontSize: 11, fontWeight: '700' },
  label: { color: C.soft, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginTop: 4 },
  card: { borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 10, paddingVertical: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  lineTitle: { color: C.ink, fontSize: 12, fontWeight: '700' },
  lineSub: { color: C.soft, fontSize: 10, marginTop: 1 },
  tabBar: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 },
  tab: { alignItems: 'center', gap: 1 },
  tabLabel: { fontSize: 8, fontWeight: '700' },
  fab: { width: 40, height: 40, borderRadius: 20, backgroundColor: NEON.violet, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end', shadowColor: NEON.violet, shadowOpacity: 0.8, shadowRadius: 10, elevation: 6 },
  fabRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  micWrap: { alignItems: 'center', gap: 8, marginVertical: 10 },
  micRing: { width: 88, height: 88, borderRadius: 44, backgroundColor: NEON.violet, alignItems: 'center', justifyContent: 'center', shadowColor: NEON.pink, shadowOpacity: 0.9, shadowRadius: 18, elevation: 8 },
  micHint: { color: C.soft, fontSize: 11 },
  cta: { borderRadius: 12, backgroundColor: NEON.violet, paddingVertical: 11, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  month: { color: C.ink, fontSize: 13, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 5 },
  cellText: { color: C.ink, fontSize: 11 },
  mark: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  weekRow: { flexDirection: 'row', gap: 4 },
  weekCell: { flex: 1, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: C.line, paddingVertical: 6 },
});
