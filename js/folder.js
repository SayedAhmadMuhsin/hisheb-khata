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
    totalProfit += Number(it.profit) || 0;
    if (!it.paid) unpaid += Number(it.profit) || 0;
    return `
      <div class="item-card">
        <div class="item-top">
          <div class="cat-name">${escapeAttr(it.category)}</div>
          <span class="badge ${it.paid ? "paid" : "unpaid"}">${it.paid ? "পরিশোধিত" : "বকেয়া"}</span>
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
          <span class="v taka">${fmtTaka(it.profit)}</span>
        </div>
        <div class="item-actions">
          ${it.paid
            ? `<button class="btn btn-outline undo-btn" data-id="${it.id}" data-profit="${it.profit}">পরিশোধ বাতিল করুন</button>`
            : `<button class="btn btn-primary pay-btn" data-id="${it.id}" data-profit="${it.profit}" data-cat="${escapeAttr(it.category)}">পরিশোধ — ব্যালেন্সে যোগ করুন</button>`
          }
          <button class="btn btn-outline del-btn" data-id="${it.id}" style="flex:0 0 44px">🗑</button>
        </div>
      </div>`;
  }).join("");

  document.getElementById("folderTotalProfit").textContent = fmtTaka(totalProfit);
  document.getElementById("folderUnpaid").textContent = fmtTaka(unpaid);

  list.querySelectorAll(".pay-btn").forEach(btn => btn.addEventListener("click", onPay));
  list.querySelectorAll(".undo-btn").forEach(btn => btn.addEventListener("click", onUndo));
  list.querySelectorAll(".del-btn").forEach(btn => btn.addEventListener("click", onDelete));
}

async function onPay(e){
  const id = e.target.dataset.id;
  const profit = Number(e.target.dataset.profit);
  const cat = e.target.dataset.cat;
  const folderName = document.getElementById("folderName").textContent;
  await updateDoc(userDoc(uid, "customers", folderId, "items", id), { paid: true, paidAt: serverTimestamp() });
  await applyBalanceChange(uid, profit, "profit", `${folderName} — ${cat}`, `customers/${folderId}/items/${id}`);
  toast("লাভ মূল ব্যালেন্সে যোগ হয়েছে");
}

async function onUndo(e){
  const id = e.target.dataset.id;
  const profit = Number(e.target.dataset.profit);
  await updateDoc(userDoc(uid, "customers", folderId, "items", id), { paid: false, paidAt: null });
  await applyBalanceChange(uid, -profit, "profit", "পরিশোধ বাতিল");
  toast("পরিশোধ বাতিল হয়েছে");
}

async function onDelete(e){
  const id = e.target.dataset.id;
  if (!confirm("এই প্রোডাক্টটি মুছে ফেলবেন?")) return;
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
    costTotal, saleTotal, profit, paid: false,
    ownerUid: uid, createdAt: serverTimestamp()
  });

  ["iQty", "iCostRate", "iSaleRate", "newCatName"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("previewCost").textContent = "০";
  document.getElementById("previewSale").textContent = "০";
  document.getElementById("previewProfit").textContent = "০";
  overlay.classList.remove("open");
  toast("প্রোডাক্ট যোগ হয়েছে");
});
