from fastapi import APIRouter, Depends, Query
from app.core.security import get_current_admin
from app.db.repositories.admin import AdminRepository

router = APIRouter(prefix="/api/admin/usage", tags=["admin"])

@router.get("/")
def get_usage_metrics(org_id: str = Query(None), repo: AdminRepository = Depends(), user=Depends(get_current_admin)):
    return repo.get_usage_metrics(org_id)
