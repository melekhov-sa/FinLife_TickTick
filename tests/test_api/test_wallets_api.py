"""
Tests for Wallets API endpoints
"""
import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
from app.main import app
from app.infrastructure.db.models import WalletBalance


@pytest.fixture
def client():
    """Test client для FastAPI"""
    return TestClient(app)


@pytest.fixture
def mock_session():
    """Mock database session для API тестов"""
    with patch("app.api.deps.get_db") as mock_get_db:
        session = Mock()
        mock_get_db.return_value = iter([session])
        yield session


@pytest.fixture
def authenticated_client(client):
    """Client с авторизованной сессией"""
    with client.session_transaction() as session:
        session["user_id"] = 1
    return client


def test_create_wallet_api_with_wallet_type(client, mock_session):
    """API создания кошелька с типом"""
    # Mock user
    mock_user = Mock()
    mock_user.id = 1
    mock_session.query.return_value.filter.return_value.first.return_value = mock_user

    # Mock wallet result
    mock_wallet = Mock(spec=WalletBalance)
    mock_wallet.wallet_id = 100
    mock_wallet.title = "Кредитка"
    mock_wallet.currency = "RUB"
    mock_wallet.wallet_type = "CREDIT"
    mock_wallet.balance = Decimal("-5000")
    mock_wallet.is_archived = False

    with patch("app.application.wallets.CreateWalletUseCase") as mock_use_case:
        mock_use_case.return_value.execute.return_value = 100
        mock_session.query.return_value.filter.return_value.first.side_effect = [
            mock_user,
            mock_wallet
        ]

        # Создать кошелек через API
        response = client.post(
            "/api/v1/wallets/",
            json={
                "title": "Кредитка",
                "currency": "RUB",
                "wallet_type": "CREDIT",
                "initial_balance": "-5000"
            },
            cookies={"session": "test_session"}
        )

        # Проверить ответ
        assert response.status_code == 200
        data = response.json()
        assert data["wallet_id"] == 100
        assert data["wallet_type"] == "CREDIT"
        assert data["balance"] == "-5000"


def test_create_wallet_api_default_values(client, mock_session):
    """API создания кошелька с дефолтными значениями"""
    mock_user = Mock()
    mock_user.id = 1
    mock_session.query.return_value.filter.return_value.first.return_value = mock_user

    mock_wallet = Mock(spec=WalletBalance)
    mock_wallet.wallet_id = 101
    mock_wallet.title = "Наличные"
    mock_wallet.currency = "RUB"
    mock_wallet.wallet_type = "REGULAR"
    mock_wallet.balance = Decimal("0")
    mock_wallet.is_archived = False

    with patch("app.application.wallets.CreateWalletUseCase") as mock_use_case:
        mock_use_case.return_value.execute.return_value = 101
        mock_session.query.return_value.filter.return_value.first.side_effect = [
            mock_user,
            mock_wallet
        ]

        response = client.post(
            "/api/v1/wallets/",
            json={
                "title": "Наличные",
                "currency": "RUB"
            },
            cookies={"session": "test_session"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["wallet_type"] == "REGULAR"
        assert data["balance"] == "0"


def test_list_wallets_api_includes_wallet_type(client, mock_session):
    """API списка кошельков включает wallet_type"""
    mock_user = Mock()
    mock_user.id = 1

    mock_wallets = [
        Mock(
            wallet_id=100,
            title="Обычный",
            currency="RUB",
            wallet_type="REGULAR",
            balance=Decimal("1000"),
            is_archived=False
        ),
        Mock(
            wallet_id=101,
            title="Кредит",
            currency="RUB",
            wallet_type="CREDIT",
            balance=Decimal("-5000"),
            is_archived=False
        )
    ]

    mock_session.query.return_value.filter.return_value.first.return_value = mock_user
    mock_session.query.return_value.filter.return_value.filter.return_value.all.return_value = mock_wallets

    response = client.get(
        "/api/v1/wallets/",
        cookies={"session": "test_session"}
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["wallet_type"] == "REGULAR"
    assert data[1]["wallet_type"] == "CREDIT"
