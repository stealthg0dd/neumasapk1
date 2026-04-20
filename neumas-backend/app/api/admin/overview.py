from fastapi import APIRouter, Depends

from app.core.security import get_current_admin
from app.db.repositories.admin import AdminRepository

router = APIRouter(prefix="/api/admin/overview", tags=["admin"])

@router.get("/")
def get_admin_overview(repo: AdminRepository = Depends(), user=Depends(get_current_admin)):
    return repo.get_overview()
