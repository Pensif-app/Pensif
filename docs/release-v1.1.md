# Pensif v1.1 — Publication (brouillon, à valider)

Rien n'est publié ni soumis. Ordre prévu : réponses du support Amazon → politique en ligne → build 9 →
TestFlight → soumission (vers le 8-10 novembre 2026).

## 1 — Notes pour l'App Review (anglais)

> Version 1.1 adds product ideas with affiliate links to Amazon.fr in the "Gift ideas" screen.
>
> How to see it: open any contact (or create one with the "+" button), complete the short quiz, then open
> the "Gift ideas" tab for this contact. Each idea has a "Voir sur Amazon" (View on Amazon) button.
>
> - The button opens the Amazon.fr product page in the system browser or the Amazon app. There is no
>   embedded web view and no in-app purchase or payment.
> - No account and no purchase is needed to review the feature.
> - The app shows no Amazon images, prices or text. An affiliate disclosure ("As an Amazon Partner,
>   Pensif earns from qualifying purchases") is shown on the Gift ideas screen and in Settings, and the privacy policy documents it.
> - Gift ideas are computed on the device from the contact's quiz answers. The affiliate link contains only
>   the product identifier and Pensif's partner tag; it contains no user or contact data.
> - Contact sheet: opening a contact shows a read-only sheet with collapsible cards (gift ideas, portrait,
>   linked thoughts, birthday reminder). The pencil icon at the top right switches to edit mode.
> - "My ideas": ideas you like in the Gift ideas screen are saved in a per-contact list ("Mes idées pour ...")
>   where you can mark one as the gift to offer. This data stays in the contact profile; it is not sent to
>   any AI service.
> - The AI features (voice capture, smart replies) remain opt-in through the consent screens added in 1.0.
>
> Privacy policy: https://pensif-app.fr/confidentialite.html

## 2 — « Nouveautés » (français)

> Des idées cadeaux mieux adaptées à ton budget, avec un lien direct vers Amazon pour chaque idée.
> Les questions de quiz affinent désormais vraiment les propositions, et « Trop cher » ajuste tout de
> suite les suggestions.
> Nouveau : « Mes idées » regroupe les idées que tu aimes pour chaque proche, avec « Offrir celle-ci » pour
> garder l'idée choisie. La fiche d'un proche est aussi plus claire, avec des cartes qui s'ouvrent au toucher.

## 3 — App Privacy (analyse, à revoir avec toi)

- Aucune nouvelle donnée collectée par Pensif : les idées sont calculées sur l'appareil, le lien ne contient
  ni identifiant utilisateur ni donnée du proche.
- Risque : Apple pourrait considérer les liens affiliés comme du marketing. À examiner avant la soumission ;
  pas de changement de déclaration prévu à ce stade.
- Ne pas déclarer de suivi (« tracking ») : Pensif ne croise aucune donnée avec des tiers.

## 4 — Check-list de publication

1. [x] Réponses du support Amazon Partenaires reçues (mention validée, rapports sans identification des acheteurs).
2. [x] Mention d'affiliation : une ligne sous le budget, dans « Mes idées », dans les Réglages et la politique.
3. [x] Code v1.1 et lots A, B, C du build 9 validés sur iPhone, commits poussés.
4. [ ] Politique de confidentialité : date finale, publier sur pensif-app.fr (2 fichiers par SFTP, **avant** la soumission).
5. [ ] Variable EAS `EXPO_PUBLIC_AMAZON_AFFILIATE_ENABLED=1` dans l'environnement `production` (accord requis).
6. [ ] Build 9 (changement de config native) → TestFlight → test complet sur iPhone.
7. [ ] Fiche App Store : vérifier « Langues : Français » après le build 9.
8. [ ] Soumission avec les notes et « Nouveautés » ci-dessus (accord requis).
9. [x] Contrôle manuel des 20 liens fait, tous valides.
10. [ ] Ne jamais acheter ni faire acheter via les liens du compte (§6(u)).
