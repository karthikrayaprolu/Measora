"""
JWT verification for Supabase-issued tokens.

Supabase now issues ES256 (ECDSA P-256) tokens by default instead of
HS256 (HMAC-SHA256). This module handles both:

  1. ES256  — verified against Supabase's JWKS public key endpoint (primary).
  2. HS256  — verified against the base64-decoded (or raw) SECRET_KEY (legacy
              fallback for older Supabase projects or custom tokens).
"""
import base64
import logging
import threading
import time
import urllib.request
import json
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from jose.backends import ECKey
from passlib.context import CryptContext

from app.core.config import settings

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
http_bearer = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# JWKS cache — fetched from Supabase once, refreshed every hour.
# ---------------------------------------------------------------------------
_jwks_cache: dict = {}          # kid -> public key bytes (PEM)
_jwks_fetched_at: float = 0.0
_jwks_lock = threading.Lock()
_JWKS_TTL = 3600               # seconds


def _fetch_jwks() -> dict:
    """Fetch and parse Supabase JWKS; returns {kid: pem_key_bytes}."""
    jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    try:
        with urllib.request.urlopen(jwks_url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
        keys = {}
        for jwk in data.get("keys", []):
            kid = jwk.get("kid")
            if kid:
                keys[kid] = jwk
        logger.info(f"JWKS loaded: {list(keys.keys())}")
        return keys
    except Exception as e:
        logger.error(f"Failed to fetch JWKS from {jwks_url}: {e}")
        return {}


def _get_jwks() -> dict:
    """Return cached JWKS, refreshing if older than TTL."""
    global _jwks_cache, _jwks_fetched_at
    with _jwks_lock:
        if time.time() - _jwks_fetched_at > _JWKS_TTL or not _jwks_cache:
            _jwks_cache = _fetch_jwks()
            _jwks_fetched_at = time.time()
    return _jwks_cache


def _verify_es256(token: str, jwks: dict) -> Optional[str]:
    """Verify an ES256 token using the JWKS public key matching the token's kid."""
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid or kid not in jwks:
            logger.debug(f"ES256 verify: kid '{kid}' not found in JWKS {list(jwks.keys())}")
            return None

        jwk = jwks[kid]
        # Build the public key object from the JWK dict
        ec_key = ECKey(jwk, algorithm="ES256")
        public_key = ec_key.public_key()

        payload = jwt.decode(
            token,
            public_key,
            algorithms=["ES256"],
            options={"verify_aud": False},
        )
        logger.debug("JWT verified with ES256 JWKS key")
        return payload.get("sub")
    except Exception as e:
        logger.debug(f"ES256 verification failed: {e}")
        return None


def _verify_hs256(token: str) -> Optional[str]:
    """
    Verify a HS256 token using the shared SECRET_KEY.
    Tries base64-decoded bytes first, then the raw string.
    """
    try:
        # Primary: base64-decoded bytes (standard Supabase legacy format)
        try:
            secret_bytes = base64.b64decode(settings.SECRET_KEY)
            payload = jwt.decode(
                token,
                secret_bytes,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            logger.debug("JWT verified with HS256 (base64-decoded key)")
            return payload.get("sub")
        except Exception as e:
            logger.debug(f"HS256 base64 path failed: {e}")

        # Fallback: raw string secret
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            logger.debug("JWT verified with HS256 (string key)")
            return payload.get("sub")
        except Exception as e:
            logger.debug(f"HS256 string path failed: {e}")

        return None
    except Exception as e:
        logger.debug(f"HS256 verification error: {e}")
        return None


def decode_token(token: str) -> Optional[str]:
    """
    Decode a Supabase JWT and return the user's UUID (``sub`` claim).

    Tries ES256 (JWKS) first since that is the current Supabase default.
    Falls back to HS256 (shared secret) for legacy/custom tokens.
    Returns ``None`` if the token is invalid, expired, or unrecognised.
    """
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "")
    except Exception as e:
        logger.warning(f"JWT parse error (bad token format): {e}")
        return None

    logger.debug(f"Token alg={alg}, kid={header.get('kid')}")

    # ── ES256 path (Supabase ≥ 2025) ────────────────────────────────────
    if alg == "ES256":
        jwks = _get_jwks()
        user_id = _verify_es256(token, jwks)
        if user_id:
            return user_id

        # JWKS may be stale — force refresh once and retry
        logger.info("ES256 verify failed with cached JWKS, forcing refresh...")
        global _jwks_fetched_at
        with _jwks_lock:
            _jwks_fetched_at = 0.0
        jwks = _get_jwks()
        user_id = _verify_es256(token, jwks)
        if user_id:
            return user_id

        logger.warning("JWT signature verification failed: ES256 key not found or invalid")
        return None

    # ── HS256 path (legacy Supabase / custom tokens) ─────────────────────
    user_id = _verify_hs256(token)
    if user_id:
        return user_id

    logger.warning(f"JWT signature verification failed for all key formats (alg={alg})")
    return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
) -> str:
    """
    FastAPI dependency — returns the user's Supabase UUID from a valid JWT.
    Raises HTTP 401 if the token is missing or invalid.
    """
    if credentials is None:
        logger.warning("Auth rejected: No Authorization header was sent by the client")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Log token prefix to diagnose format issues (safe — only first 20 chars)
    token_preview = credentials.credentials[:20] if credentials.credentials else "(empty)"
    logger.info(f"Verifying token starting with: {token_preview}...")

    user_id = decode_token(credentials.credentials)
    if user_id is None:
        logger.warning(f"Auth rejected: token verification failed (token prefix: {token_preview}...)")
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
    Admin-only guard — token ``sub`` must equal ``'admin'``\u200b.
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
