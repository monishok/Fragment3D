import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { API_ENDPOINTS } from "@/config/api";
import PixelStars from "@/components/PixelStars";
import PixelButton from "@/components/PixelButton";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  const auth = useAuth();
  const nav = useNavigate();

  function validate() {
    const e: Record<string, string> = {};
    if (!email.trim()) e.email = "Email is required";
    else if (!/^\S+@\S+\.\S+$/.test(email)) e.email = "Enter a valid email";

    if (!password) e.password = "Password is required";
    else if (password.length < 8) e.password = "Password must be 8+ chars";

    return e;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");

    const v = validate();
    if (Object.keys(v).length) {
      setErrors(v);
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post(API_ENDPOINTS.login, {
        email,
        password,
      });

      const { token, user } = res.data;
      if (!token) throw new Error("No token returned");

      auth.login(user, token, remember);
      nav("/dashboard");
    } catch (err: any) {
      if (err.response?.data?.error) setServerError(err.response.data.error);
      else setServerError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-space-bg flex flex-col items-center justify-center relative overflow-hidden px-4">
      <PixelStars />
      
      <div className="login-card relative z-10">
        <h1 style={{ fontFamily: "'Press Start 2P', monospace" }}>Sign in</h1>

        {serverError && <div className="error-text">{serverError}</div>}

        <form onSubmit={submit} noValidate autoComplete="on">
          {/* Email */}
          <label>Email</label>
          <input
            type="text"
            value={email}
            placeholder="you@example.com"
            className={errors.email ? "input-error" : ""}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors({ ...errors, email: null });
            }}
          />
          {errors.email && <div className="error-text">{errors.email}</div>}

          {/* Password */}
          <label>Password</label>
          <input
            type="password"
            value={password}
            placeholder="••••••••"
            className={errors.password ? "input-error" : ""}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors({ ...errors, password: null });
            }}
          />
          {errors.password && <div className="error-text">{errors.password}</div>}

          {/* Remember me */}
          <div className="checkbox-row">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 accent-[hsl(var(--accent-primary))]"
              />
              <span>Remember me</span>
            </label>
          </div>

          {/* Buttons */}
          <div className="login-actions">
            <PixelButton type="submit" disabled={loading}>
              {loading ? "Signing…" : "Sign in"}
            </PixelButton>

            <PixelButton
              type="button"
              onClick={() => nav("/register")}
            >
              Register
            </PixelButton>
          </div>
        </form>
      </div>
    </div>
  );
}
