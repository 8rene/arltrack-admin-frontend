import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../fireabase";
import { ROLES } from "../config/pagePermissions";

const AuthContext = createContext(null);

// sessionStorage (not localStorage) on purpose — a "view as" preview should
// survive an accidental page refresh mid-testing, but should NOT survive
// closing the tab or carry over into a fresh login later. That's the right
// lifetime for a temporary look-around tool, not a persistent setting.
const PREVIEW_ROLE_KEY = "previewRole";

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

  // ── "View as" preview role — Admin-only, cosmetic (frontend rendering
  //    only; never touches the JWT or backend authorization). See
  //    setPreviewRole below for the enforcement of who can actually set it.
  const [previewRole, setPreviewRoleState] = useState(() => {
    try {
      return sessionStorage.getItem(PREVIEW_ROLE_KEY) || null;
    } catch {
      return null;
    }
  });

  // Only a real Admin can ever activate a preview — checked here too (not
  // just by hiding the UI in Account.jsx) so this can't be triggered from
  // the console by a non-Admin account. Passing a falsy role clears preview.
  const setPreviewRole = useCallback((role) => {
    if (user?.role !== ROLES.ADMIN) return;

    try {
      if (role) sessionStorage.setItem(PREVIEW_ROLE_KEY, role);
      else sessionStorage.removeItem(PREVIEW_ROLE_KEY);
    } catch {}
    setPreviewRoleState(role || null);
  }, [user]);

  // The role every gating check (Sidebar, ProtectedRoute, dashboard picker)
  // should actually use. Falls back to the real role whenever no preview is
  // active, or the logged-in user isn't Admin (defensive — previewRole
  // should already be null in that case, this just guarantees it).
  const effectiveRole = (user?.role === ROLES.ADMIN && previewRole) ? previewRole : user?.role;

  // ── Logout helper (closes the server-side session log, then clears
  //    storage + state) ──────────────────────────────────────────────
  const logout = useCallback(async () => {
    clearTimeout(logoutTimerRef.current);

    // Close out the userLogs entry (logoutDateTime + sessionDuration) and
    // write the matching audit log entry. Fire-and-forget on purpose — a
    // dead/expired token or a network hiccup here should never block the
    // user from actually logging out.
    const token = localStorage.getItem("token");
    const sessionLogID = localStorage.getItem("sessionLogID");
    if (token) {
      try {
        await fetch(`${process.env.REACT_APP_API_URL}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionLogID }),
        });
      } catch (e) {
        console.error("Failed to close session log:", e);
      }
    }

    try { await signOut(auth); } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("sessionLogID");
    try { sessionStorage.removeItem(PREVIEW_ROLE_KEY); } catch {}
    setPreviewRoleState(null);
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

      let handled = false; // guards against duplicate snapshots firing the same logout twice

      unsubDoc = onSnapshot(
        doc(db, "user", user.uid),
        (snap) => {
          if (handled) return;

          if (!snap.exists()) {
            handled = true;
            if (unsubDoc) { unsubDoc(); unsubDoc = null; }
            logout();
            alert("Your account no longer exists. Please contact your administrator.");
            return;
          }
          const data = snap.data();
          if (data.status && data.status.toLowerCase() !== "active") {
            handled = true;
            if (unsubDoc) { unsubDoc(); unsubDoc = null; }
            logout();
            alert("Your account access has been revoked. Please contact your administrator.");
            return;
          }
          if (data.roleID && user.roleID && data.roleID !== user.roleID) {
            handled = true;
            if (unsubDoc) { unsubDoc(); unsubDoc = null; }
            logout();
            alert("Your role has changed. Please log in again.");
          }
        },
        () => {
          if (handled) return;
          // Firestore rules denying reads (e.g. locked account) counts as revoked too.
          handled = true;
          if (unsubDoc) { unsubDoc(); unsubDoc = null; }
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
      if (data.sessionLogID) {
        localStorage.setItem("sessionLogID", data.sessionLogID);
      }
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
    <AuthContext.Provider value={{ user, login, logout, getToken, previewRole, setPreviewRole, effectiveRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}