// ============================================================
// app.js — শেয়ার্ড হেল্পার ফাংশন সব পেইজে ব্যবহার হয়
// ============================================================
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, increment, collection, addDoc,
  serverTimestamp, onSnapshot, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---------- Auth guard ----------
// প্রতিটা প্রোটেক্টেড পেইজের শুরুতে requireAuth() কল করুন
export function requireAuth(callback){
  onAuthStateChanged(auth, (user) => {
    if (!user){
      window.location.href = "login.html";
    } else {
      callback(user);
    }
  });
}

export function logout(){
  signOut(auth).then(() => window.location.href = "login.html");
}

// ---------- Currency / formatting ----------
export function fmtTaka(n){
  const num = Number(n) || 0;
  return num.toLocaleString("en-BD", { maximumFractionDigits: 2 });
}

export function toBnDigits(str){
  const map = { "0":"০","1":"১","2":"২","3":"৩","4":"৪","5":"৫","6":"৬","7":"৭","8":"৮","9":"৯" };
  return String(str).replace(/[0-9]/g, d => map[d]);
}

// ---------- Toast ----------
let toastTimer;
export function toast(msg){
  let el = document.getElementById("__toast");
  if (!el){
    el = document.createElement("div");
    el.id = "__toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// ---------- Firestore path helpers ----------
export function userDoc(uid, ...segments){
  return doc(db, "users", uid, ...segments);
}
export function userCol(uid, ...segments){
  return collection(db, "users", uid, ...segments);
}

// ---------- Balance ----------
// balance মেটা ডকুমেন্ট: users/{uid}/meta/balance -> { mainBalance }
export async function ensureBalanceDoc(uid){
  const ref = userDoc(uid, "meta", "balance");
  const snap = await getDoc(ref);
  if (!snap.exists()){
    await setDoc(ref, { mainBalance: 0 });
  }
  return ref;
}

export function watchBalance(uid, cb){
  const ref = userDoc(uid, "meta", "balance");
  return onSnapshot(ref, (snap) => {
    cb(snap.exists() ? (snap.data().mainBalance || 0) : 0);
  });
}

// পরিমাণ মূল ব্যালেন্সে যোগ/বিয়োগ করে + একটা transaction লগ তৈরি করে
export async function applyBalanceChange(uid, amount, type, note, refPath = null){
  const balRef = await ensureBalanceDoc(uid);
  await updateDoc(balRef, { mainBalance: increment(amount) });
  await addDoc(userCol(uid, "transactions"), {
    amount, type, note: note || "", refPath: refPath || "",
    createdAt: serverTimestamp()
  });
}

export function watchRecentTransactions(uid, cb, max = 8){
  const q = query(userCol(uid, "transactions"), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
    cb(rows);
  });
}

// ---------- Categories (global list, reused across all folders) ----------
export function watchCategories(uid, cb){
  const q = query(userCol(uid, "categories"), orderBy("name"));
  return onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
    cb(rows);
  });
}

export async function addCategoryIfNew(uid, name){
  name = name.trim();
  if (!name) return;
  const q = query(userCol(uid, "categories"));
  const snap = await new Promise(res => {
    const unsub = onSnapshot(q, s => { unsub(); res(s); });
  });
  const exists = snap.docs.some(d => (d.data().name || "").trim().toLowerCase() === name.toLowerCase());
  if (!exists){
    await addDoc(userCol(uid, "categories"), { name, createdAt: serverTimestamp() });
  }
}

// ---------- Time formatting ----------
export function fmtDate(ts){
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("bn-BD", { day:"numeric", month:"short", year:"numeric" });
}
