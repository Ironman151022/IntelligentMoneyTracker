import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  logVoiceWav,
  startVoiceCaptureSession,
  type VoiceSession,
} from "../lib/voiceCapture";
import "../styles/chat.css";

type AgentContent = {
  action?: string;
  clarification_request?: string;
  reason?: string;
  [key: string]: unknown;
};

type LogResponse = {
  chat_id: string;
  user_prompt: string;
  combined_prompt: string;
  transaction_id: number | null;
  agent_response_content: AgentContent | string | null;
  audio_path?: string;
};

type VoicePhase = "idle" | "listening" | "processing";

function contentAction(content: LogResponse["agent_response_content"]): string | null {
  if (content && typeof content === "object" && typeof content.action === "string") {
    return content.action;
  }
  return null;
}

function prettyAgentResponse(content: LogResponse["agent_response_content"]): string {
  if (content == null) return "null";
  if (typeof content === "string") {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }
  return JSON.stringify(content, null, 2);
}

function displayUserPrompt(prompt: string): string {
  if (prompt.startsWith("[audio:")) return "🎤 voice recording";
  return prompt;
}

function nextChatId() {
  const n = (Number(sessionStorage.getItem("moniq-chat-seq") || "0") || 0) + 1;
  sessionStorage.setItem("moniq-chat-seq", String(n));
  return `chat_${n}`;
}

function resultTone(action: string | null): string {
  if (action === "log_transaction") return "tone-success";
  if (action === "ask_clarification") return "tone-clarify";
  if (action === "unsupported_request") return "tone-error";
  return "tone-neutral";
}

function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg
      className="chat-mic-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {active ? (
        <>
          <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
        </>
      ) : (
        <>
          <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
          <path d="M19 11a7 7 0 0 1-14 0" />
          <path d="M12 18v3" />
        </>
      )}
    </svg>
  );
}

