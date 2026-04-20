/**
 * Feishu Card Streaming Controller
 *
 * Manages streaming card lifecycle via CardKit v1 API.
 * Text streams via cardkit.v1.cardElement.content (typewriter effect).
 * Running tool calls are appended to text content, cleared when text advances.
 *
 * State machine: idle → creating → streaming → completed | interrupted | error
 */

import type * as lark from '@larksuiteoapi/node-sdk';
import type { CardStreamController, ToolCallInfo } from '../types';
import type { CardStreamConfig } from './types';
import { optimizeMarkdown } from './outbound';

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

interface LarkMessageResponse {
  code?: number;
  msg?: string;
  data?: { message_id?: string };
}

interface CardElement {
  tag: string;
  content?: string;
  text_size?: string;
  text_align?: string;
  element_id?: string;
  [key: string]: unknown;
}

const LOG_TAG = '[card-controller]';
const STREAMING_ELEMENT_ID = 'streaming_content';

interface CardState {
  cardId: string;
  messageId: string;
  sequence: number;
  lastUpdateAt: number;
  startTime: number;
  throttleTimer: ReturnType<typeof setTimeout> | null;
  pendingText: string | null;
  toolCalls: ToolCallInfo[];
  thinking: boolean;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remSec = Math.floor(sec % 60);
  return `${min}m ${remSec}s`;
}

const TOOL_SUMMARY_MAX_LEN = 80;

function summarizeToolInput(name: string, input?: Record<string, unknown>): string {
  if (!input) return '';
  const key =
    input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.query ?? input.url;
  if (key == null) return '';
  let summary = String(key);
  if (name === 'Grep' && input.path) {
    summary = `"${summary}" in ${input.path}`;
  }
  if (summary.length > TOOL_SUMMARY_MAX_LEN) {
    summary = summary.slice(0, TOOL_SUMMARY_MAX_LEN) + '…';
  }
  return summary;
}

function buildRunningToolsMarkdown(tools: ToolCallInfo[]): string {
  const running = tools.filter(t => t.status === 'running');
  if (running.length === 0) return '';
  const lines = running.map((tc) => {
    const detail = summarizeToolInput(tc.name, tc.input);
    return detail ? `🔄 \`${tc.name}\`: ${detail}` : `🔄 \`${tc.name}\``;
  });
  return '\n\n' + lines.join('\n');
}

function buildFinalToolSummary(tools: ToolCallInfo[]): string {
  const completed = tools.filter(t => t.status === 'complete').length;
  const errored = tools.filter(t => t.status === 'error').length;
  const total = completed + errored;
  if (total === 0) return '';
  const parts: string[] = [];
  parts.push(`${total} 步`);
  if (errored > 0) parts.push(`${errored} 失败`);
  return parts.join(' · ');
}

class FeishuCardStreamController implements CardStreamController {
  private client: lark.Client;
  private config: CardStreamConfig;
  private cards = new Map<string, CardState>();

  constructor(client: lark.Client, config: CardStreamConfig) {
    this.client = client;
    this.config = config;
  }

  async create(chatId: string, initialText: string, replyToMessageId?: string): Promise<string> {
    try {
      const initialContent = initialText
        ? optimizeMarkdown(initialText)
        : '💭 Thinking...';
      const cardBody = {
        schema: '2.0',
        config: {
          streaming_mode: true,
          wide_screen_mode: true,
          summary: { content: '思考中...' },
        },
        body: {
          elements: [
            {
              tag: 'markdown',
              content: initialContent,
              text_align: 'left',
              text_size: 'normal',
              element_id: STREAMING_ELEMENT_ID,
            },
          ],
        },
      };

      const createResp = await this.client.cardkit.v1.card.create({
        data: { type: 'card_json', data: JSON.stringify(cardBody) },
      });
      const cardId = createResp?.data?.card_id;
      if (!cardId) {
        console.error(LOG_TAG, 'Card create returned no card_id');
        return '';
      }

      const cardContent = JSON.stringify({ type: 'card', data: { card_id: cardId } });
      let msgResp: LarkMessageResponse;
      if (replyToMessageId) {
        msgResp = await this.client.im.message.reply({
          path: { message_id: replyToMessageId },
          data: { content: cardContent, msg_type: 'interactive' },
        });
      } else {
        msgResp = await this.client.im.message.create({
          params: { receive_id_type: 'chat_id' },
          data: { receive_id: chatId, content: cardContent, msg_type: 'interactive' },
        });
      }
      const messageId = msgResp?.data?.message_id || '';

      this.cards.set(messageId, {
        cardId,
        messageId,
        sequence: 0,
        lastUpdateAt: Date.now(),
        startTime: Date.now(),
        throttleTimer: null,
        pendingText: null,
        toolCalls: [],
        thinking: !initialText,
      });

      return messageId;
    } catch (err: unknown) {
      console.error(LOG_TAG, 'Card create failed:', errMsg(err));
      return '';
    }
  }

