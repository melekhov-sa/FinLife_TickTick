"""
GoalWalletBalancesProjector - builds goal_wallet_balances read model from events

Tracks how much money each goal has in each wallet.
"""
from decimal import Decimal

from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import GoalWalletBalance, GoalInfo, EventLog, WalletBalance


class GoalWalletBalancesProjector(BaseProjector):
    """
    Builds goal_wallet_balances read model from events

    Обрабатывает события:
    - transaction_created:
        TRANSFER — по from/to_goal_id;
        INCOME на SAVINGS — в to_goal_id, а без него (исторические события) —
        в системную цель 'Без цели';
        EXPENSE с SAVINGS (легаси) — вычесть из 'Без цели'.
    - transaction_updated: развернуть старые распределения, применить новые
    - transaction_cancelled: развернуть распределения отменённой операции
    - wallet_created (SAVINGS с initial_balance > 0): зачислить initial_balance
      в системную цель 'Без цели'
    """

    def __init__(self, db):
        super().__init__(db, projector_name="goal_wallet_balances")

    def handle_event(self, event: EventLog) -> None:
        if event.event_type == "transaction_created":
            self._apply_transaction(event.payload_json, sign=1)
        elif event.event_type == "transaction_updated":
            self._handle_transaction_updated(event)
        elif event.event_type == "transaction_cancelled":
            self._handle_transaction_cancelled(event)
        elif event.event_type == "wallet_created":
            self._handle_wallet_created(event)

    # ── helpers ──────────────────────────────────────────────────────────────

    def _wallet_is_savings(self, wallet_id) -> bool:
        if wallet_id is None:
            return False
        self.db.flush()
        w = self.db.query(WalletBalance).filter(
            WalletBalance.wallet_id == wallet_id
        ).first()
        return bool(w and w.wallet_type == "SAVINGS")

    def _system_goal_id(self, account_id: int, currency: str) -> int | None:
        self.db.flush()
        goal = self.db.query(GoalInfo).filter(
            GoalInfo.account_id == account_id,
            GoalInfo.is_system == True,  # noqa: E712
            GoalInfo.currency == currency
        ).first()
        return goal.goal_id if goal else None

    def _apply_transaction(self, payload: dict, sign: int) -> None:
        """Применить (sign=1) или развернуть (sign=-1) распределения операции."""
        amount = Decimal(payload["amount"]) * sign
        account_id = payload["account_id"]
        op_type = payload["operation_type"]
        currency = payload.get("currency", "RUB")

        if op_type == "TRANSFER":
            from_goal_id = payload.get("from_goal_id")
            to_goal_id = payload.get("to_goal_id")
            # Фолбэк для исторических событий без цели на SAVINGS-стороне
            if from_goal_id is None and self._wallet_is_savings(payload.get("from_wallet_id")):
                from_goal_id = self._system_goal_id(account_id, currency)
            if to_goal_id is None and self._wallet_is_savings(payload.get("to_wallet_id")):
                to_goal_id = self._system_goal_id(account_id, currency)

            if from_goal_id is not None:
                self._adjust_balance(account_id, from_goal_id, payload["from_wallet_id"], -amount)
            if to_goal_id is not None:
                self._adjust_balance(account_id, to_goal_id, payload["to_wallet_id"], amount)

        elif op_type == "INCOME":
            wallet_id = payload.get("wallet_id")
            goal_id = payload.get("to_goal_id")
            if goal_id is None and self._wallet_is_savings(wallet_id):
                goal_id = self._system_goal_id(account_id, currency)
            if goal_id is not None:
                self._adjust_balance(account_id, goal_id, wallet_id, amount)

        elif op_type == "EXPENSE":
            # Расход из SAVINGS сейчас запрещён use case'ом, но исторические/
            # легаси события должны уменьшать распределение, а не ломать инвариант
            wallet_id = payload.get("wallet_id")
            if self._wallet_is_savings(wallet_id):
                goal_id = payload.get("from_goal_id") or self._system_goal_id(account_id, currency)
                if goal_id is not None:
                    self._adjust_balance(account_id, goal_id, wallet_id, -amount)

    def _handle_transaction_cancelled(self, event: EventLog) -> None:
        """Отмена: развернуть распределения. Если в payload отмены нет goal-полей
        (старые события) — взять их из исходного transaction_created."""
        payload = dict(event.payload_json)
        if payload.get("from_goal_id") is None and payload.get("to_goal_id") is None:
            orig = self.db.query(EventLog).filter(
                EventLog.account_id == payload["account_id"],
                EventLog.event_type == "transaction_created",
                EventLog.payload_json["transaction_id"].astext == str(payload["transaction_id"]),
            ).first()
            if orig:
                payload["from_goal_id"] = orig.payload_json.get("from_goal_id")
                payload["to_goal_id"] = orig.payload_json.get("to_goal_id")
        self._apply_transaction(payload, sign=-1)

    def _handle_transaction_updated(self, event: EventLog) -> None:
        """Развернуть старые распределения, применить новые (все типы операций)."""
        p = event.payload_json
        account_id = p["account_id"]

        old_payload = {
            "account_id": account_id,
            "operation_type": p["old_operation_type"],
            "amount": p["old_amount"],
            "currency": p.get("old_currency", p.get("currency", "RUB")),
            "wallet_id": p.get("old_wallet_id"),
            "from_wallet_id": p.get("old_from_wallet_id"),
            "to_wallet_id": p.get("old_to_wallet_id"),
            "from_goal_id": p.get("old_from_goal_id"),
            "to_goal_id": p.get("old_to_goal_id"),
        }
        self._apply_transaction(old_payload, sign=-1)

        new_payload = {
            "account_id": account_id,
            "operation_type": p.get("operation_type", p["old_operation_type"]),
            "amount": p["amount"] if "amount" in p else p["old_amount"],
            "currency": p.get("currency", old_payload["currency"]),
            "wallet_id": p.get("wallet_id", old_payload["wallet_id"]),
            "from_wallet_id": p.get("from_wallet_id", old_payload["from_wallet_id"]),
            "to_wallet_id": p.get("to_wallet_id", old_payload["to_wallet_id"]),
            "from_goal_id": p.get("from_goal_id", old_payload["from_goal_id"]),
            "to_goal_id": p.get("to_goal_id", old_payload["to_goal_id"]),
        }
        self._apply_transaction(new_payload, sign=1)

    def _handle_wallet_created(self, event: EventLog) -> None:
        """При создании SAVINGS с initial_balance > 0 — зачислить в 'Без цели'"""
        payload = event.payload_json
        wallet_type = payload.get("wallet_type", "REGULAR")
        if wallet_type != "SAVINGS":
            return

        initial_balance = Decimal(payload.get("initial_balance", "0"))
        if initial_balance <= 0:
            return

        account_id = payload["account_id"]
        wallet_id = payload["wallet_id"]
        currency = payload["currency"]

        # Find system goal for this currency
        self.db.flush()
        system_goal = self.db.query(GoalInfo).filter(
            GoalInfo.account_id == account_id,
            GoalInfo.is_system == True,
            GoalInfo.currency == currency
        ).first()

        if not system_goal:
            return  # System goal not yet created — will be handled on next run

        self._adjust_balance(
            account_id=account_id,
            goal_id=system_goal.goal_id,
            wallet_id=wallet_id,
            delta=initial_balance
        )

    def _adjust_balance(self, account_id: int, goal_id: int, wallet_id: int, delta: Decimal) -> None:
        """Adjust goal x wallet balance by delta, creating row if needed."""
        self.db.flush()
        gwb = self.db.query(GoalWalletBalance).filter(
            GoalWalletBalance.goal_id == goal_id,
            GoalWalletBalance.wallet_id == wallet_id
        ).first()

        if gwb:
            gwb.amount += delta
        else:
            gwb = GoalWalletBalance(
                account_id=account_id,
                goal_id=goal_id,
                wallet_id=wallet_id,
                amount=delta
            )
            self.db.add(gwb)
            self.db.flush()

    def reset(self, account_id: int) -> None:
        self.db.query(GoalWalletBalance).filter(
            GoalWalletBalance.account_id == account_id
        ).delete()
        super().reset(account_id)
