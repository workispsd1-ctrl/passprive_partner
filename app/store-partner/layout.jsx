import StoreShell from "@/components/store-dashboard/StoreShell";
import DashboardAccessGuard from "@/components/auth/DashboardAccessGuard";

export default function StoreDashboardLayout({ children }) {
  return (
    <DashboardAccessGuard scope="store">
      <StoreShell>{children}</StoreShell>
    </DashboardAccessGuard>
  );
}
