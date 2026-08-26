# GitHub Actions 自动签到设置指南

## 前置条件

1. Fork 本仓库到你的 GitHub 账号
2. 在本机登录 WorkBuddy 桌面端（确保凭据文件有效）

## 设置步骤

### 1. 获取登录凭据

在本机打开终端，执行以下命令获取凭据 JSON：

**Windows (PowerShell):**
```powershell
Get-Content "$env:LOCALAPPDATA\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info" -Raw
```

**macOS/Linux:**
```bash
cat ~/Library/Application\ Support/CodeBuddyExtension/Data/Public/auth/workbuddy-desktop.info
# 或
cat ~/.config/CodeBuddyExtension/Data/Public/auth/workbuddy-desktop.info
```

### 2. 配置 GitHub Secrets

1. 打开你 Fork 的仓库页面
2. 进入 `Settings` → `Secrets and variables` → `Actions`
3. 点击 `New repository secret`
4. 填写：
   - **Name**: `WORKBUDDY_SESSION`
   - **Secret**: 粘贴上一步获取的完整 JSON 内容
5. 点击 `Add secret`

### 3. 启用 GitHub Actions

1. 进入仓库的 `Actions` 页面
2. 点击 `I understand my workflows, go ahead and enable them`
3. 工作流会每天北京时间 00:05 自动执行

### 4. 手动测试

在 `Actions` 页面选择 `WorkBuddy 每日签到` 工作流，点击 `Run workflow` 手动触发一次测试。

## 注意事项

### 凭据有效期

- `accessToken` 有效期约 60 天
- `refreshToken` 有效期约 90 天
- 如果签到失败并返回 `NO_SESSION`，需要重新登录 WorkBuddy 桌面端并更新 Secret

### 安全提示

- 凭据 Secret 不会被打印或泄露
- GitHub Actions 日志中会隐藏 Secret 值
- 建议定期检查签到状态

## 常见问题

### Q: 签到失败，提示 "NO_SESSION"

A: 登录态已过期，需要：
1. 在本机重新登录 WorkBuddy 桌面端
2. 获取新的凭据 JSON
3. 更新 GitHub Secret `WORKBUDDY_SESSION`

### Q: 如何查看签到日志？

A: 在仓库的 `Actions` 页面，点击最近的运行记录，查看 `执行签到` 步骤的输出。

### Q: 可以修改签到时间吗？

A: 可以编辑 `.github/workflows/daily-signin.yml` 中的 cron 表达式：
```yaml
schedule:
  - cron: '5 16 * * *'   # UTC 16:05 = 北京时间 00:05
```

## 文件结构

```
workbuddy-auto-signin/
├── .github/
│   └── workflows/
│       └── daily-signin.yml    # GitHub Actions 工作流
├── signin.js                   # Node.js 签到脚本
├── signin.bat                  # Windows 批处理（本地用）
├── signin.py                   # Python 原版脚本
├── SETUP-GITHUB.md             # 本说明文档
├── DISCLAIMER.md               # 免责声明
└── README.md                   # 项目说明
```

---

> ⚠️ **使用前请阅读 [免责声明](DISCLAIMER.md)**
