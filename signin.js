#!/usr/bin/env node
/**
 * WorkBuddy 每日签到自动领取脚本 (Node.js 版 - 多账户支持)
 *
 * 支持多账户同时签到，零依赖，纯 Node.js 标准库。
 *
 * 用法：
 *   node signin.js auto     # 每日自动化：签到 + 成长中心
 *   node signin.js growth   # 仅成长中心
 *   node signin.js status   # 仅查签到状态
 *   node signin.js claim    # 仅领取签到
 *   node signin.js all      # 查签到状态 + 领取
 *
 * 环境变量：
 *   WORKBUDDY_ACCOUNTS     - JSON 数组格式的多账户配置（推荐，适用于 GitHub Actions）
 *   WORKBUDDY_SESSION      - 单账户 JSON 会话数据（兼容旧版）
 *   WORKBUDDY_AUTH_FILE    - 指定单个凭据文件路径
 *
 * 多账户配置格式 (WORKBUDDY_ACCOUNTS)：
 *   [
 *     {
 *       "name": "账户1（备注名）",
 *       "uid": "用户ID",
 *       "accessToken": "访问令牌",
 *       "enterpriseId": "企业ID（可选）",
 *       "domain": "域名（可选）"
 *     },
 *     {
 *       "name": "账户2",
 *       "uid": "用户ID",
 *       "accessToken": "访问令牌"
 *     }
 *   ]
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const os = require("os");

const DEFAULT_ENDPOINT = "https://copilot.tencent.com";
const AUTH_BASENAME = path.join(
  "CodeBuddyExtension",
  "Data",
  "Public",
  "auth",
  "workbuddy-desktop.info"
);

// ── 凭据加载 ──────────────────────────────────────────────

/**
 * 从完整会话 JSON 中提取关键授权信息
 */
function extractAuthInfo(session, name) {
  const auth = session.auth || {};
  const account = session.account || {};
  return {
    name: name || account.nickname || account.uid || "未命名账户",
    uid: account.uid,
    accessToken: auth.accessToken,
    enterpriseId: account.enterpriseId || null,
    domain: auth.domain || null,
    endpoint: auth.endpoint || null,
  };
}

/**
 * 加载所有账户配置
 */
function loadAccounts() {
  // 1. 优先从 WORKBUDDY_ACCOUNTS 读取多账户配置
  const accountsEnv = process.env.WORKBUDDY_ACCOUNTS;
  if (accountsEnv) {
    try {
      const accounts = JSON.parse(accountsEnv);
      if (!Array.isArray(accounts)) {
        throw new Error("WORKBUDDY_ACCOUNTS 必须是 JSON 数组");
      }
      return accounts.map((acc, i) => ({
        name: acc.name || `账户${i + 1}`,
        uid: acc.uid,
        accessToken: acc.accessToken,
        enterpriseId: acc.enterpriseId || null,
        domain: acc.domain || null,
        endpoint: acc.endpoint || null,
      }));
    } catch (e) {
      throw new Error(`WORKBUDDY_ACCOUNTS 格式错误: ${e.message}`);
    }
  }

  // 2. 从 WORKBUDDY_SESSION 读取单账户（兼容旧版）
  const sessionEnv = process.env.WORKBUDDY_SESSION;
  if (sessionEnv) {
    try {
      const session = JSON.parse(sessionEnv);
      return [extractAuthInfo(session)];
    } catch (e) {
      throw new Error(`WORKBUDDY_SESSION 格式错误: ${e.message}`);
    }
  }

  // 3. 从本地文件读取
  const override = process.env.WORKBUDDY_AUTH_FILE;
  const authFile = override && fs.existsSync(override)
    ? override
    : findAuthFile();

  if (authFile) {
    const session = JSON.parse(fs.readFileSync(authFile, "utf-8"));
    return [extractAuthInfo(session)];
  }

  return [];
}

