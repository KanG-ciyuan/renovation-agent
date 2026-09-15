# renovation-agent — Renovation Consultation Lead Agent

English | [简体中文](README.zh-CN.md)

[![Status: Prototype](https://img.shields.io/badge/status-prototype-lightgrey.svg)](#status)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A zero-dependency Node.js prototype that turns a free-text renovation inquiry into a structured sales lead using local keyword and regex rules. One HTTP server, one single-page UI, one analysis function, no database. The optional Coze and Feishu integrations exist as code but have never been observed to run successfully in this repository.

**Local-only prototype. Do not expose it to any network** — see the [Security Notice](#security-notice).

## Status

| | |
| --- | --- |
| Status | **Prototype** — runs locally, not deployable in its current state |
| Version | none — no version string, no git tag, no GitHub release |
| Commits | 4, in two clusters |
| Audience | public · not archived · 1 star · 0 forks |
| Tests | none · no CI |
| Last commit | `79793fe` `docs: open source under MIT (#1)` · 2026-09-08 |

The maintenance record, stated without interpretation:

- **2026-06-16** — three commits inside 12 minutes: the first runnable demo, a documentation rewrite (`docs: 去招聘化——改成标准开源项目文档风格`), and the removal of an obsolete deployment URL (`chore: 移除 ngrok 地址，避免隐私泄漏`).
- **2026-09-08** — one commit, `docs: open source under MIT (#1)`. Its diff is only `LICENSE` (+21) and `README.md` (+7): open-source paperwork, no functional change. `pushed_at` is 2026-09-08.
- An **84-day gap** separates the two clusters. No later commit appears in the repository history as of this documentation pass.
- The application code — `app.js`, `lib/integrations.js`, `public/*`, `run-demo.js` — has not been touched since 2026-06-16.

This section records the commit record. It does not characterise the project as active, dormant or abandoned.

## Security Notice

**The current version has an unauthenticated arbitrary-file-read defect. Do not expose it to any network, and do not put real credentials in `.env` until it is fixed.**

The following was proven against the pre-fix implementation by sending raw HTTP requests to it. It is recorded as the basis for the fix, not as current behaviour:

| Request | Result |
| --- | --- |
| `GET /../.env` | **HTTP 200**, returns the complete `.env` — Coze API token, Coze bot ID, Feishu webhook URL |
| `GET /../../../../../../../../etc/hosts` | **HTTP 200** — the `..` traversal is unbounded, so this is arbitrary file read on the host filesystem |
| `GET /index.html` | HTTP 200 (the normal case) |

- **Root cause (fixed):** the static path was built with `path.join(publicDir, target)` and handed to `fs.readFile`, with no confinement check — `path.join` normalizes `..` rather than rejecting it. The handler now resolves through `resolvePublicFile()` and verifies containment before reading.
- The server has **no authentication** of any kind, no rate limiting, no request-size cap, and no timeouts on its outbound calls.
- **An earlier version of this README recommended exposing the app through a tunnelling tool such as ngrok.** That instruction has been removed and must not be followed. Combined with the defect above, tunnelling converts a local demo into unauthenticated remote credential disclosure: one GET request returns your Coze token and Feishu webhook URL.
- **Remediation status: FIXED on `main`.** Fix commit `22e658b`, merged in `4381abc`. Every request path is now resolved against `public/`; `..` segments, null bytes, percent-encoded traversal, backslash traversal and dot-prefixed names are rejected, and the resolved path is confirmed to be inside the public root before any filesystem read. Traversal attempts return `403` and are rejected before a read is attempted. A regression suite covers 13 traversal shapes plus live HTTP behaviour: it fails 7 of 9 against the previous implementation and passes 9 of 9 against the fix.
- **The security boundary below still applies.** The defect is closed, but the app still has **no authentication of any kind**, no rate limiting and no request-size cap. Nothing in this repository should be exposed to a network.
- No credential value has ever been committed: `.env.example` ships with all three secret variables empty, and it has never contained a real value in any commit.

## Why This Exists

A renovation inquiry arrives as free text — `我在红谷滩有一套89平二手房，想做奶油风，预算大概12万，多久可以开工？` — and area, budget, style, property type, district and intent are all implicit in it. The repository's own case write-up states the goal plainly ([`CASE_INTRO.md`](CASE_INTRO.md)):

> 把自然语言咨询自动转成结构化线索，让销售团队拿到的不再是一段聊天记录，而是可以直接跟进的客户档案。

The prototype answers one narrow question: can a small set of deterministic rules turn that message into a lead record a salesperson can act on — with no model, no database and no third-party dependency?

## Claimed vs. Actual

| Previously presented as | What the repository actually contains |
| --- | --- |
| "三 Agent 架构" (three-agent architecture) | A hardcoded three-element **display** array inside one function (`app.js:173-186`). No agent objects, no orchestration, no agent-to-agent messaging, no LLM agents |
| Local rules **or** a Coze agent, presented as two working modes | The mode switch works. The Coze reply path has **never executed** — every observed run returned `local-fallback` |
| Leads "实时推送" to a Feishu group | A webhook client exists (`lib/integrations.js:120-167`). Every observed run returned `{"pushed": false, "reason": "未配置飞书 webhook，当前仅展示同步预览"}` |
| "命令行批量测试" (batch testing) through `run-demo.js` | A console pretty-printer with **zero assertions**. It cannot fail, and it exits 0 for any output |
| An online demo reachable through a public tunnel | Withdrawn — see the [Security Notice](#security-notice) |
| Scoring: base 45, +20 budget, +15 area, +10 district, +15 site visit | Incomplete. The code also adds **+10** for 这周/周六/周日 (`app.js:89`). The corrected formula is below |

## How It Works

### Architecture

One Node process and no dependencies. `app.js` requires only the built-ins `http`, `fs` and `path`; `lib/integrations.js` requires `fs` and `path`. There is no `package.json`. The whole pipeline lives in one straight-line async function, `analyzeMessage()` (`app.js:125`).

| Endpoint | Method | Behaviour |
| --- | --- | --- |
| `/` | GET | serves the single-page UI from `public/` |
| `/api/scenarios` | GET | returns the 3 built-in demo inquiries |
| `/api/analyze` | POST | body `{"message": "..."}` → the full analysis object; unparseable JSON → HTTP 400 `{"error":"请求格式错误"}` |

All four were observed during validation: `/` → 200, `/api/scenarios` → 200, `/api/analyze` → 200, malformed body → 400.

### Data Flow

```text
POST /api/analyze {"message": "..."}
        │
        ▼
analyzeMessage(message)                          app.js:125
        │
        ├─ detectIntent()                             app.js:36-50    local rules   VERIFIED
        ├─ extract{Area,Budget,Style,HouseType,Location}()
        │                                             app.js:52-81    local rules   VERIFIED
        ├─ scoreLead() → classifyLead()               app.js:83-97    local rules   VERIFIED
        ├─ makeReply()  …or…  generateReplyWithCoze()
        │                                             app.js:99-116 / :142-147
        │       └─ lib/integrations.js:54-118  POST /v3/chat        CODE-ONLY, never executed
        ├─ build feishuPayload (14 fields)            app.js:150-164  VERIFIED
        └─ pushLeadToFeishu()                         lib/integrations.js:120-167
        │                                                           CODE-ONLY, never delivered
        ▼
JSON response: originalMessage · serviceReply · replySource · replySourceReason ·
               agents[] · customerProfile{} · followUpSuggestion ·
               feishuStatus{} · feishuPayload{}                   app.js:168-196
```

Nothing is persisted. No output is written to disk.

### Three Responsibilities, Not Three Agents

The work splits into three responsibilities, and they are real:

| Responsibility | Implementation |
| --- | --- |
| Read the inquiry and produce a first reply | `detectIntent()` + `makeReply()` (`app.js:36-50`, `:99-116`) |
| Extract the profile and grade the lead | the five `extract*()` functions + `scoreLead()` / `classifyLead()` (`app.js:52-97`) |
| Build the sync record | `feishuPayload` + `pushLeadToFeishu()` (`app.js:150-166`) |

They are **not three agents**. `app.js:173-186` is the entire implementation of the "three-agent architecture": a hardcoded array of three display strings, built inside `analyzeMessage()` and rendered as a UI panel. There are no agent objects, no orchestration, no independent contexts and no tool-calling loop. The single LLM call in the repository is one Coze chat request, and it is not an agent.

### Rule-Based vs AI-Generated

This split is the honest core of the project.

| Stage | Mechanism | Model involved? | Evidence |
| --- | --- | --- | --- |
| Intent recognition | keyword `includes`, first match wins, 5 intents plus a `综合咨询` fallback (`app.js:36-50`) | No | **VERIFIED** at runtime |
| Customer-profile extraction | regex for area and budget, keyword lists for style, house type and district (`app.js:52-81`) | No | **VERIFIED** |
| Lead scoring and grading | arithmetic (`app.js:83-97`) | No | **VERIFIED** |
| Reply generation (default) | 6 template branches keyed on intent (`app.js:99-116`) | No | **VERIFIED** |
| Reply generation (`AI_MODE=coze`) | `POST https://api.coze.cn/v3/chat` (`lib/integrations.js:54-118`) | Yes — Coze | **CODE-ONLY**: never executed, every observed run fell back to local |

The default mode is therefore **not** an LLM. `AI_MODE` defaults to `local`, and no model is called unless Coze is explicitly configured with both a token and a bot ID. Nothing in this repository demonstrates that the Coze path produces a reply: only the fallback guard (`lib/integrations.js:56-62`) was ever observed to fire.

**Do not treat `replySource` as provenance.** `lib/integrations.js:106-117` returns `provider: "coze"` with the reason `已由扣子智能体生成回复` even when `reply` is the local fallback text — so a customer-facing "回复来源：coze" label can be shown for a reply that came entirely from `makeReply()`. Both code paths that cause this are described under [Known Issues](#known-issues).

## Core Capabilities

| Capability | Implementation | Evidence |
| --- | --- | --- |
| Intent recognition (`价格咨询`, `预约量房`, …) | `app.js:36-50` | **VERIFIED** — observed `价格咨询` and `预约量房` |
| Customer-profile extraction (area, budget, style, house type, district) | `app.js:52-81`, assembled `:126-132` | **VERIFIED** — observed `89平 / 12万 / 奶油风 / 二手房翻新 / 红谷滩` |
| Lead scoring and A/B/C grading | `app.js:83-97` | **VERIFIED** — observed `A-高意向` (90), `B-中意向` (80), `C-待培育` (45) |
| Local rule-based reply generation | `app.js:99-116` | **VERIFIED** — non-empty reply text in every run |
| Structured lead payload (14 fields) | `app.js:150-164` | **VERIFIED** — always built, even when nothing is pushed |
| Single-page web UI | `public/index.html`, `public/style.css`, `public/client.js`, served at `app.js:199-216` | **VERIFIED** — HTTP 200 |
| CLI demo runner | `run-demo.js:4-15` | **VERIFIED as a runner** — 3 scenarios printed, exit 0; **no assertions** |
| Zero third-party dependencies | no `package.json`; only built-ins required | **VERIFIED** |
| Coze reply path | `lib/integrations.js:54-118` | **CODE-ONLY** — never executed; `NOT_TESTABLE` without credentials |
| Feishu push | `lib/integrations.js:120-167` | **CODE-ONLY** — never delivered; every observed run returned `{"pushed": false, ...}` |

### Lead Scoring

```text
base                    45
+20   budget mentioned           有预算
+15   area mentioned             有面积
+10   district mentioned         有地区
+15   site-visit / appointment   量房 / 预约
+10   this week / Sat / Sun      这周 / 周六 / 周日     ← omitted by the previous README
     ─────────────────────────
     total, capped at 100

grade:  ≥85 A-高意向   ·   65–84 B-中意向   ·   <65 C-待培育
```

Observed arithmetic: `90 = 45+20+15+10` (scenario 1) · `80 = 45+15+10+10` (scenario 3) · `45` (scenario 2).

## Outputs and Artifacts

`POST /api/analyze` returns one JSON object (`app.js:168-196`) with `originalMessage`, `serviceReply`, `replySource`, `replySourceReason`, `agents[]`, `customerProfile{}`, `followUpSuggestion`, `feishuStatus{}` and `feishuPayload{}`.

- `customerProfile` carries `area`, `budget`, `style`, `houseType`, `location`, `intent`, `leadScore`, `leadLevel`.
- `feishuPayload` is a 14-field lead record — `customer_name`, `source`, `city`, `location`, `area`, `budget`, `style`, `house_type`, `intent`, `lead_level`, `lead_score`, `original_message`, `next_action` — and is built on every request, whether or not it is ever sent.
- `followUpSuggestion` is one of 4 canned strings (`app.js:118-123`); it is not a follow-up system.
- The CLI prints the same analysis for the 3 built-in scenarios (`run-demo.js:4-15`).

Everything is generated at runtime. There is **no** database, file output, CSV or Excel export, CRM integration, or persistence of any kind; restarting the process loses all state.

## Evidence and Validation Status

**What was run** (this validation pass, against the unmodified repository):

- `node app.js` plus `curl`: `GET /` → HTTP 200 (2058 bytes), `GET /api/scenarios` → HTTP 200, `POST /api/analyze` → HTTP 200 with a complete analysis object, malformed JSON → HTTP 400 `{"error":"请求格式错误"}`.
- `node run-demo.js` → exit 0, printing all 3 scenarios with 3 distinct lead levels.
- `AI_MODE=coze` with no credentials → `{"replySource": "local-fallback", "reason": "缺少扣子配置，已自动回退到本地规则回复"}`.
- A raw-socket security probe (see the [Security Notice](#security-notice)); `curl` normalizes `/../` before sending and is therefore inconclusive for this test.
- Environment: Node **v24.18.1**.

**What does not exist:** no test suite — no `tests/`, no `*.test.js`, no `package.json`, hence no `npm test`. No CI — `.github/` does not exist. No `CHANGELOG`, no version file. `run-demo.js` is a demo runner with zero assertions, not a test: it passes identically on completely wrong output.

**Not testable, and not tested:** the Coze reply success path (no API token or bot ID exists, and fabricating one is not acceptable), and Feishu delivery (no webhook is configured, and pushing into a third party's group during a review would be inappropriate). Both are described here only as code paths.

**Version drift risk:** `fetch()`, used by both integrations, requires Node ≥ 18, but the repository declares no engine requirement because it has no `package.json`. On Node 16 both integration paths would throw `fetch is not defined`, which the handler at `app.js:232-235` would surface as the misleading HTTP 400 above.

## Example

Input (scenario 1):

```text
我在红谷滩有一套89平二手房，想做奶油风，预算大概12万，多久可以开工？
```

Observed output (excerpt, from the CLI run):

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

The reply text was produced by the `价格咨询` template branch, not by a model.

## Use / Not Use

| Use it for | Do not use it for |
| --- | --- |
| Reading a compact, dependency-free example of keyword/regex lead extraction with a deterministic scoring function | Any network-reachable deployment — there is still no authentication of any kind |
| A local UI demo of the inquiry → lead pipeline | Real customer inquiries, real credentials, or anything under a privacy obligation |
| A starting point for rule-based intake triage | Anything that depends on an LLM reply — the Coze path is unverified |
| Studying an honest split between what runs and what is only wired up | Lead management: no persistence, no CRM, no authentication, no audit trail |

## Privacy Boundary

The app processes customer inquiry text, and it has no privacy controls:

- **No authorization boundary.** Both `POST /api/analyze` and the static-file handler are open to any caller — no auth token, no session, no CORS restriction, no origin check.
- **The raw inquiry leaves the process unredacted.** `original_message` (`app.js:162`) is placed in the lead payload sent to a Feishu group webhook. There is no retention rule, no consent step, and no statement of what may leave the system.
- **Filesystem reads are confined to `public/`** as of `22e658b` (see the [Security Notice](#security-notice)). The confinement is one handler; the lack of authentication above is unaffected.
- **The only real safety control in the repository is weak:** `.gitignore` ignores `.env`, which keeps local credentials out of git. Nothing else is enforced.
- **Contributor safety request (repository text):** `请勿在 Issue、代码或配置示例中提交真实 API Key、Webhook 或客户信息。`
- **Content check:** no real customer data is in the repository. `customer_name` is the placeholder `待补充`, `user_id` is the hardcoded `demo-user`, and the 3 scenarios are fabricated demo inquiries. They do reference real place names — 南昌, 红谷滩, 高新, 青山湖, 九龙湖, with `city: "南昌"` hardcoded into every payload — which identify the author's business region but are not personal data.

### Human boundary

There is **no human decision gate**: nothing requires a person to approve a reply or a lead push before it happens. For a local demo that is acceptable; if this prototype were ever put in front of real customers, an authentication boundary, an approval step for outbound messages and a data-retention rule would all have to be added first.

## Known Issues

1. **Unauthenticated arbitrary file read** — detailed in the [Security Notice](#security-notice). It appears nowhere in the repository's own known-issues notes; it appears to be undiscovered.
2. **`replySource` mislabels where a reply came from, by two independent paths.** Path A (`lib/integrations.js:97-104`) checks only the HTTP status, so a `200` body carrying a business error such as `{"code":4101,"msg":"token incorrect"}` passes the guard. Path B (`lib/integrations.js:106-117`) returns `provider: "coze"` with the reason `已由扣子智能体生成回复` even when `reply` is the local fallback text, because the assistant-message lookup found nothing. Path B is the more misleading of the two and is documented nowhere.
3. **Three debug panels are customer-visible.** The shipped UI renders 客户画像, 飞书推送状态 and 飞书同步预览 unconditionally inside the always-shown result grid (`public/index.html:45-58`, populated by `public/client.js:68-77`). Anyone using the page sees the internal lead score, the raw lead payload and the webhook delivery status.
4. **Integration failures produce a misleading error.** A failing `fetch()` inside `pushLeadToFeishu()` is caught by the generic handler at `app.js:232-235`, which returns HTTP 400 `{"error":"请求格式错误"}` — wrong for what is actually a webhook failure.
5. **The "三 Agent 架构" label overstates the implementation** in the repository's GitHub description and in the tracked `AGENTS.md` (`:25`).
6. **`AGENTS.md` is not product documentation.** It is an AI coding-agent context file; `AGENTS.md:65` states its purpose — append new decisions so a new conversation auto-aligns. It carries dated internal notes and state claims that this README does not inherit: a claim that a public tunnel is configured, a claim that Feishu webhook push works (the default configuration contradicts it with `pushed: false`), and a project-structure block that lists `.env` where the tracked file is `.env.example`. It is unmodified here, and its claims are not product facts.
7. **The previous README's scoring formula was incomplete** — it omitted the `+10` term at `app.js:89`. The formula above is the corrected one; the arithmetic was confirmed by run.
8. **`run-demo.js` was described as a test runner** in the previous README and in `AGENTS.md`. It has no assertions and cannot fail on wrong output.
9. **No version identity.** No version string, no tag, no release, no changelog; the only identity markers are the commit SHA and the copyright line in `LICENSE`.
10. **`LICENSE` carries no year** — `Copyright (c) Kang` — unlike the author's other repositories, which read `Copyright (c) 2026 Kang`.
11. **No security or contribution policy files**: no `SECURITY.md`, no `CONTRIBUTING.md`, no `CODE_OF_CONDUCT.md`.

## Quick Start

The only requirement is Node.js (this validation used v24.18.1). There is **no install step**: no `package.json`, so no `npm install`, no `npm start`, no dependency lock and no declared engine range. Run the files directly.

```bash
git clone https://github.com/KanG-ciyuan/renovation-agent.git
cd renovation-agent

node app.js
# 装修咨询 Agent Demo 已启动：http://127.0.0.1:3000
```

Then open `http://127.0.0.1:3000`, or call the API directly:

```bash
curl -s -X POST http://127.0.0.1:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"message":"我在红谷滩有一套89平二手房，想做奶油风，预算大概12万，多久可以开工？"}'
```

Print the pipeline for the three built-in scenarios — a demo runner, not a test:

```bash
node run-demo.js
```

The two optional code paths, wired up but unverified:

```bash
# switch the reply path to Coze; without credentials it falls back to local rules immediately
AI_MODE=coze node app.js

# enable the Feishu push code path; no delivery has ever been observed from this repository
FEISHU_WEBHOOK_URL='<your webhook>' node app.js
```

> **Do not tunnel this port.** Keep `HOST` at `127.0.0.1`. The file-read defect is fixed, but the app still has no authentication, no rate limiting and no request-size cap, so exposing it would still publish a wide-open endpoint. See the [Security Notice](#security-notice).

### Configuration

`.env.example` is the configuration template; every secret value in it is empty.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_MODE` | `local` | `local` uses the rule-based reply; `coze` switches to the unverified Coze path |
| `PORT` | `3000` | listening port |
| `HOST` | `127.0.0.1` | loopback only. This is the correct value and should not be changed |
| `COZE_API_TOKEN` | empty | required only for the unverified Coze path |
| `COZE_BOT_ID` | empty | required only for the unverified Coze path |
| `COZE_BASE_URL` | `https://api.coze.cn` | vendor endpoint |
| `FEISHU_WEBHOOK_URL` | empty | target of the Feishu push code path |

### Repository Layout

```text
├── app.js              # HTTP server + the entire analysis engine
├── run-demo.js         # CLI demo runner (no assertions)
├── lib/
│   └── integrations.js # .env loader + Coze /v3/chat client + Feishu webhook client
├── public/
│   ├── index.html      # single page, 5 result panels (3 of them debug panels — see Known Issues)
│   ├── style.css       # styling (brand colour #b96a2f)
│   └── client.js       # fetch wrappers + DOM rendering
├── .env.example        # environment template, all secret values empty
├── AGENTS.md           # AI-agent context file — internal working notes, not product documentation
├── CASE_INTRO.md       # Chinese business case write-up (overlaps this README's framing)
├── LICENSE             # MIT
├── README.md           # this file
└── README.zh-CN.md     # 简体中文 README
```

## Contributing

There is no `CONTRIBUTING.md`. The repository's one safety request, kept as written:

> 请勿在 Issue、代码或配置示例中提交真实 API Key、Webhook 或客户信息。

(Do not submit real API keys, webhooks or customer information in issues, code or configuration examples.)

Issues and pull requests are welcome on the [repository](https://github.com/KanG-ciyuan/renovation-agent). If you find that the file-read defect is exploitable in a way not described here, report it rather than demonstrating it against someone else's running instance.

## Ecosystem Position

This repository is listed as **earlier work** in the Kang Open-Source AI System. In the maintainer's retrospective it is one of the early prototypes that informed how the current system is put together — a retrospective view of prior experiments, not a documented technical lineage. No repository in the system imports or depends on it as code; one of them, `kang-ppt-skill`, uses it as a case-study subject in its own reports and examples.

---

## Part of the Kang Open-Source AI System

This project is one part of an evidence-driven system for enterprise AI transformation,
agent collaboration, and AI-native product delivery.

| Stage | Project | Role |
| --- | --- | --- |
| DISCOVER | [enterprise-ai-diagnostic-skills](https://github.com/KanG-ciyuan/enterprise-ai-diagnostic-skills) | Understand how the business actually works before automating it |
| DEFINE | [kang-product-architect](https://github.com/KanG-ciyuan/kang-product-architect) | Turn ambiguous requirements into an implementation-ready product contract |
| DEFINE | [kang-enterprise-process-reviewer](https://github.com/KanG-ciyuan/kang-enterprise-process-reviewer) | Review whether workflows are executable, accountable and recoverable |
| BUILD & COORDINATE | [kang-agent-workforce](https://github.com/KanG-ciyuan/kang-agent-workforce) | Role-based AI product workforce with explicit handoffs |
| BUILD & COORDINATE | [kang-agent-collab](https://github.com/KanG-ciyuan/kang-agent-collab) | Agent collaboration and handoff protocol |
| BUILD & COORDINATE | [kang-frontend-standard](https://github.com/KanG-ciyuan/kang-frontend-standard) | Frontend quality standard for AI-built interfaces |
| VERIFY | [kang-b2b-ux-auditor](https://github.com/KanG-ciyuan/kang-b2b-ux-auditor) | Can users actually finish the work? |
| VERIFY | [kang-product-acceptance-auditor](https://github.com/KanG-ciyuan/kang-product-acceptance-auditor) | Independent acceptance of AI-built products |
| DELIVER | [kang-github-readme](https://github.com/KanG-ciyuan/kang-github-readme) | Evidence-aware README engineering |
| DELIVER | [kang-ppt-skill](https://github.com/KanG-ciyuan/kang-ppt-skill) | Evidence-aware presentation design |

**Cross-cutting infrastructure:** [kang-meta-skill](https://github.com/KanG-ciyuan/kang-meta-skill) —
Skill engineering, evaluation and release governance.

**Earlier work:** [ai-agent-rules](https://github.com/KanG-ciyuan/ai-agent-rules),
[workflow-five-steps](https://github.com/KanG-ciyuan/workflow-five-steps),
[renovation-agent](https://github.com/KanG-ciyuan/renovation-agent).

## License

Released under the [MIT License](LICENSE).
