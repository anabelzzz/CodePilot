/**
 * FeishuChannelPlugin — implements ChannelPlugin for Feishu/Lark.
 *
 * Composes: gateway (WS), inbound (parsing), outbound (sending),
 * identity (bot info), policy (access control), card-controller (streaming).
 */

import type { InboundMessage, OutboundMessage, SendResult } from '../../bridge/types';
import type { ChannelPlugin, ChannelCapabilities, ChannelMeta, CardStreamController } from '../types';
import type { FeishuConfig } from './types';

/** Shape of a Feishu card.action.trigger event */
interface CardActionEvent {
  action?: {
    value?: {
      callback_data?: string;
      chatId?: string;
      action?: string;
      operation_id?: string;
    };
  };
  context?: {
    open_chat_id?: string;
    open_message_id?: string;
  };
  operator?: { open_id?: string };
  open_id?: string;
  open_message_id?: string;
}
import { loadFeishuConfig, validateFeishuConfig } from './config';
import { FeishuGateway } from './gateway';
import { parseMessageWithResources } from './inbound';
import { getBotInfo } from './identity';
import { sendMessage, addReaction, removeReaction } from './outbound';
import { isUserAuthorized } from './policy';
import { createCardStreamController } from './card-controller';
import { downloadResource } from './resource-downloader';

export class FeishuChannelPlugin implements ChannelPlugin<FeishuConfig> {
  readonly meta: ChannelMeta = {
    channelType: 'feishu',
    displayName: 'Feishu / Lark',
  };

  private config: FeishuConfig | null = null;
  private gateway: FeishuGateway | null = null;
  private messageQueue: InboundMessage[] = [];
  private waitResolve: ((msg: InboundMessage | null) => void) | null = null;
  /** Track last received messageId per chatId for reaction acknowledgment. */
  private lastMessageIdByChat = new Map<string, string>();
  /** Track active reaction IDs per chatId so we can remove them on completion. */
  private activeReactions = new Map<string, { messageId: string; reactionId: string }>();
  /** Bot's open_id, resolved after gateway starts. Used for @mention detection (#384). */
  private botOpenId = '';

  loadConfig(): FeishuConfig | null {
    this.config = loadFeishuConfig();
    return this.config;
  }

  getConfig(): FeishuConfig | null {
    return this.config;
  }

  getCapabilities(): ChannelCapabilities {
    return {
      streaming: true,
      threadReply: true,
      search: false,  // True server-side search requires user_access_token; we only have local filtering
      history: true,
      reactions: false,
    };
  }

  validateConfig(): string | null {
    if (!this.config) {
      this.loadConfig();
    }
    return validateFeishuConfig(this.config);
  }

