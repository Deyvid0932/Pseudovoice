import re
import unicodedata


def normalize(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text.casefold())
    folded = "".join(char for char in folded if not unicodedata.combining(char))
    return " ".join(re.findall(r"[^\W_]+", folded))


def match_wake_phrase(text: str, phrase: str, characters: list[dict]) -> dict:
    normalized = normalize(text)
    prefix = normalize(phrase)
    if not prefix:
        return {"character_id": None, "remaining_text": ""}
    matches = []
    for character in characters:
        name = normalize(character["name"])
        command = f"{prefix} {name}"
        if name and (normalized == command or normalized.startswith(command + " ")):
            matches.append((len(command.split()), character["id"]))
    if not matches:
        return {"character_id": None, "remaining_text": ""}
    longest = max(length for length, _ in matches)
    candidates = {identity for length, identity in matches if length == longest}
    if len(candidates) != 1:
        return {"character_id": None, "remaining_text": ""}
    words = list(re.finditer(r"[^\W_]+", text))
    remainder = text[words[longest - 1].end():].lstrip(" ,.!?:;—-") if len(words) >= longest else ""
    return {"character_id": candidates.pop(), "remaining_text": remainder}
