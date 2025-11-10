import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBrCg0u-5E25Pyi5BPslhGkut_al-ChyUU",
  authDomain: "daily-attendance-68b2d.firebaseapp.com",
  projectId: "daily-attendance-68b2d",
  storageBucket: "daily-attendance-68b2d.appspot.com",
  messagingSenderId: "472930552273",
  appId: "1:472930552273:web:b33ceff1cc517bfe4e38f0",
  measurementId: "G-23R9Q3HPNW",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Services
const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };


