# Tuteur Samuel

Le dépôt contient le prototype web V0.3 et la première version de l’application iPad native.

## Application iPad native

Le dossier `ios/` contient une application SwiftUI utilisant PencilKit, le même moteur de dessin natif que les applications iPad. Elle réutilise le serveur et les endpoints OpenAI existants.

Fonctions préparées :

- photo ou photothèque ;
- calque PencilKit avec rejet de la paume natif ;
- gomme et annulation ;
- fusion photo + écriture au moment de la vérification ;
- correction via `/api/verify` et marqueurs translucides ;
- archives locales avec rapport ;
- conversation Live réutilisée dans une vue web intégrée.

Ouvrir `ios/TuteurSamuel.xcodeproj` avec Xcode. Voir `ios/README.md` pour l’architecture.

## Prototype web

## Ce qui fonctionne

- charger ou photographier une feuille de devoir ;
- afficher la feuille en grand ;
- écrire dessus au doigt, à la souris ou avec l’Apple Pencil ;
- utiliser le mode « Stylet seul » pour ignorer la paume et les doigts ;
- annuler le dernier geste ;
- activer la gomme ;
- réunir la photo et les annotations avec « Vérifie-moi » ;
- afficher des bulles numérotées sur les points à revoir.

La correction peut utiliser directement un abonnement ChatGPT compatible grâce à la connexion officielle OpenAI. Les modèles disponibles sont proposés dans l’application. Les jetons de connexion restent sur le Mac et ne sont jamais exposés dans le navigateur ou GitHub.

## Lancer le prototype sur Mac

Double-cliquer sur `Lancer Tuteur Samuel.command`.

Ou, dans Terminal :

```bash
cd "/Users/gerylaurent/Library/Mobile Documents/com~apple~CloudDocs/Tuteur-samuel"
npm start
```

Puis ouvrir <http://127.0.0.1:4173>.

### Essayer le prototype web sur un iPad

L’iPad et le Mac doivent être connectés au même Wi‑Fi, et Tuteur Samuel doit rester lancé sur le Mac. Après l’installation locale du certificat, ouvrir `https://Gery-McBookAirM2.local:4174`.

Pour utiliser ChatGPT sur l’iPad, effectuer d’abord la connexion ChatGPT une fois sur le Mac.

## Connecter ChatGPT

1. Ouvrir l’application.
2. Cliquer sur « Connecter ChatGPT ».
3. Autoriser Tuteur Samuel sur la page officielle OpenAI.
4. Choisir le modèle dans « Réglages IA ».

La connexion est enregistrée uniquement sur ce Mac dans `~/.config/tuteur-samuel`.

Le modèle d’analyse recommandé est sélectionné automatiquement lorsqu’il est disponible. La correction utilise l’image en qualité originale et demande des coordonnées pour placer les bulles.

## Conversation vocale

Le bouton « Parler » démarre une conversation avec `gpt-live-1` lorsque la clé API est configurée. La clé reste sur le serveur local et n’est jamais transmise au navigateur. Chaque séance est limitée automatiquement à 20 minutes.

Le microphone fonctionne sur le Mac et sur l’adresse HTTPS de l’iPad. L’application native réutilise ce module vocal dans une vue web intégrée.

## Solution de secours : clé API

1. Double-cliquer sur `Configurer OpenAI.command`.
2. Coller une clé API OpenAI lorsque le Mac la demande.
3. Relancer `Lancer Tuteur Samuel.command`.

La clé est enregistrée dans le dossier privé `~/.config/tuteur-samuel/api.env`, hors du projet, d’iCloud et de GitHub. Elle n’est utilisée que si ChatGPT n’est pas connecté ou lorsqu’une fonction nécessitant l’API est activée. Le modèle utilisé par défaut est `gpt-6-luna` et peut être remplacé avec `OPENAI_MODEL`.
