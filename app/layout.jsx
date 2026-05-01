import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ToastProvider } from "../components/toastProvider";
import SessionTimeoutGuard from "@/components/auth/SessionTimeoutGuard";
import "react-phone-input-2/lib/style.css";
import "react-datepicker/dist/react-datepicker.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

export const metadata = {
  title: "PassPrive - Partner Dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${beVietnamPro.className} ${beVietnamPro.variable} antialiased`}
      >
          <Providers>
        <SessionTimeoutGuard />
        {children}
        </Providers>
        <ToastProvider/>
      </body>
    </html>
  );
}
