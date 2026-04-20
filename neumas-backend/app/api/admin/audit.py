from fastapi import APIRouter, Depends, Query

from app.core.security import get_current_admin
from app.db.repositories.admin import AdminRepository

router = APIRouter(prefix="/api/admin/audit", tags=["admin"])

@router.get("/")
def list_audit_logs(org_id: str = Query(None), user_id: str = Query(None), event_type: str = Query(None), date_from: str = Query(None), date_to: str = Query(None), repo: AdminRepository = Depends(), user=Depends(get_current_admin)):
    return repo.list_audit_logs(org_id, user_id, event_type, date_from, date_to)
