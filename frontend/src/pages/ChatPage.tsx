import { useCallback, useEffect, useId, useRef, useState } from "react";
import "../styles/chat.css";

type LogResponse = {
  chat_id: string;
  user_prompt: string;
  combined_prompt: string;
  tool_name: string | null;
  tool_args: Record<string, unknown> | null;
  tool_result: string | number | null;
  transaction_id: number | null;
  agent_response: string | Record<string, unknown> | null;
};

function formatAgentResponse(value: LogResponse["agent_response"]): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function nextChatId() {
  const n = (Number(sessionStorage.getItem("moniq-chat-seq") || "0") || 0) + 1;
  sessionStorage.setItem("moniq-chat-seq", String(n));
  return `chat_${n}`;
}

function resultTone(toolName: string | null): string {
  if (toolName === "log_transaction") return "tone-success";
  if (toolName === "ask_clarification") return "tone-clarify";
  if (toolName === "unsupported_request") return "tone-error";
  return "tone-neutral";
}

export function ChatPage() {
  const inputId = useId();
  const clarifyId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const clarifyRef = useRef<HTMLInputElement>(null);

  const [chatId, setChatId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [clarifyPrompt, setClarifyPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedPrompt, setSubmittedPrompt] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<LogResponse | null>(null);

  const focusInput = useCallback(() => {
    if (lastResult?.tool_name === "ask_clarification") {
      clarifyRef.current?.focus();
      return;
    }
    inputRef.current?.focus();
  }, [lastResult]);

  const sendPrompt = useCallback(async (text: string, activeChatId: string) => {
    setLoading(true);
    setError(null);
    setSubmittedPrompt(text);
    setPrompt("");

    try {
      const res = await fetch("/api/transactions/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_prompt: text, chat_id: activeChatId }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `Request failed (${res.status})`);
      }

      const data = (await res.json()) as LogResponse;
      setLastResult(data);
      setClarifyPrompt("");

      if (data.tool_name === "log_transaction" && data.transaction_id != null) {
        setChatId(null);
      }
      if (data.tool_name === "unsupported_request") {
        setChatId(null);
      }

      requestAnimationFrame(() => {
        if (data.tool_name === "ask_clarification") {
          clarifyRef.current?.focus();
        } else {
          inputRef.current?.focus();
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPrompt(text);
      setSubmittedPrompt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const submit = useCallback(async () => {
    const text = prompt.trim();
    if (!text || loading) return;

    const activeChatId = chatId ?? nextChatId();
    if (!chatId) setChatId(activeChatId);

    await sendPrompt(text, activeChatId);
  }, [prompt, loading, chatId, sendPrompt]);

  const submitClarification = useCallback(async () => {
    const text = clarifyPrompt.trim();
    if (!text || loading || !chatId) return;
    await sendPrompt(text, chatId);
  }, [clarifyPrompt, loading, chatId, sendPrompt]);

  const startNewChat = useCallback(() => {
    setSubmittedPrompt(null);
    setLastResult(null);
    setChatId(null);
    setError(null);
    setPrompt("");
    setClarifyPrompt("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const typing =
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable === true;

      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        focusInput();
        return;
      }

      if (
        event.key === "Enter" &&
        target === inputRef.current &&
        !event.shiftKey
      ) {
        event.preventDefault();
        void submit();
        return;
      }

      if (
        event.key === "Enter" &&
        target === clarifyRef.current &&
        !event.shiftKey
      ) {
        event.preventDefault();
        void submitClarification();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusInput, submit, submitClarification]);

  // Hide main input after submit; clarification uses the card input
  const showMainComposer = !submittedPrompt;

  return (
    <section
      className={`chat${submittedPrompt ? " has-thread" : ""}`}
      aria-label="Chat"
    >
      <div className={`chat-stage${submittedPrompt ? " has-thread" : ""}`}>
        <p className="chat-kicker">{chatId ?? "new chat"}</p>

        {submittedPrompt ? (
          <div className="chat-user-bubble">{submittedPrompt}</div>
        ) : null}

        {submittedPrompt && error ? (
          <p className="chat-error" role="alert">
            {error}
          </p>
        ) : null}

        {lastResult ? (
          <div className="chat-response-row">
            <div
              className={`chat-result glass ${resultTone(lastResult.tool_name)}`}
              aria-live="polite"
            >
              <p className="chat-result-field">
                <span className="chat-result-key">Tool Used</span>
                <span className="chat-result-val">
                  {lastResult.tool_name ?? "—"}
                </span>
              </p>
              <p className="chat-result-field">
                <span className="chat-result-key">Tool Result</span>
                <span className="chat-result-val">
                  {String(lastResult.tool_result ?? "—")}
                </span>
              </p>
              <p className="chat-result-field agent-response">
                <span className="chat-result-key">agent_response</span>
                <span className="chat-result-val agent-response-val">
                  {formatAgentResponse(lastResult.agent_response)}
                </span>
              </p>

              {lastResult.tool_name === "ask_clarification" ? (
                <form
                  className="chat-clarify"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitClarification();
                  }}
                >
                  <input
                    id={clarifyId}
                    ref={clarifyRef}
                    className="chat-clarify-input"
                    type="text"
                    value={clarifyPrompt}
                    placeholder="Your reply…"
                    autoComplete="off"
                    disabled={loading}
                    onChange={(event) => setClarifyPrompt(event.target.value)}
                  />
                  <button
                    type="submit"
                    className="chat-clarify-submit"
                    disabled={loading || !clarifyPrompt.trim()}
                  >
                    {loading ? "…" : "Reply"}
                  </button>
                </form>
              ) : null}
            </div>

            <button
              type="button"
              className="chat-stamp chat-new-stamp"
              onClick={startNewChat}
              aria-label="Start new chat"
            >
              <span className="chat-stamp-ring" aria-hidden />
              <span className="chat-stamp-label">NEW</span>
              <span className="chat-stamp-sub" aria-hidden>
                chat
              </span>
            </button>
          </div>
        ) : null}

        {showMainComposer ? (
          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="chat-label" htmlFor={inputId}>
              Tell moniQ what happened
            </label>

            <div className="chat-row">
              <input
                id={inputId}
                ref={inputRef}
                className="chat-input"
                type="text"
                value={prompt}
                placeholder="e.g. lunch on Zomato for 400 via UPI"
                autoComplete="off"
                disabled={loading}
                onChange={(event) => setPrompt(event.target.value)}
              />

              <button
                type="submit"
                className="chat-stamp"
                disabled={loading || !prompt.trim()}
                aria-label="Log transaction"
              >
                <span className="chat-stamp-ring" aria-hidden />
                <span className="chat-stamp-label">
                  {loading ? "…" : "LOG"}
                </span>
                <span className="chat-stamp-sub" aria-hidden>
                  ↵
                </span>
              </button>
            </div>

            <p className="chat-shortcuts">
              <kbd>/</kbd> focus · <kbd>Enter</kbd> submit
            </p>
          </form>
        ) : null}

        {!submittedPrompt && error ? (
          <p className="chat-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
