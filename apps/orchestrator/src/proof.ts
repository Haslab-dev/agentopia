import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorkEventType } from '@living-world/shared-types'
import type { CompatibleLLM } from './llm/compatible'

// ─────────────────────────────────────────────────────────────────────────────
// The §7 contract proof run: ONE real task executed through the Kenari
// gateway, with events emitted on the frozen §1.3 contract. Honesty rules:
//  - `run.thinking` covers the real in-flight LLM call (its duration IS the
//    call duration).
//  - `task.completed` is emitted only after the response arrived AND the
//    artifact is written to disk.
//  - Any failure emits `task.failed` with the real error. There is no code
//    path that marks a failed run as completed.
// ─────────────────────────────────────────────────────────────────────────────

export type EmitFn = (
  type: WorkEventType,
  agentId: string,
  taskId: string,
  payload?: Record<string, string | number | boolean>,
) => void

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Gilang — Copywriter. A document-writing task belongs to the copywriter. */
export const PROOF_AGENT_ID = 'copy'
export const PROOF_TITLE = 'Tulis dokumen rencana kerja tim AI (LIVE · Kenari)'

export interface ProofResult {
  ok: boolean
  taskId: string
  artifact?: string
  model?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  latencyMs?: number
  error?: string
}

export async function runLiveProof(
  llm: CompatibleLLM,
  emit: EmitFn,
  artifactsDir: string,
  // Worker runtime has no filesystem: the caller may inject a saver
  // (D1-backed) and the proof writes through it instead of the fs.
  saveArtifact?: (fileName: string, content: string) => Promise<void>,
): Promise<ProofResult> {
  const taskId = `live-${Date.now()}`
  const agentId = PROOF_AGENT_ID

  emit('task.assigned', agentId, taskId, { title: PROOF_TITLE, provider: 'kenari', model: llm.modelName })
  // Give the avatar time to physically walk to its desk (simulation owns the
  // movement; the run itself starts below regardless — events describe the
  // run, the avatar represents it).
  await sleep(6000)
  emit('task.started', agentId, taskId)
  emit('run.thinking', agentId, taskId, { provider: 'kenari', model: llm.modelName })

  try {
    const result = await llm.chat(
      [
        {
          role: 'system',
          content:
            'Kamu adalah Gilang, copywriter di sebuah tim AI yang bekerja di kampus virtual. ' +
            'Tulis dokumen dalam Bahasa Indonesia, format markdown, tanpa pembuka percakapan.',
        },
        {
          role: 'user',
          content:
            "Tulis dokumen singkat (300–450 kata) berjudul '# Rencana Kerja Tim AI — Pekan Ini'. " +
            'Isi: (1) ringkasan tujuan pekan ini, (2) tiga prioritas kerja, masing-masing dengan pemilik peran ' +
            'dari daftar ini: CEO, Manager, Programmer, UI/UX Designer, Research, Data Analyst, Copywriter, ' +
            'Marketing, QA, Admin, (3) satu risiko utama beserta mitigasinya. Tulis hanya dokumennya.',
        },
      ],
      // deepseek-v4-1-flash is a reasoning model: its reasoning pass spends
      // completion tokens before the document starts, so the budget must
      // cover reasoning + a 300–450 word document.
      { maxTokens: 6000, timeoutMs: 180_000 },
    )

    emit('tool.started', agentId, taskId, { tool: 'write_artifact' })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `rencana-kerja-tim-ai-${stamp}.md`
    const footer =
      `\n\n---\n_Dihasilkan oleh model ${result.model} via gateway Kenari · ` +
      `token: ${result.usage?.prompt_tokens ?? '?'} masuk / ${result.usage?.completion_tokens ?? '?'} keluar · ` +
      `latensi ${(result.latencyMs / 1000).toFixed(1)} dtk_\n`
    if (saveArtifact) {
      await saveArtifact(fileName, result.content.trim() + footer)
    } else {
      await mkdir(artifactsDir, { recursive: true })
      await writeFile(join(artifactsDir, fileName), result.content.trim() + footer, 'utf8')
    }
    emit('tool.finished', agentId, taskId, { tool: 'write_artifact', artifact: fileName })

    emit('task.completed', agentId, taskId, {
      artifact: fileName,
      model: result.model,
      tokensIn: result.usage?.prompt_tokens ?? -1,
      tokensOut: result.usage?.completion_tokens ?? -1,
      latencyMs: result.latencyMs,
    })
    return { ok: true, taskId, artifact: fileName, model: result.model, usage: result.usage, latencyMs: result.latencyMs }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit('task.failed', agentId, taskId, { error: message.slice(0, 200) })
    return { ok: false, taskId, error: message }
  }
}
