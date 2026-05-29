// SessionFox - 新标签页 v5.4
//
// 关于"跳到浏览器默认新标签"的说明：
//   我们的扩展覆盖了新标签页（chrome_url_overrides.newtab）。
//   选完 session 后无法跳回"浏览器原生新标签"，因为那就是我们自己。
//   最佳体验：选完后绑定 session，停在当前页显示"已就绪"提示，
//   用户直接在浏览器地址栏输入网址即可（地址栏始终可用）。

const WEEK  = ["周日","周一","周二","周三","周四","周五","周六"];
const MONTH = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const VISIBLE_MAX = 8;

function tick() {
  const n = new Date();
  document.getElementById("clock").textContent =
    `${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`;
  document.getElementById("date").textContent =
    `${n.getFullYear()}年${MONTH[n.getMonth()]} ${n.getDate()}日  ${WEEK[n.getDay()]}`;
}
tick(); setInterval(tick, 1000);

async function load() {
  let sessions = [];
  try { sessions = await msg("GET_SESSIONS") || []; } catch(_){}

  const counts = {};
  await Promise.all(sessions.map(async s => {
    try {
      const r = await msg("GET_SESSION_COOKIES", { sessionId: s.id });
      counts[s.id] = r?.count || 0;
    } catch(_) { counts[s.id] = 0; }
  }));

  const sorted = [...sessions].sort((a,b) => (counts[b.id]||0) - (counts[a.id]||0));
  const all = [...sorted, null];
  const needFold = all.length > VISIBLE_MAX + 1;

  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  all.forEach((s, i) => {
    const card = s ? makeCard(s, counts[s.id]) : makeDefaultCard();
    if (needFold && i >= VISIBLE_MAX) card.classList.add("extra");
    grid.appendChild(card);
  });

  const btn = document.getElementById("showMore");
  if (needFold) {
    const hidden = all.length - VISIBLE_MAX;
    btn.style.display = "block";
    btn.textContent = `显示全部（还有 ${hidden} 个）▾`;
    btn.onclick = () => {
      const opening = btn.textContent.includes("▾");
      document.querySelectorAll(".extra").forEach(el => el.classList.toggle("open", opening));
      btn.textContent = opening ? "收起 ▴" : `显示全部（还有 ${hidden} 个）▾`;
    };
  }
}

function makeCard(s, count) {
  const card = document.createElement("div");
  card.className = "card";
  card.style.setProperty("--c", s.color);
  card.innerHTML = `
    <div class="card-top">
      <span class="dot" style="background:${s.color}"></span>
      <span class="card-name">${esc(s.name)}</span>
    </div>
    <div class="card-sub">${count > 0 ? `${count} 个已保存` : "空"}</div>
  `;
  card.addEventListener("click", () => pick(s, card));
  return card;
}

function makeDefaultCard() {
  const card = document.createElement("div");
  card.className = "card default-card";
  card.innerHTML = `
    <div class="card-top">
      <span class="dot" style="background:#ccc"></span>
      <span class="card-name">默认浏览器</span>
    </div>
    <div class="card-sub">当前 Cookie</div>
  `;
  card.addEventListener("click", () => pick(null, card));
  return card;
}

async function pick(session, cardEl) {
  document.querySelectorAll(".card").forEach(c => c.classList.remove("selected"));
  cardEl.classList.add("selected");

  try {
    const tabs = await new Promise(r => chrome.tabs.query({ active:true, currentWindow:true }, r));
    const tabId = tabs[0]?.id;

    if (session && tabId) {
      await msg("BIND_TAB_SESSION", { tabId, sessionId: session.id });
    }
  } catch(_) {}

  // 显示"已就绪"提示，用户直接在地址栏输入网址
  showReady(session);
}

function showReady(session) {
  const hint = document.getElementById("readyHint");
  const dot  = document.getElementById("readyDot");
  const name = document.getElementById("readyName");

  if (session) {
    dot.style.background = session.color;
    name.textContent = session.name;
  } else {
    dot.style.background = "#ccc";
    name.textContent = "默认浏览器";
  }

  hint.classList.add("visible");

  // 让 Ctrl+L / F6 聚焦地址栏的提示
  // 直接用 window.focus() 确保浏览器地址栏可用
  window.focus();
}

document.getElementById("manageBtn").addEventListener("click", () => {
  window.location.href = chrome.extension.getURL("src/manage.html");
});

document.getElementById("skipBtn").addEventListener("click", () => {
  showReady(null);
});

function msg(type, extra={}) {
  return new Promise((res,rej) => {
    try {
      chrome.runtime.sendMessage({ type, ...extra }, r => {
        chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(r);
      });
    } catch(e) { rej(e); }
  });
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

load();
