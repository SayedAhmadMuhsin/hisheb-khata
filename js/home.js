import { auth, db } from "./firebase-config.js";
import {
  requireAuth, logout, fmtTaka, toast, watchBalance,
  applyBalanceChange, watchRecentTransactions, fmtDate, userDoc
} from "./app.js";
import {
  collectionGroup, collection, query, where, onSnapshot,
  updateDoc, deleteDoc, increment
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let uid;

requireAuth((user) => {
  uid = user.uid;
  watchBalance(uid, (bal) => {
    const el = document.getElementById("mainBalance");
    el.textContent = fmtTaka(bal);
    el.classList.toggle("neg", bal < 0);
  });

  watchDue();
  watchMonthProfit();
  watchRecentTransactions(uid, renderTx);
});

document.getElementById("logoutBtn").addEventListener("click", logout);

// ---------- Due = unpaid/partially-paid item profit (all folders) + unpaid/partial loans ----------
function watchDue(){
  let itemsDue = 0, loansDue = 0;

  const itemsQ = query(collectionGroup(db, "items"), where("ownerUid", "==", auth.currentUser.uid), where("paid", "==", false));
  onSnapshot(itemsQ, (snap) => {
    itemsDue = 0;
    snap.forEach(d => {
      const it = d.data();
      const profit = Number(it.profit) || 0;
      const paidAmount = it.paidAmount !== undefined ? Number(it.paidAmount) : 0;
      itemsDue += Math.max(profit - paidAmount, 0);
    });
    updateDue(itemsDue, loansDue);
  });

  const loansQ = query(collection(db, "users", auth.currentUser.uid, "loans"), where("paid", "==", false));
  onSnapshot(loansQ, (snap) => {
    loansDue = 0;
    snap.forEach(d => {
      const ln = d.data();
      const amount = Number(ln.amount) || 0;
      const paidAmount = ln.paidAmount !== undefined ? Number(ln.paidAmount) : 0;
      loansDue += Math.max(amount - paidAmount, 0);
    });
    updateDue(itemsDue, loansDue);
  });
}
function updateDue(itemsDue, loansDue){
  document.getElementById("totalDue").textContent = fmtTaka(itemsDue + loansDue);
}

// ---------- This month's profit (sum of 'profit' transactions this month) ----------
function watchMonthProfit(){
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const txQ = query(collection(db, "users", auth.currentUser.uid, "transactions"), where("type", "==", "profit"));
  onSnapshot(txQ, (snap) => {
    let sum = 0;
    snap.forEach(d => {
      const data = d.data();
      const dt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
      if (dt && dt >= monthStart) sum += Number(data.amount) || 0;
    });
    document.getElementById("monthProfit").textContent = fmtTaka(sum);
  });
}

// ---------- Recent transactions ----------
function renderTx(rows){
  const list = document.getElementById("txList");
  if (!rows.length){
    list.innerHTML = `<div class="empty"><span class="glyph">📖</span>এখনও কোনো লেনদেন নেই</div>`;
    return;
  }
  const labels = { profit: "লাভ জমা", withdraw: "উত্তোলন", loan_add: "ঋণ যোগ", loan_paid: "ঋণ পরিশোধ", adjustment: "সমন্বয়" };
  list.innerHTML = rows.map(r => {
    const isNeg = r.amount < 0;
    return `
      <div class="list-item">
        <div>
          <div class="name">${labels[r.type] || r.type}</div>
          <div class="sub">${r.note ? r.note + " · " : ""}${fmtDate(r.createdAt)}</div>
        </div>
        <div class="right" style="display:flex; align-items:center; gap:10px">
          <div class="amount ${isNeg ? "neg" : "pos"} taka">${isNeg ? "-" : "+"}${fmtTaka(Math.abs(r.amount))}</div>
          <button class="btn-ghost del-tx" data-id="${r.id}" data-amount="${r.amount}" style="padding:2px 6px; font-size:16px">🗑</button>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll(".del-tx").forEach(b => b.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.id;
    const amount = Number(e.currentTarget.dataset.amount);
    if (!confirm("এই এন্ট্রিটা মুছে ফেলবেন?\nএর প্রভাব মূল ব্যালেন্স থেকেও বাদ যাবে।\n\n(খেয়াল রাখবেন: এটা শুধু এই লগ এন্ট্রি মুছবে, সংশ্লিষ্ট ফোল্ডার/ঋণের এন্ট্রির \"পরিশোধিত\" অবস্থা বদলাবে না — সেটা ওই পেজে গিয়ে আলাদাভাবে ঠিক করতে হবে।)")) return;
    await updateDoc(userDoc(uid, "meta", "balance"), { mainBalance: increment(-amount) });
    await deleteDoc(userDoc(uid, "transactions", id));
    toast("মুছে ফেলা হয়েছে");
  }));
}

// ---------- Withdraw sheet ----------
const overlay = document.getElementById("withdrawOverlay");
document.getElementById("openWithdraw").addEventListener("click", () => overlay.classList.add("open"));
document.getElementById("closeWithdraw").addEventListener("click", () => overlay.classList.remove("open"));

document.getElementById("confirmWithdraw").addEventListener("click", async () => {
  const note = document.getElementById("wNote").value.trim();
  const amount = parseFloat(document.getElementById("wAmount").value);
  if (!amount || amount <= 0){
    toast("সঠিক পরিমাণ দিন");
    return;
  }
  await applyBalanceChange(uid, -Math.abs(amount), "withdraw", note);
  document.getElementById("wNote").value = "";
  document.getElementById("wAmount").value = "";
  overlay.classList.remove("open");
  toast("ব্যালেন্স থেকে কর্তন হয়েছে");
});
