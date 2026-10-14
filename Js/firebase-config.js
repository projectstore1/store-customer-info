// =====================================================================
// Abdullah Store — Firebase Configuration
// Realtime Database enable করা হয়েছে ধরে নিয়ে config দেওয়া হলো
// =====================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyC0v8rABIglIXQGv-JfOcz0FBiTxtvg8zQ",
  authDomain: "abdullah-store-v1.firebaseapp.com",
  // ⬇️⬇️ এই লাইনটাই আপনার নিজের URL দিয়ে replace করবেন ⬇️⬇️
  databaseURL: "https://abdullah-store-v1-default-rtdb.asia-southeast1.firebasedatabase.app",
  // অথবা: "https://abdullah-store-v1-default-rtdb.firebaseio.com"
  projectId: "abdullah-store-v1",
  storageBucket: "abdullah-store-v1.firebasestorage.app",
  messagingSenderId: "757004475979",
  appId: "1:757004475979:web:858b4cceaa39c4dfe3f7ce",
  measurementId: "G-4FJQJV6W55"
};

export const isFirebaseConfigured = () =>
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("YOUR_") &&
  firebaseConfig.databaseURL &&
  !firebaseConfig.databaseURL.includes("YOUR_");
