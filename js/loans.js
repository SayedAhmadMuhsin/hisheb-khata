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
  let due = 0, paidTotal = 0;
  const list = document.getElementById("loanList");
  if (!rows.length){
    list.innerHTML = `<div class="empty"><span class="glyph">🤝</span>এখনও কোনো ঋণের হিসাব নেই</div>`;
    document.getElementById("totalLoanDue").textContent = "০";
    document.getElementById("totalLoanPaid").textContent = "০";
    return;
  }
  list.innerHTML = rows.map(r => {
    const amount = Number(r.amount) || 0;
    const paidAmount = r.paidAmount !== undefined ? Number(r.paidAmount) : (r.paid ? amount : 0);
    const remaining = Math.max(amount - paidAmount, 0);
    const isFull = paidAmount >= amount;
    const isPartial = paidAmount > 0 && !isFull;

    if (isFull) paidTotal += amount; else due += remaining;

    let badge;
    if (isFull) badge = `<span class="badge paid">সম্পূর্ণ আদায়</span>`;
    else if (isPartial) badge = `<span class="badge partial">আংশিক আদায় ৳${fmtTaka(paidAmount)}</span>`;
    else badge = `<span class="badge unpaid">বকেয়া</span>`;

    return `
      <div class="list-item" style="align-items:flex-start; flex-direction:column; gap:8px">
        <div style="display:flex; width:100%; justify-content:space-between">
          <div>
            <div class="name">${escapeAttr(r.personName)}</div>
            <div class="sub">${r.note ? escapeAttr(r.note) : ""}</div>
            <div class="sub">${fmtDate(r.createdAt)}</div>
          </div>
          <div class="right">
            <div class="amount ${isFull ? "pos" : isPartial ? "pending" : "neg"} taka">${fmtTaka(amount)}</div>
            ${isPartial ? `<div class="sub">বকেয়া ৳${fmtTaka(remaining)}</div>` : ""}
            ${badge}
          </div>
        </div>
        <div class="item-actions" style="width:100%; margin-top:0; flex-wrap:wrap">
          ${isFull
            ? `<button class="btn btn-outline undo-loan" data-id="${r.id}" data-paidamount="${paidAmount}">বাতিল করুন</button>`
            : `
              <button class="btn btn-primary pay-loan" data-id="${r.id}" data-amount="${amount}" data-paidamount="${paidAmount}" data-name="${escapeAttr(r.personName)}">সম্পূর্ণ আদায়</button>
              <button class="btn btn-secondary partial-loan" data-id="${r.id}" data-amount="${amount}" data-paidamount="${paidAmount}" data-name="${escapeAttr(r.personName)}">আংশিক পরিশোধ</button>
            `
          }
          <button class="btn btn-outline edit-loan" data-id="${r.id}" data-name="${escapeAttr(r.personName)}" data-amount="${amount}" data-note="${escapeAttr(r.note || "")}" style="flex:0 0 44px">✏️</button>
          <button class="btn btn-outline del-loan" data-id="${r.id}" data-paidamount="${paidAmount}" style="flex:0 0 44px">🗑</button>
        </div>
      </div>`;
  }).join("");

  document.getElementById("totalLoanDue").textContent = fmtTaka(due);
  document.getElementById("totalLoanPaid").textContent = fmtTaka(paidTotal);

  list.querySelectorAll(".pay-loan").forEach(b => b.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.id;
    const amount = Number(e.currentTarget.dataset.amount);
    const paidAmount = Number(e.currentTarget.dataset.paidamount) || 0;
    const name = e.currentTarget.dataset.name;
    const remaining = amount - paidAmount;
    await updateDoc(userDoc(uid, "loans", id), { paidAmount: amount, paid: true, paidAt: serverTimestamp() });
    await applyBalanceChange(uid, remaining, "loan_paid", `${name} — ঋণ আদায়`);
    toast("ব্যালেন্সে যোগ হয়েছে");
  }));

  list.querySelectorAll(".partial-loan").forEach(b => b.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.id;
    const amount = Number(e.currentTarget.dataset.amount);
    const paidAmount = Number(e.currentTarget.dataset.paidamount) || 0;
    const name = e.currentTarget.dataset.name;
    const remaining = amount - paidAmount;

    const input = prompt(
      `${name} — মোট পাওনা ৳${fmtTaka(amount)}, এখনো বকেয়া ৳${fmtTaka(remaining)}।\nকত টাকা এখন পরিশোধ করলো?`,
      ""
    );
    if (input === null) return;
    const paidNow = parseFloat(input);
    if (!paidNow || paidNow <= 0){
      toast("সঠিক পরিমাণ দিন");
      return;
    }
    const cappedPaidNow = Math.min(paidNow, remaining);
    const newPaidAmount = paidAmount + cappedPaidNow;
    const isFullyPaid = newPaidAmount >= amount;

    await updateDoc(userDoc(uid, "loans", id), {
      paidAmount: newPaidAmount,
      paid: isFullyPaid,
      paidAt: isFullyPaid ? serverTimestamp() : null
    });
    await applyBalanceChange(uid, cappedPaidNow, "loan_paid", `${name} — আংশিক আদায় (৳${fmtTaka(cappedPaidNow)})`);
    toast(isFullyPaid ? "সম্পূর্ণ আদায় হয়ে গেছে" : "আংশিক পরিশোধ ব্যালেন্সে যোগ হয়েছে");
  }));

  list.querySelectorAll(".undo-loan").forEach(b => b.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.id;
    const paidAmount = Number(e.currentTarget.dataset.paidamount) || 0;
    await updateDoc(userDoc(uid, "loans", id), { paidAmount: 0, paid: false, paidAt: null });
    await applyBalanceChange(uid, -paidAmount, "loan_paid", "আদায় বাতিল");
    toast("বাতিল হয়েছে");
  }));

  list.querySelectorAll(".edit-loan").forEach(b => b.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.id;
    const currentName = e.currentTarget.dataset.name;
    const currentAmount = e.currentTarget.dataset.amount;
    const currentNote = e.currentTarget.dataset.note;
    const newName = prompt("ব্যক্তির নাম:", currentName);
    if (newName === null) return;
    const newAmountStr = prompt("মোট পাওনা (৳):", currentAmount);
    if (newAmountStr === null) return;
    const newAmount = parseFloat(newAmountStr);
    if (!newName.trim() || !newAmount || newAmount <= 0){
      toast("সঠিক নাম ও পরিমাণ দিন");
      return;
    }
    const newNote = prompt("নোট:", currentNote);
    await updateDoc(userDoc(uid, "loans", id), {
      personName: newName.trim(), amount: newAmount, note: (newNote || "").trim()
    });
    toast("আপডেট হয়েছে");
  }));

  list.querySelectorAll(".del-loan").forEach(b => b.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.id;
    const paidAmount = Number(e.currentTarget.dataset.paidamount) || 0;
    const warn = paidAmount > 0 ? ` এর আদায়কৃত ৳${fmtTaka(paidAmount)} ব্যালেন্স থেকেও বাদ যাবে।` : "";
    if (!confirm("এই এন্ট্রি মুছে ফেলবেন?" + warn)) return;
    if (paidAmount > 0){
      await applyBalanceChange(uid, -paidAmount, "adjustment", "ঋণ এন্ট্রি মুছে ফেলায় সমন্বয়");
    }
    await deleteDoc(userDoc(uid, "loans", id));
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
    personName, amount, paidAmount: 0, note, paid: false, createdAt: serverTimestamp()
  });
  document.getElementById("lName").value = "";
  document.getElementById("lAmount").value = "";
  document.getElementById("lNote").value = "";
  overlay.classList.remove("open");
  toast("ঋণ যোগ হয়েছে");
});
