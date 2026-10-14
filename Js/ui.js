export function toast(message, type = 'info', ms = 3000) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  c.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(40px)';
    setTimeout(() => el.remove(), 320);
  }, ms);
}

export function showLoader() {
  document.getElementById('globalLoader')?.classList.remove('hidden');
}

export function hideLoader() {
  document.getElementById('globalLoader')?.classList.add('hidden');
}

export function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

export function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

export function bdt(n) {
  const v = Number(n || 0);
  return '৳ ' + v.toLocaleString('bn-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('bn-BD', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

export function validatePhone(p) {
  const digits = String(p).replace(/\D/g, '');
  return /^01\d{9}$/.test(digits) || /^8801\d{9}$/.test(digits);
}
