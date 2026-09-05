"use client";

import { useState } from "react";
import { ContactType, ContactStatus } from "@prisma/client";
import { 
  Mail, 
  Phone, 
  Copy, 
  Check, 
  ShieldCheck, 
  ShieldAlert, 
  Loader2
} from "lucide-react";
import { toggleContactStatus } from "@/lib/actions/contact";
import { useDialog } from "@/providers/DialogProvider";

export interface ContactCardData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: ContactType;
  status: ContactStatus;
  isMasked?: boolean;
  rawEmail?: string | null;
  rawPhone?: string | null;
  department?: {
    id: string;
    name: string;
  } | null;
}

export function ContactCard({
  contact,
  isSelected = false,
  onClick,
  onStatusChanged,
}: {
  contact: ContactCardData;
  isSelected?: boolean;
  onClick: () => void;
  onStatusChanged: () => void;
}) {
  const { toast } = useDialog();
  const [isCopied, setIsCopied] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const handleCopy = (e: React.MouseEvent, text: string, type: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setIsCopied(type);
    toast({ title: "Copied", description: text, type: "success" });
    setTimeout(() => setIsCopied(null), 1500);
  };

  const handleToggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsToggling(true);
    try {
      const next = await toggleContactStatus(contact.id);
      toast({
        title: "Status Updated",
        description: `Marked as ${next}`,
        type: "success",
      });
      onStatusChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to toggle status";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsToggling(false);
    }
  };

  const getTypeBadge = (type: ContactType) => {
    if (isSelected) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/15 text-black uppercase">
          {type}
        </span>
      );
    }

    switch (type) {
      case "CUSTOMER":
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#252728] text-blue-400 uppercase">
            Customer
          </span>
        );
      case "SUPPLIER":
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#252728] text-purple-400 uppercase">
            Supplier
          </span>
        );
      case "PARTNER":
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#252728] text-emerald-400 uppercase">
            Partner
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#252728] text-slate-400 uppercase">
            Other
          </span>
        );
    }
  };

  const initials = contact.name
    ? contact.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "CT";

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-2xl transition-all cursor-pointer select-none flex flex-col gap-3 group ${
        isSelected
          ? "bg-[#C7F33C] text-black"
          : "bg-[#3A3B3C] hover:bg-[#474849] text-slate-100"
      }`}
    >
      {/* Top Row: Name, Avatar, Type, and Status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
              isSelected
                ? "bg-black/15 text-black"
                : "bg-[#252728] text-slate-200"
            }`}
          >
            {initials}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`font-bold text-sm truncate ${
                  isSelected ? "text-black" : "text-slate-100 group-hover:text-white"
                }`}
              >
                {contact.name}
              </span>
              {getTypeBadge(contact.type)}
            </div>
            {contact.department && (
              <span
                className={`text-[11px] ${
                  isSelected ? "text-black/70" : "text-slate-400"
                }`}
              >
                Dept: {contact.department.name}
              </span>
            )}
          </div>
        </div>

        {/* Status Toggle Button */}
        <button
          type="button"
          onClick={handleToggleStatus}
          disabled={isToggling}
          className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all shrink-0 flex items-center gap-1 ${
            isSelected
              ? contact.status === "QUALIFIED"
                ? "bg-black text-[#C7F33C]"
                : "bg-black/15 text-black hover:bg-black/25"
              : contact.status === "QUALIFIED"
              ? "bg-[#C7F33C] text-black hover:bg-[#b5dc35]"
              : "bg-[#252728] text-slate-400 hover:text-slate-200"
          }`}
          title="Click to toggle qualification"
        >
          {isToggling ? (
            <Loader2
              className={`w-3 h-3 animate-spin ${
                isSelected ? "text-black" : "text-slate-400"
              }`}
            />
          ) : contact.status === "QUALIFIED" ? (
            <ShieldCheck
              className={`w-3.5 h-3.5 ${
                isSelected ? "text-[#C7F33C]" : "text-black"
              }`}
            />
          ) : (
            <ShieldAlert
              className={`w-3.5 h-3.5 ${
                isSelected ? "text-black" : "text-slate-400"
              }`}
            />
          )}
          <span>{contact.status === "QUALIFIED" ? "Qualified" : "Unqualified"}</span>
        </button>
      </div>

      {/* Contact Details (Email & Phone) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-0.5">
        {contact.email && (
          <div className="flex items-center gap-1.5">
            <Mail
              className={`w-3 h-3 ${
                isSelected ? "text-black" : "text-slate-500"
              }`}
            />
            <span
              className={
                isSelected
                  ? "text-black font-medium"
                  : contact.isMasked
                  ? "font-mono text-slate-400"
                  : "text-slate-300"
              }
            >
              {contact.email}
            </span>
            {!contact.isMasked && contact.rawEmail && (
              <button
                type="button"
                onClick={(e) => handleCopy(e, contact.rawEmail!, "email")}
                className={
                  isSelected
                    ? "text-black/70 hover:text-black"
                    : "text-slate-500 hover:text-slate-200"
                }
                title="Copy email"
              >
                {isCopied === "email" ? (
                  <Check
                    className={`w-3 h-3 ${
                      isSelected ? "text-black font-bold" : "text-[#C7F33C]"
                    }`}
                  />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        )}

        {contact.phone && (
          <div className="flex items-center gap-1.5">
            <Phone
              className={`w-3 h-3 ${
                isSelected ? "text-black" : "text-slate-500"
              }`}
            />
            <span
              className={
                isSelected
                  ? "text-black font-medium"
                  : contact.isMasked
                  ? "font-mono text-slate-400"
                  : "text-slate-300"
              }
            >
              {contact.phone}
            </span>
            {!contact.isMasked && contact.rawPhone && (
              <button
                type="button"
                onClick={(e) => handleCopy(e, contact.rawPhone!, "phone")}
                className={
                  isSelected
                    ? "text-black/70 hover:text-black"
                    : "text-slate-500 hover:text-slate-200"
                }
                title="Copy phone"
              >
                {isCopied === "phone" ? (
                  <Check
                    className={`w-3 h-3 ${
                      isSelected ? "text-black font-bold" : "text-[#C7F33C]"
                    }`}
                  />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        )}

        {!contact.email && !contact.phone && (
          <span
            className={`text-[11px] italic ${
              isSelected ? "text-black/60" : "text-slate-500"
            }`}
          >
            No contact details recorded
          </span>
        )}
      </div>
    </div>
  );
}
