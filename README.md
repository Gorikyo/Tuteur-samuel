# Tuteur Samuel V0.3

Prototype local pensé pour un iPad Pro et l’Apple Pencil.

## Ce qui fonctionne

- charger ou photographier une feuille de devoir ;
- afficher la feuille en grand ;
- écrire dessus au doigt, à la souris ou avec l’Apple Pencil ;
- annuler le dernier geste ;
- activer la gomme ;
- réunir la photo et les annotations avec « Vérifie-moi ».

La correction utilise l’API OpenAI Responses avec un modèle capable de lire les images. L’appel est effectué uniquement côté serveur : aucune clé API n’est exposée dans le navigateur. Sans clé configurée, l’application reste utilisable en mode prototype.

## Lancer le prototype sur Mac

Double-cliquer sur `Lancer Tuteur Samuel.command`.

Ou, dans Terminal :

```bash
cd "/Users/gerylaurent/Library/Mobile Documents/com~apple~CloudDocs/Tuteur-samuel"
npm start
```

Puis ouvrir <http://127.0.0.1:4173>.

## Activer la correction par IA

1. Double-cliquer sur `Configurer OpenAI.command`.
2. Coller une clé API OpenAI lorsque le Mac la demande.
3. Relancer `Lancer Tuteur Samuel.command`.

La clé est enregistrée localement dans `.env`, un fichier ignoré par Git. Le modèle utilisé par défaut est `gpt-6-luna` et peut être remplacé avec `OPENAI_MODEL`.
