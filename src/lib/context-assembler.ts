/**
 * Context Assembler — unified system prompt assembly for all entry points.
 *
 * Extracts the 5-layer prompt assembly logic from route.ts into a pure async
 * function. Both browser chat (route.ts) and bridge (conversation-engine.ts)
 * call this, ensuring consistent context regardless of entry point.
 *
 * Layer injection is controlled by entry point type:
 *   Desktop: workspace + session + assistant instructions + CLI tools + widget
 *   Bridge:  workspace + session + assistant instructions + CLI tools (no widget)
 */

import type { ChatSession, SearchResult } from '@/types';
import { getSetting } from '@/lib/db';

// ── Types ────────────────────────────────────────────────────────────

export interface ContextAssemblyConfig {
  /** The session from DB */
  session: ChatSession;
  /** Entry point: controls which layers are injected */
  entryPoint: 'desktop' | 'bridge';
  /** Current user prompt (used for workspace retrieval + widget keyword detection) */
  userPrompt: string;
  /** Per-request system prompt append (e.g., skill injection for image generation) */
  systemPromptAppend?: string;
  /** Conversation history (for widget keyword detection in resume context) */
  conversationHistory?: Array<{ role: string; content: string }>;
  /** Whether this is an image agent mode call */
  imageAgentMode?: boolean;
}

export interface AssembledContext {
  /** Final assembled system prompt string, or undefined if no layers produced content */
  systemPrompt: string | undefined;
  /** Whether generative UI is enabled (affects widget MCP server + streamClaude param) */
  generativeUIEnabled: boolean;
  /** Whether widget MCP server should be registered (keyword-gated) */
  needsWidgetMcp: boolean;
  /** Onboarding/checkin instructions (route.ts uses this for server-side completion detection) */
  assistantProjectInstructions: string;
  /** Whether this session is in the assistant workspace */
  isAssistantProject: boolean;
}

// ── Main function ────────────────────────────────────────────────────

export async function assembleContext(config: ContextAssemblyConfig): Promise<AssembledContext> {
  const { session, entryPoint, userPrompt, systemPromptAppend, conversationHistory, imageAgentMode } = config;
  const t0 = Date.now();

  let workspacePrompt = '';
  let assistantProjectInstructions = '';
  let isAssistantProject = false;

  // ── Layer 1: Workspace prompt (if assistant project session) ──────
  try {
    const workspacePath = getSetting('assistant_workspace_path');
    if (workspacePath) {
      const sessionWd = session.working_directory || '';
      isAssistantProject = sessionWd === workspacePath;

      if (isAssistantProject) {
        const { loadWorkspaceFiles, assembleWorkspacePrompt, loadState, needsDailyCheckIn } =
          await import('@/lib/assistant-workspace');

        // Incremental reindex BEFORE search so current turn sees latest content
        try {
          const { indexWorkspace } = await import('@/lib/workspace-indexer');
          indexWorkspace(workspacePath);
        } catch {
          // indexer not available, skip
        }

        const files = loadWorkspaceFiles(workspacePath);

        // Retrieval: search workspace index for relevant context
        let retrievalResults: SearchResult[] | undefined;
        try {
          const { searchWorkspace, updateHotset } = await import('@/lib/workspace-retrieval');
          if (userPrompt.length > 10) {
            retrievalResults = searchWorkspace(workspacePath, userPrompt, { limit: 5 });
            if (retrievalResults.length > 0) {
              updateHotset(workspacePath, retrievalResults.map(r => r.path));
            }
          }
        } catch {
          // retrieval module not available, skip
        }

        workspacePrompt = assembleWorkspacePrompt(files, retrievalResults);

        const state = loadState(workspacePath);

        if (!state.onboardingComplete) {
          assistantProjectInstructions = buildOnboardingInstructions();
        } else if (needsDailyCheckIn(state)) {
          assistantProjectInstructions = buildCheckinInstructions();
        }
      }
    }
  } catch (e) {
    console.warn('[context-assembler] Failed to load assistant workspace:', e);
  }

  // ── Layer 2: Session prompt + per-request append ──────────────────
  let finalSystemPrompt: string | undefined = session.system_prompt || undefined;
  if (systemPromptAppend) {
    finalSystemPrompt = (finalSystemPrompt || '') + '\n\n' + systemPromptAppend;
  }

  // Workspace prompt goes first (base personality), session prompt after (task override)
  if (workspacePrompt) {
    finalSystemPrompt = workspacePrompt + '\n\n' + (finalSystemPrompt || '');
  }

  // ── Layer 3: Assistant project instructions ───────────────────────
  if (assistantProjectInstructions) {
    finalSystemPrompt = (finalSystemPrompt || '') + '\n\n' + assistantProjectInstructions;
  }

  // ── Layer 4: CLI tools context (always, both desktop and bridge) ──
  const t1 = Date.now();
  try {
    const { buildCliToolsContext } = await import('@/lib/cli-tools-context');
    const cliToolsCtx = await buildCliToolsContext();
    const t2 = Date.now();
    console.log(`[context-assembler] CLI tools detection: ${t2 - t1}ms`);
    if (cliToolsCtx) {
      finalSystemPrompt = (finalSystemPrompt || '') + '\n\n' + cliToolsCtx;
    }
  } catch {
    // CLI tools context injection failed — don't block
  }

  // ── Layer 5: Widget system prompt (desktop only) ──────────────────
  const generativeUISetting = getSetting('generative_ui_enabled');
  const generativeUIEnabled = entryPoint === 'desktop' && generativeUISetting !== 'false';

  if (generativeUIEnabled) {
    try {
      const { WIDGET_SYSTEM_PROMPT } = await import('@/lib/widget-guidelines');
      finalSystemPrompt = (finalSystemPrompt || '') + '\n\n' + WIDGET_SYSTEM_PROMPT;
    } catch {
      // Widget prompt injection failed — don't block
    }
  }

  // ── Widget MCP keyword detection (desktop only) ───────────────────
  let needsWidgetMcp = false;
  if (generativeUIEnabled) {
    const widgetKeywords = /可视化|图表|流程图|时间线|架构图|对比|visualiz|diagram|chart|flowchart|timeline|infographic|interactive|widget|show-widget|hierarchy|dashboard/i;
    if (widgetKeywords.test(userPrompt)) needsWidgetMcp = true;
    else if (conversationHistory?.some(m => m.content.includes('show-widget'))) needsWidgetMcp = true;
    else if (imageAgentMode) needsWidgetMcp = true;
  }

  console.log(`[context-assembler] total: ${Date.now() - t0}ms (entry=${entryPoint}, prompt=${finalSystemPrompt?.length ?? 0} chars)`);

  return {
    systemPrompt: finalSystemPrompt,
    generativeUIEnabled,
    needsWidgetMcp,
    assistantProjectInstructions,
    isAssistantProject,
  };
}

