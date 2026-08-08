import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../fireabase";

const AuthContext = createContext(null);

// Decode JWT payload without a library
const decodeToken = (token) => {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
};

// Returns ms until token expires, or 0 if already expired / invalid
const msUntilExpiry = (token) => {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return 0;
  return decoded.exp * 1000 - Date.now();
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const logoutTimerRef = useRef(null);

  // ── Logout helper (clears storage + state) ──────────────────────
  const logout = useCallback(async () => {
    clearTimeout(logoutTimerRef.current);
    try { await signOut(auth); } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }, []);

  // ── Schedule auto-logout when token expires ──────────────────────
  const scheduleAutoLogout = useCallback((token) => {
    clearTimeout(logoutTimerRef.current);
    const ms = msUntilExpiry(token);
    if (ms <= 0) {
      // Already expired — log out immediately
      logout();
      return;
    }
    logoutTimerRef.current = setTimeout(() => {
      logout();
      // Small UX hint so the admin knows why they were logged out
      alert("Your session has expired. Please log in again.");
    }, ms);
  }, [logout]);

  // ── On mount: check existing token and schedule auto-logout ─────
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      const ms = msUntilExpiry(token);
      if (ms <= 0) {
        // Token already expired while the tab was closed
        logout();
      } else {
        scheduleAutoLogout(token);
      }
    }
    return () => clearTimeout(logoutTimerRef.current);
  }, [logout, scheduleAutoLogout]);

  // ── Watch this user's own Firestore doc in real time. If an admin locks,
  //    changes the role of, or deletes this account while they're logged
  //    in, log them out immediately instead of waiting up to 8h for the
  //    JWT to expire. Frontend-only — no backend or schema changes needed,
  //    it just reads the same `status`/`roleID` fields that already exist.
  useEffect(() => {
    if (!user?.uid) return;

    let unsubDoc = null;

    // Wait for Firebase Auth to actually confirm the session before
    // subscribing — on a page refresh there's a brief moment where
    // auth.currentUser is still null, and reading Firestore too early
    // would look like a permission-denied (rules check request.auth) and
    // falsely trigger a logout.
    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      if (unsubDoc) { unsubDoc(); unsubDoc = null; }
      if (!fbUser) return;

      unsubDoc = onSnapshot(
        doc(db, "user", user.uid),
        (snap) => {
          if (!snap.exists()) {
            logout();
            alert("Your account no longer exists. Please contact your administrator.");
            return;
          }
          const data = snap.data();
          if (data.status && data.status.toLowerCase() !== "active") {
            logout();
            alert("Your account access has been revoked. Please contact your administrator.");
            return;
          }
          if (data.roleID && user.roleID && data.roleID !== user.roleID) {
            logout();
            alert("Your role has changed. Please log in again.");
          }
        },
        () => {
          // Firestore rules denying reads (e.g. locked account) counts as revoked too.
          logout();
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubDoc) unsubDoc();
    };
  }, [user?.uid, user?.roleID, logout]);

  // ── Login ────────────────────────────────────────────────────────
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
        return {
          success: false,
          message: data.message || "An unexpected error occurred. Please try again.",
        };
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      scheduleAutoLogout(data.token);

      return { success: true, user: data.user };

    } catch (error) {
      const code = error.code;

      if (
        code === "auth/user-not-found" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        return {
          success: false,
          message: "The email address or password you entered is incorrect. Please double-check your credentials and try again.",
        };
      }

      if (code === "auth/too-many-requests") {
        return {
          success: false,
          message: "Too many failed login attempts. Your account has been temporarily locked. Please try again later or reset your password.",
        };
      }

      if (code === "auth/user-disabled") {
        return {
          success: false,
          message: "This account has been disabled. Please contact your system administrator for assistance.",
        };
      }

      if (code === "auth/network-request-failed") {
        return {
          success: false,
          message: "Unable to connect to the server. Please check your internet connection and try again.",
        };
      }

      return {
        success: false,
        message: "An unexpected error occurred. Please try again in a moment.",
      };
    }
  };

  const getToken = () => localStorage.getItem("token");

  return (
    <AuthContext.Provider value={{ user, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}