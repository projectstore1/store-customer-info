import {
  initFirebase, loadAllData, createCustomer, updateCustomer, deleteCustomer,
  addTransaction, subscribeAll
} from './firebase-service.js';
import {
  toast, showLoader, hideLoader, openModal, closeModal, bdt,
  formatDateTime, escapeHtml, validatePhone
} from './ui.js';
import { initCalculator } from './calculator.js';

// --------- Global state ---------
const state = {
  customers: [],
  transactions: []
};

// --------- Boot ---------
(async function boot() {
  try {
    await initFirebase();
  } catch (err) {
    showSetupError(err.message);
    return;
  }

  document.getElementById('app').classList.remove('hidden');
  hideLoader();
  wireUI();
  initCalculator();
  await bootstrapData();
  subscribeRealtime();
})();

function showSetupError(msg) {
  hideLoader();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('setupScreen').classList.remove('hidden');
  document.getElementById('setupMsg').textContent = msg;
}

// --------- Data load ---------
async function bootstrapData() {
  showLoader();
  try {
    const { customers, transactions } = await loadAllData();
    state.customers = customers;
    state.transactions = transactions.sort((a,b) => (b.createdAt||0)-(a.createdAt||0));
    renderAll();
  } catch (err) {
    toast('ডেটা লোড ব্যর্থ: ' + err.message, 'error', 5000);
  } finally {
    hideLoader();
  }
}

function subscribeRealtime() {
  subscribeAll((key, data) => {
    if (key === 'customers')    state.customers = data;
    if (key === 'transactions') state.transactions = data.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    if (key === 'error')        toast('Firebase সংযোগ সমস্যা: ' + (data?.message || ''), 'error');
    renderAll();
  });
}

// --------- Rendering ---------
function renderAll() {
  renderSummary();
  renderCustomersList();
  renderHistory();
  renderCreditCustomerOptions();
  renderSearch();
}

function renderSummary() {
  let totalSales = 0, totalPaid = 0, outstanding = 0, oweCount = 0;
  for (const c of state.customers) {
    totalSales += Number(c.totalSales || 0);
    totalPaid  += Number(c.totalPaid  || 0);
    const bal = Number(c.balance ?? ((c.totalSales||0) - (c.totalPaid||0)));
    if (bal > 0) { outstanding += bal; oweCount++; }
  }
  document.getElementById('cardTotalSales').textContent       = bdt(totalSales);
  document.getElementById('cardOutstanding').textContent      = bdt(outstanding);
  document.getElementById('cardCollected').textContent        = bdt(totalPaid);
  document.getElementById('cardOutstandingCount').textContent = oweCount;
}

