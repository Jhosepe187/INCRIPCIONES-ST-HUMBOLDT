// Portada: pantalla de carga, inicio de animaciones de entrada e inclinación 3D con el mouse.
(() => {
  const root = document.documentElement;
  root.classList.add('js');

  const loader = document.getElementById('loader');
  const fill = document.getElementById('loader-fill');
  const main = document.querySelector('main');
  const home = document.getElementById('home');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const assetBase = document.currentScript?.src || location.href;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  /* ---------- Pantalla de carga ---------- */
  let firstVisit = true;
  try {
    firstVisit = !sessionStorage.getItem('portal-visto');
    sessionStorage.setItem('portal-visto', '1');
  } catch { /* almacenamiento bloqueado: se trata como primera visita */ }

  const MIN_TIME = reduceMotion ? 0 : firstVisit ? 1100 : 350;
  const MAX_TIME = 4500;
  const startedAt = performance.now();
  if (main && loader) main.inert = true;

  const decode = img => (img.decode ? img.decode() : new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; })).catch(() => {});
  const background = new Image();
  background.src = new URL('../assets/img/inicio/fondo-patio.webp', assetBase).href;
  const fonts = document.fonts
    ? Promise.all([document.fonts.load('700 92px Poppins'), document.fonts.load('600 84px Poppins')]).then(() => document.fonts.ready)
    : Promise.resolve();
  const tasks = [...(home ? home.querySelectorAll('img') : []), background].map(decode).concat(fonts.catch(() => {}));

  let done = 0;
  const setProgress = value => { if (fill) fill.style.transform = `scaleX(${0.04 + 0.96 * value})`; };
  const allLoaded = Promise.all(tasks.map(task => task.then(() => setProgress(++done / tasks.length))));

  Promise.race([allLoaded, sleep(MAX_TIME)]).then(async () => {
    await sleep(Math.max(0, MIN_TIME - (performance.now() - startedAt)));
    setProgress(1);
    await sleep(reduceMotion ? 0 : 280);
    reveal();
  });

  function reveal() {
    root.classList.add('is-ready');
    if (main) main.inert = false;
    if (!loader) return;
    if (reduceMotion) { loader.remove(); return; }
    loader.classList.add('is-leaving');
    loader.addEventListener('transitionend', event => { if (event.propertyName === 'clip-path') loader.remove(); });
    setTimeout(() => loader.remove(), 1500);
  }

  /* ---------- Inclinación 3D ----------
     Solo con mouse o trackpad. Cada grupo gira hacia el puntero con un resorte
     (sin saltos) y sus capas se desplazan a distinta profundidad. Giros pequeños
     y sin escala, para que las imágenes y el texto no se deformen. */
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!home || reduceMotion || !finePointer) return;

  const stage = home.querySelector('.home-stage');
  const groups = [
    {
      el: home.querySelector('[data-tilt="scene"]'), maxX: 5, maxY: 7,
      layers: [
        { el: home.querySelector('[data-layer="aura"]'), dx: -18, dy: -12, spin: 5 },
        { el: home.querySelector('[data-layer="back"]'), dx: 5, dy: 3 },
        { el: home.querySelector('[data-layer="front"]'), dx: 13, dy: 7 },
      ],
    },
    {
      el: home.querySelector('[data-tilt="title"]'), maxX: 6, maxY: 8,
      layers: [
        ...[...home.querySelectorAll('[data-layer="text"]')].map(el => ({ el, dx: 9, dy: 5 })),
        { el: home.querySelector('[data-layer="year"]'), dx: 15, dy: 9 },
      ],
    },
  ].filter(group => group.el);
  for (const group of groups) Object.assign(group, { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 });

  // Rectángulos sin transformar (offset*), para que el propio giro no altere la medida.
  let stageBox = null;
  const measure = () => { stageBox = stage.getBoundingClientRect(); };
  addEventListener('resize', measure, { passive: true });
  addEventListener('scroll', measure, { passive: true });

  const clamp = value => Math.max(-1, Math.min(1, value));
  function aim(clientX, clientY) {
    if (!stageBox) measure();
    for (const group of groups) {
      const { offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height } = group.el;
      const nx = (clientX - stageBox.left - left - width / 2) / (width / 2);
      const ny = (clientY - stageBox.top - top - height / 2) / (height / 2);
      const inside = Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
      const strength = inside ? 1 : 0.32; // fuerte encima del elemento, sutil en el resto
      group.tx = clamp(nx) * strength;
      group.ty = clamp(ny) * strength;
    }
    wake();
  }
  function rest() { for (const group of groups) { group.tx = 0; group.ty = 0; } wake(); }

  home.addEventListener('pointermove', event => { if (event.pointerType === 'mouse' || event.pointerType === 'pen') aim(event.clientX, event.clientY); }, { passive: true });
  home.addEventListener('pointerleave', rest);
  document.addEventListener('visibilitychange', () => { if (document.hidden) rest(); });

  // Resorte casi críticamente amortiguado: llega rápido, sin rebote.
  const STIFFNESS = 140, DAMPING = 22;
  let frame = 0, last = 0;
  function wake() { if (!frame) { last = performance.now(); frame = requestAnimationFrame(step); } }
  function step(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    let moving = false;
    const unit = (stageBox?.width || stage.offsetWidth) / 960;
    for (const group of groups) {
      group.vx += ((group.tx - group.x) * STIFFNESS - group.vx * DAMPING) * dt;
      group.vy += ((group.ty - group.y) * STIFFNESS - group.vy * DAMPING) * dt;
      group.x += group.vx * dt;
      group.y += group.vy * dt;
      if (Math.abs(group.tx - group.x) > 1e-4 || Math.abs(group.vx) > 1e-4 || Math.abs(group.ty - group.y) > 1e-4 || Math.abs(group.vy) > 1e-4) moving = true;
      else { group.x = group.tx; group.y = group.ty; }
      const perspective = Math.round(group.el.offsetWidth * 2.4);
      group.el.style.transform = `perspective(${perspective}px) rotateX(${(-group.y * group.maxX).toFixed(3)}deg) rotateY(${(group.x * group.maxY).toFixed(3)}deg)`;
      for (const layer of group.layers) {
        if (!layer.el) continue;
        const spin = layer.spin ? ` rotate(${(group.x * layer.spin).toFixed(3)}deg)` : '';
        layer.el.style.transform = `translate3d(${(group.x * layer.dx * unit).toFixed(2)}px, ${(group.y * layer.dy * unit).toFixed(2)}px, 0)${spin}`;
      }
    }
    frame = moving ? requestAnimationFrame(step) : 0;
  }
})();
