/**
 * Local service layer — replaces the HTTP client.
 *
 * All calls now go to on-device SQLite + llama.rn.
 * The UI (LiquidGlassSheet, screens) keeps the same call signatures.
 */

import { runLoggerAgent } from '../agent';
import {
  getEvaluations as dbGetEvaluations,
  patchEvaluation as dbPatchEvaluation,
  getGraph as dbGetGraph,
  getRecentTransactions,
  getEvalsByChat,
  EvalRow,
  TxSummary,
  GraphNode,
  GraphEdge,
} from '../db/queries';

// ── Re-export types so callers don't need to change imports ───────────────────

export interface Transaction {
  id: number;
  amount: number;
  description: string | null;
  merchant_name: string | null;
  category_name: string | null;
  payment_method_name: string | null;
  created_at: string;
  chat_id: string;
}

export interface LogResponse {
  chat_id: string;
  transaction_id: number | null;
  agent_output: object | null;
  transactions: Transaction[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Evaluation {
  id: number;
  chat_id: string;
  user_message: string;
  agent_response: string;
  verdict: 'pending' | 'ok' | 'not_ok' | null;
  notes: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function txSummaryToTransaction(tx: TxSummary, chatId: string): Transaction {
  return {
    id: tx.id,
    amount: tx.type === 'expense' ? -tx.amount : tx.amount,
    description: null,
    merchant_name: tx.merchant_name,
    category_name: tx.category_name,
    payment_method_name: tx.payment_method,
    created_at: tx.created_at,
    chat_id: chatId,
  };
}

function evalRowToEvaluation(row: EvalRow): Evaluation {
  return {
    id: row.id,
    chat_id: row.chat_id,
    user_message: row.user_prompt,
    agent_response: row.agent_response_content ?? row.agent_response_raw ?? '',
    verdict: row.verdict === 'pending' ? null : row.verdict,
    notes: row.notes,
    created_at: row.created_at,
  };
}

// ── Public API (same signatures the UI uses) ─────────────────────────────────

export const api = {
  /**
   * Log a transaction: runs on-device Gemma → writes to local SQLite.
   * onToken: optional streaming callback for token-by-token UI updates.
   */
  logTransaction: async (
    text: string,
    chatId?: string,
    onToken?: (t: string) => void,
  ): Promise<LogResponse> => {
    const result = await runLoggerAgent(text, chatId, onToken);
    const transactions: Transaction[] = [];

    if (result.transactionId != null) {
      const recent = getRecentTransactions(1);
      if (recent[0]) {
        transactions.push(txSummaryToTransaction(recent[0], result.chatId));
      }
    }

    return {
      chat_id: result.chatId,
      transaction_id: result.transactionId,
      agent_output: result.agentOutput,
      transactions,
    };
  },

  getChatHistory: (chatId: string): Promise<{ evaluations: Evaluation[] }> => {
    const rows = getEvalsByChat(chatId);
    return Promise.resolve({ evaluations: rows.map(evalRowToEvaluation) });
  },

  getRecentTransactions: (limit = 30): Transaction[] => {
    const rows = getRecentTransactions(limit);
    return rows.map((tx) => txSummaryToTransaction(tx, ''));
  },

  getGraph: (limit = 100): Promise<GraphData> => {
    return Promise.resolve(dbGetGraph(limit));
  },

  getEvaluations: (page = 1, limit = 20): Promise<Evaluation[]> => {
    const rows = dbGetEvaluations(page, limit);
    return Promise.resolve(rows.map(evalRowToEvaluation));
  },

  patchEvaluation: (
    id: number,
    patch: { verdict?: string; notes?: string },
  ): Promise<void> => {
    dbPatchEvaluation(id, patch);
    return Promise.resolve();
  },
};
