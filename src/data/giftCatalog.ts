import { InterestTag } from './types';

export type GiftTier = '20' | '50' | '100';

export type CuratedGift = {
  id: string;
  theme: InterestTag;
  tier: GiftTier;
  title: string;
  asin: string;
  price: number;
  emoji: string;
};

const AMAZON_TAG = 'pensif-21';

export function amazonUrl(asin: string): string {
  return `https://www.amazon.fr/dp/${asin}?tag=${AMAZON_TAG}`;
}

/**
 * Format d'image historique d'Amazon (pas besoin de clé d'API) — encore servi pour beaucoup
 * d'ASIN, mais pas garanti à 100% : l'UI doit toujours prévoir un repli sur l'emoji si l'image ne
 * charge pas (voir CuratedGiftCard dans GiftsScreen.tsx).
 */
export function amazonImageUrl(asin: string): string {
  return `https://m.media-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_SX400_.jpg`;
}

/**
 * V1 du catalogue affilié : 8 thèmes prioritaires, 3 produits réels par thème (un par palier de
 * budget). Chaque ASIN a été vérifié en direct sur Amazon.fr (titre, prix, statut de stock) le
 * 2026-09-11 — une fiche produit peut disparaître ou passer en rupture avec le temps, à recontrôler
 * périodiquement. Les 12 autres thèmes du quiz retombent sur le catalogue générique (giftEngine.ts)
 * en attendant d'être enrichis ici.
 */
export const CURATED_GIFTS: CuratedGift[] = [
  { id: 'tech-20', theme: 'tech', tier: '20', title: 'Batterie externe compacte Anker', asin: 'B0886C3SR8', price: 21, emoji: '🔋' },
  { id: 'tech-50', theme: 'tech', tier: '50', title: 'Enceinte Bluetooth JBL Clip 4', asin: 'B08HRWSYH6', price: 55, emoji: '🔊' },
  { id: 'tech-100', theme: 'tech', tier: '100', title: 'Enceinte Bluetooth JBL Charge 5', asin: 'B08VDNCZT9', price: 130, emoji: '📻' },

  { id: 'musique-20', theme: 'musique', tier: '20', title: 'Accordeur et capodastre de guitare', asin: 'B07VJJ3T1N', price: 15, emoji: '🎸' },
  { id: 'musique-50', theme: 'musique', tier: '50', title: 'Casque JBL Tune 510BT', asin: 'B08VDJYLS5', price: 42, emoji: '🎧' },
  { id: 'musique-100', theme: 'musique', tier: '100', title: 'Enceinte Marshall Emberton II', asin: 'B09XXW54QG', price: 134, emoji: '🎶' },

  { id: 'cuisine-20', theme: 'cuisine', tier: '20', title: 'Balance de cuisine électronique', asin: 'B06X9NQ8GX', price: 15, emoji: '⚖️' },
  { id: 'cuisine-50', theme: 'cuisine', tier: '50', title: 'Cafetière à piston Bodum Chambord', asin: 'B00PW53CR6', price: 26, emoji: '☕' },
  { id: 'cuisine-100', theme: 'cuisine', tier: '100', title: 'Machine à café Nespresso Vertuo Next', asin: 'B0BYK2THLB', price: 149, emoji: '🫘' },

  { id: 'sport-20', theme: 'sport', tier: '20', title: 'Tapis de yoga antidérapant', asin: 'B0CYC66G2C', price: 31, emoji: '🧘' },
  { id: 'sport-50', theme: 'sport', tier: '50', title: 'Bracelet connecté Xiaomi Smart Band 7', asin: 'B0CCXZKXCD', price: 89, emoji: '⌚' },
  { id: 'sport-100', theme: 'sport', tier: '100', title: 'Pistolet de massage musculaire', asin: 'B0BMKD1HG7', price: 114, emoji: '💪' },

  { id: 'lecture-20', theme: 'lecture', tier: '20', title: 'Lampe de lecture LED rechargeable', asin: 'B08GG42WXY', price: 13, emoji: '💡' },
  { id: 'lecture-50', theme: 'lecture', tier: '50', title: 'Coffret carnet et stylo Moleskine x Kaweco', asin: 'B0B55XSNNV', price: 47, emoji: '📓' },
  { id: 'lecture-100', theme: 'lecture', tier: '100', title: 'Liseuse Kindle Paperwhite', asin: 'B0CFPWLGF2', price: 225, emoji: '📖' },

  { id: 'mode-20', theme: 'mode', tier: '20', title: 'Montre Casio Vintage', asin: 'B002SG6ZA8', price: 25, emoji: '🕰️' },
  { id: 'mode-50', theme: 'mode', tier: '50', title: 'Sac à dos Eastpak Padded Pak’r', asin: 'B000CRBEJ2', price: 32, emoji: '🎒' },
  { id: 'mode-100', theme: 'mode', tier: '100', title: 'Lunettes de soleil Ray-Ban Wayfarer', asin: 'B004SOA3ZG', price: 118, emoji: '🕶️' },

  { id: 'bienetre-20', theme: 'bienetre', tier: '20', title: 'Diffuseur d’huiles essentielles', asin: 'B07ZP9F6P9', price: 19, emoji: '🕯️' },
  { id: 'bienetre-50', theme: 'bienetre', tier: '50', title: 'Couverture lestée anti-stress', asin: 'B0CN5NRJLH', price: 48, emoji: '🛌' },
  { id: 'bienetre-100', theme: 'bienetre', tier: '100', title: 'Pistolet de massage Renpho', asin: 'B08JZ7TL94', price: 90, emoji: '💆' },

  { id: 'gaming-20', theme: 'gaming', tier: '20', title: 'Souris gaming Logitech G203', asin: 'B01MYQ4HJD', price: 41, emoji: '🖱️' },
  { id: 'gaming-50', theme: 'gaming', tier: '50', title: 'Casque gaming sans fil Logitech G435', asin: 'B07W4DHMVB', price: 45, emoji: '🎮' },
  { id: 'gaming-100', theme: 'gaming', tier: '100', title: 'Clavier mécanique gaming Logitech G413 TKL SE', asin: 'B07W7KNWKK', price: 36, emoji: '⌨️' },
];

export const COVERED_THEMES: InterestTag[] = ['tech', 'musique', 'cuisine', 'sport', 'lecture', 'mode', 'bienetre', 'gaming'];

export function curatedGiftsForThemes(themes: InterestTag[]): CuratedGift[] {
  return CURATED_GIFTS.filter((g) => themes.includes(g.theme));
}
