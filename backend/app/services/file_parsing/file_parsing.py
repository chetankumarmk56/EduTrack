"""Shared plain-text extraction for uploaded files.

Used by the Question Bank generator, the Lesson Plan parser, and the teacher
file library. Single source of truth for which formats we understand and how
they're decoded.
"""
from __future__ import annotations

import io
from typing import List

from app.core.logger import logger

SUPPORTED_SUFFIXES = {"pdf", "docx", "txt", "md"}


def suffix_of(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def extract_text(filename: str, data: bytes) -> str:
    """Extract plain text from a file's bytes, dispatching on extension.

    Raises ``ValueError`` for unsupported types or empty output.
    """
    if not data:
        raise ValueError("File is empty.")
    suffix = suffix_of(filename)
    if suffix == "pdf":
        text = parse_pdf(data)
    elif suffix == "docx":
        text = parse_docx(data)
    elif suffix in {"txt", "md"}:
        text = parse_text(data)
    else:
        raise ValueError(
            f"Unsupported file type '.{suffix}'. Allowed: pdf, docx, txt, md."
        )
    text = text.strip()
    if not text:
        raise ValueError("Could not extract any text from the file.")
    return text


def parse_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    chunks: List[str] = []
    for page in reader.pages:
        try:
            chunks.append(page.extract_text() or "")
        except Exception as exc:  # noqa: BLE001
            logger.warning("PDF page extraction error: %s", exc)
    return "\n".join(chunks)


def parse_docx(data: bytes) -> str:
    try:
        import docx  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise ValueError(
            "python-docx is not installed on the server; cannot parse .docx."
        ) from exc

    document = docx.Document(io.BytesIO(data))
    return "\n".join(p.text for p in document.paragraphs)


def parse_text(data: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="ignore")
