# Tuteur Samuel pour iPad

Cette application remplace uniquement l’interface de dessin web par une interface SwiftUI utilisant PencilKit. Elle conserve le serveur, les prompts et les appels OpenAI du prototype existant.

## Architecture

- `PKCanvasView` fournit l’écriture Apple Pencil et le rejet de la paume natifs.
- La photo et le dessin sont fusionnés en JPEG au moment de la vérification.
- Le JPEG est envoyé à l’endpoint existant `/api/verify`.
- Les coordonnées renvoyées par le serveur deviennent des marqueurs translucides natifs.
- Les devoirs précédents sont archivés dans le stockage privé de l’application.
- Le mode Live existant est chargé dans une vue web intégrée avec `?voice=1`.
- La clé API reste exclusivement sur le serveur.

## Ouverture

Ouvrir `TuteurSamuel.xcodeproj` dans Xcode. La cible est limitée à l’iPad et utilise iPadOS 17 ou plus récent.

L’adresse initiale du serveur est `https://Gery-McBookAirM2.local:4174`. Elle peut être modifiée depuis les réglages de l’application.
