import razorpay

from app.core.config import settings
from .fee_service import FeeServiceMixin
from .order_service import OrderServiceMixin
from .payment_service import PaymentServiceMixin
from .webhook_service import WebhookServiceMixin
from .reporting_service import ReportingServiceMixin
from .ledger_service import LedgerServiceMixin


class FinanceService(
    FeeServiceMixin,
    OrderServiceMixin,
    PaymentServiceMixin,
    WebhookServiceMixin,
    ReportingServiceMixin,
    LedgerServiceMixin,
):
    def __init__(self):
        if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET:
            self.razorpay_client = razorpay.Client(
                auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
            )
        else:
            self.razorpay_client = None


finance_service = FinanceService()
