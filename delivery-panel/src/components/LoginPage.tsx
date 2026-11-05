import { Input, Label } from "./ui/FormControls";
import { Button } from "./ui/Button";
import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LoaderCircle,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../auth";

export function LoginPage() {
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(phone.trim(), password);
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : "ورود ناموفق بود.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page min-h-screen grid grid-cols-[1.05fr_.95fr] [background:#fff] [@media(max-width:980px)]:grid-cols-[1fr]">
      <section className="login-visual relative overflow-hidden min-h-screen p-[46px_54px] text-[#fff] [background:linear-gradient(145deg,_#0c1733_0%,_#102753_55%,_#0d4b63_100%)] [@media(max-width:980px)]:hidden">
        <div className="visual-grid absolute inset-[0] opacity-[.14] [background-image:linear-gradient(rgba(255,255,255,.12)_1px,_transparent_1px),_linear-gradient(90deg,_rgba(255,255,255,.12)_1px,_transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom_left,_#000,_transparent_85%)]" />
        <div className="brand-mark relative flex items-center gap-[10px] text-[22px] font-extrabold [&_svg]:text-[#49d6ad]">
          <MapPin size={29} />
          <span>راه‌نگار</span>
        </div>
        <div className="visual-copy relative max-w-[560px] mt-[19vh] z-[2] [&_h1]:m-[24px_0_16px] [&_h1]:max-w-[520px] [&_h1]:text-[clamp(38px,_4.2vw,_66px)] [&_h1]:leading-[1.35] [&_h1]:tracking-normal [&_h1]:[word-spacing:0.08em] [&_p]:m-0 [&_p]:max-w-[500px] [&_p]:text-[#b8c9df] [&_p]:text-[16px] [&_p]:leading-[2]">
          <span className="pill inline-flex items-center gap-[9px] p-[8px_13px] [border:1px_solid_rgba(255,255,255,.18)] rounded-[99px] text-[#d7e3f4] [background:rgba(255,255,255,.07)] text-[12px]">
            <span className="live-dot w-[8px] h-[8px] rounded-[50%] [background:#45dfa9] [box-shadow:0_0_0_5px_rgba(69,223,169,.12)]" />{" "}
            پایش زنده ناوگان
          </span>
          <h1>هر پیک، دقیقاً همان‌جایی که باید باشد.</h1>
          <p>
            مدیریت یکپارچه موقعیت، وضعیت و دسترسی پیک‌ها در یک نمای ساده و سریع.
          </p>
        </div>
        <div
          className="route-art absolute [direction:ltr] left-[8%] right-[8%] bottom-[8%] h-[190px] opacity-[.9]"
          aria-hidden="true"
        >
          <span className="route-point absolute w-[16px] h-[16px] [border:4px_solid_#102753] rounded-[50%] [background:#54dfb6] [box-shadow:0_0_0_7px_rgba(84,223,182,.14)] z-[2] point-a left-[13%] top-[65%]" />
          <span className="route-point absolute w-[16px] h-[16px] [border:4px_solid_#102753] rounded-[50%] [background:#54dfb6] [box-shadow:0_0_0_7px_rgba(84,223,182,.14)] z-[2] point-b left-[52%] top-[46%]" />
          <span className="route-point absolute w-[16px] h-[16px] [border:4px_solid_#102753] rounded-[50%] [background:#54dfb6] [box-shadow:0_0_0_7px_rgba(84,223,182,.14)] z-[2] point-c right-[9%] top-[25%]" />
          <span className="route-line absolute left-[15%] right-[11%] top-[52%] h-[3px] [border-top:3px_dashed_rgba(97,225,188,.5)] [transform:rotate(-8deg)]" />
        </div>
      </section>

      <section className="login-form-side flex items-center justify-center p-[42px] [@media(max-width:980px)]:min-h-screen [@media(max-width:640px)]:[&&]:p-[26px]">
        <form
          className="login-card w-[min(100%,_420px)] [&_h2]:m-[20px_0_8px] [&_h2]:text-[#111827] [&_h2]:text-[30px] [&_>_input]:mb-[20px] [&_small]:block [&_small]:mt-[20px] [&_small]:text-[#98a1b1] [&_small]:text-center"
          onSubmit={submit}
        >
          <div className="mobile-brand relative hidden items-center gap-[10px] text-[22px] font-extrabold text-[#102753] mb-[45px] [&_svg]:text-[#0d9488] [@media(max-width:980px)]:flex">
            <MapPin size={24} />
            <b>راه‌نگار</b>
          </div>
          <div className="login-icon w-[48px] h-[48px] grid place-items-center rounded-[14px] text-[#0f766e] [background:#e6f8f4]">
            <ShieldCheck size={25} />
          </div>
          <h2>ورود مدیر</h2>
          <p className="muted m-[0_0_33px] text-[#758096] text-[14px] leading-[1.8]">
            برای دسترسی به مرکز کنترل وارد حساب مدیریت شوید.
          </p>
          <Label>شماره موبایل</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="username"
            placeholder="0912 000 0000"
            required
          />
          <Label>رمز عبور</Label>
          <div className="password-field mb-[20px] relative [&_input]:pl-[48px] [&_.icon-button]:absolute [&_.icon-button]:left-[7px] [&_.icon-button]:top-[7px]">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="رمز عبور"
              required
            />
            <Button
              type="button"
              variant="icon"
              onClick={() => setShowPassword(!showPassword)}
              aria-label="نمایش رمز"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </Button>
          </div>
          {error && (
            <div className="form-error text-[#b42318] [background:#fff1f0] [border:1px_solid_#ffd4d0] rounded-[10px] p-[11px_13px] m-[2px_0_12px] text-[13px]">
              {error}
            </div>
          )}
          <Button
            variant="primary"
            className="login-submit w-full mt-[8px]"
            disabled={loading}
          >
            {loading ? (
              <LoaderCircle className="spin animate-spin" size={20} />
            ) : (
              <>
                <span>ورود به پنل</span>
                <ArrowLeft size={19} />
              </>
            )}
          </Button>
          <small>
            ورود به این سامانه فقط برای کاربران مجاز امکان‌پذیر است.
          </small>
        </form>
      </section>
    </main>
  );
}
