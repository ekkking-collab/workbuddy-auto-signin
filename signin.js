#!/usr/bin/env node
/**
 * WorkBuddy 每日签到自动领取脚本 (Node.js 版)
 *
 * 读取本机 WorkBuddy 桌面端的登录会话，调用签到接口自动领取每日积分。
 * 零依赖，纯 Node.js 标准库。
 *
 * 用法：
 *   node signin.js auto     # 每日自动化：签到 + 成长中心
 *   node signin.js growth   # 仅成长中心
 *   node signin.js status   # 仅查签到状态
 *   node signin.js claim    # 仅领取签到
 *   node signin.js all      # 查签到状态 + 领取
 *
 * 环境变量：
 *   WORKBUDDY_AUTH_FILE  - 指定凭据文件路径
 *   WORKBUDDY_SESSION    - 直接传入 JSON 格式的会话数据（适用于 GitHub Actions）
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

// ── 凭据探测 ──────────────────────────────────────────────

function loadSession() {
  // 优先从环境变量 WORKBUDDY_SESSION 读取（适用于 GitHub Actions）
  const sessionEnv = process.env.WORKBUDDY_SESSION;
  if (sessionEnv) {
    try {
      return JSON.parse(sessionEnv);
    } catch (e) {
      throw new Error(`WORKBUDDY_SESSION 格式错误: ${e.message}`);
    }
  }

  // 否则从文件读取
  const override = process.env.WORKBUDDY_AUTH_FILE;
  const authFile = override && fs.existsSync(override)
    ? override
    : findAuthFile();

  if (!authFile) {
    return null;
  }
  return JSON.parse(fs.readFileSync(authFile, "utf-8"));
}

function findAuthFile() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");

  const candidates = [
    path.join(local, AUTH_BASENAME),                                  // Windows
    path.join(home, "Library", "Application Support", AUTH_BASENAME), // macOS
    path.join(home, ".config", AUTH_BASENAME),                        // Linux
    path.join(home, ".workbuddy", "auth", "workbuddy-desktop.info"), // 兜底
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

// ── 构建请求头 ──────────────────────────────────────────────

function buildHeaders(session) {
  const auth = session.auth || {};
  const account = session.account || {};
  const token = auth.accessToken;
  const uid = account.uid;

  if (!token || !uid) {
    throw new Error("NO_SESSION: 本地未找到有效登录会话");
  }

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-User-Id": uid,
    "User-Agent": "WorkBuddy",
  };

  if (account.enterpriseId) {
    headers["X-Enterprise-Id"] = account.enterpriseId;
    headers["X-Tenant-Id"] = account.enterpriseId;
  }
  if (auth.domain) {
    headers["X-Domain"] = auth.domain;
  }

  return headers;
}

// ── 签到主逻辑 ──────────────────────────────────────────────

async function runAuto(headers, endpoint) {
  // 1. 查签到状态
  const { status: scode, body: sbody } = await post(
    `${endpoint}/v2/billing/meter/checkin-activity-status`,
    headers
  );

  if (scode === 401 || scode === 403) {
    return {
      code: 1,
      result: {
        result: "NO_SESSION",
        report: `登录态已失效（HTTP ${scode}），请重新登录 WorkBuddy 桌面端`,
        http: scode,
      },
    };
  }

  if (scode < 200 || scode >= 300) {
    return {
      code: 1,
      result: {
        result: "ERROR",
        report: `签到接口返回异常（HTTP ${scode}），可能登录态失效`,
        http: scode,
        status_body: sbody,
      },
    };
  }

  const status = typeof sbody === "object" ? sbody : {};
  const active = dig(status, "active");
  const activityName = dig(status, "activity_name");

  if (active === false) {
    return {
      code: 0,
      result: {
        result: "INACTIVE",
        report: `签到活动未开启${activityName ? `（${activityName}）` : ""}`,
        active: false,
      },
    };
  }

  if (dig(status, "today_checked_in") === true) {
    return {
      code: 0,
      result: {
        result: "ALREADY",
        report: buildReport("今日已签过", status),
        ...status,
      },
    };
  }

  // 2. 领取签到
  const { status: ccode, body: cbody } = await post(
    `${endpoint}/v2/billing/meter/daily-checkin`,
    headers
  );

  if (isAlreadyCheckedIn(cbody)) {
    const { status: scode2, body: sbody2 } = await post(
      `${endpoint}/v2/billing/meter/checkin-activity-status`,
      headers
    );
    const fresh =
      scode2 >= 200 && scode2 < 300 && typeof sbody2 === "object"
        ? sbody2
        : status;
    return {
      code: 0,
      result: {
        result: "ALREADY",
        report: buildReport("今日已签过（服务端判定已领取）", fresh),
        ...fresh,
      },
    };
  }

  if (ccode === 401 || ccode === 403) {
    return {
      code: 1,
      result: {
        result: "NO_SESSION",
        report: `登录态已失效（HTTP ${ccode}），请重新登录 WorkBuddy 桌面端`,
        http: ccode,
      },
    };
  }

  const credit = dig(cbody, "credit");
  if (credit !== null) {
    const { status: scode2, body: sbody2 } = await post(
      `${endpoint}/v2/billing/meter/checkin-activity-status`,
      headers
    );
    const fresh =
      scode2 >= 200 && scode2 < 300 && typeof sbody2 === "object"
        ? sbody2
        : status;
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
        credit,
        streak_days: streakDays,
        total_credits: totalCredits,
        is_streak_day: isStreakDay,
        next_streak_day: dig(fresh, "next_streak_day"),
      },
    };
  }

  if (typeof cbody === "object" && (cbody.code || cbody.msg)) {
    const msg = cbody.msg || `code ${cbody.code}`;
    return {
      code: 1,
      result: {
        result: "ERROR",
        report: `领取失败：${msg}（HTTP ${ccode}）`,
        http: ccode,
        claim_body: cbody,
      },
    };
  }

  return {
    code: 1,
    result: {
      result: "UNKNOWN",
      report: `未识别的领取返回：${JSON.stringify(cbody).slice(0, 200)}`,
      http: ccode,
      claim_body: cbody,
    },
  };
}

// ── 成长中心 ──────────────────────────────────────────────

async function runGrowth(headers, endpoint) {
  const base = `${endpoint}/v2/activity/growth`;
  const parts = [];
  let creditsGained = 0;

  // 1. Buddy 旅行
  const { status: tsc, body: tbd } = await get(
    `${base}/buddy/travel/status`,
    headers
  );
  let travel =
    tsc >= 200 && tsc < 300 ? dig(tbd, "state") : null;

  if (tsc === 401 || tsc === 403) {
    return {
      code: 1,
      result: {
        result: "NO_SESSION",
        report: "登录态已失效，请重新登录 WorkBuddy 桌面端",
      },
    };
  }

  if (travel === "arrived") {
    const recordId = dig(tbd, "record_id");
    const { status: cc, body: cb } = await post(
      `${base}/buddy/travel/claim`,
      headers,
      { record_id: recordId }
    );
    if (cc >= 200 && cc < 300 && dig(cb, "reward_credit") !== null) {
      const got = dig(cb, "reward_credit");
      creditsGained += got;
      parts.push(`领旅行礼物 +${fmtCredit(got)} 积分`);
    } else {
      parts.push(`领旅行礼物失败（HTTP ${cc}）`);
    }
    travel = "idle";
  }

  if (travel === "idle") {
    const { status: cc2, body: cb2 } = await get(
      `${base}/buddy/travel/config`,
      headers
    );
    const locs = cc2 >= 200 && cc2 < 300 ? dig(cb2, "locations") : null;
    if (locs && locs.length > 0) {
      const loc = locs[0];
      const { status: dc, body: db } = await post(
        `${base}/buddy/travel/depart`,
        headers,
        { location_id: loc.id }
      );
      if (dc >= 200 && dc < 300) {
        const locName = (dig(db, "location") || {}).name || "?";
        const dur =
          dig(db, "duration_hours") ||
          (dig(db, "location") || {}).duration_hours ||
          "?";
        parts.push(`派 Buddy 去${locName}（${dur} 小时后回）`);
      } else {
        const msg = dig(db, "msg") || "";
        parts.push(`派 Buddy 失败：${msg || `HTTP ${dc}`}`);
      }
    }
  } else if (travel === "traveling") {
    const locName = (dig(tbd, "location") || {}).name || "?";
    parts.push(`Buddy 旅行中（${locName}）`);
  }

  // 2. 盲盒/抽奖
  const { status: lc, body: lb } = await get(
    `${base}/lottery/chances`,
    headers
  );
  const chances = lc >= 200 && lc < 300 ? dig(lb, "balance") : 0;
  if (chances && chances > 0) {
    const { status: dc, body: db } = await post(
      `${base}/lottery/draw`,
      headers,
      {}
    );
    if (dc >= 200 && dc < 300) {
      const prize = dig(db, "prize_name") || dig(db, "prize") || "未知";
      parts.push(`开盲盒获得：${prize}`);
    } else {
      parts.push(`开盲盒失败（HTTP ${dc}）`);
    }
  }

  // 3. 任务领奖
  const { status: tsc2, body: tbd2 } = await get(`${base}/tasks`, headers);
  if (tsc2 >= 200 && tsc2 < 300) {
    const tasks = dig(tbd2, "tasks") || [];
    for (const t of tasks) {
      const progress = t.progress || {};
      const done = (progress.current || 0) >= (progress.target || 1);
      if (done && t.accept_status !== "claimed" && t.has_reward) {
        const { status: ac, body: ab } = await post(
          `${base}/tasks/accept`,
          headers,
          { task_code: t.task_code }
        );
        if (ac >= 200 && ac < 300) {
          const rc = t.reward_credit || 0;
          const re = t.reward_energy || 0;
          creditsGained += rc;
          parts.push(
            `领任务奖「${t.title || t.task_code}」+credit${rc}+energy${re}`
          );
        }
      }
    }
  }

  // 4. 能量 & 连签
  const { status: ec, body: eb } = await get(`${base}/energy`, headers);
  const energy = ec >= 200 && ec < 300 ? dig(eb, "balance") : null;

  const { status: sc, body: sb } = await get(`${base}/streak`, headers);
  const streakObj = dig(sb, "streak") || {};
  const streakDays =
    typeof streakObj === "object" ? streakObj.days : null;

  const tail = [];
  if (energy !== null) tail.push(`能量 ${energy}`);
  if (streakDays !== null) tail.push(`连签 ${streakDays} 天`);
  if (creditsGained) tail.push(`本次 +共 ${creditsGained} 积分`);

  let report = parts.length ? parts.join("；") : "成长中心无可领取项";
  if (tail.length) report += `（${tail.join("，")}）`;

  return {
    code: 0,
    result: {
      result: "GROWTH",
      report,
      credits_gained: creditsGained,
      energy,
      streak_days: streakDays,
    },
  };
}

// ── 主入口 ──────────────────────────────────────────────

async function main() {
  const action = process.argv[2] || "auto";

  let session;
  try {
    session = loadSession();
  } catch (e) {
    console.log(JSON.stringify({ result: "ERROR", report: e.message }));
    process.exit(1);
  }

  if (!session) {
    const home = os.homedir();
    const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    console.log(
      JSON.stringify({
        result: "NO_AUTH",
        report:
          "未找到 WorkBuddy 登录凭据。请先在本机登录 WorkBuddy 桌面端；" +
          "或设置环境变量 WORKBUDDY_SESSION（JSON 格式）或 WORKBUDDY_AUTH_FILE。",
        looked_in: [
          path.join(local, AUTH_BASENAME),
          path.join(home, "Library", "Application Support", AUTH_BASENAME),
        ],
      })
    );
    process.exit(2);
  }

  let headers;
  try {
    headers = buildHeaders(session);
  } catch (e) {
    console.log(JSON.stringify({ result: "NO_SESSION", report: e.message }));
    process.exit(1);
  }

  const endpoint = (
    (session.auth && session.auth.endpoint) ||
    DEFAULT_ENDPOINT
  ).replace(/\/+$/, "");

  if (action === "auto") {
    const { code, result } = await runAuto(headers, endpoint);
    const { code: gcode, result: gout } = await runGrowth(headers, endpoint);
    result.growth = gout.report;
    if (gout.credits_gained) {
      result.report += "；" + gout.report;
    }
    console.log(JSON.stringify(result));
    process.exit(code);
  }

  if (action === "growth") {
    const { code, result } = await runGrowth(headers, endpoint);
    console.log(JSON.stringify(result));
    process.exit(code);
  }

  if (action === "status" || action === "all") {
    const { status: sc, body: sb } = await post(
      `${endpoint}/v2/billing/meter/checkin-activity-status`,
      headers
    );
    console.log(JSON.stringify({ step: "status", http: sc, body: sb }));
  }

  if (action === "claim" || action === "all") {
    const { status: cc, body: cb } = await post(
      `${endpoint}/v2/billing/meter/daily-checkin`,
      headers
    );
    console.log(JSON.stringify({ step: "claim", http: cc, body: cb }));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(JSON.stringify({ result: "ERROR", report: err.message }));
  process.exit(1);
});
