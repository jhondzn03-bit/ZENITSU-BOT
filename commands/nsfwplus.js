// ─── NSFW extra (portado de BOT-API a ZENITSU) ─────────────────────────────
// Categorías +18 con videos aleatorios, galerías de imágenes, videos gay y
// búsqueda en boorus (Rule34). Solo contenido para adultos (+18).
//
//   .girls [1-5]      → imágenes aleatorias
//   .tetas [1-5]      → imágenes aleatorias
//   .gayrand [1-3]    → videos gay aleatorios
//   .r34 <tags> [n]   → imágenes/videos por tags (yande.re / konachan)
//   .nsfwplusmenu     → lista de todas las categorías nuevas
import { fetchBuffer, jidToNumber, truncate } from '../lib/utils.js';
import { trackSent } from '../lib/state.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Tags que no se permiten (contenido de menores). Se descartan siempre.
const TAG_BLOCKLIST = /(^|[_\s-])(loli|lolicon|shota|shotacon|child|children|underage|minor|kid|toddler)([_\s-]|$)/i;

const CATEGORIES = {
  "69": [
    "https://cdn.yuki-wabot.my.id/files/kkqs.mp4",
    "https://cdn.yuki-wabot.my.id/files/QnUE.mp4",
    "https://cdn.yuki-wabot.my.id/files/aJSH.mp4",
    "https://cdn.yuki-wabot.my.id/files/APVc.mp4",
    "https://cdn.yuki-wabot.my.id/files/LbgB.mp4",
    "https://cdn.yuki-wabot.my.id/files/BUsd.mp4",
    "https://cdn.yuki-wabot.my.id/files/huUB.mp4",
    "https://cdn.yuki-wabot.my.id/files/5jdW.mp4",
    "https://cdn.yuki-wabot.my.id/files/X0y9.mp4",
    "https://cdn.yuki-wabot.my.id/files/JmEn.mp4"
  ],
  "spank": [
    "https://cdn.yuki-wabot.my.id/files/1Sve.mp4",
    "https://cdn.yuki-wabot.my.id/files/b8M6.mp4",
    "https://cdn.yuki-wabot.my.id/files/yBjF.mp4",
    "https://cdn.yuki-wabot.my.id/files/FI0k.mp4",
    "https://cdn.yuki-wabot.my.id/files/KLdv.mp4",
    "https://cdn.yuki-wabot.my.id/files/12LT.mp4",
    "https://cdn.yuki-wabot.my.id/files/C9nx.mp4",
    "https://cdn.yuki-wabot.my.id/files/Xb5O.mp4",
    "https://cdn.yuki-wabot.my.id/files/1IyF.mp4",
    "https://cdn.yuki-wabot.my.id/files/rw8p.mp4"
  ],
  "undress": [
    "https://cdn.yuki-wabot.my.id/files/p2g1.mp4",
    "https://cdn.yuki-wabot.my.id/files/nELt.mp4",
    "https://cdn.yuki-wabot.my.id/files/hezG.mp4",
    "https://cdn.yuki-wabot.my.id/files/qJgu.mp4",
    "https://cdn.yuki-wabot.my.id/files/iK0Z.mp4",
    "https://cdn.yuki-wabot.my.id/files/NlVS.mp4",
    "https://cdn.yuki-wabot.my.id/files/LUxZ.mp4",
    "https://cdn.yuki-wabot.my.id/files/IshD.mp4",
    "https://cdn.yuki-wabot.my.id/files/bWd6.mp4",
    "https://cdn.yuki-wabot.my.id/files/ATwj.mp4"
  ],
  "yuri": [
    "https://cdn.yuki-wabot.my.id/files/2GIM.mp4",
    "https://cdn.yuki-wabot.my.id/files/tVgt.mp4",
    "https://cdn.yuki-wabot.my.id/files/taNu.mp4",
    "https://cdn.yuki-wabot.my.id/files/ClhY.mp4",
    "https://cdn.yuki-wabot.my.id/files/7EUX.mp4",
    "https://cdn.yuki-wabot.my.id/files/BWHd.mp4",
    "https://cdn.yuki-wabot.my.id/files/OqMl.mp4",
    "https://cdn.yuki-wabot.my.id/files/qkZl.mp4",
    "https://cdn.yuki-wabot.my.id/files/WqgZ.mp4",
    "https://cdn.yuki-wabot.my.id/files/pnrb.mp4"
  ],
  "sixnine": [
    "https://cdn.yuki-wabot.my.id/files/kkqs.mp4",
    "https://cdn.yuki-wabot.my.id/files/QnUE.mp4",
    "https://cdn.yuki-wabot.my.id/files/aJSH.mp4",
    "https://cdn.yuki-wabot.my.id/files/APVc.mp4",
    "https://cdn.yuki-wabot.my.id/files/LbgB.mp4",
    "https://cdn.yuki-wabot.my.id/files/BUsd.mp4",
    "https://cdn.yuki-wabot.my.id/files/huUB.mp4",
    "https://cdn.yuki-wabot.my.id/files/5jdW.mp4",
    "https://cdn.yuki-wabot.my.id/files/X0y9.mp4",
    "https://cdn.yuki-wabot.my.id/files/JmEn.mp4"
  ],
  "anal": [
    "https://cdn.yuki-wabot.my.id/files/8d8D.mp4",
    "https://cdn.yuki-wabot.my.id/files/g8Mm.mp4",
    "https://cdn.yuki-wabot.my.id/files/jcsM.mp4",
    "https://cdn.yuki-wabot.my.id/files/gdFO.mp4",
    "https://cdn.yuki-wabot.my.id/files/hM41.mp4",
    "https://cdn.yuki-wabot.my.id/files/g2wJ.mp4",
    "https://cdn.yuki-wabot.my.id/files/tTYb.mp4",
    "https://cdn.yuki-wabot.my.id/files/0jaS.mp4",
    "https://cdn.yuki-wabot.my.id/files/S5du.mp4",
    "https://cdn.yuki-wabot.my.id/files/dr91.mp4"
  ],
  "fuck": [
    "https://cdn.yuki-wabot.my.id/files/GWLs.mp4",
    "https://cdn.yuki-wabot.my.id/files/cCQZ.mp4",
    "https://cdn.yuki-wabot.my.id/files/MRqC.mp4",
    "https://cdn.yuki-wabot.my.id/files/lHcW.mp4",
    "https://cdn.yuki-wabot.my.id/files/cUyl.mp4",
    "https://cdn.yuki-wabot.my.id/files/VUrC.mp4",
    "https://cdn.yuki-wabot.my.id/files/PYJc.mp4",
    "https://cdn.yuki-wabot.my.id/files/rAN7.mp4",
    "https://cdn.yuki-wabot.my.id/files/weKv.mp4",
    "https://cdn.yuki-wabot.my.id/files/k7ZM.mp4"
  ],
  "suckboobs": [
    "https://cdn.yuki-wabot.my.id/files/3bV7.mp4",
    "https://cdn.yuki-wabot.my.id/files/BT7m.mp4",
    "https://cdn.yuki-wabot.my.id/files/yb93.mp4",
    "https://cdn.yuki-wabot.my.id/files/dnrt.mp4",
    "https://cdn.yuki-wabot.my.id/files/PT3X.mp4",
    "https://cdn.yuki-wabot.my.id/files/VesN.mp4",
    "https://cdn.yuki-wabot.my.id/files/Stxs.mp4",
    "https://cdn.yuki-wabot.my.id/files/kLxW.mp4",
    "https://cdn.yuki-wabot.my.id/files/Sy1C.mp4",
    "https://cdn.yuki-wabot.my.id/files/7eVv.mp4"
  ],
  "cummoth": [
    "https://cdn.yuki-wabot.my.id/files/LnRN.mp4",
    "https://cdn.yuki-wabot.my.id/files/h7YA.mp4",
    "https://cdn.yuki-wabot.my.id/files/sWFb.mp4",
    "https://cdn.yuki-wabot.my.id/files/kjvQ.mp4",
    "https://cdn.yuki-wabot.my.id/files/JcyG.mp4",
    "https://cdn.yuki-wabot.my.id/files/IVVq.mp4",
    "https://cdn.yuki-wabot.my.id/files/hqRy.mp4",
    "https://cdn.yuki-wabot.my.id/files/5Y7z.mp4",
    "https://cdn.yuki-wabot.my.id/files/Di2q.mp4",
    "https://cdn.yuki-wabot.my.id/files/Z9BJ.mp4"
  ],
  "cumshot": [
    "https://cdn.yuki-wabot.my.id/files/vkSu.mp4",
    "https://cdn.yuki-wabot.my.id/files/rj61.mp4",
    "https://cdn.yuki-wabot.my.id/files/2w4x.mp4",
    "https://cdn.yuki-wabot.my.id/files/7ZXk.mp4",
    "https://cdn.yuki-wabot.my.id/files/Up8w.mp4",
    "https://cdn.yuki-wabot.my.id/files/U1vT.mp4",
    "https://cdn.yuki-wabot.my.id/files/nNjD.mp4",
    "https://cdn.yuki-wabot.my.id/files/X09N.mp4",
    "https://cdn.yuki-wabot.my.id/files/EAa7.mp4",
    "https://cdn.yuki-wabot.my.id/files/ickC.mp4"
  ],
  "cum": [
    "https://cdn.yuki-wabot.my.id/files/WgY8.mp4",
    "https://cdn.yuki-wabot.my.id/files/Sfg2.mp4",
    "https://cdn.yuki-wabot.my.id/files/oAQ7.mp4",
    "https://cdn.yuki-wabot.my.id/files/3kV8.mp4",
    "https://cdn.yuki-wabot.my.id/files/9siz.mp4",
    "https://cdn.yuki-wabot.my.id/files/qb94.mp4",
    "https://cdn.yuki-wabot.my.id/files/xOqF.mp4",
    "https://cdn.yuki-wabot.my.id/files/vvCu.mp4",
    "https://cdn.yuki-wabot.my.id/files/9Hjn.mp4",
    "https://cdn.yuki-wabot.my.id/files/WIuC.jpeg"
  ],
  "lickpussy": [
    "https://cdn.yuki-wabot.my.id/files/YOkd.mp4",
    "https://cdn.yuki-wabot.my.id/files/8Ztq.mp4",
    "https://cdn.yuki-wabot.my.id/files/kHLQ.mp4",
    "https://cdn.yuki-wabot.my.id/files/qzH1.mp4",
    "https://cdn.yuki-wabot.my.id/files/cMfm.mp4",
    "https://cdn.yuki-wabot.my.id/files/cDrL.mp4",
    "https://cdn.yuki-wabot.my.id/files/D9kS.mp4",
    "https://cdn.yuki-wabot.my.id/files/apfo.mp4",
    "https://cdn.yuki-wabot.my.id/files/VNOn.mp4",
    "https://cdn.yuki-wabot.my.id/files/JrAi.mp4"
  ],
  "lickdick": [
    "https://cdn.yuki-wabot.my.id/files/Q3Wi.mp4",
    "https://cdn.yuki-wabot.my.id/files/XAwW.mp4",
    "https://cdn.yuki-wabot.my.id/files/87WD.mp4",
    "https://cdn.yuki-wabot.my.id/files/eWnU.mp4",
    "https://cdn.yuki-wabot.my.id/files/ppYP.mp4",
    "https://cdn.yuki-wabot.my.id/files/XA6T.mp4",
    "https://cdn.yuki-wabot.my.id/files/Hc3Y.mp4",
    "https://cdn.yuki-wabot.my.id/files/jEir.mp4",
    "https://cdn.yuki-wabot.my.id/files/Ywlz.mp4",
    "https://cdn.yuki-wabot.my.id/files/A4hZ.mp4"
  ],
  "lickass": [
    "https://cdn.yuki-wabot.my.id/files/1IHj.mp4",
    "https://cdn.yuki-wabot.my.id/files/9uiB.mp4",
    "https://cdn.yuki-wabot.my.id/files/6zJk.mp4",
    "https://cdn.yuki-wabot.my.id/files/mv59.mp4",
    "https://cdn.yuki-wabot.my.id/files/v9Bq.mp4",
    "https://cdn.yuki-wabot.my.id/files/OQwz.jpeg",
    "https://cdn.yuki-wabot.my.id/files/6XJX.mp4",
    "https://cdn.yuki-wabot.my.id/files/YSSs.mp4",
    "https://cdn.yuki-wabot.my.id/files/WCMq.mp4",
    "https://cdn.yuki-wabot.my.id/files/iEW3.mp4"
  ],
  "handjob": [
    "https://cdn.yuki-wabot.my.id/files/vARz.mp4",
    "https://cdn.yuki-wabot.my.id/files/huzl.mp4",
    "https://cdn.yuki-wabot.my.id/files/WXu1.mp4",
    "https://cdn.yuki-wabot.my.id/files/A3ic.mp4",
    "https://cdn.yuki-wabot.my.id/files/9Afv.mp4",
    "https://cdn.yuki-wabot.my.id/files/suDf.mp4",
    "https://cdn.yuki-wabot.my.id/files/rsbC.mp4",
    "https://cdn.yuki-wabot.my.id/files/DP6O.mp4",
    "https://cdn.yuki-wabot.my.id/files/loC3.mp4",
    "https://cdn.yuki-wabot.my.id/files/p0yY.mp4"
  ],
  "grope": [
    "https://cdn.yuki-wabot.my.id/files/R66C.mp4",
    "https://cdn.yuki-wabot.my.id/files/x751.mp4",
    "https://cdn.yuki-wabot.my.id/files/tvd0.mp4",
    "https://cdn.yuki-wabot.my.id/files/PN18.mp4",
    "https://cdn.yuki-wabot.my.id/files/sxoz.mp4",
    "https://cdn.yuki-wabot.my.id/files/Z0dG.mp4",
    "https://cdn.yuki-wabot.my.id/files/oKHl.mp4",
    "https://cdn.yuki-wabot.my.id/files/gb2X.mp4",
    "https://cdn.yuki-wabot.my.id/files/JISx.mp4",
    "https://cdn.yuki-wabot.my.id/files/0WbV.mp4"
  ],
  "grabboobs": [
    "https://cdn.yuki-wabot.my.id/files/0U8R.mp4",
    "https://cdn.yuki-wabot.my.id/files/BadN.mp4",
    "https://cdn.yuki-wabot.my.id/files/SMmv.mp4",
    "https://cdn.yuki-wabot.my.id/files/SOkx.mp4",
    "https://cdn.yuki-wabot.my.id/files/O958.mp4",
    "https://cdn.yuki-wabot.my.id/files/s4zG.mp4",
    "https://cdn.yuki-wabot.my.id/files/mgVE.mp4",
    "https://cdn.yuki-wabot.my.id/files/KTIn.mp4",
    "https://cdn.yuki-wabot.my.id/files/XBpu.mp4",
    "https://cdn.yuki-wabot.my.id/files/swW3.mp4"
  ],
  "blowjob": [
    "https://cdn.yuki-wabot.my.id/files/3YNF.mp4",
    "https://cdn.yuki-wabot.my.id/files/ld7h.mp4",
    "https://cdn.yuki-wabot.my.id/files/pGys.mp4",
    "https://cdn.yuki-wabot.my.id/files/lRah.mp4",
    "https://cdn.yuki-wabot.my.id/files/7l5P.mp4",
    "https://cdn.yuki-wabot.my.id/files/qGVz.mp4",
    "https://cdn.yuki-wabot.my.id/files/ThGu.mp4",
    "https://cdn.yuki-wabot.my.id/files/UQn3.mp4",
    "https://cdn.yuki-wabot.my.id/files/GFvh.mp4",
    "https://cdn.yuki-wabot.my.id/files/2KEZ.mp4"
  ],
  "boobjob": [
    "https://cdn.yuki-wabot.my.id/files/wNm2.mp4",
    "https://cdn.yuki-wabot.my.id/files/mtsj.mp4",
    "https://cdn.yuki-wabot.my.id/files/MJQZ.mp4",
    "https://cdn.yuki-wabot.my.id/files/me3J.mp4",
    "https://cdn.yuki-wabot.my.id/files/8nSG.mp4",
    "https://cdn.yuki-wabot.my.id/files/dvJL.mp4",
    "https://cdn.yuki-wabot.my.id/files/PIQ0.mp4",
    "https://cdn.yuki-wabot.my.id/files/5D03.mp4",
    "https://cdn.yuki-wabot.my.id/files/ykpZ.mp4",
    "https://cdn.yuki-wabot.my.id/files/rwyB.mp4"
  ],
  "fap": [
    "https://cdn.yuki-wabot.my.id/files/VuiC.mp4",
    "https://cdn.yuki-wabot.my.id/files/7j6s.mp4",
    "https://cdn.yuki-wabot.my.id/files/dwhV.mp4",
    "https://cdn.yuki-wabot.my.id/files/9bDa.mp4",
    "https://cdn.yuki-wabot.my.id/files/B6GC.mp4",
    "https://cdn.yuki-wabot.my.id/files/ZTnN.mp4",
    "https://cdn.yuki-wabot.my.id/files/EGBJ.mp4",
    "https://cdn.yuki-wabot.my.id/files/LWta.mp4",
    "https://cdn.yuki-wabot.my.id/files/Z6ri.mp4",
    "https://cdn.yuki-wabot.my.id/files/xVrs.mp4"
  ],
  "footjob": [
    "https://cdn.yuki-wabot.my.id/files/0Yf0.mp4",
    "https://cdn.yuki-wabot.my.id/files/OsoL.mp4",
    "https://cdn.yuki-wabot.my.id/files/oIyN.mp4",
    "https://cdn.yuki-wabot.my.id/files/2nMl.mp4",
    "https://cdn.yuki-wabot.my.id/files/bTCa.mp4",
    "https://cdn.yuki-wabot.my.id/files/D8Sw.mp4",
    "https://cdn.yuki-wabot.my.id/files/viYl.mp4",
    "https://cdn.yuki-wabot.my.id/files/x5N5.mp4",
    "https://cdn.yuki-wabot.my.id/files/2ob2.mp4",
    "https://cdn.yuki-wabot.my.id/files/ZLo7.mp4"
  ],
  "fingering": [
    "https://cdn.yuki-wabot.my.id/files/pw4t.mp4",
    "https://cdn.yuki-wabot.my.id/files/wclJ.mp4",
    "https://cdn.yuki-wabot.my.id/files/u2NI.mp4",
    "https://cdn.yuki-wabot.my.id/files/R6ul.mp4",
    "https://cdn.yuki-wabot.my.id/files/lhQJ.mp4",
    "https://cdn.yuki-wabot.my.id/files/LAzh.mp4",
    "https://cdn.yuki-wabot.my.id/files/kyuG.mp4",
    "https://cdn.yuki-wabot.my.id/files/FPoS.mp4",
    "https://cdn.yuki-wabot.my.id/files/IQcQ.mp4",
    "https://cdn.yuki-wabot.my.id/files/N7GS.mp4"
  ],
  "creampie": [
    "https://cdn.yuki-wabot.my.id/files/2i3e.mp4",
    "https://cdn.yuki-wabot.my.id/files/H26A.mp4",
    "https://cdn.yuki-wabot.my.id/files/ugP4.jpeg",
    "https://cdn.yuki-wabot.my.id/files/YjXf.jpeg",
    "https://cdn.yuki-wabot.my.id/files/aBHw.jpeg",
    "https://cdn.yuki-wabot.my.id/files/wcgE.mp4",
    "https://cdn.yuki-wabot.my.id/files/OmPi.mp4",
    "https://cdn.yuki-wabot.my.id/files/muwD.mp4",
    "https://cdn.yuki-wabot.my.id/files/4tfx.mp4",
    "https://cdn.yuki-wabot.my.id/files/CAd8.jpeg"
  ],
  "facesitting": [
    "https://cdn.yuki-wabot.my.id/files/gVMP.mp4",
    "https://cdn.yuki-wabot.my.id/files/uWys.mp4",
    "https://cdn.yuki-wabot.my.id/files/0SHB.mp4",
    "https://cdn.yuki-wabot.my.id/files/YwMe.mp4",
    "https://cdn.yuki-wabot.my.id/files/mqIn.mp4",
    "https://cdn.yuki-wabot.my.id/files/tFi1.mp4",
    "https://cdn.yuki-wabot.my.id/files/X7Oe.mp4",
    "https://cdn.yuki-wabot.my.id/files/e705.mp4",
    "https://cdn.yuki-wabot.my.id/files/PEBc.mp4",
    "https://cdn.yuki-wabot.my.id/files/3k4E.mp4"
  ],
  "futanari": [
    "https://cdn.yuki-wabot.my.id/files/sRkO.mp4",
    "https://cdn.yuki-wabot.my.id/files/j0ry.mp4",
    "https://cdn.yuki-wabot.my.id/files/mJKc.mp4",
    "https://cdn.yuki-wabot.my.id/files/68ra.mp4",
    "https://cdn.yuki-wabot.my.id/files/KLrR.mp4",
    "https://cdn.yuki-wabot.my.id/files/NN5A.mp4",
    "https://cdn.yuki-wabot.my.id/files/tJcB.mp4",
    "https://cdn.yuki-wabot.my.id/files/PB8i.mp4",
    "https://cdn.yuki-wabot.my.id/files/65Xn.mp4",
    "https://cdn.yuki-wabot.my.id/files/lLMd.mp4"
  ],
  "pegging": [
    "https://cdn.yuki-wabot.my.id/files/J6pL.mp4",
    "https://cdn.yuki-wabot.my.id/files/lvZG.mp4",
    "https://cdn.yuki-wabot.my.id/files/gpHC.mp4",
    "https://cdn.yuki-wabot.my.id/files/d4ta.mp4",
    "https://cdn.yuki-wabot.my.id/files/gaWM.mp4",
    "https://cdn.yuki-wabot.my.id/files/pjJP.mp4",
    "https://cdn.yuki-wabot.my.id/files/23bo.mp4",
    "https://cdn.yuki-wabot.my.id/files/SF64.mp4",
    "https://cdn.yuki-wabot.my.id/files/9xLd.mp4",
    "https://cdn.yuki-wabot.my.id/files/3kgZ.mp4"
  ],
  "bondage": [
    "https://cdn.yuki-wabot.my.id/files/LByq.mp4",
    "https://cdn.yuki-wabot.my.id/files/h5bF.mp4",
    "https://cdn.yuki-wabot.my.id/files/aPHQ.mp4",
    "https://cdn.yuki-wabot.my.id/files/QIrq.mp4",
    "https://cdn.yuki-wabot.my.id/files/Yox4.mp4",
    "https://cdn.yuki-wabot.my.id/files/l8IQ.mp4",
    "https://cdn.yuki-wabot.my.id/files/p4jt.mp4",
    "https://cdn.yuki-wabot.my.id/files/ijIr.mp4",
    "https://cdn.yuki-wabot.my.id/files/R0iD.mp4",
    "https://cdn.yuki-wabot.my.id/files/7RgY.mp4"
  ],
  "deepthroat": [
    "https://cdn.yuki-wabot.my.id/files/1Nog.mp4",
    "https://cdn.yuki-wabot.my.id/files/gEfE.mp4",
    "https://cdn.yuki-wabot.my.id/files/L26C.mp4",
    "https://cdn.yuki-wabot.my.id/files/w9qF.mp4",
    "https://cdn.yuki-wabot.my.id/files/Tnjq.mp4",
    "https://cdn.yuki-wabot.my.id/files/46Zs.mp4",
    "https://cdn.yuki-wabot.my.id/files/QSSi.mp4",
    "https://cdn.yuki-wabot.my.id/files/oixe.mp4",
    "https://cdn.yuki-wabot.my.id/files/VQFb.mp4",
    "https://cdn.yuki-wabot.my.id/files/BwL8.mp4"
  ],
  "thighjob": [
    "https://cdn.yuki-wabot.my.id/files/XHTZ.mp4",
    "https://cdn.yuki-wabot.my.id/files/ZaiI.mp4",
    "https://cdn.yuki-wabot.my.id/files/DOzT.mp4",
    "https://cdn.yuki-wabot.my.id/files/H423.mp4",
    "https://cdn.yuki-wabot.my.id/files/XKu4.mp4",
    "https://cdn.yuki-wabot.my.id/files/ivl5.mp4",
    "https://cdn.yuki-wabot.my.id/files/pqw9.mp4",
    "https://cdn.yuki-wabot.my.id/files/Xkgy.mp4",
    "https://cdn.yuki-wabot.my.id/files/6UJC.mp4",
    "https://cdn.yuki-wabot.my.id/files/4AeC.mp4"
  ],
  "yaoi": [
    "https://cdn.yuki-wabot.my.id/files/4saj.mp4",
    "https://cdn.yuki-wabot.my.id/files/q67x.mp4",
    "https://cdn.yuki-wabot.my.id/files/HjE8.mp4",
    "https://cdn.yuki-wabot.my.id/files/ofP5.mp4",
    "https://cdn.yuki-wabot.my.id/files/JlLl.mp4",
    "https://cdn.yuki-wabot.my.id/files/gUXB.mp4",
    "https://cdn.yuki-wabot.my.id/files/4uxr.mp4",
    "https://cdn.yuki-wabot.my.id/files/z7I9.mp4",
    "https://cdn.yuki-wabot.my.id/files/m2ld.mp4",
    "https://cdn.yuki-wabot.my.id/files/8CVI.mp4"
  ],
  "bukkake": [
    "https://cdn.yuki-wabot.my.id/files/wDKv.mp4",
    "https://cdn.yuki-wabot.my.id/files/TGjj.mp4",
    "https://cdn.yuki-wabot.my.id/files/Af58.mp4",
    "https://cdn.yuki-wabot.my.id/files/dMZg.mp4",
    "https://cdn.yuki-wabot.my.id/files/Nd1W.mp4",
    "https://cdn.yuki-wabot.my.id/files/ZKnj.mp4",
    "https://cdn.yuki-wabot.my.id/files/3Czz.mp4",
    "https://cdn.yuki-wabot.my.id/files/oj4E.mp4",
    "https://cdn.yuki-wabot.my.id/files/cWWo.mp4",
    "https://cdn.yuki-wabot.my.id/files/MAgj.mp4"
  ],
  "orgy": [
    "https://cdn.yuki-wabot.my.id/files/W3lc.mp4",
    "https://cdn.yuki-wabot.my.id/files/hIvF.mp4",
    "https://cdn.yuki-wabot.my.id/files/ypTG.mp4",
    "https://cdn.yuki-wabot.my.id/files/65A2.mp4",
    "https://cdn.yuki-wabot.my.id/files/Tnma.mp4",
    "https://cdn.yuki-wabot.my.id/files/DodD.mp4",
    "https://cdn.yuki-wabot.my.id/files/5U8K.mp4",
    "https://cdn.yuki-wabot.my.id/files/l30j.mp4",
    "https://cdn.yuki-wabot.my.id/files/heWq.mp4",
    "https://cdn.yuki-wabot.my.id/files/LYGn.mp4"
  ],
  "squirting": [
    "https://cdn.yuki-wabot.my.id/files/j0in.mp4",
    "https://cdn.yuki-wabot.my.id/files/zRAF.mp4",
    "https://cdn.yuki-wabot.my.id/files/pEAr.mp4",
    "https://cdn.yuki-wabot.my.id/files/6Q5l.mp4",
    "https://cdn.yuki-wabot.my.id/files/u2vg.mp4",
    "https://cdn.yuki-wabot.my.id/files/GbnK.mp4",
    "https://cdn.yuki-wabot.my.id/files/mxPV.mp4",
    "https://cdn.yuki-wabot.my.id/files/LEqS.mp4",
    "https://cdn.yuki-wabot.my.id/files/zsWG.mp4",
    "https://cdn.yuki-wabot.my.id/files/rs9t.mp4"
  ]
};

