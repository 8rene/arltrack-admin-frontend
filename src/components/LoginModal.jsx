import React, { useState, useRef, useEffect } from "react";
import "../styles/loginModal.css";

const LoginModal = ({ onLogin, onClose, onSwitchToSignUp }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      setRemember(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (remember) {
      localStorage.setItem("rememberEmail", email);
    } else {
      localStorage.removeItem("rememberEmail");
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Invalid credentials");
        return;
      }

      setError("");

      // STORE AUTH DATA
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      // DIRECT LOGIN
      onLogin(data.user);

    } catch (err) {
      console.error(err);
      setError("Server error. Try again.");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>

        <h2>Login</h2>

        <form onSubmit={handleSubmit}>

          <label>Email</label>
          <input
            ref={emailRef}
            type="email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />

          <label>Password</label>
          <input
            ref={passwordRef}
            type="password"
            value={password}
            required
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <p className="error-text">{error}</p>}

          <label>
            <input
              type="checkbox"
              checked={remember}
              onChange={() => setRemember(!remember)}
            />
            Remember me
          </label>

          <button type="submit">Login</button>

        </form>

      </div>
    </div>
  );
};

export default LoginModal;
