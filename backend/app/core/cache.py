import json
from typing import Any, Optional
import redis.asyncio as redis
from app.core.config import settings
from app.core.logger import logger

# Global Redis client
redis_client: Optional[redis.Redis] = None

async def init_redis():
    """
    Initialize Redis connection on application startup.
    Ensures that a single robust connection pool is shared.
    """
    global redis_client
    try:
        # We use decode_responses=True to handle strings automatically
        redis_client = redis.from_url(
            settings.REDIS_URL, 
            encoding="utf-8", 
            decode_responses=True,
            socket_timeout=2.0, # Fail fast on connection issues
            socket_connect_timeout=2.0
        )
        await redis_client.ping()
        logger.info("🚀 Redis cache initialized successfully.")
    except Exception as e:
        logger.warning(f"⚠️ Redis initialization failed: {e}. Falling back to database-only mode.")
        redis_client = None

async def get_cache(key: str) -> Optional[Any]:
    """
    Retrieve data from cache. Returns None on cache miss or error.
    """
    if not redis_client:
        return None
    try:
        data = await redis_client.get(key)
        if data:
            return json.loads(data)
    except Exception as e:
        logger.error(f"❌ Cache GET error for key '{key}': {e}")
    return None

async def set_cache(key: str, value: Any, ttl: int = 300) -> bool:
    """
    Store data in cache with a TTL (default 5 minutes).
    Serializes data to JSON.
    """
    if not redis_client:
        return False
    try:
        await redis_client.setex(key, ttl, json.dumps(value))
        return True
    except Exception as e:
        logger.error(f"❌ Cache SET error for key '{key}': {e}")
        return False

async def delete_cache(key: str) -> bool:
    """
    Invalidate a specific cache key.
    """
    if not redis_client:
        return False
    try:
        await redis_client.delete(key)
        return True
    except Exception as e:
        logger.error(f"❌ Cache DELETE error for key '{key}': {e}")
        return False

async def delete_cache_pattern(pattern: str) -> bool:
    """
    Invalidate multiple keys matching a pattern (e.g., 'students_list:*').
    Note: KEYS is O(N), but acceptable for small-to-medium datasets.
    """
    if not redis_client:
        return False
    try:
        keys = await redis_client.keys(pattern)
        if keys:
            await redis_client.delete(*keys)
        return True
    except Exception as e:
        logger.error(f"❌ Cache INVALIDATE PATTERN '{pattern}' error: {e}")
        return False
