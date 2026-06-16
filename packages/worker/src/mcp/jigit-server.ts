#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { executeRequestReview, readJigitEnv } from "./request-review.js";

const server = new Server(
  { name: "jigit", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "jigit_request_review",
      description:
        "Pause and request human review or action selection before continuing. Blocks until a human decides.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Summary or question for the human reviewer",
          },
          options: {
            type: "array",
            description: "Optional choices for the human (default: Approve / Request changes)",
            items: {
              type: "object",
              properties: {
                optionId: { type: "string" },
                name: { type: "string" },
              },
              required: ["optionId", "name"],
            },
          },
        },
        required: ["prompt"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "jigit_request_review") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments ?? {};
  const prompt = typeof args.prompt === "string" ? args.prompt : "";
  if (!prompt) {
    throw new Error("prompt is required");
  }

  const options = Array.isArray(args.options)
    ? (args.options as { optionId: string; name: string }[])
    : undefined;

  const env = readJigitEnv();
  const result = await executeRequestReview({
    ...env,
    prompt,
    options,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result),
      },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
