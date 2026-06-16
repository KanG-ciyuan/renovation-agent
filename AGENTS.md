# AGENTS.md — 装修咨询智能客服 Agent 项目上下文

## 项目概述
面向装修公司的智能客服 Agent Demo。用户输入装修咨询 → 系统自动识别意图、提取客户画像、生成回复、评定线索等级、推送飞书。

## 技术栈
- Node.js 原生（无第三方依赖）
- 前端：纯 HTML/CSS/JS，暖色调装修风格（品牌色 #b96a2f 陶土橙）
- 可选集成：扣子（Coze）智能体 + 飞书群机器人 webhook
- 公网访问：ngrok 隧道 → https://diagnoses-omnivore-stylized.ngrok-free.dev

## 项目结构
```
├── app.js              # 主服务（HTTP server + 分析引擎）
├── run-demo.js         # 命令行批量测试
├── lib/
│   └── integrations.js # 扣子 API + 飞书 webhook 集成
├── public/
│   ├── index.html      # 前端页面
│   ├── style.css       # 暖色调装修风格样式
│   └── client.js       # 前端交互逻辑
└── .env                # 环境变量（AI_MODE, COZE_*, FEISHU_WEBHOOK_URL）
```

## 核心架构：三 Agent 分工

### 1. 客服 Agent
- 意图检测：关键词匹配（预约量房、价格咨询、效果图咨询、工期咨询、风格咨询）→ 兜底「综合咨询」
- 回复生成：本地规则版用 makeReply() 生成固定话术；coze 模式调用扣子 API 替换
- **已知 Bug**：扣子 API token 过期（返回 code:4101），但代码只检查 HTTP 状态码不检查 JSON 里的业务错误码，导致静默回退到本地回复却标签显示「coze」

### 2. 线索 Agent
- 信息提取：面积（正则 /\d{2,4}\s*平/）、预算（/\d+万/）、风格（关键词列表）、房型（二手/老房/新房）、地区（红谷滩/南昌/高新等）
- 评分算法：基础 45 + 有预算 +20 + 有面积 +15 + 有地区 +10 + 量房预约 +15 + 本周/周末 +10，上限 100
- 等级：≥85 = A-高意向，65-84 = B-中意向，<65 = C-待培育

### 3. 记录 Agent
- 生成飞书同步载荷（JSON）
- 通过 webhook 推送到飞书群

## API 端点
| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 前端页面 |
| `/api/scenarios` | GET | 返回 3 条预设演示场景 |
| `/api/analyze` | POST | body: `{"message":"..."}` → 返回完整分析结果 |

## 当前状态 & 已知问题

### ✅ 已完成的
- 本地运行正常（node app.js，端口 3000）
- ngrok 公网隧道已配置（https://diagnoses-omnivore-stylized.ngrok-free.dev）
- 飞书 webhook 推送正常
- 三个演示场景输入 → 输出正确
- 前端页面暖色调装修风格完成
- 桌面整理已完成（DMG 安装包已删，架构图移入 网页文件/）

### ⚠️ 待解决
1. **扣子 API token 过期**（code: 4101 "token incorrect"）— 需去扣子后台重新生成
2. **integrations.js 第 97-103 行**：只检查 HTTP 状态码，没检查 JSON body 的业务 code 字段。扣子返回 200 + `{"code":4101}` 时不会报错，静默回退到本地回复
3. **前端 3 个调试面板（客户画像、飞书推送状态、飞书同步预览）对客户可见**— 需隐藏或做成管理后台

### 📋 产品反馈
- 垃圾清理测试文件已删除（test_coze.sh, test_coze.py）
- Codex 上下文满时：把新决策追加到这个文件，新对话自动对齐

## 运行命令
```bash
# 本地启动
node app.js

# 命令行批量测试
node run-demo.js

# 切扣子模式
AI_MODE=coze node app.js

# 带飞书推送
FEISHU_WEBHOOK_URL='你的webhook' node app.js

# ngrok 公网隧道
ngrok http --url=diagnoses-omnivore-stylized.ngrok-free.dev 3000
```

## 设计风格
- 品牌色：陶土橙 #b96a2f
- 背景：暖米色渐变 #f3efe7
- 卡片：圆角 24px，纸质白 #fffdf8
- 字体：PingFang SC / Hiragino Sans GB
- 响应式：800px 以下单列

## 演示话术（投递用）
> 我做了一个装修公司智能客服与线索跟进 Agent。用户咨询后系统自动识别意图、提取面积预算风格等关键信息、生成客服回复、评定意向等级，并输出可同步飞书的结构化线索。这个项目从场景设计到代码实现全部独立完成，目前可本地演示。

---

**更新日志**
- 2026.6.16：创建本文档，记录完整上下文、已知 Bug、ngrok 配置
