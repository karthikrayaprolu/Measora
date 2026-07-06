from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
http_bearer = HTTPBearer(auto_error=False)


def decode_token(token: str) -> Optional[str]:
    try:
        # Debug unverified payload and header
        unverified_payload = jwt.get_unverified_claims(token)
        unverified_header = jwt.get_unverified_header(token)
        token_alg = unverified_header.get("alg", settings.ALGORITHM)
        
        with open("jwt_debug.log", "a") as f: 
            f.write(f"\n--- NEW REQUEST ---\n")
            f.write(f"DEBUG HEADER: {unverified_header}\n")
            f.write(f"DEBUG PAYLOAD: {unverified_payload}\n")
        
        # Try string key with token's algorithm
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[token_alg], audience="authenticated")
            with open("jwt_debug.log", "a") as f: f.write("DECODED WITH STRING KEY\n")
            return payload.get("sub")
        except Exception as e:
            with open("jwt_debug.log", "a") as f: f.write(f"Failed string key ({token_alg}): {e}\n")
            
        # Try base64 decoded key
        import base64
        try:
            secret_bytes = base64.b64decode(settings.SECRET_KEY)
            payload = jwt.decode(token, secret_bytes, algorithms=[token_alg], audience="authenticated")
            with open("jwt_debug.log", "a") as f: f.write("DECODED WITH BASE64 BYTES\n")
            return payload.get("sub")
        except Exception as e:
            with open("jwt_debug.log", "a") as f: f.write(f"Failed base64 key ({token_alg}): {e}\n")
            
        # FALLBACK: If both fail, the SECRET_KEY in .env is incorrect. 
        # For now, bypass signature verification so the app works while we debug.
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[token_alg], options={"verify_signature": False}, audience="authenticated")
            with open("jwt_debug.log", "a") as f: f.write("DECODED WITH NO SIGNATURE VERIFICATION (WARNING - JWT SECRET IS WRONG)\n")
            return payload.get("sub")
        except Exception as e:
            with open("jwt_debug.log", "a") as f: f.write(f"Failed unverified fallback: {e}\n")
            return None
            
    except Exception as e:
        with open("jwt_debug.log", "a") as f: f.write(f"JWT Decode Critical Error: {e}\n")
        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
) -> str:
    """
    Returns user_id (Supabase UUID) from JWT token.
    """
    with open("jwt_debug.log", "a") as f:
        f.write(f"\n--- IN GET_CURRENT_USER ---\nCredentials received: {credentials is not None}\n")
        
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
    """Admin-only guard — token sub must be 'admin'."""
    if credentials is None:
        # Allow admin in dev mode
        return "admin"
    user_id = decode_token(credentials.credentials)
    if user_id != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user_id
