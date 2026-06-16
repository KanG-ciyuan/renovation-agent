const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  getConfig,
  generateReplyWithCoze,
  pushLeadToFeishu
} = require("./lib/integrations");

const publicDir = path.join(__dirname, "public");
const config = getConfig();

const scenarios = [
  "我在红谷滩有一套89平二手房，想做奶油风，预算大概12万，多久可以开工？",
  "旧房翻新多少钱一平？可以先出效果图吗？",
  "这周六方便上门量房吗？我家在南昌红谷滩。"
];

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function detectIntent(message) {
  const checks = [
    { intent: "预约量房", keywords: ["量房", "预约", "上门", "周六", "周日"] },
    { intent: "价格咨询", keywords: ["多少钱", "报价", "预算", "一平", "费用"] },
    { intent: "效果图咨询", keywords: ["效果图", "方案图", "参考图"] },
    { intent: "工期咨询", keywords: ["多久", "工期", "开工", "几天"] },
    { intent: "风格咨询", keywords: ["奶油风", "现代", "原木", "中古", "法式", "风格"] }
  ];

  const matched = checks.find((item) =>
    item.keywords.some((keyword) => message.includes(keyword))
  );

  return matched ? matched.intent : "综合咨询";
}

function extractArea(message) {
  const match = message.match(/(\d{2,4})\s*平/);
  return match ? `${match[1]}平` : "未提及";
}

function extractBudget(message) {
  const wanMatch = message.match(/(\d+(?:\.\d+)?)\s*万/);
  if (wanMatch) {
    return `${wanMatch[1]}万`;
  }
  const yuanMatch = message.match(/(\d{4,7})\s*元/);
  return yuanMatch ? `${yuanMatch[1]}元` : "未提及";
}

function extractStyle(message) {
  const styles = ["奶油风", "现代简约", "原木风", "中古风", "法式风", "轻奢风"];
  return styles.find((style) => message.includes(style)) || "未提及";
}

function extractHouseType(message) {
  if (message.includes("二手房")) return "二手房翻新";
  if (message.includes("老房")) return "老房翻新";
  if (message.includes("新房")) return "新房装修";
  return "未提及";
}

function extractLocation(message) {
  const areas = ["红谷滩", "南昌", "高新", "青山湖", "九龙湖"];
  return areas.find((area) => message.includes(area)) || "未提及";
}

function scoreLead(profile, message) {
  let score = 45;
  if (profile.budget !== "未提及") score += 20;
  if (profile.area !== "未提及") score += 15;
  if (profile.location !== "未提及") score += 10;
  if (message.includes("量房") || message.includes("预约")) score += 15;
  if (message.includes("这周") || message.includes("周六") || message.includes("周日")) score += 10;
  return Math.min(score, 100);
}

function classifyLead(score) {
  if (score >= 85) return "A-高意向";
  if (score >= 65) return "B-中意向";
  return "C-待培育";
}

function makeReply(intent, profile) {
  if (intent === "预约量房") {
    return `可以安排，我们这边支持上门量房。已记录您${profile.location}、${profile.area}的需求，稍后可由顾问和您确认具体时间。`;
  }
  if (intent === "价格咨询") {
    return `装修报价通常会受面积、风格、房屋现状影响。像您这种${profile.houseType}，如果是${profile.area}，我们建议先沟通预算和风格，再给您更准确的区间。`;
  }
  if (intent === "效果图咨询") {
    return "可以先根据户型、面积和风格偏好做效果图方向建议，便于您先确认大致感觉。";
  }
  if (intent === "工期咨询") {
    return "正常会先沟通需求、量房、出方案，再安排开工。具体工期会根据房屋情况和施工范围来定。";
  }
  if (intent === "风格咨询") {
    return `如果您偏向${profile.style}，我们可以先按预算和面积给您做一版风格建议，帮助判断是否适合您的户型。`;
  }
  return "已收到您的需求，我们可以先帮您梳理面积、预算、风格和时间安排，再给您更准确的建议。";
}

function nextStep(intent, level) {
  if (intent === "预约量房") return "建议 10 分钟内人工跟进，优先锁定上门时间。";
  if (level === "A-高意向") return "建议尽快电话沟通，推进量房或方案沟通。";
  if (level === "B-中意向") return "建议发送案例图和价格区间，继续培育兴趣。";
  return "建议沉淀进私域，后续发送风格案例和报价科普内容。";
}

async function analyzeMessage(message) {
  const profile = {
    area: extractArea(message),
    budget: extractBudget(message),
    style: extractStyle(message),
    houseType: extractHouseType(message),
    location: extractLocation(message)
  };

  const intent = detectIntent(message);
  const score = scoreLead(profile, message);
  const level = classifyLead(score);
  const localReply = makeReply(intent, profile);
  let reply = localReply;
  let replySource = "local";
  let replySourceReason = "当前使用本地规则回复";

  if (config.aiMode === "coze") {
    const cozeResult = await generateReplyWithCoze(message, profile, intent, localReply);
    reply = cozeResult.reply;
    replySource = cozeResult.provider;
    replySourceReason = cozeResult.reason;
  }

  const followUp = nextStep(intent, level);
  const feishuPayload = {
    customer_name: "待补充",
    source: "装修咨询 Agent Demo",
    city: "南昌",
    location: profile.location,
    area: profile.area,
    budget: profile.budget,
    style: profile.style,
    house_type: profile.houseType,
    intent,
    lead_level: level,
    lead_score: score,
    original_message: message,
    next_action: followUp
  };

  const feishuStatus = await pushLeadToFeishu(feishuPayload);

  return {
    originalMessage: message,
    serviceReply: reply,
    replySource,
    replySourceReason,
    agents: [
      {
        name: "客服 Agent",
        output: `识别客户问题并生成首轮回复，当前来源：${replySource}`
      },
      {
        name: "线索 Agent",
        output: `识别为${intent}，当前线索等级为${level}`
      },
      {
        name: "记录 Agent",
        output: "提取客户档案并生成可同步飞书的数据"
      }
    ],
    customerProfile: {
      ...profile,
      intent,
      leadScore: score,
      leadLevel: level
    },
    followUpSuggestion: followUp,
    feishuStatus,
    feishuPayload
  };
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8"
  };

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "text/plain; charset=utf-8" });
    res.end(data);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/api/scenarios") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ scenarios }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/analyze") {
      try {
        const body = await readJsonBody(req);
        const result = await analyzeMessage(body.message || "");
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "请求格式错误" }));
      }
      return;
    }

    const target = req.url === "/" ? "/index.html" : req.url;
    serveFile(res, path.join(publicDir, target));
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(config.port, config.host, () => {
    console.log(`装修咨询 Agent Demo 已启动：http://${config.host}:${config.port}`);
  });
}

module.exports = {
  analyzeMessage,
  scenarios,
  createServer
};
