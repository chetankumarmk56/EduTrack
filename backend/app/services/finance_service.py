# Backward-compatible shim — the implementation now lives in the finance/ sub-package.
# Routes and tasks import from this file and continue to work unchanged.
from app.services.finance import FinanceService, finance_service

__all__ = ["FinanceService", "finance_service"]