  async start(): Promise<void> {
    if (!this.config) {
      this.config = loadFeishuConfig();
    }
    if (!this.config) throw new Error('Feishu config not loaded');

    this.gateway = new FeishuGateway(this.config);

    // Register message handler — pushes to internal queue.
    // Reads this.botOpenId at call time so mention checks activate
    // once resolveBotIdentity() completes after gateway.start().
    //
    // For messages with attached resources (image/file/audio/video, #291), we
    // download in the background and enqueue after attachments are ready. Text
    // messages bypass the download step entirely.
    this.gateway.registerMessageHandler((data: unknown) => {
      const parsed = parseMessageWithResources(data, this.config!, this.botOpenId);
      if (!parsed) return;
      if (parsed.resources.length === 0) {
        this.enqueueMessage(parsed.message);
        return;
      }
      // Download resources then enqueue. Fire-and-forget — the gateway handler
      // must not block long-running downloads.
      this.downloadAndEnqueue(parsed.message, parsed.resources).catch((err) => {
        console.warn('[feishu/plugin]', 'Resource download failed:', err);
        // Still enqueue with whatever text we have so the conversation continues
        this.enqueueMessage(parsed.message);
      });
    });

    // Register card action handler — converts button clicks to callback messages.
    // Gateway guarantees 3-second response; this handler should stay lightweight.
    // Supports two button value formats:
    //   1. { callback_data: "perm:allow:xxx" }  — CodePilot permission buttons
    //   2. { action: "app_auth_done", operation_id: "xxx" }  — OpenClaw-style buttons
    this.gateway.registerCardActionHandler(async (data: unknown) => {
      const event = data as CardActionEvent;
      console.log('[feishu/plugin]', 'Card action raw event:', JSON.stringify(event).slice(0, 500));
      const value = event?.action?.value ?? {};
      // Feishu card.action.trigger v2 callback structure (per official docs):
      //   event.operator.open_id, event.context.open_chat_id, event.context.open_message_id
      // SDK InteractiveCardActionEvent (older type) flattens to:
      //   event.open_id, event.open_message_id
      // WSClient monkey-patch may deliver either format — try both paths.
      // Additionally, we embed chatId in button value as ultimate fallback.
      const chatId = event?.context?.open_chat_id || value.chatId || '';
      const messageId = event?.context?.open_message_id || event?.open_message_id || '';
      const userId = event?.operator?.open_id || event?.open_id || '';

      // Format 1: callback_data (permission buttons)
      const callbackData = value.callback_data;
      if (callbackData && chatId) {
        const callbackMsg: InboundMessage = {
          messageId: messageId || `card_action_${Date.now()}`,
          address: {
            channelType: 'feishu',
            chatId,
            userId,
          },
          text: '',
          timestamp: Date.now(),
          callbackData,
          callbackMessageId: messageId,
        };
        console.log('[feishu/plugin]', 'Card action (callback_data):', callbackData);
        this.enqueueMessage(callbackMsg);
        return {
          toast: { type: 'info' as const, content: '已收到，正在处理...' },
        };
      }

      // Format 2: action / operation_id (OpenClaw-style buttons)
      const action = value.action;
      const operationId = value.operation_id;
      if (action) {
        // Encode as callbackData so the existing bridge-manager callback path
        // can handle it. Format: "action:{action}:{operation_id}"
        const syntheticCallback = operationId
          ? `action:${action}:${operationId}`
          : `action:${action}`;
        const actionMsg: InboundMessage = {
          messageId: messageId || `card_action_${Date.now()}`,
          address: {
            channelType: 'feishu',
            chatId,
            userId,
          },
          text: '',
          timestamp: Date.now(),
          callbackData: syntheticCallback,
          callbackMessageId: messageId,
        };
        console.log('[feishu/plugin]', 'Card action (action):', action, operationId ?? '');
        this.enqueueMessage(actionMsg);
        return {
          toast: { type: 'info' as const, content: '已收到，正在处理...' },
        };
      }

      // Unknown button format — still return a valid toast to prevent 200340
      console.warn('[feishu/plugin]', 'Unknown card action value:', JSON.stringify(value).slice(0, 200));
      return {
        toast: { type: 'info' as const, content: '已收到' },
      };
    });

    await this.gateway.start();

    // Resolve bot identity so mention filtering works (#384).
    // Fire-and-forget with retries — if it fails, mention detection simply no-ops
    // but the bot still functions normally for DMs and un-gated groups.
    this.resolveBotIdentity().catch((err) => {
      console.warn('[feishu/plugin]', 'Bot identity resolution failed:', err);
    });
  }

