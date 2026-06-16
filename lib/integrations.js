const fs = require("fs");
const path = require("path");

const DEFAULT_COZE_BASE_URL = "https://api.coze.cn";

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

function getConfig() {
  return {
    aiMode: process.env.AI_MODE || "local",
    port: Number(process.env.PORT || 3000),
    host: process.env.HOST || "127.0.0.1",
    cozeApiToken: process.env.COZE_API_TOKEN || "",
    cozeBotId: process.env.COZE_BOT_ID || "",
    cozeBaseUrl: process.env.COZE_BASE_URL || DEFAULT_COZE_BASE_URL,
    feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL || ""
  };
}

async function generateReplyWithCoze(message, profile, intent, fallbackReply) {
  const config = getConfig();
  if (!config.cozeApiToken || !config.cozeBotId) {
    return {
      reply: fallbackReply,
      provider: "local-fallback",
      reason: "缺少扣子配置，已自动回退到本地规则回复"
    };
  }

  const prompt = [
    "你是装修公司客服，请用自然、专业、简短的中文回复客户。",
    "你的目标是先接住咨询，再推动客户继续沟通。",
    "已识别客户意图：" + intent,
    "已提取客户画像：" + JSON.stringify(profile),
    "客户原始消息：" + message,
    "回复要求：",
    "1. 不要编造价格",
    "2. 尽量引导客户补充面积、预算、风格或时间",
    "3. 控制在120字内"
  ].join("\n");

  const url = `${config.cozeBaseUrl}/v3/chat`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.cozeApiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      bot_id: config.cozeBotId,
      user_id: "demo-user",
      additional_messages: [
        {
          role: "user",
          content: prompt,
          content_type: "text"
        }
      ],
      stream: false
    })
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      reply: fallbackReply,
      provider: "local-fallback",
      reason: `扣子请求失败：${response.status} ${text}`
    };
  }

  const data = await response.json();
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const assistantMessage = [...messages].reverse().find((item) => item.role === "assistant");
  const reply = assistantMessage && assistantMessage.content
    ? assistantMessage.content
    : fallbackReply;

  return {
    reply,
    provider: "coze",
    reason: "已由扣子智能体生成回复"
  };
}

async function pushLeadToFeishu(payload) {
  const config = getConfig();
  if (!config.feishuWebhookUrl) {
    return {
      pushed: false,
      reason: "未配置飞书 webhook，当前仅展示同步预览"
    };
  }

  const content = [
    "新装修线索通知",
    `地区：${payload.location}`,
    `面积：${payload.area}`,
    `预算：${payload.budget}`,
    `风格：${payload.style}`,
    `房型：${payload.house_type}`,
    `意图：${payload.intent}`,
    `等级：${payload.lead_level}（${payload.lead_score}分）`,
    `原始咨询：${payload.original_message}`,
    `建议动作：${payload.next_action}`
  ].join("\n");

  const response = await fetch(config.feishuWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      msg_type: "text",
      content: {
        text: content
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      pushed: false,
      reason: `飞书推送失败：${response.status} ${text}`
    };
  }

  return {
    pushed: true,
    reason: "已推送到飞书群机器人"
  };
}

module.exports = {
  getConfig,
  generateReplyWithCoze,
  pushLeadToFeishu
};
