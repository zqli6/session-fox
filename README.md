# 🦊 SessionFox

> 在 Edge / Chrome 中快速切换多账号 Session，支持 claude.ai、ChatGPT、Gemini 等强安全站点。

![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/manifest-v2-blue)
![Platform](https://img.shields.io/badge/platform-Edge%20%7C%20Chrome-orange)
![Version](https://img.shields.io/badge/version-5.0-informational)

---

## ⚠️ 重要说明：两种隔离模式的区别

### A：切换使用（本项目采用）✅

同一时刻浏览器内只有一个账号的 Cookie，切换账号时：

1. 备份当前账号的 Cookie 到 Session 快照
2. 清空浏览器真实 Cookie
3. 写入目标账号的 Cookie 快照
4. 刷新页面

**优点：** 完全兼容 Cloudflare、HttpOnly、Secure、SameSite 等强安全 Cookie，支持 claude.ai、ChatGPT、Gemini 等主流 AI 网站。

**缺点：** 无法真正同时并行——切换到账号 B 后，账号 A 的标签页会失去登录状态，需要再次切换回来才能使用。

### B：真正同时并行（本项目不支持）❌

同一窗口内不同标签页同时保持不同账号的登录状态，互不干扰。

**Chrome/Edge 架构限制：** 这需要底层 Cookie Store 隔离 API，Chrome/Edge 未对扩展开放，任何 Chrome/Edge 扩展都无法实现。

**唯一可行方案：** Firefox + [Multi-Account Containers](https://addons.mozilla.org/firefox/addon/multi-account-containers/)（Mozilla 官方扩展，原生支持 Cookie Store 隔离）。

---

## 功能

- **新标签页 Session 选择器**：打开新标签时选择账号，有 Cookie 的账号排在前面
- **右键菜单快速切换**：在任意页面右键 → 选 Session
- **Cookie 自动备份**：页面加载完成后自动备份最新 Cookie，保持登录状态持久化
- **存储使用量监控**：管理页实时显示每个 Session 的 Cookie 占用
- **最多 20 个 Session**：支持同时管理 20 个账号
- **超出折叠显示**：Session 超过 8 个自动折叠，保持界面整洁

---

## 安装

> 目前仅支持开发者模式加载，尚未上架扩展商店。

**1. 下载源码**

```bash
git clone https://github.com/zqli6/session-fox.git
```

或在 GitHub 页面点击 `Code → Download ZIP` 解压。

**2. 打开扩展管理页**

Edge：地址栏输入 `edge://extensions/`
Chrome：地址栏输入 `chrome://extensions/`

**3. 开启开发者模式**

页面左下角（Edge）或右上角（Chrome）打开「开发人员模式」开关。

**4. 加载扩展**

点击「加载解压缩的扩展」→ 选择项目文件夹（含 `manifest.json` 的那个）→ 确定。

工具栏出现 LZQ 图标即安装成功。

---

## 使用方法

### 第一次登录账号

1. 打开新标签 → 选择「账号 1」→ 访问目标网站登录
2. 登录完成后 Cookie 自动备份到「账号 1」的 Session

### 切换账号

**方式一：** 点击工具栏图标 → 点击目标 Session 旁的「切换」按钮

**方式二：** 在任意页面右键 → 🦊 用 Session 打开新标签 → 选择账号

### 管理 Session

点击工具栏图标 → 右上角齿轮 → 管理页面：改名、改颜色、清除 Cookie、查看存储占用。

---

## 文件结构

```
session-fox/
├── manifest.json          # 扩展配置（Manifest V2）
├── icons/                 # 扩展图标（LZQ 边框简约风格）
├── src/
│   ├── background.js      # 核心：chrome.cookies 备份/恢复
│   ├── content.js         # 页面注入：Session 徽章显示
│   ├── popup.html/js      # 工具栏弹窗
│   ├── newtab.html/js     # 新标签页 Session 选择器
│   └── manage.html/js     # Session 管理页
├── LICENSE
└── README.md
```

---

## 注意事项

- 使用 **Manifest V2**（V3 移除了部分必要 API）
- Cookie 数据存储在 `chrome.storage.local`，上限 5MB
- **切换 Session 会刷新当前页面**（Cookie 交换机制决定）
- Cloudflare 的 `cf_clearance` 等浏览器指纹绑定的 Cookie 在新设备/新 IP 下需要重新验证，这是 Cloudflare 的安全机制，非扩展 bug

---

## License

[MIT](LICENSE) © 2026 zqli6
