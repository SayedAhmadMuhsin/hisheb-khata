// ============================================================
// এখানে আপনার Firebase প্রজেক্টের কনফিগ বসান।
// Firebase Console → Project settings → General → Your apps → SDK setup and configuration
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCLSckiOfv4tZQz4NGmH2D0nCUi0RqAmrA",
  authDomain: "hisheb-khata-dc693.firebaseapp.com",
  projectId: "hisheb-khata-dc693",
  storageBucket: "hisheb-khata-dc693.firebasestorage.app",
  messagingSenderId: "670537836943",
  appId: "1:670537836943:web:1c2654b918d8d8d177c3fa"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
