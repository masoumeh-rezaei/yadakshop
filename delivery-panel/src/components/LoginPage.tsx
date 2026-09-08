import { FormEvent, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, LoaderCircle, MapPin, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth';

export function LoginPage() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(phone.trim(), password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'ورود ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="visual-grid" />
        <div className="brand-mark"><MapPin size={29} /><span>راه‌نگار</span></div>
        <div className="visual-copy">
          <span className="pill"><span className="live-dot" /> پایش زنده ناوگان</span>
          <h1>هر پیک، دقیقاً همان‌جایی که باید باشد.</h1>
          <p>مدیریت یکپارچه موقعیت، وضعیت و دسترسی پیک‌ها در یک نمای ساده و سریع.</p>
        </div>
        <div className="route-art" aria-hidden="true">
          <span className="route-point point-a" /><span className="route-point point-b" />
          <span className="route-point point-c" /><span className="route-line" />
        </div>
      </section>

      <section className="login-form-side">
        <form className="login-card" onSubmit={submit}>
          <div className="mobile-brand"><MapPin size={24} /><b>راه‌نگار</b></div>
          <div className="login-icon"><ShieldCheck size={25} /></div>
          <h2>ورود مدیر</h2>
          <p className="muted">برای دسترسی به مرکز کنترل وارد حساب مدیریت شوید.</p>
          <label>شماره موبایل</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel"
            autoComplete="username" placeholder="0912 000 0000" required />
          <label>رمز عبور</label>
          <div className="password-field">
            <input value={password} onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="رمز عبور" required />
            <button type="button" className="icon-button" onClick={() => setShowPassword(!showPassword)} aria-label="نمایش رمز">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button login-submit" disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={20} /> : <><span>ورود به پنل</span><ArrowLeft size={19} /></>}
          </button>
          <small>ورود به این سامانه فقط برای کاربران مجاز امکان‌پذیر است.</small>
        </form>
      </section>
    </main>
  );
}