function findAuthFile() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");

  const candidates = [
    path.join(local, AUTH_BASENAME),
    path.join(home, "Library", "Application Support", AUTH_BASENAME),
    path.join(home, ".config", AUTH_BASENAME),
    path.join(home, ".workbuddy", "auth", "workbuddy-desktop.info"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ── 请求封装 ──────────────────────────────────────────────

function request(urlStr, headers, method = "GET", payload = null) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers,
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          body = { raw: raw.slice(0, 500) };
        }
        resolve({ status: res.statusCode, body });
      });
    });

    req.on("error", (err) => {
      resolve({ status: 0, body: { error: err.message } });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, body: { error: "timeout" } });
    });

    if (payload !== null) {
      req.write(JSON.stringify(payload));
    }
    req.end();
  });
}

function post(url, headers, payload = null) {
  return request(url, headers, "POST", payload);
}

function get(url, headers) {
  return request(url, headers, "GET");
}

// ── 辅助函数 ──────────────────────────────────────────────

/**
 * 脱敏处理：手机号只显示后2位，姓名只显示第一个字
 */
function maskName(name) {
  if (!name) return "*";
  // 手机号：11位数字，只显示后2位
  if (/^\d{11}$/.test(name)) {
    return "**" + name.slice(-2);
  }
  // 其他：只显示第一个字符
  return name[0];
}

function dig(obj, key) {
  if (!obj || typeof obj !== "object") return null;
  if (key in obj && obj[key] !== null && obj[key] !== undefined) return obj[key];
  for (const k of ["data", "result", "resp", "response"]) {
    if (k in obj && typeof obj[k] === "object") {
      const r = dig(obj[k], key);
      if (r !== null) return r;
    }
  }
  return null;
}

function fmtCredit(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? v : n;
}

function isAlreadyCheckedIn(body) {
  if (body === null || body === undefined) return true;
  if (typeof body === "object") {
    if (body.code === 10001) return true;
    if (body.msg && body.msg.includes("已签")) return true;
  }
  return false;
}

function buildReport(prefix, status) {
  const parts = [];
  const todayCredit = dig(status, "today_credit") || dig(status, "daily_credit");
  const streakDays = dig(status, "streak_days");
  const totalCredits = dig(status, "total_credits");

  if (todayCredit !== null) parts.push(`今日 +${fmtCredit(todayCredit)}`);
  if (streakDays !== null) parts.push(`连续 ${streakDays} 天`);
  if (totalCredits !== null) parts.push(`累计 ${fmtCredit(totalCredits)} 积分`);

  return parts.length ? `${prefix}（${parts.join("，")}）` : prefix;
}

