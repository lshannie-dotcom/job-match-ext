// 投递参谋 · 后台脚本
const APP_URL = "app.html";
const MENU_ID = "jme-add-selection";

async function openApp() {
  const url = chrome.runtime.getURL(APP_URL);
  const tabs = await chrome.tabs.query({ url: url + "*" });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    return tabs[0];
  }
  return chrome.tabs.create({ url });
}

chrome.action.onClicked.addListener(() => {
  openApp();
});

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "把选中文本加入「投递参谋」",
      contexts: ["selection"]
    });
  });
  if (details.reason === "install") openApp();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  const text = info.selectionText.trim().slice(0, 20000);
  if (!text) return;
  const { pendingJDs = [] } = await chrome.storage.local.get("pendingJDs");
  pendingJDs.push({
    text,
    title: info.selectionText.trim().slice(0, 40).replace(/\s+/g, " "),
    sourceUrl: info.pageUrl || "",
    createdAt: Date.now()
  });
  await chrome.storage.local.set({ pendingJDs: pendingJDs.slice(-20) });
  await openApp();
});

// 供页面侧调用：抓取指定标签页正文（需要 scripting 权限）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "JME_EXTRACT_TAB") {
    (async () => {
      try {
        const tab = msg.tabId
          ? await chrome.tabs.get(msg.tabId)
          : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
        if (!tab?.id) throw new Error("找不到当前标签页");
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: pageExtractor
        });
        sendResponse({ ok: true, data: result });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }
  if (msg?.type === "JME_OPEN_APP") {
    openApp();
    sendResponse({ ok: true });
  }
});

// 该函数会被注入到目标页面执行，不能引用外部作用域
function pageExtractor() {
  const BAD = "script,style,noscript,nav,header,footer,aside,iframe,svg,form";
  const clone = document.body ? document.body.cloneNode(true) : null;
  if (!clone) return { title: document.title, url: location.href, text: "" };
  clone.querySelectorAll(BAD).forEach((el) => el.remove());
  clone.querySelectorAll("[aria-hidden='true']").forEach((el) => el.remove());

  const score = (el) => {
    const t = (el.innerText || "").trim();
    if (t.length < 120) return 0;
    const linkText = Array.from(el.querySelectorAll("a")).reduce((n, a) => n + (a.innerText || "").length, 0);
    return t.length - linkText * 1.6;
  };

  const candidates = [clone, ...clone.querySelectorAll("main,article,section,div")];
  let best = clone;
  let bestScore = score(clone);
  for (const el of candidates) {
    const s = score(el);
    if (s > bestScore) {
      best = el;
      bestScore = s;
    }
  }

  const text = (best.innerText || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20000);

  const h1 = document.querySelector("h1");
  return {
    title: (h1?.innerText || document.title || "").trim().slice(0, 120),
    url: location.href,
    text
  };
}
