// ─── Router local de ZENITSU BOT ──────────────────────────────────────────
// Convierte lenguaje natural en una línea de comando SIN usar IA.
// Es instantáneo (0 ms) y no gasta el límite de las APIs de IA.
// Si no reconoce la petición, devuelve null y .opencode cae a la IA.

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[¿?¡!.,;:"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extrae una URL del texto (se pasa tal cual al comando).
function firstUrl(text) {
  const m = String(text).match(/https?:\/\/[^\s]+/);
  return m ? m[0] : '';
}

// Quita las palabras de relleno del inicio para quedarnos con el argumento.
const FILLERS = [
  'bajame', 'bajate', 'descarga', 'descargame', 'descargar', 'baja', 'bajar',
  'ponme', 'pon', 'reproduce', 'reproducir', 'toca', 'tocar', 'escuchar', 'escucha',
  'quiero', 'quiero que', 'dame', 'dime', 'busca', 'buscame', 'buscar', 'muestrame',
  'hazme', 'haz', 'hacer', 'genera', 'generame', 'crea', 'creame', 'convierte',
  'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'mi', 'me',
  'por', 'favor', 'porfa', 'ya', 'esa', 'ese', 'esto', 'esta', 'eso',
  'cancion', 'musica', 'rola', 'tema', 'audio', 'mp3', 'video', 'mp4',
];

function cleanArgs(text) {
  let t = norm(text);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of FILLERS) {
      if (t === f) return '';
      if (t.startsWith(`${f} `)) {
        t = t.slice(f.length + 1).trim();
        changed = true;
      }
    }
  }
  return t;
}

