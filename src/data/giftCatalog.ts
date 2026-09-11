import { InterestTag, TraitKey } from './types';

export type GiftTier = '20' | '50' | '100';

export type CuratedGift = {
  id: string;
  theme: InterestTag;
  /** Indicatif seulement (héritage des 3 paliers d'origine) — le moteur de recommandation score
   *  par `price` réel contre le budget demandé, il ne sélectionne plus par palier fixe. */
  tier: GiftTier;
  title: string;
  asin: string;
  price: number;
  emoji: string;
  /** URL de la vraie image produit (extraite de la fiche Amazon — data-old-hires), pas une URL
   *  devinée : l'ancien format "legacy" (/images/P/{asin}...) ne fonctionne que par coïncidence
   *  pour certains ASIN et renvoie une image vide/placeholder pour les autres sans jamais déclencher
   *  d'erreur réseau, d'où les fonds vides observés. Chaque produit stocke maintenant l'URL réelle
   *  de son image (/images/I/{id}...), vérifiée le 2026-09-11 avec le titre/prix/stock. */
  imageUrl: string;
  /** Trait de personnalité auquel ce produit correspond le mieux (voir computeTraits dans
   *  quiz.ts) — utilisé par le moteur de recommandation pour bonifier les produits alignés avec
   *  le portrait du contact. */
  trait?: TraitKey;
  /** Clés libres recoupant les réponses d'affinage par thème (voir themeQuizzes.ts), ex. 'setup'
   *  pour un accessoire gaming quand focus === 'setup'. Optionnel, purement un bonus de score. */
  tags?: string[];
};

const AMAZON_TAG = 'pensif-21';

export function amazonUrl(asin: string): string {
  return `https://www.amazon.fr/dp/${asin}?tag=${AMAZON_TAG}`;
}

/**
 * Catalogue affilié : les 20 thèmes du quiz, 3 à 6 produits réels par thème (86 au total). Chaque
 * ASIN a été vérifié en direct sur Amazon.fr (titre, prix, statut de stock) le 2026-09-11 — une
 * fiche produit peut disparaître ou passer en rupture avec le temps, à recontrôler périodiquement.
 * "tech" est volontairement non-audio (batterie/webcam/montre connectée) pour ne pas faire doublon
 * avec les enceintes/casques déjà proposés sur "musique" et "danse".
 */
