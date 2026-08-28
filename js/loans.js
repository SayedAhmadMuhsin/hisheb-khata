import {
  requireAuth, fmtTaka, toast, userDoc, userCol, applyBalanceChange, fmtDate
} from "./app.js";
import {
  addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let uid;

requireAuth((user) => {
  uid = user.uid;
  const q = query(userCol(uid, "loans"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
    renderLoans(rows);
  });
});

function renderLoans(rows){
  let due = 0, paid = 0;
  const list = document.getElementById("loanList");
  if (!rows.length){
    list.innerHTML = `<div class="empty"><span class="glyph">🤝</span>এখনও কোনো ঋণের হিসাব নেই</div>`;
    document.getElementById("totalLoanDue").textContent = "০";
    document.getElementById("totalLoanPaid").textContent = "০";
    return;
  }
  list.innerHTML = rows.map(r => {
    if (r.paid) paid += Number(r.amount) || 0; else due += Number(r.amount) || 0;
    return `
      <div class="list-item" style="align-items:flex-start; flex-direction:column; gap:8px">
        <div style="display:flex; width:100%; justify-content:space-between">
          <div>
            <div class="name">${escapeAttr(r.personName)}</div>
            <div class="sub">${r.note ? escapeAttr(r.note) : ""}</div>
            <div class="sub">${fmtDate(r.createdAt)}</div>
          </div>
          <div class="right">
            <div class="amount ${r.paid ? "pos" : "pending"} taka">${fmtTaka(r.amount)}</div>
            <span class="badge ${r.paid ? "paid" : "unpaid"}">${r.paid ? "আদায় হয়েছে" : "বকেয়া"}</span>
          </div>
        </div>
        <div class="item-actions" style="width:100%; margin-top:0">
          ${r.paid
            ? `<button class="btn btn-outline undo-loan" data-id="${r.id}" data-amount="${r.amount}">বাতিল করুন</button>`
            : `<button class="btn btn-primary pay-loan" data-id="${r.id}" data-amount="${r.amount}" data-name="${escapeAttr(r.personName)}">আদায় হয়েছে — ব্যালেন্সে যোগ করুন</button>`
          }
          <button class="btn btn-outline del-loan" data-id="${r.id}" style="flex:0 0 44px">🗑</button>
        </div>
      </div>`;
  }).join("");

  document.getElementById("totalLoanDue").textContent = fmtTaka(due);
  document.getElementById("totalLoanPaid").textContent = fmtTaka(paid);

  list.querySelectorAll(".pay-loan").forEach(b => b.addEventListener("click", async (e) => {
    const id = e.target.dataset.id, amount = Number(e.target.dataset.amount), name = e.target.dataset.name;
    await updateDoc(userDoc(uid, "loans", id), { paid: true, paidAt: serverTimestamp() });
    await applyBalanceChange(uid, amount, "loan_paid", `${name} — ঋণ আদায়`);
    toast("ব্যালেন্সে যোগ হয়েছে");
  }));
  list.querySelectorAll(".undo-loan").forEach(b => b.addEventListener("click", async (e) => {
    const id = e.target.dataset.id, amount = Number(e.target.dataset.amount);
    await updateDoc(userDoc(uid, "loans", id), { paid: false, paidAt: null });
    await applyBalanceChange(uid, -amount, "loan_paid", "ঋণ আদায় বাতিল");
    toast("বাতিল হয়েছে");
  }));
  list.querySelectorAll(".del-loan").forEach(b => b.addEventListener("click", async (e) => {
    if (!confirm("এই এন্ট্রি মুছে ফেলবেন?")) return;
    await deleteDoc(userDoc(uid, "loans", e.target.dataset.id));
    toast("মুছে ফেলা হয়েছে");
  }));
}

function escapeAttr(s){
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

const overlay = document.getElementById("loanOverlay");
document.getElementById("openNewLoan").addEventListener("click", () => overlay.classList.add("open"));
document.getElementById("closeLoan").addEventListener("click", () => overlay.classList.remove("open"));

document.getElementById("saveLoan").addEventListener("click", async () => {
  const personName = document.getElementById("lName").value.trim();
  const amount = parseFloat(document.getElementById("lAmount").value);
  const note = document.getElementById("lNote").value.trim();
  if (!personName || !amount || amount <= 0){
    toast("নাম ও সঠিক পরিমাণ দিন");
    return;
  }
  await addDoc(userCol(uid, "loans"), {
    personName, amount, note, paid: false, createdAt: serverTimestamp()
  });
  document.getElementById("lName").value = "";
  document.getElementById("lAmount").value = "";
  document.getElementById("lNote").value = "";
  overlay.classList.remove("open");
  toast("ঋণ যোগ হয়েছে");
});
