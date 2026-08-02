/**
 * TypeScript port of the Pydantic models in backend/app/agents/logger.py
 * and backend/app/agent_tools/logger.py
 */

export interface Item {
  name: string;
  quantity: number | null;
  line_amount: number | null;
}

// ── Agent output discriminated union ──────────────────────────────────────────

export interface LogTransaction {
  action: 'log_transaction';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  transaction_type: 'expense' | 'income' | 'transfer' | 'refund';
  payment_method: 'cash' | 'card' | 'upi' | null;
  beneficiary: string | null;
  merchant: string | null;
  category: string | null;
  sub_category: string | null;
  items: Item[] | null;
}

export interface AskClarification {
  action: 'ask_clarification';
  clarification_request: string;
}

export interface UnsupportedRequest {
  action: 'unsupported_request';
  reason: string;
}

export type AgentOutput = LogTransaction | AskClarification | UnsupportedRequest;

// ── JSON schema for structured output (passed to llama.rn grammar) ────────────
// This mirrors the Pydantic OUTPUT_SCHEMA used by Ollama's format= parameter.

export const OUTPUT_SCHEMA = {
  type: 'object',
  oneOf: [
    {
      properties: {
        action: { type: 'string', const: 'log_transaction' },
        amount: { type: 'number' },
        currency: { type: 'string', default: 'INR' },
        status: { type: 'string', enum: ['pending', 'completed', 'failed', 'refunded'] },
        transaction_type: { type: 'string', enum: ['expense', 'income', 'transfer', 'refund'] },
        payment_method: { type: ['string', 'null'], enum: ['cash', 'card', 'upi', null] },
        beneficiary: { type: ['string', 'null'] },
        merchant: { type: ['string', 'null'] },
        category: { type: ['string', 'null'] },
        sub_category: { type: ['string', 'null'] },
        items: {
          type: ['array', 'null'],
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              quantity: { type: ['integer', 'null'] },
              line_amount: { type: ['number', 'null'] },
            },
            required: ['name'],
          },
        },
      },
      required: ['action', 'amount'],
    },
    {
      properties: {
        action: { type: 'string', const: 'ask_clarification' },
        clarification_request: { type: 'string' },
      },
      required: ['action', 'clarification_request'],
    },
    {
      properties: {
        action: { type: 'string', const: 'unsupported_request' },
        reason: { type: 'string' },
      },
      required: ['action', 'reason'],
    },
  ],
  required: ['action'],
} as const;

// ── Validation ────────────────────────────────────────────────────────────────

export function parseAgentOutput(raw: string): AgentOutput | null {
  try {
    // Strip any accidental markdown fences
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    if (!parsed || typeof parsed !== 'object' || !parsed.action) return null;

    switch (parsed.action) {
      case 'log_transaction':
        return {
          action: 'log_transaction',
          amount: Number(parsed.amount),
          currency: parsed.currency ?? 'INR',
          status: parsed.status ?? 'completed',
          transaction_type: parsed.transaction_type ?? 'expense',
          payment_method: parsed.payment_method ?? null,
          beneficiary: parsed.beneficiary ?? null,
          merchant: parsed.merchant ?? null,
          category: parsed.category ?? null,
          sub_category: parsed.sub_category ?? null,
          items: Array.isArray(parsed.items) ? parsed.items : null,
        } satisfies LogTransaction;

      case 'ask_clarification':
        return {
          action: 'ask_clarification',
          clarification_request: String(parsed.clarification_request ?? ''),
        } satisfies AskClarification;

      case 'unsupported_request':
        return {
          action: 'unsupported_request',
          reason: String(parsed.reason ?? ''),
        } satisfies UnsupportedRequest;

      default:
        return null;
    }
  } catch {
    return null;
  }
}
