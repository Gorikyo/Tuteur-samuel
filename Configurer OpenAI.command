#!/bin/zsh
cd "$(dirname "$0")" || exit 1

echo "Configuration de la correction par IA"
echo "La clé restera uniquement sur ce Mac et ne sera jamais envoyée au navigateur."
echo
read -s "OPENAI_KEY?Collez votre clé API OpenAI, puis appuyez sur Entrée : "
echo

if [[ -z "$OPENAI_KEY" ]]; then
  echo "Aucune clé enregistrée."
  read "?Appuyez sur Entrée pour fermer."
  exit 1
fi

umask 077
printf 'OPENAI_API_KEY=%s\nOPENAI_MODEL=gpt-6-luna\n' "$OPENAI_KEY" > .env
unset OPENAI_KEY

echo
echo "C’est prêt. Relancez maintenant Tuteur Samuel."
read "?Appuyez sur Entrée pour fermer."