export function ChatPage() {
  const inputId = useId();
  const clarifyId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const clarifyRef = useRef<HTMLInputElement>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);

  const [chatId, setChatId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [clarifyPrompt, setClarifyPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedPrompt, setSubmittedPrompt] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<LogResponse | null>(null);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceTarget, setVoiceTarget] = useState<"main" | "clarify">("main");

  const action = contentAction(lastResult?.agent_response_content ?? null);
  const voiceBusy = voicePhase !== "idle";

  const focusInput = useCallback(() => {
    if (action === "ask_clarification") {
      clarifyRef.current?.focus();
      return;
    }
    inputRef.current?.focus();
  }, [action]);

  const applyLogResult = useCallback((data: LogResponse, displayPrompt: string) => {
    setLastResult(data);
    setSubmittedPrompt(displayPrompt);
    setClarifyPrompt("");

    const nextAction = contentAction(data.agent_response_content);
    if (nextAction === "log_transaction" && data.transaction_id != null) {
      setChatId(null);
    }
    if (nextAction === "unsupported_request") {
      setChatId(null);
    }

    requestAnimationFrame(() => {
      if (nextAction === "ask_clarification") {
        clarifyRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    });
  }, []);

  const sendPrompt = useCallback(
    async (text: string, activeChatId: string) => {
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
        applyLogResult(data, text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setPrompt(text);
        setSubmittedPrompt(null);
      } finally {
        setLoading(false);
      }
    },
    [applyLogResult],
  );

  const sendVoice = useCallback(
    async (blob: Blob, activeChatId: string) => {
      setLoading(true);
      setError(null);
      setSubmittedPrompt("🎤 voice recording");
      setPrompt("");

      try {
        const data = (await logVoiceWav(blob, activeChatId)) as LogResponse;
        applyLogResult(data, displayUserPrompt(data.user_prompt));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Voice log failed");
        setSubmittedPrompt(null);
      } finally {
        setLoading(false);
      }
    },
    [applyLogResult],
  );

  const submit = useCallback(async () => {
    const text = prompt.trim();
    if (!text || loading || voiceBusy) return;

    const activeChatId = chatId ?? nextChatId();
    if (!chatId) setChatId(activeChatId);

    await sendPrompt(text, activeChatId);
  }, [prompt, loading, voiceBusy, chatId, sendPrompt]);

  const submitClarification = useCallback(async () => {
    const text = clarifyPrompt.trim();
    if (!text || loading || voiceBusy || !chatId) return;
    await sendPrompt(text, chatId);
  }, [clarifyPrompt, loading, voiceBusy, chatId, sendPrompt]);

  const runVoiceFlow = useCallback(
    async (target: "main" | "clarify") => {
      if (loading) return;

      if (voiceSessionRef.current) {
        voiceSessionRef.current.stop();
        voiceSessionRef.current = null;
        setVoicePhase("idle");
        return;
      }

      setError(null);
      setVoiceTarget(target);
      setVoicePhase("listening");

      const session = startVoiceCaptureSession({ silenceMs: 3000 });
      voiceSessionRef.current = session;

      try {
        const blob = await session.done;
        voiceSessionRef.current = null;
        setVoicePhase("processing");

        if (target === "clarify") {
          const activeChatId = chatId;
          if (!activeChatId) {
            setError("No active chat for clarification");
            setVoicePhase("idle");
            return;
          }
          await sendVoice(blob, activeChatId);
          setVoicePhase("idle");
          return;
        }

        const activeChatId = chatId ?? nextChatId();
        if (!chatId) setChatId(activeChatId);
        await sendVoice(blob, activeChatId);
        setVoicePhase("idle");
      } catch (err) {
        voiceSessionRef.current = null;
        setVoicePhase("idle");
        const message =
          err instanceof Error ? err.message : "Voice capture failed";
        if (message !== "Recording cancelled") {
          setError(message);
        }
      }
    },
    [loading, chatId, sendVoice],
  );

  const startNewChat = useCallback(() => {
    if (voiceSessionRef.current) {
      voiceSessionRef.current.stop();
      voiceSessionRef.current = null;
    }
    setVoicePhase("idle");
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
    return () => {
      voiceSessionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const targetEl = event.target as HTMLElement | null;
      const tag = targetEl?.tagName?.toLowerCase();
      const typing =
        tag === "input" ||
        tag === "textarea" ||
        targetEl?.isContentEditable === true;

      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        focusInput();
        return;
      }

      if (
        event.key === "Enter" &&
        targetEl === inputRef.current &&
        !event.shiftKey
      ) {
        event.preventDefault();
        void submit();
        return;
      }

      if (
        event.key === "Enter" &&
        targetEl === clarifyRef.current &&
        !event.shiftKey
      ) {
        event.preventDefault();
        void submitClarification();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusInput, submit, submitClarification]);

  const showMainComposer = !submittedPrompt;

  const micLabel =
    voicePhase === "listening"
      ? "Stop listening"
      : voicePhase === "processing"
        ? "Processing voice"
        : "Speak to log";

  const bubbleText =
    action === "ask_clarification" && lastResult?.combined_prompt
      ? lastResult.combined_prompt
          .split(", ")
          .map(displayUserPrompt)
          .join(", ")
      : submittedPrompt;

  return (
    <section
      className={`chat${submittedPrompt ? " has-thread" : ""}`}
      aria-label="Chat"
    >
      <div className={`chat-stage${submittedPrompt ? " has-thread" : ""}`}>
        <p className="chat-kicker">{chatId ?? "new chat"}</p>

        {submittedPrompt ? (
          <div className="chat-user-bubble">{bubbleText}</div>
        ) : null}

        {submittedPrompt && error ? (
          <p className="chat-error" role="alert">
            {error}
          </p>
        ) : null}

        {lastResult ? (
          <div className="chat-response-row">
            <div
              className={`chat-result glass ${resultTone(action)}`}
              aria-live="polite"
            >
              <p className="chat-result-field transaction-id">
                <span className="chat-result-key">transaction_id</span>
                <span className="chat-result-val">
                  {lastResult.transaction_id == null
                    ? "null"
                    : String(lastResult.transaction_id)}
                </span>
              </p>
              <p className="chat-result-field agent-response">
                <span className="chat-result-key">agent_response</span>
                <pre className="chat-result-val agent-response-val">
                  {prettyAgentResponse(lastResult.agent_response_content)}
                </pre>
              </p>

              {action === "ask_clarification" ? (
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
                    placeholder={
                      voicePhase === "listening" && voiceTarget === "clarify"
                        ? "Listening… pause 3s to finish"
                        : voicePhase === "processing" && voiceTarget === "clarify"
                          ? "Logging from voice…"
                          : "Your reply…"
                    }
                    autoComplete="off"
                    disabled={loading || voiceBusy}
                    onChange={(event) => setClarifyPrompt(event.target.value)}
                  />
                  <button
                    type="button"
                    className={`chat-mic${voicePhase === "listening" && voiceTarget === "clarify" ? " is-listening" : ""}`}
                    disabled={loading || voicePhase === "processing"}
                    aria-label={micLabel}
                    aria-pressed={voicePhase === "listening" && voiceTarget === "clarify"}
                    onClick={() => void runVoiceFlow("clarify")}
                  >
                    <MicIcon active={voicePhase === "listening" && voiceTarget === "clarify"} />
                  </button>
                  <button
                    type="submit"
                    className="chat-clarify-submit"
                    disabled={loading || voiceBusy || !clarifyPrompt.trim()}
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
              <div className="chat-input-wrap">
                <input
                  id={inputId}
                  ref={inputRef}
                  className="chat-input"
                  type="text"
                  value={prompt}
                  placeholder={
                    voicePhase === "listening" && voiceTarget === "main"
                      ? "Listening… pause 3s to finish"
                      : voicePhase === "processing" && voiceTarget === "main"
                        ? "Logging from voice…"
                        : "e.g. lunch on Zomato for 400 via UPI"
                  }
                  autoComplete="off"
                  disabled={loading || voiceBusy}
                  onChange={(event) => setPrompt(event.target.value)}
                />
                <button
                  type="button"
                  className={`chat-mic${voicePhase === "listening" && voiceTarget === "main" ? " is-listening" : ""}`}
                  disabled={loading || voicePhase === "processing"}
                  aria-label={micLabel}
                  aria-pressed={voicePhase === "listening" && voiceTarget === "main"}
                  onClick={() => void runVoiceFlow("main")}
                >
                  <MicIcon active={voicePhase === "listening" && voiceTarget === "main"} />
                </button>
              </div>

              <button
                type="submit"
                className="chat-stamp"
                disabled={loading || voiceBusy || !prompt.trim()}
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
              <kbd>/</kbd> focus · <kbd>Enter</kbd> submit · mic auto-stops after 3s silence
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
