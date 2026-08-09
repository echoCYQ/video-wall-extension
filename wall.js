// 视频分屏墙 v2 - wall 页面逻辑

const panels = [];
let currentLayout = 'grid4';
const grid = document.getElementById('grid');
let activeDropdown = null;

/* ============ 初始化 ============ */

function init() {
  const params = new URLSearchParams(location.search);
  currentLayout = params.get('layout') || 'grid4';
  const defaultUrl = params.get('url') || '';

  const count = currentLayout === 'grid4' ? 4 : 2;
  for (let i = 0; i < count; i++) {
    createPanel(defaultUrl, i + 1);
  }

  applyLayout(currentLayout);

  document.querySelectorAll('.layout-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchLayout(btn.dataset.layout));
  });

  document.getElementById('close-btn').addEventListener('click', () => {
    chrome.tabs.getCurrent((tab) => {
      if (tab) chrome.tabs.remove(tab.id);
    });
  });

  window.addEventListener('message', onIframeMessage);

  document.addEventListener('click', (e) => {
    if (activeDropdown && !activeDropdown.contains(e.target) && !e.target.classList.contains('tabs-btn')) {
      closeDropdown();
    }
  });
}

/* ============ 布局 ============ */

function applyLayout(layout) {
  currentLayout = layout;
  if (layout === 'left-right') {
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gridTemplateRows = '1fr';
  } else if (layout === 'top-bottom') {
    grid.style.gridTemplateColumns = '1fr';
    grid.style.gridTemplateRows = '1fr 1fr';
  } else {
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gridTemplateRows = '1fr 1fr';
  }
  document.querySelectorAll('.layout-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.layout === layout);
  });
}

function switchLayout(layout) {
  if (layout === currentLayout) return;
  const targetCount = layout === 'grid4' ? 4 : 2;

  while (panels.length < targetCount) {
    createPanel(panels[0] ? panels[0].urlInput.value : '', panels.length + 1);
  }
  while (panels.length > targetCount) {
    removePanel(panels.length - 1);
  }

  applyLayout(layout);

  panels.forEach((p, i) => {
    p.numLabel.textContent = String(i + 1);
    p.orb.textContent = String(i + 1);
    grid.appendChild(p.container);
  });

  panels.forEach((p, i) => {
    sendToPanel(i, { type: 'vw-activate' });
  });
}

/* ============ 面板管理 ============ */

function createPanel(url, num) {
  const container = document.createElement('div');
  container.className = 'panel';

  // 折叠圆球
  const orb = document.createElement('div');
  orb.className = 'panel-orb';
  orb.textContent = String(num);

  const header = document.createElement('div');
  header.className = 'panel-header';

  const numLabel = document.createElement('span');
  numLabel.className = 'panel-num';
  numLabel.textContent = String(num);

  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.className = 'url-input';
  urlInput.value = url || '';
  urlInput.placeholder = '输入网址…';

  const tabsBtn = document.createElement('button');
  tabsBtn.className = 'panel-btn tabs-btn';
  tabsBtn.textContent = '标签';
  tabsBtn.title = '从已打开的标签页选择';

  const goBtn = document.createElement('button');
  goBtn.className = 'panel-btn';
  goBtn.textContent = '打开';

  const reloadBtn = document.createElement('button');
  reloadBtn.className = 'panel-btn';
  reloadBtn.textContent = '刷新';

  const fillBtn = document.createElement('button');
  fillBtn.className = 'panel-btn';
  fillBtn.textContent = '铺满';
  fillBtn.title = '手动铺满视频';

  const unfillBtn = document.createElement('button');
  unfillBtn.className = 'panel-btn';
  unfillBtn.textContent = '还原';
  unfillBtn.title = '还原视频';

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'panel-btn collapse-btn';
  collapseBtn.textContent = '折叠';
  collapseBtn.title = '折叠工具栏为圆球';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'panel-btn close-btn';
  closeBtn.textContent = '\u00d7';
  closeBtn.title = '关闭此面板';

  header.appendChild(numLabel);
  header.appendChild(urlInput);
  header.appendChild(tabsBtn);
  header.appendChild(goBtn);
  header.appendChild(reloadBtn);
  header.appendChild(fillBtn);
  header.appendChild(unfillBtn);
  header.appendChild(collapseBtn);
  header.appendChild(closeBtn);

  const iframe = document.createElement('iframe');
  iframe.className = 'panel-iframe';
  if (url) iframe.src = normalizeUrl(url);

  container.appendChild(orb);
  container.appendChild(header);
  container.appendChild(iframe);
  grid.appendChild(container);

  const panel = {
    container, orb, header, numLabel, urlInput, tabsBtn, goBtn, reloadBtn,
    fillBtn, unfillBtn, collapseBtn, closeBtn, iframe,
    collapsed: false,
  };

  const panelIndex = () => panels.indexOf(panel);

  tabsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTabsDropdown(panel, tabsBtn);
  });
  goBtn.addEventListener('click', () => {
    loadUrl(panel, urlInput.value);
  });
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadUrl(panel, urlInput.value);
  });
  reloadBtn.addEventListener('click', () => {
    // 刷新当前 iframe 正在显示的页面
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.location.reload();
      }
    } catch (e) {
      // 跨域时 fallback：重新设置 src
      const currentSrc = iframe.src;
      iframe.src = 'about:blank';
      setTimeout(() => { iframe.src = currentSrc; }, 100);
    }
  });
  fillBtn.addEventListener('click', () => {
    sendToPanel(panelIndex(), { type: 'vw-refill' });
  });
  unfillBtn.addEventListener('click', () => {
    sendToPanel(panelIndex(), { type: 'vw-unfill' });
  });
  collapseBtn.addEventListener('click', () => {
    toggleCollapse(panel);
  });
  closeBtn.addEventListener('click', () => {
    const idx = panelIndex();
    if (idx >= 0) removePanel(idx);
  });
  orb.addEventListener('click', () => {
    toggleCollapse(panel);
  });

  iframe.addEventListener('load', () => {
    setTimeout(() => {
      sendToPanel(panelIndex(), { type: 'vw-activate' });
    }, 600);
  });

  panels.push(panel);
  return panel;
}

