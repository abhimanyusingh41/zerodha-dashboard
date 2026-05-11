/* Zerodha Dashboard — frontend logic */

const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

function rupee(v) { return '₹' + fmt.format(v); }
function pct(v, decimals = 1) { return (v >= 0 ? '+' : '') + v.toFixed(decimals) + '%'; }
function colorClass(v) { return v >= 0 ? 'green' : 'red'; }

// ── Summary strip ────────────────────────────────────────────────────────────

async function loadSummary() {
  try {
    const r = await fetch('/api/summary');
    if (!r.ok) { setText('last-updated', 'API error ' + r.status); return; }
    const d = await r.json();

    setText('total-capital', rupee(d.total_current_capital));
    setText('today-pnl', rupee(d.today_pnl));
    setClass('today-pnl', colorClass(d.today_pnl));
    setText('today-trades', d.today_trades + ' trades');
    setText('today-wr', `${d.today_wins}W / ${d.today_losses}L`);
    setText('total-pnl', rupee(d.total_pnl));
    setClass('total-pnl', colorClass(d.total_pnl));
    setText('last-updated', 'Updated ' + d.as_of);
  } catch (e) { setText('last-updated', 'Network error'); console.error('summary', e); }
}

// ── Strategy cards ────────────────────────────────────────────────────────────

async function loadCapital() {
  try {
    const r = await fetch('/api/capital');
    const grid = document.getElementById('cards-grid');
    if (!r.ok) {
      grid.innerHTML = `<div class="card"><div class="muted" style="padding:20px">Failed to load (${r.status})</div></div>`;
      return;
    }
    const cards = await r.json();
    grid.innerHTML = cards.length ? cards.map(renderCard).join('') : '<div class="card muted" style="padding:20px">No data yet</div>';
  } catch (e) { console.error('capital', e); }
}

function renderCard(s) {
  const up = s.capital_change >= 0;
  const pnlClass = colorClass(s.total_pnl);
  const pnlPct = pct(s.total_pnl_pct);

  let lastTradeHtml = '<div class="last-trade muted">No trades yet</div>';
  if (s.last_trade) {
    const lt = s.last_trade;
    const ltPnlClass = colorClass(lt.pnl);
    const ltTime = lt.timestamp ? lt.timestamp.slice(11, 16) : '';
    lastTradeHtml = `
      <div class="last-trade">
        Last: <strong>${lt.symbol}</strong>
        <span class="${ltPnlClass}">${rupee(lt.pnl)}</span>
        · <span class="muted">${lt.reason}</span>
        · <span class="muted">${ltTime}</span>
      </div>`;
  }

  return `
    <div class="card">
      <div class="card-header">
        <span class="card-name">${s.display}</span>
        <span class="card-badge ${up ? 'badge-up' : 'badge-down'}">
          ${pct(s.total_pnl_pct, 2)}
        </span>
      </div>
      <div class="capital-value">${rupee(s.current_capital)}</div>
      <div class="capital-change ${colorClass(s.capital_change)}">
        ${s.capital_change >= 0 ? '▲' : '▼'} ${rupee(Math.abs(s.capital_change))} from ₹${fmtInt.format(s.initial_capital)}
      </div>
      <div class="card-stats">
        <div class="stat-box">
          <div class="label">Total P&amp;L</div>
          <div class="value ${pnlClass}">${rupee(s.total_pnl)}</div>
        </div>
        <div class="stat-box">
          <div class="label">Win Rate</div>
          <div class="value">${s.win_rate}%</div>
        </div>
        <div class="stat-box">
          <div class="label">Trades</div>
          <div class="value">${s.total_trades}</div>
        </div>
        <div class="stat-box">
          <div class="label">W / L</div>
          <div class="value green">${s.winning_trades}</div>/<div class="value red">${s.losing_trades}</div>
        </div>
      </div>
      ${lastTradeHtml}
    </div>`;
}

// ── Trades table ──────────────────────────────────────────────────────────────

