<div align="center">

# 🤖 workbuddy-auto-signin

**自动领取 WorkBuddy 每日签到积分的小脚本（多账户支持）**

零依赖 · 纯标准库 · 跨平台 · 幂等安全

</div>

> 一个自包含的 Node.js 脚本，每天自动帮你领取 **WorkBuddy**（腾讯 AI 编程助手）的每日签到积分。支持多账户同时签到，零内置密钥，可安全分享。

---

## ✨ 特性

| | |
|:---:|---|
| 🧩 | **零依赖** — 纯 Node.js 标准库，任意 Node.js 14+ 即可 |
| 📦 | **单文件** — 完全自包含 |
| 🔁 | **幂等安全** — 先查状态，未签才领；重复运行不会多领 |
| 👥 | **多账户** — 支持同时签到多个 WorkBuddy 账户 |
| 🐱 | **成长中心** — 自动领 Buddy 旅行礼物、派 Buddy 出发、开盲盒、领任务奖励 |
| 🧠 | **智能汇报** — 一行 JSON，汇总所有账户签到结果 |
| 🛡️ | **健壮** — 兼容"已签"两种返回形态、识别 401/403 登录态过期 |
| 🌐 | **跨平台** — Windows / macOS / Linux |
| ⏰ | **GitHub Actions** — 每天自动签到，无需本机在线 |

---

## 🚀 快速开始

### 本地运行

```bash
# 克隆仓库
# 执行签到（自动读取本地登录凭据）
node signin.js auto
```

### 多账户配置

```bash
# 设置多账户环境变量
export WORKBUDDY_ACCOUNTS='[
  {"name":"账户1","uid":"xxx","accessToken":"xxx"},
  {"name":"账户2","uid":"yyy","accessToken":"yyy"}
]'

# 执行签到
node signin.js auto
```

---

## 📋 用法

```bash
node signin.js auto     # 每日自动化：签到 + 成长中心
node signin.js growth   # 仅成长中心（不签到）
node signin.js status   # 仅查签到状态（调试）
node signin.js claim    # 仅领取签到（调试，幂等）
node signin.js all      # 查签到状态 + 领取
```

---

## ⚙️ 环境变量

| 环境变量 | 说明 | 格式 |
|---|---|---|
| `WORKBUDDY_ACCOUNTS` | 多账户配置（推荐） | JSON 数组 |
| `WORKBUDDY_SESSION` | 单账户会话（兼容旧版） | JSON 对象 |
| `WORKBUDDY_AUTH_FILE` | 指定凭据文件路径 | 文件路径 |

### 多账户配置格式

```json
[
  {
    "name": "账户备注名",
    "uid": "用户ID",
    "accessToken": "访问令牌",
    "enterpriseId": "企业ID（可选）",
    "domain": "域名（可选）"
  }
]
```

---

## ⏰ GitHub Actions 自动签到

详见 [SETUP-GITHUB.md](SETUP-GITHUB.md)

1. Fork 本仓库
2. 配置 Secret `WORKBUDDY_ACCOUNTS`
3. 启用 Actions

每天北京时间 **04:00** 自动执行。

---

## 📁 文件结构

```
workbuddy-auto-signin/
├── .github/workflows/
│   └── daily-signin.yml    # GitHub Actions 工作流
├── signin.js               # Node.js 签到脚本（多账户版）
├── signin.bat              # Windows 批处理
├── SETUP-GITHUB.md         # GitHub Actions 设置指南
└── README.md               # 本文件
```

---

## 🔧 排错

| 现象 | 处理 |
|---|---|
| `NO_AUTH` | 设置环境变量或登录 WorkBuddy 桌面端 |
| `NO_SESSION` | 登录态过期，重新登录桌面端 |
| `INACTIVE` | 签到活动未开启，属正常 |

---

## ⚠️ 免责声明

> [!WARNING]
> 本项目为**非官方**工具，与腾讯或 WorkBuddy 无任何隶属关系。签到接口系从桌面端 `app.asar` 逆向得到。使用风险自负；接口可能随时变动且不另行通知。请遵守相关服务条款。

---

## 📄 协议

MIT
