import RestaurantScope from "@/components/restaurant-dashboard/RestaurantScope";
import DashboardAccessGuard from "@/components/auth/DashboardAccessGuard";
import { LanguageProvider } from "@/lib/i18n";

export default function RestaurantDashboardLayout({ children }) {
  return (
    <LanguageProvider>
      <DashboardAccessGuard scope="restaurant">
        <RestaurantScope>{children}</RestaurantScope>
      </DashboardAccessGuard>
    </LanguageProvider>
  );
}
