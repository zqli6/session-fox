// ============================================================
// SessionFox - Content Script
// 在每个标签页左下角显示当前 Session 标识徽章
// ============================================================

(async function () {
  // 等待页面 body 可用
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  async function init() {
    // 询问 background 当前标签属于哪个 session
    let session = null;
    try {
      session = await chrome.runtime.sendMessage({ type: "GET_TAB_SESSION" });
    } catch (e) {
      return; // 扩展还未就绪，忽略
    }

    if (!session) return;

    // 创建徽章元素
    const badge = document.createElement("div");
    badge.id = "sessionfox-badge";
    badge.innerHTML = `
      <span class="sf-dot" style="background:${session.color}"></span>
      <span class="sf-label">${session.name}</span>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #sessionfox-badge {
        position: fixed;
        bottom: 12px;
        left: 12px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px 5px 7px;
        background: rgba(15, 15, 20, 0.85);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 20px;
        backdrop-filter: blur(8px);
        font-family: -apple-system, 'Segoe UI', sans-serif;
        font-size: 12px;
        font-weight: 500;
        color: #fff;
        pointer-events: none;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 0.3s, transform 0.3s;
        box-shadow: 0 2px 12px rgba(0,0,0,0.3);
      }
      #sessionfox-badge.visible {
        opacity: 1;
        transform: translateY(0);
      }
      .sf-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
        display: inline-block;
      }
      .sf-label {
        white-space: nowrap;
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(badge);

    // 淡入显示，3 秒后淡出
    requestAnimationFrame(() => {
      badge.classList.add("visible");
      setTimeout(() => {
        badge.classList.remove("visible");
      }, 3000);
    });
  }
})();
