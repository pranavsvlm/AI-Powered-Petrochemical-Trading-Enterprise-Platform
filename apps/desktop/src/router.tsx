import { createHashRouter, Navigate } from 'react-router-dom';
import { CustomerListPage, CustomerDetailPage, CustomerCreatePage } from '@modules/customers/ui';
import { ProductCatalogPage, ProductDetailPage, ProductCreatePage } from '@modules/products/ui';
import {
  RfqListPage,
  RfqDetailPage,
  RfqCreatePage,
  QuotationListPage,
  QuotationDetailPage,
} from '@modules/quotations/ui';
import { OrderListPage, OrderCreatePage, OrderDetailPage } from '@modules/orders/ui';
import { Layout } from './Layout';
import { LoginPage } from './pages/LoginPage';
import { RequireAuth } from './RequireAuth';

export const router: ReturnType<typeof createHashRouter> = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/customers" replace /> },
      { path: 'customers', element: <CustomerListPage /> },
      { path: 'customers/new', element: <CustomerCreatePage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'products', element: <ProductCatalogPage /> },
      { path: 'products/new', element: <ProductCreatePage /> },
      { path: 'products/:id', element: <ProductDetailPage /> },
      { path: 'rfqs', element: <RfqListPage /> },
      { path: 'rfqs/new', element: <RfqCreatePage /> },
      { path: 'rfqs/:id', element: <RfqDetailPage /> },
      { path: 'quotations', element: <QuotationListPage /> },
      { path: 'quotations/:id', element: <QuotationDetailPage /> },
      { path: 'orders', element: <OrderListPage /> },
      { path: 'orders/new', element: <OrderCreatePage /> },
      { path: 'orders/:id', element: <OrderDetailPage /> },
    ],
  },
]);
