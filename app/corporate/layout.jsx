import CorporateShell from "@/components/corporate/CorporateShell";
import DashboardAccessGuard from "@/components/auth/DashboardAccessGuard";

export default function CorporateDashboardLayout({ children }) {
  return (
    <DashboardAccessGuard scope="corporate">
      <CorporateShell>{children}</CorporateShell>
    </DashboardAccessGuard>
  );
}
