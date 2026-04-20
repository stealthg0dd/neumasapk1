"""
Fuzzy-matching utilities for vendor and item name normalisation.

Uses a simple token-based similarity approach (no heavy ML dependency).
Falls back to sequence matching when token overlap is insufficient.

All matching is case-insensitive. Punctuation is stripped before comparison.
"""

import re
from difflib import SequenceMatcher

# Characters to strip before comparison
_PUNCTUATION = re.compile(r"[^\w\s]", re.UNICODE)
# Extra whitespace
_WHITESPACE = re.compile(r"\s+")

# Common food-service stop words that add noise to matching
_STOP_WORDS = frozenset({
    "the", "a", "an", "and", "or", "of", "for", "by", "to",
    "ltd", "llc", "inc", "co", "corp", "limited",
    "foods", "food", "fresh", "premium", "quality", "natural",
    "organic", "supply", "supplies", "trading",
})


def _normalise(text: str) -> str:
    """Lowercase, strip punctuation and extra whitespace."""
    text = text.lower()
    text = _PUNCTUATION.sub(" ", text)
    text = _WHITESPACE.sub(" ", text).strip()
    return text


def _tokens(text: str) -> set[str]:
    return {t for t in _normalise(text).split() if t not in _STOP_WORDS}


def token_overlap_score(a: str, b: str) -> float:
    """
    Jaccard similarity over meaningful tokens.

    Returns a float in [0, 1] where 1 is identical.
    """
    ta = _tokens(a)
    tb = _tokens(b)
    if not ta and not tb:
        return 1.0
    if not ta or not tb:
        return 0.0
    intersection = ta & tb
    union = ta | tb
    return len(intersection) / len(union)


def sequence_score(a: str, b: str) -> float:
    """
    SequenceMatcher ratio after normalisation.

    Returns a float in [0, 1].
    """
    return SequenceMatcher(None, _normalise(a), _normalise(b)).ratio()


def similarity(a: str, b: str) -> float:
    """
    Combined similarity score: weighted average of token overlap and sequence match.

    Returns a float in [0, 1] where 1 is a perfect match.
    """
    token = token_overlap_score(a, b)
    seq = sequence_score(a, b)
    # Token overlap is more meaningful for names; weight it higher
    return 0.6 * token + 0.4 * seq


def best_match(
    query: str,
    candidates: list[str],
    threshold: float = 0.7,
) -> tuple[str, float] | None:
    """
    Find the best matching candidate for the query.

    Returns (best_candidate, score) or None if no candidate exceeds threshold.
    """
    best: tuple[str, float] | None = None
    for candidate in candidates:
        score = similarity(query, candidate)
        if score >= threshold and (best is None or score > best[1]):
            best = (candidate, score)
    return best


def rank_candidates(
    query: str,
    candidates: list[str],
    threshold: float = 0.0,
) -> list[tuple[str, float]]:
    """
    Return all candidates with their scores, sorted by score descending.

    Useful for showing suggestions to operators.
    """
    scored = [(c, similarity(query, c)) for c in candidates]
    return sorted(
        [(c, s) for c, s in scored if s >= threshold],
        key=lambda x: x[1],
        reverse=True,
    )
