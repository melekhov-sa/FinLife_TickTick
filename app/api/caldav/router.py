"""
CalDAV router — WebDAV/CalDAV endpoints for iPhone Reminders integration.

Discovery flow:
  /.well-known/caldav  →  301  →  /caldav/
  PROPFIND /caldav/            →  current-user-principal + calendar-home-set
  PROPFIND /caldav/principals/{uid}/  →  same
  PROPFIND /caldav/calendars/{uid}/   →  home collection + tasks calendar (Depth:1)
  PROPFIND /caldav/calendars/{uid}/tasks/  →  calendar + all task items (Depth:1)
  REPORT   /caldav/calendars/{uid}/tasks/  →  all tasks with VTODO calendar-data
  GET/PUT/DELETE /caldav/calendars/{uid}/tasks/{filename}  →  individual tasks
"""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.caldav.auth import authenticate_caldav
from app.api.caldav import ical
from app.infrastructure.db.models import TaskModel, TaskReminderModel, User

router = APIRouter(prefix="/caldav", tags=["caldav"], redirect_slashes=False)

_FILENAME_RE = re.compile(r"^task-(\d+)\.ics$")
_CT_XML = "application/xml; charset=utf-8"
_CT_ICS = "text/calendar; charset=utf-8"
_DAV_CAPS = "1, 2, calendar-access"
_ALLOW = "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, REPORT"


# ── XML helpers ───────────────────────────────────────────────────────────────

def _xml(body: str, status: int = 207) -> Response:
    return Response(
        content='<?xml version="1.0" encoding="utf-8"?>\n' + body,
        status_code=status,
        media_type=_CT_XML,
    )


def _ms(*responses: str) -> str:
    """Wrap responses in <D:multistatus>."""
    return (
        '<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">'
        + "".join(responses)
        + "</D:multistatus>"
    )


def _resp(href: str, ok_props: str, missing_props: str = "") -> str:
    r = f"<D:response><D:href>{href}</D:href>"
    if ok_props:
        r += f"<D:propstat><D:prop>{ok_props}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>"
    if missing_props:
        r += f"<D:propstat><D:prop>{missing_props}</D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat>"
    r += "</D:response>"
    return r


def _principal_props(uid: int) -> str:
    return (
        f"<D:current-user-principal><D:href>/caldav/principals/{uid}/</D:href></D:current-user-principal>"
        f"<D:principal-URL><D:href>/caldav/principals/{uid}/</D:href></D:principal-URL>"
        f"<C:calendar-home-set><D:href>/caldav/calendars/{uid}/</D:href></C:calendar-home-set>"
        f"<D:resourcetype><D:collection/></D:resourcetype>"
    )


def _calendar_props(uid: int) -> str:
    return (
        f"<D:resourcetype><D:collection/><C:calendar/></D:resourcetype>"
        f"<D:displayname>Задачи FinLife</D:displayname>"
        f"<C:supported-calendar-component-set><C:comp name=\"VTODO\"/></C:supported-calendar-component-set>"
        f"<D:getcontenttype>text/calendar; charset=utf-8</D:getcontenttype>"
    )


# ── OPTIONS ───────────────────────────────────────────────────────────────────

@router.api_route("/", methods=["OPTIONS"])
@router.api_route("/{path:path}", methods=["OPTIONS"])
async def options_all(path: str = "") -> Response:
    return Response(status_code=204, headers={"Allow": _ALLOW, "DAV": _DAV_CAPS})


# ── PROPFIND root / principals ────────────────────────────────────────────────

@router.api_route("", methods=["PROPFIND"])
@router.api_route("/", methods=["PROPFIND"])
async def propfind_root(request: Request, db: Session = Depends(get_db)) -> Response:
    user: User = authenticate_caldav(request, db)
    return _xml(_ms(_resp(request.url.path, _principal_props(user.id))))


@router.api_route("/principals/{user_id}/", methods=["PROPFIND"])
async def propfind_principal(
    request: Request, user_id: int, db: Session = Depends(get_db)
) -> Response:
    user: User = authenticate_caldav(request, db)
    if user.id != user_id:
        raise HTTPException(status_code=403)
    return _xml(_ms(_resp(request.url.path, _principal_props(user.id))))


# ── PROPFIND calendar home-set ────────────────────────────────────────────────

@router.api_route("/calendars/{user_id}/", methods=["PROPFIND"])
async def propfind_home(
    request: Request, user_id: int, db: Session = Depends(get_db)
) -> Response:
    user: User = authenticate_caldav(request, db)
    if user.id != user_id:
        raise HTTPException(status_code=403)
    uid = user.id

    home_props = (
        "<D:resourcetype><D:collection/></D:resourcetype>"
        "<D:displayname>FinLife</D:displayname>"
        f"<C:calendar-home-set><D:href>/caldav/calendars/{uid}/</D:href></C:calendar-home-set>"
    )
    depth = request.headers.get("Depth", "0")
    inner = _resp(f"/caldav/calendars/{uid}/", home_props)
    if depth != "0":
        inner += _resp(f"/caldav/calendars/{uid}/tasks/", _calendar_props(uid))
    return _xml(_ms(inner))


# ── PROPFIND tasks calendar (lists all task items) ────────────────────────────

@router.api_route("/calendars/{user_id}/tasks/", methods=["PROPFIND"])
async def propfind_tasks(
    request: Request, user_id: int, db: Session = Depends(get_db)
) -> Response:
    user: User = authenticate_caldav(request, db)
    if user.id != user_id:
        raise HTTPException(status_code=403)
    uid = user.id

    inner = _resp(f"/caldav/calendars/{uid}/tasks/", _calendar_props(uid))

    depth = request.headers.get("Depth", "0")
    if depth != "0":
        tasks = (
            db.query(TaskModel)
            .filter(TaskModel.account_id == uid, TaskModel.status != "ARCHIVED")
            .all()
        )
        for task in tasks:
            fname = f"task-{task.task_id}.ics"
            item_props = (
                f"<D:getetag>{ical.task_etag(task)}</D:getetag>"
                "<D:getcontenttype>text/calendar; charset=utf-8</D:getcontenttype>"
            )
            inner += _resp(f"/caldav/calendars/{uid}/tasks/{fname}", item_props)

    return _xml(_ms(inner))