function renderCustomersList() {
  const wrap = document.getElementById('customersList');
  const empty = document.getElementById('customersEmpty');
  if (!state.customers.length) {
    wrap.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  wrap.innerHTML = state.customers
    .sort((a,b) => (b.createdAt||0)-(a.createdAt||0))
    .map(c => {
      const bal = Number(c.balance || 0);
      const badge = bal <= 0
        ? '<span class="badge paid">সম্পূর্ণ পরিশোধিত</span>'
        : '<span class="badge owe">বাকি আছে</span>';
      return `
        <div class="customer-card" data-id="${c.id}">
          <div>
            <h4>${escapeHtml(c.name)} ${badge}</h4>
            <p class="muted">📞 ${escapeHtml(c.phone)}</p>
          </div>
          <div style="text-align:right">
            <div class="amt">${bdt(bal)}</div>
            <small class="muted">বর্তমান বাকি</small>
          </div>
        </div>`;
    }).join('');

  wrap.querySelectorAll('.customer-card').forEach(el => {
    el.addEventListener('click', () => showCustomerDetails(el.dataset.id));
  });
}

function renderHistory() {
  const wrap = document.getElementById('historyList');
  const empty = document.getElementById('historyEmpty');
  const q  = (document.getElementById('historySearch')?.value || '').trim().toLowerCase();
  const from = document.getElementById('historyFrom')?.value || '';
  const to   = document.getElementById('historyTo')?.value || '';

  let list = [...state.transactions];
  if (q) list = list.filter(t =>
    (t.customerName||'').toLowerCase().includes(q) ||
    (t.customerPhone||'').includes(q)
  );
  if (from) list = list.filter(t => t.createdAt >= new Date(from).getTime());
  if (to)   list = list.filter(t => t.createdAt <= new Date(to).getTime() + 86399000);

  if (!list.length) { wrap.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  wrap.innerHTML = list.map(t => {
    const isCredit = t.type === 'credit';
    return `
      <div class="history-item ${isCredit ? 'credit' : 'payment'}">
        <div>
          <h5>${escapeHtml(t.customerName || '')}</h5>
          <div class="meta">📞 ${escapeHtml(t.customerPhone || '')} · ${formatDateTime(t.createdAt)}</div>
        </div>
        <div class="amt ${isCredit ? 'credit' : 'payment'}">
          ${isCredit ? '+' : '−'} ${bdt(t.amount)}
          <div style="font-size:11px;color:#737373;font-weight:500">বাকি: ${bdt(t.balanceAfter)}</div>
        </div>
        ${t.item ? `<div class="desc">📦 ${escapeHtml(t.item)}${t.qty ? ' — পরিমাণ: '+t.qty : ''}</div>` : ''}
        <div class="desc" style="color:#737373">ধরন: ${isCredit ? 'বাকি বিক্রি' : 'টাকা জমা'}</div>
      </div>`;
  }).join('');
}

function renderCreditCustomerOptions() {
  const sel = document.getElementById('creditCustomer');
  const prev = sel.value;
  sel.innerHTML = '<option value="">-- কাস্টমার নির্বাচন করুন --</option>' +
    state.customers.map(c =>
      `<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.phone)}</option>`
    ).join('');
  if (prev) sel.value = prev;
}

function renderSearch() {
  const q = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const wrap = document.getElementById('searchResults');
  if (!q) { wrap.innerHTML = ''; return; }
  const matches = state.customers.filter(c =>
    (c.name||'').toLowerCase().includes(q) ||
    (c.phone||'').toLowerCase().includes(q)
  );
  if (!matches.length) {
    wrap.innerHTML = '<div class="empty-state">কোনো কাস্টমার পাওয়া যায়নি</div>';
    return;
  }
  wrap.innerHTML = matches.map(c => {
    const bal = Number(c.balance || 0);
    return `
      <div class="result-item" data-id="${c.id}">
        <div class="result-info">
          <h4>${escapeHtml(c.name)}</h4>
          <p>📞 ${escapeHtml(c.phone)}</p>
        </div>
        <div class="result-balance ${bal <= 0 ? 'zero-balance' : ''}">
          ${bdt(bal)}
          <small>${bal <= 0 ? 'সম্পূর্ণ পরিশোধিত' : 'বর্তমান বাকি'}</small>
        </div>
      </div>`;
  }).join('');
  wrap.querySelectorAll('.result-item').forEach(el => {
    el.addEventListener('click', () => showCustomerDetails(el.dataset.id));
  });
}

// --------- Customer Details ---------
function showCustomerDetails(id) {
  const c = state.customers.find(x => x.id === id);
  if (!c) return;
  const txs = state.transactions
    .filter(t => t.customerId === id)
    .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  const bal = Number(c.balance || 0);

  document.getElementById('customerModalContent').innerHTML = `
    <h3>${escapeHtml(c.name)}</h3>
    <p class="sub">📞 ${escapeHtml(c.phone)}${c.address ? ' · '+escapeHtml(c.address) : ''}</p>

    <div class="balance-highlight">
      <span>বর্তমান বাকি</span>
      <strong class="${bal <= 0 ? 'zero-balance':''}" style="${bal<=0?'color:#15803d':''}">${bdt(bal)}</strong>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <button class="btn-primary" id="cdPayBtn">টাকা জমা নিন</button>
      <button class="btn-secondary" id="cdCreditBtn">নতুন বাকি যোগ</button>
      <button class="btn-secondary" id="cdEditBtn">সম্পাদনা</button>
      <button class="btn-danger" id="cdDeleteBtn">মুছে ফেলুন</button>
    </div>

    <p style="font-size:13px;font-weight:600;margin-bottom:6px">মোট কেনাকাটা: ${bdt(c.totalSales)}</p>
    <p style="font-size:13px;font-weight:600;margin-bottom:14px">মোট জমা: ${bdt(c.totalPaid)}</p>

    <h4 style="font-size:14px;margin:14px 0 8px">লেনদেনের ইতিহাস</h4>
    ${txs.length ? txs.map(t => `
      <div class="history-item ${t.type==='credit'?'credit':'payment'}" style="margin-bottom:6px">
        <div>
          <h5>${t.type==='credit'?'বাকি বিক্রি':'টাকা জমা'}</h5>
          <div class="meta">${formatDateTime(t.createdAt)}</div>
        </div>
        <div class="amt ${t.type==='credit'?'credit':'payment'}">${t.type==='credit'?'+':'−'} ${bdt(t.amount)}</div>
        ${t.item ? `<div class="desc">📦 ${escapeHtml(t.item)}${t.qty?' — '+t.qty:''}</div>`:''}
        <div class="desc" style="color:#737373">এর পর বাকি: ${bdt(t.balanceAfter)}</div>
      </div>`).join('')
    : '<div class="empty-state">এখনো কোনো লেনদেন নেই।</div>'}

    <div class="modal-actions">
      <button class="btn-secondary" id="cdClose">বন্ধ করুন</button>
    </div>
  `;
  openModal('customerModal');

  document.getElementById('cdClose').onclick = () => closeModal('customerModal');
  document.getElementById('cdPayBtn').onclick = () => { closeModal('customerModal'); openPaymentForm(id); };
  document.getElementById('cdCreditBtn').onclick = () => {
    closeModal('customerModal');
    selectTab('addCredit');
    setTimeout(() => {
      document.getElementById('creditCustomer').value = id;
    }, 50);
  };
  document.getElementById('cdEditBtn').onclick = () => openEditCustomer(id);
  document.getElementById('cdDeleteBtn').onclick = () => deleteCustomerFlow(id);
}

// --------- Add Customer ---------
function openAddCustomer() {
  document.getElementById('formModalContent').innerHTML = `
    <h3>নতুন কাস্টমার</h3>
    <p class="sub">কাস্টমারের তথ্য যোগ করুন</p>
    <form id="newCustForm">
      <label>কাস্টমারের নাম *</label>
      <input id="ncName" required />
      <label>মোবাইল নম্বর *</label>
      <input id="ncPhone" required placeholder="01XXXXXXXXX" />
      <label>ঠিকানা (ঐচ্ছিক)</label>
      <input id="ncAddress" />
      <label>নোট (ঐচ্ছিক)</label>
      <input id="ncNote" />
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="ncCancel">বাতিল</button>
        <button type="submit" class="btn-primary" id="ncSave">সংরক্ষণ করুন</button>
      </div>
    </form>`;
  openModal('formModal');

  document.getElementById('ncCancel').onclick = () => closeModal('formModal');
  document.getElementById('newCustForm').onsubmit = async (e) => {
    e.preventDefault();
    const name  = document.getElementById('ncName').value.trim();
    const phone = document.getElementById('ncPhone').value.trim();
    const address = document.getElementById('ncAddress').value.trim();
    const note  = document.getElementById('ncNote').value.trim();
    if (!name) { toast('নাম আবশ্যক', 'error'); return; }
    if (!validatePhone(phone)) { toast('সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)', 'error'); return; }

    const btn = document.getElementById('ncSave');
    btn.disabled = true; btn.textContent = 'সংরক্ষণ হচ্ছে...';
    try {
      await createCustomer({ name, phone, address, note });
      toast('কাস্টমার সফলভাবে যুক্ত হয়েছে', 'success');
      closeModal('formModal');
    } catch (err) {
      toast('সংরক্ষণ ব্যর্থ: ' + err.message, 'error');
      btn.disabled = false; btn.textContent = 'সংরক্ষণ করুন';
    }
  };
}

// --------- Edit Customer ---------
function openEditCustomer(id) {
  const c = state.customers.find(x => x.id === id);
  if (!c) return;
  document.getElementById('formModalContent').innerHTML = `
    <h3>কাস্টমার সম্পাদনা</h3>
    <form id="editCustForm">
      <label>নাম *</label><input id="ecName" value="${escapeHtml(c.name)}" required />
      <label>ফোন *</label><input id="ecPhone" value="${escapeHtml(c.phone)}" required />
      <label>ঠিকানা</label><input id="ecAddress" value="${escapeHtml(c.address||'')}" />
      <label>নোট</label><input id="ecNote" value="${escapeHtml(c.note||'')}" />
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="ecCancel">বাতিল</button>
        <button type="submit" class="btn-primary" id="ecSave">সংরক্ষণ করুন</button>
      </div>
    </form>`;
  openModal('formModal');
  document.getElementById('ecCancel').onclick = () => closeModal('formModal');
  document.getElementById('editCustForm').onsubmit = async (e) => {
    e.preventDefault();
    const patch = {
      name: document.getElementById('ecName').value.trim(),
      phone: document.getElementById('ecPhone').value.trim(),
      address: document.getElementById('ecAddress').value.trim(),
      note: document.getElementById('ecNote').value.trim()
    };
    if (!validatePhone(patch.phone)) { toast('সঠিক ফোন নম্বর দিন', 'error'); return; }
    const btn = document.getElementById('ecSave');
    btn.disabled = true; btn.textContent = 'সংরক্ষণ হচ্ছে...';
    try {
      await updateCustomer(id, patch);
      toast('আপডেট সফল', 'success');
      closeModal('formModal');
    } catch (err) {
      toast('আপডেট ব্যর্থ: ' + err.message, 'error');
      btn.disabled = false; btn.textContent = 'সংরক্ষণ করুন';
    }
  };
}

// --------- Delete Customer ---------
async function deleteCustomerFlow(id) {
  const c = state.customers.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`"${c.name}" কে মুছে ফেলবেন? এই কাস্টমারের সব তথ্য থাকবে কিন্তু তালিকা থেকে সরে যাবে।`)) return;
  try {
    await deleteCustomer(id);
    toast('কাস্টমার মুছে ফেলা হয়েছে', 'success');
    closeModal('customerModal');
  } catch (err) {
    toast('মুছে ফেলা ব্যর্থ: ' + err.message, 'error');
  }
}

