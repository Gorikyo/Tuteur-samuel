#!/bin/zsh
set -euo pipefail

OPENSSL_BIN="/opt/homebrew/bin/openssl"
if [[ ! -x "$OPENSSL_BIN" ]]; then
  OPENSSL_BIN="$(command -v openssl)"
fi

CONFIG_DIR="$HOME/.config/tuteur-samuel/tls"
LOCAL_NAME="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
LOCAL_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [[ -z "$LOCAL_IP" ]]; then
  LOCAL_IP="$(ifconfig | awk '/inet 192\.168\.|inet 10\.|inet 172\.(1[6-9]|2[0-9]|3[01])\./ { print $2; exit }')"
fi

SUBJECT_ALT_NAMES="DNS:${LOCAL_NAME}.local,DNS:localhost,IP:127.0.0.1"
if [[ -n "$LOCAL_IP" ]]; then
  SUBJECT_ALT_NAMES="${SUBJECT_ALT_NAMES},IP:${LOCAL_IP}"
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

"$OPENSSL_BIN" req -x509 -newkey rsa:3072 -sha256 -nodes -days 3650 \
  -subj "/CN=Tuteur Samuel Local CA" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -keyout "$WORK_DIR/root-ca-key.pem" -out "$WORK_DIR/root-ca.pem"

"$OPENSSL_BIN" req -new -newkey rsa:2048 -sha256 -nodes \
  -subj "/CN=${LOCAL_NAME}.local" \
  -addext "subjectAltName=${SUBJECT_ALT_NAMES}" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth" \
  -keyout "$WORK_DIR/server-key.pem" -out "$WORK_DIR/server.csr"

"$OPENSSL_BIN" x509 -req -sha256 -days 825 \
  -in "$WORK_DIR/server.csr" \
  -CA "$WORK_DIR/root-ca.pem" -CAkey "$WORK_DIR/root-ca-key.pem" -CAcreateserial \
  -copy_extensions copy -out "$WORK_DIR/server-cert.pem"

"$OPENSSL_BIN" x509 -in "$WORK_DIR/root-ca.pem" -outform DER -out "$WORK_DIR/root-ca.cer"

mkdir -p "$CONFIG_DIR"
chmod 700 "$HOME/.config/tuteur-samuel" "$CONFIG_DIR"
install -m 600 "$WORK_DIR/root-ca-key.pem" "$CONFIG_DIR/root-ca-key.pem"
install -m 600 "$WORK_DIR/server-key.pem" "$CONFIG_DIR/server-key.pem"
install -m 644 "$WORK_DIR/root-ca.pem" "$CONFIG_DIR/root-ca.pem"
install -m 644 "$WORK_DIR/root-ca.cer" "$CONFIG_DIR/root-ca.cer"
install -m 644 "$WORK_DIR/server-cert.pem" "$CONFIG_DIR/server-cert.pem"

echo
echo "HTTPS est prêt."
echo "Sur l’iPad, ouvre d’abord :"
echo "http://${LOCAL_NAME}.local:4173/installer-https"
echo
if [[ -t 0 ]]; then
  read -k 1 "?Appuie sur une touche pour fermer cette fenêtre."
  echo
fi
