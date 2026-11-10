#!/data/data/com.termux/files/usr/bin/bash
# Vincula ZENITSU BOT mostrando un código de 8 dígitos (gestión con PM2).
# Uso normal:      bash pair.sh
# Código estándar: PAIRING_STANDARD=1 bash pair.sh
# Borrar sesión:   RESET=1 bash pair.sh   (solo si la sesión quedó inservible)
cd "$(dirname "$0")" || exit 1

# Evita que Android suspenda Termux mientras cambias a WhatsApp.
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
  trap 'termux-wake-unlock >/dev/null 2>&1' EXIT
fi

echo "🛑 Deteniendo instancias anteriores..."
pm2 delete zenitsu-bot >/dev/null 2>&1
pkill -f "[n]ode index.js" 2>/dev/null
sleep 1

# ⚠️ La sesión ya vinculada NO se borra: así el bot recuerda el número y
# no pide código otra vez. Borra solo con: RESET=1 bash pair.sh
if [ "$RESET" = "1" ]; then
  echo "🧹 RESET=1: borrando sesión anterior (se pedirá código nuevo)..."
  rm -rf session session-backup
elif [ -f session/creds.json ] && node -e "process.exit(require('./session/creds.json').registered ? 0 : 1)" 2>/dev/null; then
  echo "✅ Ya hay una sesión vinculada guardada en session/"
  echo "   No hace falta vincular: el bot se inicia abajo con esa sesión."
else
  echo "📁 Sin sesión previa: se pedirá código de vinculación."
fi

echo ""
echo "⚡ Iniciando ZENITSU BOT con PM2..."
echo "📱 Número a vincular: +${PAIRING_NUMBER:-50369635962}"
echo "⏳ Cuando aparezca el código, ingrésalo YA en WhatsApp:"
echo "   WhatsApp > Ajustes > Dispositivos vinculados > Vincular dispositivo >"
echo "   Vincular con número de teléfono."
echo ""

PAIRING_NUMBER="${PAIRING_NUMBER:-50369635962}" \
PAIRING_STANDARD="${PAIRING_STANDARD:-0}" \
pm2 start index.js --name zenitsu-bot --stop-exit-codes 78 --restart-delay 5000
pm2 save >/dev/null 2>&1

echo "👇 El código aparece abajo (Ctrl-C solo cierra los logs; el bot sigue corriendo):"
echo ""
pm2 logs zenitsu-bot
