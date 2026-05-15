import httpx
import logging
from typing import Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

class CallService:
    def __init__(self):
        self.sid = settings.EXOTEL_SID
        self.api_key = settings.EXOTEL_API_KEY
        self.api_token = settings.EXOTEL_API_TOKEN
        self.from_number = settings.EXOTEL_FROM_NUMBER
        
        # Base URL for Exotel Connect Call API
        self.base_url = f"https://api.exotel.com/v1/Accounts/{self.sid}/Calls/connect.json"

    async def trigger_call(self, to_number: str, message: str) -> bool:
        """
        Triggers an automated voice call via Exotel with Text-to-Speech.
        
        Note: Exotel usually requires a 'Url' parameter that serves XML (TwiML-like) 
        containing the <Say> tag. 
        For this implementation, we assume a flow is configured or use their TTS URL.
        """
        if not self.sid or not self.api_key or not self.api_token:
            logger.warning("CALL_SERVICE: Exotel credentials not configured. Skipping call.")
            return False

        # Exotel expects numbers in E.164 or local format. 
        # We ensure it starts with 0 or +91 for India if not already.
        clean_number = to_number.strip()
        if not clean_number.startswith("+") and len(clean_number) == 10:
            clean_number = f"0{clean_number}"

        # Payload for Exotel API
        # 'Url' should point to an endpoint that returns the TTS XML.
        # Example XML: <Response><Say>Hello Parent, ...</Say></Response>
        # We use a simulated URL here.
        tts_url = f"http://twimlets.com/message?Message%5B0%5D={httpx.utils.quote(message)}"

        payload = {
            "From": self.from_number,
            "To": clean_number,
            "CallerId": self.from_number,
            "Url": tts_url,
            "CallType": "transcription"
        }

        async with httpx.AsyncClient() as client:
            try:
                logger.info(f"CALL_SERVICE: Triggering call to {clean_number}...")
                response = await client.post(
                    self.base_url,
                    auth=(self.api_key, self.api_token),
                    data=payload,
                    timeout=10.0
                )
                
                if response.status_code in [200, 201]:
                    logger.info(f"CALL_SERVICE: Call triggered successfully. SID: {response.json().get('Call', {}).get('Sid')}")
                    return True
                else:
                    logger.error(f"CALL_SERVICE: API Error ({response.status_code}): {response.text}")
                    return False
                    
            except httpx.RequestError as e:
                logger.error(f"CALL_SERVICE: Request failed: {str(e)}")
                return False
            except Exception as e:
                logger.error(f"CALL_SERVICE: Unexpected error: {str(e)}")
                return False

call_service = CallService()
