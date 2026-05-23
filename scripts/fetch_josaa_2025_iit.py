#!/usr/bin/env python3
"""Fetch and normalize JoSAA 2025 IIT opening/closing ranks.

The official site is an ASP.NET WebForms page. This script follows the same
postback sequence as the UI:

round -> institute type -> institute ALL -> branch ALL -> seat type ALL -> submit
"""

from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup


JOSAA_URL = "https://josaa.admissions.nic.in/applicant/SeatAllotmentResult/CurrentORCR.aspx"
NIRF_URLS = {
    "ranked": "https://www.nirfindia.org/Rankings/2025/EngineeringRanking.html",
    "101-150": "https://www.nirfindia.org/Rankings/2025/EngineeringRanking150.html",
    "151-200": "https://www.nirfindia.org/Rankings/2025/EngineeringRanking200.html",
    "201-300": "https://www.nirfindia.org/Rankings/2025/EngineeringRanking300.html",
}

FIELD_ROUND = "ctl00$ContentPlaceHolder1$ddlroundno"
FIELD_INST_TYPE = "ctl00$ContentPlaceHolder1$ddlInstype"
FIELD_INSTITUTE = "ctl00$ContentPlaceHolder1$ddlInstitute"
FIELD_BRANCH = "ctl00$ContentPlaceHolder1$ddlBranch"
FIELD_SEAT_TYPE = "ctl00$ContentPlaceHolder1$ddlSeattype"
FIELD_SUBMIT = "ctl00$ContentPlaceHolder1$btnSubmit"
FIELD_SECURITY = "ctl00$hdnSecKey"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}


@dataclass(frozen=True)
class FormState:
    html: str

    @property
    def soup(self) -> BeautifulSoup:
        return BeautifulSoup(self.html, "html.parser")

    def hidden_fields(self) -> dict[str, str]:
        soup = self.soup
        fields: dict[str, str] = {}
        for name in ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION", "__VIEWSTATEENCRYPTED"]:
            tag = soup.find("input", {"name": name})
            if tag is not None:
                fields[name] = tag.get("value", "")
        return fields


def clean_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = value.replace("\xa0", " ")
    return re.sub(r"\s+", " ", value).strip()


def slugify(value: str) -> str:
    value = value.lower()
    value = value.replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def canonical_institute_name(name: str) -> str:
    name = clean_text(name)
    name = name.replace("Indian Institute of Technology, ", "Indian Institute of Technology ")
    aliases = {
        "Indian Institute of Technology (ISM) Dhanbad": "Indian Institute of Technology (Indian School of Mines) Dhanbad",
        "Indian Institute of Technology (BHU) Varanasi": "Indian Institute of Technology (Banaras Hindu University) Varanasi",
    }
    return aliases.get(name, name)


def institute_id(name: str) -> str:
    name = canonical_institute_name(name)
    aliases = {
        "Indian Institute of Technology (Indian School of Mines) Dhanbad": "iit-ism-dhanbad",
        "Indian Institute of Technology (Banaras Hindu University) Varanasi": "iit-bhu-varanasi",
    }
    if name in aliases:
        return aliases[name]
    return slugify(name.replace("Indian Institute of Technology", "IIT"))


def parse_rank(raw: str) -> dict[str, Any]:
    raw = clean_text(raw)
    is_preparatory = raw.upper().endswith("P")
    numeric = re.sub(r"[^0-9]", "", raw)
    return {
        "raw": raw,
        "rank": int(numeric) if numeric else None,
        "is_preparatory": is_preparatory,
    }


