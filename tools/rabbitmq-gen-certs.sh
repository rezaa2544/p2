#!/usr/bin/env bash
# tools/rabbitmq-gen-certs.sh — M15-07: گواهی‌های TLS برای RabbitMQ (CA + سرور)
# ─────────────────────────────────────────────────────────────────────
#   استفاده: bash tools/rabbitmq-gen-certs.sh <پوشهٔ خروجی> [CN]
#   خروجی: ca.crt + ca.key (فقط برای امضا — امن نگه داشته شود) +
#          server.crt + server.key با SAN = DNS:rabbitmq,DNS:localhost,IP:127.0.0.1
#   تمامِ خروجی‌ها 0600؛ *.crt/*.key/*.pem در .gitignore هستند و هرگز
#   کامیت نمی‌شوند (R96). در تولید، CA باید از PKI واقعی مالک باشد —
#   این اسکریپت برای staging/drill/self-host است.
set -euo pipefail

OUT_DIR="${1:?مسیرِ خروجی را بدهید: bash tools/rabbitmq-gen-certs.sh <dir> [CN]}"
CN="${2:-payesh-rabbitmq}"

mkdir -p "$OUT_DIR"
chmod 0700 "$OUT_DIR"

# ۱) CA خودامضا (۳۶۵۰ روز)
openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
  -keyout "$OUT_DIR/ca.key" -out "$OUT_DIR/ca.crt" \
  -subj "/CN=${CN} CA/O=Payesh" \
  >/dev/null 2>&1

# ۲) کلید + CSR سرور
openssl req -newkey rsa:4096 -sha256 -nodes \
  -keyout "$OUT_DIR/server.key" -out "$OUT_DIR/server.csr" \
  -subj "/CN=${CN}/O=Payesh" \
  >/dev/null 2>&1

# ۳) امضای گواهی سرور با SAN (hostname کانتینر + localhost)
cat > "$OUT_DIR/server.ext" <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:rabbitmq,DNS:localhost,IP:127.0.0.1
EOF
openssl x509 -req -in "$OUT_DIR/server.csr" -CA "$OUT_DIR/ca.crt" -CAkey "$OUT_DIR/ca.key" \
  -CAcreateserial -days 825 -sha256 -extfile "$OUT_DIR/server.ext" \
  -out "$OUT_DIR/server.crt" >/dev/null 2>&1

rm -f "$OUT_DIR/server.csr" "$OUT_DIR/server.ext"
chmod 0600 "$OUT_DIR"/*.key "$OUT_DIR"/*.crt

echo "OK: certs در $OUT_DIR (ca.crt/server.crt/server.key — 0600، gitignored)"
echo "برای RabbitMQ فایل‌ها باید ca.crt/server.crt/server.key نام داشته باشند ✓"
