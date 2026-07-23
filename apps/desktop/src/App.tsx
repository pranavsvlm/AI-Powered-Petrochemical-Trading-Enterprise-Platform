import { RouterProvider } from 'react-router-dom';
import { ApiClientProvider } from '@platform/ui';
import { AuthProvider } from './store/AuthContext';
import { desktopApiClient } from './lib/api-client';
import { router } from './router';

export function App() {
  return (
    <ApiClientProvider value={desktopApiClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ApiClientProvider>
  );
}