let _tradeDate = todayIST();
let _tradeStrategy = '';

function todayIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + (5.5 * 3600 * 1000));
  return ist.toISOString().slice(0, 10);
}

async function loadTrades() {
  const url = `/api/trades?date=${_tradeDate}&limit=100${_tradeStrategy ? '&strategy=' + _tradeStrategy : ''}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return;
    const d = await r.json();
    renderTrades(d.trades);
    setText('trade-count', `${d.count} trades on ${d.date}`);
  } catch (e) { console.error('trades', e); }
}

function renderTrades(trades) {
  const tbody = document.getElementById('trades-tbody');
  if (!trades.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;padding:20px">No trades for this date</td></tr>';
    return;
  }
  tbody.innerHTML = trades.map(t => {
    const pnl = t.pnl_inr ?? 0;
    const cls = pnl >= 0 ? 'win-row' : 'loss-row';
    const pnlClass = colorClass(pnl);
    const time = (t.exit_time || '').slice(11, 19);
    const dur = t.duration_mins ? t.duration_mins + 'm' : '—';
    const strat = t.strategy ? t.strategy.replace('_', ' ') : '—';
    return `<tr class="${cls}">
      <td class="muted">${time}</td>
      <td>${strat}</td>
      <td><strong>${t.option || t.symbol || '—'}</strong></td>
      <td class="muted">${t.direction || 'BUY'}</td>
      <td>${t.entry_price ? rupee(t.entry_price) : '—'}</td>
      <td>${t.exit_price ? rupee(t.exit_price) : '—'}</td>
      <td class="${pnlClass}"><strong>${rupee(pnl)}</strong> <span class="muted">(${(t.pnl_pct ?? 0).toFixed(1)}%)</span></td>
      <td class="muted">${t.exit_reason || '—'}</td>
      <td class="muted">${dur}</td>
    </tr>`;
  }).join('');
}

// ── Log tail ──────────────────────────────────────────────────────────────────

async function loadLogs() {
  try {
    const r = await fetch('/api/logs?lines=80');
    if (!r.ok) { document.getElementById('log-box').textContent = 'Failed to load logs (' + r.status + ')'; return; }
    const d = await r.json();
    const box = document.getElementById('log-box');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;

    box.innerHTML = d.lines.map(line => {
      let cls = 'log-info';
      if (line.includes('[ERROR]') || line.includes('ERROR')) cls = 'log-error';
      else if (line.includes('[WARNING]') || line.includes('WARNING')) cls = 'log-warning';
      else if (line.includes('SensexStraddle') || line.includes('SENSEX')) cls = 'log-sensex';
      else if (line.includes('IndexOptions') || line.includes('NIFTY')) cls = 'log-index';
      else if (line.includes('ORB') || line.includes('[orb]')) cls = 'log-orb';
      const escaped = line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return `<div class="${cls}">${escaped}</div>`;
    }).join('');

    if (atBottom) box.scrollTop = box.scrollHeight;
  } catch (e) { console.error('logs', e); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setClass(id, cls) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('green', 'red', 'muted', 'blue'); el.classList.add(cls); }
}

// ── Init + refresh ────────────────────────────────────────────────────────────

function refreshAll() {
  loadSummary();
  loadCapital();
  loadTrades();
}

document.addEventListener('DOMContentLoaded', () => {
  // Set date picker to today IST
  const datePicker = document.getElementById('date-picker');
  if (datePicker) {
    datePicker.value = todayIST();
    datePicker.addEventListener('change', e => {
      _tradeDate = e.target.value;
      loadTrades();
    });
  }

  const stratFilter = document.getElementById('strat-filter');
  if (stratFilter) {
    stratFilter.addEventListener('change', e => {
      _tradeStrategy = e.target.value;
      loadTrades();
    });
  }

  // Initial load
  refreshAll();
  loadLogs();

  // Auto-refresh
  setInterval(refreshAll, 30_000);
  setInterval(loadLogs,  15_000);
});
