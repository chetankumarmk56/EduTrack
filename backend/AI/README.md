# `AI/` — Question Bank + Lesson Plan

This package holds **all** backend code for the two AI-powered teacher
tools. The generation logic used to live in two external services
(`Question_bank_microservice/` and the `New folder/` lesson-plan planner);
it now runs **in-process** here. Nothing else in `app/` contains
Question-Bank or Lesson-Plan logic.

## Layout

```
AI/
├── __init__.py            # re-exports question_bank_router, lesson_plan_router
├── config.py              # ai_settings — the single config seam
├── README.md              # this file
├── question_bank/
│   ├── routes.py          # FastAPI routes  (POST /api/question-bank/*)
│   ├── schemas.py         # Pydantic wire contract
│   ├── service.py         # S3 orchestration + "My Files" + generate dispatch
│   ├── legacy_service.py  # classic inline generator (topics+specs) + PDF export
│   ├── generator.py       # in-process AI generation (PDF → questions)
│   ├── llm_provider.py    # OpenAI provider for the legacy inline generator
│   └── storage.py         # S3 / local-disk key-value store (question-bank/ prefix)
└── lesson_plan/
    ├── routes.py          # FastAPI routes  (POST /api/lesson-plan/*)
    ├── schemas.py         # Pydantic wire contract
    ├── service.py         # S3 orchestration + generate dispatch
    ├── generator.py       # in-process AI generation (chapter text → plan)
    └── storage.py         # S3 / local-disk key-value store (lesson-plan/ prefix)
```

## Request flow (unchanged from the client's perspective)

**Save** — `POST /upload` writes the uploaded files + `metadata.json` to
S3 under `{feature}/{school}/{teacher}/{grade}/{subject}/{chapter}/`.

**Generate** —
1. `service.generate()` loads `metadata.json` from S3.
2. It calls the in-process `generator` (default) — or, if a remote URL is
   configured, dispatches over HTTP (see *Microservice mode* below).
3. **Question Bank**: reads the PDF from S3 and sends it to the OpenAI
   *Responses* API; **Lesson Plan**: extracts text from the uploaded files
   (via the shared `app.services.file_parsing`) and sends it to the OpenAI
   *Chat Completions* API.
4. The flat result JSON is written to `output/question_bank.json` /
   `output/lesson_plan.json` in S3 — the same keys the old microservices
   used, so existing data and `GET /output` keep working.
5. Question Bank additionally registers a row in the teacher's *My Files*
   library (best-effort).

The OpenAI SDK calls are synchronous, so the services run them on a worker
thread via `asyncio.to_thread` to keep the event loop free.

## Configuration

All env reads go through [`config.py`](config.py) (`ai_settings`). The
backing values live in `app/core/config.py`:

| Setting | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | Required for generation (both tools). |
| `QUESTION_BANK_OPENAI_MODEL` | `gpt-4o` | Model for the QB generator. |
| `LESSON_PLAN_OPENAI_MODEL` | `gpt-5.5` | Model for the LP generator. |
| `AWS_S3_BUCKET` / `AWS_S3_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | — | S3 storage (falls back to local disk in dev). |
| `QUESTION_BANK_AI_SERVICE_URL` / `LESSON_PLAN_AI_SERVICE_URL` | unset | Optional remote offload — see below. |

## Dependencies on the host app (the seams)

To stay easy to extract, the package touches the monolith in only a few
well-defined places:

- **`AI.config`** — env / settings.
- **`app.core`** — `database` (My Files commit), `dependencies`
  (`require_faculty`, `UserContext`), `logger`.
- **`app.services.file_parsing`** — shared PDF/DOCX/TXT text extraction
  (also used by the teacher file library, so it stays in `app/`).
- **`app.services.uploaded_file`** — the "My Files" library (Question Bank
  registers generated artifacts here).

## Microservice mode (re-extraction)

The package is **integration-friendly now, microservice-ready later**.

To run generation as a standalone service again:

1. Copy `AI/` out into its own repo. Reimplement the four seams above
   (`config.py` becomes its own `pydantic-settings`; provide thin shims or
   copies for `file_parsing`; drop the `uploaded_file` registration or call
   the main app's API for it).
2. Expose `service.generate()` (or the `generator` functions) behind an
   HTTP handler that reads inputs from S3 and writes the output JSON back —
   exactly the contract `_generate_via_http` already speaks.
3. In the **main app**, set `QUESTION_BANK_AI_SERVICE_URL` and/or
   `LESSON_PLAN_AI_SERVICE_URL` to the new service. The orchestration
   services automatically switch from in-process to HTTP dispatch — no
   code change required.

The HTTP request/response contract (`pdf_bucket`/`pdf_key`/`metadata_key`/
`output_bucket` for QB; the metadata envelope + `output_key`/`bucket` for
LP) is preserved in `_generate_via_http`, matching the original
`Question_bank_microservice` and lesson-plan planner.
