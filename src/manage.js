// ============================================================
// SessionFox v3 - 管理页面脚本
// ============================================================

const COLORS = [
  "#FF6B6B","#FF9FF3","#FECA57","#FF9F43",
  "#4ECDC4","#45B7D1","#54A0FF","#5F27CD","#2ED573","#96CEB4"
];
const MAX_SESSIONS = 20;
const STORAGE_MAX = 5 * 1024 * 1024; // 5MB

let sessions = [];
let sessionSizes = {}; // { sessionId -> { bytes, cookieCount, domainCount } }

// ── 初始化 ──
async function init() {
  sessions = await send("GET_SESSIONS") || [];
  await Promise.all([
    renderCards(),
    updateStorageOverview(),
    renderActiveTabs(),
  ]);
}

// ── 存储概览 ──
async function updateStorageOverview() {
  // 获取 storage 实际占用
  const bytesUsed = await new Promise(r =>
    chrome.storage.local.getBytesInUse(null, r)
  );

  const pct = Math.min(100, (bytesUsed / STORAGE_MAX) * 100);
  const fill = document.getElementById("progressFill");
  fill.style.width = pct.toFixed(1) + "%";
  fill.className = "progress-fill" + (pct > 80 ? " danger" : pct > 60 ? " warn" : "");

  document.getElementById("storageUsed").textContent = formatBytes(bytesUsed);

  // 统计各 session 占用（通过 JSON 序列化估算）
  const data = await new Promise(r => chrome.storage.local.get(["sessionCookies","tabSessionMap"], r));
  const allCookies = data.sessionCookies || {};
  const tabMap = data.tabSessionMap || {};

  // 计算每个 session 的 cookie 数 & 大小
  sessionSizes = {};
  let totalCookies = 0;
  for (const s of sessions) {
    const store = allCookies[s.id] || {};
    let cookieCount = 0, domainCount = 0;
    for (const [, cookies] of Object.entries(store)) {
      cookieCount += Object.keys(cookies).length;
      domainCount++;
    }
    const bytes = new TextEncoder().encode(JSON.stringify(store)).length;
    sessionSizes[s.id] = { bytes, cookieCount, domainCount };
    totalCookies += cookieCount;
  }

  // 活跃标签数
  const activeCount = Object.keys(tabMap).length;

  document.getElementById("statCookies").textContent = `共 ${totalCookies} 个`;
  document.getElementById("statTabs").textContent = `${activeCount} 个`;
  document.getElementById("statSessions").textContent = `${sessions.length} / ${MAX_SESSIONS}`;
}

function formatBytes(b) {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / 1024 / 1024).toFixed(2) + " MB";
}

