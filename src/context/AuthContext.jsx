import { createContext, useContext, useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../fireabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

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

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
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