// --------- Payment ---------
function openPaymentForm(customerId) {
  const c = state.customers.find(x => x.id === customerId);
  if (!c) return;
  const bal = Number(c.balance || 0);

  if (bal <= 0) {
    toast('এই কাস্টমারের কোনো বাকি নেই', 'info');
    return;
  }

  document.getElementById('formModalContent').innerHTML = `
    <h3>টাকা জমা নিন</h3>
    <p class="sub">${escapeHtml(c.name)} — 📞 ${escapeHtml(c.phone)}</p>

    <div class="balance-highlight">
      <span>বর্তমান বাকি</span>
      <strong>${bdt(bal)}</strong>
    </div>

    <form id="payForm">
      <label>জমার পরিমাণ (৳) *</label>
      <input type="number" id="payAmount" step="0.01" min="0.01" max="${bal}" required />

      <label>পেমেন্ট পদ্ধতি (ঐচ্ছিক)</label>
      <select id="payMethod">
        <option value="">-- নির্বাচন করুন --</option>
        <option>নগদ</option>
        <option>bKash</option>
        <option>Nagad</option>
        <option>Rocket</option>
        <option>ব্যাংক</option>
      </select>

      <label>নোট (ঐচ্ছিক)</label>
      <input id="payNote" />

      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="payCancel">বাতিল</button>
        <button type="submit" class="btn-primary" id="paySave">পেমেন্ট নিশ্চিত করুন</button>
      </div>
    </form>`;
  openModal('formModal');
  document.getElementById('payCancel').onclick = () => closeModal('formModal');

  document.getElementById('payForm').onsubmit = async (e) => {
    e.preventDefault();
    const amount = Number(document.getElementById('payAmount').value);
    const method = document.getElementById('payMethod').value;
    const note   = document.getElementById('payNote').value.trim();

    if (!amount || amount <= 0) { toast('সঠিক পরিমাণ দিন', 'error'); return; }
    if (amount > bal + 0.0001) { toast('বাকির চেয়ে বেশি জমা নেওয়া যাবে না', 'error'); return; }
    if (!confirm(`৳ ${amount.toFixed(2)} জমা নিশ্চিত করবেন?`)) return;

    const btn = document.getElementById('paySave');
    btn.disabled = true; btn.textContent = 'সংরক্ষণ হচ্ছে...';

    try {
      await addTransaction({
        customerId, type: 'payment',
        amount, method, note
      });
      document.getElementById('formModalContent').innerHTML = `
        <div class="success-tick">✓</div>
        <h3 style="text-align:center">পেমেন্ট সফল</h3>
        <p class="sub" style="text-align:center">${bdt(amount)} জমা হয়েছে</p>`;
      toast('পেমেন্ট সফলভাবে সংরক্ষিত', 'success');
      setTimeout(() => closeModal('formModal'), 1100);
    } catch (err) {
      toast('পেমেন্ট ব্যর্থ: ' + err.message, 'error');
      btn.disabled = false; btn.textContent = 'পেমেন্ট নিশ্চিত করুন';
    }
  };
}

