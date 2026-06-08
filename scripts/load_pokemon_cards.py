"""
Load Pokemon card data from pokemontcg/pokemon-tcg-data GitHub repository.

Usage:
    python scripts/load_pokemon_cards.py

Downloads all card JSON files from the GitHub API and inserts/updates
the pokemon_cards table. Safe to re-run — uses upsert (ON CONFLICT DO UPDATE).

Source: https://github.com/PokemonTCG/pokemon-tcg-data/tree/master/cards/en
"""
import json
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.infrastructure.db.session import SessionLocal

GITHUB_API_SETS = "https://api.github.com/repos/PokemonTCG/pokemon-tcg-data/contents/cards/en"
GITHUB_RAW_BASE = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en"

HEADERS = {
    "User-Agent": "FinLife-PokemonLoader/1.0",
    "Accept": "application/vnd.github.v3+json",
}


def fetch_json(url: str) -> dict | list:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def load_set(set_filename: str) -> list[dict]:
    url = f"{GITHUB_RAW_BASE}/{set_filename}"
    req = urllib.request.Request(url, headers={"User-Agent": "FinLife-PokemonLoader/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def main() -> None:
    print("Fetching set list from GitHub...")
    try:
        contents = fetch_json(GITHUB_API_SETS)
    except urllib.error.URLError as e:
        print(f"ERROR: Cannot reach GitHub: {e}")
        print("Check network access and try again.")
        sys.exit(1)

    json_files = [f for f in contents if f["name"].endswith(".json")]
    print(f"Found {len(json_files)} sets.")

    db = SessionLocal()
    total_inserted = 0
    total_updated = 0

    try:
        for i, file_info in enumerate(json_files, 1):
            set_filename = file_info["name"]
            set_id = set_filename.replace(".json", "")
            print(f"[{i}/{len(json_files)}] Loading {set_id}...", end=" ", flush=True)

            try:
                cards = load_set(set_filename)
            except Exception as e:
                print(f"SKIP ({e})")
                continue

            batch = []
            for card in cards:
                images = card.get("images", {})
                batch.append({
                    "id": card["id"],
                    "name": card["name"],
                    "set_id": card.get("set", {}).get("id", set_id),
                    "set_name": card.get("set", {}).get("name", set_id),
                    "number": card.get("number", ""),
                    "rarity": card.get("rarity"),
                    "supertype": card.get("supertype"),
                    "image_url_small": images.get("small"),
                    "image_url_large": images.get("large"),
                })

            if batch:
                result = db.execute(
                    text("""
                        INSERT INTO pokemon_cards
                            (id, name, set_id, set_name, number, rarity, supertype,
                             image_url_small, image_url_large)
                        VALUES
                            (:id, :name, :set_id, :set_name, :number, :rarity, :supertype,
                             :image_url_small, :image_url_large)
                        ON CONFLICT (id) DO UPDATE SET
                            name            = EXCLUDED.name,
                            set_id          = EXCLUDED.set_id,
                            set_name        = EXCLUDED.set_name,
                            number          = EXCLUDED.number,
                            rarity          = EXCLUDED.rarity,
                            supertype       = EXCLUDED.supertype,
                            image_url_small = EXCLUDED.image_url_small,
                            image_url_large = EXCLUDED.image_url_large
                    """),
                    batch,
                )
                db.commit()
                total_inserted += len(batch)
                print(f"{len(batch)} cards OK")
            else:
                print("empty")

            # Small delay to avoid GitHub rate limits
            time.sleep(0.3)

    finally:
        db.close()

    print(f"\nDone. Total cards processed: {total_inserted}")


if __name__ == "__main__":
    main()
