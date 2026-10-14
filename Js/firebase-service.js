import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

let db = null;
const SHOP_ID = "main";

export async function initFirebase() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase configuration ভুল বা incomplete।");
  }

  const appMod = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
  const dbMod  = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");

  const app = appMod.initializeApp(firebaseConfig);
  db = dbMod.getDatabase(app);
  return { app, db };
}

export function getDb() { return db; }

function path(...parts) {
  return `shops/${SHOP_ID}/${parts.join('/')}`;
}

export async function loadAllData() {
  const { ref, get } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
  const [cSnap, tSnap] = await Promise.all([
    get(ref(db, path('customers'))),
    get(ref(db, path('transactions')))
  ]);
  const customers = cSnap.exists() ? Object.values(cSnap.val()) : [];
  const transactions = tSnap.exists() ? Object.values(tSnap.val()) : [];
  return { customers, transactions };
}

export async function createCustomer(customer) {
  const { ref, push, set } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
  const newRef = push(ref(db, path('customers')));
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

export async function updateCustomer(id, patch) {
  const { ref, update } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
  await update(ref(db, path('customers', id)), patch);
}

export async function deleteCustomer(id) {
  const { ref, remove } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
  await remove(ref(db, path('customers', id)));
}

function round2(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100; }

export async function addTransaction({ customerId, type, amount, item, qty, note, method }) {
  const { ref, runTransaction, push, set, get } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");

  const custRef = ref(db, path('customers', customerId));

  const result = await runTransaction(custRef, (cust) => {
    if (!cust) return cust;
    const sales = Number(cust.totalSales || 0);
    const paid  = Number(cust.totalPaid || 0);
    let newSales = sales, newPaid = paid;

    if (type === "credit") {
      newSales = sales + Number(amount);
    } else if (type === "payment") {
      const bal = sales - paid;
      if (Number(amount) > bal + 0.0001) return;
      newPaid = paid + Number(amount);
    }
    cust.totalSales = round2(newSales);
    cust.totalPaid  = round2(newPaid);
    cust.balance    = round2(newSales - newPaid);
    cust.lastTxAt   = Date.now();
    return cust;
  });

  if (!result.committed) {
    throw new Error("ব্যালেন্স আপডেট ব্যর্থ হয়েছে (সম্ভবত বাকির বেশি জমা)।");
  }

  const snap = await get(custRef);
  const cust = snap.exists() ? snap.val() : {};
  const balanceAfter = Number(cust.balance || 0);

  const txRef = push(ref(db, path('transactions')));
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

export async function subscribeAll(cb) {
  const { ref, onValue } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
  const u1 = onValue(ref(db, path('customers')), s => cb('customers', s.exists() ? Object.values(s.val()) : []));
  const u2 = onValue(ref(db, path('transactions')), s => cb('transactions', s.exists() ? Object.values(s.val()) : []));
  return () => { u1(); u2(); };
}
