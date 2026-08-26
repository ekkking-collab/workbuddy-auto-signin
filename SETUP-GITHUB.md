# GitHub Actions 自动签到设置指南（多账户版）

## 前置条件

1. Fork 本仓库到你的 GitHub 账号
2. 在本机登录 WorkBuddy 桌面端（每个账户都需要登录一次）

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

### 2. 提取关键授权信息

从获取的 JSON 中提取以下字段：

| 字段 | 说明 | 必填 |
|------|------|------|
| `account.uid` | 用户 ID | ✅ |
| `auth.accessToken` | 访问令牌 | ✅ |
| `account.enterpriseId` | 企业 ID | ❌ |
| `auth.domain` | 域名 | ❌ |

### 3. 配置多账户

在 GitHub Secrets 中配置 `WORKBUDDY_ACCOUNTS`，格式为 JSON 数组：

```json
[
  {
    "name": "账户1（备注名，方便识别）",
    "uid": "用户ID",
    "accessToken": "访问令牌"
  },
  {
    "name": "账户2",
    "uid": "用户ID",
    "accessToken": "访问令牌",
    "enterpriseId": "企业ID（如有）",
    "domain": "域名（如有）"
  }
]
```

### 4. 配置 GitHub Secrets

1. 打开你 Fork 的仓库页面
2. 进入 `Settings` → `Secrets and variables` → `Actions`
3. 点击 `New repository secret`
4. 填写：
   - **Name**: `WORKBUDDY_ACCOUNTS`
   - **Secret**: 粘贴上一步配置好的 JSON 数组
5. 点击 `Add secret`

### 5. 启用 GitHub Actions

1. 进入仓库的 `Actions` 页面
2. 点击 `I understand my workflows, go ahead and enable them`
3. 工作流会每天北京时间 04:00 自动执行

### 6. 手动测试

在 `Actions` 页面选择 `WorkBuddy 每日签到` 工作流，点击 `Run workflow` 手动触发一次测试。

## 输出示例

```
[INFO] 共 2 个账户待处理
[1/2] 正在处理: 账户1
  → ALREADY: 今日已签过（今日 +100，连续 12 天，累计 1200 积分）
[2/2] 正在处理: 账户2
  → CLAIMED: 成功领取 100 积分（连续 5 天，累计 500 积分）

{
  "total_accounts": 2,
  "results": [
    {
      "account": "账户1",
      "result": "ALREADY",
      "report": "今日已签过（今日 +100，连续 12 天，累计 1200 积分）"
    },
    {
      "account": "账户2",
      "result": "CLAIMED",
      "report": "成功领取 100 积分（连续 5 天，累计 500 积分）"
    }
  ]
}
```

## 注意事项

### 凭据有效期

- `accessToken` 有效期约 60 天
- 如果签到失败并返回 `NO_SESSION`，需要重新登录并更新 Secret

### 多账户安全

- 每个账户之间会自动延迟 1-3 秒，避免请求过快
- 建议仓库设为 **Private**
- 不要在公开场合分享 `WORKBUDDY_ACCOUNTS` 内容

## 常见问题

### Q: 如何添加新账户？

A: 更新 `WORKBUDDY_ACCOUNTS` Secret，添加新的账户配置即可。

### Q: 签到失败，提示 "NO_SESSION"

A: 对应账户的登录态已过期，需要：
1. 在本机重新登录 WorkBuddy 桌面端
2. 获取新的凭据
3. 更新 Secret 中对应账户的 `accessToken`

### Q: 可以修改签到时间吗？

A: 编辑 `.github/workflows/daily-signin.yml` 中的 cron 表达式：
```yaml
schedule:
  - cron: '0 20 * * *'   # UTC 20:00 = 北京时间 04:00
```

## 文件结构

```
workbuddy-auto-signin/
├── .github/
│   └── workflows/
│       └── daily-signin.yml    # GitHub Actions 工作流
├── signin.js                   # Node.js 签到脚本（多账户版）
├── signin.bat                  # Windows 批处理（本地用）
├── SETUP-GITHUB.md             # 本说明文档
└── README.md                   # 项目说明
```

---
