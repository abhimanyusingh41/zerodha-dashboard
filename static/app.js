/* Zerodha Dashboard — frontend */

const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

function rupee(v) {
  const abs = fmt.format(Math.abs(v));
  return (v >= 0 ? '+' : '-') + '₹' + abs;
}
function rupeeAbs(v) { return '₹' + fmt.format(v); }
function colorClass(v) { return v >= 0 ? 'green' : 'red'; }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setClass(id, cls) {
  const el = document.getElementById(id);
  if (el) { el.className = el.className.replace(/\bgreen\b|\bred\b/g, '').trim() + ' ' + cls; }
}

// ── Summary / stats grid ──────────────────────────────────────────────────────

async function loadSummary() {
  try {
    const r = await fetch('/api/summary');
    if (!r.ok) { setText('last-updated', 'Error ' + r.status); return; }
    const d = await r.json();

    setText('last-updated', 'Updated ' + d.as_of);
    setText('s-trades', d.today_trades);
    setText('s-wl', `${d.today_wins}W / ${d.today_losses}L`);

    const todayEl = document.getElementById('s-today-pnl');
    if (todayEl) { todayEl.textContent = rupee(d.today_pnl); todayEl.className = 'stat-big ' + colorClass(d.today_pnl); }

    const totalEl = document.getElementById('s-total-pnl');
    if (totalEl) { totalEl.textContent = rupee(d.total_pnl); totalEl.className = 'stat-big ' + colorClass(d.total_pnl); }
  } catch (e) {
    setText('last-updated', 'Network error');
  }
}

// ── Strategy cards ────────────────────────────────────────────────────────────

const CARD_SHORT = {
  'ORB': 'ORB',
  'LLM Agent': 'LLM',
  'Index Options': 'NIFTY',
  'SENSEX Straddle': 'SENSEX',
  'Screener': 'SCREEN',
};

async function loadCapital() {
  try {
    const r = await fetch('/api/capital');
    if (!r.ok) return;
    const cards = await r.json();

    const container = document.getElementById('strat-cards');
    container.innerHTML = cards.map(s => {
      const pnlAll   = s.total_pnl;
      const pnlToday = s.today_pnl ?? 0;
      const shortName = CARD_SHORT[s.display] || s.display.toUpperCase().slice(0, 6);
      return `
        <div class="strat-card">
          <div class="strat-name">${shortName}</div>
          <div class="strat-label">CAPITAL</div>
          <div class="strat-capital">${rupeeAbs(s.current_capital)}</div>
          <div class="strat-label">TODAY P&amp;L</div>
          <div class="strat-pnl ${colorClass(pnlToday)}">${rupee(pnlToday)}</div>
          <div class="strat-label">ALL-TIME P&amp;L</div>
          <div class="strat-alltime ${colorClass(pnlAll)}">${rupee(pnlAll)}</div>
        </div>`;
    }).join('');

    // Win rate from aggregated card data
    const totalT = cards.reduce((a, c) => a + c.total_trades, 0);
    const totalW = cards.reduce((a, c) => a + c.winning_trades, 0);
    const wr = totalT > 0 ? Math.round(totalW / totalT * 100) : 0;
    const wrEl = document.getElementById('s-wr');
    if (wrEl) { wrEl.textContent = wr + '%'; wrEl.className = 'stat-big ' + (wr >= 50 ? 'green' : 'red'); }
  } catch (e) { console.error('capital', e); }
}

// ── Open positions ────────────────────────────────────────────────────────────

async function loadPositions() {
  try {
    const r = await fetch('/api/positions');
    if (!r.ok) return;
    const d = await r.json();

    setText('open-count', d.count);
    setText('s-open', d.count);

    const box = document.getElementById('positions-box');
    if (!d.count) {
      box.innerHTML = '<div class="empty-msg">No open positions</div>';
      return;
    }
    box.innerHTML = d.positions.map(p => {
      const time = (p.opened_at || '').slice(11, 16);
      const sl   = p.sl_price ? rupeeAbs(p.sl_price) : '—';
      const tp   = p.tp_price ? rupeeAbs(p.tp_price) : '—';
      return `
        <div class="pos-row">
          <div class="pos-top">
            <strong>${p.symbol}</strong>
            <span class="action-badge">${p.direction}</span>
            <span class="muted small">${time}</span>
          </div>
          <div class="pos-detail">
            <span>Entry <b>${rupeeAbs(p.entry_price)}</b></span>
            <span>Qty <b>${p.quantity}</b></span>
            <span>SL <b class="red">${sl}</b></span>
            <span>TP <b class="green">${tp}</b></span>
          </div>
        </div>`;
    }).join('<div class="pos-divider"></div>');
  } catch (e) { console.error('positions', e); }
}

