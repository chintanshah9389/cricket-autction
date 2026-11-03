import json
import os
import re
import sys
import urllib.request
from pathlib import Path

import openpyxl

EXCEL_PATH = Path(r"C:\Users\9389c\OneDrive\Desktop\CPL2027\TURF-MALE-FINAL.xlsx")
ROOT = Path(__file__).resolve().parents[1]
PLAYERS_JSON = ROOT / "data" / "players.json"
PHOTO_DIR = ROOT / "assets" / "players-photo" / "cpl2027"


def norm_header(value):
    return re.sub(r"\s+", " ", str(value or "").strip().lower().replace("_", " ").replace("-", " "))


def map_role(raw):
    key = re.sub(r"[\s_-]+", " ", str(raw or "").strip().upper())
    mapping = {
        "BATTER": "Batter",
        "BATSMAN": "Batter",
        "BOWLER": "Bowler",
        "ALL ROUNDER": "All-Rounder",
        "ALLROUNDER": "All-Rounder",
        "WICKET KEEPER": "Wicket-Keeper",
        "WICKETKEEPER": "Wicket-Keeper",
        "WK": "Wicket-Keeper",
    }
    return mapping.get(key, raw.strip() if raw else "Batter")


def map_category(raw):
    key = re.sub(r"\s+", " ", str(raw or "").strip().upper())
    mapping = {
        "RISING STAR": "RISING STAR",
        "KEY PLAYERS": "KEY PLAYERS",
        "KEY PLAYER": "KEY PLAYERS",
        "EVERGREEN": "EVERGREEN",
        "EVER GREEN": "EVERGREEN",
        "EVER-GREEN": "EVERGREEN",
    }
    return mapping.get(key, key or "RISING STAR")


def category_base_price(category):
    return {
        "RISING STAR": 500000,
        "KEY PLAYERS": 1000000,
        "EVERGREEN": 2000000,
    }.get(category, 500000)


def code_to_id(code, index):
    text = str(code or "").strip()
    digits = re.search(r"(\d+)$", text)
    if re.match(r"^CPL-R-", text, re.I) and digits:
        return 1000 + int(digits.group(1))
    if re.match(r"^CPL-K-", text, re.I) and digits:
        return 2000 + int(digits.group(1))
    if re.match(r"^CPL-E-", text, re.I) and digits:
        return 3000 + int(digits.group(1))
    if text.isdigit():
        return int(text)
    return 4000 + index


def pick(row, *aliases):
    compact = {re.sub(r"\s+", "", k): v for k, v in row.items()}
    for alias in aliases:
        key = norm_header(alias)
        if key in row and str(row[key]).strip() != "":
            return row[key]
        compact_key = re.sub(r"\s+", "", key)
        if compact_key in compact and str(compact[compact_key]).strip() != "":
            return compact[compact_key]
    return ""


def safe_filename(code, index, url):
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", str(code or f"player_{index}")).strip("_") or f"player_{index}"
    ext = ".jpg"
    path_part = str(url).split("?")[0]
    if "." in path_part.rsplit("/", 1)[-1]:
        maybe = "." + path_part.rsplit(".", 1)[-1].lower()
        if maybe in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
            ext = ".jpg" if maybe == ".jpeg" else maybe
    return f"{stem}{ext}"


def download_image(url, dest):
    if not url or not str(url).startswith(("http://", "https://")):
        return False
    req = urllib.request.Request(
        str(url),
        headers={"User-Agent": "Mozilla/5.0 (compatible; cricket-auction-importer/1.0)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()
        if not data:
            return False
        dest.write_bytes(data)
        return True
    except Exception as exc:
        print(f"FAIL {url} -> {exc}")
        return False


def load_rows(path):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    # Prefer a sheet that looks like player data
    chosen = None
    for name in wb.sheetnames:
        ws = wb[name]
        first = next(ws.iter_rows(values_only=True), None)
        headers = [norm_header(h) for h in (first or [])]
        joined = " ".join(headers)
        if any(token in joined for token in ("player", "category", "skill", "photo")):
            chosen = name
            break
    if chosen is None:
        chosen = wb.sheetnames[0]

    ws = wb[chosen]
    rows_iter = ws.iter_rows(values_only=True)
    headers = [norm_header(h) for h in next(rows_iter)]
    rows = []
    for values in rows_iter:
        record = {}
        empty = True
        for header, value in zip(headers, values):
            if not header:
                continue
            text = "" if value is None else str(value).strip()
            record[header] = text
            if text:
                empty = False
        if not empty:
            rows.append(record)
    wb.close()
    return chosen, headers, rows


def main():
    if not EXCEL_PATH.exists():
        print(f"Excel not found: {EXCEL_PATH}")
        sys.exit(1)

    sheet, headers, rows = load_rows(EXCEL_PATH)
    print(f"Sheet: {sheet}")
    print(f"Headers: {headers}")
    print(f"Rows: {len(rows)}")

    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    players = []
    downloaded = 0
    failed = 0

    for index, row in enumerate(rows, start=1):
        code = str(pick(row, "id", "player id", "code", "player code")).strip()
        name = str(pick(row, "player", "player name", "name", "full name")).strip()
        if not name:
            continue

        role = map_role(pick(row, "skill", "role", "speciality", "specialty"))
        category = map_category(
            pick(row, "category", "catagory", "cata gory", "player category")
        )
        location = str(pick(row, "location", "club", "current club", "area")).strip() or "—"
        mobile = str(pick(row, "mobile", "phone", "contact")).strip()
        age_raw = pick(row, "age")
        age = None
        try:
            age = int(float(age_raw)) if str(age_raw).strip() else None
        except Exception:
            age = None
        age_category = str(pick(row, "age category", "age-category", "age_category")).strip()
        photo_url = str(pick(row, "player photo", "photo", "image", "photo url", "image url")).strip()

        player_id = code_to_id(code, index)
        local_photo = "assets/placeholder.png"
        if photo_url.startswith(("http://", "https://")):
            filename = safe_filename(code or f"player_{player_id}", index, photo_url)
            dest = PHOTO_DIR / filename
            if dest.exists() or download_image(photo_url, dest):
                if dest.exists() and dest.stat().st_size > 0:
                    local_photo = f"assets/players-photo/cpl2027/{filename}".replace("\\", "/")
                    downloaded += 1
                else:
                    failed += 1
                    local_photo = photo_url
            else:
                failed += 1
                local_photo = photo_url
        elif photo_url:
            local_photo = photo_url

        players.append(
            {
                "id": player_id,
                "code": code or str(player_id),
                "name": name,
                "photo": local_photo,
                "role": role,
                "battingStyle": "N/A",
                "bowlingStyle": "N/A",
                "currentClub": location,
                "category": category,
                "ageCategory": age_category,
                "mobile": mobile,
                "age": age,
                "basePrice": category_base_price(category),
                "status": "not-auctioned",
                "bids": [],
                "finalPrice": None,
                "team": None,
            }
        )

    PLAYERS_JSON.write_text(json.dumps(players, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(players)} players -> {PLAYERS_JSON}")
    print(f"Photos downloaded/kept: {downloaded}, failed: {failed}, folder: {PHOTO_DIR}")


if __name__ == "__main__":
    main()
