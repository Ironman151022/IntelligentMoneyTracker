# Intelligent Money Tracker — Development Plan

> Living document. Two phases: **Prototype** (Python, prove the brains) → **Develop** (React Native, ship on-device).
> Golden rule: **use Gemma 3n E2B only** in both prototype and mobile builds so behaviour transfers.

---

## 1. Vision & Principles

| Principle | Meaning |
|---|---|
| Privacy-first | On-device inference only. No cloud LLM calls. |
| Cross-platform | One codebase (React Native) for iOS + Android. |
| Offline-first | Core flows work with no network. |
| Same-model rule | Prototype on Gemma 3n E2B (via Ollama) = ship Gemma 3n E2B on device. No alternative LLMs. |
| Time policy | Never extract, infer, or ask for a date or time. The app records its own capture time. |
| Portable contract | Prompts, schemas, tools, DB schema transfer 1:1; runtime/serving does not. |

---

## 2. Features & Workflows

| ID | Feature | Description | Phase |
|----|---------|-------------|-------|
| W1 | Activation | Launch via settings or user-attached gesture/shortcut | Now |
| F1 | Voice input | Speak → LLM parses → store transaction in graph+DB | Now |
| F2 | Photo upload | Receipts/bills → OCR → LLM extract line items | Next |
| F3 | Auto payment detection | Trigger AI when a payment is detected | Next (Android-first) |

> **Now = Prototype + Phase 1 build. Next = later terms.**

---

## 3. Tech Stack

| Layer | Prototype (Python) | Mobile (React Native) |
|---|---|---|
| LLM model | **Gemma 3n E2B only** | **Gemma 3n E2B only** |
| LLM runtime | Ollama (dev only) | MediaPipe LLM Inference *or* `llama.rn` (GGUF) |
| Orchestration | Thin custom loop (avoid heavy LangChain) | Custom TS loop |
| Structured output | JSON schema | GBNF grammar / MediaPipe function calling |
| Voice → text | N/A (typed input) | `@react-native-voice/voice` or `whisper.rn` |
| Database | **SQLite** (not Postgres) | `op-sqlite` (same schema) |
| Graph | `nodes` + `edges` tables | same |
| UI | Optional: FastAPI + React web demo | React Native + Expo (dev build) + TypeScript |
| State | — | Zustand / React Query |

---

## 4. Prototyping Phase (Python)

**Goal:** prove F1 (voice→transaction) orchestration + graph writes on the real target model.

| Step | Task | Deliverable |
|---|---|---|
| P1 | Set up Ollama + Gemma 3n E2B | Model responding locally |
| P2 | Define SQLite schema (transactions + nodes/edges) | `schema.sql` |
| P3 | Author system prompt + JSON output schema | `prompt.txt`, `schema.json`; excludes user-provided dates/times |
| P4 | Define F1 tools (create_transaction, upsert_merchant, link_edge, query) | `tools.py` w/ clear I/O |
| P5 | Build thin orchestration loop | `agent.py` |
| P6 | Build eval set (20–30 utterances → expected JSON) | `evals.jsonl` |
| P7 | (Optional) FastAPI + React web demo | clickable end-to-end demo |

**Guardrails**
| Do | Don't |
|---|---|
| Use SQLite | Use Postgres |
| Keep prompt/schema/tools in plain files | Bury logic in framework internals |
| Force structured JSON output | Rely on model "just knowing" tool calls |
| Test on Gemma 3n E2B only | Prototype on another model |

---

## 5. Developing Phase (React Native)

**Build order — de-risk hardest first.**

| Step | Task | Notes |
|---|---|---|
| D1 | Expo dev-build scaffold (TS) | prebuild for native modules |
| D2 | Port SQLite schema → `op-sqlite` | copy from prototype |
| D3 | Manual "add transaction" screen | proves DB/graph without AI |
| D4 | On-device Gemma module (text → JSON) | **make-or-break**: test speed/RAM on real mid-range phone |
| D5 | Voice input → Gemma module → save | port prompt/schema/loop |
| D6 | Activation (App Intent + QS tile/shortcut) | native module |
| D7 | Transaction list / summary view | — |

---

## 6. Portability Matrix

| Transfers 1:1 ✅ | Rewrite / swap 🔁 | New mobile work 🆕 |
|---|---|---|
| System prompts | Orchestration loop (Py → TS) | Voice input |
| JSON schema / grammar | Runtime (Ollama → MediaPipe/`llama.rn`) | Activation intents |
| Tool definitions & I/O | — | Native Gemma module wiring |
| SQLite schema | — | — |
| Eval set | — | — |

> Estimated: ~70% copy/translate, ~30% new mobile work.

---

## 7. Activation Reality (platform limits)

| Method | iOS | Android |
|---|---|---|
| App Intent + Shortcuts | ✅ | ✅ (App Actions) |
| Back Tap (2/3 tap back) | ✅ user-attached | — |
| Action Button | ✅ (15 Pro+) | — |
| Quick Settings tile | — | ✅ |
| App icon long-press shortcut | ✅ | ✅ |
| Siri / Assistant voice | ✅ | ✅ |
| **Volume-button long-press** | ❌ not allowed (public API) | ⚠️ via accessibility only |

> App exposes entry points; **user attaches the gesture** in system settings. Update README's "volume button" claim accordingly.

---

## 8. Data Architecture

```
Voice/Text → LLM (structured extract) → { transactions table  ⇌  nodes/edges graph }
```

| Table | Purpose |
|---|---|
| `transactions` | normalized records (amount, merchant, category, currency, system-generated `recorded_at`) |
| `nodes` | entities (Transaction, Merchant, Category) |
| `edges` | relations e.g. `(Txn)-[AT]->(Merchant)`, `(Merchant)-[IN]->(Category)` |

> DB + graph written in one transaction to stay in sync. Phase 3+: add `sqlite-vec` for semantic search.

---

## 9. Tool Calling on Small Models

| Guideline | Why |
|---|---|
| F1 = single constrained extraction call | Faster + more reliable than a full agent loop |
| Reserve multi-tool loop for queries | e.g. "spend on food last week?" |
| Keep tools few, flat, well-described | Small models fail on long tool chains |
| Enforce output with grammar/schema | Guarantees valid JSON |

---

## 10. Open Decisions & Risks

| Item | Status | Note |
|---|---|---|
| iOS runtime: MediaPipe vs `llama.rn` | Open | must run Gemma 3n E2B; Apple Foundation Models are out of scope |
| Min device specs for Gemma 3n E2B | Validate in D4 | shapes UX (streaming vs spinner) |
| F3 on iOS | Constrained | can't read other apps' notifications; Android-first |
| README "volume button" | To fix | replace with Back Tap / Action Button / QS tile |
| Prototype UI: notebook vs FastAPI+web | Open | notebook faster; web = demo |

---

## 11. Milestones

- [ ] **M0 Prototype:** Gemma 3n E2B parses utterance → valid transaction JSON without a user-provided timestamp → SQLite graph (eval set passes)
- [ ] **M1 Skeleton:** RN app + SQLite + manual entry
- [ ] **M2 On-device AI:** text → JSON on a real phone (speed/RAM validated)
- [ ] **M3 Voice E2E:** speak → transaction saved
- [ ] **M4 Activation:** user attaches a gesture/shortcut
- [ ] **M5 Phase 1 done:** W1 + F1 shippable
- [ ] **M6+ Next term:** F2 (photo/OCR), F3 (payment detection, Android-first)