// ── Instruction templates ────────────────────────────────────────────

function buildOnboardingInstructions(): string {
  return `<assistant-project-task type="onboarding">
You are now in the assistant workspace onboarding session. Your task is to interview the user to build their profile.

Ask the following 13 questions ONE AT A TIME. Wait for the user's answer before asking the next question. Be conversational and friendly.

1. How should I address you?
2. What name should I use for myself?
3. Do you prefer "concise and direct" or "detailed explanations"?
4. Do you prefer "minimal interruptions" or "proactive suggestions"?
5. What are your three hard boundaries?
6. What are your three most important current goals?
7. Do you prefer output as "lists", "reports", or "conversation summaries"?
8. What information may be written to long-term memory?
9. What information must never be written to long-term memory?
10. What three things should I do first when entering a project?
11. How do you organize your materials? (by project / time / topic / mixed)
12. Where should new information go by default?
13. How should completed tasks be archived?

After the user answers the LAST question (Q13), you MUST immediately output the completion block below. Do NOT wait for the user to say anything else. Do NOT ask for confirmation. Just output the block right after your response to Q13.

CRITICAL FORMATTING RULES for the completion block:
- Each value must be a single line (replace any newlines with spaces)
- Escape all double quotes inside values with backslash: \\"
- Do NOT use single quotes for JSON keys or values
- Do NOT add trailing commas
- The JSON must be on a SINGLE line

\`\`\`onboarding-complete
{"q1":"answer1","q2":"answer2","q3":"answer3","q4":"answer4","q5":"answer5","q6":"answer6","q7":"answer7","q8":"answer8","q9":"answer9","q10":"answer10","q11":"answer11","q12":"answer12","q13":"answer13"}
\`\`\`

After outputting the completion block, tell the user that the setup is complete and the system is now initializing their workspace. Keep this message brief and friendly.

Do NOT try to write files yourself. The system will automatically generate soul.md, user.md, claude.md, memory.md, config.json, and taxonomy.json from your collected answers.

Start by greeting the user and asking the first question.
</assistant-project-task>`;
}

function buildCheckinInstructions(): string {
  return `<assistant-project-task type="daily-checkin">
You are now in the assistant workspace daily check-in session. Ask the user these 3 questions ONE AT A TIME:

1. What did you work on or accomplish today?
2. Any changes to your current priorities or goals?
3. Anything you'd like me to remember going forward?

After collecting all 3 answers, output a summary in exactly this format:

\`\`\`checkin-complete
{"q1":"answer1","q2":"answer2","q3":"answer3"}
\`\`\`

Do NOT try to write files yourself. The system will automatically write a daily memory entry and update user.md from your collected answers.

Start by greeting the user and asking the first question.
</assistant-project-task>`;
}
