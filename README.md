# ⚡ ZENITSU BOT

Bot de WhatsApp modular hecho con **Baileys 7**, pensado para correr en **Termux (Android)** o en cualquier servidor Linux.

- 👑 Owner: **+503 7563 8328**
- 📱 Número que se vincula como bot: **+503 6963 5962**
- 🔢 Vinculación con **código de 8 dígitos**
- 💧 Marca de agua en **todos** los mensajes: `> ZENITSU BOT`
- 📦 **224 comandos** disponibles
- 🌌 **6 estilos de menú** (`galactico`, `clasico`, `zenitsu`, `neon`, `minimal`, `matrix`)
- 🤖 **Subbots** con sesiones independientes mediante `.code`

> ⚠️ Usa un número secundario para el bot. Nunca compartas la carpeta `session/`: quien la tenga puede controlar la cuenta.

---

## 🚀 Instalación en Termux

```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs git ffmpeg imagemagick libwebp python yt-dlp
termux-setup-storage
```

> 📥 `.play`, `.ytmp3`, `.ytmp4` y `.ytsearch` usan **yt-dlp** porque las APIs gratuitas de descarga suelen estar caídas. Verifica con `yt-dlp --version`.

Entra al proyecto e instala las dependencias:

```bash
cd ~/proyectos/mi-primer-proyecto
npm install
```

Si `npm install` falla por permisos o caché:

```bash
npm cache clean --force
npm install
```

### Dependencias opcionales del sistema

```bash
pkg install -y webp libwebp-tools
```

`ffmpeg` e ImageMagick se usan para stickers, audio y conversiones. No se usa `sharp` porque falla en Android arm64.

---

## 🔗 Vincular el bot (código de 8 dígitos)

El número por defecto es **50369635962**. Puedes cambiarlo sin editar archivos:

```bash
PAIRING_NUMBER=50369635962 npm start
```

O editar `config.js`:

```js
pairingNumber: process.env.PAIRING_NUMBER || '50369635962',
```

Al iniciar, la terminal mostrará algo así:

```text
╔══════════════════════════════════════════════╗
║        🔗 VINCULA TU WHATSAPP 🔗             ║
╚══════════════════════════════════════════════╝
  📱 Número:  +50369635962
  🔢 Código:  12345678   (1234-5678)
```

Pasos en el teléfono que será el bot:

1. Abre WhatsApp con el número **+503 6963 5962**.
2. Ve a **Dispositivos vinculados → Vincular dispositivo**.
3. Elige **Vincular con número de teléfono**.
4. Escribe el código de 8 dígitos que aparece en la terminal.

El código caduca rápido (aproximadamente 60 segundos). Si expira, cierra el proceso (`Ctrl + C`) y vuelve a iniciar con `npm start` o con `bash pair.sh`.

> 📌 El código **no se envía por WhatsApp ni por SMS**: aparece en la terminal de Termux y debe escribirse en el teléfono que tiene el número **+503 6963 5962**. Si lo escribes en otro teléfono, WhatsApp dirá que el código es inválido.

### Código fijo (opcional)

```bash
PAIRING_CODE=12345678 npm start
```

El código debe tener exactamente **8 dígitos**.

### Si el código numérico no conecta

Prueba con el código estándar de Baileys (8 caracteres, letras y números):

```bash
PAIRING_STANDARD=1 npm start
```

O con el script de ayuda:

```bash
bash pair.sh
# o:
PAIRING_STANDARD=1 bash pair.sh
```

### Si no aparece el código

```bash
rm -rf session
npm start
```

También puedes usar QR de respaldo:

```bash
USE_QR=1 npm start
```

---

## ▶️ Iniciar el bot

```bash
cd ~/proyectos/mi-primer-proyecto
npm start
```

O con reinicio automático:

```bash
bash start.sh
```

En segundo plano con Termux:

```bash
nohup npm start > zenitsu.log 2>&1 &
tail -f zenitsu.log
```

---

## 🧠 Comandos principales

El prefijo por defecto es `.`. Escribe `.menu` para ver todo.

### ⚡ Generales

| Comando | Función |
| --- | --- |
| `.menu` | Menú completo por categorías |
| `.help <comando>` | Ayuda de un comando |
| `.ping` | Latencia del bot |
| `.speed` | Velocidad de respuesta |
| `.info` | Información del bot |
| `.owner` | Contacto del owner |
| `.profile` | Tu perfil, XP y monedas |
| `.id` | Tu JID y número |
| `.rules` | Reglas del bot |
| `.report <texto>` | Reportar un problema al owner |
| `.donate` | Cómo apoyar el proyecto |
| `.repo` | Enlace del proyecto |
| `.zenitsu` | Frase aleatoria de Zenitsu |
| `.n <texto>` | **Menciona a todos** con tu texto |
| `.tagadmins <texto>` | Menciona solo a los administradores |

### 👑 Owner

