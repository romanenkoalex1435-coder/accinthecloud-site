/* Тактильный отклик для демо «живой знак», без звука.
   Android — navigator.vibrate. На iPhone вибрировать сайтам нельзя, но щелчок скрытого
   переключателя <input switch> даёт короткий тактильный отклик (Safari 18+) — только внутри обработчика нажатия. */

let tapLabel = null;
function iosTap() {
  if (!tapLabel) {
    tapLabel = document.createElement('label');
    tapLabel.setAttribute('aria-hidden', 'true');
    tapLabel.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;overflow:hidden';
    const inp = document.createElement('input');
    inp.type = 'checkbox'; inp.setAttribute('switch', ''); inp.tabIndex = -1;
    tapLabel.appendChild(inp);
    document.body.appendChild(tapLabel);
  }
  tapLabel.click();
}
const canVibrate = 'vibrate' in navigator;
function buzz(pattern, inGesture) {
  if (canVibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
  else if (inGesture) iosTap();
}

export const haptic = {
  crack: hits => buzz(10 + hits * 5, true),          // удар: сильнее с каждым ударом подряд
  rumble: () => buzz([35, 40, 70, 50, 40], true),    // обвал: серия толчков
  kick: () => buzz(12, true),                        // пинок по горке
  bam: () => buzz(45, false),                        // знак собрался
};
