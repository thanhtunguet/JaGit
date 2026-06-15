import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import TelegramBot from "node-telegram-bot-api";
import { loadConfig } from "@jigit/shared";
import { ApprovalsService } from "../approvals/approvals.service.js";

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot!: TelegramBot;
  private readonly cfg = loadConfig();

  constructor(private readonly approvalsService: ApprovalsService) {}

  onModuleInit() {
    this.bot = new TelegramBot(this.cfg.telegramBotToken, { polling: true });
    this.registerCallbackHandler();
  }

  onModuleDestroy() {
    this.bot.stopPolling();
  }

  /** Send an approval prompt with inline keyboard to the configured chat */
  async sendApproval(opts: {
    chatId: string;
    approvalId: string;
    jobId: string;
    prompt: string;
    options: { optionId: string; name: string }[];
  }): Promise<string> {
    const msg = await this.bot.sendMessage(opts.chatId, [
      `🤖 *Approval required* for job \`${opts.jobId}\``,
      "",
      opts.prompt,
    ].join("\n"), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          opts.options.map((o) => ({
            text: o.name,
            callback_data: `appr:${opts.approvalId}:${o.optionId}`,
          })),
        ],
      },
    });
    return String(msg.message_id);
  }

  /** Send a plain text report message */
  async sendReport(chatId: string, text: string): Promise<void> {
    await this.bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
  }

  private registerCallbackHandler() {
    // Handles inline-keyboard button presses: callback_data = "appr:<id>:<optionId>"
    this.bot.on("callback_query", async (query) => {
      const data = query.data ?? "";
      if (!data.startsWith("appr:")) return;

      const [, approvalId, optionId] = data.split(":");
      if (!approvalId || !optionId) return;

      const user = query.from?.username ?? query.from?.id?.toString() ?? "unknown";

      try {
        await this.approvalsService.decide(approvalId, optionId, "telegram", user);
        await this.bot.answerCallbackQuery(query.id, { text: `✅ ${optionId} recorded` });

        // Edit the message to show the decision
        if (query.message) {
          await this.bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: query.message.chat.id, message_id: query.message.message_id }
          );
        }
      } catch (err) {
        await this.bot.answerCallbackQuery(query.id, {
          text: `Error: ${(err as Error).message}`, show_alert: true });
      }
    });
  }
}
