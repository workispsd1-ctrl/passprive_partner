import RestaurantShell from "@/components/restaurant-dashboard/RestaurantShell";
import DashboardAccessGuard from "@/components/auth/DashboardAccessGuard";

export default function RestaurantDashboardLayout({ children }) {
  return (
    <DashboardAccessGuard scope="restaurant">
      <RestaurantShell>{children}</RestaurantShell>
    </DashboardAccessGuard>
  );
}
