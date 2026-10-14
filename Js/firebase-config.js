// =====================================================================
// Abdullah Store — Firebase Configuration
// Project: store-customer-info
// =====================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyDOso9rJpPI3lzAvMQfnb2ZotTv0V393A8",
  authDomain: "store-customer-info.firebaseapp.com",
  databaseURL: "https://store-customer-info-default-rtdb.firebaseio.com",
  projectId: "store-customer-info",
  storageBucket: "store-customer-info.firebasestorage.app",
  messagingSenderId: "692788929919",
  appId: "1:692788929919:web:11015407d47ac01391264a",
  measurementId: "G-Z8V52KHDGR"
};

export const isFirebaseConfigured = () =>
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("YOUR_") &&
  firebaseConfig.databaseURL &&
  !firebaseConfig.databaseURL.includes("YOUR_") &&
  !firebaseConfig.databaseURL.includes("REPLACE_ME");
