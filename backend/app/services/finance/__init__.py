from .fee_service import FeeServiceMixin
from .payment_service import PaymentServiceMixin
from .reporting_service import ReportingServiceMixin
from .ledger_service import LedgerServiceMixin


class FinanceService(
    FeeServiceMixin,
    PaymentServiceMixin,
    ReportingServiceMixin,
    LedgerServiceMixin,
):
    pass


finance_service = FinanceService()
