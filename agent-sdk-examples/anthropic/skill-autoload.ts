import "dotenv/config";
import { query } from "@anthropic-ai/claude-agent-sdk";

const result = query({
  prompt: "Przywitaj się ze mną.",
  options: {
    systemPrompt: { type: "preset", preset: "claude_code" },
    settingSources: ["project"],
    skills: "all",
    cwd: import.meta.dirname,
  },
});

for await (const message of result) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
