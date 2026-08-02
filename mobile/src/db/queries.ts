/**
 * Typed query functions — TypeScript port of:
 *   backend/app/agent_tools/logger.py  (writes)
 *   backend/app/api/graph.py            (graph queries)
 *   backend/app/api/evaluation.py       (eval queries)
 *   backend/app/api/transaction.py      (chat history)
 */

import { getDb } from './database';
import type { Item } from '../agent/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDbAmount(value: number | null | undefined): number | null {
  if (value == null) return null;
  return Math.round(Math.abs(value));
}

function getOrCreatePaymentMethod(method: string): number {
  const db = getDb();
  const row = db.getFirstSync<{ id: number }>(
    `INSERT INTO payment_methods (method) VALUES (?)
     ON CONFLICT(method) DO UPDATE SET method = excluded.method
     RETURNING id`,
    [method],
  );
  return row!.id;
}

function getOrCreateMerchant(name: string): number {
  const db = getDb();
  const existing = db.getFirstSync<{ id: number }>(
    'SELECT id FROM merchants WHERE name = ?',
    [name],
  );
  if (existing) return existing.id;
  const result = db.runSync('INSERT INTO merchants (name) VALUES (?)', [name]);
  return result.lastInsertRowId;
}

function getOrCreateBeneficiary(name: string): number {
  const db = getDb();
  const row = db.getFirstSync<{ id: number }>(
    `INSERT INTO beneficiaries (name) VALUES (?)
     ON CONFLICT(name) DO UPDATE SET name = excluded.name
     RETURNING id`,
    [name],
  );
  return row!.id;
}

function getOrCreateCategory(name: string, parentId: number | null): number {
  const db = getDb();
  let existing: { id: number } | null;
  if (parentId == null) {
    existing = db.getFirstSync<{ id: number }>(
      'SELECT id FROM categories WHERE name = ? AND parent_id IS NULL',
      [name],
    );
  } else {
    existing = db.getFirstSync<{ id: number }>(
      'SELECT id FROM categories WHERE name = ? AND parent_id = ?',
      [name, parentId],
    );
  }
  if (existing) return existing.id;
  const result = db.runSync(
    'INSERT INTO categories (name, parent_id) VALUES (?, ?)',
    [name, parentId],
  );
  return result.lastInsertRowId;
}

// ── logTransaction ────────────────────────────────────────────────────────────

export interface LogTransactionParams {
  amount: number;
  currency?: string;
  status?: 'pending' | 'completed' | 'failed' | 'refunded';
  transaction_type?: 'expense' | 'income' | 'transfer' | 'refund';
  payment_method?: 'cash' | 'card' | 'upi' | null;
  beneficiary?: string | null;
  merchant?: string | null;
  category?: string | null;
  sub_category?: string | null;
  items?: Item[] | null;
}

export function logTransaction(params: LogTransactionParams): number {
  const db = getDb();
  const {
    amount,
    currency = 'INR',
    status = 'completed',
    transaction_type = 'expense',
    payment_method,
    beneficiary,
    merchant,
    category,
    sub_category,
    items,
  } = params;

  const paymentMethodId = payment_method
    ? getOrCreatePaymentMethod(payment_method)
    : null;
  const merchantId = merchant ? getOrCreateMerchant(merchant) : null;

  const txResult = db.runSync(
    `INSERT INTO transactions (amount, currency, type, status, payment_method_id, merchant_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [toDbAmount(amount), currency, transaction_type, status, paymentMethodId, merchantId],
  );
  const transactionId = txResult.lastInsertRowId;

  if (beneficiary) {
    const beneficiaryId = getOrCreateBeneficiary(beneficiary);
    db.runSync(
      `INSERT INTO transaction_beneficiaries (transaction_id, beneficiary_id) VALUES (?, ?)`,
      [transactionId, beneficiaryId],
    );
  }

  const categoryIds: number[] = [];
  let parentId: number | null = null;
  if (category) {
    parentId = getOrCreateCategory(category, null);
    categoryIds.push(parentId);
  }
  if (sub_category) {
    const childId = getOrCreateCategory(sub_category, parentId);
    categoryIds.push(childId);
  }
  for (const catId of categoryIds) {
    db.runSync(
      `INSERT OR IGNORE INTO transaction_categories (transaction_id, category_id) VALUES (?, ?)`,
      [transactionId, catId],
    );
  }

  if (items?.length) {
    for (const item of items) {
      db.runSync(
        `INSERT INTO items (name, transaction_id, line_amount, quantity) VALUES (?, ?, ?, ?)`,
        [item.name, transactionId, toDbAmount(item.line_amount ?? null), item.quantity ?? null],
      );
    }
  }

  return transactionId;
}

// ── Evaluation / chat history ─────────────────────────────────────────────────

export interface EvalRow {
  id: number;
  chat_id: string;
  created_at: string;
  user_prompt: string;
  combined_prompt: string | null;
  agent_response_raw: string | null;
  agent_response_content: string | null;
  transaction_id: number | null;
  verdict: 'pending' | 'ok' | 'not_ok';
  notes: string | null;
}

export function getCombinedUserPrompt(chatId: string, userPrompt: string): string {
  const db = getDb();
  const rows = db.getAllSync<{ user_prompt: string }>(
    'SELECT user_prompt FROM evaluations WHERE chat_id = ? ORDER BY id ASC',
    [chatId],
  );
  const previous = rows.map((r) => r.user_prompt);
  if (!previous.length) return userPrompt;
  return [...previous, userPrompt].join(', ');
}

export function insertEvaluation(params: {
  chatId: string;
  userPrompt: string;
  combinedPrompt: string;
  agentResponseRaw: string;
  agentResponseContent: string | null;
  transactionId: number | null;
}): number {
  const db = getDb();
  const result = db.runSync(
    `INSERT INTO evaluations
       (chat_id, user_prompt, combined_prompt, agent_response_raw, agent_response_content, transaction_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.chatId,
      params.userPrompt,
      params.combinedPrompt,
      params.agentResponseRaw,
      params.agentResponseContent,
      params.transactionId,
    ],
  );
  return result.lastInsertRowId;
}

