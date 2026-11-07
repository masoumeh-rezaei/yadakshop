import { LoaderCircle } from 'lucide-react';
import { useAuth } from './auth';
import { Dashboard } from './components/Dashboard';
import { LoginPage } from './components/LoginPage';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className=" app-loader min-h-screen flex items-center justify-center gap-[12px] text-[#64748b] "><LoaderCircle className="spin animate-spin" size={34} /></div>;
  return user ? <Dashboard /> : <LoginPage />;
}
