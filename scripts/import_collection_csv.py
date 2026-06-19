"""
Import banknote / coin collections from CSV into the Collection feature.

Run inside the app container, e.g.:
    docker compose -f docker-compose.prod.yml cp banknotes.csv app:/tmp/banknotes.csv
    docker compose -f docker-compose.prod.yml cp coins.csv     app:/tmp/coins.csv
    docker compose -f docker-compose.prod.yml exec app python scripts/import_collection_csv.py banknotes /tmp/banknotes.csv
    docker compose -f docker-compose.prod.yml exec app python scripts/import_collection_csv.py coins     /tmp/coins.csv

CSV layout is read BY COLUMN POSITION (header row skipped), so exact header
text doesn't matter. Files are read as utf-8-sig (handles the BOM).

  banknotes: Номер, Номинал, Тип, Модификация, Вложение, Состояние, Серия, Страна, Сумма
  coins:     Название, Хранение, Коллекция, Номинал, Вложения, Сумма

Idempotency:
  - banknotes are de-duplicated by serial number (safe to re-run).
  - coins have no unique key and may contain real duplicates, so the import
    refuses to run if the coin category already has items (use --force to add
    anyway).

Account: auto-detected from existing collection data; override with --account-id.
"""
import sys
import os
import csv
import re
import argparse
from decimal import Decimal, InvalidOperation

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402
from app.infrastructure.db.session import get_session_factory  # noqa: E402
from app.infrastructure.db.models import CollectionCategory, CollectionItem  # noqa: E402


def _to_decimal(s) -> Decimal:
    if not s:
        return Decimal("0")
    m = re.search(r"\d+(?:[.,]\d+)?", str(s).replace(" ", ""))
    if not m:
        return Decimal("0")
    try:
        return Decimal(m.group(0).replace(",", "."))
    except InvalidOperation:
        return Decimal("0")


def _year(s) -> int | None:
    if not s:
        return None
    m = re.search(r"(?:19|20)\d{2}", str(s))
    return int(m.group(0)) if m else None


def _detect_account_id(db, explicit):
    if explicit is not None:
        return explicit
    ids = set()
    for (aid,) in db.execute(select(CollectionItem.account_id).distinct()).all():
        ids.add(aid)
    for (aid,) in db.execute(select(CollectionCategory.account_id).distinct()).all():
        ids.add(aid)
    ids = sorted(ids)
    if len(ids) == 1:
        return ids[0]
    raise SystemExit(
        f"Не удалось определить account_id автоматически (найдено: {ids}). "
        f"Укажи явно: --account-id N"
    )


def _get_or_create_category(db, account_id, name, tracking_type, emoji):
    cat = db.query(CollectionCategory).filter_by(account_id=account_id, name=name).first()
    if cat:
        return cat
    cat = CollectionCategory(
        account_id=account_id, name=name, tracking_type=tracking_type, emoji=emoji,
    )
    db.add(cat)
    db.flush()
    print(f"  + создана категория «{name}» ({tracking_type})")
    return cat


def _read_rows(path, width):
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        next(reader, None)  # skip header
        for row in reader:
            if not row or not any(c.strip() for c in row):
                continue
            yield [c.strip() for c in (row + [""] * width)[:width]]


def import_banknotes(db, account_id, path, category_name):
    cat = _get_or_create_category(db, account_id, category_name, "serial", "💵")
    existing = {
        s for (s,) in db.query(CollectionItem.serial_number)
        .filter_by(account_id=account_id, category_id=cat.id).all() if s
    }
    base_order = db.query(CollectionItem).filter_by(account_id=account_id, category_id=cat.id).count()
    inserted = skipped = 0
    for i, (serial, denom, ptype, modif, _att, cond, series, country, summa) in enumerate(_read_rows(path, 9)):
        if not serial:
            continue
        if serial in existing:
            skipped += 1
            continue
        price = _to_decimal(summa) or _to_decimal(denom)
        bits = [b for b in (ptype, modif, (f"Состояние {cond}" if cond else "")) if b]
        db.add(CollectionItem(
            account_id=account_id, category_id=cat.id,
            serial_number=serial,
            denomination=denom or None,
            country=country or None,
            series=series or None,
            issue_year=_year(modif),
            acquisition_price=price,
            current_value=price,
            comment=" · ".join(bits) or None,
            sort_order=base_order + i,
        ))
        existing.add(serial)
        inserted += 1
    db.commit()
    print(f"Купюры: добавлено {inserted}, пропущено (дубли по серийнику) {skipped}")


def import_coins(db, account_id, path, category_name, force):
    cat = _get_or_create_category(db, account_id, category_name, "name", "🪙")
    have = db.query(CollectionItem).filter_by(account_id=account_id, category_id=cat.id).count()
    if have > 0 and not force:
        raise SystemExit(
            f"В категории «{category_name}» уже есть {have} предметов. "
            f"Монеты не дедуплицируются (бывают реальные дубли). "
            f"Если точно нужно добавить ещё раз — запусти с флагом --force."
        )
    inserted = 0
    for i, (name, storage, coll, denom, _att, summa) in enumerate(_read_rows(path, 6)):
        if not name:
            continue
        price = _to_decimal(summa) or _to_decimal(denom)
        bits = [b for b in ((f"Хранение: {storage}" if storage else ""),) if b]
        db.add(CollectionItem(
            account_id=account_id, category_id=cat.id,
            name=name,
            series=coll or None,
            denomination=denom or None,
            acquisition_price=price,
            current_value=price,
            comment=" · ".join(bits) or None,
            sort_order=have + i,
        ))
        inserted += 1
    db.commit()
    print(f"Монеты: добавлено {inserted}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["banknotes", "coins"])
    ap.add_argument("path")
    ap.add_argument("--account-id", type=int, default=None)
    ap.add_argument("--category", default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    Session = get_session_factory()
    with Session() as db:
        account_id = _detect_account_id(db, args.account_id)
        print(f"account_id = {account_id}")
        if args.kind == "banknotes":
            import_banknotes(db, account_id, args.path, args.category or "Купюры РФ")
        else:
            import_coins(db, account_id, args.path, args.category or "Монеты РФ", args.force)


if __name__ == "__main__":
    main()