// ── Trades table ──────────────────────────────────────────────────────────────

let _tradeDate = todayIST();
let _tradeStrategy = '';
let _symbolFilter = '';

function todayIST() {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

async function loadTrades() {
  const url = `/api/trades?date=${_tradeDate}&limit=100${_tradeStrategy ? '&strategy=' + _tradeStrategy : ''}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return;
    const d = await r.json();
    let trades = d.trades;
    if (_symbolFilter) {
      const q = _symbolFilter.toLowerCase();
      trades = trades.filter(t => (t.option || t.symbol || '').toLowerCase().includes(q));
    }
    renderTrades(trades);
    setText('trade-count', trades.length + ' trades');
  } catch (e) { console.error('trades', e); }
}

function renderTrades(trades) {
  const tbody = document.getElementById('trades-tbody');
  if (!trades.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No trades for this date</td></tr>';
    return;
  }
  tbody.innerHTML = trades.map(t => {
    const pnl = t.pnl_inr ?? 0;
    const cls = pnl >= 0 ? 'win-row' : 'loss-row';
    const date = (t.exit_time || '').slice(0, 10);
    const time = (t.exit_time || '').slice(11, 16);
    const sym  = t.option || t.symbol || '—';
    return `<tr class="${cls}">
      <td class="muted"><div>${date}</div><div class="small">${time} IST</div></td>
      <td><strong>${sym}</strong></td>
      <td><span class="action-badge">${t.direction || 'BUY'}</span></td>
      <td>${t.entry_price ? rupeeAbs(t.entry_price) : '—'}</td>
      <td>${t.exit_price  ? rupeeAbs(t.exit_price)  : '—'}</td>
      <td class="${colorClass(pnl)}"><strong>${rupee(pnl)}</strong></td>
    </tr>`;
  }).join('');
}

// ── Log ───────────────────────────────────────────────────────────────────────

async function loadLogs() {
  try {
    const r = await fetch('/api/logs?lines=80');
    if (!r.ok) { document.getElementById('log-box').textContent = 'Error ' + r.status; return; }
    const d = await r.json();
    const box = document.getElementById('log-box');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    box.innerHTML = d.lines.map(line => {
      let cls = 'log-info';
      if      (line.includes('ERROR'))                                   cls = 'log-error';
      else if (line.includes('WARNING') || line.includes('WARN'))        cls = 'log-warning';
      else if (line.includes('SENSEX') || line.includes('SensexStraddle')) cls = 'log-sensex';
      else if (line.includes('NIFTY') || line.includes('IndexOptions'))  cls = 'log-index';
      else if (line.includes('ORB') || line.includes('[orb]'))           cls = 'log-orb';
      else if (line.includes('LLM') || line.includes('SCREENER') || line.includes('llm')) cls = 'log-llm';
      const esc = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<div class="${cls}">${esc}</div>`;
    }).join('');
    if (atBottom) box.scrollTop = box.scrollHeight;
  } catch (e) { console.error('logs', e); }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function refreshAll() {
  loadSummary();
  loadCapital();
  loadTrades();
  loadPositions();
}

document.addEventListener('DOMContentLoaded', () => {
  const dp = document.getElementById('date-picker');
  if (dp) {
    dp.value = todayIST();
    dp.addEventListener('change', e => { _tradeDate = e.target.value; loadTrades(); });
  }

  document.getElementById('strat-filter')?.addEventListener('change', e => {
    _tradeStrategy = e.target.value; loadTrades();
  });

  document.getElementById('symbol-filter')?.addEventListener('input', e => {
    _symbolFilter = e.target.value; loadTrades();
  });

  refreshAll();
  loadLogs();
  setInterval(refreshAll, 30_000);
  setInterval(loadLogs,   15_000);
});
