import os
import pathlib
from dotenv import load_dotenv

load_dotenv()

DASHBOARD_USER: str = os.getenv("DASHBOARD_USER", "admin")
DASHBOARD_PASS: str = os.getenv("DASHBOARD_PASS", "changeme")

_data_dir = os.getenv("DATA_DIR", "../zerodha-trading-agent")
DATA_DIR = pathlib.Path(_data_dir).resolve()

CAPITAL_FILE      = DATA_DIR / "capital.json"
TRADES_FILE       = DATA_DIR / "trades.json"
RUN_LOG_FILE      = DATA_DIR / "logs" / "run.log"
PAPER_PORT_FILE   = DATA_DIR / "paper_portfolio.json"
PAPER_FNO_FILE    = DATA_DIR / "paper_fno_portfolio.json"

STRATEGIES = ["orb", "llm_agent", "index_options", "sensex_straddle"]

STRATEGY_DISPLAY = {
    "orb":             "ORB",
    "llm_agent":       "LLM Agent",
    "index_options":   "Index Options",
    "sensex_straddle": "SENSEX Straddle",
    "screener":        "Screener",
}