const MESSAGES = {
  "69": {
    "target": "⚡ @user1 y @user2 están haciendo el 69 🥵",
    "solo": "🤸 @user1 intentó hacer el 69 solo/a..."
  },
  "spank": {
    "target": "🔥 @user1 le dio una buena nalgada a @user2 🍑",
    "solo": "😳 @user1 se dio una nalgada a sí mismo/a..."
  },
  "undress": {
    "target": "😳 @user1 le está quitando la ropa a @user2 👀",
    "solo": "👀 @user1 se quitó la ropa solo/a..."
  },
  "yuri": {
    "target": "👭 @user1 y @user2 están teniendo un momento yuri apasionado 🌸",
    "solo": "🌸 @user1 está disfrutando de algo de yuri solo/a..."
  },
  "sixnine": {
    "target": "⚡ @user1 y @user2 están haciendo el 69 🥵",
    "solo": "🤸 @user1 intentó hacer el 69 solo/a..."
  },
  "anal": {
    "target": "🔥 @user1 le está dando por el culo a @user2 🔞",
    "solo": "👀 @user1 está pensando cosas anales..."
  },
  "fuck": {
    "target": "🔞 @user1 se está follando durísimo a @user2 🔥",
    "solo": "😈 @user1 quiere follar con alguien..."
  },
  "suckboobs": {
    "target": "🤤 @user1 le está chupando los pechos a @user2 🍒",
    "solo": "🤤 @user1 quiere chupar unos pechos..."
  },
  "cummoth": {
    "target": "💦 @user1 le llenó la boca de cum a @user2 🤤",
    "solo": "😳 @user1 se vino en su propia boca..."
  },
  "cumshot": {
    "target": "💦 @user1 le lanzó una descarga de cum a @user2 🔥",
    "solo": "💦 @user1 lanzó un chorro de cum al aire..."
  },
  "cum": {
    "target": "💦 @user1 se vino sobre @user2 🥵",
    "solo": "💦 @user1 se vino solo/a..."
  },
  "lickpussy": {
    "target": "👅 @user1 le está lamiendo el coño a @user2 🤤",
    "solo": "👅 @user1 quiere lamer un coño..."
  },
  "lickdick": {
    "target": "👅 @user1 le está lamiendo el pene a @user2 🤤",
    "solo": "👅 @user1 quiere lamer un pene..."
  },
  "lickass": {
    "target": "👅 @user1 le está lamiendo el culo a @user2 🍑",
    "solo": "👅 @user1 quiere lamer un culo..."
  },
  "handjob": {
    "target": "✋ @user1 le está haciendo una paja a @user2 ⚡",
    "solo": "✋ @user1 se está haciendo una paja solo/a..."
  },
  "grope": {
    "target": "😈 @user1 le está manoseando todo a @user2 🥵",
    "solo": "😈 @user1 se está manoseando solo/a..."
  },
  "grabboobs": {
    "target": "🍒 @user1 le agarró los pechos a @user2 😳",
    "solo": "🍒 @user1 se agarró los pechos solo/a..."
  },
  "blowjob": {
    "target": "😮‍💨 @user1 le está haciendo una mamada a @user2 💦",
    "solo": "😮‍💨 @user1 quiere dar una buena mamada..."
  },
  "boobjob": {
    "target": "🍒 @user1 le está haciendo una cubana a @user2 ⚡",
    "solo": "🍒 @user1 quiere hacer una cubana..."
  },
  "fap": {
    "target": "✊ @user1 se está pajeando pensando en @user2 🥵",
    "solo": "✊ @user1 se está pajeando solo/a..."
  },
  "footjob": {
    "target": "🦶 @user1 le está haciendo una paja con los pies a @user2 🤤",
    "solo": "🦶 @user1 quiere hacer una paja con los pies..."
  },
  "fingering": {
    "target": "🖐️ @user1 le está metiendo los dedos a @user2 🌊",
    "solo": "🖐️ @user1 se está masturbando con los dedos..."
  },
  "creampie": {
    "target": "🥧 @user1 le dejó una buena creampie a @user2 💦",
    "solo": "🥧 @user1 sueña con hacer una creampie..."
  },
  "facesitting": {
    "target": "🍑 @user1 se le sentó en la cara a @user2 😮‍💨",
    "solo": "🍑 @user1 quiere sentarse en la cara de alguien..."
  },
  "futanari": {
    "target": "🔥 @user1 y @user2 están disfrutando de algo de futanari ⚡",
    "solo": "🔥 @user1 está viendo futanari solo/a..."
  },
  "pegging": {
    "target": "🍆 @user1 le está haciendo pegging a @user2 😈",
    "solo": "🍆 @user1 busca a alguien para hacerle pegging..."
  },
  "bondage": {
    "target": "🪢 @user1 dejó amarrado/a a @user2 😈",
    "solo": "🪢 @user1 se amarró solo/a..."
  },
  "deepthroat": {
    "target": "😮‍💨 @user1 le hace una garganta profunda a @user2 💦",
    "solo": "😮‍💨 @user1 practica garganta profunda solo/a..."
  },
  "thighjob": {
    "target": "🍗 @user1 le hace una paja con los muslos a @user2 🤤",
    "solo": "🍗 @user1 presume de muslos..."
  },
  "yaoi": {
    "target": "👬 @user1 y @user2 están en un momento yaoi muy caliente 🔥",
    "solo": "👬 @user1 está viendo algo de yaoi solo/a..."
  },
  "bukkake": {
    "target": "💦 @user1 le dio un bukkake completo a @user2 🤤",
    "solo": "💦 @user1 está organizando un bukkake..."
  },
  "orgy": {
    "target": "🔥 @user1 metió a @user2 en una orgía 🔞",
    "solo": "🔥 @user1 quiere armar una orgía..."
  },
  "squirting": {
    "target": "🌊 @user1 hizo hacer squirt a @user2 💦",
    "solo": "🌊 @user1 tuvo un squirt intenso solo/a..."
  }
};


