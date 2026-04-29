import CashierTopNav from "@/components/cashier/CashierTopNav";
import CashierAlertNotifier from "@/components/cashier/CashierAlertNotifier";

export default function CashierLayout({ children }) {
  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-900 p-4 sm:p-6">
      <CashierTopNav />
      <CashierAlertNotifier />
      <section>{children}</section>
    </main>
  );
}