function removePanel(index) {
  const panel = panels[index];
  if (!panel) return;
  sendToPanel(index, { type: 'vw-deactivate' });
  panel.container.remove();
  panels.splice(index, 1);

  // 只剩一个面板时不再允许关闭
  if (panels.length === 1) {
    panels[0].closeBtn.style.display = 'none';
  } else {
    panels.forEach((p) => { p.closeBtn.style.display = ''; });
  }

  // 重新编号
  panels.forEach((p, i) => {
    p.numLabel.textContent = String(i + 1);
    p.orb.textContent = String(i + 1);
  });
}

/* ============ 折叠/展开 ============ */

function toggleCollapse(panel) {
  panel.collapsed = !panel.collapsed;
  if (panel.collapsed) {
    panel.header.classList.add('collapsed');
    panel.orb.classList.add('show');
  } else {
    panel.header.classList.remove('collapsed');
    panel.orb.classList.remove('show');
  }
}

/* ============ 标签页选择下拉 ============ */

async function toggleTabsDropdown(panel, anchorBtn) {
  closeDropdown();

  const dropdown = document.createElement('div');
  dropdown.className = 'tabs-dropdown';

  const allTabs = await chrome.tabs.query({});

  const usableTabs = allTabs.filter((t) => {
    if (!t.url) return false;
    if (/^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(t.url)) return false;
    if (t.url.indexOf(chrome.runtime.getURL('wall.html')) === 0) return false;
    return true;
  });

  if (usableTabs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tab-item';
    empty.style.color = '#666d82';
    empty.style.cursor = 'default';
    empty.textContent = '没有可用的标签页';
    dropdown.appendChild(empty);
  } else {
    for (const tab of usableTabs) {
      const item = document.createElement('div');
      item.className = 'tab-item';

      const icon = document.createElement('img');
      icon.src = tab.favIconUrl || '';
      icon.onerror = () => { icon.style.display = 'none'; };

      const titleWrap = document.createElement('div');
      titleWrap.style.flex = '1';
      titleWrap.style.minWidth = '0';

      const title = document.createElement('div');
      title.className = 'tab-title';
      title.textContent = tab.title || '无标题';

      const urlLabel = document.createElement('div');
      urlLabel.className = 'tab-url';
      urlLabel.textContent = tab.url;

      titleWrap.appendChild(title);
      titleWrap.appendChild(urlLabel);
      item.appendChild(icon);
      item.appendChild(titleWrap);

      item.addEventListener('click', () => {
        loadUrl(panel, tab.url);
        closeDropdown();
      });

      dropdown.appendChild(item);
    }
  }

  document.body.appendChild(dropdown);

  const btnRect = anchorBtn.getBoundingClientRect();
  dropdown.style.left = btnRect.left + 'px';
  dropdown.style.top = (btnRect.bottom + 4) + 'px';

  const ddRect = dropdown.getBoundingClientRect();
  if (ddRect.right > window.innerWidth) {
    dropdown.style.left = Math.max(0, window.innerWidth - ddRect.width - 8) + 'px';
  }

  activeDropdown = dropdown;
  dropdown.classList.add('show');
}

function closeDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
}

/* ============ URL 处理 ============ */

function normalizeUrl(url) {
  url = url.trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (/^\/\//.test(url)) return 'https:' + url;
  return 'https://' + url;
}

function loadUrl(panel, url) {
  const normalized = normalizeUrl(url);
  panel.urlInput.value = normalized;
  panel.iframe.src = normalized;
}

/* ============ postMessage 通信 ============ */

function sendToPanel(index, message) {
  if (index < 0 || index >= panels.length) return;
  const iframe = panels[index].iframe;
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage(message, '*');
  }
}

function onIframeMessage(e) {
  if (!e.data || typeof e.data !== 'object') return;
  const index = panels.findIndex((p) => p.iframe.contentWindow === e.source);
  if (index < 0) return;
  // vw-ready -> activate; vw-status -> no-op (buttons always visible)
  if (e.data.type === 'vw-ready') {
    sendToPanel(index, { type: 'vw-activate' });
  }
}

/* ============ 启动 ============ */

init();
