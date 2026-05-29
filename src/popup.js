let sessions = [], currentTab = null, currentSession = null;

async function init() {
  const [tab] = await new Promise(r => chrome.tabs.query({ active:true, currentWindow:true }, r));
  currentTab = tab;
  sessions = await send("GET_SESSIONS");
  currentSession = await send("GET_TAB_SESSION", { tabId: tab.id });
  renderCurrent();
  renderList();
}

function renderCurrent() {
  const row = document.getElementById("currentRow");
  if (currentSession) {
    row.innerHTML = `
      <span class="dot" style="background:${currentSession.color}"></span>
      <span class="current-name">${esc(currentSession.name)}</span>
    `;
  } else {
    row.innerHTML = `<span class="no-session">未绑定 Session — 右键页面可选择</span>`;
  }
}

function renderList() {
  const list = document.getElementById("list");
  list.innerHTML = sessions.map(s => `
    <div class="item ${currentSession?.id === s.id ? "active":""}" style="--c:${s.color}" data-id="${s.id}">
      <span class="dot" style="background:${s.color}"></span>
      <span class="item-name">${esc(s.name)}</span>
      <div class="item-btns">
        <button class="mini-btn teal"   data-action="new"    data-id="${s.id}">新标签</button>
        <button class="mini-btn yellow" data-action="switch" data-id="${s.id}">切换</button>
      </div>
    </div>
  `).join("");

  // 新标签按钮 - 打开 newtab 选择页并预选该 session
  list.querySelectorAll("[data-action='new']").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      await send("OPEN_WITH_SESSION", { sessionId: btn.dataset.id });
      window.close();
    });
  });

  // 切换当前标签的 session
  list.querySelectorAll("[data-action='switch']").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      await send("SWITCH_TAB_SESSION", { tabId: currentTab.id, sessionId: btn.dataset.id });
      toast("✅ 切换中，正在刷新...");
      setTimeout(() => window.close(), 700);
    });
  });
}

document.getElementById("manageBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.extension.getURL("src/manage.html") });
  window.close();
});
document.getElementById("newTabBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.extension.getURL("src/manage.html") });
  window.close();
});

function send(type, extra={}) {
  return new Promise(r => chrome.runtime.sendMessage({ type, ...extra }, r));
}
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), 2000);
}
function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

init();