const IMAGE_EXT = /\.(?:jpe?g|png|gif|webp)(?:[?#]|$)/i;
const VIDEO_EXT = /\.(?:mp4|webm|mov|mkv)(?:[?#]|$)/i;

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function mentionsFor(ctx) {
  const author = ctx.sender || '';
  const target = ctx.mentioned?.[0] || ctx.quoted?.sender || '';
  const mentions = [];
  if (author) mentions.push(author);
  if (target && target !== author) mentions.push(target);
  return {
    mentions,
    author: author ? `@${jidToNumber(author)}` : '@usuario',
    target: target ? `@${jidToNumber(target)}` : '',
  };
}

async function sendImage(ctx, url, caption, mentions = []) {
  try {
    const sent = await ctx.sock.sendMessage(
      ctx.chat,
      { image: { url }, caption, mentions },
      { quoted: ctx.msg },
    );
    trackSent(sent);
    return;
  } catch {}
  const buffer = await fetchBuffer(url, {}, 90000);
  if (!buffer?.length) throw new Error('la imagen llegó vacía');
  const sent = await ctx.sock.sendMessage(
    ctx.chat,
    { image: buffer, caption, mentions },
    { quoted: ctx.msg },
  );
  trackSent(sent);
}

async function sendVideo(ctx, url, caption, mentions = [], gifPlayback = false) {
  try {
    const sent = await ctx.sock.sendMessage(
      ctx.chat,
      { video: { url }, mimetype: 'video/mp4', gifPlayback, caption, mentions },
      { quoted: ctx.msg },
    );
    trackSent(sent);
    return;
  } catch {}
  const buffer = await fetchBuffer(url, {}, 240000);
  if (!buffer?.length) throw new Error('el video llegó vacío');
  const sent = await ctx.sock.sendMessage(
    ctx.chat,
    { video: buffer, mimetype: 'video/mp4', gifPlayback, caption, mentions },
    { quoted: ctx.msg },
  );
  trackSent(sent);
}

async function sendAny(ctx, url, caption, mentions = [], gifPlayback = false) {
  const clean = String(url).split('?')[0];
  if (IMAGE_EXT.test(clean)) return sendImage(ctx, url, caption, mentions);
  if (VIDEO_EXT.test(clean)) return sendVideo(ctx, url, caption, mentions, gifPlayback);
  return sendImage(ctx, url, caption, mentions);
}

// ── Categorías con video/imagen aleatoria ────────────────────────────────
function categoryCommand(key, name, aliases = []) {
  return {
    name,
    aliases,
    category: 'nsfw',
    desc: `Contenido +18 aleatorio: ${key.replace(/_/g, ' ')}.`,
    usage: `${name} [@usuario]`,
    async execute(ctx) {
      const url = pick(CATEGORIES[key]);
      if (!url) throw new Error('no hay contenido para esta categoría');
      const who = mentionsFor(ctx);
      const msg = MESSAGES[key] || {};
      const template = who.target
        ? String(msg.target || msg.solo || '🔥 @user1 y @user2')
        : String(msg.solo || '🔥 @user1');
      const caption =
        `🔥 *${String(key).toUpperCase()}*\n\n💫 ` +
        template.replaceAll('@user1', who.author).replaceAll('@user2', who.target || who.author);
      await sendAny(ctx, url, caption, who.mentions, true);
    },
  };
}

// ── Galerías (imágenes aleatorias) ───────────────────────────────────────
function galleryCommand(name, aliases, endpoint, label) {
  return {
    name,
    aliases,
    category: 'nsfw',
    desc: `Imágenes +18 aleatorias: ${label}.`,
    usage: `${name} [cantidad 1-5]`,
    async execute(ctx) {
      const raw = String(ctx.args[0] || '').trim();
      const count = Math.max(1, Math.min(5, parseInt(raw, 10) || 1));
      if (count > 1) await ctx.reply(`🔞 Enviando *${count}* imágenes de ${label}...`);
      let sent = 0;
      for (let i = 0; i < count; i++) {
        try {
          await sendImage(
            ctx,
            `${endpoint}?_=${Date.now()}_${i}`,
            `🔞 *+18 · ${label}* · ${i + 1}/${count}`,
          );
          sent++;
        } catch (err) {
          console.error(`[${name.toUpperCase()}]`, err?.message || err);
        }
      }
      if (!sent) throw new Error(`no pude obtener imágenes de ${label}`);
    },
  };
}

// ── Rule34 / boorus ──────────────────────────────────────────────────────
async function booruSearch(host, tag) {
  const url = `https://${host}/post.json?limit=30&tags=${encodeURIComponent(tag)}`;
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return [];
  const list = await res.json();
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const post of list) {
    const candidates = [post.file_url, post.sample_url, post.preview_url].filter(Boolean);
    for (const link of candidates) {
      if (typeof link !== 'string' || !/^https?:\/\//i.test(link)) continue;
      out.push({
        url: link,
        video: /\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(link) || post.file_ext === 'mp4',
      });
      break;
    }
  }
  return out;
}

export async function rule34Search(tag, limit = 8) {
  const clean = String(tag || '').trim().replace(/\s+/g, '_');
  if (!clean) throw new Error('escribe tags (ej: hatsune_miku)');
  if (TAG_BLOCKLIST.test(clean)) throw new Error('esos tags no están permitidos');
  const found = [];
  for (const host of ['yande.re', 'konachan.com']) {
    try {
      found.push(...(await booruSearch(host, `${clean} -loli -shota`)));
    } catch {}
    if (found.length >= limit) break;
  }
  if (!found.length) throw new Error(`sin resultados para *${clean}*`);
  return found;
}

// ── Comandos ─────────────────────────────────────────────────────────────
const commands = [];

commands.push(
  categoryCommand("69", "69", ["sixnine9"]),
  categoryCommand("spank", "spank", []),
  categoryCommand("undress", "undress", []),
  categoryCommand("yuri", "yurivid", []),
  categoryCommand("sixnine", "sixnine", []),
  categoryCommand("anal", "analvid", []),
  categoryCommand("fuck", "fuckvid", []),
  categoryCommand("suckboobs", "suckboobs", []),
  categoryCommand("cummoth", "cummoth", []),
  categoryCommand("cumshot", "cumshot", []),
  categoryCommand("cum", "cumvid", []),
  categoryCommand("lickpussy", "lickpussy", []),
  categoryCommand("lickdick", "lickdick", []),
  categoryCommand("lickass", "lickass", []),
  categoryCommand("handjob", "handjob", []),
  categoryCommand("grope", "grope", []),
  categoryCommand("grabboobs", "grabboobs", []),
  categoryCommand("blowjob", "blowjobvid", []),
  categoryCommand("boobjob", "boobjob", []),
  categoryCommand("fap", "fap", []),
  categoryCommand("footjob", "footjob", []),
  categoryCommand("fingering", "fingering", []),
  categoryCommand("creampie", "creampie", []),
  categoryCommand("facesitting", "facesitting", []),
  categoryCommand("futanari", "futanari", []),
  categoryCommand("pegging", "pegging", []),
  categoryCommand("bondage", "bondage", []),
  categoryCommand("deepthroat", "deepthroat", []),
  categoryCommand("thighjob", "thighjob", []),
  categoryCommand("yaoi", "yaoivid", []),
  categoryCommand("bukkake", "bukkake", []),
  categoryCommand("orgy", "orgy", []),
  categoryCommand("squirting", "squirting", []),
);

commands.push(
  galleryCommand('girls', ['girls18', 'chicas18', 'girlsimgs'], 'https://api.delirius.online/nsfw/girls', 'Girls'),
  galleryCommand('tetas', ['tetas18', 'boobs18', 'boobsimgs'], 'https://api.delirius.online/nsfw/boobs', 'Boobs'),
  {
    name: 'gayrand',
    aliases: ['gayrandom', 'gayaleatorio', 'gayvids'],
    category: 'nsfw',
    desc: 'Videos +18 gay aleatorios.',
    usage: 'gayrand [cantidad 1-3]',
    async execute(ctx) {
      const raw = String(ctx.args[0] || '').trim();
      const count = Math.max(1, Math.min(3, parseInt(raw, 10) || 1));
      if (count > 1) await ctx.reply(`🔞 Buscando *${count}* videos +18...`);
      let sent = 0;
      for (let i = 0; i < count; i++) {
        try {
          const res = await fetch(
            `https://api.evogb.org/porn/video/gay?key=evogb-tYhNSXu6&_=${Date.now()}_${i}`,
            { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(20000) },
          );
          if (!res.ok) continue;
          const json = await res.json();
          if (!json?.status || !json?.url) continue;
          await sendVideo(ctx, json.url, `🔞 *+18 · GAY* · ${i + 1}/${count}`);
          sent++;
        } catch (err) {
          console.error('[GAYRAND]', err?.message || err);
        }
      }
      if (!sent) throw new Error('no pude obtener videos ahora mismo, intenta de nuevo');
    },
  },
  {
    name: 'r34',
    aliases: ['rule34', 'r34vid', 'rule34vid'],
    category: 'nsfw',
    desc: 'Busca Rule34 por tags y envía imágenes/videos.',
    usage: 'r34 <tags> [cantidad 1-10]',
    async execute(ctx) {
      const tokens = String(ctx.args.join(' ') || '').trim().split(/\s+/).filter(Boolean);
      let count = 4;
      if (tokens.length && /^\d+$/.test(tokens[tokens.length - 1])) {
        count = Math.max(1, Math.min(10, parseInt(tokens.pop(), 10)));
      }
      const tag = tokens.join(' ').replace(/\s+/g, '_');
      if (!tag) throw new Error(`escribe tags. Ejemplo: *${ctx.prefix}r34 hatsune_miku 6*`);
      const found = await rule34Search(tag, Math.max(count * 3, 12));
      const isVideo = /vid$/.test(String(ctx.command || ''));
      let pool = found.filter((m) => (isVideo ? m.video : !m.video));
      if (!pool.length) pool = found;
      const chosen = pool.sort(() => Math.random() - 0.5).slice(0, isVideo ? Math.min(count, 2) : count);
      let sent = 0;
      for (let i = 0; i < chosen.length; i++) {
        const media = chosen[i];
        const caption = i === 0
          ? `🔞 *RULE 34*\n\n🏷️ Tags › *${truncate(tag, 80)}*\n📚 Enviando › *${chosen.length}* archivo(s)`
          : '';
        try {
          if (media.video) await sendVideo(ctx, media.url, caption);
          else await sendImage(ctx, media.url, caption);
          sent++;
        } catch (err) {
          console.error('[R34]', err?.message || err);
        }
      }
      if (!sent) throw new Error('no pude enviar los resultados, prueba con otros tags');
    },
  },
  {
    name: 'nsfwplusmenu',
    aliases: ['nsfwplus', 'nsfw2menu', 'nsfwvideos'],
    category: 'nsfw',
    desc: 'Lista las categorías NSFW extra (videos aleatorios).',
    usage: 'nsfwplusmenu',
    async execute(ctx) {
      const names = CATEGORIES ? Object.keys(CATEGORIES) : [];
      const list = names.map((k) => {
        const def = commands.find((c) => c.name === k || c.name === `${k}vid`);
        return `▸ *${ctx.prefix}${def ? def.name : k}*`;
      }).join('\n');
      await ctx.reply(
        `🔥 *NSFW EXTRA (+18)*\n\n${list}\n\n` +
        `🎲 *Aleatorios:* ${ctx.prefix}girls · ${ctx.prefix}tetas · ${ctx.prefix}gayrand\n` +
        `🔎 *Búsqueda:* ${ctx.prefix}r34 <tags> [cantidad]\n\n` +
        `_Solo para adultos. Usa el bot bajo tu responsabilidad._`,
      );
    },
  },
);

export default commands;