  /**
   * Fetch bot open_id with retry so mention features degrade gracefully.
   *
   * Note: until this resolves successfully, the requireMention gate fails open
   * (see inbound.ts) — un-mentioned group messages are NOT dropped during the
   * startup gap. This avoids making the bot look completely broken on startup
   * at the cost of a brief permissive window (~1-5s typically).
   */
  private async resolveBotIdentity(maxRetries = 3): Promise<void> {
    const client = this.gateway?.getRestClient();
    if (!client) return;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const info = await getBotInfo(client);
      if (info?.openId) {
        this.botOpenId = info.openId;
        if (this.config?.requireMention) {
          console.log('[feishu/plugin]', `Bot identity resolved (attempt ${attempt}); requireMention gate now active`);
        }
        return;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    const warning = 'Could not resolve bot identity — mention detection disabled (requireMention will fail open until resolved)';
    console.warn('[feishu/plugin]', warning);
  }

  async stop(): Promise<void> {
    if (this.gateway) {
      await this.gateway.stop();
      this.gateway = null;
    }
    this.botOpenId = '';
    // Unblock any waiting consumer
    if (this.waitResolve) {
      this.waitResolve(null);
      this.waitResolve = null;
    }
  }

  isRunning(): boolean {
    return this.gateway?.isRunning() ?? false;
  }

  /**
   * Download resources then enqueue the message with populated attachments (#291).
   * Called from the message handler when non-text messages arrive. Partial
   * failures (some downloads fail) still enqueue — the LLM can see what succeeded.
   */
  private async downloadAndEnqueue(
    base: InboundMessage,
    resources: import('./inbound').PendingResource[],
  ): Promise<void> {
    const client = this.gateway?.getRestClient();
    if (!client) {
      this.enqueueMessage(base);
      return;
    }

    const attachments: import('@/types').FileAttachment[] = [];
    for (const r of resources) {
      const att = await downloadResource(client, r.messageId, r.fileKey, r.resourceType);
      if (att) attachments.push(att);
    }

    this.enqueueMessage({
      ...base,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
  }

  private enqueueMessage(msg: InboundMessage): void {
    // Track messageId for reaction acknowledgment (skip callback messages)
    if (msg.messageId && !msg.callbackData) {
      this.lastMessageIdByChat.set(msg.address.chatId, msg.messageId);
    }
    if (this.waitResolve) {
      const resolve = this.waitResolve;
      this.waitResolve = null;
      resolve(msg);
    } else {
      this.messageQueue.push(msg);
    }
  }

  async consumeOne(): Promise<InboundMessage | null> {
    if (this.messageQueue.length > 0) {
      return this.messageQueue.shift()!;
    }
    return new Promise<InboundMessage | null>((resolve) => {
      this.waitResolve = resolve;
    });
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const client = this.gateway?.getRestClient();
    if (!client) return { ok: false, error: 'Not connected' };
    return sendMessage(client, message);
  }

  isAuthorized(userId: string, chatId: string): boolean {
    if (!this.config) return false;
    return isUserAuthorized(this.config, userId, chatId);
  }

  /** Add emoji reaction to acknowledge message receipt. */
  onMessageStart(chatId: string): void {
    const client = this.gateway?.getRestClient();
    const messageId = this.lastMessageIdByChat.get(chatId);
    if (!client || !messageId) return;
    // Fire-and-forget — don't block message processing
    addReaction(client, messageId, 'Typing').then((reactionId) => {
      if (reactionId) {
        this.activeReactions.set(chatId, { messageId, reactionId });
      }
    }).catch(() => {});
  }

  /** Remove the "processing" reaction after response is sent. */
  onMessageEnd(chatId: string): void {
    const client = this.gateway?.getRestClient();
    const reaction = this.activeReactions.get(chatId);
    if (!client || !reaction) return;
    this.activeReactions.delete(chatId);
    removeReaction(client, reaction.messageId, reaction.reactionId).catch(() => {});
  }

  getCardStreamController(): CardStreamController | null {
    const client = this.gateway?.getRestClient();
    if (!client) {
      console.log('[feishu/plugin] getCardStreamController: no client');
      return null;
    }
    if (!this.config) {
      console.log('[feishu/plugin] getCardStreamController: no config');
      return null;
    }
    return createCardStreamController(client, this.config.cardStreamConfig);
  }

  /** Expose gateway for direct access (e.g. message-actions need restClient). */
  get _gateway(): FeishuGateway | null {
    return this.gateway;
  }
}
