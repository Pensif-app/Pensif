import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Retire les caractères de contrôle (codes 0-31 et 127-159 — espaces insécables, retours à la
// ligne, etc. qu'un `.trim()` seul ne retire pas toujours selon leur position) qu'une variable
// d'environnement EAS/Metro peut injecter de façon invisible, avant de parser l'URL. Écrit via une
// boucle sur les code points plutôt qu'une regex à échappements unicode, pour éviter toute
// ambiguïté d'échappement selon l'outil qui édite ce fichier.
function stripControlChars(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const isControlChar = (code <= 31) || (code >= 127 && code <= 159);
    if (!isControlChar) out += value[i];
  }
  return out;
}

const cleanEnvValue = (value?: string) => {
  if (value == null) return value;
  return stripControlChars(value).trim().replace(/^["']|["']$/g, '');
};

const url = cleanEnvValue(rawUrl);
const anonKey = cleanEnvValue(rawAnonKey);

function isValidSupabaseUrl(value?: string): value is string {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export const isSupabaseConfigured =
  isValidSupabaseUrl(url) && Boolean(anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