# ── REPORT calendar-query (syncs all tasks with content) ─────────────────────

@router.api_route("/calendars/{user_id}/tasks/", methods=["REPORT"])
async def report_tasks(
    request: Request, user_id: int, db: Session = Depends(get_db)
) -> Response:
    user: User = authenticate_caldav(request, db)
    if user.id != user_id:
        raise HTTPException(status_code=403)
    uid = user.id

    tasks = (
        db.query(TaskModel)
        .filter(TaskModel.account_id == uid, TaskModel.status != "ARCHIVED")
        .all()
    )
    task_ids = [t.task_id for t in tasks]
    reminders_by_task: dict[int, list] = {}
    if task_ids:
        for r in db.query(TaskReminderModel).filter(TaskReminderModel.task_id.in_(task_ids)).all():
            reminders_by_task.setdefault(r.task_id, []).append(r)

    inner = ""
    for task in tasks:
        fname = f"task-{task.task_id}.ics"
        vtodo = ical.task_to_vcalendar(task, reminders_by_task.get(task.task_id))
        item_props = (
            f"<D:getetag>{ical.task_etag(task)}</D:getetag>"
            f"<C:calendar-data>{vtodo}</C:calendar-data>"
        )
        inner += _resp(f"/caldav/calendars/{uid}/tasks/{fname}", item_props)

    return _xml(_ms(inner))


# ── GET individual task ───────────────────────────────────────────────────────

@router.get("/calendars/{user_id}/tasks/{filename}")
async def get_task(
    request: Request, user_id: int, filename: str, db: Session = Depends(get_db)
) -> Response:
    user: User = authenticate_caldav(request, db)
    if user.id != user_id:
        raise HTTPException(status_code=403)

    task = _get_task_or_404(filename, user.id, db)
    reminders = db.query(TaskReminderModel).filter(TaskReminderModel.task_id == task.task_id).all()
    return Response(
        content=ical.task_to_vcalendar(task, reminders),
        media_type=_CT_ICS,
        headers={"ETag": ical.task_etag(task), "DAV": _DAV_CAPS},
    )


# ── PUT create/update task ────────────────────────────────────────────────────

@router.api_route("/calendars/{user_id}/tasks/{filename}", methods=["PUT"])
async def put_task(
    request: Request, user_id: int, filename: str, db: Session = Depends(get_db)
) -> Response:
    user: User = authenticate_caldav(request, db)
    if user.id != user_id:
        raise HTTPException(status_code=403)

    body_bytes = await request.body()
    vtodo = ical.parse_vtodo(body_bytes.decode("utf-8", errors="replace"))

    m = _FILENAME_RE.match(filename)
    if m:
        task_id = int(m.group(1))
        task = (
            db.query(TaskModel)
            .filter(TaskModel.task_id == task_id, TaskModel.account_id == user.id)
            .first()
        )
        if task:
            _apply_vtodo(task, vtodo)
            db.commit()
            return Response(status_code=204, headers={"ETag": ical.task_etag(task)})

    # New task (iOS is creating a task with a client-generated filename)
    task = TaskModel(
        account_id=user.id,
        title=vtodo.get("title") or "Без названия",
        note=vtodo.get("note"),
        due_date=vtodo.get("due_date"),
        due_time=vtodo.get("due_time"),
        due_kind=vtodo.get("due_kind", "NONE"),
        status=vtodo.get("status", "ACTIVE"),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    new_fname = f"task-{task.task_id}.ics"
    return Response(
        status_code=201,
        headers={
            "Location": f"/caldav/calendars/{user_id}/tasks/{new_fname}",
            "ETag": ical.task_etag(task),
        },
    )


# ── DELETE task ───────────────────────────────────────────────────────────────

@router.api_route("/calendars/{user_id}/tasks/{filename}", methods=["DELETE"])
async def delete_task(
    request: Request, user_id: int, filename: str, db: Session = Depends(get_db)
) -> Response:
    user: User = authenticate_caldav(request, db)
    if user.id != user_id:
        raise HTTPException(status_code=403)

    task = _get_task_or_404(filename, user.id, db)
    task.status = "ARCHIVED"
    db.commit()
    return Response(status_code=204)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_task_or_404(filename: str, account_id: int, db: Session) -> TaskModel:
    m = _FILENAME_RE.match(filename)
    if not m:
        raise HTTPException(status_code=404)
    task = (
        db.query(TaskModel)
        .filter(TaskModel.task_id == int(m.group(1)), TaskModel.account_id == account_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404)
    return task


def _apply_vtodo(task: TaskModel, vtodo: dict) -> None:
    if "title" in vtodo and vtodo["title"]:
        task.title = vtodo["title"]
    if "note" in vtodo:
        task.note = vtodo["note"]
    if "status" in vtodo:
        new_status = vtodo["status"]
        if new_status == "DONE" and task.status != "DONE":
            task.completed_at = datetime.now(timezone.utc)
        elif new_status == "ACTIVE" and task.status == "DONE":
            task.completed_at = None
        task.status = new_status
    if "due_date" in vtodo:
        task.due_date = vtodo["due_date"]
        task.due_kind = vtodo.get("due_kind", "DATE")
    if "due_time" in vtodo:
        task.due_time = vtodo["due_time"]
