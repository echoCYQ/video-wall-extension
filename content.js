// 视频分屏墙 v2 - 内容脚本（运行在每个 iframe 内）
// 职责：自动识别正在播放的视频，铺满整个 iframe 视口；通过 postMessage 与 wall 页面通信

(() => {
  if (window.__videoWallContentLoaded) return;
  window.__videoWallContentLoaded = true;

  const STYLE_ID = 'vw-fill-style';
  const FILL_CLASS = 'qwv-fill';
  // 扩展页面的 origin，用于验证 postMessage 来源
  const extOrigin = chrome.runtime.id ? 'chrome-extension://' + chrome.runtime.id : '';

  const state = {
    active: false,
    filledVideo: null,
    savedControls: null,
    hiddenElements: null,
    autoFill: false, // 默认关闭自动铺满，用户须手动开启
    cooling: false,
    pollTimer: null,
    scanTimer: null,
    shadowRoot: null,
    refillBtn: null,
    unfillBtn: null,
    autoBtn: null,
  };

  /* ============ 样式 ============ */

  const FILL_CSS = `
${FILL_CLASS}, video${FILL_CLASS.replace('.', '.')} {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  min-width: 0 !important;
  min-height: 0 !important;
  object-fit: contain !important;
  background: #000 !important;
  background-color: #000 !important;
  z-index: 2147483646 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  opacity: 1 !important;
  transform: none !important;
  filter: none !important;
  transition: none !important;
  pointer-events: auto !important;
}
/* 强制显示原生媒体控件（进度条/音量/全屏等） */
${FILL_CLASS}::-webkit-media-controls,
${FILL_CLASS}::-webkit-media-controls-enclosure,
${FILL_CLASS}::-webkit-media-controls-panel {
  display: flex !important;
  opacity: 1 !important;
  visibility: visible !important;
  z-index: 2147483647 !important;
  pointer-events: auto !important;
}
${FILL_CLASS}::-webkit-media-controls-overlay-play-button {
  display: flex !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}
/* 铺满时隐藏页面自定义播放器控制层（避免遮挡原生控件） */
.qwv-hide-on-fill {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}`;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = FILL_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ============ 控制浮层（Shadow DOM 隔离） ============ */

  const BAR_HOST_ID = 'qwv-bar-host';

  function ensureBar() {
    if (document.getElementById(BAR_HOST_ID)) return;
    const host = document.createElement('div');
    host.id = BAR_HOST_ID;

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .bar {
          position: fixed;
          top: 8px;
          right: 8px;
          z-index: 2147483647;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          background: rgba(15, 17, 26, 0.88);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.35);
          font: 11px/1.4 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
          color: #e6e8ee;
          user-select: none;
          backdrop-filter: blur(6px);
        }
        .btn {
          appearance: none;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.08);
          color: #e6e8ee;
          border-radius: 5px;
          padding: 3px 8px;
          font: inherit;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s;
        }
        .btn:hover { background: rgba(255,255,255,0.18); }
        .btn.on { background: #1a73e8; border-color: #1a73e8; color: #fff; }
      </style>
      <div class="bar">
        <button class="btn" data-act="refill">铺满</button>
        <button class="btn" data-act="unfill">还原</button>
        <button class="btn" data-act="toggle-auto">自动</button>
      </div>
    `;
    document.documentElement.appendChild(host);

    const root = host.shadowRoot;
    const refillBtn = root.querySelector('[data-act="refill"]');
    const unfillBtn = root.querySelector('[data-act="unfill"]');
    const autoBtn = root.querySelector('[data-act="toggle-auto"]');

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'unfill') {
        unfill();
      } else if (act === 'refill') {
        // 手动铺满：直接扫描并铺满，不改变 autoFill 开关
        unfill();
        scanSoon();
      } else if (act === 'toggle-auto') {
        state.autoFill = !state.autoFill;
        autoBtn.classList.toggle('on', state.autoFill);
        if (state.autoFill) {
          state.cooling = false;
          scanSoon();
        }
      }
    });

    state.shadowRoot = root;
    state.refillBtn = refillBtn;
    state.unfillBtn = unfillBtn;
    state.autoBtn = autoBtn;
    updateBar();
  }

  function updateBar() {
    if (!state.shadowRoot) return;
    // 所有按钮始终显示，无需隐藏切换
  }

  function removeBar() {
    const host = document.getElementById(BAR_HOST_ID);
    if (host) host.remove();
    state.shadowRoot = null;
  }

  /* ============ 视频识别与铺满 ============ */

  function videoArea(video) {
    try {
      const r = video.getBoundingClientRect();
      return r.width * r.height;
    } catch (e) {
      return 0;
    }
  }

  function isPlaying(video) {
    return (
      !video.paused &&
      !video.ended &&
      typeof video.currentTime === 'number' &&
      video.currentTime > 0 &&
      video.readyState >= 2
    );
  }

  function scan() {
    if (!state.active) return;
    if (!state.autoFill || state.cooling) return;
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return;
    const candidates = videos.filter(isPlaying);
    if (!candidates.length) return;
    const best = candidates.sort((a, b) => videoArea(b) - videoArea(a))[0];
    if (state.filledVideo === best) return;
    if (state.filledVideo && document.contains(state.filledVideo)) return;
    fill(best);
  }

  function scanSoon() {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(scan, 300);
  }

  function fill(video) {
    state.filledVideo = video;
    state.savedControls = video.controls;
    video.controls = true;
    video.classList.add(FILL_CLASS);
    // 隐藏页面上可能遮挡原生控件的自定义播放器控制层
    hideCustomControls(video);
    if (video.paused) {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    updateBar();
    sendToParent({ type: 'vw-status', filled: true });
  }

  function unfill() {
    if (state.filledVideo) {
      try {
        state.filledVideo.classList.remove(FILL_CLASS);
        if (state.savedControls !== null && state.filledVideo) {
          state.filledVideo.controls = state.savedControls;
        }
      } catch (e) {}
      // 恢复被隐藏的自定义控件
      restoreCustomControls();
      state.filledVideo = null;
      state.savedControls = null;
    }
    updateBar();
    sendToParent({ type: 'vw-status', filled: false });
  }

  /* ============ 自定义播放器控件处理 ============ */

  // 铺满时隐藏页面上可能遮挡原生 video 控件的层
  function hideCustomControls(video) {
    state.hiddenElements = [];
    // 常见自定义控制层选择器
    const selectors = [
      '[class*="control"]',
      '[class*="Control"]',
      '[class*="toolbar"]',
      '[class*="Toolbar"]',
      '[class*="player"]',
      '[class*="Player"]',
      '[class*="overlay"]',
      '[class*="Overlay"]',
      '[class*="progress"]',
      '[class*="Progress"]',
      '[class*="bar"]',
      '[class*="Bar"]',
      '[class*="setting"]',
      '[class*="Setting"]',
      '[class*="menu"]',
      '[class*="Menu"]',
      '[class*="danmaku"]',
      '[class*="Danmaku"]',
      '[class*="bullet"]',
      '[class*="bullet-screen"]',
    ];
    const candidates = new Set();
    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach((el) => candidates.add(el));
      } catch (e) {}
    }
    // 也隐藏 video 的兄弟节点和父级容器中的非 video 元素
    let parent = video.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      Array.from(parent.children).forEach((child) => {
        if (child !== video && child.tagName !== 'SCRIPT' && child.tagName !== 'STYLE') {
          candidates.add(child);
        }
      });
      parent = parent.parentElement;
    }
    for (const el of candidates) {
      if (el === video || el.contains(video)) continue;
      try {
        const style = getComputedStyle(el);
        // 只隐藏可见的、position 为 absolute/fixed 的层（这些最可能是覆盖层）
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          state.hiddenElements.push({
            el,
            prevDisplay: el.style.display,
            prevVisibility: el.style.visibility,
            prevOpacity: el.style.opacity,
            prevZIndex: el.style.zIndex,
            prevPointerEvents: el.style.pointerEvents,
          });
          el.classList.add('qwv-hide-on-fill');
        }
      } catch (e) {}
    }
  }

  function restoreCustomControls() {
    if (!state.hiddenElements) return;
    for (const item of state.hiddenElements) {
      try {
        item.el.classList.remove('qwv-hide-on-fill');
      } catch (e) {}
    }
    state.hiddenElements = [];
  }

  /* ============ 监听 ============ */

  function startWatching() {
    if (state.pollTimer) return;
    state.pollTimer = setInterval(scan, 1000);
    document.addEventListener('play', onPlayEvent, true);
    scan();
  }

  function stopWatching() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    document.removeEventListener('play', onPlayEvent, true);
  }

  function onPlayEvent(e) {
    if (e.target && e.target.tagName === 'VIDEO') scanSoon();
  }

  /* ============ 生命周期 ============ */

  function activate() {
    state.active = true;
    state.cooling = false;
    // autoFill 保持当前值（默认 false），不强制开启
    injectStyles();
    ensureBar();
    startWatching();
  }

  function deactivate() {
    state.active = false;
    unfill();
    stopWatching();
    removeBar();
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  /* ============ postMessage 通信 ============ */

  function sendToParent(message) {
    if (window.parent !== window) {
      parent.postMessage(message, '*');
    }
  }

  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object') return;
    // 只接受来自扩展页面的消息
    if (extOrigin && e.origin !== extOrigin) return;
    switch (e.data.type) {
      case 'vw-activate':
        activate();
        break;
      case 'vw-deactivate':
        deactivate();
        break;
      case 'vw-unfill':
        unfill();
        state.cooling = false;
        break;
      case 'vw-refill':
        state.cooling = false;
        unfill();
        scanSoon();
        break;
    }
  });

  // 通知 wall 页面 content script 已就绪
  sendToParent({ type: 'vw-ready' });
  setTimeout(() => sendToParent({ type: 'vw-ready' }), 500);
  setTimeout(() => sendToParent({ type: 'vw-ready' }), 2000);
})();
