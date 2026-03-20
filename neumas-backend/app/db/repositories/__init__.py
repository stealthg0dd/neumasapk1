"""Repository modules."""

from app.db.repositories.inventory import InventoryRepository, get_inventory_repository
from app.db.repositories.organizations import (
    OrganizationsRepository,
    get_organizations_repository,
)
from app.db.repositories.patterns import PatternsRepository, get_patterns_repository
from app.db.repositories.predictions import (
    PredictionsRepository,
    get_predictions_repository,
)
from app.db.repositories.properties import PropertiesRepository, get_properties_repository
from app.db.repositories.scans import ScansRepository, get_scans_repository
from app.db.repositories.shopping_lists import (
    ShoppingListsRepository,
    get_shopping_lists_repository,
)
from app.db.repositories.users import UsersRepository, get_users_repository

__all__ = [
    "InventoryRepository",
    "OrganizationsRepository",
    "PatternsRepository",
    "PredictionsRepository",
    "PropertiesRepository",
    "ScansRepository",
    "ShoppingListsRepository",
    "UsersRepository",
    "get_inventory_repository",
    "get_organizations_repository",
    "get_patterns_repository",
    "get_predictions_repository",
    "get_properties_repository",
    "get_scans_repository",
    "get_shopping_lists_repository",
    "get_users_repository",
]
