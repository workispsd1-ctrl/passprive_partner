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
  icons: {
    icon: [
      { url: "/icon.png?v=2" },
      { url: "/favicon.ico?v=2" },
    ],
    shortcut: "/icon.png?v=2",
    apple: "/icon.png?v=2",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.png?v=2" type="image/png" sizes="any" />
        <link rel="shortcut icon" href="/icon.png?v=2" />
        <link rel="apple-touch-icon" href="/icon.png?v=2" />
      </head>
      <body
        suppressHydrationWarning
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
