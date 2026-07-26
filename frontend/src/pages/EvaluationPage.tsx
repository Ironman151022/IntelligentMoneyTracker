import { Fragment, useCallback, useEffect, useState } from "react";
import "../styles/evaluation.css";

const PAGE_SIZE = 20;
const COL_COUNT = 9;

type Verdict = "pending" | "ok" | "not_ok";

type AgentContent = {
  action?: string;
  [key: string]: unknown;
};

type EvaluationRow = {
  id: number;
  chat_id: string;
  created_at: string;
  user_prompt: string;
  combined_prompt: string | null;
  agent_response_raw: string | Record<string, unknown> | null;
  agent_response_content: AgentContent | string | null;
  transaction_id: number | null;
  verdict: Verdict;
  notes: string | null;
};

type EvaluationsResponse = {
  items: EvaluationRow[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

function formatCell(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function truncate(text: string, max = 48): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function contentAction(content: EvaluationRow["agent_response_content"]): string | null {
  if (content && typeof content === "object" && typeof content.action === "string") {
    return content.action;
  }
  return null;
}

function prettyWhen(value: string): string {
  // Prefer a short local-ish stamp if SQLite datetime is present.
  return value.length > 16 ? value.slice(0, 16).replace("T", " ") : value;
}

export function EvaluationPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EvaluationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/evaluations/?page=${nextPage}&limit=${PAGE_SIZE}`,
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `Request failed (${res.status})`);
      }
      const json = (await res.json()) as EvaluationsResponse;
      setData(json);
      setPage(json.page);
      setNoteDrafts(
        Object.fromEntries(
          json.items.map((row) => [row.id, row.notes ?? ""]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load evaluations");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const patchEvaluation = useCallback(
    async (
      id: number,
      body: { verdict?: Verdict; notes?: string },
    ) => {
      setUpdatingId(id);
      setError(null);
      try {
        const res = await fetch(`/api/evaluations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.detail || `Update failed (${res.status})`);
        }
        const updated = (await res.json()) as EvaluationRow;
        setData((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((row) =>
                  row.id === id ? { ...row, ...updated } : row,
                ),
              }
            : prev,
        );
        if (body.notes !== undefined) {
          setNoteDrafts((prev) => ({ ...prev, [id]: updated.notes ?? "" }));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update evaluation");
      } finally {
        setUpdatingId(null);
      }
    },
    [],
  );

  const saveNotes = useCallback(
    async (row: EvaluationRow) => {
      const draft = noteDrafts[row.id] ?? "";
      const current = row.notes ?? "";
      if (draft === current) return;
      await patchEvaluation(row.id, { notes: draft });
    },
    [noteDrafts, patchEvaluation],
  );

  const toggleRow = useCallback((id: number) => {
    setExpandedId((cur) => (cur === id ? null : id));
  }, []);

  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <section className="eval" aria-label="Evaluation">
      <header className="eval-header">
        <p className="eval-meta" aria-live="polite">
          {loading && !data
            ? "Loading…"
            : total === 0
              ? "No rows yet"
              : `${from}–${to} of ${total}`}
        </p>
      </header>

      {error ? (
        <p className="eval-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="eval-table-wrap">
        <table className="eval-table">
          <thead>
            <tr>
              <th scope="col">Chat</th>
              <th scope="col">When</th>
              <th scope="col">Prompt</th>
              <th scope="col">Action</th>
              <th scope="col">Combined</th>
              <th scope="col">Txn</th>
              <th scope="col">Notes</th>
              <th scope="col">Verdict</th>
              <th scope="col">Mark</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={COL_COUNT} className="eval-empty">
                  Loading evaluations…
                </td>
              </tr>
            ) : null}

            {!loading && data && data.items.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} className="eval-empty">
                  No evaluations yet. Log something from Chat first.
                </td>
              </tr>
            ) : null}

            {data?.items.map((row) => {
              const open = expandedId === row.id;
              const busy = updatingId === row.id;
              const action = contentAction(row.agent_response_content);
              return (
                <Fragment key={row.id}>
                  <tr
                    className={`eval-summary${open ? " is-open" : ""}`}
                    onClick={() => toggleRow(row.id)}
                  >
                    <td className="eval-mono">{row.chat_id}</td>
                    <td className="eval-muted">{prettyWhen(row.created_at)}</td>
                    <td>
                      <span className="eval-expand" aria-expanded={open}>
                        {truncate(row.user_prompt)}
                      </span>
                    </td>
                    <td className="eval-mono">{action ?? "—"}</td>
                    <td className="eval-mono eval-output">
                      {truncate(row.combined_prompt ?? "—", 36)}
                    </td>
                    <td className="eval-mono">
                      {row.transaction_id ?? "—"}
                    </td>
                    <td
                      className="eval-notes-cell"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <textarea
                        className="eval-notes"
                        rows={1}
                        value={noteDrafts[row.id] ?? ""}
                        placeholder="Note…"
                        disabled={busy}
                        aria-label={`Notes for ${row.chat_id}`}
                        onChange={(event) =>
                          setNoteDrafts((prev) => ({
                            ...prev,
                            [row.id]: event.target.value,
                          }))
                        }
                        onBlur={() => void saveNotes(row)}
                      />
                    </td>
                    <td>
                      <span className={`eval-badge verdict-${row.verdict}`}>
                        {row.verdict}
                      </span>
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="eval-actions">
                        <button
                          type="button"
                          className="eval-btn ok"
                          disabled={busy || row.verdict === "ok"}
                          onClick={() =>
                            void patchEvaluation(row.id, { verdict: "ok" })
                          }
                        >
                          ok
                        </button>
                        <button
                          type="button"
                          className="eval-btn not-ok"
                          disabled={busy || row.verdict === "not_ok"}
                          onClick={() =>
                            void patchEvaluation(row.id, { verdict: "not_ok" })
                          }
                        >
                          not ok
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="eval-detail-row">
                      <td colSpan={COL_COUNT}>
                        <div className="eval-detail">
                          <div>
                            <h3>chat_id</h3>
                            <pre>{row.chat_id}</pre>
                          </div>
                          <div>
                            <h3>created_at</h3>
                            <pre>{row.created_at}</pre>
                          </div>
                          <div>
                            <h3>transaction_id</h3>
                            <pre>
                              {row.transaction_id == null
                                ? "null"
                                : String(row.transaction_id)}
                            </pre>
                          </div>
                          <div>
                            <h3>action</h3>
                            <pre>{action ?? "—"}</pre>
                          </div>
                          <div className="eval-detail-wide">
                            <h3>user_prompt</h3>
                            <pre>{row.user_prompt}</pre>
                          </div>
                          <div className="eval-detail-wide">
                            <h3>combined_prompt</h3>
                            <pre>{row.combined_prompt ?? "—"}</pre>
                          </div>
                          <div className="eval-detail-wide">
                            <h3>agent_response_content</h3>
                            <pre>{formatCell(row.agent_response_content)}</pre>
                          </div>
                          <div className="eval-detail-wide">
                            <h3>agent_response_raw</h3>
                            <pre>{formatCell(row.agent_response_raw)}</pre>
                          </div>
                          <div>
                            <h3>verdict</h3>
                            <pre>{row.verdict}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <nav className="eval-pager" aria-label="Pagination">
        <button
          type="button"
          className="eval-page-btn"
          disabled={loading || page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <span className="eval-page-label">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          className="eval-page-btn"
          disabled={loading || page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </nav>
    </section>
  );
}
