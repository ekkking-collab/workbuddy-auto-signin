# ⚠️ 免责声明

> [!WARNING]
> 本项目为**非官方**工具，与腾讯或 WorkBuddy 无任何隶属关系。

## 接口来源

签到接口系从 WorkBuddy 桌面端 `app.asar` 逆向得到，仅供个人自动化使用。

## 风险提示

- 使用风险自负
- 接口可能随时变动且不另行通知
- 因接口变动导致的任何问题，本项目不承担任何责任
- 请遵守腾讯及 WorkBuddy 相关服务条款

## GitHub Actions 使用说明

若使用 GitHub Actions 自动化功能：

- 凭据（`WORKBUDDY_SESSION`）存储在你的 GitHub 仓库 Secrets 中
- GitHub 不会泄露 Secret 值，但请确保你的仓库为 **Private** 或你理解公开仓库的风险
- 定期检查签到状态，如发现异常请立即禁用工作流并更新凭据

## 安全建议

- 不要将 `workbuddy-desktop.info` 文件提交到公开仓库
- 定期更新登录凭据
- 如不再使用，请及时删除 GitHub Secret 和 Fork 仓库

---

**使用本项目即表示你已阅读并理解上述免责声明。**
