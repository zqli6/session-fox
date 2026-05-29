// SessionFox v5.2 - Background Script
// 修复：并发切换锁、自动备份延迟、background主动导航newtab

let sessions       = [];
let sessionCookies = {};
let tabSessionMap  = {};
let ready          = false;
let switching      = false; // 并发切换锁

const DEFAULT_SESSIONS = [
  { id:"s1", name:"账号 1", color:"#FF6B6B" },
  { id:"s2", name:"账号 2", color:"#4ECDC4" },
  { id:"s3", name:"账号 3", color:"#45B7D1" },
];

// ── 持久化 ──
function persist() {
  const tabMap = {};
  for (const [k,v] of Object.entries(tabSessionMap)) tabMap[String(k)] = v;
  chrome.storage.local.set({ sessions, sessionCookies, tabSessionMap: tabMap });
}

// ── 启动恢复 ──
function restoreState() {
  return new Promise(resolve => {
    chrome.storage.local.get(["sessions","sessionCookies","tabSessionMap"], data => {
      sessions       = data.sessions       || DEFAULT_SESSIONS;
      sessionCookies = data.sessionCookies || {};
      tabSessionMap  = {};
      for (const [k,v] of Object.entries(data.tabSessionMap || {}))
        tabSessionMap[parseInt(k,10)] = v;
      ready = true;
      resolve();
    });
  });
}

restoreState().then(() => {
  buildContextMenu();
  chrome.tabs.query({}, tabs => {
    const valid = new Set(tabs.map(t=>t.id));
    let dirty = false;
    for (const id of Object.keys(tabSessionMap))
      if (!valid.has(parseInt(id,10))) { delete tabSessionMap[parseInt(id,10)]; dirty=true; }
    if (dirty) persist();
  });
});

// ── Cookie 工具 ──
function getCookies(url) {
  return new Promise(r => chrome.cookies.getAll({ url }, r));
}

async function clearCookies(url) {
  const cookies = await getCookies(url);
  await Promise.all(cookies.map(c => new Promise(r =>
    chrome.cookies.remove({ url: cookieUrl(c), name: c.name }, r)
  )));
}

function cookieUrl(c) {
  return `${c.secure?"https":"http"}://${c.domain.replace(/^\./,"")}${c.path||"/"}`;
}

async function backupCookies(sessionId, url) {
  if (!url || !url.startsWith("http")) return;
  const cookies = await getCookies(url);
  if (!cookies.length) return;
  if (!sessionCookies[sessionId]) sessionCookies[sessionId] = {};
  for (const c of cookies) {
    const d = c.domain || new URL(url).hostname;
    if (!sessionCookies[sessionId][d]) sessionCookies[sessionId][d] = [];
    const arr = sessionCookies[sessionId][d];
    const idx = arr.findIndex(x => x.name === c.name);
    if (idx >= 0) arr[idx] = c; else arr.push(c);
  }
  persist();
}

async function restoreCookies(sessionId, url) {
  if (!url || !url.startsWith("http")) return;
  const store = sessionCookies[sessionId];
  if (!store) return;
  const host = new URL(url).hostname;
  for (const [domain, cookies] of Object.entries(store)) {
    const cd = domain.replace(/^\./,"");
    if (host !== cd && !host.endsWith("."+cd)) continue;
    for (const c of cookies) {
      const details = {
        url:      cookieUrl(c),
        name:     c.name,
        value:    c.value,
        path:     c.path     || "/",
        secure:   c.secure   || false,
        httpOnly: c.httpOnly || false,
      };
      if (c.domain)         details.domain         = c.domain;
      if (c.expirationDate) details.expirationDate = c.expirationDate;
      if (c.sameSite && c.sameSite !== "unspecified") details.sameSite = c.sameSite;
      await new Promise(r => chrome.cookies.set(details, r));
    }
  }
}

// ── 核心：切换 Session（带并发锁）──
async function switchSession(tabId, newSid) {
  // 并发锁：防止快速连点导致 cookie 混乱
  if (switching) return;
  switching = true;
  try {
    const tab = await new Promise(r => chrome.tabs.get(tabId, r));
    const url = tab && tab.url;
    const oldSid = tabSessionMap[tabId];

    if (url && url.startsWith("http")) {
      if (oldSid && oldSid !== newSid) await backupCookies(oldSid, url);
      await clearCookies(url);
      await restoreCookies(newSid, url);
    }

    tabSessionMap[tabId] = newSid;
    persist();
    chrome.tabs.reload(tabId);
    sendBadge(tabId, newSid);
  } finally {
    // 锁定500ms，防止reload触发再次切换
    setTimeout(() => { switching = false; }, 500);
  }
}

