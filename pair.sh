#!/data/data/com.termux/files/usr/bin/bash
# Vincula ZENITSU BOT mostrando un código nuevo.
# Uso normal:      bash pair.sh
# Código estándar: PAIRING_STANDARD=1 bash pair.sh
cd "$(dirname "$0")" || exit 1

# Evita que Android suspenda Termux mientras cambias a WhatsApp.
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
  trap 'termux-wake-unlock >/dev/null 2>&1' EXIT
fi

echo "🛑 Deteniendo instancias anteriores..."
pkill -f "[n]ode index.js" 2>/dev/null
sleep 1

echo "🧹 Borrando sesión anterior..."
rm -rf session

echo ""
echo "⚡ Iniciando ZENITSU BOT..."
echo "📱 Número a vincular: +50369635962"
echo "⏳ Cuando aparezca el código, ingrésalo YA en WhatsApp."
echo ""

PAIRING_NUMBER="${PAIRING_NUMBER:-50369635962}" \
PAIRING_STANDARD="${PAIRING_STANDARD:-0}" \
node index.js
