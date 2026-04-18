# Re-applies the entity_map to an Anthropic response, restoring original entity values.
from __future__ import annotations


# Replace every abstract placeholder in `response` with its original value from entity_map.
# entity_map maps "<PERSON_1>" → "Jane Smith"; replacements are applied longest-key-first
# to avoid partial-match collisions (e.g. <DATE_1> inside <DATE_10>).
def apply_entity_map(response: str, entity_map: dict[str, str]) -> str:
    result = response
    for placeholder in sorted(entity_map, key=len, reverse=True):
        result = result.replace(placeholder, entity_map[placeholder])
    return result