// ── 渲染 Session 卡片 ──
async function renderCards() {
  const container = document.getElementById("cards");
  container.innerHTML = sessions.map((s, i) => {
    const sz = sessionSizes[s.id];
    const hasData = sz && sz.cookieCount > 0;
    return `
    <div class="card" data-i="${i}">
      <div class="color-wrap">
        <div class="color-circle" style="background:${s.color}"></div>
        <input type="color" class="color-inp" value="${s.color}" data-i="${i}">
      </div>
      <input type="text" class="name-inp" value="${esc(s.name)}" maxlength="20" data-i="${i}" placeholder="Session 名称">
      <div class="size-badge">
        <span class="size-num">${sz ? formatBytes(sz.bytes) : "0 B"}</span>
        <span class="size-cookies">${hasData ? `${sz.cookieCount} cookies · ${sz.domainCount} 站` : "空"}</span>
      </div>
      <div class="card-btns">
        <button class="cbtn open"  data-action="open"  data-i="${i}">打开</button>
        <button class="cbtn clear" data-action="clear" data-i="${i}">清除</button>
        <button class="cbtn del"   data-action="del"   data-i="${i}">删除</button>
      </div>
    </div>
  `}).join("");

  // 颜色
  container.querySelectorAll(".color-inp").forEach(inp => {
    inp.addEventListener("input", e => {
      const i = +e.target.dataset.i;
      sessions[i].color = e.target.value;
      e.target.previousElementSibling.style.background = e.target.value;
    });
  });

  // 名称
  container.querySelectorAll(".name-inp").forEach(inp => {
    inp.addEventListener("input", e => {
      sessions[+e.target.dataset.i].name = e.target.value;
    });
  });

  // 打开
  container.querySelectorAll("[data-action='open']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const s = sessions[+btn.dataset.i];
      await send("OPEN_WITH_SESSION", { sessionId: s.id });
      toast(`✅ 已用「${s.name}」打开新标签`);
    });
  });

  // 清除 Cookie
  container.querySelectorAll("[data-action='clear']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const s = sessions[+btn.dataset.i];
      const sz = sessionSizes[s.id];
      if (!sz || sz.cookieCount === 0) { toast("该 Session 本来就是空的"); return; }
      if (!confirm(`清除「${s.name}」的所有 Cookie（${sz.cookieCount} 个）？\n下次使用该 Session 需要重新登录。`)) return;
      await send("CLEAR_SESSION_COOKIES", { sessionId: s.id });
      toast(`🗑️ 已清除「${s.name}」的 Cookie`);
      await Promise.all([renderCards(), updateStorageOverview()]);
    });
  });

  // 删除
  container.querySelectorAll("[data-action='del']").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (sessions.length <= 1) { toast("⚠️ 至少保留 1 个 Session"); return; }
      const s = sessions[+btn.dataset.i];
      if (!confirm(`删除「${s.name}」？该 Session 的所有 Cookie 也会一并删除。`)) return;
      await send("CLEAR_SESSION_COOKIES", { sessionId: s.id });
      sessions.splice(+btn.dataset.i, 1);
      await Promise.all([renderCards(), updateStorageOverview()]);
      toast("🗑️ 已删除");
    });
  });

  // 更新添加按钮状态
  const addBtn = document.getElementById("addBtn");
  addBtn.disabled = sessions.length >= MAX_SESSIONS;
  addBtn.textContent = sessions.length >= MAX_SESSIONS
    ? `已达上限（${MAX_SESSIONS} 个）`
    : "＋ 添加新 Session";
}

// ── 活跃标签列表 ──
async function renderActiveTabs() {
  const tabList = document.getElementById("tabList");
  const activeCount = document.getElementById("activeCount");

  const [tabMap, allTabs] = await Promise.all([
    new Promise(r => chrome.storage.local.get("tabSessionMap", d => r(d.tabSessionMap || {}))),
    new Promise(r => chrome.tabs.query({}, r)),
  ]);

  const bound = allTabs.filter(t => tabMap[String(t.id)] || tabMap[t.id]);

  activeCount.textContent = bound.length > 0 ? `（${bound.length} 个）` : "";

  if (bound.length === 0) {
    tabList.innerHTML = `<div class="no-tabs">暂无绑定 Session 的活跃标签</div>`;
    return;
  }

  tabList.innerHTML = bound.map(tab => {
    const sessionId = tabMap[String(tab.id)] || tabMap[tab.id];
    const session = sessions.find(s => s.id === sessionId);
    const url = tab.url || "";
    let displayUrl = url;
    try { displayUrl = new URL(url).hostname || url; } catch(e) {}

    return `
      <div class="tab-item">
        <span class="tab-dot" style="background:${session?.color || "#888"}"></span>
        <span class="tab-session">${esc(session?.name || "未知")}</span>
        <span class="tab-url" title="${esc(url)}">${esc(displayUrl)}</span>
      </div>
    `;
  }).join("");
}

// ── 添加 Session ──
document.getElementById("addBtn").addEventListener("click", async () => {
  if (sessions.length >= MAX_SESSIONS) { toast(`⚠️ 最多 ${MAX_SESSIONS} 个 Session`); return; }
  sessions.push({
    id: `s${Date.now()}`,
    name: `账号 ${sessions.length + 1}`,
    color: COLORS[sessions.length % COLORS.length],
  });
  await renderCards();
  document.getElementById("cards").lastElementChild?.scrollIntoView({ behavior: "smooth" });
});

// ── 保存 ──
document.getElementById("saveBtn").addEventListener("click", async () => {
  for (const s of sessions) {
    if (!s.name.trim()) { toast("⚠️ Session 名称不能为空"); return; }
  }
  await send("SAVE_SESSIONS", { sessions });
  await updateStorageOverview();
  toast("✅ 保存成功，右键菜单已更新");
});

// ── 取消 ──
document.getElementById("cancelBtn").addEventListener("click", () => {
  if (confirm("放弃未保存的更改？")) init();
});

// ── 工具 ──
function send(type, extra = {}) {
  return new Promise(r => chrome.runtime.sendMessage({ type, ...extra }, r));
}
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), 2500);
}
function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

init();