def select_options(html: str, select_id: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    select = soup.find("select", {"id": select_id})
    if select is None:
        return []
    options = []
    for option in select.find_all("option"):
        options.append(
            {
                "value": option.get("value", ""),
                "label": clean_text(option.get_text(" ", strip=True)),
                "selected": "selected" in option.attrs,
            }
        )
    return options


def postback(
    session: requests.Session,
    state: FormState,
    *,
    event_target: str,
    values: dict[str, str],
) -> FormState:
    payload = {
        "__EVENTTARGET": event_target,
        "__EVENTARGUMENT": "",
        "__LASTFOCUS": "",
        **state.hidden_fields(),
        FIELD_SECURITY: "",
        **values,
    }
    response = session.post(JOSAA_URL, data=payload, headers=HEADERS, timeout=90)
    response.raise_for_status()
    return FormState(response.text)


def submit(session: requests.Session, state: FormState, values: dict[str, str]) -> FormState:
    payload = {
        "__EVENTTARGET": "",
        "__EVENTARGUMENT": "",
        "__LASTFOCUS": "",
        **state.hidden_fields(),
        FIELD_SECURITY: "",
        **values,
        FIELD_SUBMIT: "Submit",
    }
    response = session.post(JOSAA_URL, data=payload, headers=HEADERS, timeout=180)
    response.raise_for_status()
    return FormState(response.text)


def fetch_round(round_no: int, raw_dir: Path, pause_seconds: float) -> tuple[str, dict[str, Any]]:
    session = requests.Session()
    session.headers.update(HEADERS)

    initial = session.get(JOSAA_URL, timeout=90)
    initial.raise_for_status()
    state = FormState(initial.text)

    selected: dict[str, str] = {FIELD_ROUND: str(round_no)}
    state = postback(session, state, event_target=FIELD_ROUND, values=selected)

    selected[FIELD_INST_TYPE] = "IIT"
    state = postback(session, state, event_target=FIELD_INST_TYPE, values=selected)
    institute_options = select_options(state.html, "ctl00_ContentPlaceHolder1_ddlInstitute")

    selected[FIELD_INSTITUTE] = "ALL"
    state = postback(session, state, event_target=FIELD_INSTITUTE, values=selected)
    branch_options = select_options(state.html, "ctl00_ContentPlaceHolder1_ddlBranch")

    selected[FIELD_BRANCH] = "ALL"
    state = postback(session, state, event_target=FIELD_BRANCH, values=selected)
    seat_type_options = select_options(state.html, "ctl00_ContentPlaceHolder1_ddlSeattype")

    selected[FIELD_SEAT_TYPE] = "ALL"
    time.sleep(pause_seconds)
    state = submit(session, state, values=selected)

    raw_dir.mkdir(parents=True, exist_ok=True)
    raw_path = raw_dir / f"iit-round-{round_no}.html"
    raw_path.write_text(state.html, encoding="utf-8")

    metadata = {
        "institutes": [o for o in institute_options if o["value"] not in {"", "0", "ALL"}],
        "branches": [o for o in branch_options if o["value"] not in {"", "0", "ALL"}],
        "seat_types": [o for o in seat_type_options if o["value"] not in {"", "0", "ALL"}],
        "raw_path": str(raw_path),
    }
    return state.html, metadata


def parse_cutoff_rows(html: str, year: int, round_no: int) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", id=re.compile("GridView1$"))
    if table is None:
        raise RuntimeError(f"No cutoff table found for round {round_no}")

    rows: list[dict[str, Any]] = []
    for tr in table.find_all("tr")[1:]:
        cells = [clean_text(td.get_text(" ", strip=True)) for td in tr.find_all("td")]
        if len(cells) != 7:
            continue

        institute_name, program_name, quota, seat_type, gender, opening_raw, closing_raw = cells
        opening = parse_rank(opening_raw)
        closing = parse_rank(closing_raw)
        canonical_name = canonical_institute_name(institute_name)
        rows.append(
            {
                "year": year,
                "round": round_no,
                "institute_id": institute_id(institute_name),
                "institute_name": clean_text(institute_name),
                "canonical_institute_name": canonical_name,
                "program_name": program_name,
                "quota": quota,
                "seat_type": seat_type,
                "gender": gender,
                "opening_rank_raw": opening["raw"],
                "opening_rank": opening["rank"],
                "opening_is_preparatory": opening["is_preparatory"],
                "closing_rank_raw": closing["raw"],
                "closing_rank": closing["rank"],
                "closing_is_preparatory": closing["is_preparatory"],
            }
        )
    return rows


def first_text_before_child(tag: Any) -> str:
    parts = []
    for child in tag.children:
        if getattr(child, "name", None) is not None:
            break
        parts.append(str(child))
    return clean_text(" ".join(parts))


def fetch_nirf() -> dict[str, dict[str, Any]]:
    session = requests.Session()
    session.headers.update(HEADERS)
    nirf: dict[str, dict[str, Any]] = {}

    ranked_html = session.get(NIRF_URLS["ranked"], timeout=90).text
    ranked_soup = BeautifulSoup(ranked_html, "html.parser")
    ranked_table = ranked_soup.find("table", id="tbl_overall")
    if ranked_table:
        ranked_body = ranked_table.find("tbody") or ranked_table
        for tr in ranked_body.find_all("tr", recursive=False):
            cells = tr.find_all("td", recursive=False)
            if len(cells) < 6:
                continue
            name = first_text_before_child(cells[1]) or clean_text(cells[1].get_text(" ", strip=True)).split("More Details")[0]
            if "Indian Institute of Technology" not in name:
                continue
            city = clean_text(cells[2].get_text(" ", strip=True))
            state = clean_text(cells[3].get_text(" ", strip=True))
            score = clean_text(cells[4].get_text(" ", strip=True))
            rank = clean_text(cells[5].get_text(" ", strip=True))
            key = canonical_institute_name(f"{name} {city}" if name == "Indian Institute of Technology (Indian School of Mines)" else name)
            nirf[key] = {
                "nirf_name": name,
                "city": city,
                "state": state,
                "nirf_score": float(score) if score else None,
                "nirf_engineering_rank": int(rank) if rank else None,
                "nirf_rank_band": None,
                "nirf_sort_order": int(rank) if rank else 9999,
            }

    for band, url in NIRF_URLS.items():
        if band == "ranked":
            continue
        band_html = session.get(url, timeout=90).text
        band_soup = BeautifulSoup(band_html, "html.parser")
        table = band_soup.find("table")
        if not table:
            continue
        band_start = int(band.split("-")[0])
        band_body = table.find("tbody") or table
        for tr in band_body.find_all("tr", recursive=False):
            cells = tr.find_all("td", recursive=False)
            if len(cells) < 3:
                continue
            name = clean_text(cells[0].get_text(" ", strip=True))
            if "Indian Institute of Technology" not in name:
                continue
            key = canonical_institute_name(name)
            nirf[key] = {
                "nirf_name": name,
                "city": clean_text(cells[1].get_text(" ", strip=True)),
                "state": clean_text(cells[2].get_text(" ", strip=True)),
                "nirf_score": None,
                "nirf_engineering_rank": None,
                "nirf_rank_band": band,
                "nirf_sort_order": band_start,
            }

    return nirf


def build_institutes(institute_options: list[dict[str, str]], nirf: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    institutes = []
    for option in institute_options:
        josaa_name = clean_text(option["label"])
        canonical_name = canonical_institute_name(josaa_name)
        info = nirf.get(canonical_name, {})
        institutes.append(
            {
                "id": institute_id(josaa_name),
                "josaa_code": option["value"],
                "josaa_name": josaa_name,
                "canonical_name": canonical_name,
                "institute_type": "Indian Institute of Technology",
                "nirf_name": info.get("nirf_name"),
                "city": info.get("city"),
                "state": info.get("state"),
                "nirf_score": info.get("nirf_score"),
                "nirf_engineering_rank": info.get("nirf_engineering_rank"),
                "nirf_rank_band": info.get("nirf_rank_band"),
                "nirf_sort_order": info.get("nirf_sort_order", 9999),
            }
        )
    return sorted(institutes, key=lambda item: (item["nirf_sort_order"], item["canonical_name"]))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_js_assignment(path: Path, variable_name: str, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"window.{variable_name} = {json.dumps(payload, ensure_ascii=False)};\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2025)
    parser.add_argument("--rounds", default="1,2,3,4,5,6", help="Comma-separated round numbers")
    parser.add_argument("--pause", type=float, default=0.4, help="Pause before large submit request")
    parser.add_argument("--force", action="store_true", help="Refetch raw HTML even if present")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    raw_dir = root / "data" / "raw" / f"josaa-{args.year}"
    processed_dir = root / "data" / "processed"
    rounds = [int(value.strip()) for value in args.rounds.split(",") if value.strip()]

    all_rows: list[dict[str, Any]] = []
    all_institute_options: dict[str, dict[str, str]] = {}
    all_seat_types: dict[str, str] = {}
    all_genders: set[str] = set()
    sources: list[dict[str, Any]] = []

    for round_no in rounds:
        raw_path = raw_dir / f"iit-round-{round_no}.html"
        if raw_path.exists() and not args.force:
            html = raw_path.read_text(encoding="utf-8")
            metadata = {
                "institutes": [
                    o
                    for o in select_options(html, "ctl00_ContentPlaceHolder1_ddlInstitute")
                    if o["value"] not in {"", "0", "ALL"}
                ],
                "branches": [
                    o
                    for o in select_options(html, "ctl00_ContentPlaceHolder1_ddlBranch")
                    if o["value"] not in {"", "0", "ALL"}
                ],
                "seat_types": [
                    o
                    for o in select_options(html, "ctl00_ContentPlaceHolder1_ddlSeattype")
                    if o["value"] not in {"", "0", "ALL"}
                ],
                "raw_path": str(raw_path),
            }
        else:
            print(f"Fetching JoSAA {args.year} IIT Round {round_no}...")
            html, metadata = fetch_round(round_no, raw_dir, args.pause)

        for option in metadata["institutes"]:
            all_institute_options[option["value"]] = option
        for option in metadata["seat_types"]:
            all_seat_types[option["value"]] = option["label"]

        rows = parse_cutoff_rows(html, args.year, round_no)
        for row in rows:
            all_genders.add(row["gender"])
            all_seat_types.setdefault(row["seat_type"], row["seat_type"])
        all_rows.extend(rows)
        sources.append({"round": round_no, "raw_path": str(raw_path), "rows": len(rows)})
        print(f"Parsed {len(rows)} rows for round {round_no}.")

    if not all_institute_options:
        first_html = (raw_dir / f"iit-round-{rounds[0]}.html").read_text(encoding="utf-8")
        names = sorted({row["institute_name"] for row in parse_cutoff_rows(first_html, args.year, rounds[0])})
        all_institute_options = {str(index + 1): {"value": str(index + 1), "label": name} for index, name in enumerate(names)}

    print("Fetching NIRF Engineering 2025 ranking metadata...")
    nirf = fetch_nirf()
    institutes = build_institutes(list(all_institute_options.values()), nirf)

    cutoff_payload = {
        "metadata": {
            "year": args.year,
            "institute_type": "Indian Institute of Technology",
            "default_round": 1,
            "source_url": JOSAA_URL,
            "rows": len(all_rows),
            "sources": sources,
        },
        "filters": {
            "rounds": rounds,
            "seat_types": sorted(set(row["seat_type"] for row in all_rows)),
            "genders": sorted(all_genders),
        },
        "cutoffs": all_rows,
    }
    write_json(processed_dir / f"cutoffs-{args.year}.json", cutoff_payload)
    write_json(processed_dir / f"institutes-{args.year}.json", {"metadata": {"year": args.year}, "institutes": institutes})
    write_js_assignment(processed_dir / f"cutoffs-{args.year}.js", "__JOSAA_CUTOFFS_2025__", cutoff_payload)
    write_js_assignment(processed_dir / f"institutes-{args.year}.js", "__JOSAA_INSTITUTES_2025__", {"metadata": {"year": args.year}, "institutes": institutes})

    missing = [item["canonical_name"] for item in institutes if item["nirf_sort_order"] == 9999]
    if missing:
        print("Warning: missing NIRF metadata for:")
        for name in missing:
            print(f"  - {name}")

    print(f"Wrote {len(all_rows)} cutoff rows and {len(institutes)} institutes.")


if __name__ == "__main__":
    main()
