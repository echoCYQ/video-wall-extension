// 视频分屏墙 v2 - 弹窗逻辑

const errorEl = document.getElementById('error');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.add('show');
  setTimeout(() => errorEl.classList.remove('show'), 6000);
}

async function openWall(layout) {
  errorEl.classList.remove('show');
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const currentTab = tabs[0];
  if (!currentTab || !currentTab.url) {
    showError('无法获取当前页面URL');
    return;
  }
  const url = currentTab.url;
  if (/^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(url)) {
    // 仍然打开 wall 页面，但面板为空
    const wallUrl = chrome.runtime.getURL('wall.html') + '?layout=' + layout;
    await chrome.tabs.create({ url: wallUrl });
    window.close();
    return;
  }
  const wallUrl = chrome.runtime.getURL('wall.html') +
    '?layout=' + layout + '&url=' + encodeURIComponent(url);
  await chrome.tabs.create({ url: wallUrl });
  window.close();
}

document.getElementById('split-lr').addEventListener('click', () => openWall('left-right'));
document.getElementById('split-tb').addEventListener('click', () => openWall('top-bottom'));
document.getElementById('split-g4').addEventListener('click', () => openWall('grid4'));
