import { auth, db } from "./firebase-config.js";
import { requireAuth, fmtTaka, toast, userCol } from "./app.js";
import {
  addDoc, serverTimestamp, query, orderBy, onSnapshot, collection
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let uid;
const itemUnsubs = {}; // folderId -> unsubscribe fn for its items listener

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
    <a href="folder.html?id=${r.id}" class="list-item" style="display:flex">
      <div>
        <div class="name">${escapeHtml(r.name)}</div>
        <div class="sub">${r.note ? escapeHtml(r.note) : "কোনো নোট নেই"}</div>
      </div>
      <div class="right">
        <div class="amount taka" id="tot-${r.id}">০</div>
        <div class="sub" id="badge-${r.id}"></div>
      </div>
    </a>
  `).join("");

  rows.forEach(r => watchFolderTotal(r.id));
}

function watchFolderTotal(folderId){
  if (itemUnsubs[folderId]) return; // already watching
  const q = collection(db, "users", uid, "customers", folderId, "items");
  itemUnsubs[folderId] = onSnapshot(q, (snap) => {
    let total = 0, unpaid = 0;
    snap.forEach(d => {
      const it = d.data();
      total += Number(it.profit) || 0;
      if (!it.paid) unpaid += Number(it.profit) || 0;
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

// ---------- New folder sheet ----------
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
