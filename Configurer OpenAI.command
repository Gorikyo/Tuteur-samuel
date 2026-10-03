#!/bin/zsh
cd "$(dirname "$0")" || exit 1

echo "Configuration de Tuteur Samuel"
echo "La clé sera enregistrée dans le dossier privé de ce Mac."
echo "Elle ne sera placée ni dans iCloud, ni dans GitHub, ni dans le navigateur."
echo
read -s "OPENAI_KEY?Collez votre clé API OpenAI, puis appuyez sur Entrée : "
echo

if [[ -z "$OPENAI_KEY" ]]; then
  echo "Aucune clé enregistrée."
  read "?Appuyez sur Entrée pour fermer."
  exit 1
fi

umask 077
CONFIG_DIR="$HOME/.config/tuteur-samuel"
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
printf 'OPENAI_API_KEY=%s\nOPENAI_MODEL=gpt-6-luna\n' "$OPENAI_KEY" > "$CONFIG_DIR/api.env"
chmod 600 "$CONFIG_DIR/api.env"
unset OPENAI_KEY

echo
echo "C’est prêt. La clé est enregistrée uniquement sur ce Mac."
echo "Relancez maintenant Tuteur Samuel."
read "?Appuyez sur Entrée pour fermer."
