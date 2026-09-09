import { useColorScheme } from 'react-native';
import { light, dark, Palette } from './colors';
import { useStore } from '../data/store';

export function useTheme(): Palette {
  const systemScheme = useColorScheme();
  const { themePref } = useStore();
  const resolved = themePref === 'system' ? systemScheme : themePref;
  return resolved === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 14, lg: 18, pill: 999 };