function buildHeaders(account) {
  if (!account.uid || !account.accessToken) {
    throw new Error("缺少 uid 或 accessToken");
  }

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${account.accessToken}`,
    "Content-Type": "application/json",
    "X-User-Id": account.uid,
    "User-Agent": "WorkBuddy",
  };

  if (account.enterpriseId) {
    headers["X-Enterprise-Id"] = account.enterpriseId;
    headers["X-Tenant-Id"] = account.enterpriseId;
  }
  if (account.domain) {
    headers["X-Domain"] = account.domain;
  }

  return headers;
}

function getEndpoint(account) {
  return (
    (account.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, "")
  );
}

// ── 签到逻辑 ──────────────────────────────────────────────

async function runAuto(headers, endpoint) {
  const { status: scode, body: sbody } = await post(
    `${endpoint}/v2/billing/meter/checkin-activity-status`,
    headers
  );

  if (scode === 401 || scode === 403) {
    return { code: 1, result: { result: "NO_SESSION", report: `登录态已失效（HTTP ${scode}）` } };
  }
  if (scode < 200 || scode >= 300) {
    return { code: 1, result: { result: "ERROR", report: `签到接口异常（HTTP ${scode}）` } };
  }

  const status = typeof sbody === "object" ? sbody : {};
  const active = dig(status, "active");
  const activityName = dig(status, "activity_name");

  if (active === false) {
    return { code: 0, result: { result: "INACTIVE", report: `签到活动未开启${activityName ? `（${activityName}）` : ""}` } };
  }

  if (dig(status, "today_checked_in") === true) {
    return { code: 0, result: { result: "ALREADY", report: buildReport("今日已签过", status) } };
  }

  const { status: ccode, body: cbody } = await post(`${endpoint}/v2/billing/meter/daily-checkin`, headers);

  if (isAlreadyCheckedIn(cbody)) {
    const { status: sc2, body: sb2 } = await post(`${endpoint}/v2/billing/meter/checkin-activity-status`, headers);
    const fresh = sc2 >= 200 && sc2 < 300 ? sb2 : status;
    return { code: 0, result: { result: "ALREADY", report: buildReport("今日已签过（服务端判定已领取）", fresh) } };
  }

  if (ccode === 401 || ccode === 403) {
    return { code: 1, result: { result: "NO_SESSION", report: `登录态已失效（HTTP ${ccode}）` } };
  }

  const credit = dig(cbody, "credit");
  if (credit !== null) {
    const { status: sc2, body: sb2 } = await post(`${endpoint}/v2/billing/meter/checkin-activity-status`, headers);
    const fresh = sc2 >= 200 && sc2 < 300 ? sb2 : status;
    const streakDays = dig(fresh, "streak_days") || dig(status, "streak_days");
    const totalCredits = dig(fresh, "total_credits");
    const isStreakDay = dig(fresh, "is_streak_day");
    const bonus = isStreakDay ? "，且为连签奖励日" : "";
    const cum = totalCredits !== null ? `，累计 ${fmtCredit(totalCredits)} 积分` : "";
    return {
      code: 0,
      result: {
        result: "CLAIMED",
        report: `成功领取 ${fmtCredit(credit)} 积分${bonus}（连续 ${streakDays} 天${cum}）`,
        credit, streak_days: streakDays, total_credits: totalCredits,
      },
    };
  }

  const msg = (cbody && cbody.msg) || `HTTP ${ccode}`;
  return { code: 1, result: { result: "ERROR", report: `领取失败：${msg}` } };
}

async function runGrowth(headers, endpoint) {
  const base = `${endpoint}/v2/activity/growth`;
  const parts = [];
  let creditsGained = 0;

  // Buddy 旅行
  const { status: tsc, body: tbd } = await get(`${base}/buddy/travel/status`, headers);
  if (tsc === 401 || tsc === 403) {
    return { code: 1, result: { result: "NO_SESSION", report: "登录态已失效" } };
  }
  let travel = tsc >= 200 && tsc < 300 ? dig(tbd, "state") : null;

  if (travel === "arrived") {
    const { status: cc, body: cb } = await post(`${base}/buddy/travel/claim`, headers, { record_id: dig(tbd, "record_id") });
    if (cc >= 200 && cc < 300 && dig(cb, "reward_credit") !== null) {
      creditsGained += dig(cb, "reward_credit");
      parts.push(`领旅行礼物 +${fmtCredit(dig(cb, "reward_credit"))} 积分`);
    }
    travel = "idle";
  }
  if (travel === "idle") {
    const { status: cc2, body: cb2 } = await get(`${base}/buddy/travel/config`, headers);
    const locs = cc2 >= 200 && cc2 < 300 ? dig(cb2, "locations") : null;
    if (locs && locs[0]) {
      const { status: dc, body: db } = await post(`${base}/buddy/travel/depart`, headers, { location_id: locs[0].id });
      if (dc >= 200 && dc < 300) {
        parts.push(`派 Buddy 去${(dig(db, "location") || {}).name || "?"}`);
      }
    }
  } else if (travel === "traveling") {
    parts.push(`Buddy 旅行中（${(dig(tbd, "location") || {}).name || "?"}）`);
  }

  // 盲盒
  const { status: lc, body: lb } = await get(`${base}/lottery/chances`, headers);
  if (lc >= 200 && lc < 300 && dig(lb, "balance") > 0) {
    const { status: dc, body: db } = await post(`${base}/lottery/draw`, headers, {});
    if (dc >= 200 && dc < 300) parts.push(`开盲盒：${dig(db, "prize_name") || dig(db, "prize") || "未知"}`);
  }

  // 任务
  const { status: tsc2, body: tbd2 } = await get(`${base}/tasks`, headers);
  if (tsc2 >= 200 && tsc2 < 300) {
    for (const t of dig(tbd2, "tasks") || []) {
      const p = t.progress || {};
      if ((p.current || 0) >= (p.target || 1) && t.accept_status !== "claimed" && t.has_reward) {
        const { status: ac } = await post(`${base}/tasks/accept`, headers, { task_code: t.task_code });
        if (ac >= 200 && ac < 300) creditsGained += t.reward_credit || 0;
      }
    }
  }

  // 能量 & 连签
  const { status: ec, body: eb } = await get(`${base}/energy`, headers);
  const energy = ec >= 200 && ec < 300 ? dig(eb, "balance") : null;
  const { status: sc, body: sb } = await get(`${base}/streak`, headers);
  const streakDays = dig(dig(sb, "streak") || {}, "days");

  const tail = [];
  if (energy !== null) tail.push(`能量 ${energy}`);
  if (streakDays !== null) tail.push(`连签 ${streakDays} 天`);
  if (creditsGained) tail.push(`+共 ${creditsGained} 积分`);

  let report = parts.length ? parts.join("；") : "成长中心无可领取项";
  if (tail.length) report += `（${tail.join("，")}）`;

  return { code: 0, result: { result: "GROWTH", report, credits_gained: creditsGained } };
}

// ── 单账户执行 ──────────────────────────────────────────────

async function runForAccount(account, action) {
  let headers;
  try {
    headers = buildHeaders(account);
  } catch (e) {
    return { code: 1, account: account.name, result: { result: "NO_SESSION", report: e.message } };
  }

  const endpoint = getEndpoint(account);

  if (action === "auto") {
    const { code, result } = await runAuto(headers, endpoint);
    const { code: gcode, result: gout } = await runGrowth(headers, endpoint);
    result.growth = gout.report;
    if (gout.credits_gained) result.report += "；" + gout.report;
    return { code, account: account.name, result };
  }
  if (action === "growth") {
    const { code, result } = await runGrowth(headers, endpoint);
    return { code, account: account.name, result };
  }
  if (action === "status" || action === "all") {
    const { status: sc, body: sb } = await post(`${endpoint}/v2/billing/meter/checkin-activity-status`, headers);
    return { code: 0, account: account.name, result: { step: "status", http: sc, body: sb } };
  }
  if (action === "claim") {
    const { status: cc, body: cb } = await post(`${endpoint}/v2/billing/meter/daily-checkin`, headers);
    return { code: 0, account: account.name, result: { step: "claim", http: cc, body: cb } };
  }
  return { code: 0, account: account.name, result: { result: "UNKNOWN", report: `未知操作: ${action}` } };
}

// ── 主入口 ──────────────────────────────────────────────

async function main() {
  const action = process.argv[2] || "auto";

  let accounts;
  try {
    accounts = loadAccounts();
  } catch (e) {
    console.log(JSON.stringify({ result: "ERROR", report: e.message }));
    process.exit(1);
  }

  if (accounts.length === 0) {
    console.log(JSON.stringify({
      result: "NO_AUTH",
      report: "未找到任何账户配置。请设置环境变量 WORKBUDDY_ACCOUNTS 或 WORKBUDDY_SESSION。",
    }));
    process.exit(2);
  }

  console.error(`[INFO] 共 ${accounts.length} 个账户待处理`);

  const results = [];
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    const maskedName = maskName(acc.name);
    console.error(`[${i + 1}/${accounts.length}] 正在处理: ${maskedName}`);

    const { code, account, result } = await runForAccount(acc, action);
    results.push({ account: maskedName, ...result });

    console.error(`  → ${result.result}: ${result.report || ""}`);

    // 账户间随机延迟 1-3 秒，避免请求过快
    if (i < accounts.length - 1) {
      const delay = 1000 + Math.random() * 2000;
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // 输出汇总
  const summary = {
    total_accounts: accounts.length,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));

  // 任一账户失败则退出码 1
  const hasError = results.some(r => r.result === "NO_SESSION" || r.result === "ERROR");
  process.exit(hasError ? 1 : 0);
}

main().catch((err) => {
  console.error(JSON.stringify({ result: "ERROR", report: err.message }));
  process.exit(1);
});
