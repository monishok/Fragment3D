import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { API_ENDPOINTS } from "@/config/api";
import PixelStars from "@/components/PixelStars";
import PixelButton from "@/components/PixelButton";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  const auth = useAuth();
  const nav = useNavigate();

  function validate() {
    const e: Record<string, string> = {};

    if (!username.trim()) e.username = "Username required";

    if (!email.trim()) e.email = "Email required";
    else if (!/^\S+@\S+\.\S+$/.test(email)) e.email = "Enter a valid email";

    if (!password) e.password = "Password required";
    else if (password.length < 8) e.password = "Password must be 8+ chars";

    if (!cPassword) e.cPassword = "Confirm your password";
    else if (password !== cPassword) e.cPassword = "Passwords do not match";

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
      const res = await axios.post(API_ENDPOINTS.register, {
        username,
        email,
        password,
      });

      const { token, user } = res.data;

      // auto-login after register
      auth.login(user, token, true);

      nav("/dashboard");
    } catch (err: any) {
      if (err.response?.data?.error) setServerError(err.response.data.error);
      else setServerError("Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-space-bg flex flex-col items-center justify-center relative overflow-hidden px-4">
      <PixelStars />
      
      <div className="register-card relative z-10">
        <h1 style={{ fontFamily: "'Press Start 2P', monospace" }}>Create account</h1>

        {serverError && <div className="error-text">{serverError}</div>}

        <form onSubmit={submit} noValidate autoComplete="off">
          {/* Username */}
          <label>Username</label>
          <input
            type="text"
            value={username}
            placeholder="your_username"
            className={errors.username ? "input-error" : ""}
            onChange={(e) => {
              setUsername(e.target.value);
              setErrors({ ...errors, username: null });
            }}
          />
          {errors.username && <div className="error-text">{errors.username}</div>}

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

          {/* Confirm Password */}
          <label>Confirm Password</label>
          <input
            type="password"
            value={cPassword}
            placeholder="••••••••"
            className={errors.cPassword ? "input-error" : ""}
            onChange={(e) => {
              setCPassword(e.target.value);
              setErrors({ ...errors, cPassword: null });
            }}
          />
          {errors.cPassword && <div className="error-text">{errors.cPassword}</div>}

          {/* Buttons */}
          <div className="register-actions">
            <PixelButton type="submit" disabled={loading}>
              {loading ? "Creating…" : "Create"}
            </PixelButton>

            <PixelButton
              type="button"
              onClick={() => nav("/login")}
            >
              Login
            </PixelButton>
          </div>
        </form>
      </div>
    </div>
  );
}
