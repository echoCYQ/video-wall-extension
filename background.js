// 视频分屏墙 v2 - 后台 Service Worker
// 职责：打开 wall.html 分屏页面，处理快捷键

async function openWall(layout, sourceUrl) {
  let url = sourceUrl || '';
  if (!url) {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const currentTab = tabs[0];
    if (currentTab && currentTab.url) {
      url = currentTab.url;
    }
  }
  if (url && /^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(url)) {
    url = '';
  }
  const wallUrl = chrome.runtime.getURL('wall.html') +
    '?layout=' + layout +
    (url ? '&url=' + encodeURIComponent(url) : '');

  // 如果已有 wall 标签页则复用
  const wallTabs = await chrome.tabs.query({ url: chrome.runtime.getURL('wall.html') + '*' });
  if (wallTabs.length > 0) {
    await chrome.tabs.update(wallTabs[0].id, { url: wallUrl, active: true });
  } else {
    await chrome.tabs.create({ url: wallUrl });
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'split-left-right') await openWall('left-right');
  else if (command === 'split-top-bottom') await openWall('top-bottom');
  else if (command === 'split-grid4') await openWall('grid4');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'vw-open-wall') {
    openWall(msg.layout, msg.url)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
});
