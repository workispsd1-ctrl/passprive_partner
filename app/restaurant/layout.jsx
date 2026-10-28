import RestaurantShell from "@/components/restaurant-dashboard/RestaurantShell";
import DashboardAccessGuard from "@/components/auth/DashboardAccessGuard";
import { LanguageProvider } from "@/lib/i18n";

export default function RestaurantDashboardLayout({ children }) {
  return (
    <LanguageProvider>
      <DashboardAccessGuard scope="restaurant">
        <RestaurantShell>{children}</RestaurantShell>
      </DashboardAccessGuard>
    </LanguageProvider>
  );
}
