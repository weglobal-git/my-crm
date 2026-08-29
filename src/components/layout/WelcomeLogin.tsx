"use client";

import { useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { signIn } from "next-auth/react";

export function WelcomeLogin() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    await signIn("google", { callbackUrl: "/" });
  };

  return (
    <section className="min-h-screen w-full flex bg-[#fbfbfd]">
      {/* Left Column - Branding/Visual */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#000000]">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop')] bg-cover bg-center opacity-40 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/80 via-black/50 to-transparent"></div>

        <div className="relative z-10 w-full h-full flex flex-col justify-between p-16">
          <div className="flex items-center gap-3 w-fit text-white">
            <LayoutDashboard className="w-8 h-8 text-indigo-400" />
            <span className="text-2xl font-bold tracking-tight">SB Interlab</span>
          </div>

          <div className="max-w-md animate-fade-in-up">
            <h2 className="text-5xl font-bold text-white mb-6 leading-tight">
              CRM Pipeline.
              <br />
              Accelerated.
            </h2>
            <p className="text-lg text-white/70 leading-relaxed font-medium">
              The internal platform for managing quotations, deals, and customers for SB Interlab worldwide.
            </p>
          </div>

          <div className="flex gap-4 text-white/40 text-sm font-medium">
            <span>© 2026 SB Interlab Co., Ltd.</span>
            <span>•</span>
            <span>Internal Use Only</span>
          </div>
        </div>
      </div>

      {/* Right Column - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col lg:justify-center p-8 lg:p-12 relative bg-white min-h-screen lg:min-h-0">
        <div className="w-full max-w-[400px] animate-fade-in-up mx-auto" style={{ animationDelay: "0.1s" }}>
          
          <div className="flex items-center gap-3 w-fit text-indigo-600 lg:hidden mb-12">
            <LayoutDashboard className="w-8 h-8" />
            <span className="text-2xl font-bold tracking-tight text-slate-900">SB Interlab</span>
          </div>

          <div className="text-center mb-10">
            <h1 className="text-[40px] font-bold text-[#1d1d1f] tracking-tight mb-3">
              Welcome
            </h1>
            <p className="text-slate-500">Sign in with your company Google Workspace account to continue.</p>
          </div>

          <div className="space-y-6">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full btn-secondary text-base disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3 border-gray-300 "
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                </span>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Sign in with Google
                </>
              )}
            </button>
            
            <p className="text-center text-xs text-slate-400 mt-8">
              Only authorized personnel can access this system.
              <br />
              If you encounter an error, contact your administrator.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
