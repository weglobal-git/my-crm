"use client";

import { useState } from "react";
import { ContactType } from "@prisma/client";
import { 
  Building2, 
  Mail, 
  Phone, 
  Copy, 
  Check, 
  ChevronRight, 
  ShieldCheck, 
  ShieldAlert, 
  Briefcase,
  Globe,
  Loader2
} from "lucide-react";
import { toggleContactStatus, ContactWithRelations } from "@/lib/actions/contact";
import { useDialog } from "@/providers/DialogProvider";

export type ContactRow = ContactWithRelations;

export function ContactTable({
  contacts,
  isLoading,
  onSelectContact,
  onStatusToggled,
}: {
  contacts: ContactRow[];
  isLoading: boolean;
  onSelectContact: (id: string) => void;
  onStatusToggled: () => void;
}) {
  const { toast } = useDialog();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, text: string, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    toast({ title: "Copied", description: text, type: "success" });
    setTimeout(() => setCopiedField(null), 1500);
  };

  const handleStatusToggle = async (e: React.MouseEvent, contactId: string) => {
    e.stopPropagation();
    setTogglingId(contactId);
    try {
      const newStatus = await toggleContactStatus(contactId);
      toast({
        title: "Status Changed",
        description: `Contact marked as ${newStatus}`,
        type: "success",
      });
      onStatusToggled();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to toggle status";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setTogglingId(null);
    }
  };

  const getTypeBadge = (type: ContactType) => {
    switch (type) {
      case "CUSTOMER":
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/40 uppercase">
            Customer
          </span>
        );
      case "SUPPLIER":
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-400 border border-purple-800/40 uppercase">
            Supplier
          </span>
        );
      case "PARTNER":
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 uppercase">
            Partner
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase">
            Other
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-20 bg-[#252728]">
        <Loader2 className="w-8 h-8 text-[#C7F33C] animate-spin" />
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 bg-[#252728] border border-[#3A3B3C] rounded-2xl text-center">
        <Building2 className="w-12 h-12 text-slate-500 mb-2" />
        <h4 className="text-base font-bold text-slate-200">No contacts found</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Try adjusting your search query, type filter, or qualification tab.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden border border-[#3A3B3C] rounded-2xl bg-[#252728]">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#3A3B3C] bg-[#1C1C1D]/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="py-3.5 px-4 pl-6">Contact / Person</th>
              <th className="py-3.5 px-4">Company & Country</th>
              <th className="py-3.5 px-4">Department</th>
              <th className="py-3.5 px-4">Email & Phone</th>
              <th className="py-3.5 px-4 text-center">Status</th>
              <th className="py-3.5 px-4 text-center">Projects</th>
              <th className="py-3.5 px-4 pr-6 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#3A3B3C]/70 text-xs">
            {contacts.map((c) => {
              const initials = c.name
                ? c.name
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : "CT";

              return (
                <tr
                  key={c.id}
                  onClick={() => onSelectContact(c.id)}
                  className="group hover:bg-[#3A3B3C]/50 transition-colors cursor-pointer"
                >
                  {/* Name & Type */}
                  <td className="py-3 px-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#3A3B3C] group-hover:bg-[#4E4F50] border border-[#4E4F50] flex items-center justify-center text-xs font-bold text-slate-200 shrink-0 transition-colors">
                        {initials}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100 group-hover:text-white transition-colors truncate max-w-[200px]">
                            {c.name}
                          </span>
                          {getTypeBadge(c.type)}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Company & Country */}
                  <td className="py-3 px-4">
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-slate-200 truncate max-w-[220px]">
                        {c.company.name}
                      </span>
                      {c.company.country && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Globe className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate">{c.company.country}</span>
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Department */}
                  <td className="py-3 px-4">
                    {c.department ? (
                      <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#3A3B3C] text-slate-300 border border-[#4E4F50]">
                        {c.department.name}
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">-</span>
                    )}
                  </td>

                  {/* Email & Phone */}
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-0.5">
                      {c.email ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className={c.isMasked ? "font-mono text-slate-400" : ""}>
                            {c.email}
                          </span>
                          {!c.isMasked && c.rawEmail && (
                            <button
                              type="button"
                              onClick={(e) => handleCopy(e, c.rawEmail!, `email-${c.id}`)}
                              className="text-slate-500 hover:text-slate-300 transition-colors ml-0.5"
                              title="Copy email"
                            >
                              {copiedField === `email-${c.id}` ? (
                                <Check className="w-3 h-3 text-[#C7F33C]" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      ) : null}

                      {c.phone ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className={c.isMasked ? "font-mono text-slate-400" : ""}>
                            {c.phone}
                          </span>
                          {!c.isMasked && c.rawPhone && (
                            <button
                              type="button"
                              onClick={(e) => handleCopy(e, c.rawPhone!, `phone-${c.id}`)}
                              className="text-slate-500 hover:text-slate-300 transition-colors ml-0.5"
                              title="Copy phone"
                            >
                              {copiedField === `phone-${c.id}` ? (
                                <Check className="w-3 h-3 text-[#C7F33C]" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      ) : null}

                      {!c.email && !c.phone && (
                        <span className="text-slate-500 text-[11px]">-</span>
                      )}
                    </div>
                  </td>

                  {/* Status Toggle Pill */}
                  <td className="py-3 px-4 text-center">
                    <button
                      type="button"
                      onClick={(e) => handleStatusToggle(e, c.id)}
                      disabled={togglingId === c.id}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                        c.status === "QUALIFIED"
                          ? "bg-[#C7F33C] text-black hover:bg-[#b5dc35]"
                          : "bg-[#3A3B3C] text-slate-400 hover:text-slate-200 hover:bg-[#4E4F50]"
                      }`}
                      title="Click to toggle qualification"
                    >
                      {togglingId === c.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : c.status === "QUALIFIED" ? (
                        <ShieldCheck className="w-3.5 h-3.5 text-black" />
                      ) : (
                        <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>{c.status === "QUALIFIED" ? "Qualified" : "Unqualified"}</span>
                    </button>
                  </td>

                  {/* Projects Count */}
                  <td className="py-3 px-4 text-center">
                    {c.projectCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#3A3B3C] text-[#C7F33C] border border-[#4E4F50]">
                        <Briefcase className="w-3 h-3" />
                        {c.projectCount}
                      </span>
                    ) : (
                      <span className="text-slate-500 text-xs">0</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="py-3 px-4 pr-6 text-right">
                    <div className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 group-hover:text-slate-100 group-hover:bg-[#4E4F50] transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