export const CURATED_GIFTS: CuratedGift[] = [
  { id: 'tech-20', theme: 'tech', tier: '20', title: 'Batterie externe compacte Anker', asin: 'B0886C3SR8', price: 21, emoji: '🔋', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/71nnhUVPJmL._SL1118_.jpg' },
  { id: 'tech-50', theme: 'tech', tier: '50', title: 'Webcam Logitech Brio 500', asin: 'B07W5JKKFJ', price: 80, emoji: '📷', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/61+9FV3bNwL._AC_SL1500_.jpg' },
  { id: 'tech-100', theme: 'tech', tier: '100', title: 'Montre connectée Amazfit Bip Max', asin: 'B0GWHMXWGL', price: 100, emoji: '⌚', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/61MHTVMdnEL._AC_SL1500_.jpg' },
  { id: 'tech-charge', theme: 'tech', tier: '20', title: 'Chargeur USB-C rapide 20W (lot de 2)', asin: 'B0G5WYLSN8', price: 20, emoji: '🔌', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/611IRkb7f6L._AC_SL1500_.jpg' },

  { id: 'musique-20', theme: 'musique', tier: '20', title: 'Accordeur et capodastre de guitare', asin: 'B07VJJ3T1N', price: 15, emoji: '🎸', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/61qL1XTAe0L._AC_SL1000_.jpg', tags: ['jouer'] },
  { id: 'musique-50', theme: 'musique', tier: '50', title: 'Casque JBL Tune 510BT', asin: 'B08VDJYLS5', price: 42, emoji: '🎧', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/51KgWxg+Y6L._AC_SL1000_.jpg', tags: ['streaming'] },
  { id: 'musique-100', theme: 'musique', tier: '100', title: 'Enceinte Marshall Emberton II', asin: 'B09XXW54QG', price: 134, emoji: '🎶', trait: 'social', imageUrl: 'https://m.media-amazon.com/images/I/81fkcBjZndL._AC_SL1500_.jpg', tags: ['streaming', 'concerts'] },
  { id: 'musique-vinyle', theme: 'musique', tier: '50', title: 'Platine vinyle Bluetooth portable', asin: 'B0DSW5X2F7', price: 80, emoji: '📀', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/81ZJyoHJOkL._AC_SL1500_.jpg', tags: ['vinyle'] },

  { id: 'cuisine-20', theme: 'cuisine', tier: '20', title: 'Balance de cuisine électronique', asin: 'B06X9NQ8GX', price: 15, emoji: '⚖️', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/815FWesbK3L._AC_SL1500_.jpg', tags: ['patisserie'] },
  { id: 'cuisine-50', theme: 'cuisine', tier: '50', title: 'Cafetière à piston Bodum Chambord', asin: 'B00PW53CR6', price: 26, emoji: '☕', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/51JNh1zjtoL._AC_SL1200_.jpg', tags: ['cafe'] },
  { id: 'cuisine-100', theme: 'cuisine', tier: '100', title: 'Machine à café Nespresso Vertuo Next', asin: 'B0BYK2THLB', price: 149, emoji: '🫘', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/51oWc8WbLoL._AC_SL1500_.jpg', tags: ['cafe'] },
  { id: 'cuisine-mixeur', theme: 'cuisine', tier: '50', title: 'Mixeur plongeant multifonction', asin: 'B0F4WXYSYR', price: 34, emoji: '🥣', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/71b3fSAQuBL._AC_SL1500_.jpg' },
  { id: 'cuisine-couteaux', theme: 'cuisine', tier: '100', title: 'Set de couteaux de cuisine japonais', asin: 'B0DQXNCHDX', price: 111, emoji: '🔪', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/71-CSB5OFgL._AC_SL1500_.jpg' },

  { id: 'sport-20', theme: 'sport', tier: '20', title: 'Tapis de yoga antidérapant', asin: 'B0CYC66G2C', price: 31, emoji: '🧘', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/81nmHBz7yiL._AC_SL1500_.jpg' },
  { id: 'sport-50', theme: 'sport', tier: '50', title: 'Bracelet connecté Xiaomi Smart Band 7', asin: 'B0CCXZKXCD', price: 89, emoji: '⌚', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/71wxTaxgqkL._AC_SL1500_.jpg' },
  { id: 'sport-100', theme: 'sport', tier: '100', title: 'Pistolet de massage musculaire', asin: 'B0BMKD1HG7', price: 114, emoji: '💪', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/61tj8l38MqL._AC_SL1500_.jpg' },
  { id: 'sport-halteres', theme: 'sport', tier: '20', title: 'Haltères néoprène (1-10 kg)', asin: 'B07V4VDDVZ', price: 15, emoji: '🏋️', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/71ZqBw2rQbL._AC_SL1500_.jpg' },
  { id: 'sport-ecouteurs', theme: 'sport', tier: '100', title: 'Écouteurs sport à conduction osseuse Shokz', asin: 'B0D2HKQWHX', price: 199, emoji: '🎧', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/51PNVC1+B8L._AC_SL1500_.jpg' },

  { id: 'lecture-20', theme: 'lecture', tier: '20', title: 'Lampe de lecture LED rechargeable', asin: 'B08GG42WXY', price: 13, emoji: '💡', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/81n7M-T19NL._AC_SL1500_.jpg' },
  { id: 'lecture-50', theme: 'lecture', tier: '50', title: 'Coffret carnet et stylo Moleskine x Kaweco', asin: 'B0B55XSNNV', price: 47, emoji: '📓', trait: 'sentimental', imageUrl: 'https://m.media-amazon.com/images/I/71oROb5mjiL._AC_SL1500_.jpg' },
  { id: 'lecture-100', theme: 'lecture', tier: '100', title: 'Liseuse Kindle Paperwhite', asin: 'B0CFPWLGF2', price: 225, emoji: '📖', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/618KCWbDUWL._AC_SL1000_.jpg' },
  { id: 'lecture-stylo', theme: 'lecture', tier: '20', title: 'Stylo plume en bois', asin: 'B08T9Y898T', price: 35, emoji: '🖋️', trait: 'sentimental', imageUrl: 'https://m.media-amazon.com/images/I/51bqn1--ZbL._AC_SL1000_.jpg' },

  { id: 'mode-20', theme: 'mode', tier: '20', title: 'Montre Casio Vintage', asin: 'B002SG6ZA8', price: 25, emoji: '🕰️', trait: 'sentimental', imageUrl: 'https://m.media-amazon.com/images/I/61j9gAryDhL._AC_SL1500_.jpg' },
  { id: 'mode-50', theme: 'mode', tier: '50', title: 'Sac à dos Eastpak Padded Pak’r', asin: 'B000CRBEJ2', price: 32, emoji: '🎒', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/81fOUr20J+L._AC_SL1500_.jpg' },
  { id: 'mode-100', theme: 'mode', tier: '100', title: 'Lunettes de soleil Ray-Ban Wayfarer', asin: 'B004SOA3ZG', price: 118, emoji: '🕶️', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/41Pjk9Ass2L._AC_SL1484_.jpg' },
  { id: 'mode-portefeuille', theme: 'mode', tier: '50', title: 'Portefeuille en cuir avec protection RFID', asin: 'B0D6WF3LZY', price: 40, emoji: '👛', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/91jxcGsgC4L._AC_SL1500_.jpg' },

  { id: 'bienetre-20', theme: 'bienetre', tier: '20', title: 'Diffuseur d’huiles essentielles', asin: 'B07ZP9F6P9', price: 19, emoji: '🕯️', trait: 'sentimental', imageUrl: 'https://m.media-amazon.com/images/I/51xVEWH35EL._AC_SL1500_.jpg' },
  { id: 'bienetre-50', theme: 'bienetre', tier: '50', title: 'Couverture lestée anti-stress', asin: 'B0CN5NRJLH', price: 48, emoji: '🛌', trait: 'sentimental', imageUrl: 'https://m.media-amazon.com/images/I/61MluSOo1yL._AC_SL1024_.jpg' },
  { id: 'bienetre-100', theme: 'bienetre', tier: '100', title: 'Pistolet de massage Renpho', asin: 'B08JZ7TL94', price: 90, emoji: '💆', trait: 'experience', imageUrl: 'https://m.media-amazon.com/images/I/71RCqBCt8ZL._AC_SL1500_.jpg' },
  { id: 'bienetre-rouleau', theme: 'bienetre', tier: '20', title: 'Rouleau de massage plantaire', asin: 'B0C23X74J6', price: 17, emoji: '🦶', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/611TpwuiETL._AC_SL1500_.jpg' },
  { id: 'bienetre-bain', theme: 'bienetre', tier: '20', title: 'Coffret bombes de bain parfumées', asin: 'B07B4J4RW7', price: 23, emoji: '🛁', trait: 'sentimental', imageUrl: 'https://m.media-amazon.com/images/I/719iZBGGdoL._AC_SL1500_.jpg' },

  { id: 'gaming-20', theme: 'gaming', tier: '20', title: 'Souris gaming Logitech G203', asin: 'B01MYQ4HJD', price: 41, emoji: '🖱️', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/51GII39qJFL._AC_SL1280_.jpg', tags: ['setup'] },
  { id: 'gaming-50', theme: 'gaming', tier: '50', title: 'Casque gaming sans fil Logitech G435', asin: 'B07W4DHMVB', price: 45, emoji: '🎮', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/81WfRjLX93L._AC_SL1500_.jpg', tags: ['setup'] },
  { id: 'gaming-100', theme: 'gaming', tier: '100', title: 'Clavier mécanique gaming Logitech G413 TKL SE', asin: 'B07W7KNWKK', price: 36, emoji: '⌨️', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/61U-zlxQmWL._AC_SL1500_.jpg', tags: ['setup'] },
  // "Lié à ses jeux préférés" plutôt qu'au setup : impossible de deviner un produit dérivé précis
  // pour une licence donnée dans un catalogue statique — une carte cadeau de sa plateforme laisse
  // {prenom} choisir lui-même dans son propre univers de jeux, sans jamais inventer un goût précis.
  { id: 'gaming-fandom-playstation', theme: 'gaming', tier: '50', title: 'Carte PlayStation Store 50€', asin: 'B00NHCQ82W', price: 50, emoji: '🎮', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/619csB4nvCL._AC_SL1064_.jpg', tags: ['fandom', 'playstation'] },
  { id: 'gaming-fandom-xbox', theme: 'gaming', tier: '20', title: 'Carte cadeau Xbox 25€', asin: 'B0186L8XK8', price: 25, emoji: '🎮', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/61STPpTRC6L._AC_SL1500_.jpg', tags: ['fandom', 'xbox'] },
  { id: 'gaming-fandom-nintendo', theme: 'gaming', tier: '20', title: 'Carte Nintendo eShop 25€', asin: 'B07VBGSFPQ', price: 25, emoji: '🎮', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/61SHk6khcvL._AC_SL1000_.jpg', tags: ['fandom', 'nintendo'] },
  { id: 'gaming-manette', theme: 'gaming', tier: '100', title: 'Manette sans fil PS5 DualSense', asin: 'B094WLFGD3', price: 75, emoji: '🎮', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/41Tbaf3tXKL._AC_SL1008_.jpg', tags: ['setup', 'playstation'] },
  { id: 'gaming-tapis', theme: 'gaming', tier: '20', title: 'Tapis de souris gaming XXL', asin: 'B0F2T5SH4B', price: 28, emoji: '🖥️', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/81IazTFv6SL._AC_SL1500_.jpg', tags: ['setup'] },

  { id: 'voyage-20', theme: 'voyage', tier: '20', title: 'Trousse de toilette suspendue', asin: 'B0B8Y9STYR', price: 20, emoji: '🧴', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/71DiXcFNcJL._AC_SL1500_.jpg' },
  { id: 'voyage-50', theme: 'voyage', tier: '50', title: 'Oreiller de voyage à mémoire de forme', asin: 'B0CYPZBKV7', price: 20, emoji: '💤', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/811Uwtx86UL._AC_SL1500_.jpg' },
  { id: 'voyage-100', theme: 'voyage', tier: '100', title: 'Set de valises de voyage (3 pièces)', asin: 'B0GPRSMCQG', price: 150, emoji: '🧳', trait: 'experience', imageUrl: 'https://m.media-amazon.com/images/I/71zE5vQsNHL._AC_SL1500_.jpg' },
  { id: 'voyage-adaptateur', theme: 'voyage', tier: '20', title: 'Adaptateur de prise universel', asin: 'B0B2DRC76L', price: 24, emoji: '🔌', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/61fyJNX1vGL._AC_SL1500_.jpg' },

  { id: 'collection-20', theme: 'collection', tier: '20', title: 'LEGO Botanicals Les Nénuphars', asin: 'B0FPXL53FK', price: 28, emoji: '🪷', trait: 'sentimental', imageUrl: 'https://m.media-amazon.com/images/I/71Hc55A1PeL._AC_SL1500_.jpg' },
  { id: 'collection-50', theme: 'collection', tier: '50', title: 'LEGO Classic grande boîte de briques', asin: 'B01MSZQ37V', price: 50, emoji: '🧱', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/81OWz7DHCgL._AC_SL1500_.jpg' },
  { id: 'collection-100', theme: 'collection', tier: '100', title: 'LEGO Architecture Notre-Dame de Paris', asin: 'B0CWH1M12W', price: 161, emoji: '🏛️', trait: 'sentimental', imageUrl: 'https://m.media-amazon.com/images/I/81cndZ5bvpL._AC_SL1500_.jpg' },
  { id: 'collection-pokemon', theme: 'collection', tier: '50', title: 'LEGO Pokémon Pikachu interactif', asin: 'B0GK86VB5T', price: 65, emoji: '🧩', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/81HzARTpoTL._AC_SL1500_.jpg' },

  { id: 'maison-20', theme: 'maison', tier: '20', title: 'Plaid polaire premium', asin: 'B08DKKNMCD', price: 17, emoji: '🛋️', trait: 'sentimental', imageUrl: 'https://m.media-amazon.com/images/I/71F3BUfQe9L._AC_SL1500_.jpg' },
  { id: 'maison-50', theme: 'maison', tier: '50', title: 'Bougie parfumée bois de oud', asin: 'B0GBW9XPR8', price: 30, emoji: '🕯️', trait: 'sentimental', imageUrl: 'https://m.media-amazon.com/images/I/71dNXvO994L._AC_SL1500_.jpg' },
  { id: 'maison-100', theme: 'maison', tier: '100', title: 'Kit de démarrage Philips Hue', asin: 'B0D7QN79LH', price: 175, emoji: '💡', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/61u+A6TSojL._AC_SL1500_.jpg' },
  { id: 'maison-cadre', theme: 'maison', tier: '100', title: 'Cadre photo numérique connecté', asin: 'B0CJYLSSH6', price: 83, emoji: '🖼️', trait: 'sentimental', imageUrl: 'https://m.media-amazon.com/images/I/71quptL7EVL._AC_SL1500_.jpg' },

  { id: 'auto-20', theme: 'auto', tier: '20', title: 'Support téléphone voiture magnétique', asin: 'B0GVFQ3XCS', price: 18, emoji: '📱', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/61m1S8oIazL._AC_SL1494_.jpg' },
  { id: 'auto-50', theme: 'auto', tier: '50', title: 'Aspirateur portable sans fil pour voiture', asin: 'B0GVN5DP4T', price: 57, emoji: '🚗', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/71zDc8yhwuL._AC_SL1500_.jpg' },
  { id: 'auto-100', theme: 'auto', tier: '100', title: 'Dashcam Vantrue 3 caméras', asin: 'B0F59T1B4N', price: 280, emoji: '📹', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/81yhvVyVm2L._AC_SL1500_.jpg' },
  { id: 'auto-batterie', theme: 'auto', tier: '50', title: 'Booster de batterie de démarrage portable', asin: 'B08BG6KDFT', price: 56, emoji: '🔋', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/71O4gSNzf7L._AC_SL1500_.jpg' },

  { id: 'nature-20', theme: 'nature', tier: '20', title: 'Gobelet isotherme en inox', asin: 'B0GWMVD91H', price: 17, emoji: '🥤', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/41ZvM2iQ3eL._AC_SL1024_.jpg' },
  { id: 'nature-50', theme: 'nature', tier: '50', title: 'Jumelles compactes Nikon Aculon', asin: 'B0822JBM3J', price: 70, emoji: '🔭', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/61J8k-m9EHL._AC_SL1500_.jpg' },
  { id: 'nature-100', theme: 'nature', tier: '100', title: 'Sac à dos de randonnée Osprey 40L', asin: 'B0FGXZR4NR', price: 134, emoji: '🏕️', trait: 'experience', imageUrl: 'https://m.media-amazon.com/images/I/71BZYPQxa+L._AC_SL1500_.jpg' },
  { id: 'nature-couteau', theme: 'nature', tier: '100', title: 'Outil multifonction Leatherman Signal', asin: 'B0777HG5ZB', price: 159, emoji: '🔪', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/61b7Je80wFL._AC_SL1500_.jpg' },

  { id: 'cinema-20', theme: 'cinema', tier: '20', title: 'Coffret de bonbons rétro', asin: 'B09TZ39L7Y', price: 25, emoji: '🍬', trait: 'sentimental', imageUrl: 'https://m.media-amazon.com/images/I/71rXS2yqUwL._AC_SL1448_.jpg' },
  { id: 'cinema-50', theme: 'cinema', tier: '50', title: 'Enceinte Bluetooth Soundcore Boom 2', asin: 'B0CQ6WNXKF', price: 90, emoji: '🔊', trait: 'social', imageUrl: 'https://m.media-amazon.com/images/I/71V8VvvZPAL._AC_SL1500_.jpg' },
  { id: 'cinema-100', theme: 'cinema', tier: '100', title: 'Mini vidéoprojecteur portable Kodak', asin: 'B078NCG82N', price: 219, emoji: '📽️', trait: 'experience', imageUrl: 'https://m.media-amazon.com/images/I/61I9qqoPsVL._AC_SL1500_.jpg' },
  { id: 'cinema-chromecast', theme: 'cinema', tier: '100', title: 'Google TV Streamer', asin: 'B0DBM2QF8F', price: 118, emoji: '📺', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/51lM8VgB-qL._AC_SL1500_.jpg' },

  { id: 'art-20', theme: 'art', tier: '20', title: 'Carnet de croquis papier aquarelle', asin: 'B0FXWGSHG4', price: 24, emoji: '🎨', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/811KWn6bUFL._AC_SL1500_.jpg' },
  { id: 'art-50', theme: 'art', tier: '50', title: 'Coffret 60 crayons de couleur Faber-Castell', asin: 'B01FDKQG2W', price: 17, emoji: '✏️', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/916b+p5whdL._AC_SL1500_.jpg' },
  { id: 'art-100', theme: 'art', tier: '100', title: 'Tablette graphique Wacom Intuos', asin: 'B09DSVJWH6', price: 89, emoji: '🖊️', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/61T4kMUQKrL._AC_SL1500_.jpg' },
  { id: 'art-posca', theme: 'art', tier: '100', title: 'Mallette 24 marqueurs Posca', asin: 'B078JXHWKG', price: 76, emoji: '🖍️', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/81a8aGLegrL._AC_SL1500_.jpg' },

  { id: 'animaux-20', theme: 'animaux', tier: '20', title: 'Jouet laser interactif pour chat', asin: 'B0F4XHPM27', price: 28, emoji: '🐾', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/81ciFmipGtL._AC_SL1500_.jpg' },
  { id: 'animaux-50', theme: 'animaux', tier: '50', title: 'Panier orthopédique pour chien', asin: 'B0BNLWVPHD', price: 50, emoji: '🐶', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/61E5+Tg-R9L._AC_SL1500_.jpg' },
  { id: 'animaux-100', theme: 'animaux', tier: '100', title: 'Fontaine à eau connectée Petkit', asin: 'B0CXPG7K79', price: 78, emoji: '🐱', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/61rZtv4MxeL._AC_SL1500_.jpg' },

  { id: 'photo-20', theme: 'photo', tier: '20', title: 'Trépied smartphone flexible', asin: 'B0GCLBX9VZ', price: 30, emoji: '📱', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/61-Q7BxKRfL._AC_SL1300_.jpg' },
  { id: 'photo-50', theme: 'photo', tier: '50', title: 'Imprimante photo Fujifilm Instax Link 2', asin: 'B0B1QV6RKW', price: 110, emoji: '🖨️', trait: 'sentimental', imageUrl: 'https://m.media-amazon.com/images/I/61O8zngPoPL._AC_SL1500_.jpg' },
  { id: 'photo-100', theme: 'photo', tier: '100', title: 'Appareil photo instantané Fujifilm Instax Mini 13', asin: 'B0H3CGPVP5', price: 88, emoji: '📸', trait: 'experience', imageUrl: 'https://m.media-amazon.com/images/I/71n+FYS6FiL._AC_SL1500_.jpg' },
  { id: 'photo-films', theme: 'photo', tier: '20', title: 'Recharge films Instax Mini (20 poses)', asin: 'B0000C73CQ', price: 18, emoji: '🎞️', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/61bLsZejhPL._AC_SL1200_.jpg' },

  { id: 'jardinage-20', theme: 'jardinage', tier: '20', title: 'Gants de jardinage (lot)', asin: 'B0DCK8VZR7', price: 18, emoji: '🧤', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/91XBadzwYBL._SL1500_.jpg' },
  { id: 'jardinage-50', theme: 'jardinage', tier: '50', title: 'Kit d’arrosage automatique goutte-à-goutte', asin: 'B0C5Q9T5MQ', price: 40, emoji: '💧', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/81aGxKh2hHL._AC_SL1500_.jpg' },
  { id: 'jardinage-100', theme: 'jardinage', tier: '100', title: 'Potager d’intérieur connecté Click & Grow', asin: 'B0778YCS5T', price: 239, emoji: '🌱', trait: 'curious', imageUrl: 'https://m.media-amazon.com/images/I/71vxSHn8c8L._AC_SL1500_.jpg' },
  { id: 'jardinage-secateur', theme: 'jardinage', tier: '50', title: 'Sécateur électrique sans fil', asin: 'B0G6CR9X2J', price: 60, emoji: '✂️', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/71An09qbZeL._AC_SL1500_.jpg' },

  { id: 'bricolage-20', theme: 'bricolage', tier: '20', title: 'Tournevis à cliquet Bosch', asin: 'B0BX9DT6C3', price: 20, emoji: '🔧', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/41vYejwhevL._AC_SL1500_.jpg' },
  { id: 'bricolage-50', theme: 'bricolage', tier: '50', title: 'Mini-tournevis électrique de précision', asin: 'B0BGWRWRX2', price: 50, emoji: '🪛', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/71eqWLbXipL._AC_SL1500_.jpg' },
  { id: 'bricolage-100', theme: 'bricolage', tier: '100', title: 'Perceuse-visseuse sans fil Bosch', asin: 'B09PLKVRT6', price: 110, emoji: '🔩', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/616F2e-GgDL._AC_SL1500_.jpg' },
  { id: 'bricolage-multi', theme: 'bricolage', tier: '50', title: 'Outil multifonction sans fil Einhell', asin: 'B07SF1KPG8', price: 48, emoji: '🛠️', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/81O6ChLL5GL._AC_SL1500_.jpg' },

  { id: 'danse-20', theme: 'danse', tier: '20', title: 'Boule à facettes disco LED', asin: 'B09379LLZ7', price: 17, emoji: '🪩', trait: 'social', imageUrl: 'https://m.media-amazon.com/images/I/71fiFdPQaYL._AC_SL1500_.jpg' },
  { id: 'danse-50', theme: 'danse', tier: '50', title: 'Barre de danse portable', asin: 'B0FL2P8QTH', price: 47, emoji: '💃', trait: 'practical', imageUrl: 'https://m.media-amazon.com/images/I/61BKbEKujDL._SL1500_.jpg' },
  { id: 'danse-100', theme: 'danse', tier: '100', title: 'Enceinte Bluetooth Bose SoundLink Flex', asin: 'B0D6WD2QSQ', price: 139, emoji: '🔊', trait: 'social', imageUrl: 'https://m.media-amazon.com/images/I/7192Qca-fUL._AC_SL1500_.jpg' },
  { id: 'danse-led', theme: 'danse', tier: '20', title: 'Guirlande lumineuse LED d’ambiance', asin: 'B08G8RCVST', price: 30, emoji: '✨', trait: 'social', imageUrl: 'https://m.media-amazon.com/images/I/71BDFj57coL._AC_SL1500_.jpg' },
];

export const COVERED_THEMES: InterestTag[] = [
  'tech', 'musique', 'cuisine', 'sport', 'lecture', 'mode', 'bienetre', 'gaming',
  'voyage', 'collection', 'maison', 'auto', 'nature', 'cinema', 'art', 'animaux',
  'photo', 'jardinage', 'bricolage', 'danse',
];

export function curatedGiftsForThemes(themes: InterestTag[]): CuratedGift[] {
  return CURATED_GIFTS.filter((g) => themes.includes(g.theme));
}
