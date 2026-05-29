"""GET/POST/PATCH/DELETE /api/v2/media — media log (books, movies, series, games)."""
from datetime import date
from typing import Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.api.v2.deps import get_user_id
from app.config import get_settings

router = APIRouter()

MEDIA_TYPES = {"book", "movie", "series", "game"}
STATUSES = {"want", "in_progress", "done"}


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class MediaEntryOut(BaseModel):
    id: int
    media_type: str
    title: str
    author: Optional[str]
    status: str
    rating: Optional[int]
    cover_url: Optional[str]
    note: Optional[str]
    finished_at: Optional[date]

    class Config:
        from_attributes = True


class LookupResult(BaseModel):
    title: str
    author: Optional[str]
    cover_url: Optional[str]


class MediaCreate(BaseModel):
    media_type: str
    title: str
    author: Optional[str] = None
    status: str = "want"
    rating: Optional[int] = None
    cover_url: Optional[str] = None
    note: Optional[str] = None
    finished_at: Optional[date] = None


class MediaUpdate(BaseModel):
    status: Optional[str] = None
    rating: Optional[int] = None
    note: Optional[str] = None
    finished_at: Optional[date] = None
    cover_url: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None


# ── Cover lookup helpers ──────────────────────────────────────────────────────

async def _lookup_kinopoisk(q: str, media_type: str) -> list[LookupResult]:
    key = get_settings().KINOPOISK_API_KEY
    if not key:
        return []
    url = f"https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword={quote(q)}&page=1"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(url, headers={"X-API-KEY": key})
            r.raise_for_status()
            data = r.json()
    except Exception:
        return []

    results = []
    kp_type = "TV_SERIES" if media_type == "series" else "FILM"
    for film in data.get("films", [])[:8]:
        if media_type != "movie" and media_type != "series":
            continue
        film_type = film.get("type", "")
        if media_type == "series" and film_type not in ("TV_SERIES", "MINI_SERIES", "TV_SHOW"):
            continue
        if media_type == "movie" and film_type not in ("FILM", ""):
            continue
        title = film.get("nameRu") or film.get("nameEn") or ""
        year = film.get("year", "")
        results.append(LookupResult(
            title=f"{title} ({year})" if year else title,
            author=film.get("genres", [{}])[0].get("genre") if film.get("genres") else None,
            cover_url=film.get("posterUrlPreview") or film.get("posterUrl"),
        ))
    return results[:5]


async def _lookup_books(q: str) -> list[LookupResult]:
    url = f"https://www.googleapis.com/books/v1/volumes?q={quote(q)}&maxResults=5&langRestrict=ru"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
    except Exception:
        return []

    results = []
    for item in data.get("items", [])[:5]:
        info = item.get("volumeInfo", {})
        cover = (info.get("imageLinks", {}).get("thumbnail") or
                 info.get("imageLinks", {}).get("smallThumbnail"))
        if cover:
            cover = cover.replace("http://", "https://")
        results.append(LookupResult(
            title=info.get("title", q),
            author=", ".join(info.get("authors", [])) or None,
            cover_url=cover,
        ))
    return results


async def _lookup_steam(q: str) -> list[LookupResult]:
    url = f"https://store.steampowered.com/api/storesearch/?term={quote(q)}&l=russian&cc=ru"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
    except Exception:
        return []

    results = []
    for item in data.get("items", [])[:5]:
        app_id = item.get("id")
        results.append(LookupResult(
            title=item.get("name", q),
            author=None,
            cover_url=f"https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/header.jpg" if app_id else None,
        ))
    return results


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/media/lookup", response_model=list[LookupResult])
async def lookup(media_type: str, q: str):
    """Search external APIs for title suggestions + covers."""
    if media_type in ("movie", "series"):
        return await _lookup_kinopoisk(q, media_type)
    if media_type == "book":
        return await _lookup_books(q)
    if media_type == "game":
        return await _lookup_steam(q)
    return []


@router.get("/media", response_model=list[MediaEntryOut])
def list_media(
    request: Request,
    media_type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    from app.infrastructure.db.models import MediaEntryModel
    user_id = get_user_id(request, db)

    q = db.query(MediaEntryModel).filter(MediaEntryModel.account_id == user_id)
    if media_type:
        q = q.filter(MediaEntryModel.media_type == media_type)
    if status:
        q = q.filter(MediaEntryModel.status == status)
    return q.order_by(MediaEntryModel.created_at.desc()).all()


@router.post("/media", response_model=MediaEntryOut, status_code=201)
def create_media(body: MediaCreate, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import MediaEntryModel
    user_id = get_user_id(request, db)

    entry = MediaEntryModel(
        account_id=user_id,
        media_type=body.media_type,
        title=body.title,
        author=body.author,
        status=body.status,
        rating=body.rating,
        cover_url=body.cover_url,
        note=body.note,
        finished_at=body.finished_at,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/media/{entry_id}", response_model=MediaEntryOut)
def update_media(entry_id: int, body: MediaUpdate, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import MediaEntryModel
    user_id = get_user_id(request, db)

    entry = db.query(MediaEntryModel).filter(
        MediaEntryModel.id == entry_id, MediaEntryModel.account_id == user_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/media/{entry_id}", status_code=204)
def delete_media(entry_id: int, request: Request, db: Session = Depends(get_db)):
    from app.infrastructure.db.models import MediaEntryModel
    user_id = get_user_id(request, db)

    entry = db.query(MediaEntryModel).filter(
        MediaEntryModel.id == entry_id, MediaEntryModel.account_id == user_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404)

    db.delete(entry)
    db.commit()
