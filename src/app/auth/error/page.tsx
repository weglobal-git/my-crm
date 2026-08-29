"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Suspense } from "react";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  let errorMessage = "An error occurred during authentication.";
  if (error === "AccessDenied") {
    errorMessage = "Your email address has not been authorized. Please contact the administrator to request access.";
  }

  return (
    <div className="bg-white rounded-3xl p-8  border border-slate-100 max-w-md w-full text-center animate-fade-in-up">
      <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
        <AlertTriangle className="w-8 h-8 text-red-500" />
      </div>
      
      <h2 className="text-2xl font-bold text-slate-900 mb-4">Access Denied</h2>
      
      <p className="text-slate-600 mb-8 leading-relaxed">
        {errorMessage}
      </p>
      
      <Link 
        href="/"
        className="flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-3.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors "
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Login
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <div className="w-full h-full min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <Suspense fallback={<div className="text-slate-500">Loading...</div>}>
        <AuthErrorContent />
      </Suspense>
    </div>
  );
}
