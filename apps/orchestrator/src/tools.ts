import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { ToolDef } from './llm/compatible'

// ─────────────────────────────────────────────────────────────────────────────
// Tool registry (ARCHITECTURE.md §1.1 Tool Executor). Every tool declares
// whether it is sensitive; sensitive tools NEVER execute without a human
// approval decision recorded in the approvals table. Execution is done by
// the task engine, which checks the agent's allowed_tools permission and
// the approval gate before calling execute() here.
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolSpec {
  name: string
  sensitive: boolean
  def: ToolDef
  /** Short human summary of a call, stored on tool_calls + approvals. */
  summarize(args: Record<string, unknown>): string
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<{ result: unknown; resultStatus: string; artifact?: { fileName: string; title: string } }>
}

export interface ToolContext {
  artifactsDir: string
  taskId: string
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document'
}

export const TOOLS: Record<string, ToolSpec> = {
  write_document: {
    name: 'write_document',
    sensitive: false,
    def: {
      type: 'function',
      function: {
        name: 'write_document',
        description:
          'Save a finished document (markdown) as the task artifact. Call this with the complete document once it is written — this is how work is delivered.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Document title' },
            content: { type: 'string', description: 'Full markdown content of the document' },
          },
          required: ['title', 'content'],
        },
      },
    },
    summarize: (a) => `Write document "${String(a.title ?? '').slice(0, 80)}" (${String(a.content ?? '').length} chars)`,
    async execute(args, ctx) {
      const title = String(args.title ?? 'Document')
      const content = String(args.content ?? '')
      if (!content.trim()) throw new Error('write_document called with empty content')
      await mkdir(ctx.artifactsDir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `${slugify(title)}-${stamp}.md`
      await writeFile(join(ctx.artifactsDir, fileName), content.trim() + '\n', 'utf8')
      return {
        result: { ok: true, artifact: fileName, note: 'Document saved as the task artifact.' },
        resultStatus: 'ok',
        artifact: { fileName, title },
      }
    },
  },

  read_artifact: {
    name: 'read_artifact',
    sensitive: false,
    def: {
      type: 'function',
      function: {
        name: 'read_artifact',
        description: 'Read the content of an artifact file produced earlier (by file name, e.g. from a previous task).',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Artifact file name' } },
          required: ['name'],
        },
      },
    },
    summarize: (a) => `Read artifact "${basename(String(a.name ?? ''))}"`,
    async execute(args, ctx) {
      const name = basename(String(args.name ?? ''))
      if (!name.endsWith('.md')) throw new Error('Only .md artifacts can be read')
      const text = await readFile(join(ctx.artifactsDir, name), 'utf8')
      return { result: { ok: true, name, content: text.slice(0, 8000) }, resultStatus: 'ok' }
    },
  },

  send_external_message: {
    name: 'send_external_message',
    sensitive: true,
    def: {
      type: 'function',
      function: {
        name: 'send_external_message',
        description:
          'Send a message OUTSIDE this system (e.g. to a chat channel or a person). This is a sensitive action: it always pauses for human approval first. Use it only when the task explicitly asks you to send or announce something externally.',
        parameters: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel or medium, e.g. "team-chat"' },
            recipient: { type: 'string', description: 'Who receives the message' },
            message: { type: 'string', description: 'The message text' },
          },
          required: ['channel', 'recipient', 'message'],
        },
      },
    },
    summarize: (a) =>
      `Send external message via ${String(a.channel ?? '?')} to ${String(a.recipient ?? '?')}: "${String(a.message ?? '').slice(0, 120)}"`,
    async execute() {
      // No external messaging integration exists in Phase 3. Even WITH
      // human approval, nothing is sent — the honest outcome is recorded
      // and reported back to the model and the user.
      return {
        result: {
          ok: false,
          sent: false,
          note: 'Approved by the user, but no external messaging integration is connected (Integration Required) — the message was NOT sent.',
        },
        resultStatus: 'approved_not_sent',
      }
    },
  },
}

export function toolDefsFor(allowedTools: string[]): ToolDef[] {
  return allowedTools.filter((n) => TOOLS[n]).map((n) => TOOLS[n].def)
}
