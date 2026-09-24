import { useColorScheme } from 'react-native';
import { light, dark, Palette } from './colors';
import { useStore } from '../data/store';

// Thème Pensif RÉSOLU (jamais le thème système iOS seul) : 'system' suit l'apparence de l'appareil,
// 'light'/'dark' l'emportent. Source UNIQUE de cette règle (useTheme + useIsDark).
function resolveIsDark(themePref: string, systemScheme: string | null | undefined): boolean {
  return (themePref === 'system' ? systemScheme : themePref) === 'dark';
}

export function useTheme(): Palette {
  const systemScheme = useColorScheme();
  const { themePref } = useStore();
  return resolveIsDark(themePref, systemScheme) ? dark : light;
}

/** Booléen du thème Pensif résolu — pour themeVariant des DateTimePicker natifs iOS (le spinner suit sinon
 *  l'apparence système, pas le thème Pensif). Hook séparé plutôt qu'un champ de Palette : n'altère pas le
 *  typage des accès par clé de la palette (ex. CalendarScreen). */
export function useIsDark(): boolean {
  const systemScheme = useColorScheme();
  const { themePref } = useStore();
  return resolveIsDark(themePref, systemScheme);
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 14, lg: 18, pill: 999 };