| Comando | Función |
| --- | --- |
| `.setname <nombre>` | Cambia el nombre del bot |
| `.setbanner` | Cambia el banner del menú (imagen, GIF o video de máx. 15s) |
| `.setbanner reset` | Quita el banner |
| `.setmenu <estilo>` | Cambia el estilo del menú (`galactico`, `clasico`, `zenitsu`, `neon`, `minimal`, `matrix`) |
| `.setmenu` | Lista los estilos disponibles |
| `.setlink <url>` | Cambia el enlace que aparece en el menú |
| `.setprefix <prefijo>` | Cambia el prefijo |
| `.join <enlace>` | Une el bot a un grupo con un enlace de invitación |
| `.setpp` | Cambia la foto de perfil del bot |
| `.setsticker <pack> <autor>` | Cambia el nombre/autor de los stickers |
| `.setapi <servicio> <key>` | Guarda una API key |
| `.apis` | Lista las APIs configuradas |
| `.owners` | Lista los owners |
| `.addowner <número>` | Añade un owner |
| `.delowner <número>` | Quita un owner |
| `.code <número>` | Crea un **subbot** vinculado con código de 8 dígitos |
| `.subbots` | Lista los subbots activos |
| `.delsubbot <número>` | Elimina un subbot |
| `.eval <js>` | Ejecuta JavaScript en el bot (antes era `.code`) |
| `.exec <comando>` | Ejecuta un comando de terminal |
| `.fix` | Reinicia el bot |
| `.broadcast <texto>` | Envía un mensaje a todos los grupos |
| `.mode public\|self\|group` | Cambia el modo de uso |
| `.ban` / `.unban` | Bloquea o desbloquea usuarios |
| `.block` / `.unblock` | Bloquea o desbloquea contactos |
| `.backup` | Exporta la base de datos |
| `.resetdb` | Reinicia la base de datos |
| `.cleartmp` | Limpia archivos temporales |

Toggles del owner: `.autoread on|off`, `.autoreact`, `.autostatus`, `.antidelete`, `.anticall`.

- `.autoread on` hace que el bot marque como leídos los mensajes y estados, evitando que WhatsApp se quede “trabado”.
- `.ver` (responde a una foto/video de una sola visualización) reenvía el contenido revelado.

### 🛡️ Administración de grupos

`.kick`, `.add`, `.promote`, `.demote`, `.mute`, `.unmute`, `.groupinfo`, `.admins`, `.linkgc`, `.revoke`, `.setnamegc`, `.setdesc`, `.setppgc`, `.warn`, `.unwarn`, `.warns`, `.resetwarns`, `.setwarnlimit`, `.del`, `.poll`, `.close`, `.open`, `.membercount`, `.setwelcome`, `.setgoodbye`, `.antilink`, `.antispam`.

### 🧰 Herramientas

`.sticker`, `.toimg`, `.tomp3`, `.tts`, `.translate`, `.weather`, `.wiki`, `.define`, `.qr`, `.short`, `.calc`, `.base64`, `.unbase64`, `.hash`, `.password`, `.uuid`, `.ip`, `.country`, `.currency`, `.crypto`, `.screenshot`, `.npm`, `.github`, `.get`, `.tourl`, `.carbon`, `.dns`, `.whois`, `.httpstatus`, `.time`, `.timestamp`.

Extras de texto y utilidades: `.reverse`, `.upper`, `.lower`, `.title`, `.mock`, `.vaporwave`, `.clap`, `.spoiler`, `.emojify`, `.binary`, `.unbinary`, `.morse`, `.unmorse`, `.choose`, `.color`, `.groupid`, `.getpp`, `.afk`, `.read`, `.ver`.

### 📥 Descargas

`.play`, `.ytmp3`, `.ytmp4`, `.ytsearch`, `.tiktok`, `.instagram`, `.facebook`, `.twitter`, `.pinterest`, `.spotify`, `.mediafire`.

### 🤖 IA

`.ai`, `.gemini`, `.imagine`, `.aichat`, `.clearchat`, `.summarize`, `.traduciria`, `.codeai`.

La IA gratuita usa Pollinations. Para Gemini:

```bash
.setapi gemini TU_API_KEY
```

### 🌸 Anime y diversión

`.waifu`, `.neko`, `.husbando`, `.megumin`, `.anime`, `.manga`, `.character`, `.animequote`, `.8ball`, `.dice`, `.coinflip`, `.rps`, `.truth`, `.dare`, `.joke`, `.meme`, `.quote`, `.fact`, `.advice`, `.ship`, `.rate`, `.trivia`, `.shrug`, `.tableflip`, `.unflip`, `.lenny`.

Las reacciones anime (`.pat`, `.poke`, `.hug`, `.kiss`, `.slap`, etc.) usan **nekos.best** con respaldo en **otakugifs.xyz** y **nekos.life**.

### 💰 Economía

`.daily`, `.work`, `.crime`, `.rob`, `.pay`, `.balance`, `.top`, `.topxp`, `.level`, `.mine`, `.fish`, `.hunt`, `.slots`, `.shop`, `.buy`, `.inventory`, `.beg`, `.gamble`.

