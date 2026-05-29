import { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { auth, db } from "../fireabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Step 1: find the user doc in the `user` collection where userID == firebase uid
          const userQuery    = query(collection(db, "user"), where("userID", "==", firebaseUser.uid));
          const userSnapshot = await getDocs(userQuery);

          if (userSnapshot.empty) {
            setUser({ uid: firebaseUser.uid, email: firebaseUser.email, role: null });
            setLoading(false);
            return;
          }

          const userDoc   = userSnapshot.docs[0];
          const userDocID = userDoc.id;          // Firestore doc ID of the user
          const userData  = userDoc.data();

          // Step 2: find the staffUser doc where userID == Firestore user doc ID
          const staffQuery    = query(collection(db, "staffUser"), where("userID", "==", userDocID));
          const staffSnapshot = await getDocs(staffQuery);

          let roleName = null;

          if (!staffSnapshot.empty) {
            const staffData = staffSnapshot.docs[0].data();
            const roleID    = staffData.RoleID ?? staffData.roleID ?? null;

            // Step 3: resolve role name from the roles collection
            if (roleID) {
              const roleSnap = await getDoc(doc(db, "roles", roleID));
              if (roleSnap.exists()) {
                roleName = roleSnap.data().name?.toLowerCase() ?? null;
                // "Admin" → "admin" | "Owner" → "owner" | "Supervisor" → "supervisor"
              }
            }
          }

          setUser({
            uid:      firebaseUser.uid,
            email:    firebaseUser.email,
            role:     roleName,
            ...userData,
          });

        } catch (err) {
          console.error("AuthContext: role resolution failed", err);
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email, role: null });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await userCredential.user.getIdToken();

      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, message: data.message || "An unexpected error occurred. Please try again." };
      }

      localStorage.setItem("token", data.token);
      return { success: true };

    } catch (error) {
      const code = error.code;
      if (["auth/user-not-found", "auth/wrong-password", "auth/invalid-credential"].includes(code)) {
        return { success: false, message: "The email address or password you entered is incorrect. Please double-check your credentials and try again." };
      }
      if (code === "auth/too-many-requests") {
        return { success: false, message: "Too many failed login attempts. Your account has been temporarily locked. Please try again later or reset your password." };
      }
      if (code === "auth/user-disabled") {
        return { success: false, message: "This account has been disabled. Please contact your system administrator for assistance." };
      }
      if (code === "auth/network-request-failed") {
        return { success: false, message: "Unable to connect to the server. Please check your internet connection and try again." };
      }
      return { success: false, message: "An unexpected error occurred. Please try again in a moment." };
    }
  };

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("token");
    setUser(null);
  };

  const getToken = () => localStorage.getItem("token");

  if (loading) return null;

  return (
    <AuthContext.Provider value={{ user, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
