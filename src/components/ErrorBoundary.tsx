import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; resetKey: number };

/**
 * Filet de sécurité global minimal (voir CHANTIER PRÉ-BÊTA 2 §5) : une exception React inattendue,
 * n'importe où dans l'arbre, affiche cet état de récupération plutôt qu'un écran blanc muet.
 * Volontairement placée AUTOUR de StoreProvider/ThemeProvider dans App.tsx — elle doit pouvoir
 * catcher une exception dans ces providers eux-mêmes, donc elle n'utilise jamais `useTheme()` ni
 * aucun contexte applicatif ; les couleurs reprennent simplement celles du splash screen (app.json)
 * pour rester cohérentes avec la DA sans dépendre du thème résolu.
 *
 * "Réessayer" ne redémarre pas le processus natif (aucune API fiable déjà présente dans le projet
 * pour ça, et ce serait un hack) — il incrémente `resetKey`, qui force React à démonter puis
 * remonter tout l'arbre enfant (via la prop `key`), ce qui suffit à sortir d'un état cassé dans la
 * grande majorité des cas (exception ponctuelle de rendu, pas une corruption de state persistant).
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, resetKey: 0 };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    if (__DEV__) {
      console.error('[Pensif] exception non interceptée', error, info.componentStack);
    }
  }

  handleRetry = () => {
    this.setState((prev) => ({ hasError: false, resetKey: prev.resetKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Un problème est survenu</Text>
          <Text style={styles.body}>Pensif a rencontré une erreur inattendue.</Text>
          <Pressable onPress={this.handleRetry} style={styles.button}>
            <Text style={styles.buttonLabel}>Réessayer</Text>
          </Pressable>
        </View>
      );
    }
    return <View key={this.state.resetKey} style={styles.flexFull}>{this.props.children}</View>;
  }
}

const styles = StyleSheet.create({
  flexFull: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: '#1A1437',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  body: { color: 'rgba(255,255,255,0.75)', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  button: { marginTop: 24, backgroundColor: '#7257E8', paddingHorizontal: 24, paddingVertical: 13, borderRadius: 12 },
  buttonLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