// --------- Add Credit Form ---------
function initCreditForm() {
  const form = document.getElementById('creditForm');
  const total = document.getElementById('creditTotal');
  const initial = document.getElementById('creditInitial');
  const remaining = document.getElementById('creditRemaining');

  const updateRemain = () => {
    const t = Number(total.value || 0);
    const i = Number(initial.value || 0);
    const r = Math.max(0, t - i);
    remaining.textContent = bdt(r);
  };
  total.addEventListener('input', updateRemain);
  initial.addEventListener('input', updateRemain);
  updateRemain();

  document.getElementById('creditCancelBtn').onclick = () => {
    form.reset();
    updateRemain();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const customerId = document.getElementById('creditCustomer').value;
    const item = document.getElementById('creditItem').value.trim();
    const qty  = document.getElementById('creditQty').value;
    const t    = Number(total.value);
    const i    = Number(initial.value || 0);

    if (!customerId) { toast('কাস্টমার নির্বাচন করুন', 'error'); return; }
    if (!item)       { toast('পণ্যের বিবরণ দিন', 'error'); return; }
    if (!t || t <= 0){ toast('সঠিক মোট মূল্য দিন', 'error'); return; }
    if (i < 0)       { toast('জমা ঋণাত্মক হতে পারে না', 'error'); return; }
    if (i > t)       { toast('প্রাথমিক জমা মোট মূল্যের বেশি হতে পারে না', 'error'); return; }

    const btn = document.getElementById('creditSubmitBtn');
    btn.disabled = true; btn.textContent = 'সংরক্ষণ হচ্ছে...';

    try {
      // Credit record
      await addTransaction({
        customerId, type: 'credit', amount: t, item, qty
      });
      // Optional initial payment
      if (i > 0) {
        await addTransaction({
          customerId, type: 'payment', amount: i,
          note: 'প্রাথমিক জমা'
        });
      }
      toast('বাকি সফলভাবে যোগ হয়েছে', 'success');
      form.reset();
      updateRemain();
      selectTab('dashboard');
    } catch (err) {
      toast('সংরক্ষণ ব্যর্থ: ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'সংরক্ষণ করুন';
    }
  };
}

// --------- Tabs ---------
function selectTab(name) {
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === 'panel-' + name));
}

// --------- Wire UI ---------
let uiWired = false;
function wireUI() {
  if (uiWired) return;
  uiWired = true;

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => selectTab(t.dataset.tab));
  });

  document.getElementById('searchBtn').addEventListener('click', renderSearch);
  document.getElementById('searchInput').addEventListener('input', renderSearch);

  document.getElementById('historySearch').addEventListener('input', renderHistory);
  document.getElementById('historyFrom').addEventListener('change', renderHistory);
  document.getElementById('historyTo').addEventListener('change', renderHistory);
  document.getElementById('historyClear').addEventListener('click', () => {
    document.getElementById('historySearch').value = '';
    document.getElementById('historyFrom').value = '';
    document.getElementById('historyTo').value = '';
    renderHistory();
  });

  document.querySelectorAll('[data-open]').forEach(b => {
    b.addEventListener('click', () => {
      const which = b.dataset.open;
      if (which === 'customer') openAddCustomer();
      if (which === 'credit')   selectTab('addCredit');
      if (which === 'payment')  openPaymentCustomerPicker();
    });
  });

 
