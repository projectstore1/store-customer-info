import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

let db = null;
let ready = false;
const SHOP_ID = "main"; // single shop (Abdullah Store)

export async function initFirebase() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase configuration পাওয়া যায়নি। js/firebase-config.js এ আপনার credentials বসান।");
  }
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
  const { getDatabase }   = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");

  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  ready = true;
  return { app, db };
}

export function getDb() { return db; }
export function isReady() { return ready; }

function shopPath(...parts) {
  return `shops/${SHOP_ID}/${parts.join('/')}`;
}

// ---------- LOAD ALL ----------
export async function loadAllData() {
  const { ref, get } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
  const [custSnap, txSnap] = await Promise.all([
    get(ref(db, shopPath('customers'))),
    get(ref(db, shopPath('transactions')))
  ]);
  const customers = custSnap.exists() ? Object.values(custSnap.val()) : [];
  const transactions = txSnap.exists() ? Object.values(txSnap.val()) : [];
  return { customers, transactions };
}

// ---------- CREATE CUSTOMER ----------
export async function createCustomer(customer) {
  const { ref, push, set } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
  const newRef = push(ref(db, shopPath('customers')));
  const data = {
    id: newRef.key,
    name: customer.name.trim(),
    phone: customer.phone.trim(),
    address: customer.address || "",
    note: customer.note || "",
    totalSales: 0,
    totalPaid: 0,
    balance: 0,
    createdAt: Date.now()
  };
  await set(newRef, data);
  return data;
}

// ---------- UPDATE CUSTOMER ----------
export async function updateCustomer(customerId, patch) {
  const { ref, update } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
  await update(ref(db, shopPath('customers', customerId)), patch);
}

// ---------- DELETE CUSTOMER ----------
export async function deleteCustomer(customerId) {
  const { ref, remove } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
  await remove(ref(db, shopPath('customers', customerId)));
}

// ---------- ADD TRANSACTION (atomic balance update) ----------
// type: "credit" | "payment"
export async function addTransaction({ customerId, type, amount, item, qty, note, method }) {
  const {
    ref, runTransaction, push, set, get
  } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");

  const customerRef = ref(db, shopPath('customers', customerId));

  // Atomic balance update
  const txResult = await runTransaction(customerRef, (cust) => {
    if (!cust) return cust;
    const sales = Number(cust.totalSales || 0);
    const paid  = Number(cust.totalPaid  || 0);
    let newSales = sales, newPaid = paid;

    if (type === "credit") {
      newSales = sales + Number(amount);
    } else if (type === "payment") {
      const currentBalance = sales - paid;
      // Reject overpayment
      if (Number(amount) > currentBalance + 0.0001) {
        return; // abort transaction
      }
      newPaid = paid + Number(amount);
    }
    cust.totalSales = round2(newSales);
    cust.totalPaid  = round2(newPaid);
    cust.balance    = round2(newSales - newPaid);
    cust.lastTxAt   = Date.now();
    return cust;
  });

  if (!txResult.committed) {
    throw new Error("ব্যালেন্স আপডেট ব্যর্থ (সম্ভবত বাকির বেশি জমা)");
  }

  // Read updated balance & customer info for the transaction record
  const snap = await get(customerRef);
  const cust = snap.exists() ? snap.val() : {};
  const balanceAfter = Number(cust.balance || 0);

  // Write transaction record (separate record per transaction)
  const txRef = push(ref(db, shopPath('transactions')));
  const txData = {
    id: txRef.key,
    customerId,
    customerName: cust.name || "",
    customerPhone: cust.phone || "",
    type,
    amount: round2(amount),
    item: item || "",
    qty: qty ? Number(qty) : null,
    note: note || "",
    method: method || "",
    balanceAfter,
    createdAt: Date.now()
  };

  await set(txRef, txData);
  return txData;
}

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

// ---------- REALTIME SUBSCRIBE ----------
export async function subscribeAll(cb) {
  const { ref, onValue } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
  const unsub1 = onValue(ref(db, shopPath('customers')),
    s => cb('customers', s.exists() ? Object.values(s.val()) : []),
    err => cb('error', err));
  const unsub2 = onValue(ref(db, shopPath('transactions')),
    s => cb('transactions', s.exists() ? Object.values(s.val()) : []),
    err => cb('error', err));
  return () => { unsub1(); unsub2(); };
}
