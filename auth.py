"""
Authentication & Authorization Module for Nihongo Sensei
Provides password hashing (bcrypt), JWT creation & verification (PyJWT),
Google OAuth ID token verification, and role-based access checks.
"""
import os
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Tuple
import jwt
import bcrypt

# Ensure environment is loaded from root .env without requiring external dotenv package
ROOT_ENV = Path(__file__).resolve().parent / ".env"
if ROOT_ENV.exists():
    with open(ROOT_ENV, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 7

def get_jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET", "").strip()
    if not secret:
        # Fallback secret for development if not explicitly configured
        secret = "72975169279763e0a06c9a2f6d2fec9d6c6381609af10a15eade73b0e8b90bf6"
    return secret

def hash_password(password: str) -> str:
    """Hashes a plain-text password using bcrypt."""
    if not password:
        raise ValueError("Password cannot be empty.")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(password: str, password_hash: str) -> bool:
    """Verifies a plain-text password against a bcrypt hash."""
    if not password or not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_dict: Dict[str, Any]) -> str:
    """Generates a signed HS256 JWT access token valid for 7 days."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_dict.get("id")),
        "email": user_dict.get("email"),
        "role": user_dict.get("role", "student"),
        "name": user_dict.get("name", ""),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_EXPIRY_DAYS)).timestamp()),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT token; returns the payload dict or None if invalid/expired."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

def verify_google_token(id_token_str: str) -> Optional[Dict[str, Any]]:
    """
    Verifies a Google ID token credential using google-auth.
    Returns the decoded token claims (email, name, picture) or None if verification fails.
    """
    if not id_token_str or not id_token_str.strip():
        return None

    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests
        request = google_requests.Request()
        # Verify with client_id if available, otherwise verify token signatures
        claims = id_token.verify_oauth2_token(
            id_token_str.strip(),
            request,
            audience=client_id if client_id else None
        )
        return claims
    except Exception as e:
        print(f"⚠️ Google ID Token verification failed: {e}")
        return None

def extract_bearer_token(auth_header: Optional[str]) -> Optional[str]:
    """Extracts raw JWT from 'Authorization: Bearer <token>' header."""
    if not auth_header:
        return None
    parts = auth_header.strip().split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None

def get_current_user_from_header(auth_header: Optional[str]) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Reads the Authorization header, validates the JWT, and loads the user from SQLite.
    Returns (user_dict, None) on success, or (None, error_message) on failure (401).
    """
    token = extract_bearer_token(auth_header)
    if not token:
        return None, "Missing or malformed Authorization header (expected 'Bearer <token>')."

    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        return None, "Invalid or expired access token. Please sign in again."

    from db.database import get_user_by_id
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        return None, "Malformed user ID in token."

    user = get_user_by_id(user_id)
    if not user:
        return None, "User account no longer exists."

    return user, None

def require_admin_role(user: Optional[Dict[str, Any]]) -> Tuple[bool, Optional[str]]:
    """
    Checks if the user has role === 'admin'.
    Returns (True, None) if authorized, or (False, error_message) if forbidden (403).
    """
    if not user:
        return False, "Authentication required."
    if user.get("role") != "admin":
        return False, "Access forbidden: Sensei Admin role required."
    return True, None
