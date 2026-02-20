from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.infrastructure.db.models import User

# pbkdf2_sha256 — primary (no native deps, works on Windows)
# bcrypt — legacy support for existing hashes created on the server
pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated=["bcrypt"])

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)

def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()
