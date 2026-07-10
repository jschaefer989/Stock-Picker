"""SQLite persistence for saved portfolio analyses."""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

from models import (
    HoldingIn,
    PortfolioSnapshot,
    PortfolioSnapshotListItem,
    PortfolioSummary,
    RecommendationResponse,
)

# When running as a PyInstaller bundle (sys.frozen == True) the code lives
# inside a read-only temp directory (_MEIPASS).  Store the database next to
# the executable instead so user data persists across launches.
if getattr(sys, "frozen", False):
    DB_PATH = Path(sys.executable).parent / "stock_picker.db"
else:
    DB_PATH = Path(__file__).resolve().parent.parent / "stock_picker.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                label TEXT,
                holdings_count INTEGER NOT NULL,
                total_value REAL NOT NULL,
                holdings_json TEXT NOT NULL,
                summary_json TEXT NOT NULL,
                recommendations_json TEXT NOT NULL
            )
            """
        )
        conn.commit()


def save_snapshot(
    holdings: list[HoldingIn],
    summary: PortfolioSummary,
    recommendations: RecommendationResponse,
    label: str | None = None,
) -> PortfolioSnapshotListItem:
    holdings_json = json.dumps([h.model_dump() for h in holdings])
    summary_json = summary.model_dump_json()
    recommendations_json = recommendations.model_dump_json()

    with _connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO portfolio_snapshots
                (label, holdings_count, total_value, holdings_json, summary_json, recommendations_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                label,
                len(holdings),
                float(summary.total_value),
                holdings_json,
                summary_json,
                recommendations_json,
            ),
        )
        if cur.lastrowid is None:
            raise RuntimeError("Database did not return snapshot id.")
        snapshot_id = int(cur.lastrowid)
        row = conn.execute(
            """
            SELECT id, created_at, label, holdings_count, total_value
            FROM portfolio_snapshots
            WHERE id = ?
            """,
            (snapshot_id,),
        ).fetchone()

    if row is None:
        raise RuntimeError("Failed to load saved snapshot.")

    return PortfolioSnapshotListItem(
        id=int(row["id"]),
        created_at=str(row["created_at"]),
        label=str(row["label"]) if row["label"] is not None else None,
        holdings_count=int(row["holdings_count"]),
        total_value=float(row["total_value"]),
    )


def list_snapshots(limit: int = 25) -> list[PortfolioSnapshotListItem]:
    safe_limit = max(1, min(limit, 200))
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, created_at, label, holdings_count, total_value
            FROM portfolio_snapshots
            ORDER BY id DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()

    return [
        PortfolioSnapshotListItem(
            id=int(row["id"]),
            created_at=str(row["created_at"]),
            label=str(row["label"]) if row["label"] is not None else None,
            holdings_count=int(row["holdings_count"]),
            total_value=float(row["total_value"]),
        )
        for row in rows
    ]


def get_snapshot(snapshot_id: int) -> PortfolioSnapshot:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT id, created_at, label, holdings_json, summary_json, recommendations_json
            FROM portfolio_snapshots
            WHERE id = ?
            """,
            (snapshot_id,),
        ).fetchone()

    if row is None:
        raise KeyError(f"Snapshot {snapshot_id} not found")

    holdings_payload = json.loads(str(row["holdings_json"]))
    summary_payload = json.loads(str(row["summary_json"]))
    recommendations_payload = json.loads(str(row["recommendations_json"]))

    return PortfolioSnapshot(
        id=int(row["id"]),
        created_at=str(row["created_at"]),
        label=str(row["label"]) if row["label"] is not None else None,
        holdings=[HoldingIn.model_validate(item) for item in holdings_payload],
        summary=PortfolioSummary.model_validate(summary_payload),
        recommendations=RecommendationResponse.model_validate(recommendations_payload),
    )


def rename_snapshot(snapshot_id: int, label: str | None) -> PortfolioSnapshotListItem:
    normalized = label.strip() if isinstance(label, str) else None
    if normalized == "":
        normalized = None

    with _connect() as conn:
        cur = conn.execute(
            """
            UPDATE portfolio_snapshots
            SET label = ?
            WHERE id = ?
            """,
            (normalized, snapshot_id),
        )
        if cur.rowcount == 0:
            raise KeyError(f"Snapshot {snapshot_id} not found")

        row = conn.execute(
            """
            SELECT id, created_at, label, holdings_count, total_value
            FROM portfolio_snapshots
            WHERE id = ?
            """,
            (snapshot_id,),
        ).fetchone()

    if row is None:
        raise KeyError(f"Snapshot {snapshot_id} not found")

    return PortfolioSnapshotListItem(
        id=int(row["id"]),
        created_at=str(row["created_at"]),
        label=str(row["label"]) if row["label"] is not None else None,
        holdings_count=int(row["holdings_count"]),
        total_value=float(row["total_value"]),
    )


def delete_snapshot(snapshot_id: int) -> None:
    with _connect() as conn:
        cur = conn.execute(
            """
            DELETE FROM portfolio_snapshots
            WHERE id = ?
            """,
            (snapshot_id,),
        )
        if cur.rowcount == 0:
            raise KeyError(f"Snapshot {snapshot_id} not found")
