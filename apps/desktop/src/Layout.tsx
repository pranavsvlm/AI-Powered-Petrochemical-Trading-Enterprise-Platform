import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './store/AuthContext';

const NAV_ITEMS = [
  { to: '/customers', label: 'Customers' },
  { to: '/products', label: 'Products' },
  { to: '/rfqs', label: 'RFQs' },
  { to: '/quotations', label: 'Quotations' },
  { to: '/orders', label: 'Orders' },
  { to: '/warehouses', label: 'Warehouses' },
  { to: '/stock', label: 'Stock' },
  { to: '/suppliers', label: 'Suppliers' },
  { to: '/requisitions', label: 'Requisitions' },
  { to: '/purchase-orders', label: 'Purchase Orders' },
  { to: '/chart-of-accounts', label: 'Chart of Accounts' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/supplier-bills', label: 'Supplier Bills' },
  { to: '/reports', label: 'Reports' },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <h1>NavOasis</h1>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {item.label}
          </NavLink>
        ))}
        <button className="secondary" onClick={logout} title={user?.email}>
          Sign out
        </button>
      </nav>
      <div className="app-content">
        <Outlet />
      </div>
    </div>
  );
}
