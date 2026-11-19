# Respaldo local cifrado de ZENITSU BOT

Este directorio guarda una copia cifrada de la sesión local de WhatsApp, la API
key de YO SOY YO y el trabajo que estaba sin commitear al momento del respaldo.

> El repositorio es **público**. La sesión NO se sube en claro: el archivo
> `.enc` está cifrado con AES-256-GCM y la llave se deriva con scrypt.

## Archivos

- `zenbackup.js` — utilidad de cifrado/descifrado (solo Node.js, sin dependencias).
- `zenitsu-local-backup-2026-11-19.tar.gz.enc` — respaldo cifrado (670 KB).

## Contenido del respaldo

- `session/` — 3957 archivos de la sesión de WhatsApp, incluido `creds.json`
  (número `50369635962`).
- `assets/yosoyyo-key.txt` — key local de YO SOY YO.
- `local-uncommitted/` — cambios Capibara que no estaban en Git:
  `commands/index.js`, `handlers/message.js`, `index.js`, `package.json`,
  `package-lock.json`, `README-CAPIBARA.md`, `commands/capibara.js`,
  `tsconfig.json`, `dist/`, `src/`.
- `MANIFEST.md` — fecha, versión y notas.

## Restaurar en otro dispositivo

1. Instala Node.js y clona el repo:

   ```bash
   git clone https://github.com/jhondzn03-bit/ZENITSU-BOT.git
   cd ZENITSU-BOT
   ```

2. Descifra (te pedirá la contraseña de 32 caracteres):

   ```bash
   node backup/zenbackup.js decrypt \
     backup/zenitsu-local-backup-2026-11-19.tar.gz.enc \
     zenitsu-backup.tar.gz
   ```

   También puede pasar la contraseña por variable de entorno:

   ```bash
   ZEN_BACKUP_PASSWORD='...' node backup/zenbackup.js decrypt <enc> <salida>
   ```

3. Extrae desde la raíz del repo:

   ```bash
   tar -xzf zenitsu-backup.tar.gz
   ```

4. Comprueba:

   ```bash
   ls -l session/creds.json
   du -sh session
   ```

5. Instala dependencias y arranca el bot:

   ```bash
   npm install
   node index.js
   ```

## Verificar la integridad

El SHA-256 del `tar.gz` original es:

```
b6a68510c3c48bff4d866b0d661b8d925386c50cda6aa002103e0fbf1dd02413
```

Tras descifrar, comprueba con `sha256sum zenitsu-backup.tar.gz`.

## Notas importantes

- No abras la sesión en dos lugares a la vez con el mismo `creds.json` porque
  WhatsApp puede cerrar una de las dos. La sesión remota de HidenCloud no se
  modificó; este respaldo es solo la copia local.
- Si pierdes la contraseña, no hay forma de recuperar el respaldo. Guárdala
  fuera de Termux antes de borrarlo.
- Nunca subas `session/` sin cifrar a este repo público.
