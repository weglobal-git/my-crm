"use client";

import { useState } from "react";
import { X, UserPlus, Loader2 } from "lucide-react";
import { useDialog } from "@/providers/DialogProvider";
import { createContact } from "@/lib/actions/contact";
import { ContactType, ContactStatus } from "@prisma/client";

export function CreateContactModal({
  isOpen,
  onClose,
  onCreated,
  prefillCompany,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (contactId: string) => void;
  prefillCompany?: { id: string; name: string } | null;
}) {
  const { toast } = useDialog();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    type: "CUSTOMER" as ContactType,
    status: "UNQUALIFIED" as ContactStatus,
    companyName: prefillCompany?.name || "",
    companyCountry: "",
    companyAddress: "",
  });

  const [prevPrefillId, setPrevPrefillId] = useState(prefillCompany?.id);
  if (prefillCompany?.id !== prevPrefillId) {
    setPrevPrefillId(prefillCompany?.id);
    if (prefillCompany?.name) {
      setForm((prev) => ({ ...prev, companyName: prefillCompany.name }));
    }
  }

  if (!isOpen) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      return toast({ title: "Validation", description: "Person name is required", type: "warning" });
    }
    if (!prefillCompany && !form.companyName.trim()) {
      return toast({ title: "Validation", description: "Account name is required", type: "warning" });
    }

    setIsSubmitting(true);
    try {
      const created = await createContact({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        type: form.type,
        status: form.status,
        companyId: prefillCompany?.id,
        companyName: form.companyName.trim(),
        companyCountry: form.companyCountry.trim(),
        companyAddress: form.companyAddress.trim(),
      });

      toast({
        title: "Person Created",
        description: `Successfully added ${form.name}`,
        type: "success",
      });

      onClose();
      onCreated(created.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create person";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="bg-[#252728] rounded-2xl w-full max-w-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1C1C1D] shrink-0">
          <div className="flex items-center gap-2.5">
            <UserPlus className="w-5 h-5 text-[#C7F33C]" />
            <h3 className="text-base font-bold text-slate-100">Add New Person</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 hover:bg-[#3A3B3C] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 max-h-[80vh]">
          {/* Person Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300">
                Person Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Somchai S."
                required
                className="bg-[#3A3B3C] rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Type
              </label>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="bg-[#3A3B3C] rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0"
              >
                <option value="CUSTOMER">Customer</option>
                <option value="SUPPLIER">Supplier</option>
                <option value="PARTNER">Partner</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Initial Qualification
              </label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="bg-[#3A3B3C] rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0"
              >
                <option value="UNQUALIFIED">Unqualified</option>
                <option value="QUALIFIED">Qualified</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="email@company.com"
                className="bg-[#3A3B3C] rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Phone</label>
              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="+66..."
                className="bg-[#3A3B3C] rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0"
              />
            </div>
          </div>

          <div className="border-t border-[#3A3B3C] pt-3 flex flex-col gap-3.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    Account Name <span className="text-red-400">*</span>
                  </label>
                  {prefillCompany && (
                    <span className="text-[10px] text-[#C7F33C] font-semibold">
                      Selected Account
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  name="companyName"
                  value={form.companyName}
                  onChange={handleChange}
                  readOnly={!!prefillCompany}
                  placeholder="e.g. SB Interlab / Partner Co."
                  required
                  className={`rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0 ${
                    prefillCompany ? "bg-[#252728] opacity-80 cursor-not-allowed" : "bg-[#3A3B3C]"
                  }`}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-300">Country</label>
                <input
                  type="text"
                  name="companyCountry"
                  value={form.companyCountry}
                  onChange={handleChange}
                  placeholder="e.g. Thailand, Japan, USA"
                  className="bg-[#3A3B3C] rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Address</label>
              <textarea
                name="companyAddress"
                value={form.companyAddress}
                onChange={handleChange}
                rows={2}
                placeholder="Office location details"
                className="bg-[#3A3B3C] rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors resize-none border-0"
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-2.5 pt-4 border-t border-[#1C1C1D]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#3A3B3C] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin text-black" />}
              Create Person
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