// ── 打开带 session 的新标签 ──
function openWithSession(sessionId) {
  chrome.tabs.create({ url: chrome.extension.getURL("src/newtab.html") }, tab => {
    tabSessionMap[tab.id] = sessionId;
    persist();
    setTimeout(() => sendBadge(tab.id, sessionId), 600);
  });
}

// ── newtab 选完 session 后，由 background 导航到真正的新标签页 ──
// background 有权限调用 chrome.tabs.update 导航到任意 URL
function navigateToNewTab(tabId) {
  // edge://newtab 和 chrome://newtab 都可以，background 有权限
  chrome.tabs.update(tabId, { url: "chrome://newtab/" });
}

// ── 标签事件 ──
chrome.tabs.onRemoved.addListener(tabId => {
  if (tabSessionMap[tabId]) { delete tabSessionMap[tabId]; persist(); }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const sid = tabSessionMap[tabId];
  if (!sid) return;
  sendBadge(tabId, sid);
  // 页面稳定后备份（延迟2秒，确保所有 cookie 写入完成）
  if (tab.url && tab.url.startsWith("http")) {
    setTimeout(() => backupCookies(sid, tab.url), 2000);
  }
});

function sendBadge(tabId, sessionId) {
  const s = sessions.find(s=>s.id===sessionId);
  if (!s) return;
  chrome.tabs.sendMessage(tabId, { type:"SESSION_INFO", session:s }, ()=>chrome.runtime.lastError);
}

// ── 右键菜单 ──
function buildContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id:"sf-root", title:"🦊 用 Session 打开新标签", contexts:["page","link"] });
    for (const s of sessions)
      chrome.contextMenus.create({ id:`sf-open-${s.id}`, parentId:"sf-root",
        title:`${emoji(s.color)} ${s.name}`, contexts:["page","link"] });
    chrome.contextMenus.create({ id:"sf-sep", parentId:"sf-root", type:"separator", contexts:["page","link"] });
    chrome.contextMenus.create({ id:"sf-manage", parentId:"sf-root", title:"⚙️ 管理 Session...", contexts:["page","link"] });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sf-manage") {
    chrome.tabs.create({ url: chrome.extension.getURL("src/manage.html") });
    return;
  }
  if (info.menuItemId.startsWith("sf-open-"))
    openWithSession(info.menuItemId.replace("sf-open-",""));
});

function emoji(c) {
  return {"#FF6B6B":"🔴","#4ECDC4":"🟢","#45B7D1":"🔵","#96CEB4":"🟩","#FECA57":"🟡",
          "#FF9FF3":"🟣","#54A0FF":"🔵","#5F27CD":"🟣","#FF6348":"🟠","#2ED573":"🟢"}[c]||"⚪";
}

// ── 消息处理 ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!ready) await restoreState();
    switch (msg.type) {

      case "GET_SESSIONS":
        sendResponse(sessions); break;

      case "SAVE_SESSIONS":
        sessions = msg.sessions; persist(); buildContextMenu();
        sendResponse({ ok:true }); break;

      case "GET_TAB_SESSION": {
        const tabId = msg.tabId != null ? msg.tabId : sender.tab?.id;
        sendResponse(sessions.find(s=>s.id===tabSessionMap[tabId])||null); break;
      }

      case "OPEN_WITH_SESSION":
        openWithSession(msg.sessionId);
        sendResponse({ ok:true }); break;

      case "SWITCH_TAB_SESSION":
        await switchSession(msg.tabId, msg.sessionId);
        sendResponse({ ok:true }); break;

      case "BIND_TAB_SESSION":
        tabSessionMap[msg.tabId] = msg.sessionId;
        persist();
        sendResponse({ ok:true }); break;

      // newtab 选完 session 后通知 background 导航（background有权限）
      case "NAVIGATE_NEWTAB":
        navigateToNewTab(msg.tabId);
        sendResponse({ ok:true }); break;

      case "GET_SESSION_COOKIES": {
        const store = sessionCookies[msg.sessionId]||{};
        let count=0;
        for (const d of Object.values(store)) count += d.length;
        sendResponse({ store, count }); break;
      }

      case "CLEAR_SESSION_COOKIES":
        delete sessionCookies[msg.sessionId]; persist();
        sendResponse({ ok:true }); break;

      case "DEBUG_STATE":
        sendResponse({ tabSessionMap, sessions, switching,
          cookieKeys:Object.keys(sessionCookies) }); break;

      default: sendResponse({ error:"unknown" });
    }
  })();
  return true;
});
