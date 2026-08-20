export const dynamic = 'force-dynamic';

import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout';
import { getAdminMetaAction, getAuthenticatedUser } from '@/features/dashboard/actions';

export default async function ListLayout({ children }: { children: React.ReactNode }) {
  // Fetch adminMeta and user data server-side to avoid loading states
  const [adminMetaResponse, userResponse] = await Promise.all([
    getAdminMetaAction(),
    getAuthenticatedUser()
  ]);
  
  const adminMeta = adminMetaResponse.success ? adminMetaResponse.data : null;
  const authenticatedItem = userResponse.success ? userResponse.data?.authenticatedItem : null;
  const capabilities = userResponse.success ? userResponse.data?.hotelOperatorCapabilities : null;
  const user = authenticatedItem
    ? { ...authenticatedItem, role: { ...(authenticatedItem.role || {}), ...(capabilities || {}) } }
    : null;

  return (
    <DashboardLayout adminMeta={adminMeta} authenticatedItem={user}>
      {children}
    </DashboardLayout>
  );
}