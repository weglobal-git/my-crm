"use client";

import React, { useMemo } from "react";
import { Mail, Check, X, ShieldAlert, Sparkles, AlertCircle } from "lucide-react";

export interface EmailInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

// RFC 5322 compliant regex for practical email validation
export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  return EMAIL_REGEX.test(trimmed);
}

// Common typo domains map
const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmai.co": "gmail.com",
  "gmaik.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotamil.com": "hotmail.com",
  "homail.com": "hotmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yaho.co": "yahoo.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlock.com": "outlook.com",
  "icoud.com": "icloud.com",
  "iclude.com": "icloud.com",
};

export function EmailInput({
  value = "",
  onChange,
  placeholder = "contact@company.com",
  disabled = false,
  className = "",
  id,
}: EmailInputProps) {
  const trimmed = value.trim();

  // Validate email format, detect non-ASCII/Thai characters and typos
  const { isValid, hasNonAscii, typoSuggestion, errorMessage } = useMemo(() => {
    if (!trimmed) {
      return { isValid: null, hasNonAscii: false, typoSuggestion: null, errorMessage: null };
    }

    const nonAscii = /[^\x20-\x7E]/.test(trimmed);
    const valid = EMAIL_REGEX.test(trimmed);
    const hasAt = trimmed.includes("@");
    const atIndex = trimmed.lastIndexOf("@");
    const domainPart = hasAt ? trimmed.slice(atIndex + 1).toLowerCase() : "";

    let suggestion: string | null = null;
    if (domainPart && COMMON_DOMAIN_TYPOS[domainPart]) {
      suggestion = `${trimmed.slice(0, atIndex)}@${COMMON_DOMAIN_TYPOS[domainPart]}`;
    }

    let error: string | null = null;
    if (nonAscii) {
      error = "The email address must consist of English characters only.";
    } else if (!hasAt) {
      error = "Email must contain @ symbol (e.g., name@company.com)";
    } else if (!domainPart || !domainPart.includes(".")) {
      error = "Must include complete domain name (e.g., .com, .co.th)";
    } else if (!valid) {
      error = "Invalid email format";
    }

    return {
      isValid: valid,
      hasNonAscii: nonAscii,
      typoSuggestion: suggestion,
      errorMessage: error,
    };
  }, [trimmed]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    // Detect if user pasted multiple emails separated by delimiters (e.g. ",", ";", "|", "\n", "and")
    if (/[,\/;\n|]|\band\b|\bor\b|และ|หรือ/i.test(raw)) {
      const parts = raw.split(/[,\/;\n|]|\band\b|\bor\b|และ|หรือ/i);
      raw = parts[0] || "";
    }

    // Strip whitespace inside email
    const sanitized = raw.replace(/\s+/g, "");
    onChange(sanitized);
  };

  const handleApplySuggestion = () => {
    if (typoSuggestion) {
      onChange(typoSuggestion);
    }
  };

  return (
    <div className={`flex flex-col gap-1 w-full ${className}`}>
      <div
        className={`flex items-center rounded-xl bg-[#252728] border transition-colors ${
          isValid === true
            ? "border-[#C7F33C]/40 focus-within:border-[#C7F33C]"
            : hasNonAscii
            ? "border-red-500/50 focus-within:border-red-400"
            : trimmed
            ? "border-amber-500/40 focus-within:border-amber-400"
            : "border-[#4E4F50]/40 focus-within:border-[#C7F33C]"
        }`}
      >
        {/* Left Mail Icon */}
        <div className="pl-3 text-slate-400 shrink-0 pointer-events-none">
          <Mail className="w-3.5 h-3.5 text-slate-400" />
        </div>

        {/* Email Input */}
        <input
          id={id}
          type="email"
          value={value}
          onChange={handleChange}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50"
        />

        {/* Actions & Status Badges */}
        <div className="flex items-center gap-1.5 pr-2.5 shrink-0 select-none">
          {value && !disabled && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="p-1 text-slate-500 hover:text-slate-300 rounded-full transition-colors cursor-pointer"
              title="Clear email"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          {isValid === true && (
            <span
              className="text-xs font-bold text-[#C7F33C] bg-[#C7F33C]/10 border border-[#C7F33C]/30 px-2 py-0.5 rounded-full flex items-center gap-1 animate-in fade-in duration-150"
              title="Valid email syntax format"
            >
              <Check className="w-2.5 h-2.5 text-[#C7F33C]" />
              <span>Valid</span>
            </span>
          )}

          {trimmed && isValid !== true && (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 animate-in fade-in duration-150 ${
                hasNonAscii
                  ? "text-red-400 bg-red-400/10 border border-red-400/30"
                  : "text-amber-400 bg-amber-400/10 border border-amber-400/20"
              }`}
              title={errorMessage || "Incomplete or invalid email format"}
            >
              <ShieldAlert className="w-2.5 h-2.5 shrink-0" />
              <span>{hasNonAscii ? "English only" : "Check format"}</span>
            </span>
          )}
        </div>
      </div>

      {/* Typo Suggestion Banner */}
      {typoSuggestion && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-xs text-sky-300 animate-in fade-in duration-150">
          <Sparkles className="w-3 h-3 text-sky-400 shrink-0" />
          <span className="truncate">
            Did you mean <span className="font-semibold text-white underline">{typoSuggestion}</span>?
          </span>
          <button
            type="button"
            onClick={handleApplySuggestion}
            className="ml-auto px-1.5 py-0.5 text-xs font-bold rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 transition-colors shrink-0 cursor-pointer"
          >
            Apply
          </button>
        </div>
      )}

      {/* Error / Guidance Notice when invalid (and no typo suggestion) */}
      {trimmed && isValid !== true && errorMessage && !typoSuggestion && (
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs animate-in fade-in duration-150 ${
            hasNonAscii
              ? "bg-red-500/10 border border-red-500/20 text-red-300"
              : "bg-amber-500/10 border border-amber-500/20 text-amber-300"
          }`}
        >
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
