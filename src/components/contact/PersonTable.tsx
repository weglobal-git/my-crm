"use client";

import Image from "next/image";
import { ContactType, ContactStatus } from "@prisma/client";
import { 
  Users, 
  CheckCircle2
} from "lucide-react";

export interface PersonItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role?: string | null;
  contactDepartment?: string | null;
  emails?: string[];
  phones?: string[];
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  image?: string | null;
  isActive: boolean;
  type: ContactType;
  status: ContactStatus;
  isMasked?: boolean;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
  createdAt?: Date | string;
}

interface PersonTableProps {
  contacts: PersonItem[];
  companyName: string;
  selectedContactId: string | null;
  onSelectContact: (contactId: string) => void;
  onContactUpdated?: () => void;
  onAddPerson?: () => void;
  isLoading?: boolean;
}

export function PersonTable({
  contacts,
  companyName,
  selectedContactId,
  onSelectContact,
  isLoading = false,
}: PersonTableProps) {
  // Get initials for avatar
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden border-0">

      {/* Table Container - Persistent Structural Shell */}
      <div className="flex-1 overflow-auto hide-scrollbar">
        <table className="w-full min-w-[650px] text-left border-collapse table-fixed">
          <colgroup>
            <col className="w-[25%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col className="w-[17%]" />
          </colgroup>
          <thead>
            <tr className="bg-[#252728]/90 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-0 sticky top-0 z-10 backdrop-blur-md">
              {/* [1] Profile Avatar & Name */}
              <th className="py-3 pl-5 pr-3 w-[25%]">Person</th>

              {/* [2] Position */}
              <th className="py-3 px-3 w-[18%]">Position</th>

              {/* [3] Department (Customer Org) */}
              <th className="py-3 px-3 w-[18%]">Department</th>

              {/* [4] Email */}
              <th className="py-3 px-3 w-[22%]">Email</th>

              {/* [5] Phone Number */}
              <th className="py-3 pl-3 pr-5 w-[17%]">Phone Number</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#28292A]">
            {isLoading ? (
              // 4 Skeleton Rows with exact matching column widths
              [1, 2, 3, 4].map((i) => (
                <tr key={`skeleton-${i}`} className="animate-pulse">
                  <td className="py-3.5 pl-5 pr-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#2E3033] shrink-0" />
                      <div className="h-3.5 w-28 bg-[#2E3033] rounded" />
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-3 w-20 bg-[#2E3033] rounded" />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-3 w-20 bg-[#2E3033] rounded" />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-3 w-32 bg-[#2E3033] rounded" />
                  </td>
                  <td className="py-3.5 pl-3 pr-5">
                    <div className="h-3 w-24 bg-[#2E3033] rounded" />
                  </td>
                </tr>
              ))
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-slate-400 border-0">
                  <div className="flex flex-col items-center justify-center gap-2.5">
                    <Users className="w-9 h-9 text-slate-600" />
                    <div>
                      <span className="font-semibold text-slate-200 block text-sm">
                        No persons under {companyName}
                      </span>
                      <span className="text-xs text-slate-400 block mt-0.5">
                        Manage contacts for this account in the Edit Account panel.
                      </span>
                    </div>
                  </div>
                </td>
              </tr>
            ) : contacts.map((contact) => {
                const isSelected = selectedContactId === contact.id;

                // Email display: primary email or emails array
                const displayEmail = contact.email || (contact.emails && contact.emails.length > 0 ? contact.emails[0] : "-");
                const hasMultipleEmails = (contact.emails && contact.emails.length > 1);

                // Phone display: primary phone or phones array
                const displayPhone = contact.phone || (contact.phones && contact.phones.length > 0 ? contact.phones[0] : "-");
                const hasMultiplePhones = (contact.phones && contact.phones.length > 1);

                return (
                  <tr
                    key={contact.id}
                    onClick={() => onSelectContact(contact.id)}
                    className={`group transition-colors cursor-pointer border-0 ${
                      isSelected ? "bg-[#2D2E30]" : "hover:bg-[#252728]"
                    }`}
                  >
                    {/* [1] Avatar & Name */}
                    <td className="py-3.5 pl-5 pr-3 truncate">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 bg-[#C7F33C] flex items-center justify-center text-black font-bold text-xs">
                          {contact.image ? (
                            <Image
                              src={contact.image}
                              alt={contact.name}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <span>{getInitials(contact.name)}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-sm text-slate-100 block group-hover:text-white transition-colors truncate">
                            {contact.name}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* [2] Position */}
                    <td className="py-3.5 px-3 text-xs font-semibold text-slate-300 truncate">
                      <span className="truncate block">{contact.role || "-"}</span>
                    </td>

                    {/* [3] Department (Customer Org) */}
                    <td className="py-3.5 px-3 text-xs font-semibold text-slate-300 truncate">
                      <span className="truncate block">{contact.contactDepartment || "-"}</span>
                    </td>

                    {/* [4] Email */}
                    <td className="py-3.5 px-3 truncate">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200 min-w-0">
                        <span className="truncate">{displayEmail}</span>
                        {contact.isEmailVerified && (
                          <span title="Verified Email" className="inline-flex shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                          </span>
                        )}
                        {hasMultipleEmails && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#3A3B3C] text-slate-400 shrink-0">
                            +{contact.emails!.length - 1}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* [5] Phone Number */}
                    <td className="py-3.5 pl-3 pr-5 truncate">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200 min-w-0">
                        <span className="truncate">{displayPhone}</span>
                        {contact.isPhoneVerified && (
                          <span title="Verified Phone" className="inline-flex shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                          </span>
                        )}
                        {hasMultiplePhones && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#3A3B3C] text-slate-400 shrink-0">
                            +{contact.phones!.length - 1}
                          </span>
                        )}
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
