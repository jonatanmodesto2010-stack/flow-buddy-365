import { Building2, LayoutDashboard, ArrowLeft, Package, CreditCard, Receipt } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export const AdminSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
    { icon: Building2, label: 'Organizações', path: '/admin/organizations' },
    { icon: Package, label: 'Planos', path: '/admin/plans' },
    { icon: CreditCard, label: 'Assinaturas', path: '/admin/subscriptions' },
    { icon: Receipt, label: 'Faturas', path: '/admin/invoices' },
  ];

  return (
    <aside className="w-[260px] bg-card border-r border-border h-screen flex flex-col sticky top-0">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-bold text-foreground">Super Admin</h2>
        <p className="text-xs text-muted-foreground">Painel de Gestão Global</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
              location.pathname === item.path
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-border">
        <button
          onClick={() => navigate('/clients')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Voltar ao Painel</span>
        </button>
      </div>
    </aside>
  );
};
