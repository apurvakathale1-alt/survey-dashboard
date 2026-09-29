import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, push, set, update } from 'firebase/database';

// Sanchita's Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCGTuKKVzQzVMaxuvsuroqCwWTuvQgY9BY",
  authDomain: "sanchita-712.firebaseapp.com",
  databaseURL: "https://sanchita-712-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sanchita-712",
  storageBucket: "sanchita-712.firebasestorage.app",
  messagingSenderId: "198429004055",
  appId: "1:198429004055:web:e9bb99fb086dd39da3e752",
  measurementId: "G-6039QVJX26"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Export everything needed
export { database, ref, onValue, push, set, update };