#!/data/data/com.termux/files/usr/bin/bash
# Inicia ZENITSU BOT y lo reinicia si se cierra.
cd "$(dirname "$0")" || exit 1

# Evita que Android suspenda Termux en segundo plano.
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
  trap 'termux-wake-unlock >/dev/null 2>&1' EXIT
fi

# Detiene instancias anteriores para no duplicar el bot.
pm2 delete zenitsu-bot >/dev/null 2>&1
pkill -f "[n]ode index.js" 2>/dev/null
sleep 1

# Permite que .fix reinicie con este mismo bucle sin duplicar procesos.
export ZENITSU_SUPERVISED=1

while true; do
  node index.js
  CODE=$?
  # 78 = WhatsApp cerró la sesión: NO reiniciar (gastaría códigos en bucle).
  if [ "$CODE" -eq 78 ]; then
    echo "ZENITSU BOT: la sesión fue cerrada desde WhatsApp."
    echo "Vincula de nuevo con:  RESET=1 bash pair.sh"
    break
  fi
  # Reinicia siempre (incluso si WhatsApp cierra la sesión con código 0).
  # Para detenerlo de verdad: pkill -f "[s]tart.sh" y luego pkill -f "[n]ode index.js".
  echo "ZENITSU BOT se cerró (código $CODE). Reiniciando en 5 segundos..."
  sleep 5
done