  async update(messageId: string, text: string): Promise<'ok' | 'fail'> {
    const state = this.cards.get(messageId);
    if (!state) return 'fail';

    if (state.thinking && text.trim()) {
      state.thinking = false;
    }

    state.pendingText = text;

    const elapsed = Date.now() - state.lastUpdateAt;
    if (elapsed < this.config.throttleMs) {
      if (!state.throttleTimer) {
        state.throttleTimer = setTimeout(() => {
          state.throttleTimer = null;
          if (state.pendingText != null) {
            this.flushUpdate(state).catch(() => {});
          }
        }, this.config.throttleMs - elapsed);
      }
      return 'ok';
    }

    return this.flushUpdate(state);
  }

  private async flushUpdate(state: CardState): Promise<'ok' | 'fail'> {
    const text = state.pendingText;
    if (text == null) return 'ok';
    state.pendingText = null;

    const toolSuffix = buildRunningToolsMarkdown(state.toolCalls);
    const combined = text
      ? `${text}${toolSuffix}`
      : toolSuffix.trimStart();
    const content = optimizeMarkdown(combined || '💭 Thinking...');

    try {
      state.sequence++;
      await this.client.cardkit.v1.cardElement.content({
        path: { card_id: state.cardId, element_id: STREAMING_ELEMENT_ID },
        data: { content, sequence: state.sequence },
      });
      state.lastUpdateAt = Date.now();
      return 'ok';
    } catch (err: unknown) {
      console.error(LOG_TAG, 'Stream update failed:', errMsg(err));
      return 'fail';
    }
  }

  updateToolCalls(messageId: string, tools: ToolCallInfo[]): void {
    const state = this.cards.get(messageId);
    if (!state) return;
    state.toolCalls = tools;
  }

  setThinking(messageId: string): void {
    const state = this.cards.get(messageId);
    if (!state) return;
    state.thinking = true;
  }

  async finalize(
    messageId: string,
    finalText: string,
    status: 'completed' | 'interrupted' | 'error' = 'completed',
  ): Promise<void> {
    const state = this.cards.get(messageId);
    if (!state) return;

    if (state.throttleTimer) {
      clearTimeout(state.throttleTimer);
      state.throttleTimer = null;
    }

    try {
      state.sequence++;
      await this.client.cardkit.v1.card.settings({
        path: { card_id: state.cardId },
        data: {
          settings: JSON.stringify({ config: { streaming_mode: false } }),
          sequence: state.sequence,
        },
      });

      const elements: CardElement[] = [];
      elements.push({
        tag: 'markdown',
        content: optimizeMarkdown(finalText),
        text_size: 'normal',
        element_id: STREAMING_ELEMENT_ID,
      });

      const footerCfg = this.config.footer;
      const footerParts: string[] = [];

      if (footerCfg?.status) {
        const statusLabels: Record<string, string> = {
          completed: '✅ Completed',
          interrupted: '⚠️ Interrupted',
          error: '❌ Error',
        };
        footerParts.push(statusLabels[status] || status);
      }

      if (state.toolCalls.length > 0) {
        const toolSummary = buildFinalToolSummary(state.toolCalls);
        if (toolSummary) footerParts.push(toolSummary);
      }

      if (footerCfg?.elapsed) {
        const elapsedMs = Date.now() - state.startTime;
        footerParts.push(formatElapsed(elapsedMs));
      }

      if (footerParts.length > 0) {
        elements.push({ tag: 'hr' });
        elements.push({
          tag: 'markdown',
          content: footerParts.join(' · '),
          text_size: 'notation',
          element_id: 'footer',
        });
      }

      const finalCard = {
        schema: '2.0',
        config: { wide_screen_mode: true },
        body: { elements },
      };

      state.sequence++;
      await this.client.cardkit.v1.card.update({
        path: { card_id: state.cardId },
        data: {
          card: { type: 'card_json' as const, data: JSON.stringify(finalCard) },
          sequence: state.sequence,
        },
      });
    } catch (err: unknown) {
      console.error(LOG_TAG, 'Finalize failed:', errMsg(err));
    }

    this.cards.delete(messageId);
  }
}

export function createCardStreamController(
  client: lark.Client,
  config: CardStreamConfig,
): CardStreamController {
  return new FeishuCardStreamController(client, config);
}
