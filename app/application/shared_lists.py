"""Service for Shared Lists (wishlist, giftlist, roadmap, trip)."""
import secrets
from datetime import datetime, timezone, date as date_type
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.infrastructure.db.models import SharedList, SharedListGroup, SharedListItem, ListPlanItem, TaskModel, TransactionFeed


def _generate_slug() -> str:
    return secrets.token_urlsafe(8)  # ~11 chars, URL-safe


class SharedListService:
    def __init__(self, db: Session):
        self.db = db

    # ── Lists ─────────────────────────────────────────────────────────────

    def get_lists(self, account_id: int) -> list[dict]:
        rows = self.db.query(SharedList).filter(
            SharedList.account_id == account_id
        ).order_by(SharedList.created_at.desc()).all()

        result = []
        for lst in rows:
            item_count = self.db.query(SharedListItem).filter(
                SharedListItem.list_id == lst.id
            ).count()
            result.append({
                "id": lst.id,
                "title": lst.title,
                "description": lst.description,
                "list_type": lst.list_type,
                "slug": lst.slug,
                "is_public": lst.is_public,
                "item_count": item_count,
                "created_at": lst.created_at,
                "updated_at": lst.updated_at,
            })
        return result

    def get_list(self, account_id: int, list_id: int) -> dict | None:
        lst = self.db.query(SharedList).filter(
            SharedList.id == list_id,
            SharedList.account_id == account_id,
        ).first()
        if not lst:
            return None
        return self._serialize_full(lst)

    def get_list_by_slug(self, slug: str) -> dict | None:
        """Public access — no account_id filter. Checks is_public."""
        lst = self.db.query(SharedList).filter(
            SharedList.slug == slug,
            SharedList.is_public == True,  # noqa: E712
        ).first()
        if not lst:
            return None
        return self._serialize_full(lst)

    def create_list(
        self,
        account_id: int,
        title: str,
        list_type: str,
        description: str | None = None,
        budget_amount: Decimal | None = None,
        period_from: date_type | None = None,
        period_to: date_type | None = None,
    ) -> dict:
        lst = SharedList(
            account_id=account_id,
            title=title,
            description=description,
            list_type=list_type,
            slug=_generate_slug(),
            is_public=False,
            budget_amount=budget_amount,
            period_from=period_from,
            period_to=period_to,
        )
        self.db.add(lst)
        self.db.flush()
        self.db.commit()
        return self._serialize_full(lst)

    def update_list(self, account_id: int, list_id: int, **kwargs) -> dict | None:
        lst = self.db.query(SharedList).filter(
            SharedList.id == list_id,
            SharedList.account_id == account_id,
        ).first()
        if not lst:
            return None

        for key in ("title", "description", "is_public", "custom_statuses", "budget_amount", "period_from", "period_to"):
            if key in kwargs:
                setattr(lst, key, kwargs[key])

        self.db.commit()
        return self._serialize_full(lst)

    def delete_list(self, account_id: int, list_id: int) -> bool:
        lst = self.db.query(SharedList).filter(
            SharedList.id == list_id,
            SharedList.account_id == account_id,
        ).first()
        if not lst:
            return False
        self.db.delete(lst)
        self.db.commit()
        return True

    # ── Groups ────────────────────────────────────────────────────────────

    def create_group(self, account_id: int, list_id: int, title: str, color: str | None = None) -> dict | None:
        lst = self._get_list(account_id, list_id)
        if not lst:
            return None

        max_sort = self.db.query(SharedListGroup).filter(
            SharedListGroup.list_id == list_id
        ).count()

        grp = SharedListGroup(list_id=list_id, title=title, sort_order=max_sort, color=color)
        self.db.add(grp)
        self.db.flush()
        self.db.commit()
        return {"id": grp.id, "list_id": grp.list_id, "title": grp.title, "sort_order": grp.sort_order, "color": grp.color}

    def update_group(self, account_id: int, group_id: int, **kwargs) -> dict | None:
        grp = self.db.query(SharedListGroup).filter(SharedListGroup.id == group_id).first()
        if not grp:
            return None
        if not self._get_list(account_id, grp.list_id):
            return None

        for key in ("title", "sort_order", "color"):
            if key in kwargs:
                setattr(grp, key, kwargs[key])
        self.db.commit()
        return {"id": grp.id, "list_id": grp.list_id, "title": grp.title, "sort_order": grp.sort_order, "color": grp.color}

    def delete_group(self, account_id: int, group_id: int) -> bool:
        grp = self.db.query(SharedListGroup).filter(SharedListGroup.id == group_id).first()
        if not grp:
            return False
        if not self._get_list(account_id, grp.list_id):
            return False
        self.db.delete(grp)
        self.db.commit()
        return True

    # ── Items ─────────────────────────────────────────────────────────────

    def create_item(self, account_id: int, list_id: int, title: str, **kwargs) -> dict | None:
        lst = self._get_list(account_id, list_id)
        if not lst:
            return None

        max_sort = self.db.query(SharedListItem).filter(
            SharedListItem.list_id == list_id
        ).count()

        item = SharedListItem(
            list_id=list_id,
            group_id=kwargs.get("group_id"),
            title=title,
            note=kwargs.get("note"),
            url=kwargs.get("url"),
            image_url=kwargs.get("image_url"),
            price=Decimal(str(kwargs["price"])) if kwargs.get("price") else None,
            currency=kwargs.get("currency", "RUB"),
            sort_order=max_sort,
        )
        self.db.add(item)
        self.db.flush()
        self.db.commit()
        return self._serialize_item(item)

    def update_item(self, account_id: int, item_id: int, **kwargs) -> dict | None:
        item = self.db.query(SharedListItem).filter(SharedListItem.id == item_id).first()
        if not item:
            return None
        if not self._get_list(account_id, item.list_id):
            return None

        for key in ("title", "note", "url", "image_url", "group_id", "sort_order", "currency"):
            if key in kwargs:
                setattr(item, key, kwargs[key])
        if "price" in kwargs:
            item.price = Decimal(str(kwargs["price"])) if kwargs["price"] else None
        if "status" in kwargs:
            item.status = kwargs["status"]
            if kwargs["status"] == "done" and not item.completed_at:
                item.completed_at = datetime.now(timezone.utc)
            elif kwargs["status"] != "done":
                item.completed_at = None

        self.db.commit()
        return self._serialize_item(item)

    def delete_item(self, account_id: int, item_id: int) -> bool:
        item = self.db.query(SharedListItem).filter(SharedListItem.id == item_id).first()
        if not item:
            return False
        if not self._get_list(account_id, item.list_id):
            return False
        self.db.delete(item)
        self.db.commit()
        return True

    def reserve_item(self, slug: str, item_id: int, reserved_by: str) -> dict | None:
        """Public action — reserve an item on a giftlist (no auth required)."""
        lst = self.db.query(SharedList).filter(
            SharedList.slug == slug,
            SharedList.is_public == True,  # noqa: E712
            SharedList.list_type == "giftlist",
        ).first()
        if not lst:
            return None

        item = self.db.query(SharedListItem).filter(
            SharedListItem.id == item_id,
            SharedListItem.list_id == lst.id,
            SharedListItem.status == "open",
        ).first()
        if not item:
            return None

        item.status = "reserved"
        item.reserved_by = reserved_by.strip()[:128]
        self.db.commit()
        return self._serialize_item(item)

    # ── Reorder ───────────────────────────────────────────────────────────

    def reorder_items(self, account_id: int, list_id: int, item_ids: list[int]) -> bool:
        if not self._get_list(account_id, list_id):
            return False
        for idx, item_id in enumerate(item_ids):
            self.db.query(SharedListItem).filter(
                SharedListItem.id == item_id,
                SharedListItem.list_id == list_id,
            ).update({"sort_order": idx})
        self.db.commit()
        return True

    def reorder_groups(self, account_id: int, list_id: int, group_ids: list[int]) -> bool:
        if not self._get_list(account_id, list_id):
            return False
        for idx, group_id in enumerate(group_ids):
            self.db.query(SharedListGroup).filter(
                SharedListGroup.id == group_id,
                SharedListGroup.list_id == list_id,
            ).update({"sort_order": idx})
        self.db.commit()
        return True

    # ── Plan Items ────────────────────────────────────────────────────────────

    def get_plan_items(self, account_id: int, list_id: int) -> list[dict] | None:
        if not self._get_list(account_id, list_id):
            return None
        items = self.db.query(ListPlanItem).filter(
            ListPlanItem.list_id == list_id,
            ListPlanItem.account_id == account_id,
        ).order_by(ListPlanItem.sort_order, ListPlanItem.id).all()
        return [self._serialize_plan_item(i) for i in items]

    def create_plan_item(
        self,
        account_id: int,
        list_id: int,
        title: str,
        amount: Decimal,
        sort_order: int | None = None,
    ) -> dict | None:
        if not self._get_list(account_id, list_id):
            return None
        if sort_order is None:
            sort_order = self.db.query(ListPlanItem).filter(
                ListPlanItem.list_id == list_id
            ).count()
        item = ListPlanItem(
            list_id=list_id,
            account_id=account_id,
            title=title,
            amount=amount,
            sort_order=sort_order,
        )
        self.db.add(item)
        self.db.flush()
        self.db.commit()
        return self._serialize_plan_item(item)

    def update_plan_item(
        self,
        account_id: int,
        list_id: int,
        item_id: int,
        **kwargs,
    ) -> dict | None:
        if not self._get_list(account_id, list_id):
            return None
        item = self.db.query(ListPlanItem).filter(
            ListPlanItem.id == item_id,
            ListPlanItem.list_id == list_id,
            ListPlanItem.account_id == account_id,
        ).first()
        if not item:
            return None
        for key in ("title", "sort_order"):
            if key in kwargs:
                setattr(item, key, kwargs[key])
        if "amount" in kwargs:
            item.amount = Decimal(str(kwargs["amount"]))
        self.db.commit()
        return self._serialize_plan_item(item)

    def delete_plan_item(self, account_id: int, list_id: int, item_id: int) -> bool:
        if not self._get_list(account_id, list_id):
            return False
        item = self.db.query(ListPlanItem).filter(
            ListPlanItem.id == item_id,
            ListPlanItem.list_id == list_id,
            ListPlanItem.account_id == account_id,
        ).first()
        if not item:
            return False
        self.db.delete(item)
        self.db.commit()
        return True

    def get_summary(self, account_id: int, list_id: int) -> dict | None:
        lst = self._get_list(account_id, list_id)
        if not lst:
            return None

        # Plan items
        plan_items = self.db.query(ListPlanItem).filter(
            ListPlanItem.list_id == list_id,
            ListPlanItem.account_id == account_id,
        ).all()
        plan_items_count = len(plan_items)
        plan_total = sum(i.amount for i in plan_items) if plan_items else Decimal("0")

        # Effective budget
        if plan_items_count > 0:
            effective_budget = plan_total
        else:
            effective_budget = lst.budget_amount

        # Fact amount (transactions)
        txn_q = self.db.query(TransactionFeed).filter(
            TransactionFeed.account_id == account_id,
            TransactionFeed.list_id == list_id,
        )
        if lst.list_type == "trip" and lst.period_from and lst.period_to:
            txn_q = txn_q.filter(
                TransactionFeed.occurred_at >= lst.period_from,
                TransactionFeed.occurred_at <= lst.period_to,
            )
        transactions = txn_q.all()
        fact_amount = sum(t.amount for t in transactions) if transactions else Decimal("0")
        txn_count = len(transactions)

        # Tasks
        tasks = self.db.query(TaskModel).filter(
            TaskModel.account_id == account_id,
            TaskModel.list_id == list_id,
        ).all()
        tasks_total = len(tasks)
        tasks_done = sum(1 for t in tasks if t.status == "DONE")

        return {
            "budget_amount": str(lst.budget_amount) if lst.budget_amount is not None else None,
            "plan_total": str(plan_total),
            "plan_items_count": plan_items_count,
            "effective_budget": str(effective_budget) if effective_budget is not None else None,
            "fact_amount": str(fact_amount),
            "tasks_total": tasks_total,
            "tasks_done": tasks_done,
            "txn_count": txn_count,
            "period_from": lst.period_from.isoformat() if lst.period_from else None,
            "period_to": lst.period_to.isoformat() if lst.period_to else None,
        }

    # ── Helpers ────────────────────────────────────────────────────────────

    def _get_list(self, account_id: int, list_id: int) -> SharedList | None:
        return self.db.query(SharedList).filter(
            SharedList.id == list_id,
            SharedList.account_id == account_id,
        ).first()

    def _serialize_full(self, lst: SharedList) -> dict:
        groups = self.db.query(SharedListGroup).filter(
            SharedListGroup.list_id == lst.id
        ).order_by(SharedListGroup.sort_order).all()

        items = self.db.query(SharedListItem).filter(
            SharedListItem.list_id == lst.id
        ).order_by(SharedListItem.sort_order).all()

        return {
            "id": lst.id,
            "account_id": lst.account_id,
            "title": lst.title,
            "description": lst.description,
            "list_type": lst.list_type,
            "slug": lst.slug,
            "is_public": lst.is_public,
            "custom_statuses": lst.custom_statuses,
            "budget_amount": str(lst.budget_amount) if lst.budget_amount is not None else None,
            "period_from": lst.period_from.isoformat() if lst.period_from else None,
            "period_to": lst.period_to.isoformat() if lst.period_to else None,
            "created_at": lst.created_at,
            "updated_at": lst.updated_at,
            "groups": [
                {"id": g.id, "title": g.title, "sort_order": g.sort_order, "color": g.color}
                for g in groups
            ],
            "items": [self._serialize_item(it) for it in items],
        }

    def _serialize_item(self, item: SharedListItem) -> dict:
        return {
            "id": item.id,
            "list_id": item.list_id,
            "group_id": item.group_id,
            "title": item.title,
            "note": item.note,
            "url": item.url,
            "image_url": item.image_url,
            "price": str(item.price) if item.price else None,
            "currency": item.currency,
            "status": item.status,
            "reserved_by": item.reserved_by,
            "planned_op_template_id": item.planned_op_template_id,
            "sort_order": item.sort_order,
            "completed_at": item.completed_at.isoformat() if item.completed_at else None,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }

    def _serialize_plan_item(self, item: ListPlanItem) -> dict:
        return {
            "id": item.id,
            "list_id": item.list_id,
            "title": item.title,
            "amount": str(item.amount),
            "sort_order": item.sort_order,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
