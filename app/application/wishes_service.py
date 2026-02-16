"""
Service for wishes filtering and calculations
"""
from decimal import Decimal
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app.infrastructure.db.models import WishModel


class WishesService:
    """Service for wishes operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_filtered_wishes(
        self,
        account_id: int,
        period: str = "all",
        statuses: list[str] | None = None,
        search: str | None = None
    ):
        """Get filtered wishes with period/status/search"""
        query = self.db.query(WishModel).filter(WishModel.account_id == account_id)

        # Period filter
        if period != "all":
            now = datetime.now()
            if period == "14days":
                date_limit = (now + timedelta(days=14)).date()
                query = query.filter(or_(
                    WishModel.target_date <= date_limit,
                    WishModel.target_month <= date_limit.strftime("%Y-%m")
                ))
            elif period == "this_month":
                month = now.strftime("%Y-%m")
                query = query.filter(or_(
                    and_(
                        WishModel.target_date >= now.replace(day=1).date(),
                        WishModel.target_date < (now.replace(day=1) + timedelta(days=32)).replace(day=1).date()
                    ),
                    WishModel.target_month == month
                ))
            elif period == "next_month":
                next_month = (now.replace(day=1) + timedelta(days=32)).replace(day=1)
                month = next_month.strftime("%Y-%m")
                query = query.filter(or_(
                    and_(
                        WishModel.target_date >= next_month.date(),
                        WishModel.target_date < (next_month + timedelta(days=32)).replace(day=1).date()
                    ),
                    WishModel.target_month == month
                ))

        # Status filter
        if statuses:
            query = query.filter(WishModel.status.in_(statuses))

        # Search
        if search:
            query = query.filter(WishModel.title.ilike(f"%{search}%"))

        return query.order_by(
            WishModel.target_date.asc().nullslast(),
            WishModel.target_month.asc().nullslast(),
            WishModel.title.asc()
        ).all()

    def get_purchase_wishes(self, account_id: int):
        """Get PURCHASE wishes for Закупка mode"""
        return self.db.query(WishModel).filter(
            WishModel.account_id == account_id,
            WishModel.wish_type == "PURCHASE",
            WishModel.status.in_(["IDEA", "CONSIDERING"])
        ).order_by(
            WishModel.target_date.asc().nullslast(),
            WishModel.target_month.asc().nullslast(),
            WishModel.title.asc()
        ).all()

    def calculate_selected_total(self, wish_ids: list[int], account_id: int) -> Decimal:
        """Calculate total of selected wishes"""
        if not wish_ids:
            return Decimal("0")

        wishes = self.db.query(WishModel).filter(
            WishModel.wish_id.in_(wish_ids),
            WishModel.account_id == account_id
        ).all()

        return sum((w.estimated_amount or Decimal("0") for w in wishes), Decimal("0"))

    def group_by_type(self, wishes):
        """Group wishes by type"""
        grouped = {
            "PURCHASE": [],
            "EVENT": [],
            "PLACE": [],
            "OTHER": []
        }
        for w in wishes:
            if w.wish_type in grouped:
                grouped[w.wish_type].append(w)
        return grouped
