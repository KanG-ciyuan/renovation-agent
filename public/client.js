async function fetchScenarios() {
  const response = await fetch("/api/scenarios");
  const data = await response.json();
  return data.scenarios || [];
}

async function analyzeMessage(message) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message })
  });
  return response.json();
}

function renderAgents(agents) {
  return agents
    .map(
      (agent) => `
        <div class="agent-card">
          <strong>${agent.name}</strong>
          <span>${agent.output}</span>
        </div>
      `
    )
    .join("");
}

async function setup() {
  const messageEl = document.getElementById("message");
  const fillButton = document.getElementById("fill-sample");
  const analyzeButton = document.getElementById("analyze");
  const resultEl = document.getElementById("result");
  const replyEl = document.getElementById("reply");
  const replySourceEl = document.getElementById("reply-source");
  const agentsEl = document.getElementById("agents");
  const profileEl = document.getElementById("profile");
  const feishuStatusEl = document.getElementById("feishu-status");
  const payloadEl = document.getElementById("payload");

  const scenarios = await fetchScenarios();
  let index = 0;

  fillButton.addEventListener("click", () => {
    if (!scenarios.length) return;
    messageEl.value = scenarios[index % scenarios.length];
    index += 1;
  });

  analyzeButton.addEventListener("click", async () => {
    const message = messageEl.value.trim();
    if (!message) {
      messageEl.focus();
      return;
    }

    analyzeButton.disabled = true;
    analyzeButton.textContent = "分析中...";

    try {
      const result = await analyzeMessage(message);
      resultEl.classList.remove("hidden");
      replyEl.textContent = result.serviceReply;
      replySourceEl.textContent = `回复来源：${result.replySource} ｜ ${result.replySourceReason}`;
      agentsEl.innerHTML = renderAgents(result.agents);
      profileEl.textContent = JSON.stringify(
        {
          ...result.customerProfile,
          follow_up: result.followUpSuggestion
        },
        null,
        2
      );
      feishuStatusEl.textContent = JSON.stringify(result.feishuStatus, null, 2);
      payloadEl.textContent = JSON.stringify(result.feishuPayload, null, 2);
    } finally {
      analyzeButton.disabled = false;
      analyzeButton.textContent = "开始分析";
    }
  });
}

setup();
