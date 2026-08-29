import { auth, db } from "./firebase-config.js";
import { requireAuth, fmtTaka, toast, userCol, userDoc, applyBalanceChange } from "./app.js";
import {
  addDoc, updateDoc, deleteDoc, getDocs, serverTimestamp, query, orderBy, onSnapshot, collection
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let uid;
const itemUnsubs = {};

requireAuth((user) => {
  uid = user.uid;
  const q = query(userCol(uid, "customers"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
    renderFolders(rows);
  });
});

function renderFolders(rows){
  const list = document.getElementById("folderList");
  if (!rows.length){
    list.innerHTML = `<div class="empty"><span class="glyph">📁</span>এখনও কোনো ফোল্ডার নেই<br>নিচের + বাটনে চাপুন</div>`;
    return;
  }
  list.innerHTML = rows.map(r => `
    <div class="list-item" style="display:flex; gap:8px">
      <div class="folder-open" data-id="${r.id}" style="flex:1; cursor:pointer">
        <div class="name">${escapeHtml(r.name)}</div>
        <div class="sub">${r.note ? escapeHtml(r.note) : "কোনো নোট নেই"}</div>
      </div>
      <div class="right">
        <div class="amount taka" id="tot-${r.id}">০</div>
        <div class="sub" id="badge-${r.id}"></div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; justify-content:center">
        <button class="btn-ghost edit-folder" data-id="${r.id}" data-name="${escapeHtml(r.name)}" style="padding:2px 6px; font-size:16px">✏️</button>
        <button class="btn-ghost del-folder" data-id="${r.id}" data-name="${escapeHtml(r.name)}" style="padding:2px 6px; font-size:16px">🗑</button>
      </div>
    </div>
  `).join("");

  rows.forEach(r => watchFolderTotal(r.id));

  list.querySelectorAll(".folder-open").forEach(el => el.addEventListener("click", (e) => {
    location.href = `folder.html?id=${e.currentTarget.dataset.id}`;
  }));
  list.querySelectorAll(".edit-folder").forEach(el => el.addEventListener("click", onEditFolder));
  list.querySelectorAll(".del-folder").forEach(el => el.addEventListener("click", onDeleteFolder));
}

async function onEditFolder(e){
  e.stopPropagation();
  const id = e.currentTarget.dataset.id;
  const currentName = e.currentTarget.dataset.name;
  const newName = prompt("কাস্টমারের নতুন নাম লিখুন:", currentName);
  if (newName === null) return;
  if (!newName.trim()){
    toast("নাম খালি রাখা যাবে না");
    return;
  }
  await updateDoc(userDoc(uid, "customers", id), { name: newName.trim() });
  toast("নাম বদলানো হয়েছে");
}

async function onDeleteFolder(e){
  e.stopPropagation();
  const id = e.currentTarget.dataset.id;
  const name = e.currentTarget.dataset.name;
  if (!confirm(`"${name}" ফোল্ডার ও এর সব প্রোডাক্ট স্থায়ীভাবে মুছে যাবে।\nএই ফোল্ডারের "পরিশোধিত" লাভ থাকলে সেটা মূল ব্যালেন্স থেকেও বাদ যাবে।\n\nআপনি কি নিশ্চিত?`)) return;

  const itemsSnap = await getDocs(collection(db, "users", uid, "customers", id, "items"));
  let paidSum = 0;
  const deletions = [];
  itemsSnap.forEach(d => {
    const it = d.data();
    const paidAmount = it.paidAmount !== undefined ? Number(it.paidAmount) : (it.paid ? Number(it.profit) || 0 : 0);
    paidSum += paidAmount;
    deletions.push(deleteDoc(d.ref));
  });
  await Promise.all(deletions);

  if (paidSum !== 0){
    await applyBalanceChange(uid, -paidSum, "adjustment", `ফোল্ডার "${name}" মুছে ফেলায় সমন্বয়`);
  }

  await deleteDoc(userDoc(uid, "customers", id));
  toast("ফোল্ডার মুছে ফেলা হয়েছে");
}

function watchFolderTotal(folderId){
  if (itemUnsubs[folderId]) return;
  const q = collection(db, "users", uid, "customers", folderId, "items");
  itemUnsubs[folderId] = onSnapshot(q, (snap) => {
    let total = 0, unpaid = 0;
    snap.forEach(d => {
      const it = d.data();
      const profit = Number(it.profit) || 0;
      const paidAmount = it.paidAmount !== undefined ? Number(it.paidAmount) : (it.paid ? profit : 0);
      total += profit;
      unpaid += Math.max(profit - paidAmount, 0);
    });
    const totEl = document.getElementById(`tot-${folderId}`);
    const badgeEl = document.getElementById(`badge-${folderId}`);
    if (totEl) totEl.textContent = fmtTaka(total);
    if (badgeEl){
      badgeEl.innerHTML = unpaid > 0
        ? `<span class="badge unpaid">বকেয়া ৳${fmtTaka(unpaid)}</span>`
        : `<span class="badge paid">পরিশোধিত</span>`;
    }
  });
}

function escapeHtml(s){
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

const overlay = document.getElementById("folderOverlay");
document.getElementById("openNewFolder").addEventListener("click", () => overlay.classList.add("open"));
document.getElementById("closeFolder").addEventListener("click", () => overlay.classList.remove("open"));

document.getElementById("createFolder").addEventListener("click", async () => {
  const name = document.getElementById("fName").value.trim();
  const note = document.getElementById("fNote").value.trim();
  if (!name){
    toast("কাস্টমারের নাম দিন");
    return;
  }
  await addDoc(userCol(uid, "customers"), { name, note, createdAt: serverTimestamp() });
  document.getElementById("fName").value = "";
  document.getElementById("fNote").value = "";
  overlay.classList.remove("open");
  toast("ফোল্ডার তৈরি হয়েছে");
});
