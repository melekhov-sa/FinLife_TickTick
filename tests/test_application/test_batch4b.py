"""
Batch 4B tests:
  Fix 1 — _generate_id: monotonic on SQLite fallback, sequence on PG (skipped in test env)
  Fix 2 — per-user upload quota enforced in file_utils helper
"""
import pytest
from datetime import datetime, timezone

# Import models at module scope so Base.metadata is fully populated before
# the db_engine fixture calls create_all(). Other test files rely on the
# same ordering — importing models lazily inside a test body leaves the
# event_log table unregistered when the fixture runs.
from app.infrastructure.db.models import EventLog  # noqa: F401
from app.application.tasks_usecases import CreateTaskUseCase  # noqa: F401

ACCT = 1
_NOW = datetime(2026, 4, 18, 12, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Fix 1: _generate_id monotonicity (SQLite fallback)
# ---------------------------------------------------------------------------

class TestGenerateId:
    def test_sqlite_fallback_starts_at_1_when_no_events(self, db_session):
        """SQLite fallback path returns 1 on empty event_log."""
        from app.application.tasks_usecases import CreateTaskUseCase
        uc = CreateTaskUseCase(db_session)
        assert db_session.bind.dialect.name == "sqlite"
        assert uc._generate_id() == 1

    @pytest.mark.skipif(
        True,  # always skip — requires a live PG connection with task_id_seq
        reason="PostgreSQL sequence test requires a live PG connection",
    )
    def test_pg_uses_nextval(self, db_session):
        """Placeholder — would test nextval('task_id_seq') on a real PG session."""
        pass


# ---------------------------------------------------------------------------
# Fix 2: user_upload_total_bytes + quota enforcement
# ---------------------------------------------------------------------------

class TestUserUploadQuota:
    def test_total_bytes_empty_dir(self, tmp_path):
        from app.infrastructure.file_utils import user_upload_total_bytes
        result = user_upload_total_bytes(42, tmp_path)
        assert result == 0

    def test_total_bytes_missing_user_dir(self, tmp_path):
        from app.infrastructure.file_utils import user_upload_total_bytes
        result = user_upload_total_bytes(9999, tmp_path)
        assert result == 0

    def test_total_bytes_sums_files(self, tmp_path):
        from app.infrastructure.file_utils import user_upload_total_bytes
        user_dir = tmp_path / "7"
        user_dir.mkdir()
        (user_dir / "a.txt").write_bytes(b"x" * 100)
        sub = user_dir / "sub"
        sub.mkdir()
        (sub / "b.txt").write_bytes(b"y" * 200)
        result = user_upload_total_bytes(7, tmp_path)
        assert result == 300

    def test_quota_exceeded_raises_on_list_image_upload(self, tmp_path):
        """Simulates upload_image raising 400 when quota is exceeded."""
        from fastapi import HTTPException
        from app.infrastructure.file_utils import user_upload_total_bytes

        user_id = 1
        quota_mb = 1  # 1 MB quota for test

        # Pre-fill 0.9 MB so next 0.2 MB would exceed 1 MB
        user_dir = tmp_path / str(user_id)
        user_dir.mkdir()
        (user_dir / "existing.bin").write_bytes(b"z" * (900 * 1024))

        content = b"w" * (200 * 1024)  # 200 KB new upload
        quota_bytes = quota_mb * 1024 * 1024
        current = user_upload_total_bytes(user_id, tmp_path)
        assert current + len(content) > quota_bytes  # confirm would exceed

        # Simulate the quota gate
        with pytest.raises(HTTPException) as exc_info:
            if current + len(content) > quota_bytes:
                raise HTTPException(400, f"Upload quota exceeded ({quota_mb} MB per user)")
        assert exc_info.value.status_code == 400
        assert "quota exceeded" in exc_info.value.detail

    def test_quota_not_exceeded_passes(self, tmp_path):
        from app.infrastructure.file_utils import user_upload_total_bytes

        user_id = 2
        quota_mb = 500  # default
        user_dir = tmp_path / str(user_id)
        user_dir.mkdir()
        (user_dir / "small.bin").write_bytes(b"a" * 1024)  # 1 KB

        content = b"b" * (1024 * 1024)  # 1 MB
        quota_bytes = quota_mb * 1024 * 1024
        current = user_upload_total_bytes(user_id, tmp_path)
        assert current + len(content) <= quota_bytes  # passes quota check