// Intenciones ordenadas: la primera que coincida gana.
// cmd = nombre real del comando; arg = función que arma los argumentos.
const INTENTS = [
  // ── descargas ──────────────────────────────────────────────────────────
  { re: /\b(tiktok|tik tok)\b/, cmd: 'tiktok', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(instagram|insta|reel)\b/, cmd: 'instagram', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(facebook|fb)\b/, cmd: 'facebook', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(twitter|x\.com|tuit)\b/, cmd: 'twitter', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(pinterest)\b/, cmd: 'pinterest', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(spotify)\b/, cmd: 'spotify', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(mediafire)\b/, cmd: 'mediafire', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(youtube|yt)\b.*\b(video|mp4)\b|\b(video|mp4)\b.*\b(youtube|yt)\b/, cmd: 'ytmp4', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(youtube|yt)\b/, cmd: 'ytmp3', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(cancion|musica|rola|tema|audio|mp3|escuchar|reproduce|reproducir)\b/, cmd: 'play', arg: (t) => cleanArgs(t) },
  { re: /\b(video|mp4)\b/, cmd: 'ytmp4', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(letra|lyrics)\b/, cmd: 'lyrics', arg: (t) => cleanArgs(t) },

  // ── investigación (nuevos) ─────────────────────────────────────────────
  { re: /\b(pelicula|peli|peliculas|movie|cine)\b/, cmd: 'pelicula', arg: (t) => cleanArgs(t.replace(/\b(peliculas?|peli|movie|cine|trailer|de)\b/g, ' ')) },
  { re: /\b(peliculas? gratis|clasicos?|dominio publico)\b/, cmd: 'peliculasgratis', arg: (t) => cleanArgs(t.replace(/\b(peliculas?|gratis|clasicos?|de|dominio publico)\b/g, ' ')) },
  { re: /\b(pokemon|pokedex|pokem[óo]n)\b/, cmd: 'pokemon', arg: (t) => cleanArgs(t.replace(/\b(pokemon|pokedex|pokem[óo]n)\b/g, ' ')) },
  { re: /\b(receta|cocinar|comida|platillo|recetas)\b/, cmd: 'receta', arg: (t) => cleanArgs(t.replace(/\b(recetas?|cocinar|comida|platillo|una?|de)\b/g, ' ')) },
  { re: /\b(coctel|cocktail|trago|bebida)\b/, cmd: 'coctel', arg: (t) => cleanArgs(t.replace(/\b(coctel|cocktail|trago|bebida|un|de)\b/g, ' ')) },
  { re: /\b(correo temporal|tempmail|mail temporal)\b/, cmd: 'tempmail', arg: () => '' },
  { re: /\b(libro|libros|open ?library)\b/, cmd: 'libro', arg: (t) => cleanArgs(t.replace(/\b(libros?|open ?library|el|de)\b/g, ' ')) },
  { re: /\b(un dia como hoy|hoy en la historia|efemerides|on this day)\b/, cmd: 'hoy', arg: () => '' },
  { re: /\b(stackoverflow|duda de programacion|codigo error)\b/, cmd: 'stack', arg: (t) => cleanArgs(t) },
  { re: /\b(acciones|bolsa|mercado|stock|wall ?street)\b/, cmd: 'acciones', arg: (t) => cleanArgs(t.replace(/\b(que paso con (las )?)?(acciones|bolsa|mercado|stock|wall ?street|de|la[sr]?|el|los)\b/g, ' ')) },
  { re: /\b(juegos gratis|epic games|epicgames)\b/, cmd: 'epic', arg: () => '' },
  { re: /\b(nasa|espacio|galaxia|astronomia)\b/, cmd: 'nasa', arg: () => '' },
  { re: /\b(app|aplicacion|aplicaciones|play ?store|appstore)\b/, cmd: 'appstore', arg: (t) => cleanArgs(t.replace(/\b(app|aplicaciones?|play ?store|appstore|la|de)\b/g, ' ')) },
  { re: /\b(fondo de pantalla|wallpaper|fondos)\b/, cmd: 'wallpaper', arg: (t) => cleanArgs(t.replace(/\b(fondos?|de|pantalla|wallpaper)\b/g, ' ')) },
  { re: /\b(covid|coronavirus)\b/, cmd: 'covid', arg: (t) => cleanArgs(t.replace(/\b(covid|coronavirus|del|en)\b/g, ' ')) },
  { re: /\b(perro|perritos|dog|guau)\b/, cmd: 'dog', arg: (t) => cleanArgs(t.replace(/\b(perro?s?|dog|guau|un|de)\b/g, ' ')) },
  { re: /\b(gato|gatitos|cat|miau)\b/, cmd: 'cat', arg: () => '' },

  // ── reacciones anime (nuevos) ──────────────────────────────────────────
  { re: /\b(llorar|llora|llorando|llorame)\b/, cmd: 'cry', arg: () => '' },
  { re: /\b(abrazame|abrazo|abrazalo)\b/, cmd: 'hug', arg: () => '' },
  { re: /\b(besame|besito|besalo)\b/, cmd: 'kiss', arg: () => '' },
  { re: /\b(cacheteame|cachetada|bofetada|una paliza)\b/, cmd: 'slap', arg: () => '' },
  { re: /\b(baila|bailar|baile|bailando)\b/, cmd: 'dance', arg: () => '' },
  { re: /\b(duermete|dormir|sueno)\b/, cmd: 'sleep', arg: () => '' },
  { re: /\b(corre|corriendo|corred)\b/, cmd: 'run', arg: () => '' },
  { re: /\b(sonrie|sonreir|sonrisa)\b/, cmd: 'smile', arg: () => '' },
  { re: /\b(enojado|enojate|furioso|rabia)\b/, cmd: 'angry', arg: () => '' },
  { re: /\b(aburrido|aburrimiento|me aburro)\b/, cmd: 'bored', arg: () => '' },
  { re: /\b(bostezo|bostezar|sueno)\b/, cmd: 'yawn', arg: () => '' },
  { re: /\b(puñetazo|punetazo|golpealo)\b/, cmd: 'punch', arg: () => '' },
  { re: /\b(patealo|patada|patear)\b/, cmd: 'patear', arg: () => '' },
  { re: /\b(no se|nose|idk)\b/, cmd: 'idk', arg: () => '' },

  // ── stickers y multimedia ──────────────────────────────────────────────
  { re: /\b(sticker|stiker|pegatina|calcomania)\b/, cmd: 'sticker', arg: () => '' },
  { re: /\b(audio|nota de voz)\b.*\b(sticker|video)\b/, cmd: 'tomp3', arg: () => '' },
  { re: /\b(imagen|foto)\b.*\b(a|para)\b|\btoimg\b/, cmd: 'toimg', arg: () => '' },
  { re: /\b(tourl|enlace del archivo|link del archivo)\b/, cmd: 'tourl', arg: () => '' },

  // ── información ────────────────────────────────────────────────────────
  { re: /\b(clima|tiempo|temperatura|llovera|pronostico)\b/, cmd: 'weather', arg: (t) => cleanArgs(t.replace(/\b(clima|tiempo|temperatura|pronostico|de|en|hoy|ahora)\b/g, ' ')) },
  { re: /\b(traduce|traducir|traduccion|traduceme)\b/, cmd: 'translate', arg: (t) => cleanArgs(t.replace(/\b(traduce|traducir|traduccion|traduceme|de|del)\b/g, ' ')) },
  { re: /\b(wikipedia|wiki)\b/, cmd: 'wiki', arg: (t) => cleanArgs(t.replace(/\b(wikipedia|wiki|sobre|de)\b/g, ' ')) },
  { re: /\b(google|busca en google)\b/, cmd: 'google', arg: (t) => cleanArgs(t.replace(/\b(google|busca|en)\b/g, ' ')) },
  { re: /\b(define|definicion|significa|que es)\b/, cmd: 'define', arg: (t) => cleanArgs(t.replace(/\b(define|definicion|significa|que|es)\b/g, ' ')) },
  { re: /\b(noticias|news)\b/, cmd: 'news', arg: () => '' },
  { re: /\b(tendencias|trending)\b/, cmd: 'trending', arg: () => '' },
  { re: /\b(serie|series|temporadas?)\b/, cmd: 'series', arg: (t) => cleanArgs(t.replace(/\b(serie|series|temporadas?|de)\b/g, ' ')) },
  { re: /\b(dolar|euro|peso|colones?|cambio|moneda|conversion)\b/, cmd: 'currency', arg: (t) => cleanArgs(t.replace(/\b(dolar|euro|peso|colones?|cambio|moneda|conversion|a|de|en)\b/g, ' ')) },
  { re: /\b(cripto|bitcoin|ethereum|btc|eth)\b/, cmd: 'crypto', arg: (t) => cleanArgs(t.replace(/\b(cripto|bitcoin|ethereum|precio|de|del|cuanto|esta)\b/g, ' ')) },
  { re: /\b(qr|codigo qr)\b/, cmd: 'qr', arg: (t) => cleanArgs(t) },
  { re: /\b(ip|mi ip)\b/, cmd: 'ip', arg: () => '' },
  { re: /\b(pais|country)\b/, cmd: 'country', arg: (t) => cleanArgs(t.replace(/\b(pais|country|informacion|de|sobre|el)\b/g, ' ')) },

  // ── IA ─────────────────────────────────────────────────────────────────
  { re: /\b(imagina|dibuja|genera|crea)\b.*\b(imagen|foto|dibujo)\b|\b(imagen|foto)\b.*\b(imagina|dibuja|genera|crea)\b/, cmd: 'imagine', arg: (t) => cleanArgs(t.replace(/\b(imagina|dibuja|genera|crea|imagen|foto|dibujo|de|un|una)\b/g, ' ')) },
  { re: /\b(resume|resumen|resumir)\b/, cmd: 'summarize', arg: () => '' },
  { re: /\b(programa|codigo|script)\b/, cmd: 'codeai', arg: (t) => cleanArgs(t) },

  // ── bot y perfil (van antes que diversión para no ser secuestrados) ──
  { re: /\b(owner|dueno|creador|quien te creo|quien es el owner)\b/, cmd: 'owner', arg: () => '' },
  { re: /\bzenitsu\b/, cmd: 'zenitsu', arg: () => '' },
  { re: /\b(perfil|profile)\b/, cmd: 'profile', arg: () => '' },
  { re: /\b(menu|comandos|ayuda)\b/, cmd: 'menu', arg: () => '' },
  { re: /\b(ping|latencia)\b/, cmd: 'ping', arg: () => '' },

  // ── diversión ──────────────────────────────────────────────────────────
  { re: /\b(chiste|broma|gracioso)\b/, cmd: 'joke', arg: () => '' },
  { re: /\b(meme|memes)\b/, cmd: 'meme', arg: () => '' },
  { re: /\b(frase|cita|quote)\b/, cmd: 'quote', arg: () => '' },
  { re: /\b(dato curioso|dato|curiosidad|fact)\b/, cmd: 'fact', arg: () => '' },
  { re: /\b(consejo|advice)\b/, cmd: 'advice', arg: () => '' },
  { re: /\b(pickup|piropo|piropazo)\b/, cmd: 'pickup', arg: () => '' },
  { re: /\b(insulto|insultar)\b/, cmd: 'insult', arg: () => '' },
  { re: /\b(roast|burla)\b/, cmd: 'roast', arg: () => '' },
  { re: /\b(halago|complimento|complemento)\b/, cmd: 'compliment', arg: () => '' },
  { re: /\b(verdad|truth)\b/, cmd: 'truth', arg: () => '' },
  { re: /\b(reto|dare)\b/, cmd: 'dare', arg: () => '' },
  { re: /\b(8ball|bola 8|bola magica)\b/, cmd: '8ball', arg: (t) => cleanArgs(t.replace(/\b(8ball|bola|magica|8)\b/g, ' ')) },
  { re: /\b(dado|dados|tira el dado|lanza el dado)\b/, cmd: 'dice', arg: () => '' },
  { re: /\b(moneda|cara o cruz|coinflip)\b/, cmd: 'coinflip', arg: () => '' },
  { re: /\b(piedra|papel|tijera|rps)\b/, cmd: 'rps', arg: (t) => cleanArgs(t) },
  { re: /\b(elige|escoge|decide)\b/, cmd: 'choose', arg: (t) => cleanArgs(t) },
  { re: /\b(trivia|pregunta)\b/, cmd: 'trivia', arg: () => '' },
  { re: /\b(rate|califica|puntua)\b/, cmd: 'rate', arg: (t) => cleanArgs(t) },
  { re: /\b(poder|power level)\b/, cmd: 'power', arg: () => '' },
  { re: /\b(ship|compatibilidad)\b/, cmd: 'ship', arg: (t) => cleanArgs(t) },
  { re: /\b(dime algo|responde)\b/, cmd: 'answer', arg: (t) => cleanArgs(t) },

  // ── anime ──────────────────────────────────────────────────────────────
  { re: /\b(waifu)\b/, cmd: 'waifu', arg: () => '' },
  { re: /\b(neko)\b/, cmd: 'neko', arg: () => '' },
  { re: /\b(husbando)\b/, cmd: 'husbando', arg: () => '' },
  { re: /\b(anime|manga)\b.*\b(busca|info|de)\b|\b(busca|info)\b.*\b(anime|manga)\b/, cmd: 'anime', arg: (t) => cleanArgs(t.replace(/\b(anime|manga|busca|info|de|sobre)\b/g, ' ')) },
  { re: /\b(frase de anime|animequote)\b/, cmd: 'animequote', arg: () => '' },
  { re: /\b(abrazo|abrazar|hug)\b/, cmd: 'hug', arg: () => '' },
  { re: /\b(beso|besar|kiss)\b/, cmd: 'kiss', arg: () => '' },
  { re: /\b(acariciar|carino|pat)\b/, cmd: 'pat', arg: () => '' },
  { re: /\b(cachetada|slap)\b/, cmd: 'slap', arg: () => '' },

  // ── economía ───────────────────────────────────────────────────────────
  { re: /\b(diario|daily|recompensa diaria)\b/, cmd: 'daily', arg: () => '' },
  { re: /\b(trabajar|trabajo|work)\b/, cmd: 'work', arg: () => '' },
  { re: /\b(robar|rob)\b/, cmd: 'rob', arg: () => '' },
  { re: /\b(crimen|crime|delinquir)\b/, cmd: 'crime', arg: () => '' },
  { re: /\b(minar|mina|mine)\b/, cmd: 'mine', arg: () => '' },
  { re: /\b(pescar|pesca|fish)\b/, cmd: 'fish', arg: () => '' },
  { re: /\b(cazar|hunt)\b/, cmd: 'hunt', arg: () => '' },
  { re: /\b(tragamonedas|slots|apostar|gamble)\b/, cmd: 'slots', arg: () => '' },
  { re: /\b(balance|saldo|cartera|dinero)\b/, cmd: 'balance', arg: () => '' },
  { re: /\b(mendigar|beg)\b/, cmd: 'beg', arg: () => '' },
  { re: /\b(tienda|shop)\b/, cmd: 'shop', arg: () => '' },
  { re: /\b(inventario|inventory)\b/, cmd: 'inventory', arg: () => '' },
  { re: /\b(nivel|level|xp)\b/, cmd: 'level', arg: () => '' },
  { re: /\b(top|ranking|mejores)\b/, cmd: 'top', arg: () => '' },
  { re: /\b(pagar|pay)\b/, cmd: 'pay', arg: (t) => cleanArgs(t.replace(/\b(pagar|pay|a|le|por)\b/g, ' ')) },

  // ── utilidades ─────────────────────────────────────────────────────────
  { re: /\b(recuerdame|recuerda|recordar|recordatorio|remind)\b/, cmd: 'remind', arg: (t) => cleanArgs(t.replace(/\b(recuerdame|recuerda|recordar|recordatorio|remind|en|que|de)\b/g, ' ')) },
  { re: /\b(calcula|calculadora|cuanto es|calc)\b/, cmd: 'calc', arg: (t) => t.replace(/\b(calcula|calculadora|cuanto es|calc)\b/g, '').trim() },
  { re: /\b(hora|que hora)\b/, cmd: 'time', arg: () => '' },
  { re: /\b(fecha|que dia)\b/, cmd: 'timestamp', arg: () => '' },
  { re: /\b(abreviar|acortar|short)\b/, cmd: 'short', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(password|contrasena|clave segura)\b/, cmd: 'password', arg: () => '' },
  { re: /\b(uuid|identificador)\b/, cmd: 'uuid', arg: () => '' },
  { re: /\b(hash|md5|sha)\b/, cmd: 'hash', arg: (t) => cleanArgs(t) },
  { re: /\b(base64)\b/, cmd: 'base64', arg: (t) => cleanArgs(t.replace(/\b(base64|encode|codificar)\b/g, ' ')) },
  { re: /\b(morse)\b/, cmd: 'morse', arg: (t) => cleanArgs(t.replace(/\b(morse|codificar)\b/g, ' ')) },
  { re: /\b(binario|binary)\b/, cmd: 'binary', arg: (t) => cleanArgs(t.replace(/\b(binario|binary|codificar)\b/g, ' ')) },
  { re: /\b(emoji|emojify)\b/, cmd: 'emojify', arg: (t) => cleanArgs(t.replace(/\b(emoji|emojify|pon)\b/g, ' ')) },
  { re: /\b(mayuscula|uppercase)\b/, cmd: 'upper', arg: (t) => cleanArgs(t) },
  { re: /\b(minuscula|lowercase)\b/, cmd: 'lower', arg: (t) => cleanArgs(t) },
  { re: /\b(screenshot|captura|pantalla)\b/, cmd: 'screenshot', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(npm|paquete)\b/, cmd: 'npm', arg: (t) => cleanArgs(t.replace(/\b(npm|paquete|de)\b/g, ' ')) },
  { re: /\b(github|repositorio|repo)\b/, cmd: 'github', arg: (t) => cleanArgs(t.replace(/\b(github|repositorio|repo|de)\b/g, ' ')) },
  { re: /\b(whois|dominio)\b/, cmd: 'whois', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(dns)\b/, cmd: 'dns', arg: (t) => cleanArgs(t) },
  { re: /\b(steam|juego de steam)\b/, cmd: 'steam', arg: (t) => cleanArgs(t.replace(/\b(steam|juego|de|busca)\b/g, ' ')) },
  { re: /\b(tiene whatsapp|whatsapp de|numero tiene)\b/, cmd: 'nowa', arg: (t) => cleanArgs(t.replace(/\b(tiene|whatsapp|de|numero|el)\b/g, ' ')) },

  // ── grupos / admin ─────────────────────────────────────────────────────
  { re: /\b(grupos|mis grupos|lista de grupos)\b/, cmd: 'grupos', arg: () => '' },
  { re: /\b(entra|unete|unirse|agregar|añadir)\b.*\bgrupo\b|\bgrupo\b.*\b(enlace|link)\b/, cmd: 'join', arg: (t) => firstUrl(t) || cleanArgs(t) },
  { re: /\b(salir del grupo|salte|salir)\b/, cmd: 'salir', arg: (t) => cleanArgs(t.replace(/\b(salir|del|grupo|salte)\b/g, ' ')) },
  { re: /\b(link del grupo|enlace del grupo|linkgc)\b/, cmd: 'linkgc', arg: () => '' },
  { re: /\b(admins|administradores)\b/, cmd: 'admins', arg: () => '' },
  { re: /\b(kick|expulsar|sacar)\b/, cmd: 'kick', arg: (t) => cleanArgs(t.replace(/\b(kick|expulsar|sacar|a|al)\b/g, ' ')) },
  { re: /\b(promover|promote|admin)\b/, cmd: 'promote', arg: (t) => cleanArgs(t.replace(/\b(promover|promote|admin|a|de)\b/g, ' ')) },
  { re: /\b(quitar admin|demote)\b/, cmd: 'demote', arg: (t) => cleanArgs(t.replace(/\b(quitar|admin|demote|a|de)\b/g, ' ')) },
  { re: /\b(mute|silenciar)\b/, cmd: 'mute', arg: () => '' },
  { re: /\b(unmute|dessilenciar)\b/, cmd: 'unmute', arg: () => '' },
  { re: /\b(encuesta|poll)\b/, cmd: 'poll', arg: (t) => cleanArgs(t.replace(/\b(encuesta|poll|crea|crear)\b/g, ' ')) },
  { re: /\b(cerrar grupo|close)\b/, cmd: 'close', arg: () => '' },
  { re: /\b(abrir grupo|open)\b/, cmd: 'open', arg: () => '' },
  { re: /\b(bienvenida|welcome)\b/, cmd: 'welcome', arg: () => '' },
  { re: /\b(despedida|goodbye)\b/, cmd: 'goodbye', arg: () => '' },
  { re: /\b(antilink)\b/, cmd: 'antilink', arg: (t) => cleanArgs(t) },
  { re: /\b(antispam)\b/, cmd: 'antispam', arg: (t) => cleanArgs(t) },

  // ── +18 ────────────────────────────────────────────────────────────────
  { re: /\b(pornhub|ph)\b/, cmd: 'pornhub', arg: (t) => cleanArgs(t.replace(/\b(pornhub|ph)\b/g, ' ')) },
  { re: /\b(xvideos|xvideo)\b/, cmd: 'xvideo', arg: (t) => cleanArgs(t.replace(/\b(xvideos|xvideo)\b/g, ' ')) },
  { re: /\b(xnxx)\b/, cmd: 'xnxx', arg: (t) => cleanArgs(t.replace(/\b(xnxx)\b/g, ' ')) },
  { re: /\b(gayvideo|gay)\b/, cmd: 'gayvideo', arg: (t) => cleanArgs(t.replace(/\b(gayvideo|gay)\b/g, ' ')) },
  { re: /\b(nsfw|nopor|\+18|porno)\b/, cmd: 'nsfw', arg: (t) => cleanArgs(t) },

  // ── bot ────────────────────────────────────────────────────────────────
  { re: /\b(menu|menú|comandos|ayuda)\b/, cmd: 'menu', arg: () => '' },
  { re: /\b(ping|latencia|velocidad del bot)\b/, cmd: 'ping', arg: () => '' },
  { re: /\b(perfil|profile)\b/, cmd: 'profile', arg: () => '' },
  { re: /\b(dueno|owner|creador)\b/, cmd: 'owner', arg: () => '' },
  { re: /\b(reporte|reportar|bug)\b/, cmd: 'report', arg: (t) => cleanArgs(t.replace(/\b(reporte|reportar|bug|un)\b/g, ' ')) },
  { re: /\b(reglas|rules)\b/, cmd: 'rules', arg: () => '' },
  { re: /\b(info del bot|informacion|acerca)\b/, cmd: 'info', arg: () => '' },
  { re: /\b(canal|canal de whatsapp)\b/, cmd: 'canal', arg: (t) => cleanArgs(t) },
  { re: /\b(zenitsu|frase de zenitsu)\b/, cmd: 'zenitsu', arg: () => '' },
  { re: /\b(afk|ausente|no estoy)\b/, cmd: 'afk', arg: (t) => cleanArgs(t.replace(/\b(afk|ausente|no|estoy|por)\b/g, ' ')) },
  { re: /\b(subbot|vincular|pair|vincula)\b/, cmd: 'code', arg: (t) => cleanArgs(t) },
];

