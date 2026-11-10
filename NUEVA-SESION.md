# 🌙 Cómo abrir la nueva sesión (paso a paso)

El número anterior fue suspendido por WhatsApp. Todo el trabajo del bot está
guardado en Git (248 comandos, sistema premium, NSFW, descargas arregladas).
Solo hay que vincular el número nuevo.

## 1. Abre Termux y entra a la carpeta del bot

```bash
cd ~/ZENITSU-BOT
```

## 2. Borra la sesión vieja y genera el código del nuevo número

```bash
RESET=1 bash pair.sh
```

- `RESET=1` borra la sesión suspendida (la de `session/` y `session-backup/`).
- Cuando te pida el número, escribe el NUEVO número del bot con código de
  país, sin `+` ni espacios. Ejemplo: `50312345678`.
- Te va a imprimir un **código de 8 dígitos**.

## 3. Vincula el WhatsApp del nuevo número

1. Abre WhatsApp en el teléfono con el nuevo número.
2. **Ajustes → Dispositivos vinculados → Vincular dispositivo.**
3. Elige **«Vincular con número de teléfono»** y escribe el código de 8 dígitos.

Cuando conecte verás el mensaje `✅ ZENITSU BOT CONECTADO`.

## 4. Si pair.sh no dejó el bot corriendo, arráncalo

```bash
cd ~/ZENITSU-BOT
nohup bash start.sh >> bot.log 2>&1 & disown
```

Para confirmar que está vivo:

```bash
tail -20 bot.log        # debe decir CONECTADO y "Comandos: 248"
ps aux | grep "[i]ndex.js"   # debe mostrar 1 proceso
```

## 5. Últimos ajustes (solo la primera vez)

- El nuevo número se registra solo como **bot principal** al conectar
  (no hay que hacer nada, ya no usa `.setprimary` — ese bug está arreglado).
- El número viejo suspendido (`50369635962`) queda en la lista de *owners*
  por gusto. Se puede quitar desde el bot principal con:

  ```
  .delowner 50369635962
  ```

## Cosas que NO hay que hacer

- ❌ No borrar `database/db.json` (ahí están los subbots, owners, dinero, XP).
- ❌ No borrar la carpeta `session/subbots/` (las sesiones de los subbots
  siguen siendo válidas, solo la del número principal cambió).
- ❌ No ejecutar `pkill -f "start.sh"` con comillas dobles simples (se
  autodestruye el shell). Si hay que parar el bot:

  ```bash
  ps aux | grep "[s]tart.sh"  | awk '{print $2}' | while read p; do kill -9 "$p"; done
  ps aux | grep "[i]ndex.js" | awk '{print $2}' | while read p; do kill -9 "$p"; done
  ```

## Subir todo a GitHub (pendiente de hoy)

```bash
cd ~/ZENITSU-BOT && git push
```

Dos commits listos: `f1f06b3` y `d26af7d`. Las sesiones y la base de datos
quedan fuera del repo (`.gitignore`) — eso es a propósito, son privadas.

---

⚡ Recordatorio de lo nuevo que tiene el bot (para probarlo mañana):
`.google`, `.img`, "¿quisiste decir?" (`.menyu` → sugiere `.menu`),
`.nsfwmenu`, `.xvideo/.xnxx/.pornhub/.gayvideo`, `.country` y `.tts`
arreglados, chistes en español, y `.prem @user` para dar premium.
