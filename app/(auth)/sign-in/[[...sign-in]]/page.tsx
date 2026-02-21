// app/sign-in/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Eye, EyeOff } from "lucide-react";

const ALLOWED_ROLES = new Set(["storepartner", "restaurantpartner", "corporateadmin"]);

const SignInPage = () => {
  const [step, setStep] = useState<
    "signIn" | "forgotPassword" | "verifyOTP" | "resetPassword"
  >("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [resetSession, setResetSession] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);

  const router = useRouter();

  useEffect(() => {
    setError("");
    setSuccessMessage("");
  }, [step]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.session || !data.user) {
        throw new Error(error?.message || "Invalid credentials");
      }

      // ✅ Role check from users table
      // Assumes: public.users has (id uuid = auth.user.id) and (role text)
      // If your table uses email instead, switch `.eq("id", ...)` to `.eq("email", data.user.email)`
      const { data: userRow, error: roleErr } = await supabaseBrowser
        .from("users")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      if (roleErr) {
        // If RLS blocks this or table mismatch, you'll see this message
        await supabaseBrowser.auth.signOut();
        throw new Error(
          "Unable to verify your partner access. Please contact support."
        );
      }

      const role = String(userRow?.role || "").toLowerCase();

      if (!ALLOWED_ROLES.has(role)) {
        // 🚫 Non partner roles denied
        await supabaseBrowser.auth.signOut();
        throw new Error(
          "Access denied. This portal is only for Store Partner and Restaurant Partner accounts."
        );
      }

      // ✅ Allowed partners proceed
      router.push(`/callback`);
    } catch (err: any) {
      setError(err?.message || "Sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const { error } = await supabaseBrowser.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (error) throw new Error(error.message);

      setStep("verifyOTP");
      setSuccessMessage(
        `Reset link sent to ${email}. Please check your inbox.`
      );
    } catch (err: any) {
      setError(err.message || "Failed to send reset instructions.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    // kept as-is (your existing commented code)
  };

  // Render different images based on step
  const renderImage = () => {
    return (
      <div>
        {step === "signIn" && (
          <div>
            <Image
              src={"/signin.png"}
              alt="signin img"
              width={480}
              height={800}
              className="hidden h-137.5 lg:block object-cover rounded-md shadow-md"
              priority
            />
          </div>
        )}
        {step === "forgotPassword" && (
          <div className="bg-yellow-100 rounded-xl w-full h-full flex items-center justify-center text-yellow-800 font-medium">
            <Image
              src={"/signin.png"}
              alt="forgot passswor img"
              width={480}
              height={800}
              className="hidden h-137.5 lg:block object-cover rounded-md shadow-md"
              priority
            />
          </div>
        )}
        {step === "verifyOTP" ||
          (step === "resetPassword" && (
            <div className="bg-purple-100 rounded-xl w-full h-full flex items-center justify-center text-purple-800 font-medium">
              <Image
                src={"/step3.png"}
                alt="signin image"
                width={400}
                height={700}
                className="hidden lg:block"
                priority
              />
            </div>
          ))}
        {step === "resetPassword" && (
          <div className="bg-green-100 border-2 border-green-300 rounded-xl w-full h-full flex items-center justify-center text-green-800 font-medium">
            <div className="text-center p-4">
              <div className="text-2xl mb-2">Create New Password</div>
              <div>Set a strong, secure password</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex gap-0  lg:gap-10 lg:bg-[#ffffff] justify-center items-center min-h-screen">
      {/* Left side - Image */}
      {renderImage()}

      {/* Right side - Form */}
      <div>
        {/* Sign In Form */}
        {step === "signIn" && (
          <div className="w-full lg:w-auto px-4 py-8 lg:p-0">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Partner Portal Login
              </h1>
              <p className="text-gray-600">
                Sign in to access your partner dashboard (Store Partner / Restaurant Partner only).
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}
            {successMessage && (
              <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
                {successMessage}
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 text-gray-600"
                  placeholder="Enter your partner email"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1 placeholder-gray-400"
                >
                  Password
                </label>

                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 text-gray-600"
                    required
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <label
                    htmlFor="remember-me"
                    className="ml-2 block text-sm text-gray-700"
                  >
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <button
                    type="button"
                    onClick={() => setStep("forgotPassword")}
                    className="font-medium text-indigo-600 hover:text-indigo-500 cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="cursor-pointer pointer-cursor w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Forgot Password Form */}
        {step === "forgotPassword" && (
          <div className="w-full lg:w-auto px-4 py-8 lg:p-0">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Reset Partner Password
              </h1>
              <p className="text-gray-600">
                Enter your partner email and we’ll send you a reset link.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 text-gray-600"
                  placeholder="Enter your partner email"
                  required
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className=" cursor-pointer w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {isLoading ? "Sending..." : "Send Reset Link"}
                </button>
              </div>

              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => setStep("signIn")}
                  className=" cursor-pointer font-medium text-indigo-600 hover:text-indigo-500"
                >
                  Back to Login
                </button>
              </div>
            </form>
          </div>
        )}

        {/* OTP Verification Form (kept same UI, just content) */}
        {step === "verifyOTP" && (
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Reset Link Sent
              </h1>
              <p className="text-gray-600">
                We’ve sent a password reset link to{" "}
                <span className="font-semibold">{email}</span>. Please check your inbox.
              </p>
            </div>
          </div>
        )}

        {/* Reset Password Form (unchanged, as you had it) */}
        {step === "resetPassword" && (
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Create New Password
              </h1>
              <p className="text-gray-600">
                Your new password must be different from previous passwords
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}
            {successMessage && (
              <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
                {successMessage}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter new password"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Minimum 8 characters with letters and numbers
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Confirm new password"
                  required
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {isLoading ? "Resetting..." : "Reset Password"}
                </button>
              </div>

              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep("verifyOTP");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  className="font-medium text-indigo-600 hover:text-indigo-500 mr-4"
                >
                  Back to Verification
                </button>
                <button
                  type="button"
                  onClick={() => setStep("signIn")}
                  className="font-medium text-indigo-600 hover:text-indigo-500"
                >
                  Back to Login
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default SignInPage;