/**
 * Intenta resolver la petición sin IA.
 * @returns {{ line: string, cmd: string } | null}
 */
export function routeLocally(request, commandMap, prefix) {
  const text = norm(request);
  if (!text) return null;

  // 1) Si ya escribió un comando con prefijo, se usa tal cual.
  const direct = String(request).trim().match(/^([./!])([a-z0-9_-]+)(?:\s+([\s\S]*))?$/i);
  if (direct && direct[1] === prefix && commandMap.get(direct[2].toLowerCase())) {
    return { line: `${prefix}${direct[2].toLowerCase()}${direct[3] ? ` ${direct[3]}` : ''}`, cmd: direct[2].toLowerCase() };
  }

  // 2) Diccionario de intenciones (lo específico primero).
  for (const intent of INTENTS) {
    if (!intent.re.test(text)) continue;
    const cmd = commandMap.get(intent.cmd);
    if (!cmd) continue;
    const arg = String(intent.arg(request) || '').trim();
    return { line: `${prefix}${cmd.name}${arg ? ` ${arg}` : ''}`, cmd: cmd.name };
  }

  // 3) Coincidencia por nombre o alias dentro del texto (último recurso).
  const tokens = text.split(' ');
  for (const token of tokens) {
    if (token.length < 4) continue;
    const cmd = commandMap.get(token);
    if (!cmd || cmd.name === 'opencode') continue;
    const rest = cleanArgs(text.replace(new RegExp(`\\b${token}\\b`, 'g'), ' '));
    return { line: `${prefix}${cmd.name}${rest ? ` ${rest}` : ''}`, cmd: cmd.name };
  }

  return null;
}
