/**
 * platform-detect.js — Надёжное определение mobile/desktop
 * Работает корректно и в Chrome DevTools Device Mode, и на реальном устройстве.
 * 
 * ИСПОЛЬЗОВАНИЕ:
 *   <script src="platform-detect.js"></script>
 *   <script>
 *     if (Platform.isMobile) { ... }
 *     Platform.onChange((info) => console.log(info));
 *   </script>
 * 
 * ВАЖНО: В Chrome DevTools нужно ПЕРЕЗАГРУЗИТЬ страницу после включения Device Mode!
 */

const Platform = (() => {
  // --- Детекция ---

  function detect() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // 1) CSS media query pointer: coarse — самый надёжный сигнал
    //    Chrome DevTools переключает это при выборе устройства + reload
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

    // 2) Touch support
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // 3) UA-based (fallback)
    const mobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Opera Mini|IEMobile/i
      .test(navigator.userAgent);

    // 4) Размер экрана
    const smallScreen = width <= 768;

    // Комбинированное решение:
    // - coarsePointer — главный сигнал (работает в DevTools после reload)
    // - hasTouch + smallScreen — подстраховка
    // - mobileUA — дополнительный fallback
    const isMobile = coarsePointer || (hasTouch && smallScreen) || mobileUA;

    // Ориентация
    const orientation = width > height ? 'landscape' : 'portrait';

    // Тип устройства (грубо)
    let deviceType = 'desktop';
    if (isMobile && width <= 480) deviceType = 'phone';
    else if (isMobile) deviceType = 'tablet';

    return {
      isMobile,
      isDesktop: !isMobile,
      deviceType,        // 'phone' | 'tablet' | 'desktop'
      orientation,       // 'portrait' | 'landscape'
      screenWidth: width,
      screenHeight: height,
      hasTouch,
      coarsePointer,
      pixelRatio: window.devicePixelRatio || 1,
      // Для дебага — что именно сработало
      _triggers: {
        coarsePointer,
        hasTouch,
        mobileUA,
        smallScreen,
      }
    };
  }

  // --- Реактивность ---

  let current = detect();
  const listeners = [];

  function update() {
    const prev = current;
    current = detect();
    if (prev.isMobile !== current.isMobile || prev.orientation !== current.orientation) {
      listeners.forEach(fn => fn(current, prev));
    }
  }

  // Слушаем ресайз и смену ориентации
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => {
    // orientationchange часто срабатывает до обновления размеров
    setTimeout(update, 100);
  });

  // Слушаем изменение pointer media query (на случай горячего переключения)
  try {
    const mq = window.matchMedia('(pointer: coarse)');
    mq.addEventListener('change', update);
  } catch (e) { /* старые браузеры */ }

  // --- CSS классы на body ---

  function applyCSSClasses() {
    document.documentElement.classList.toggle('is-mobile', current.isMobile);
    document.documentElement.classList.toggle('is-desktop', current.isDesktop);
    document.documentElement.classList.toggle('is-portrait', current.orientation === 'portrait');
    document.documentElement.classList.toggle('is-landscape', current.orientation === 'landscape');
    document.documentElement.dataset.device = current.deviceType;
  }

  // Применяем сразу и при каждом изменении
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCSSClasses);
  } else {
    applyCSSClasses();
  }

  listeners.push(applyCSSClasses);

  // --- Debug overlay (опционально) ---

  function showDebugPanel() {
    const panel = document.createElement('div');
    panel.id = 'platform-debug';
    panel.style.cssText = `
      position: fixed; bottom: 8px; left: 8px; z-index: 99999;
      background: rgba(0,0,0,0.85); color: #0f0; font: 12px/1.4 monospace;
      padding: 8px 12px; border-radius: 6px; pointer-events: none;
      max-width: 280px;
    `;
    document.body.appendChild(panel);

    let fps = 0, frames = 0, lastTime = performance.now();

    function render() {
      frames++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        fps = frames;
        frames = 0;
        lastTime = now;
      }

      const c = detect(); // свежие данные
      panel.innerHTML = `
        <b>${c.isMobile ? '📱 MOBILE' : '🖥️ DESKTOP'}</b> (${c.deviceType})<br>
        ${c.screenWidth}×${c.screenHeight} · ${c.orientation} · ${c.pixelRatio}x<br>
        touch: ${c.hasTouch} · coarse: ${c.coarsePointer}<br>
        FPS: ${fps}
      `;
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  }

  // --- Public API ---

  return {
    get isMobile() { return current.isMobile; },
    get isDesktop() { return current.isDesktop; },
    get deviceType() { return current.deviceType; },
    get orientation() { return current.orientation; },
    get info() { return { ...current }; },

    onChange(fn) {
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },

    showDebug: showDebugPanel,
  };
})();
