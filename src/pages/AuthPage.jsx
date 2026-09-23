import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// ─────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────

const EyeIcon = ({ open }) =>
    open ? (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            id="eyeOpenIcon"
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
        </svg>
    ) : (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            id="eyeClosedIcon"
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3l18 18"
            />
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.58 10.58a2 2 0 002.83 2.83"
            />
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.88 5.09A9.96 9.96 0 0112 5c4.48 0 8.27 2.94 9.54 7a10.11 10.11 0 01-4.13 5.09M6.23 6.23A10.1 10.1 0 002.46 12a10.08 10.08 0 003.09 4.36"
            />
        </svg>
    );

// ─────────────────────────────────────────────────────────────
// Shared Input
// ─────────────────────────────────────────────────────────────

function Field({
    id,
    label,
    type = "text",
    value,
    onChange,
    placeholder,
    right,
}) {
    return (
        <div id={`${id}Wrapper`} className="space-y-2">
            <label
                id={`${id}Label`}
                htmlFor={id}
                className="text-sm font-semibold text-gray-600"
            >
                {label}
            </label>

            <div id={`${id}Container`} className="relative">
                <input
                    id={id}
                    type={type}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    className="w-full h-12 rounded-2xl border border-gray-200 bg-white px-4 pr-12 text-sm shadow-soft focus:border-arl-primary focus:ring-4 focus:ring-arl-primary/10 outline-none transition-all"
                />

                {right && (
                    <div
                        id={`${id}Right`}
                        className="absolute right-4 top-1/2 -translate-y-1/2"
                    >
                        {right}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Login Form ONLY
// ─────────────────────────────────────────────────────────────

function LoginForm({ onForgotPassword }) {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!email || !password) {
            setError("Please complete all required fields before proceeding.");
            return;
        }

        setError("");
        setLoading(true);

        const result = await login(email, password);

        if (result.success) {
            navigate("/dashboard");
        } else {
            setError(result.message);
            setLoading(false);
        }
    };

    return (
        <form id="loginForm" onSubmit={handleSubmit} className="space-y-5">
            <Field
                id="loginEmail"
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@arlcarrental.com"
            />

            <Field
                id="loginPassword"
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                right={
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-gray-400 hover:text-arl-primary"
                    >
                        <EyeIcon open={showPassword} />
                    </button>
                }
            />

            <div className="flex justify-end -mt-2">
                <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-sm font-semibold text-arl-primary hover:underline"
                >
                    Forgot password?
                </button>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                </div>
            )}

            <button
                id="loginSubmitBtn"
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-2xl bg-arl-primary text-white font-semibold shadow-card disabled:opacity-60"
            >
                {loading ? "Logging In..." : "Log In"}
            </button>
        </form>
    );
}

// ─────────────────────────────────────────────────────────────
// Forgot Password Form — counterpart to customer-backend's forgot-password
// flow, but hitting the admin backend's staff-only endpoints
// (/api/auth/forgot-password/send-otp, /api/auth/forgot-password/reset)
// instead of the customer one, which explicitly blocks staff accounts.
// Same 3-step shape (email → code + new password → success) as the
// customer app's ForgotPasswordModal, just styled to match this page.
// ─────────────────────────────────────────────────────────────

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?]).{8,16}$/;

