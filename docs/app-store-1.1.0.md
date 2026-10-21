# Pensif 1.1.0 (build 9) : textes prêts à copier dans App Store Connect

Étapes de ton côté : créer la version **1.1.0** dans App Store Connect, y sélectionner le **build 9** (quand il apparaît après traitement), coller les deux textes ci-dessous, puis envoyer pour examen.

---

## 1. « Nouveautés de cette version » (français, champ obligatoire)

```
Pensif 1.1 : des idées cadeaux plus justes et mieux rangées.

• Des idées adaptées à ton budget, avec un lien direct vers Amazon pour chaque idée
• Les questions du quiz affinent vraiment les propositions
• « Mes idées » : retrouve les idées que tu aimes pour chaque proche et choisis celle que tu offres
• « Trop cher » ajuste tout de suite les suggestions suivantes
• Plus d'idées à la demande : 3 de plus à chaque fois
• Une fiche de proche plus claire, avec des cartes qui s'ouvrent au toucher
• Corrections et améliorations
```

---

## 2. Notes pour l'App Review (anglais, champ « Notes »)

```
Version 1.1.0 adds product ideas with affiliate links to Amazon.fr, a per-contact "My ideas" list, and a redesigned contact sheet.

NO ACCOUNT OR LOGIN IS NEEDED. The app creates an anonymous account automatically at first launch. No purchase is needed to review anything.

HOW TO REACH THE NEW FEATURES
1. Open the app and tap the "+" (add a contact) or open an existing contact. A contact needs a first name and a birthday date.
2. Contact sheet (new): opening an existing contact shows a read-only sheet with collapsible cards (Gift ideas, Portrait, Linked thoughts, Birthday reminder) and an "Écrire un message" button. The pencil icon at the top right switches to the edit form. A new contact opens directly in the edit form.
3. Gift ideas: open the "Portrait" card and complete the short quiz (a few taps), then open the "Gift ideas" card and tap "Voir ses idées cadeaux".
4. On the Gift ideas screen: each idea has a "Voir sur Amazon" (View on Amazon) button, a heart ("J'aime cette idée") and "Pas convaincu". "Voir 3 idées de plus" shows more ideas, up to 12.
5. "My ideas" (new): liking an idea moves it to "Mes idées pour <name>", where you can mark one idea as the gift to offer ("Offrir celle-ci") or remove it.

AFFILIATE LINKS (Guideline 5.2 / commerce)
- The "Voir sur Amazon" button opens the Amazon.fr product page in the system browser or the Amazon app. There is no embedded web view, no in-app purchase and no payment inside the app.
- The app shows no Amazon images, prices or product text: each idea has a title, a description and an emoji written by us.
- Pensif participates in the Amazon Partners Program. The links contain only the product identifier and our partner tag. No user or contact data is included in the link.
- An affiliate disclosure ("As an Amazon Partner, Pensif earns from qualifying purchases") is shown on the Gift ideas screen and in "My ideas", and again in Settings and in the privacy policy.

DATA AND PRIVACY
- Gift ideas, "My ideas" and the chosen gift are computed and stored in the contact profile; they are not sent to any AI service.
- The AI features (voice capture, smart replies) are unchanged from version 1.0: they are opt-in, with the consent screens added in 1.0 (Guidelines 5.1.1(i) and 5.1.2(i)).
- No tracking, no advertising identifier, no new permission compared with 1.0.
- Privacy policy (updated): https://pensif-app.fr/confidentialite.html
```

---

## 3. Vérifications à faire dans App Store Connect

- **Langue de la fiche** : après traitement du build 9, vérifier que « Langues » affiche bien Français (le correctif `CFBundleLocalizations: fr` est dans ce build).
- **App Privacy** : aucune modification prévue (les idées restent sur l'appareil et dans le profil du proche ; le lien d'affiliation ne contient aucune donnée personnelle). À confirmer avant l'envoi si tu as un doute sur la catégorie « Interaction avec le produit ».
- **Sortie** : choisir « Publier automatiquement » ou « manuellement » selon ce que tu préfères pour cette version.
- **URL de la politique** : https://pensif-app.fr/confidentialite.html (déjà à jour, elle mentionne les liens Amazon et « Mes idées »).
- **Règle à ne pas oublier** : ne jamais acheter ni faire acheter via les liens du compte Amazon Partenaires (§6(u) du programme).
