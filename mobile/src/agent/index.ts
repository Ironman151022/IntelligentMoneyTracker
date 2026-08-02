/**
 * TypeScript port of backend/app/agents/logger.py + backend/app/api/transaction.py
 *
 * Everything runs on-device: the LLM context is llama.rn, the DB is expo-sqlite.
 * No HTTP calls.
 */

import { complete } from '../llm';
import { SYSTEM_PROMPT } from './prompt';
import { parseAgentOutput, AgentOutput, LogTransaction } from './types';
import {
  logTransaction,
  insertEvaluation,
  getCombinedUserPrompt,
} from '../db/queries';
import { generateChatId } from '../utils/chatId';

export interface AgentRunResult {
  chatId: string;
  userPrompt: string;
  combinedPrompt: string;
  agentOutput: AgentOutput | null;
  agentResponseRaw: string;
  transactionId: number | null;
}

/**
 * Run the logger agent for one user message.
 * Mirrors run_logger_agent() + create_transaction() from the prototype.
 */
export async function runLoggerAgent(
  userPrompt: string,
  chatId?: string,
  onToken?: (token: string) => void,
): Promise<AgentRunResult> {
  const activeChatId = chatId ?? generateChatId();

  // Build combined prompt (join prior turns in this chat, same as prototype)
  const combinedPrompt = getCombinedUserPrompt(activeChatId, userPrompt);

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: combinedPrompt },
  ];

  const { text: rawResponse } = await complete(messages, onToken);

  const agentOutput = parseAgentOutput(rawResponse);

  // Execute the action
  let transactionId: number | null = null;
  if (agentOutput?.action === 'log_transaction') {
    const tx = agentOutput as LogTransaction;
    transactionId = logTransaction({
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      transaction_type: tx.transaction_type,
      payment_method: tx.payment_method,
      beneficiary: tx.beneficiary,
      merchant: tx.merchant,
      category: tx.category,
      sub_category: tx.sub_category,
      items: tx.items,
    });
  }

  // Persist evaluation row (mirrors the Python prototype's evaluations table)
  insertEvaluation({
    chatId: activeChatId,
    userPrompt,
    combinedPrompt,
    agentResponseRaw: rawResponse,
    agentResponseContent: agentOutput ? JSON.stringify(agentOutput) : null,
    transactionId,
  });

  return {
    chatId: activeChatId,
    userPrompt,
    combinedPrompt,
    agentOutput,
    agentResponseRaw: rawResponse,
    transactionId,
  };
}
