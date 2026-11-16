import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "/api";

function AuthModal({ onClose, onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/auth/${mode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            mode === "login"
              ? { email, password }
              : { name, email, password }
          ),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Authentication failed");
      }

      localStorage.setItem("morrow-token", result.token);
      localStorage.setItem("morrow-user", JSON.stringify(result.user));

      onLogin(result.user);
      onClose();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-backdrop" onClick={onClose}>
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "login" ? "Login" : "Register"}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="auth-close"
          type="button"
          onClick={onClose}
        >
          ×
        </button>

        <p className="eyebrow">WELCOME TO MORROW</p>

        <h2>{mode === "login" ? "Welcome back." : "Create an account."}</h2>

        <p className="auth-description">
          {mode === "login"
            ? "Sign in to continue your shopping journey."
            : "Join us and discover your everyday favourites."}
        </p>

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <label>
              Full name
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
              />
            </label>
          )}

          <label>
            Email address
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <p className="auth-switch">
          {mode === "login"
            ? "New to Morrow?"
            : "Already have an account?"}

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}

export default AuthModal;