import { useState } from "react";
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

function LoginForm() {
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
// Main Page (LOGIN ONLY)
// ─────────────────────────────────────────────────────────────

export default function AuthPage() {
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
                            Welcome Back
                        </h1>
                    </div>

                    <LoginForm />
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
