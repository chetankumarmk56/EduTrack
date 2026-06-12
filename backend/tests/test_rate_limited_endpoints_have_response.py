"""
Guard against a production footgun we hit on the teacher batch endpoints.

The limiter is built with ``headers_enabled=True`` (see app/core/limiter.py),
so after a rate-limited handler runs, slowapi injects ``X-RateLimit-*`` headers.
To do that it needs a ``response`` parameter on the endpoint — if one is
missing it raises::

    Exception: parameter `response` must be an instance of
               starlette.responses.Response

…AFTER the handler body has already committed its DB work, surfacing to the
client as a bare 500 even though the write succeeded. This silently broke
``POST /api/marks/batch`` and ``POST /api/attendance/batch`` (and would have
broken ``/auth/change-password``) in production.

This test walks the route source and asserts every ``@limiter.limit`` endpoint
declares a ``response`` parameter, so a new rate-limited route can't ship with
the same gap.
"""
import ast
import os

ROUTES_DIR = os.path.join(os.getcwd(), "app", "api", "routes")


def _is_limiter_limit(decorator: ast.expr) -> bool:
    """True for ``@limiter.limit(...)`` (an attribute call named ``limit``)."""
    if not isinstance(decorator, ast.Call):
        return False
    func = decorator.func
    return isinstance(func, ast.Attribute) and func.attr == "limit"


def _iter_rate_limited_functions():
    for root, _dirs, files in os.walk(ROUTES_DIR):
        for fname in files:
            if not fname.endswith(".py"):
                continue
            path = os.path.join(root, fname)
            with open(path) as fh:
                tree = ast.parse(fh.read(), filename=path)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and any(
                    _is_limiter_limit(d) for d in node.decorator_list
                ):
                    rel = os.path.relpath(path, os.getcwd())
                    yield rel, node


def test_rate_limited_endpoints_declare_response_param():
    offenders = []
    checked = 0
    for rel, func in _iter_rate_limited_functions():
        checked += 1
        param_names = {a.arg for a in func.args.args} | {a.arg for a in func.args.kwonlyargs}
        if "response" not in param_names:
            offenders.append(f"{rel}::{func.name} (line {func.lineno})")

    # Sanity: the crawler must actually be finding the decorated endpoints,
    # otherwise a refactor that moves/renames the decorator would make this
    # test vacuously pass.
    assert checked >= 6, (
        f"Expected to find several @limiter.limit endpoints, found {checked}. "
        "Did the limiter import alias or routes layout change?"
    )

    assert not offenders, (
        "These @limiter.limit endpoints are missing a `response` parameter and "
        "will 500 after their handler runs (headers_enabled=True needs a "
        "Response to attach X-RateLimit-* headers):\n  - "
        + "\n  - ".join(offenders)
    )
