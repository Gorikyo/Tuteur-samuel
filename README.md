# Tuteur Samuel V0.3

Prototype local pensé pour un iPad Pro et l’Apple Pencil.

## Ce qui fonctionne

- charger ou photographier une feuille de devoir ;
- afficher la feuille en grand ;
- écrire dessus au doigt, à la souris ou avec l’Apple Pencil ;
- annuler le dernier geste ;
- activer la gomme ;
- réunir la photo et les annotations avec « Vérifie-moi ».

La correction par intelligence artificielle n’est pas encore connectée. Le point d’entrée sécurisé `/api/verify` est déjà en place côté serveur afin qu’aucune clé API ne soit exposée dans le navigateur.

## Lancer le prototype sur Mac

Double-cliquer sur `Lancer Tuteur Samuel.command`.

Ou, dans Terminal :

```bash
cd "/Users/gerylaurent/Library/Mobile Documents/com~apple~CloudDocs/Tuteur-samuel"
npm start
```

Puis ouvrir <http://127.0.0.1:4173>.