### 🌐 Información

`.news`, `.trending`, `.lyrics`, `.series`.

---

## 🎨 Estilos del menú

Cambia el aspecto de `.menu` con:

```bash
.setmenu galactico   # 🌌 Estrellas, planetas y estilo espacial (por defecto)
.setmenu clasico     # ⚡ El estilo original de ZENITSU BOT
.setmenu zenitsu     # 🌩️ Respiración del Trueno
.setmenu neon        # 💜 Brillos y colores intensos
.setmenu minimal     # ◾ Limpio, corto y sin adornos
.setmenu matrix      # 🟩 Verde digital estilo hacker
```

- `.setmenu` sin argumentos muestra la lista y el estilo actual.
- `.setmenu reset` vuelve a `galactico`.
- `.setbanner` acepta imágenes, GIFs y videos de hasta **15 segundos**.
- `.setlink <url>` cambia un enlace opcional al final del menú (vacío por defecto, sin el link del repositorio).

El banner y el menú se envían **siempre en el mismo mensaje**: la imagen/video lleva el menú completo como pie de foto. Nunca se separan en dos mensajes.

---

## 🤖 Subbots (`.code`)

`.code` ya **no ejecuta JavaScript**: ahora crea un **subbot** con su propia sesión.

```bash
.code 50312345678
```

1. El bot pide un código de vinculación para ese número.
2. Escribe el código de 8 dígitos en el WhatsApp de ese número.
3. El subbot queda guardado en `session/subbots/<número>/` y se reconecta solo al reiniciar.

Comandos relacionados:

| Comando | Función |
| --- | --- |
| `.code <número>` | Vincula un subbot nuevo |
| `.subbots` | Lista subbots y su estado |
| `.delsubbot <número>` | Elimina un subbot y su sesión |

Para ejecutar JavaScript usa ahora `.eval <código>`.

---

## 🔑 APIs opcionales

Guarda claves con:

```bash
.setapi gemini TU_KEY
.setapi catbox TU_KEY
```

Las APIs gratuitas no necesitan clave, pero pueden fallar o limitar peticiones. El bot intenta varias alternativas y responde con un error claro si ninguna funciona.

---

## 📁 Estructura

```text
mi-primer-proyecto/
├── index.js              # Conexión, vinculación y eventos
├── config.js             # Nombre, owner, número de vinculación, rutas
├── start.sh              # Reinicio automático
├── assets/banner.jpg     # Banner del menú
├── commands/             # Comandos por categoría (224)
│   └── extra.js          # Texto, utilidades, .ver, .read, economía extra
├── handlers/             # Mensajes y eventos de grupo
├── lib/                  # DB, APIs, menú, subbots, stickers, utilidades
│   ├── menu.js           # 6 estilos del menú
│   └── subbots.js        # Ciclo de vida de los subbots
├── database/             # Base de datos JSON (se crea sola)
├── session/              # Sesión de WhatsApp (NO compartir)
│   └── subbots/<número>/ # Sesiones de subbots
└── tmp/                  # Archivos temporales
```

---

## 🌐 Repositorio

- GitHub: <https://github.com/jhondzn03-bit/ZENITSU-BOT>
- El menú no muestra el enlace del repositorio por defecto. Usa `.repo` si quieres verlo.

---

## 🛠️ Problemas comunes

**El código no funciona**
- Debe tener 8 dígitos y usarse en menos de ~1 minuto.
- Borra `session/` y reinicia.
- Verifica que el número tenga WhatsApp activo.

**El bot no responde**
- Revisa que el prefijo sea `.` (o el que hayas configurado).
- En modo `self`, solo el owner puede usarlo.
- Revisa la terminal por errores.

**Stickers fallan**
- Instala `ffmpeg` e ImageMagick: `pkg install ffmpeg imagemagick`.
- Verifica con `ffmpeg -version`.

**La sesión se cerró**
```bash
rm -rf session
npm start
```

**`.join` responde `not-authorized`**
- El enlace expiró o fue revocado: pide uno nuevo.
- El grupo está lleno o requiere aprobación de un administrador.
- La cuenta del bot tiene restricciones para unirse.
- Alternativa: que un administrador agregue al bot directamente.

**`.play` / descargas fallan**
- Verifica `yt-dlp --version`.
- Actualiza con `pkg upgrade yt-dlp` o `pip install -U yt-dlp`.
- Algunos videos tienen restricción regional o de edad.

---

## 🔒 Seguridad

- No subas `session/` a GitHub ni la compartas.
- Usa un número secundario para el bot.
- `.eval`, `.exec`, `.code` y `.delsubbot` son poderosos: úsalos solo tú.
- Cambia el código de vinculación si sospechas que alguien lo vio.
- Las sesiones de los subbots también son sensibles: no compartas `session/subbots/`.

---

> ⚡ **ZENITSU BOT** — Respiración del Trueno.
