import { db } from "./firebase-config.js";
import {
  requireAuth, fmtTaka, toast, userDoc, userCol,
  watchCategories, addCategoryIfNew, applyBalanceChange
} from "./app.js";
import {
  doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp,
  collection, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const params = new URLSearchParams(location.search);
const folderId = params.get("id");
let uid;

if (!folderId){
  location.href = "folders.html";
}

requireAuth(async (user) => {
  uid = user.uid;

  const fSnap = await getDoc(userDoc(uid, "customers", folderId));
  if (!fSnap.exists()){
    toast("ফোল্ডার খুঁজে পাওয়া যায়নি");
    setTimeout(() => location.href = "folders.html", 1200);
    return;
  }
  document.getElementById("folderName").textContent = fSnap.data().name;

  document.getElementById("renameFolderBtn").addEventListener("click", async () => {
    const current = document.getElementById("folderName").textContent;
    const newName = prompt("কাস্টমারের নতুন নাম লিখুন:", current);
    if (newName === null) return;
    if (!newName.trim()){
      toast("নাম খালি রাখা যাবে না");
      return;
    }
    await updateDoc(userDoc(uid, "customers", folderId), { name: newName.trim() });
    document.getElementById("folderName").textContent = newName.trim();
    toast("নাম বদলানো হয়েছে");
  });

  watchCategories(uid, populateCategorySelect);

  const q = query(collection(db, "users", uid, "customers", folderId, "items"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
    renderItems(rows);
  });
});

// ---------- Category select ----------
function populateCategorySelect(cats){
  const sel = document.getElementById("catSelect");
  const current = sel.value;
  sel.innerHTML = cats.map(c => `<option value="${c.id}" data-name="${escapeAttr(c.name)}">${escapeAttr(c.name)}</option>`).join("")
    + `<option value="__new__">+ নতুন ক্যাটেগরি যোগ করুন</option>`;
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
  document.getElementById("newCatField").classList.toggle("hidden", sel.value !== "__new__");
}
document.getElementById("catSelect").addEventListener("change", (e) => {
  document.getElementById("newCatField").classList.toggle("hidden", e.target.value !== "__new__");
});

// ---------- Render items ----------
function renderItems(rows){
  let totalProfit = 0, unpaid = 0;
  const list = document.getElementById("itemList");

  if (!rows.length){
    list.innerHTML = `<div class="empty"><span class="glyph">🧾</span>এখনও কোনো প্রোডাক্ট যোগ করা হয়নি</div>`;
    document.getElementById("folderTotalProfit").textContent = "০";
    document.getElementById("folderUnpaid").textContent = "০";
    return;
  }

  list.innerHTML = rows.map(it => {
    const profit = Number(it.profit) || 0;
    const paidAmount = it.paidAmount !== undefined ? Number(it.paidAmount) : (it.paid ? profit : 0);
    const remaining = Math.max(profit - paidAmount, 0);
    const isFull = paidAmount >= profit && profit > 0;
    const isPartial = paidAmount > 0 && !isFull;

    totalProfit += profit;
    if (!isFull) unpaid += remaining;

    let badge;
    if (isFull) badge = `<span class="badge paid">পরিশোধিত</span>`;
    else if (isPartial) badge = `<span class="badge partial">আংশিক ৳${fmtTaka(paidAmount)}</span>`;
    else badge = `<span class="badge unpaid">বকেয়া</span>`;

    return `
      <div class="item-card">
        <div class="item-top">
          <div class="cat-name">${escapeAttr(it.category)}</div>
          ${badge}
        </div>
        <div class="calc-grid">
          <div class="k">পরিমাণ</div><div class="v">${it.quantity} পিছ</div>
          <div class="k">মূল রেট</div><div class="v taka">${fmtTaka(it.costRate)}</div>
          <div class="k">মোট খরচ</div><div class="v taka">${fmtTaka(it.costTotal)}</div>
          <div class="k">কাস্টমার রেট</div><div class="v taka">${fmtTaka(it.saleRate)}</div>
          <div class="k">মোট বিক্রয়</div><div class="v taka">${fmtTaka(it.saleTotal)}</div>
        </div>
        <div class="divider"></div>
        <div class="profit-line">
          <span>লাভ</span>
          <span class="v taka">${fmtTaka(profit)}</span>
        </div>
        ${isPartial ? `<div class="sub" style="margin-top:4px">বকেয়া রয়েছে ৳${fmtTaka(remaining)}</div>` : ""}
        <div class="item-actions" style="flex-wrap:wrap">
          ${isFull
            ? `<button class="btn btn-outline undo-btn" data-id="${it.id}" data-paidamount="${paidAmount}">পরিশোধ বাতিল করুন</button>`
            : `
              <button class="btn btn-primary pay-btn" data-id="${it.id}" data-profit="${profit}" data-paidamount="${paidAmount}" data-cat="${escapeAttr(it.category)}">সম্পূর্ণ পরিশোধ</button>
              <button class="btn btn-secondary partial-btn" data-id="${it.id}" data-profit="${profit}" data-paidamount="${paidAmount}" data-cat="${escapeAttr(it.category)}">আংশিক পরিশোধ</button>
            `
          }
          <button class="btn btn-outline edit-btn" data-id="${it.id}" data-cat="${escapeAttr(it.category)}" data-qty="${it.quantity}" data-costrate="${it.costRate}" data-salerate="${it.saleRate}" style="flex:0 0 44px">✏️</button>
          <button class="btn btn-outline del-btn" data-id="${it.id}" data-paidamount="${paidAmount}" style="flex:0 0 44px">🗑</button>
        </div>
      </div>`;
  }).join("");

  document.getElementById("folderTotalProfit").textContent = fmtTaka(totalProfit);
  document.getElementById("folderUnpaid").textContent = fmtTaka(unpaid);

  list.querySelectorAll(".pay-btn").forEach(btn => btn.addEventListener("click", onPay));
  list.querySelectorAll(".partial-btn").forEach(btn => btn.addEventListener("click", onPartialPay));
  list.querySelectorAll(".undo-btn").forEach(btn => btn.addEventListener("click", onUndo));
  list.querySelectorAll(".edit-btn").forEach(btn => btn.addEventListener("click", onEditItem));
  list.querySelectorAll(".del-btn").forEach(btn => btn.addEventListener("click", onDelete));
}

async function onPay(e){
  const id = e.currentTarget.dataset.id;
  const profit = Number(e.currentTarget.dataset.profit);
  const paidAmount = Number(e.currentTarget.dataset.paidamount) || 0;
  const cat = e.currentTarget.dataset.cat;
  const remaining = profit - paidAmount;
  const folderName = document.getElementById("folderName").textContent;
  await updateDoc(userDoc(uid, "customers", folderId, "items", id), { paidAmount: profit, paid: true, paidAt: serverTimestamp() });
  await applyBalanceChange(uid, remaining, "profit", `${folderName} — ${cat}`, `customers/${folderId}/items/${id}`);
  toast("লাভ মূল ব্যালেন্সে যোগ হয়েছে");
}

async function onPartialPay(e){
  const id = e.currentTarget.dataset.id;
  const profit = Number(e.currentTarget.dataset.profit);
  const paidAmount = Number(e.currentTarget.dataset.paidamount) || 0;
  const cat = e.currentTarget.dataset.cat;
  const remaining = profit - paidAmount;
  const folderName = document.getElementById("folderName").textContent;

  const input = prompt(
    `${cat} — মোট লাভ ৳${fmtTaka(profit)}, এখনো বকেয়া ৳${fmtTaka(remaining)}।\nকাস্টমার কত টাকা এখন পরিশোধ করলো?`,
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
  const isFullyPaid = newPaidAmount >= profit;

  await updateDoc(userDoc(uid, "customers", folderId, "items", id), {
    paidAmount: newPaidAmount,
    paid: isFullyPaid,
    paidAt: isFullyPaid ? serverTimestamp() : null
  });
  await applyBalanceChange(uid, cappedPaidNow, "profit", `${folderName} — ${cat} (আংশিক ৳${fmtTaka(cappedPaidNow)})`, `customers/${folderId}/items/${id}`);
  toast(isFullyPaid ? "সম্পূর্ণ পরিশোধ হয়ে গেছে" : "আংশিক পরিশোধ ব্যালেন্সে যোগ হয়েছে");
}

async function onUndo(e){
  const id = e.currentTarget.dataset.id;
  const paidAmount = Number(e.currentTarget.dataset.paidamount) || 0;
  await updateDoc(userDoc(uid, "customers", folderId, "items", id), { paidAmount: 0, paid: false, paidAt: null });
  await applyBalanceChange(uid, -paidAmount, "profit", "পরিশোধ বাতিল");
  toast("পরিশোধ বাতিল হয়েছে");
}

async function onEditItem(e){
  const id = e.currentTarget.dataset.id;
  const currentCat = e.currentTarget.dataset.cat;
  const currentQty = e.currentTarget.dataset.qty;
  const currentCostRate = e.currentTarget.dataset.costrate;
  const currentSaleRate = e.currentTarget.dataset.salerate;

  const newCat = prompt("ক্যাটেগরির নাম:", currentCat);
  if (newCat === null) return;
  const newQtyStr = prompt("পরিমাণ (পিছ):", currentQty);
  if (newQtyStr === null) return;
  const newCostRateStr = prompt("মূল রেট (প্রতি পিছ খরচ, ৳):", currentCostRate);
  if (newCostRateStr === null) return;
  const newSaleRateStr = prompt("কাস্টমার রেট (প্রতি পিছ, ৳):", currentSaleRate);
  if (newSaleRateStr === null) return;

  const newQty = parseFloat(newQtyStr);
  const newCostRate = parseFloat(newCostRateStr);
  const newSaleRate = parseFloat(newSaleRateStr);
  if (!newCat.trim() || !newQty || newQty <= 0 || isNaN(newCostRate) || isNaN(newSaleRate)){
    toast("সঠিক তথ্য দিন");
    return;
  }

  const newCostTotal = newQty * newCostRate;
  const newSaleTotal = newQty * newSaleRate;
  const newProfit = newSaleTotal - newCostTotal;

  await updateDoc(userDoc(uid, "customers", folderId, "items", id), {
    category: newCat.trim(), quantity: newQty, costRate: newCostRate, saleRate: newSaleRate,
    costTotal: newCostTotal, saleTotal: newSaleTotal, profit: newProfit
  });
  toast("আপডেট হয়েছে");
}

async function onDelete(e){
  const id = e.currentTarget.dataset.id;
  const paidAmount = Number(e.currentTarget.dataset.paidamount) || 0;
  const warn = paidAmount > 0 ? ` এর পরিশোধিত ৳${fmtTaka(paidAmount)} মূল ব্যালেন্স থেকেও বাদ যাবে।` : "";
  if (!confirm("এই প্রোডাক্টটি মুছে ফেলবেন?" + warn)) return;
  if (paidAmount > 0){
    await applyBalanceChange(uid, -paidAmount, "adjustment", "প্রোডাক্ট মুছে ফেলায় সমন্বয়");
  }
  await deleteDoc(userDoc(uid, "customers", folderId, "items", id));
  toast("মুছে ফেলা হয়েছে");
}

function escapeAttr(s){
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

// ---------- New item sheet ----------
const overlay = document.getElementById("itemOverlay");
document.getElementById("openNewItem").addEventListener("click", () => overlay.classList.add("open"));
document.getElementById("closeItem").addEventListener("click", () => overlay.classList.remove("open"));

["iQty", "iCostRate", "iSaleRate"].forEach(id => {
  document.getElementById(id).addEventListener("input", updatePreview);
});
function updatePreview(){
  const qty = parseFloat(document.getElementById("iQty").value) || 0;
  const costRate = parseFloat(document.getElementById("iCostRate").value) || 0;
  const saleRate = parseFloat(document.getElementById("iSaleRate").value) || 0;
  const cost = qty * costRate;
  const sale = qty * saleRate;
  document.getElementById("previewCost").textContent = fmtTaka(cost);
  document.getElementById("previewSale").textContent = fmtTaka(sale);
  document.getElementById("previewProfit").textContent = fmtTaka(sale - cost);
}

document.getElementById("saveItem").addEventListener("click", async () => {
  const sel = document.getElementById("catSelect");
  let categoryName;
  if (sel.value === "__new__"){
    categoryName = document.getElementById("newCatName").value.trim();
    if (!categoryName){ toast("ক্যাটেগরির নাম দিন"); return; }
    await addCategoryIfNew(uid, categoryName);
  } else {
    const opt = sel.options[sel.selectedIndex];
    categoryName = opt ? opt.dataset.name : "";
  }
  const qty = parseFloat(document.getElementById("iQty").value) || 0;
  const costRate = parseFloat(document.getElementById("iCostRate").value) || 0;
  const saleRate = parseFloat(document.getElementById("iSaleRate").value) || 0;
  if (!categoryName || qty <= 0){
    toast("ক্যাটেগরি ও পরিমাণ ঠিকভাবে দিন");
    return;
  }
  const costTotal = qty * costRate;
  const saleTotal = qty * saleRate;
  const profit = saleTotal - costTotal;

  await addDoc(userCol(uid, "customers", folderId, "items"), {
    category: categoryName, quantity: qty, costRate, saleRate,
    costTotal, saleTotal, profit, paidAmount: 0, paid: false,
    ownerUid: uid, createdAt: serverTimestamp()
  });

  ["iQty", "iCostRate", "iSaleRate", "newCatName"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("previewCost").textContent = "০";
  document.getElementById("previewSale").textContent = "০";
  document.getElementById("previewProfit").textContent = "০";
  overlay.classList.remove("open");
  toast("প্রোডাক্ট যোগ হয়েছে");
});