function ForgotPasswordForm({ onBackToLogin }) {
    const [step, setStep] = useState(1); // 1: email, 2: code + new password, 3: success
    const [email, setEmail] = useState("");
    const [digits, setDigits] = useState(["", "", "", "", "", ""]);
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [timer, setTimer] = useState(0);
    const inputsRef = useRef([]);

    // Countdown for "Resend code in Ns"
    useEffect(() => {
        if (timer === 0) return;
        const id = setInterval(() => setTimer((t) => Math.max(0, t - 1)), 1000);
        return () => clearInterval(id);
    }, [timer]);

    const sendCode = async () => {
        setError("");
        setLoading(true);
        try {
            const res = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/forgot-password/send-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim().toLowerCase() }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || "Could not send code.");
            if (data.emailSent === false) throw new Error(data.message || "Could not send the email. Please try again.");
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const handleSendCode = async (e) => {
        e.preventDefault();
        const ok = await sendCode();
        if (ok) {
            setStep(2);
            setTimer(60);
        }
    };

    const handleResend = async () => {
        if (timer > 0) return;
        const ok = await sendCode();
        if (ok) {
            setDigits(["", "", "", "", "", ""]);
            setTimer(60);
        }
    };

    const handleDigit = (val, idx) => {
        if (!/^[0-9]?$/.test(val)) return;
        const next = [...digits];
        next[idx] = val;
        setDigits(next);
        setError("");
        if (val && idx < 5) inputsRef.current[idx + 1]?.focus();
    };
    const handleKeyDown = (e, idx) => {
        if (e.key === "Backspace" && !digits[idx] && idx > 0) inputsRef.current[idx - 1]?.focus();
    };
    const handlePaste = (e) => {
        const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (p.length === 6) {
            setDigits(p.split(""));
            inputsRef.current[5]?.focus();
        }
    };

    const handleReset = async (e) => {
        e.preventDefault();
        setError("");

        const otp = digits.join("");
        if (otp.length < 6) { setError("Please enter all 6 digits."); return; }
        if (!PASSWORD_REGEX.test(newPw)) {
            setError("Password must be 8–16 characters with at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.");
            return;
        }
        if (newPw !== confirmPw) { setError("Passwords do not match."); return; }

        setLoading(true);
        try {
            const res = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/forgot-password/reset`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim().toLowerCase(), otp, newPassword: newPw }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setDigits(["", "", "", "", "", ""]);
                throw new Error(data.message || "Could not reset password.");
            }
            setStep(3);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (step === 3) {
        return (
            <div className="space-y-5">
                <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    ✓ Your password has been changed successfully. You can now log in with your new password.
                </div>
                <button
                    type="button"
                    onClick={onBackToLogin}
                    className="w-full h-12 rounded-2xl bg-arl-primary text-white font-semibold shadow-card"
                >
                    Back to Login
                </button>
            </div>
        );
    }

    if (step === 2) {
        return (
            <form onSubmit={handleReset} className="space-y-5">
                <p className="text-sm text-gray-500">
                    We sent a 6-digit code to <strong className="text-gray-700">{email}</strong>
                </p>

                <div className="flex gap-2 justify-center" onPaste={handlePaste}>
                    {digits.map((d, idx) => (
                        <input
                            key={idx}
                            type="text"
                            inputMode="numeric"
                            maxLength="1"
                            value={d}
                            ref={(el) => (inputsRef.current[idx] = el)}
                            onChange={(e) => handleDigit(e.target.value, idx)}
                            onKeyDown={(e) => handleKeyDown(e, idx)}
                            autoComplete="off"
                            className="w-11 h-13 text-center text-lg font-bold rounded-xl border border-gray-200 bg-white shadow-soft focus:border-arl-primary focus:ring-4 focus:ring-arl-primary/10 outline-none"
                        />
                    ))}
                </div>

                <Field
                    id="newPassword"
                    label="New Password"
                    type={showPw ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="Min 8 chars, uppercase, number, symbol"
                    right={
                        <button type="button" onClick={() => setShowPw(!showPw)} className="text-gray-400 hover:text-arl-primary">
                            <EyeIcon open={showPw} />
                        </button>
                    }
                />
                <Field
                    id="confirmPassword"
                    label="Confirm New Password"
                    type={showPw ? "text" : "password"}
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="Re-enter your new password"
                />

                {error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-2xl bg-arl-primary text-white font-semibold shadow-card disabled:opacity-60"
                >
                    {loading ? "Resetting..." : "Reset Password"}
                </button>

                <p className="text-center text-sm text-gray-500">
                    {timer > 0 ? (
                        <span>Resend code in {timer}s</span>
                    ) : (
                        <>
                            Didn't get a code?{" "}
                            <button type="button" onClick={handleResend} className="font-semibold text-arl-primary hover:underline">
                                Resend
                            </button>
                        </>
                    )}
                </p>
            </form>
        );
    }

    // step === 1
    return (
        <form onSubmit={handleSendCode} className="space-y-5">
            <p className="text-sm text-gray-500">Enter your staff account email — we'll send you a 6-digit code.</p>

            <Field
                id="forgotEmail"
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@arlcarrental.com"
            />

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-2xl bg-arl-primary text-white font-semibold shadow-card disabled:opacity-60"
            >
                {loading ? "Sending..." : "Send Code"}
            </button>

            <button
                type="button"
                onClick={onBackToLogin}
                className="w-full text-center text-sm font-semibold text-arl-primary hover:underline"
            >
                Back to Login
            </button>
        </form>
    );
}

// ─────────────────────────────────────────────────────────────
// Main Page (LOGIN + FORGOT PASSWORD)
// ─────────────────────────────────────────────────────────────

export default function AuthPage() {
    const [view, setView] = useState("login"); // "login" | "forgot"

    return (
        <div
            id="authPage"
            className="min-h-screen bg-arl-light grid lg:grid-cols-2"
        >
            {/* LEFT */}
            <section
                id="formSection"
                className="flex items-center justify-center"
            >
                <div
                    id="formCard"
                    className="w-full h-full flex flex-col justify-center bg-white p-8 md:p-10"
                >
                    <div id="brandHeader" className="mb-8">
                        <p className="text-sm font-semibold text-arl-primary uppercase tracking-widest">
                            ARL Car Rental
                        </p>

                        <h1 className="mt-2 text-3xl font-bold text-arl-dark">
                            {view === "login" ? "Welcome Back" : "Reset Password"}
                        </h1>
                    </div>

                    {view === "login" ? (
                        <LoginForm onForgotPassword={() => setView("forgot")} />
                    ) : (
                        <ForgotPasswordForm onBackToLogin={() => setView("login")} />
                    )}
                </div>
            </section>

            {/* RIGHT */}
            <section
                id="heroSection"
                className="hidden lg:flex relative overflow-hidden bg-black"
            >
                <img
                    id="heroImage"
                    src="https://images.pexels.com/photos/33263410/pexels-photo-33263410.jpeg"
                    alt="Car"
                    className="absolute inset-0 w-full h-full object-cover"
                />
                <div id="heroOverlay" className="absolute bg-hero-overlay" />
            </section>
            
        </div>
    );
}