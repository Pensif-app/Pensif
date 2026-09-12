import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from './types';

/** Permet de naviguer depuis en dehors d'un composant écran (ex. le tap sur une notification,
 *  reçu potentiellement avant qu'aucun écran ne soit monté) — voir notifications.ts. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
