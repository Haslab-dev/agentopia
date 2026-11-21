// Cost estimation for usage_records. Kenari does not publish a per-token
// price for deepseek-v4-1-flash that this codebase can verify, so every cost
// figure in the system is an ESTIMATE at this internal assumed tariff —
// never presented as real billing. Token counts are always the real numbers
// returned by the provider API.
export const PRICE_PER_1M_TOKENS_USD = { input: 0.3, output: 1.2 }
export const PRICING_NOTE =
  'Cost = estimate at an assumed internal tariff of USD 0.30 / 1M input tokens and USD 1.20 / 1M output tokens. Not Kenari billing.'

export function estimateCostUsd(tokensIn: number, tokensOut: number): number {
  return (
    (tokensIn / 1_000_000) * PRICE_PER_1M_TOKENS_USD.input +
    (tokensOut / 1_000_000) * PRICE_PER_1M_TOKENS_USD.output
  )
}
