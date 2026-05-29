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
from app.application.app_config import get_kinopoisk_key

router = APIRouter()


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
    release_date: Optional[date]
    release_date_source: Optional[str] = None
    kp_id: Optional[int] = None
    episodes_count: Optional[int] = None
    next_episode_date: Optional[date] = None
    next_episode_label: Optional[str] = None

    class Config:
        from_attributes = True


class LookupResult(BaseModel):
    title: str
    author: Optional[str]
    cover_url: Optional[str]
    kp_id: Optional[int] = None
    year: Optional[int] = None


class KpPremiereResult(BaseModel):
    premiere_ru: Optional[date] = None
    premiere_world: Optional[date] = None


class MediaCreate(BaseModel):
    media_type: str
    title: str
    author: Optional[str] = None
    status: str = "want"
    rating: Optional[int] = None
    cover_url: Optional[str] = None
    note: Optional[str] = None
    finished_at: Optional[date] = None
    release_date: Optional[date] = None
    release_date_source: Optional[str] = None
    kp_id: Optional[int] = None
    next_episode_date: Optional[date] = None
    next_episode_label: Optional[str] = None


class MediaUpdate(BaseModel):
    status: Optional[str] = None
    rating: Optional[int] = None
    note: Optional[str] = None
    finished_at: Optional[date] = None
    cover_url: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    release_date: Optional[date] = None
    release_date_source: Optional[str] = None
    next_episode_date: Optional[date] = None
    next_episode_label: Optional[str] = None


# ── KP data helpers ───────────────────────────────────────────────────────────

def _parse_date(s) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def _fetch_kp_data_sync(kp_id: int, key: str, media_type: str) -> dict:
    """
    Fetch premiere dates and next episode date from KP for a movie/series.
    Returns dict with keys: release_date, release_date_source,
    next_episode_date, next_episode_label.
    All values may be None.
    """
    result: dict = {
        "release_date": None,
        "release_date_source": None,
        "next_episode_date": None,
        "next_episode_label": None,
    }
    try:
        with httpx.Client(timeout=5) as client:
            r = client.get(
                f"https://kinopoiskapiunofficial.tech/api/v2.2/films/{kp_id}",
                headers={"X-API-KEY": key},
            )
            r.raise_for_status()
            data = r.json()
    except Exception:
        return result

    premiere_ru = _parse_date(data.get("premiereRu"))
    premiere_world = _parse_date(data.get("premiereWorld"))

    # Fallback: distributors array for Russian theatrical release
    if not premiere_ru:
        for dist in (data.get("distributors") or []):
            country = (dist.get("country") or "").upper()
            d = _parse_date(dist.get("releaseDate"))
            if d and country in ("RUSSIA", "RU", "РФ", "РОССИЯ"):
                premiere_ru = d
                break

    # Last resort: generic releaseDate field
    if not premiere_ru and not premiere_world:
        premiere_world = _parse_date(data.get("releaseDate"))

    if premiere_ru:
        result["release_date"] = premiere_ru
        result["release_date_source"] = "ru"
    elif premiere_world:
        result["release_date"] = premiere_world
        result["release_date_source"] = "world"

    if media_type == "series":
        try:
            with httpx.Client(timeout=5) as client:
                r = client.get(
                    f"https://kinopoiskapiunofficial.tech/api/v2.2/films/{kp_id}/seasons",
                    headers={"X-API-KEY": key},
                )
                r.raise_for_status()
                seasons = r.json().get("items", [])
        except Exception:
            seasons = []

        today = date.today()
        next_ep: Optional[tuple[date, str]] = None
        for season in seasons:
            for ep in season.get("episodes") or []:
                ep_date = _parse_date(ep.get("releaseDate"))
                if ep_date and ep_date > today:
                    label = f"S{season['number']}E{ep['episodeNumber']}"
                    if next_ep is None or ep_date < next_ep[0]:
                        next_ep = (ep_date, label)
        if next_ep:
            result["next_episode_date"] = next_ep[0]
            result["next_episode_label"] = next_ep[1]

    return result


# ── Cover / metadata lookup helpers ──────────────────────────────────────────

