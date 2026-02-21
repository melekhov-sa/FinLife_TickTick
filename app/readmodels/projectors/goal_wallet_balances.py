"""
GoalWalletBalancesProjector - builds goal_wallet_balances read model from events

Tracks how much money each goal has in each wallet.
"""
from decimal import Decimal

from app.readmodels.projectors.base import BaseProjector
from app.infrastructure.db.models import GoalWalletBalance, GoalInfo, EventLog


class GoalWalletBalancesProjector(BaseProjector):
    """
    Builds goal_wallet_balances read model from events

    Обрабатывает события:
    - transaction_created (TRANSFER): обновить goal x wallet балансы
    - wallet_created (SAVINGS с initial_balance > 0): зачислить initial_balance
      в системную цель 'Без цели'
    """

    def __init__(self, db):
        super().__init__(db, projector_name="goal_wallet_balances")

    def handle_event(self, event: EventLog) -> None:
        if event.event_type == "transaction_created":
            self._handle_transaction_created(event)
        elif event.event_type == "transaction_updated":
            self._handle_transaction_updated(event)
        elif event.event_type == "wallet_created":
            self._handle_wallet_created(event)

    def _handle_transaction_created(self, event: EventLog) -> None:
        payload = event.payload_json
        if payload["operation_type"] != "TRANSFER":
            return

        amount = Decimal(payload["amount"])
        account_id = payload["account_id"]

        from_goal_id = payload.get("from_goal_id")
        to_goal_id = payload.get("to_goal_id")

        if from_goal_id is not None:
            self._adjust_balance(
                account_id=account_id,
                goal_id=from_goal_id,
                wallet_id=payload["from_wallet_id"],
                delta=-amount
            )

        if to_goal_id is not None:
            self._adjust_balance(
                account_id=account_id,
                goal_id=to_goal_id,
                wallet_id=payload["to_wallet_id"],
                delta=amount
            )

    def _handle_transaction_updated(self, event: EventLog) -> None:
        """Reverse old goal allocations, apply new ones (TRANSFER only)."""
        p = event.payload_json
        account_id = p["account_id"]
        old_amount = Decimal(p["old_amount"])

        # Reverse old allocations
        if p["old_operation_type"] == "TRANSFER":
            old_from_goal = p.get("old_from_goal_id")
            old_to_goal = p.get("old_to_goal_id")
            if old_from_goal is not None:
                self._adjust_balance(account_id, old_from_goal, p["old_from_wallet_id"], old_amount)
            if old_to_goal is not None:
                self._adjust_balance(account_id, old_to_goal, p["old_to_wallet_id"], -old_amount)

        # Apply new allocations
        if p["operation_type"] == "TRANSFER":
            new_amount = Decimal(p["amount"]) if "amount" in p else old_amount
            new_from_goal = p.get("from_goal_id", p.get("old_from_goal_id"))
            new_to_goal = p.get("to_goal_id", p.get("old_to_goal_id"))
            new_from_wallet = p.get("from_wallet_id", p.get("old_from_wallet_id"))
            new_to_wallet = p.get("to_wallet_id", p.get("old_to_wallet_id"))
            if new_from_goal is not None:
                self._adjust_balance(account_id, new_from_goal, new_from_wallet, -new_amount)
            if new_to_goal is not None:
                self._adjust_balance(account_id, new_to_goal, new_to_wallet, new_amount)

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
