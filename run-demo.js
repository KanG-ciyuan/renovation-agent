const { analyzeMessage, scenarios } = require("./app");

async function main() {
  console.log("装修咨询 Agent Demo 命令行演示");
  console.log("=".repeat(42));

  for (const scenario of scenarios) {
    const result = await analyzeMessage(scenario);
    console.log(`\n客户消息：${scenario}`);
    console.log(`客服回复：${result.serviceReply}`);
    console.log(`回复来源：${result.replySource}，说明：${result.replySourceReason}`);
    console.log(`客户画像：${JSON.stringify(result.customerProfile, null, 2)}`);
    console.log(`飞书状态：${JSON.stringify(result.feishuStatus, null, 2)}`);
    console.log(`飞书同步预览：${JSON.stringify(result.feishuPayload, null, 2)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
