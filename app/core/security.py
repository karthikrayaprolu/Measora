import base64
import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
http_bearer = HTTPBearer(auto_error=False)


def decode_token(token: str) -> Optional[str]:
    """
    Decode a Supabase JWT and return the user's UUID (``sub`` claim).

    Supabase signs JWTs with the raw bytes of the base64-decoded JWT secret,
    so we try the base64-decoded key first, then fall back to the raw string.
    Returns ``None`` if the token is invalid, expired, or signature verification
    fails — callers must treat ``None`` as an authentication failure.
    """
    try:
        unverified_header = jwt.get_unverified_header(token)
        token_alg = unverified_header.get("alg", settings.ALGORITHM)

        # Primary path: Supabase signs with raw bytes of the base64-decoded secret.
        try:
            secret_bytes = base64.b64decode(settings.SECRET_KEY)
            payload = jwt.decode(
                token,
                secret_bytes,
                algorithms=[token_alg],
                audience="authenticated",
            )
            logger.debug("JWT verified with base64-decoded key")
            return payload.get("sub")
        except Exception:
            pass

        # Fallback: try the key as a plain string (covers non-base64 secrets).
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[token_alg],
                audience="authenticated",
            )
            logger.debug("JWT verified with string key")
            return payload.get("sub")
        except Exception:
            pass

        # Both paths failed — reject the token.
        logger.warning("JWT signature verification failed for all key formats")
        return None

    except Exception as exc:
        logger.warning("JWT decode error: %s", exc)
        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
) -> str:
    """
    FastAPI dependency — returns the user's Supabase UUID from a valid JWT.
    Raises HTTP 401 if the token is missing or invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = decode_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id


async def get_admin_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
) -> str:
    """
    Admin-only guard — token ``sub`` must equal ``'admin'``.
    Raises HTTP 401 if no token is provided; HTTP 403 if the token is valid
    but does not belong to the admin account.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = decode_token(credentials.credentials)
    if user_id != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user_id
