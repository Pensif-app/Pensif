// CHANTIER "App Review 5.1.1(i)/5.1.2(i)" (2026-10-14) — dialogue de demande d'autorisation (action positive explicite :
// deux boutons, aucun accord présumé ; fermer le dialogue sans choisir = refus).
import { Alert } from 'react-native';
import { AI_CONSENT_COPY, AiConsentScope } from '../data/aiConsent';

export function askAiConsent(scope: AiConsentScope): Promise<boolean> {
  const copy = AI_CONSENT_COPY[scope];
  return new Promise((resolve) => {
    Alert.alert(
      copy.title,
      copy.message,
      [
        { text: copy.refuseLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: copy.allowLabel, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
