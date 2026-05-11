"""Zerodha Trading Dashboard — FastAPI backend.

Reads data files from the trading bot folder (read-only).
Secured with HTTP Basic Auth.

Run:
    uvicorn main:app --host 0.0.0.0 --port 8000
Expose over internet:
    cloudflared tunnel --url http://localhost:8000
"""

import json
import logging
import secrets
from collections import defaultdict
from datetime import datetime, date, timezone, timedelta
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request

from config import (
    DASHBOARD_USER, DASHBOARD_PASS,
    CAPITAL_FILE, LEDGER_FILE, RUN_LOG_FILE,
    PAPER_FNO_FILE, PAPER_PORT_FILE,
    STRATEGIES, STRATEGY_DISPLAY,
)

app = FastAPI(title="Zerodha Dashboard", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.middleware("http")
async def no_cache_static(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

security = HTTPBasic()
_IST = timezone(timedelta(hours=5, minutes=30))
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def verify(credentials: Annotated[HTTPBasicCredentials, Depends(security)]):
    ok = (
        secrets.compare_digest(credentials.username.encode(), DASHBOARD_USER.encode())
        and secrets.compare_digest(credentials.password.encode(), DASHBOARD_PASS.encode())
    )
    if not ok:
        raise HTTPException(
            status_code=401,
            detail="Incorrect credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def _load_capital() -> dict:
    if not CAPITAL_FILE.exists():
        return {}
    try:
        return json.loads(CAPITAL_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _load_ledger(date_filter: str | None = None, strategy_filter: str | None = None, limit: int = 200) -> list[dict]:
    if not LEDGER_FILE.exists():
        return []
    rows = []
    try:
        with open(LEDGER_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if date_filter:
                    et = (rec.get("exit_time") or "")[:10]
                    if et != date_filter:
                        continue
                if strategy_filter:
                    if rec.get("strategy", "").upper() != strategy_filter.upper():
                        continue
                rows.append(rec)
    except Exception:
        pass
    rows.sort(key=lambda r: r.get("exit_time") or "", reverse=True)
    return rows[:limit]


def _tail_log(n: int = 100) -> list[str]:
    if not RUN_LOG_FILE.exists():
        return ["Log file not found"]
    try:
        text = RUN_LOG_FILE.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        return lines[-n:] if len(lines) > n else lines
    except Exception as e:
        return [f"Error reading log: {e}"]


def _today_ist() -> str:
    return datetime.now(_IST).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
def index(request: Request, _: str = Depends(verify)):
    # Support both old Starlette (<0.46) and new Starlette (>=0.46) TemplateResponse signature
    try:
        return templates.TemplateResponse(request, "index.html")
    except TypeError:
        return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/summary")
def api_summary(_: str = Depends(verify)):
    capital = _load_capital()
    total_current = sum(v.get("current_capital", 0) for v in capital.values())
    total_initial = sum(v.get("initial_capital", 0) for v in capital.values())
    total_pnl = sum(v.get("total_pnl", 0) for v in capital.values())

    today = _today_ist()
    today_trades = _load_ledger(date_filter=today, limit=500)
    today_pnl = sum(t.get("pnl_inr", 0) for t in today_trades)
    today_wins = sum(1 for t in today_trades if t.get("pnl_inr", 0) >= 0)
    today_losses = sum(1 for t in today_trades if t.get("pnl_inr", 0) < 0)

    return {
        "total_current_capital": round(total_current, 2),
        "total_initial_capital": round(total_initial, 2),
        "total_pnl": round(total_pnl, 2),
        "today_pnl": round(today_pnl, 2),
        "today_trades": len(today_trades),
        "today_wins": today_wins,
        "today_losses": today_losses,
        "as_of": datetime.now(_IST).strftime("%Y-%m-%d %H:%M:%S IST"),
    }


@app.get("/api/capital")
def api_capital(_: str = Depends(verify)):
    raw = _load_capital()

    # Per-strategy today P&L from closed trades
    today_rows = _load_ledger(date_filter=_today_ist(), limit=2000)
    strat_today: dict[str, float] = {}
    for row in today_rows:
        k = row.get("strategy", "").lower().replace(" ", "_").replace("-", "_")
        strat_today[k] = strat_today.get(k, 0) + row.get("pnl_inr", 0)

    result = []
    all_keys = list(STRATEGIES) + [k for k in raw if k not in STRATEGIES]
    for key in all_keys:
        v = raw.get(key, {})
        initial = v.get("initial_capital", 50_000)
        current = v.get("current_capital", initial)
        pnl = v.get("total_pnl", 0)
        total = v.get("total_trades", 0)
        wins = v.get("winning_trades", 0)
        losses = v.get("losing_trades", 0)
        win_rate = round(wins / total * 100, 1) if total > 0 else 0.0
        pnl_pct = round(pnl / initial * 100, 2) if initial > 0 else 0.0

        trades = v.get("trades") or []
        last_trade = trades[0] if trades else None

        result.append({
            "key": key,
            "display": STRATEGY_DISPLAY.get(key, key.replace("_", " ").title()),
            "current_capital": round(current, 2),
            "initial_capital": round(initial, 2),
            "capital_change": round(current - initial, 2),
            "total_pnl": round(pnl, 2),
            "total_pnl_pct": pnl_pct,
            "today_pnl": round(strat_today.get(key, 0), 2),
            "total_trades": total,
            "winning_trades": wins,
            "losing_trades": losses,
            "win_rate": win_rate,
            "last_updated": v.get("last_updated"),
            "last_trade": last_trade,
        })

    return result


@app.get("/api/positions")
def api_positions(_: str = Depends(verify)):
    positions = []

    def _read_positions(filepath, label):
        if not filepath.exists():
            return
        try:
            data = json.loads(filepath.read_text(encoding="utf-8"))
            for symbol, pos in data.get("positions", {}).items():
                qty = pos.get("quantity", 0)
                if not qty:
                    continue
                positions.append({
                    "symbol":      symbol,
                    "direction":   "BUY" if pos.get("is_long", True) else "SELL",
                    "entry_price": round(pos.get("average_price", 0), 2),
                    "quantity":    qty,
                    "sl_price":    pos.get("sl_price"),
                    "tp_price":    pos.get("tp_price"),
                    "opened_at":   pos.get("opened_at", ""),
                    "strategy":    pos.get("strategy", label),
                })
        except Exception as exc:
            logger.warning("Could not read positions from %s: %s", filepath, exc)

    _read_positions(PAPER_FNO_FILE, "fno")
    _read_positions(PAPER_PORT_FILE, "equity")

    return {"count": len(positions), "positions": positions}


@app.get("/api/trades")
def api_trades(
    date: str | None = Query(default=None, description="YYYY-MM-DD, default=today"),
    strategy: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    _: str = Depends(verify),
):
    date_str = date or _today_ist()
    rows = _load_ledger(date_filter=date_str, strategy_filter=strategy, limit=limit)
    return {"date": date_str, "count": len(rows), "trades": rows}


@app.get("/api/logs")
def api_logs(
    lines: int = Query(default=80, le=300),
    _: str = Depends(verify),
):
    log_lines = _tail_log(lines)
    return {"lines": log_lines, "count": len(log_lines)}


@app.get("/api/health")
def api_health(_: str = Depends(verify)):
    return {
        "status": "ok",
        "capital_file": CAPITAL_FILE.exists(),
        "ledger_file": LEDGER_FILE.exists(),
        "log_file": RUN_LOG_FILE.exists(),
        "time": datetime.now(_IST).strftime("%Y-%m-%d %H:%M:%S IST"),
    }
