# 装修咨询智能客服 Agent（renovation-agent）

[English](README.md) | 简体中文

[![Status: Prototype](https://img.shields.io/badge/status-prototype-lightgrey.svg)](#status)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

一个零第三方依赖的 Node.js 原型：用本地关键词与正则规则，把一段自由文本的装修咨询变成结构化销售线索。一个 HTTP 服务、一个单页界面、一个分析函数，没有数据库。Coze 与飞书两条集成链路只存在于代码里，在本仓库中从未被观察到成功执行。

**本地原型，请勿暴露到任何网络** —— 见[安全声明](#安全声明)。

## Status

| | |
| --- | --- |
| 状态 | **Prototype（原型）** —— 可以本地运行，当前状态不可部署 |
| 版本 | 无 —— 没有版本号、没有 git tag、没有 GitHub release |
| 提交数 | 4 次，分两个时间簇 |
| 可见性 | 公开 · 未归档 · 1 star · 0 fork |
| 测试 | 无 · 无 CI |
| 最近提交 | `79793fe` `docs: open source under MIT (#1)` · 2026-09-08 |

维护记录如下，只陈述事实、不作定性：

- **2026-06-16** —— 12 分钟内的 3 次提交：首个可运行 demo、文档重写（`docs: 去招聘化——改成标准开源项目文档风格`）、移除已失效的部署地址（`chore: 移除 ngrok 地址，避免隐私泄漏`）。
- **2026-09-08** —— 1 次提交 `docs: open source under MIT (#1)`，diff 只有 `LICENSE`（+21）与 `README.md`（+7）：开源流程文件，没有任何功能变更。`pushed_at` 为 2026-09-08。
- 两个时间簇之间相隔 **84 天**。截至本文档撰写时，仓库历史中没有更晚的提交。
- 应用代码 —— `app.js`、`lib/integrations.js`、`public/*`、`run-demo.js` —— 自 2026-06-16 起未再改动。

本节只记录提交记录，不对项目是否活跃、停滞或已放弃作任何判断。

## 安全声明

**当前版本存在未鉴权的任意文件读取缺陷。在修复之前，请勿将其暴露到任何网络，也不要往 `.env` 里放真实凭据。**

下表结论来自对**修复前**的实现直接发送原始 HTTP 请求，记录在此作为修复依据，而非当前行为：

| 请求 | 结果 |
| --- | --- |
| `GET /../.env` | **HTTP 200**，返回完整的 `.env` —— Coze API token、Coze bot ID、飞书 webhook URL |
| `GET /../../../../../../../../etc/hosts` | **HTTP 200** —— `..` 的层级不受限制，因此这是宿主机文件系统上的任意文件读取 |
| `GET /index.html` | HTTP 200（正常请求） |

- **根因（已修复）：** 静态路径曾用 `path.join(publicDir, target)` 拼接并直接交给 `fs.readFile`，没有越界校验 —— `path.join` 会规范化 `..` 而不会拒绝它。现在该处理器通过 `resolvePublicFile()` 解析路径，并在读取前校验包含关系。
- 服务**没有任何鉴权**，没有限流、没有请求体大小上限、外部调用没有超时。
- **本 README 的早期版本曾建议通过 ngrok 之类的隧道工具把应用暴露到公网。该说明已删除，且不应再被采用。** 与上述缺陷叠加后，隧道会把一个本地 demo 变成未鉴权的远程凭据泄露：一次 GET 请求即可拿到你的 Coze token 和飞书 webhook URL。
- **修复状态：已在 `main` 上修复。** 修复提交 `22e658b`，合并提交 `4381abc`。现在每个请求路径都会被解析到 `public/` 之下；`..` 片段、空字节、百分号编码型穿越、反斜杠穿越与点前缀文件名都会被拒绝，并在任何文件系统读取之前确认解析结果仍位于 public 根目录内。穿越请求返回 `403`，且在尝试读取之前就被拒绝。回归测试覆盖 13 种穿越形态与实时 HTTP 行为：在修复前的实现上 9 项中失败 7 项，在修复后 9 项全部通过。
- **下文的边界说明依然适用。** 缺陷已关闭，但本应用仍然**没有任何鉴权**，也没有限流与请求体大小上限。本仓库中的任何内容都不应暴露到网络上。
- 仓库中从未提交过任何凭据值：`.env.example` 中三个密钥变量全部为空，且在任何一个提交中都没有出现过真实值。

## 为什么存在

装修咨询天然是自由文本 —— `我在红谷滩有一套89平二手房，想做奶油风，预算大概12万，多久可以开工？` —— 面积、预算、风格、房型、地区、意图全都隐含在这句话里。仓库自己的案例文档把目标说得很直白（[`CASE_INTRO.md`](CASE_INTRO.md)）：

> 把自然语言咨询自动转成结构化线索，让销售团队拿到的不再是一段聊天记录，而是可以直接跟进的客户档案。

这个原型只回答一个很窄的问题：一组确定性的规则，能否把这句话变成销售可以直接跟进的线索记录 —— 不用模型、不用数据库、不引入任何第三方依赖？

## 宣称与实际的差距

| 过去的表述 | 仓库里真实存在的东西 |
| --- | --- |
| 「三 Agent 架构」 | 一个函数内硬编码的三元素**展示用**数组（`app.js:173-186`）。没有 agent 对象、没有编排、没有 agent 间通信、没有 LLM agent |
| 「本地规则 / Coze 智能体两种模式」，被表述为两条可用链路 | 模式开关确实可用。Coze 回复链路**从未执行过** —— 每一次观测到的运行都回退到 `local-fallback` |
| 线索「实时推送」到飞书群 | webhook 客户端确实存在（`lib/integrations.js:120-167`）。每一次观测到的运行都返回 `{"pushed": false, "reason": "未配置飞书 webhook，当前仅展示同步预览"}` |
| `run-demo.js` 是「命令行批量测试」 | 一个只有 `console.log` 的控制台打印脚本，**零断言**，不会失败，任何输出都以 0 退出 |
| 可通过公网隧道访问的在线 demo | 已撤回 —— 见[安全声明](#安全声明) |
| 评分：基础分 45、有预算 +20、有面积 +15、有地区 +10、量房预约 +15 | 不完整。代码还对 这周/周六/周日 加 **+10**（`app.js:89`）。修正后的公式见下文 |

## 工作原理

### 架构

一个 Node 进程，零依赖。`app.js` 只 require 内置模块 `http`、`fs`、`path`；`lib/integrations.js` require `fs` 与 `path`。仓库没有 `package.json`。整条流水线都在一个直筒型 async 函数 `analyzeMessage()` 里（`app.js:125`）。

| 端点 | 方法 | 行为 |
| --- | --- | --- |
| `/` | GET | 从 `public/` 提供单页界面 |
| `/api/scenarios` | GET | 返回 3 条内置演示咨询 |
| `/api/analyze` | POST | body `{"message": "..."}` → 返回完整分析对象；JSON 无法解析 → HTTP 400 `{"error":"请求格式错误"}` |

四种响应都在验证中实测到：`/` → 200，`/api/scenarios` → 200，`/api/analyze` → 200，畸形 body → 400。

### 数据流

```text
POST /api/analyze {"message": "..."}
        │
        ▼
analyzeMessage(message)                          app.js:125
        │
        ├─ detectIntent()                             app.js:36-50    本地规则      VERIFIED
        ├─ extract{Area,Budget,Style,HouseType,Location}()
        │                                             app.js:52-81    本地规则      VERIFIED
        ├─ scoreLead() → classifyLead()               app.js:83-97    本地规则      VERIFIED
        ├─ makeReply()  …或…  generateReplyWithCoze()
        │                                             app.js:99-116 / :142-147
        │       └─ lib/integrations.js:54-118  POST /v3/chat        CODE-ONLY，从未执行
        ├─ 组装 feishuPayload（14 字段）               app.js:150-164  VERIFIED
        └─ pushLeadToFeishu()                         lib/integrations.js:120-167
        │                                                           CODE-ONLY，从未投递成功
        ▼
JSON 响应：originalMessage · serviceReply · replySource · replySourceReason ·
          agents[] · customerProfile{} · followUpSuggestion ·
          feishuStatus{} · feishuPayload{}                   app.js:168-196
```

没有任何持久化，也不向磁盘写任何输出。

### 三项职责，而不是三个 Agent

工作确实被分成三项职责，这部分是真的：

| 职责 | 实现 |
| --- | --- |
| 读懂咨询并给出首轮回复 | `detectIntent()` + `makeReply()`（`app.js:36-50`、`:99-116`） |
| 提取画像并评定线索等级 | 5 个 `extract*()` 函数 + `scoreLead()` / `classifyLead()`（`app.js:52-97`） |
| 组装同步记录 | `feishuPayload` + `pushLeadToFeishu()`（`app.js:150-166`） |

但它们**不是三个 Agent**。`app.js:173-186` 就是「三 Agent 架构」的全部实现：在 `analyzeMessage()` 内部拼出的一个三元素展示字符串数组，前端把它渲染成一个面板。没有 agent 对象、没有编排、没有独立上下文、没有工具调用循环。整个仓库里唯一一次 LLM 调用是一次 Coze chat 请求，而它不是 agent。

### 规则驱动与 AI 生成

这个划分是项目最诚实的核心。

| 环节 | 机制 | 是否涉及模型 | 证据 |
| --- | --- | --- | --- |
| 意图识别 | 关键词 `includes`，首个命中即返回，5 类意图 + `综合咨询` 兜底（`app.js:36-50`） | 否 | 运行时 **VERIFIED** |
| 客户画像提取 | 面积与预算用正则，风格/房型/地区用关键词列表（`app.js:52-81`） | 否 | **VERIFIED** |
| 线索评分与分级 | 算术累加（`app.js:83-97`） | 否 | **VERIFIED** |
| 回复生成（默认） | 按意图分支的 6 段模板话术（`app.js:99-116`） | 否 | **VERIFIED** |
| 回复生成（`AI_MODE=coze`） | `POST https://api.coze.cn/v3/chat`（`lib/integrations.js:54-118`） | 是 —— Coze | **CODE-ONLY**：从未执行，每次观测都回退到本地 |

因此默认模式**不是**大模型。`AI_MODE` 默认为 `local`，除非显式配置了 token 与 bot ID，否则不会调用任何模型。本仓库没有任何证据表明 Coze 链路能产出回复：被观测到的只有兜底分支（`lib/integrations.js:56-62`）。

**不要相信 `replySource` 标注来源。** `lib/integrations.js:106-117` 在 `reply` 就是本地兜底文案时，仍然返回 `provider: "coze"`、reason 为 `已由扣子智能体生成回复` —— 于是完全由 `makeReply()` 生成的回复，可能在客户面前被标注成「回复来源：coze」。造成这一结果的两条路径都列在[已知问题](#已知问题)中。

## 核心能力

| 能力 | 实现 | 证据 |
| --- | --- | --- |
| 意图识别（`价格咨询`、`预约量房` 等） | `app.js:36-50` | **VERIFIED** —— 实测到 `价格咨询` 与 `预约量房` |
| 客户画像提取（面积、预算、风格、房型、地区） | `app.js:52-81`，组装于 `:126-132` | **VERIFIED** —— 实测到 `89平 / 12万 / 奶油风 / 二手房翻新 / 红谷滩` |
| 线索评分与 A/B/C 分级 | `app.js:83-97` | **VERIFIED** —— 实测到 `A-高意向`（90）、`B-中意向`（80）、`C-待培育`（45） |
| 本地规则回复生成 | `app.js:99-116` | **VERIFIED** —— 每次运行都有非空回复文本 |
| 结构化线索载荷（14 字段） | `app.js:150-164` | **VERIFIED** —— 无论是否推送都会生成 |
| 单页 Web 界面 | `public/index.html`、`public/style.css`、`public/client.js`，由 `app.js:199-216` 提供 | **VERIFIED** —— HTTP 200 |
| 命令行演示脚本 | `run-demo.js:4-15` | **作为脚本 VERIFIED** —— 打印 3 个场景，退出码 0；**零断言** |
| 零第三方依赖 | 无 `package.json`，只 require 内置模块 | **VERIFIED** |
| Coze 回复链路 | `lib/integrations.js:54-118` | **CODE-ONLY** —— 从未执行；无凭据情况下 `NOT_TESTABLE` |
| 飞书推送 | `lib/integrations.js:120-167` | **CODE-ONLY** —— 从未投递成功；每次观测均为 `{"pushed": false, ...}` |

### 线索评分

```text
基础分                   45
+20   提及预算            有预算
+15   提及面积            有面积
+10   提及地区            有地区
+15   量房 / 预约意图      量房 / 预约
+10   本周 / 周六 / 周日    这周 / 周六 / 周日     ← 旧 README 遗漏了这一项
      ─────────────────────────
      合计，上限 100

分级：  ≥85 A-高意向   ·   65–84 B-中意向   ·   <65 C-待培育
```

实测算术：`90 = 45+20+15+10`（场景 1）· `80 = 45+15+10+10`（场景 3）· `45`（场景 2）。

## 输出与产物

`POST /api/analyze` 返回一个 JSON 对象（`app.js:168-196`），包含 `originalMessage`、`serviceReply`、`replySource`、`replySourceReason`、`agents[]`、`customerProfile{}`、`followUpSuggestion`、`feishuStatus{}`、`feishuPayload{}`。

- `customerProfile` 包含 `area`、`budget`、`style`、`houseType`、`location`、`intent`、`leadScore`、`leadLevel`。
- `feishuPayload` 是 14 字段的线索记录 —— `customer_name`、`source`、`city`、`location`、`area`、`budget`、`style`、`house_type`、`intent`、`lead_level`、`lead_score`、`original_message`、`next_action` —— 每次请求都会组装，无论最终是否发送。
- `followUpSuggestion` 是 4 条固定文案之一（`app.js:118-123`），不是一个跟进系统。
- 命令行脚本会为 3 个内置场景打印同样的分析结果（`run-demo.js:4-15`）。

所有内容都在运行时生成。这里**没有**数据库、没有文件输出、没有 CSV/Excel 导出、没有 CRM 集成、没有任何形式的持久化；进程重启后状态全部丢失。

## 验证状态

**实际运行过的内容**（本轮验证，针对未修改的仓库）：

- `node app.js` 配合 `curl`：`GET /` → HTTP 200（2058 字节），`GET /api/scenarios` → HTTP 200，`POST /api/analyze` → HTTP 200 且返回完整分析对象，畸形 JSON → HTTP 400 `{"error":"请求格式错误"}`。
- `node run-demo.js` → 退出码 0，打印 3 个场景，3 个不同的线索等级。
- `AI_MODE=coze` 且无凭据 → `{"replySource": "local-fallback", "reason": "缺少扣子配置，已自动回退到本地规则回复"}`。
- 通过原始 socket 做的安全探测（见[安全声明](#安全声明)）；`curl` 会在发送前规范化 `/../`，因此用于该项测试是无效的。
- 环境：Node **v24.18.1**。

**不存在的东西：** 没有测试套件 —— 没有 `tests/`、没有 `*.test.js`、没有 `package.json`，因此也没有 `npm test`。没有 CI —— `.github/` 目录不存在。没有 `CHANGELOG`、没有版本文件。`run-demo.js` 是零断言的演示脚本而不是测试：即使输出完全错误，它也一样通过。

**无法测试、也未测试：** Coze 回复成功链路（没有 API token 与 bot ID，也不允许为审计编造一个）；飞书投递（没有配置 webhook，而且在评审过程中往第三方群里推送是不合适的）。两者在本文档中都只按代码链路来描述。

**版本漂移风险：** 两条集成链路都使用 `fetch()`，它要求 Node ≥ 18；但仓库没有 `package.json`，因此没有声明 engines 约束。在 Node 16 上这两条链路会抛 `fetch is not defined`，并被 `app.js:232-235` 的处理器变成上面那个有误导性的 HTTP 400。

## 示例

输入（场景 1）：

```text
我在红谷滩有一套89平二手房，想做奶油风，预算大概12万，多久可以开工？
```

实测输出（摘自命令行运行）：

```json
{
  "customerProfile": {
    "area": "89平",
    "budget": "12万",
    "style": "奶油风",
    "houseType": "二手房翻新",
    "location": "红谷滩",
    "intent": "价格咨询",
    "leadScore": 90,
    "leadLevel": "A-高意向"
  },
  "replySource": "local",
  "replySourceReason": "当前使用本地规则回复",
  "feishuStatus": {
    "pushed": false,
    "reason": "未配置飞书 webhook，当前仅展示同步预览"
  }
}
```

回复文本来自 `价格咨询` 对应的模板分支，而不是模型输出。

## 适用与不适用

| 适合用来 | 不要用来 |
| --- | --- |
| 阅读一个紧凑、零依赖的关键词/正则线索提取示例，以及一个确定性评分函数 | 任何网络可达的部署 —— 本应用仍然没有任何鉴权 |
| 本地体验「咨询 → 线索」的界面 demo | 真实客户咨询、真实凭据，或任何涉及隐私义务的场景 |
| 作为规则式咨询初筛的起点 | 任何依赖 LLM 回复的场景 —— Coze 链路未经验证 |
| 观察「真正运行的」与「只接了线的」之间的诚实划分 | 线索管理：没有持久化、没有 CRM、没有鉴权、没有审计轨迹 |

## 隐私边界

应用会处理客户咨询文本，而它没有任何隐私控制：

- **没有授权边界。** `POST /api/analyze` 与静态文件处理器对任何调用方开放 —— 没有 auth token、没有 session、没有 CORS 限制、没有来源校验。
- **原始咨询内容未经脱敏就离开进程。** `original_message`（`app.js:162`）被放进发往飞书群 webhook 的线索载荷中。没有留存规则、没有告知同意环节，也没有任何关于「哪些数据可以离开系统」的约束。
- **文件系统读取已限制在 `public/` 内**（自 `22e658b` 起，见[安全声明](#安全声明)）。该限制只作用于一个处理器；上文“没有任何鉴权”的问题不受影响。
- **仓库里唯一真实存在的安全控制很弱：** `.gitignore` 忽略了 `.env`，把本地凭据挡在 git 之外。除此之外没有任何强制手段。
- **贡献者安全提示（仓库原文）：** `请勿在 Issue、代码或配置示例中提交真实 API Key、Webhook 或客户信息。`
- **内容检查：** 仓库中没有真实客户数据。`customer_name` 是占位符 `待补充`，`user_id` 是硬编码的 `demo-user`，3 个场景都是虚构的演示咨询。它们确实引用了真实地名 —— 南昌、红谷滩、高新、青山湖、九龙湖，且 `city: "南昌"` 被硬编码进每个载荷 —— 这些会暴露作者的经营区域，但不属于个人信息。

### 人工边界

这里**没有人工决策门**：没有任何机制要求由人来批准一条回复或一次线索推送。作为本地 demo 这可以接受；但如果这个原型要真正面向客户，就必须先补上鉴权边界、外发消息的人工审批环节，以及数据留存规则。

## 已知问题

1. **未鉴权的任意文件读取** —— 详见[安全声明](#安全声明)。它没有出现在仓库自己的已知问题记录中的任何位置，看起来属于尚未被发现。
2. **`replySource` 会用两条独立路径错误标注回复来源。** 路径 A（`lib/integrations.js:97-104`）只检查 HTTP 状态码，因此 `200` 状态加业务错误码（例如 `{"code":4101,"msg":"token incorrect"}`）可以通过校验。路径 B（`lib/integrations.js:106-117`）在找不到 assistant 消息时，即使 `reply` 就是本地兜底文案，也照样返回 `provider: "coze"` 与 `已由扣子智能体生成回复`。路径 B 的误导性更强，且在任何地方都没有被记录。
3. **三个调试面板对客户可见。** 前端无条件渲染 客户画像、飞书推送状态、飞书同步预览 三个面板，它们位于始终显示的结果网格中（`public/index.html:45-58`，由 `public/client.js:68-77` 填充）。任何使用该页面的人都能看到内部线索评分、原始线索载荷与 webhook 投递状态。
4. **集成失败会返回误导性的错误。** `pushLeadToFeishu()` 内部 `fetch()` 失败时，会被 `app.js:232-235` 的通用处理器捕获，返回 HTTP 400 `{"error":"请求格式错误"}` —— 对一次 webhook 失败来说这个描述是错的。
5. **「三 Agent 架构」这一说法夸大了实现** —— 出现在仓库的 GitHub description 和已跟踪的 `AGENTS.md`（`:25`）中。
6. **`AGENTS.md` 不是产品文档。** 它是 AI 编码助手的上下文文件；`AGENTS.md:65` 写明了它的用途 —— 把新决策追加到文件里，让新对话自动对齐。它包含按日期记录的内部笔记和状态声明，本 README 不继承这些内容：其中包括「公网隧道已配置」、以及「飞书 webhook 推送正常」的说法（默认配置用 `pushed: false` 与之矛盾），还有一个把 `.env` 列为跟踪文件的项目结构块（真正被跟踪的是 `.env.example`）。本次未对它做任何修改，它的声明也不构成产品事实。
7. **旧 README 的评分公式不完整** —— 漏掉了 `app.js:89` 的 +10 项。上文给出的是修正后的公式，并通过实际运行验证了算术结果。
8. **`run-demo.js` 在旧 README 与 `AGENTS.md` 中被描述为测试脚本。** 它没有任何断言，也不会因为输出错误而失败。
9. **没有版本标识。** 没有版本号、没有 tag、没有 release、没有 changelog；唯一的身份标识是提交 SHA 与 `LICENSE` 中的版权行。
10. **`LICENSE` 没有年份** —— `Copyright (c) Kang`，而作者的其他仓库写的是 `Copyright (c) 2026 Kang`。
11. **没有安全与协作政策文件**：没有 `SECURITY.md`、没有 `CONTRIBUTING.md`、没有 `CODE_OF_CONDUCT.md`。

## 快速开始

唯一的依赖是 Node.js（本次验证使用 v24.18.1）。**没有安装步骤**：没有 `package.json`，也就没有 `npm install`、没有 `npm start`、没有依赖锁文件、没有 engines 声明。直接运行文件即可。

```bash
git clone https://github.com/KanG-ciyuan/renovation-agent.git
cd renovation-agent

node app.js
# 装修咨询 Agent Demo 已启动：http://127.0.0.1:3000
```

然后打开 `http://127.0.0.1:3000`，或直接调用 API：

```bash
curl -s -X POST http://127.0.0.1:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"message":"我在红谷滩有一套89平二手房，想做奶油风，预算大概12万，多久可以开工？"}'
```

打印 3 个内置场景的流水线结果 —— 这是演示脚本，不是测试：

```bash
node run-demo.js
```

两条可选链路：已经接好，但未经验证。

```bash
# 切换回复链路到 Coze；没有凭据时会立即回退到本地规则
AI_MODE=coze node app.js

# 启用飞书推送代码链路；本仓库中从未观测到成功投递
FEISHU_WEBHOOK_URL='<your webhook>' node app.js
```

> **不要给这个端口做隧道。** 请保持 `HOST` 为 `127.0.0.1`。文件读取缺陷已修复，但本应用仍然没有鉴权、没有限流、也没有请求体大小上限，暴露出去依然等于公开一个完全开放的接口。见[安全声明](#安全声明)。

### 配置项

`.env.example` 是配置模板，其中所有密钥值均为空。

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `AI_MODE` | `local` | `local` 使用规则回复；`coze` 切到未经验证的 Coze 链路 |
| `PORT` | `3000` | 监听端口 |
| `HOST` | `127.0.0.1` | 仅回环地址。这是正确的取值，不应修改 |
| `COZE_API_TOKEN` | 空 | 仅未经验证的 Coze 链路需要 |
| `COZE_BOT_ID` | 空 | 仅未经验证的 Coze 链路需要 |
| `COZE_BASE_URL` | `https://api.coze.cn` | 厂商接口地址 |
| `FEISHU_WEBHOOK_URL` | 空 | 飞书推送链路的目标 |

### 目录结构

```text
├── app.js              # HTTP 服务 + 全部分析引擎
├── run-demo.js         # 命令行演示脚本（零断言）
├── lib/
│   └── integrations.js # .env 加载 + Coze /v3/chat 客户端 + 飞书 webhook 客户端
├── public/
│   ├── index.html      # 单页界面，5 个结果面板（其中 3 个是调试面板 —— 见已知问题）
│   ├── style.css       # 样式（品牌色 #b96a2f）
│   └── client.js       # fetch 封装 + DOM 渲染
├── .env.example        # 环境变量模板，所有密钥值均为空
├── AGENTS.md           # AI agent 上下文文件 —— 内部工作笔记，不是产品文档
├── CASE_INTRO.md       # 中文业务案例文档（与本 README 的叙述高度重叠）
├── LICENSE             # MIT
├── README.md           # 英文主 README
└── README.zh-CN.md     # 本文件
```

## 参与共建

仓库没有 `CONTRIBUTING.md`。唯一一条安全提示，原文保留：

> 请勿在 Issue、代码或配置示例中提交真实 API Key、Webhook 或客户信息。

欢迎在[仓库](https://github.com/KanG-ciyuan/renovation-agent)提交 Issue 或 Pull Request。如果你发现文件读取缺陷存在本文未描述的可利用方式，请上报，而不要拿别人的运行实例做验证。

## 生态位置

本仓库在 Kang 开源 AI 体系中被列为**早期工作**。在维护者的回顾里，它是早期原型之一，影响了当前体系的组织方式 —— 这是对既往实验的回顾性描述，不是有据可查的技术谱系。体系中没有仓库以代码形式 import 或依赖它；其中一个仓库 `kang-ppt-skill` 把它当作案例素材，用在自己的报告与示例中。

---

## 属于 Kang 开源 AI 体系

本项目是「面向企业 AI 转型、Agent 协作与 AI 原生产品交付的证据驱动体系」的一部分。

| 阶段 | 项目 | 作用 |
| --- | --- | --- |
| DISCOVER 发现 | [enterprise-ai-diagnostic-skills](https://github.com/KanG-ciyuan/enterprise-ai-diagnostic-skills) | 在自动化之前，先弄清企业真实业务如何运行 |
| DEFINE 定义 | [kang-product-architect](https://github.com/KanG-ciyuan/kang-product-architect) | 把模糊需求转化为可实施、可审查的产品契约 |
| DEFINE 定义 | [kang-enterprise-process-reviewer](https://github.com/KanG-ciyuan/kang-enterprise-process-reviewer) | 审查流程是否可执行、可追责、可恢复 |
| BUILD & COORDINATE 构建与协同 | [kang-agent-workforce](https://github.com/KanG-ciyuan/kang-agent-workforce) | 角色化的 Agent 数字员工团队与显式交接 |
| BUILD & COORDINATE 构建与协同 | [kang-agent-collab](https://github.com/KanG-ciyuan/kang-agent-collab) | Agent 协作与交接协议 |
| BUILD & COORDINATE 构建与协同 | [kang-frontend-standard](https://github.com/KanG-ciyuan/kang-frontend-standard) | AI 构建界面的前端质量标准 |
| VERIFY 验证 | [kang-b2b-ux-auditor](https://github.com/KanG-ciyuan/kang-b2b-ux-auditor) | 用户能否真正把工作做完 |
| VERIFY 验证 | [kang-product-acceptance-auditor](https://github.com/KanG-ciyuan/kang-product-acceptance-auditor) | AI 构建产品的独立验收 |
| DELIVER 交付 | [kang-github-readme](https://github.com/KanG-ciyuan/kang-github-readme) | 证据感知的 README 工程 |
| DELIVER 交付 | [kang-ppt-skill](https://github.com/KanG-ciyuan/kang-ppt-skill) | 证据感知的演示文稿设计 |

**横向基础设施：** [kang-meta-skill](https://github.com/KanG-ciyuan/kang-meta-skill) —
Skill 工程化、评估与发布治理。

**早期工作：** [ai-agent-rules](https://github.com/KanG-ciyuan/ai-agent-rules)、
[workflow-five-steps](https://github.com/KanG-ciyuan/workflow-five-steps)、
[renovation-agent](https://github.com/KanG-ciyuan/renovation-agent)。

## 开源许可证

本项目采用 [MIT License](LICENSE) 开源。
