"""
Unit conversion utilities.

Converts between common food-service units so that inventory quantities
are stored in a consistent base unit per item.

Design principles:
- All conversions are declarative (a conversion table), not imperative.
- Unknown unit pairs return None — callers must handle this.
- No floating-point string parsing; callers are responsible for parsing.
"""

from typing import NamedTuple

# ---------------------------------------------------------------------------
# Conversion table — (from_unit, to_unit) -> multiplier
# E.g. ("g", "kg") -> 0.001 means 1g = 0.001 kg
# ---------------------------------------------------------------------------

_CONVERSIONS: dict[tuple[str, str], float] = {
    # Mass
    ("g", "kg"): 0.001,
    ("kg", "g"): 1000.0,
    ("mg", "g"): 0.001,
    ("g", "mg"): 1000.0,
    ("mg", "kg"): 0.000001,
    ("kg", "mg"): 1_000_000.0,
    ("oz", "g"): 28.3495,
    ("g", "oz"): 1 / 28.3495,
    ("oz", "kg"): 0.0283495,
    ("kg", "oz"): 1 / 0.0283495,
    ("lb", "kg"): 0.453592,
    ("kg", "lb"): 1 / 0.453592,
    ("lb", "g"): 453.592,
    ("g", "lb"): 1 / 453.592,
    ("lb", "oz"): 16.0,
    ("oz", "lb"): 1 / 16.0,
    # Volume
    ("ml", "l"): 0.001,
    ("l", "ml"): 1000.0,
    ("cl", "l"): 0.01,
    ("l", "cl"): 100.0,
    ("dl", "l"): 0.1,
    ("l", "dl"): 10.0,
    ("fl oz", "l"): 0.0295735,
    ("l", "fl oz"): 1 / 0.0295735,
    ("fl oz", "ml"): 29.5735,
    ("ml", "fl oz"): 1 / 29.5735,
    ("cup", "ml"): 236.588,
    ("ml", "cup"): 1 / 236.588,
    ("cup", "l"): 0.236588,
    ("l", "cup"): 1 / 0.236588,
    ("tbsp", "ml"): 14.7868,
    ("tsp", "ml"): 4.92892,
    ("gal", "l"): 3.78541,
    ("l", "gal"): 1 / 3.78541,
    ("qt", "l"): 0.946353,
    ("pt", "l"): 0.473176,
    # Count (no-op conversions — only for identity mapping)
    ("unit", "unit"): 1.0,
    ("each", "unit"): 1.0,
    ("unit", "each"): 1.0,
    ("piece", "unit"): 1.0,
    ("unit", "piece"): 1.0,
    ("pack", "pack"): 1.0,
    ("box", "box"): 1.0,
    ("case", "case"): 1.0,
    ("bag", "bag"): 1.0,
    ("can", "can"): 1.0,
    ("bottle", "bottle"): 1.0,
}

# Normalise aliases so callers can use "KG", "Kg", etc.
_UNIT_ALIASES: dict[str, str] = {
    "kilogram": "kg",
    "kilograms": "kg",
    "gram": "g",
    "grams": "g",
    "milligram": "mg",
    "milligrams": "mg",
    "ounce": "oz",
    "ounces": "oz",
    "pound": "lb",
    "pounds": "lb",
    "lbs": "lb",
    "litre": "l",
    "liter": "l",
    "litres": "l",
    "liters": "l",
    "millilitre": "ml",
    "milliliter": "ml",
    "millilitres": "ml",
    "milliliters": "ml",
    "centilitre": "cl",
    "decilitre": "dl",
    "gallon": "gal",
    "gallons": "gal",
    "quart": "qt",
    "quarts": "qt",
    "pint": "pt",
    "pints": "pt",
    "tablespoon": "tbsp",
    "tablespoons": "tbsp",
    "teaspoon": "tsp",
    "teaspoons": "tsp",
    "fluid ounce": "fl oz",
    "fluid ounces": "fl oz",
    "each": "unit",
    "pieces": "unit",
    "pcs": "unit",
    "ea": "unit",
}


def _normalise(unit: str) -> str:
    """Lowercase and resolve aliases."""
    lower = unit.strip().lower()
    return _UNIT_ALIASES.get(lower, lower)


def convert(
    value: float,
    from_unit: str,
    to_unit: str,
) -> float | None:
    """
    Convert `value` from `from_unit` to `to_unit`.

    Returns the converted float, or None if the conversion is unknown.
    """
    from_u = _normalise(from_unit)
    to_u = _normalise(to_unit)

    if from_u == to_u:
        return value

    multiplier = _CONVERSIONS.get((from_u, to_u))
    if multiplier is None:
        return None

    return value * multiplier


def are_compatible(from_unit: str, to_unit: str) -> bool:
    """Return True if convert() will succeed for this pair."""
    from_u = _normalise(from_unit)
    to_u = _normalise(to_unit)
    return from_u == to_u or (from_u, to_u) in _CONVERSIONS


def normalise_unit(unit: str) -> str:
    """Return the canonical form of a unit string."""
    return _normalise(unit)
