import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../fireabase";

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
