"""
Create test user
"""
import os
os.environ["DATABASE_URL"] = "postgresql://finlife:finlife_password_change_me@localhost:5432/finlife"

from app.infrastructure.db.session import get_db
from app.infrastructure.db.models import User
from app.auth import hash_password

# Create user
db = next(get_db())

# Check if user exists
existing = db.query(User).filter(User.email == "test@example.com").first()
if existing:
    print(f"User already exists: test@example.com (ID: {existing.id})")
else:
    user = User(
        email="test@example.com",
        password_hash=hash_password("password123")
    )
    db.add(user)
    db.commit()
    print("Created user:")
    print("  Email: test@example.com")
    print("  Password: password123")

db.close()
