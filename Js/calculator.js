export function initCalculator() {
  const fab    = document.getElementById('calcFab');
  const modal  = document.getElementById('calcModal');
  const close  = document.getElementById('calcClose');
  const dispExpr = document.getElementById('calcExpr');
  const dispRes  = document.getElementById('calcResult');
  const grid     = modal.querySelector('.calc-grid');
  const historyBtn = document.getElementById('calcHistoryBtn');
  const historyList = document.getElementById('calcHistoryList');
  const copyBtn = document.getElementById('calcCopyBtn');

  let expr = '';
  let history = [];

  const refresh = () => {
    dispExpr.textContent = expr || '';
    if (!expr) { dispRes.textContent = '0'; return; }
    const r = safeEval(expr);
    dispRes.textContent = (r === null) ? 'Error' : String(r);
  };

  function press(k) {
    if (k === 'C') { expr = ''; }
    else if (k === '⌫') { expr = expr.slice(0, -1); }
    else if (k === '±') {
      const m = expr.match(/(-?\d*\.?\d+)$/);
      if (m) {
        const n = m[0];
        expr = expr.slice(0, -n.length) + (n.startsWith('-') ? n.slice(1) : '-' + n);
      } else { expr += '-'; }
    }
    else if (k === '=') {
      const r = safeEval(expr);
      if (r === null) { dispRes.textContent = 'Error'; return; }
      history.unshift(`${expr} = ${r}`);
      if (history.length > 20) history.pop();
      expr = String(r);
    }
    else { expr += k; }
    refresh();
  }

  grid.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) press(b.dataset.k);
  });

  const keyHandler = e => {
    if (modal.classList.contains('hidden')) return;
    const k = e.key;
    if (/^[0-9]$/.test(k)) { press(k); e.preventDefault(); }
    else if (k === '.') { press('.'); e.preventDefault(); }
    else if (k === '+') { press('+'); e.preventDefault(); }
    else if (k === '-') { press('−'); e.preventDefault(); }
    else if (k === '*') { press('×'); e.preventDefault(); }
    else if (k === '/') { press('÷'); e.preventDefault(); }
    else if (k === '%') { press('%'); e.preventDefault(); }
    else if (k === 'Enter' || k === '=') { press('='); e.preventDefault(); }
    else if (k === 'Backspace') { press('⌫'); e.preventDefault(); }
    else if (k === 'Escape') { modal.classList.add('hidden'); }
  };
  document.addEventListener('keydown', keyHandler);

  fab.addEventListener('click', () => modal.classList.toggle('hidden'));
  close.addEventListener('click', () => modal.classList.add('hidden'));

  historyBtn.addEventListener('click', () => {
    historyList.classList.toggle('hidden');
    historyList.innerHTML = history.length
      ? history.map(h => `<div>${h}</div>`).join('')
      : '<div style="color:#737373">No history</div>';
  });

  copyBtn.addEventListener('click', async () => {
    const txt = dispRes.textContent;
    try {
      await navigator.clipboard.writeText(txt);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy Result', 1200);
    } catch {
      copyBtn.textContent = 'Error';
      setTimeout(() => copyBtn.textContent = 'Copy Result', 1200);
    }
  });

  refresh();
}

function safeEval(input) {
  if (!input) return 0;
  let s = input.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  s = s.replace(/(\d*\.?\d+)%/g, '($1/100)');
  if (!/^[-+*/().\d\s]+$/.test(s)) return null;
  try {
    const r = Function('"use strict";return (' + s + ')')();
    if (!isFinite(r)) return null;
    return Math.round((r + Number.EPSILON) * 1e10) / 1e10;
  } catch { return null; }
}
