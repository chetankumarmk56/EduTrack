"""Isolated OpenAI provider for the Question Bank Generator.

The rest of the backend talks to this module only — swapping providers later
(Anthropic, Gemini, local model) means writing a sibling file with the same
``generate_question_bank`` signature. Nothing else imports ``openai``.
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List

from app.core.config import settings
from app.core.logger import logger


class OpenAIProvider:
    """Thin async wrapper around OpenAI's JSON-mode chat completions."""

    def __init__(self) -> None:
        self._client = None
        self.model = settings.OPENAI_MODEL

    @property
    def is_configured(self) -> bool:
        return bool(settings.OPENAI_API_KEY)

    def _get_client(self):
        if self._client is not None:
            return self._client
        if not self.is_configured:
            raise RuntimeError(
                "OPENAI_API_KEY is not configured. Set it in backend/.env."
            )
        # Imported lazily so the rest of the app boots even if the package is missing.
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=60.0)
        return self._client

    async def generate_question_bank(
        self,
        *,
        topics: str,
        content: str,
        subject: str,
        specs: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Call OpenAI once and return parsed JSON: ``{"questions": [...]}``.

        Raises ``RuntimeError`` for misconfiguration, ``ValueError`` for malformed
        model output. Callers (the service layer) validate individual questions.
        """
        client = self._get_client()
        system_prompt = _build_system_prompt()
        user_prompt = _build_user_prompt(
            topics=topics, content=content, subject=subject, specs=specs
        )

        started = time.perf_counter()
        try:
            response = await client.chat.completions.create(
                model=self.model,
                temperature=0.4,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
        except Exception as exc:  # noqa: BLE001 — surface upstream for HTTP mapping
            logger.error("OpenAI call failed: %s", exc)
            raise

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        raw = response.choices[0].message.content or "{}"
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.error("OpenAI returned non-JSON content: %s", raw[:500])
            raise ValueError("Model did not return valid JSON.") from exc

        questions = data.get("questions")
        if not isinstance(questions, list):
            raise ValueError("Model response missing 'questions' array.")

        return {
            "questions": questions,
            "metadata": {
                "model": self.model,
                "latency_ms": elapsed_ms,
                "prompt_tokens": getattr(response.usage, "prompt_tokens", None),
                "completion_tokens": getattr(response.usage, "completion_tokens", None),
            },
        }


def _build_system_prompt() -> str:
    return (
        "You are an expert school assessment author. Generate exam-ready questions "
        "that test understanding, not just recall. Return STRICT JSON only.\n\n"
        "Schema you must produce:\n"
        '{ "questions": [ {\n'
        '  "type": "mcq" | "short" | "long",\n'
        '  "difficulty": "Easy" | "Medium" | "Hard",\n'
        '  "marks": integer (1-2 for mcq, 2-4 for short, 5-10 for long),\n'
        '  "question": string,\n'
        '  "options": [string, string, string, string]  (REQUIRED for mcq, omit/null otherwise),\n'
        '  "answer": string  (for mcq this MUST be one of the options verbatim),\n'
        '  "explanation": string\n'
        "} ] }\n\n"
        "Rules:\n"
        "- Honor the exact (type, difficulty, count) buckets requested.\n"
        "- MCQ: exactly 4 plausible, mutually exclusive options.\n"
        "- Short: 1-3 sentence questions with concise model answers.\n"
        "- Long: open-ended, multi-part-friendly with thorough model answers.\n"
        "- Difficulty must be one of Easy/Medium/Hard (capitalized).\n"
        "- Do not include markdown, prose, or commentary outside the JSON.\n"
    )


def _build_user_prompt(
    *, topics: str, content: str, subject: str, specs: List[Dict[str, Any]]
) -> str:
    spec_lines = "\n".join(
        f"- {s['count']} × {s['type'].upper()} ({s['difficulty']})"
        for s in specs
        if s.get("count", 0) > 0
    )
    # Clip very long content; the model can still ground answers on it.
    clipped = content.strip()
    if len(clipped) > 12_000:
        clipped = clipped[:12_000] + "\n…[truncated]"

    sections = [
        f"Subject: {subject}",
        f"Topics: {topics}",
        "",
        "Requested buckets:",
        spec_lines or "(none)",
    ]
    if clipped:
        sections += ["", "Source content (use as the primary reference):", clipped]
    sections += [
        "",
        "Return ONLY the JSON object described in the system prompt.",
    ]
    return "\n".join(sections)


openai_provider = OpenAIProvider()
