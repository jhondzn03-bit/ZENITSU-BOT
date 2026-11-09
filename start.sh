#!/data/data/com.termux/files/usr/bin/bash
# Inicia ZENITSU BOT y lo reinicia si se cierra.
cd "$(dirname "$0")" || exit 1

# Evita que Android suspenda Termux en segundo plano.
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
  trap 'termux-wake-unlock >/dev/null 2>&1' EXIT
fi

# Detiene instancias anteriores para no duplicar el bot.
pkill -f "[n]ode index.js" 2>/dev/null
sleep 1

# Permite que .fix reinicie con este mismo bucle sin duplicar procesos.
export ZENITSU_SUPERVISED=1

while true; do
  node index.js
  CODE=$?
  if [ "$CODE" -eq 0 ]; then
    echo "ZENITSU BOT se detuvo correctamente."
    break
  fi
  echo "ZENITSU BOT se cerró (código $CODE). Reiniciando en 5 segundos..."
  sleep 5
done
