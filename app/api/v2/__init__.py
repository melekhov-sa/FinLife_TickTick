"""
API v2 — JSON-first endpoints for the Next.js frontend.

Coexists with SSR pages (app/api/v1/pages.py) which remain unchanged.
Auth: same session cookie as SSR (credentials: 'include' from frontend).
"""
from fastapi import APIRouter

from . import me, dashboard, projects, tasks, task_attachments, notifications, notification_settings, efficiency, habits, subscriptions, events, knowledge, strategy, finance, plan, profile, auth, budget, goals, planned_ops, analytics, push, shared_lists

router = APIRouter(prefix="/api/v2", tags=["v2"])
router.include_router(auth.router)
router.include_router(me.router)
router.include_router(dashboard.router)
router.include_router(projects.router)
router.include_router(tasks.router)
router.include_router(task_attachments.router)
router.include_router(notifications.router)
router.include_router(notification_settings.router)
router.include_router(efficiency.router)
router.include_router(habits.router)
router.include_router(subscriptions.router)
router.include_router(events.router)
router.include_router(knowledge.router)
router.include_router(strategy.router)
router.include_router(finance.router)
router.include_router(plan.router)
router.include_router(profile.router)
router.include_router(budget.router)
router.include_router(goals.router)
router.include_router(planned_ops.router)
router.include_router(analytics.router)
router.include_router(push.router)
router.include_router(shared_lists.router)