async def _lookup_kinopoisk(q: str, media_type: str, key: str) -> list[LookupResult]:
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
    for film in data.get("films", [])[:8]:
        film_type = film.get("type", "")
        if media_type == "series" and film_type not in ("TV_SERIES", "MINI_SERIES", "TV_SHOW"):
            continue
        if media_type == "movie" and film_type not in ("FILM", ""):
            continue
        title = film.get("nameRu") or film.get("nameEn") or ""
        year = film.get("year")
        try:
            year_int = int(year) if year else None
        except (ValueError, TypeError):
            year_int = None
        label = f"{title} ({year_int})" if year_int else title
        results.append(LookupResult(
            title=label,
            author=film.get("genres", [{}])[0].get("genre") if film.get("genres") else None,
            cover_url=film.get("posterUrlPreview") or film.get("posterUrl"),
            kp_id=film.get("filmId"),
            year=year_int,
        ))
        if len(results) >= 5:
            break
    return results


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
async def lookup(media_type: str, q: str, db: Session = Depends(get_db)):
    if media_type in ("movie", "series"):
        key = get_kinopoisk_key(db)
        return await _lookup_kinopoisk(q, media_type, key or "")
    if media_type == "book":
        return await _lookup_books(q)
    if media_type == "game":
        return await _lookup_steam(q)
    return []


@router.get("/media/kp-premiere", response_model=KpPremiereResult)
async def kp_premiere(kp_id: int, db: Session = Depends(get_db)):
    """Fetch Russian and world premiere dates for a Kinopoisk film."""
    key = get_kinopoisk_key(db)
    if not key:
        return KpPremiereResult()
    url = f"https://kinopoiskapiunofficial.tech/api/v2.2/films/{kp_id}"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(url, headers={"X-API-KEY": key})
            r.raise_for_status()
            data = r.json()
    except Exception:
        return KpPremiereResult()

    def pd(s) -> Optional[date]:
        if not s:
            return None
        try:
            return date.fromisoformat(str(s)[:10])
        except ValueError:
            return None

    # Primary fields
    premiere_ru = pd(data.get("premiereRu"))
    premiere_world = pd(data.get("premiereWorld"))

    # Fallback: check distributors array (Russian theatrical release)
    if not premiere_ru:
        for dist in (data.get("distributors") or []):
            country = (dist.get("country") or "").upper()
            d = pd(dist.get("releaseDate"))
            if d and country in ("RUSSIA", "RU", "РФ", "РОССИЯ"):
                premiere_ru = d
                break

    # Fallback: if still nothing but film is from current/recent year, try releaseDate
    if not premiere_ru and not premiere_world:
        premiere_world = pd(data.get("releaseDate"))

    return KpPremiereResult(
        premiere_ru=premiere_ru,
        premiere_world=premiere_world,
    )


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

    release_date = body.release_date
    release_date_source = body.release_date_source
    next_episode_date = body.next_episode_date
    next_episode_label = body.next_episode_label

    # Auto-fetch from KP when kp_id is provided — handles race condition where
    # the frontend hasn't received premiere data yet before the user submits.
    if body.kp_id and body.media_type in ("movie", "series"):
        key = get_kinopoisk_key(db)
        if key:
            kp = _fetch_kp_data_sync(body.kp_id, key, body.media_type)
            if not release_date and kp["release_date"]:
                release_date = kp["release_date"]
                release_date_source = kp["release_date_source"]
            if not next_episode_date and kp["next_episode_date"]:
                next_episode_date = kp["next_episode_date"]
                next_episode_label = kp["next_episode_label"]

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
        release_date=release_date,
        release_date_source=release_date_source,
        kp_id=body.kp_id,
        next_episode_date=next_episode_date,
        next_episode_label=next_episode_label,
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


@router.post("/media/{entry_id}/kp-refresh", response_model=MediaEntryOut)
def kp_refresh(entry_id: int, request: Request, db: Session = Depends(get_db)):
    """Re-fetch premiere/episode data from Kinopoisk and update the entry."""
    from app.infrastructure.db.models import MediaEntryModel
    user_id = get_user_id(request, db)

    entry = db.query(MediaEntryModel).filter(
        MediaEntryModel.id == entry_id, MediaEntryModel.account_id == user_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404)
    if not entry.kp_id or entry.media_type not in ("movie", "series"):
        raise HTTPException(status_code=400, detail="No kp_id or unsupported type")

    key = get_kinopoisk_key(db)
    if not key:
        raise HTTPException(status_code=503, detail="Kinopoisk API key not configured")

    kp = _fetch_kp_data_sync(entry.kp_id, key, entry.media_type)
    if kp["release_date"]:
        entry.release_date = kp["release_date"]
        entry.release_date_source = kp["release_date_source"]
    if kp["next_episode_date"] is not None:
        entry.next_episode_date = kp["next_episode_date"]
        entry.next_episode_label = kp["next_episode_label"]
    elif entry.media_type == "series":
        entry.next_episode_date = None
        entry.next_episode_label = None
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
