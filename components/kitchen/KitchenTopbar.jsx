"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Wifi, WifiOff } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function KitchenTopbar() {
  const router = useRouter();
  const [restaurantName, setRestaurantName] = useState("Restaurant");
  const [restaurantLogo, setRestaurantLogo] = useState("");
  const [operatorName, setOperatorName] = useState("Operator");
  const [staffRole, setStaffRole] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadRestaurantData = async () => {
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (!token) {
          router.push("/sign-in");
          return;
        }

        const response = await fetch("/api/kitchen/restaurant", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await response.json();

        if (!response.ok || !payload?.ok) {
          console.error("Kitchen restaurant lookup failed:", payload?.error || response.statusText);
          setLoading(false);
          return;
        }

        if (isMounted) {
          setRestaurantName(payload?.restaurant?.name || "Restaurant");
          setRestaurantLogo(payload?.restaurant?.cover_image || "");
          setOperatorName(payload?.operator_name || "Operator");
          setStaffRole(String(payload?.staff_role || "").toLowerCase());
        }

        if (isMounted) {
          setLoading(false);
        }
      } catch (error) {
        console.error("Topbar error:", error);
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadRestaurantData();

    // Cleanup
    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleLogout = async () => {
    await supabaseBrowser.auth.signOut();
    router.push("/sign-in");
  };

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-4">
          {restaurantLogo && (
            <img
              src={restaurantLogo}
              alt={restaurantName}
              className="h-16 w-16 rounded-lg object-cover"
            />
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{restaurantName}</h1>
              {staffRole === "restaurant_kitchen" && (
                <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">
                  Kitchen
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">Restaurant</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col text-right text-xs text-gray-600">
            <p>{operatorName}</p>
            <div className="flex items-center gap-2 justify-end mt-1">
              {isOnline ? (
                <>
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="text-green-600 font-medium">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-red-500" />
                  <span className="text-red-600 font-medium">Offline</span>
                </>
              )}
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