export function getEvaluations(page: number, limit: number): EvalRow[] {
  const db = getDb();
  const offset = (page - 1) * limit;
  return db.getAllSync<EvalRow>(
    `SELECT * FROM evaluations ORDER BY id DESC LIMIT ? OFFSET ?`,
    [limit, offset],
  );
}

export function patchEvaluation(
  id: number,
  patch: { verdict?: string; notes?: string },
): void {
  const db = getDb();
  if (patch.verdict != null) {
    db.runSync('UPDATE evaluations SET verdict = ? WHERE id = ?', [patch.verdict, id]);
  }
  if (patch.notes != null) {
    db.runSync('UPDATE evaluations SET notes = ? WHERE id = ?', [patch.notes, id]);
  }
}

export function getEvalsByChat(chatId: string): EvalRow[] {
  const db = getDb();
  return db.getAllSync<EvalRow>(
    'SELECT * FROM evaluations WHERE chat_id = ? ORDER BY id ASC',
    [chatId],
  );
}

// ── Graph queries ─────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  value?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

export function getGraph(limit: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const db = getDb();

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const txRows = db.getAllSync<{
    id: number; amount: number; currency: string; type: string; created_at: string;
    merchant_name: string | null; payment_method: string | null;
    category_name: string | null;
  }>(
    `SELECT t.id, t.amount, t.currency, t.type, t.created_at,
            m.name AS merchant_name, pm.method AS payment_method,
            c.name AS category_name
     FROM transactions t
     LEFT JOIN merchants m ON m.id = t.merchant_id
     LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
     LEFT JOIN transaction_categories tc ON tc.transaction_id = t.id
     LEFT JOIN categories c ON c.id = tc.category_id AND c.parent_id IS NULL
     ORDER BY t.created_at DESC
     LIMIT ?`,
    [limit],
  );

  const merchantSet = new Set<string>();
  const categorySet = new Set<string>();
  const pmSet = new Set<string>();

  for (const tx of txRows) {
    const txId = `tx_${tx.id}`;
    nodes.push({ id: txId, label: `₹${tx.amount} ${tx.type}`, type: 'transaction', value: tx.amount });

    if (tx.merchant_name) {
      const mid = `merchant_${tx.merchant_name}`;
      if (!merchantSet.has(mid)) {
        merchantSet.add(mid);
        nodes.push({ id: mid, label: tx.merchant_name, type: 'merchant' });
      }
      edges.push({ source: txId, target: mid, relation: 'at' });
    }
    if (tx.payment_method) {
      const pid = `pm_${tx.payment_method}`;
      if (!pmSet.has(pid)) {
        pmSet.add(pid);
        nodes.push({ id: pid, label: tx.payment_method, type: 'payment_method' });
      }
      edges.push({ source: txId, target: pid, relation: 'paid_via' });
    }
    if (tx.category_name) {
      const cid = `cat_${tx.category_name}`;
      if (!categorySet.has(cid)) {
        categorySet.add(cid);
        nodes.push({ id: cid, label: tx.category_name, type: 'category' });
      }
      edges.push({ source: txId, target: cid, relation: 'categorized_as' });
    }
  }

  return { nodes, edges };
}

// ── Recent transactions (for HomeScreen) ──────────────────────────────────────

export interface TxSummary {
  id: number;
  amount: number;
  currency: string;
  type: string;
  status: string;
  created_at: string;
  merchant_name: string | null;
  payment_method: string | null;
  category_name: string | null;
}

export function getRecentTransactions(limit: number): TxSummary[] {
  const db = getDb();
  return db.getAllSync<TxSummary>(
    `SELECT t.id, t.amount, t.currency, t.type, t.status, t.created_at,
            m.name AS merchant_name, pm.method AS payment_method,
            c.name AS category_name
     FROM transactions t
     LEFT JOIN merchants m ON m.id = t.merchant_id
     LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
     LEFT JOIN transaction_categories tc ON tc.transaction_id = t.id
     LEFT JOIN categories c ON c.id = tc.category_id AND c.parent_id IS NULL
     ORDER BY t.created_at DESC
     LIMIT ?`,
    [limit],
  );
}
