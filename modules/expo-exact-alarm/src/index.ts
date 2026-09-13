import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

type ExpoExactAlarmModule = {
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): void;
};

// null sur iOS/web (le module n'est déclaré que pour "android" — voir expo-module.config.json),
// et aussi en Expo Go / tout binaire qui n'a pas encore embarqué ce module natif (nécessite un
// nouveau build de développement, voir eas build --profile development).
const native = requireOptionalNativeModule<ExpoExactAlarmModule>('ExpoExactAlarm');

/**
 * true si l'app peut programmer des alarmes EXACTES sur Android (sinon expo-notifications bascule
 * silencieusement sur des alarmes inexactes, cf. audit "notifications systématiquement en retard").
 * Toujours true hors Android, et sur Android < 12 (aucune restriction avant l'API 31).
 */
export function canScheduleExactAlarms(): boolean {
  if (Platform.OS !== 'android') return true;
  if (!native) return true; // build natif pas encore à jour — ne bloque rien, juste pas de vérif possible
  return native.canScheduleExactAlarms();
}

/** Ouvre l'écran système "Alarmes et rappels" scopé à Pensif. No-op hors Android ou avant l'API 31. */
export function openExactAlarmSettings(): void {
  if (Platform.OS !== 'android' || !native) return;
  native.openExactAlarmSettings();
}
