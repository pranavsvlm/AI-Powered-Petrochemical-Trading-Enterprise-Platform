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
import { WarehouseListPage, WarehouseCreatePage, InventoryStockPage } from '@modules/inventory/ui';
import {
  SupplierListPage,
  SupplierCreatePage,
  SupplierDetailPage,
  RequisitionListPage,
  RequisitionCreatePage,
  RequisitionDetailPage,
  PurchaseOrderListPage,
  PurchaseOrderCreatePage,
  PurchaseOrderDetailPage,
  GoodsReceiptCreatePage,
} from '@modules/procurement/ui';
import {
  ChartOfAccountsPage,
  InvoiceListPage,
  InvoiceDetailPage,
  SupplierBillListPage,
  ReportsPage,
} from '@modules/accounting/ui';
import {
  AiChatPage,
  AiExecutionListPage,
  AiExecutionDetailPage,
  AiProviderSettingsPage,
} from '@modules/ai/ui';
import {
  TaskListPage,
  TaskDetailPage,
  TaskCreatePage,
  ProjectListPage,
  ProjectDetailPage,
  ProjectCreatePage,
} from '@modules/tasks/ui';
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
      { path: 'warehouses', element: <WarehouseListPage /> },
      { path: 'warehouses/new', element: <WarehouseCreatePage /> },
      { path: 'stock', element: <InventoryStockPage /> },
      { path: 'suppliers', element: <SupplierListPage /> },
      { path: 'suppliers/new', element: <SupplierCreatePage /> },
      { path: 'suppliers/:id', element: <SupplierDetailPage /> },
      { path: 'requisitions', element: <RequisitionListPage /> },
      { path: 'requisitions/new', element: <RequisitionCreatePage /> },
      { path: 'requisitions/:id', element: <RequisitionDetailPage /> },
      { path: 'purchase-orders', element: <PurchaseOrderListPage /> },
      { path: 'purchase-orders/new', element: <PurchaseOrderCreatePage /> },
      { path: 'purchase-orders/:id', element: <PurchaseOrderDetailPage /> },
      { path: 'goods-receipts/new', element: <GoodsReceiptCreatePage /> },
      { path: 'chart-of-accounts', element: <ChartOfAccountsPage /> },
      { path: 'invoices', element: <InvoiceListPage /> },
      { path: 'invoices/:id', element: <InvoiceDetailPage /> },
      { path: 'supplier-bills', element: <SupplierBillListPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'ai', element: <AiChatPage /> },
      { path: 'ai/executions', element: <AiExecutionListPage /> },
      { path: 'ai/executions/:id', element: <AiExecutionDetailPage /> },
      { path: 'ai/providers', element: <AiProviderSettingsPage /> },
      { path: 'tasks', element: <TaskListPage /> },
      { path: 'tasks/new', element: <TaskCreatePage /> },
      { path: 'tasks/:id', element: <TaskDetailPage /> },
      { path: 'projects', element: <ProjectListPage /> },
      { path: 'projects/new', element: <ProjectCreatePage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
    ],
  },
]);
