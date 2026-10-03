# Tuteur Samuel V0.3

Prototype local pensé pour un iPad Pro et l’Apple Pencil.

## Ce qui fonctionne

- charger ou photographier une feuille de devoir ;
- afficher la feuille en grand ;
- écrire dessus au doigt, à la souris ou avec l’Apple Pencil ;
- annuler le dernier geste ;
- activer la gomme ;
- réunir la photo et les annotations avec « Vérifie-moi ».

La correction peut utiliser directement un abonnement ChatGPT compatible grâce à la connexion officielle OpenAI. Les modèles disponibles sont proposés dans l’application. Les jetons de connexion restent sur le Mac et ne sont jamais exposés dans le navigateur ou GitHub.

## Lancer le prototype sur Mac

Double-cliquer sur `Lancer Tuteur Samuel.command`.

Ou, dans Terminal :

```bash
cd "/Users/gerylaurent/Library/Mobile Documents/com~apple~CloudDocs/Tuteur-samuel"
npm start
```

Puis ouvrir <http://127.0.0.1:4173>.

### Essayer sur un iPad

L’iPad et le Mac doivent être connectés au même Wi‑Fi, et Tuteur Samuel doit rester lancé sur le Mac. Ouvrir ensuite dans Safari l’adresse locale du Mac suivie de `:4173` (par exemple `http://192.168.0.36:4173`). L’adresse peut changer lorsque le Mac rejoint un autre réseau.

Pour utiliser ChatGPT sur l’iPad, effectuer d’abord la connexion ChatGPT une fois sur le Mac.

## Connecter ChatGPT

1. Ouvrir l’application.
2. Cliquer sur « Connecter ChatGPT ».
3. Autoriser Tuteur Samuel sur la page officielle OpenAI.
4. Choisir le modèle dans « Réglages IA ».

La connexion est enregistrée uniquement sur ce Mac dans `~/.config/tuteur-samuel`.

## Solution de secours : clé API

1. Double-cliquer sur `Configurer OpenAI.command`.
2. Coller une clé API OpenAI lorsque le Mac la demande.
3. Relancer `Lancer Tuteur Samuel.command`.

La clé est enregistrée localement dans `.env`, un fichier ignoré par Git. Elle n’est utilisée que si ChatGPT n’est pas connecté. Le modèle utilisé par défaut est `gpt-6-luna` et peut être remplacé avec `OPENAI_MODEL`.
