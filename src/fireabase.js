import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDXSIR_zZh6LolqoW7tkERyXMglGCPGHdg",
  authDomain: "arltrack-carrentalservices.firebaseapp.com",
  databaseURL: "https://arltrack-carrentalservices-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "arltrack-carrentalservices",
  storageBucket: "arltrack-carrentalservices.firebasestorage.app",
  messagingSenderId: "803760784395",
  appId: "1:803760784395:web:1f428b6bb2b51e2721b30e",
  measurementId: "G-734NW26NDD"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);