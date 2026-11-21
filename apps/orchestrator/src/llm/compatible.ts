// Generic OpenAI-compatible LLM adapter (ARCHITECTURE.md §1.2).
// One adapter for every OpenAI-compatible endpoint — a new provider is a new
// base URL + key, not new code. The API key is read from the process
// environment at construction time and is never logged or returned.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export interface ChatResult {
  content: string
  model: string
  usage?: ChatUsage
  latencyMs: number
}

/** Tool definition in the OpenAI function-calling shape. */
export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** A message in a tool-calling conversation (superset of ChatMessage). */
export type TurnMessage =
  | ChatMessage
  | { role: 'assistant'; content: string; tool_calls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ToolCallRequest {
  id: string
  name: string
  /** Parsed arguments ({} when the model sent unparseable JSON). */
  args: Record<string, unknown>
  rawArguments: string
}

export interface TurnResult {
  content: string
  toolCalls: ToolCallRequest[]
  model: string
  usage?: ChatUsage
  latencyMs: number
  finishReason?: string
}

export class CompatibleLLM {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
  ) {}

  get modelName(): string {
    return this.model
  }

  /**
   * One turn of a tool-calling conversation. Unlike chat(), an empty
   * content is NOT an error when the model requested tool calls instead.
   */
  async chatTurn(
    messages: TurnMessage[],
    tools: ToolDef[],
    opts?: { temperature?: number; maxTokens?: number; timeoutMs?: number; model?: string },
  ): Promise<TurnResult> {
    const t0 = Date.now()
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: opts?.model ?? this.model,
        messages,
        tools: tools.length ? tools : undefined,
        temperature: opts?.temperature,
        max_tokens: opts?.maxTokens ?? 6000,
      }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 180_000),
      redirect: 'error',
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300)
      throw new Error(`LLM HTTP ${res.status}: ${body}`)
    }
    const json = (await res.json()) as {
      model?: string
      choices?: {
        message?: {
          content?: string
          tool_calls?: { id: string; function?: { name: string; arguments: string } }[]
        }
        finish_reason?: string
      }[]
      usage?: ChatUsage
    }
    const msg = json.choices?.[0]?.message
    const toolCalls: ToolCallRequest[] = (msg?.tool_calls ?? []).map((tc) => {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(tc.function?.arguments ?? '{}') as Record<string, unknown>
      } catch {
        args = {}
      }
      return { id: tc.id, name: tc.function?.name ?? '', args, rawArguments: tc.function?.arguments ?? '' }
    })
    const content = msg?.content ?? ''
    if (!content.trim() && toolCalls.length === 0) {
      throw new Error(`LLM returned empty content (finish_reason: ${json.choices?.[0]?.finish_reason ?? 'unknown'})`)
    }
    return {
      content,
      toolCalls,
      model: json.model ?? this.model,
      usage: json.usage,
      latencyMs: Date.now() - t0,
      finishReason: json.choices?.[0]?.finish_reason,
    }
  }

  /**
   * Streaming variant of chat() (Phase 4). The gateway supports SSE token
   * streaming including a final usage chunk (verified against Kenari with
   * stream_options.include_usage). onDelta receives the CUMULATIVE text so
   * far, so consumers can render "text as it actually forms" — real model
   * output, never a typing effect over finished text. If the endpoint
   * answers with plain JSON instead of SSE, the response is treated as a
   * normal completion and onDelta fires once with the full text.
   */
  async chatStream(
    messages: ChatMessage[],
    opts: {
      temperature?: number
      maxTokens?: number
      timeoutMs?: number
      model?: string
      onDelta?: (cumulativeText: string) => void
    } = {},
  ): Promise<ChatResult & { finishReason?: string }> {
    const t0 = Date.now()
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model ?? this.model,
        messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens ?? 2200,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
      redirect: 'error',
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300)
      throw new Error(`LLM HTTP ${res.status}: ${body}`)
    }
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream') || !res.body) {
      // Non-streaming fallback: the endpoint ignored stream:true.
      const json = (await res.json()) as {
        model?: string
        choices?: { message?: { content?: string }; finish_reason?: string }[]
        usage?: ChatUsage
      }
      const content = json.choices?.[0]?.message?.content ?? ''
      if (!content.trim()) {
        throw new Error(`LLM returned empty content (finish_reason: ${json.choices?.[0]?.finish_reason ?? 'unknown'})`)
      }
      opts.onDelta?.(content)
      return {
        content, model: json.model ?? this.model, usage: json.usage,
        latencyMs: Date.now() - t0, finishReason: json.choices?.[0]?.finish_reason,
      }
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let usage: ChatUsage | undefined
    let model = opts.model ?? this.model
    let finishReason: string | undefined
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        let chunk: {
          model?: string
          choices?: { delta?: { content?: string }; finish_reason?: string }[]
          usage?: ChatUsage
        }
        try {
          chunk = JSON.parse(data)
        } catch {
          continue
        }
        if (chunk.model) model = chunk.model
        if (chunk.usage) usage = chunk.usage
        const choice = chunk.choices?.[0]
        if (choice?.finish_reason) finishReason = choice.finish_reason
        const delta = choice?.delta?.content
        if (delta) {
          content += delta
          opts.onDelta?.(content)
        }
      }
    }
    if (!content.trim()) {
      throw new Error(`LLM stream returned empty content (finish_reason: ${finishReason ?? 'unknown'})`)
    }
    return { content, model, usage, latencyMs: Date.now() - t0, finishReason }
  }

  async chat(messages: ChatMessage[], opts?: { maxTokens?: number; timeoutMs?: number }): Promise<ChatResult> {
    const t0 = Date.now()
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: opts?.maxTokens ?? 1200,
      }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 120_000),
      redirect: 'error',
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300)
      throw new Error(`LLM HTTP ${res.status}: ${body}`)
    }
    const json = (await res.json()) as {
      model?: string
      choices?: { message?: { content?: string }; finish_reason?: string }[]
      usage?: ChatUsage
    }
    const content = json.choices?.[0]?.message?.content ?? ''
    if (!content.trim()) {
      // Reasoning models (e.g. deepseek-v4) spend completion tokens on
      // reasoning first — an empty content with finish_reason "length"
      // means the token budget ran out before the answer started.
      throw new Error(`LLM returned empty content (finish_reason: ${json.choices?.[0]?.finish_reason ?? 'unknown'})`)
    }
    return {
      content,
      model: json.model ?? this.model,
      usage: json.usage,
      latencyMs: Date.now() - t0,
    }
  }
}
