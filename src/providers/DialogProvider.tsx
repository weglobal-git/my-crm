"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { CheckCircle2, XCircle, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  title: string;
  description?: string;
  type?: ToastType;
  duration?: number;
}

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "primary" | "danger";
}

interface DialogContextType {
  toast: (options: ToastOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return context;
}

interface Toast extends ToastOptions {
  id: string;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  // Toast State
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Modal State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions | null;
    resolve: (value: boolean) => void;
  }>({
    isOpen: false,
    options: null,
    resolve: () => {},
  });

  const toast = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...options, id }]);
    
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, options.duration || 5000);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        isOpen: true,
        options,
        resolve,
      });
    });
  }, []);

  const handleConfirmClose = (value: boolean) => {
    confirmState.resolve(value);
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
    // Wait for animation to finish before clearing options
    setTimeout(() => {
      setConfirmState((prev) => ({ ...prev, options: null }));
    }, 300);
  };

  return (
    <DialogContext.Provider value={{ toast, confirm }}>
      {children}

      {/* TOAST CONTAINER */}
      <div className="fixed bottom-4 right-4 z-[210] flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <div 
            key={t.id} 
            className={`
              pointer-events-auto flex items-start gap-3 p-4 bg-[#252728] rounded-2xl border border-[#3A3B3C] shadow-2xl min-w-[300px] max-w-[400px] animate-in slide-in-from-bottom-5 fade-in duration-300
            `}
          >
            <div className="shrink-0 mt-0.5">
              {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-[#C7F33C]" />}
              {t.type === 'error' && <XCircle className="w-5 h-5 text-rose-400" />}
              {t.type === 'warning' && <AlertCircle className="w-5 h-5 text-amber-400" />}
              {(!t.type || t.type === 'info') && <Info className="w-5 h-5 text-sky-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-slate-100">{t.title}</h4>
              {t.description && <p className="text-xs text-slate-400 mt-1 leading-relaxed">{t.description}</p>}
            </div>
            <button 
              onClick={() => setToasts(prev => prev.filter(toast => toast.id !== t.id))}
              className="shrink-0 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* CONFIRM MODAL */}
      <div 
        className={`fixed inset-0 z-[200] flex items-center justify-center p-4 transition-all duration-300 ${confirmState.isOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`}
      >
        <div 
          className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
          onClick={() => handleConfirmClose(false)}
        />
        
        <div 
          className={`
            relative bg-[#252728] border border-[#3A3B3C] rounded-3xl shadow-2xl w-full max-w-md p-6 overflow-hidden transition-all duration-300 transform
            ${confirmState.isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
          `}
        >
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-2xl border shrink-0 ${
                confirmState.options?.variant === 'danger' 
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                  : 'bg-[#C7F33C]/10 text-[#C7F33C] border-[#C7F33C]/20'
              }`}>
                {confirmState.options?.variant === 'danger' ? <AlertCircle className="w-6 h-6" /> : <Info className="w-6 h-6" />}
              </div>
              <div className="pt-0.5">
                <h3 className="text-base font-bold text-slate-100 leading-snug mb-1.5">{confirmState.options?.title}</h3>
                {confirmState.options?.description && (
                  <p className="text-slate-400 text-xs leading-relaxed">{confirmState.options.description}</p>
                )}
              </div>
            </div>
            
            <div className="flex justify-end gap-2.5 pt-2">
              <button 
                type="button"
                onClick={() => handleConfirmClose(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-300 bg-[#3A3B3C] hover:bg-[#4E4F50] hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                {confirmState.options?.cancelText || "Cancel"}
              </button>
              <button 
                type="button"
                onClick={() => handleConfirmClose(true)}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                  confirmState.options?.variant === 'danger' 
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30' 
                    : 'bg-[#C7F33C] hover:bg-[#b5dc35] text-black shadow-lg shadow-lime-950/20'
                }`}
              >
                {confirmState.options?.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DialogContext.Provider>
  );
}
