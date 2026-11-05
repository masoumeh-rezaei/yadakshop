import { Input, Select, Label } from "./ui/FormControls";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { FormEvent, useState } from "react";
import { LoaderCircle, UserPlus } from "lucide-react";
import { api } from "../api";
import type { User, UserRole } from "../types";

interface Props {
  token: string;
  onClose: () => void;
  onCreated: (user: User) => void;
}

export function AddUserModal({ token, onClose, onCreated }: Props) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("DRIVER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const user = await api.createUser(token, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        password,
        role,
      });
      onCreated(user);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "ساخت کاربر ناموفق بود.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="افزودن کاربر  جدید"
      description="اطلاعات حساب را وارد کنید."
      icon={<UserPlus size={20} />}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <Label>نام و نام خانوادگی</Label>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="مثلاً علی رضایی"
          required
        />
        <Label>شماره موبایل</Label>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="09123456789"
          required
        />
        <Label>رمز عبور</Label>
        <Input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          minLength={8}
          placeholder="حداقل ۸ کاراکتر"
          required
        />
        <Label>نقش کاربر</Label>
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
        >
          <option value="DRIVER">پیک</option>
          <option value="ADMIN">مدیر</option>
        </Select>
        {error && (
          <div className="form-error text-[#b42318] [background:#fff1f0] [border:1px_solid_#ffd4d0] rounded-[10px] p-[11px_13px] m-[2px_0_12px] text-[13px]">
            {error}
          </div>
        )}
        <footer>
          <Button type="button" variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button variant="primary" disabled={loading}>
            {loading ? (
              <LoaderCircle className="spin animate-spin" size={19} />
            ) : (
              "ساخت حساب"
            )}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
