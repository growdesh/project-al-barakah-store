import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { useApp } from "../context/AppContext";
import { normalizePhone } from "../lib/format";

function syncFieldAria(el: HTMLInputElement | null) {
  if (!el) return;
  let invalid = false;
  try {
    invalid = el.matches(":user-invalid");
  } catch {
    invalid = !el.validity.valid;
  }
  el.setAttribute("aria-invalid", invalid ? "true" : "false");
  const errorId = el.dataset.error;
  if (errorId) {
    if (invalid) {
      el.setAttribute("aria-describedby", errorId);
    } else {
      el.removeAttribute("aria-describedby");
    }
  }
}

export function LoginScreen() {
  const { login } = useApp();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || !password) {
      syncFieldAria(phoneInputRef.current);
      syncFieldAria(passwordInputRef.current);
      setError("মোবাইল নম্বর এবং পাসওয়ার্ড দিন");
      return;
    }

    setSubmitting(true);
    try {
      await login(cleanPhone, password);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dm-login-page">
      <main className="dm-login-card">
        <div className="dm-login-brand">
          <img
            src="/logo.svg"
            alt="আল-বারাকাহ স্টোর"
            width={60}
            height={60}
          />
          <h1>আল-বারাকাহ স্টোর</h1>
          <p>পাইকারি ব্যবসা ব্যবস্থাপনা সফটওয়্যার</p>
        </div>

        {error && (
          <div className="dm-alert-error" role="alert">
            <AlertCircle
              size={18}
              aria-hidden="true"
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="dm-form-grid">
          <div className="dm-field">
            <label htmlFor="login-phone">মোবাইল নম্বর</label>
            <input
              ref={phoneInputRef}
              id="login-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="username"
              spellCheck={false}
              enterKeyHint="next"
              required
              placeholder="018XXXXXXXX"
              value={phone}
              aria-invalid="false"
              data-error="login-phone-error"
              onChange={(e) => {
                setPhone(e.target.value);
                if (e.currentTarget.getAttribute("aria-invalid") === "true") {
                  syncFieldAria(e.currentTarget);
                }
              }}
              onBlur={(e) => syncFieldAria(e.currentTarget)}
              onInvalid={(e) => syncFieldAria(e.currentTarget)}
              className="dm-input"
            />
            <span id="login-phone-error" className="dm-field-error">
              সঠিক মোবাইল নম্বর লিখুন
            </span>
          </div>

          <div className="dm-field">
            <label htmlFor="login-password">পাসওয়ার্ড</label>
            <div className="dm-password-wrap">
              <input
                ref={passwordInputRef}
                id="login-password"
                name="password"
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                enterKeyHint="done"
                required
                placeholder="পাসওয়ার্ড লিখুন"
                value={password}
                aria-invalid="false"
                data-error="login-password-error"
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (e.currentTarget.getAttribute("aria-invalid") === "true") {
                    syncFieldAria(e.currentTarget);
                  }
                }}
                onBlur={(e) => syncFieldAria(e.currentTarget)}
                onInvalid={(e) => syncFieldAria(e.currentTarget)}
                className="dm-input"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"}
                aria-pressed={showPwd}
                className="dm-password-toggle"
              >
                {showPwd ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </div>
            <span id="login-password-error" className="dm-field-error">
              পাসওয়ার্ড লিখুন
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="dm-btn dm-btn-primary dm-btn-full"
          >
            {submitting ? "লগইন হচ্ছে..." : "লগইন করুন"}
          </button>
        </form>
      </main>
    </div>
  );
}
