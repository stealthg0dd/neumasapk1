from fastapi import APIRouter, Depends, Query

from app.core.security import get_current_admin
from app.db.repositories.admin import AdminRepository

router = APIRouter(prefix="/api/admin/organizations", tags=["admin"])

@router.get("/")
async def list_organizations(q: str = Query(None), repo: AdminRepository = Depends(), user=Depends(get_current_admin)):
    return await repo.list_organizations(q)
