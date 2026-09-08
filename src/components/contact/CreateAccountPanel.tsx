"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  Building2, 
  MapPin, 
  Loader2, 
  Plus, 
  Trash2, 
  Copy, 
  Star,
  Globe,
  FileText,
  Tag,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RotateCcw
} from "lucide-react";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { AccountTypeSelect } from "@/components/ui/AccountTypeSelect";
import { AddressTypeSelect } from "@/components/ui/AddressTypeSelect";
import { AddressAutocomplete } from "@/components/contact/AddressAutocomplete";
import { useDialog } from "@/providers/DialogProvider";
import { createCompany, CreateCompanyAddressInput } from "@/lib/actions/contact";
import { ContactType } from "@prisma/client";

interface CreateAccountPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountCreated: (account: { id: string; name: string }) => void;
}

interface AddressDraftItem extends CreateCompanyAddressInput {
  tempId: string;
}

const emptyAddressDraft = (defaultCountry: string, isDefault = false, index = 1): AddressDraftItem => ({
  tempId: `addr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  title: index === 1 ? "Headquarters" : `Branch ${index}`,
  type: index === 1 ? "HEADQUARTERS" : "BRANCH",
  taxId: "",
  branchNumber: index === 1 ? "00000" : "",
  addressLine1: "",
  addressLine2: "",
  subdistrict: "",
  district: "",
  province: "",
  postalCode: "",
  country: defaultCountry || "Thailand",
  googleMapsUrl: "",
  isDefault,
});

export function CreateAccountPanel({
  isOpen,
  onClose,
  onAccountCreated,
}: CreateAccountPanelProps) {
  const { toast, confirm } = useDialog();

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Account General Fields
  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [accountType, setAccountType] = useState<ContactType>("CUSTOMER");
  const [country, setCountry] = useState("Thailand");
  const [notes, setNotes] = useState("");

  // Multiple Addresses State: Initialize with identical first draft
  const [addresses, setAddresses] = useState<AddressDraftItem[]>(() => {
    const init = emptyAddressDraft("Thailand", true, 1);
    return [init];
  });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    return new Set([addresses[0]?.tempId || "init-addr-1"]);
  });

  // When reset or open, ensure first is expanded
  const isAddressExpanded = (tempId: string) => expandedIds.has(tempId);

  const toggleAddressExpand = (tempId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) {
        next.delete(tempId);
      } else {
        next.add(tempId);
      }
      return next;
    });
  };

  const handleAccountCountryChange = (val: string) => {
    setCountry(val);
    // If first address has no street line filled yet, keep country synced
    setAddresses((prev) =>
      prev.map((a, idx) =>
        idx === 0 && !a.addressLine1 ? { ...a, country: val } : a
      )
    );
  };

  const handleAddAddress = () => {
    const newDraft = emptyAddressDraft(country, false, addresses.length + 1);
    setAddresses((prev) => [...prev, newDraft]);
    setExpandedIds((prev) => new Set(prev).add(newDraft.tempId));
  };

  const handleDuplicateAddress = (index: number) => {
    const source = addresses[index];
    if (!source) return;

    const copy: AddressDraftItem = {
      ...source,
      tempId: `addr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: `${source.title || "Address"} (Copy)`,
      isDefault: false,
    };

    setAddresses((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setExpandedIds((prev) => new Set(prev).add(copy.tempId));

    toast({
      title: "Address Copied",
      description: `Duplicated "${source.title || `Address #${index + 1}`}"`,
      type: "success",
    });
  };

  const handleRemoveAddress = async (index: number) => {
    if (addresses.length <= 1) {
      return toast({ title: "Cannot Remove", description: "At least one address form is required", type: "warning" });
    }

    const ok = await confirm({
      title: "Remove Address?",
      description: `Are you sure you want to remove ${addresses[index]?.title || "this address form"}?`,
      confirmText: "Remove",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!ok) return;

    const wasDefault = addresses[index]?.isDefault;
    setAddresses((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      // If removed item was default, reassign default to first item
      if (wasDefault && filtered.length > 0) {
        filtered[0] = { ...filtered[0], isDefault: true };
      }
      return filtered;
    });
  };

  const handleSetMainAddress = (index: number) => {
    setAddresses((prev) =>
      prev.map((a, i) => ({
        ...a,
        isDefault: i === index,
      }))
    );
  };

  const handleAddressChange = (index: number, field: keyof CreateCompanyAddressInput, value: string | boolean) => {
    setAddresses((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const resetForm = useCallback(() => {
    setDisplayName("");
    setName("");
    setPhone("");
    setAccountType("CUSTOMER");
    setCountry("Thailand");
    setNotes("");
    const initial = emptyAddressDraft("Thailand", true, 1);
    setAddresses([initial]);
    setExpandedIds(new Set([initial.tempId]));
  }, []);

  // Whenever the panel closes, defer resetting all fields to prevent retaining unsaved autofill data
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        resetForm();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, resetForm]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleClearAddress = (index: number) => {
    setAddresses((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = {
        ...emptyAddressDraft(country || "Thailand", current.isDefault, index + 1),
        tempId: `addr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      };
      return next;
    });
    toast({ title: "Address Cleared", description: "Address fields have been reset.", type: "info" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      return toast({ title: "Validation", description: "Account display name is required", type: "warning" });
    }
    if (!name.trim()) {
      return toast({ title: "Validation", description: "Account name is required", type: "warning" });
    }

    // Filter valid addresses that have at least Address Line 1
    const validAddresses = addresses
      .filter((a) => a.addressLine1.trim())
      .map((a) => ({
        title: a.title?.trim() || "Headquarters",
        type: a.type || "HEADQUARTERS",
        taxId: a.taxId?.trim() || undefined,
        branchNumber: a.branchNumber?.trim() || undefined,
        addressLine1: a.addressLine1.trim(),
        addressLine2: a.addressLine2?.trim() || undefined,
        subdistrict: a.subdistrict?.trim() || undefined,
        district: a.district?.trim() || undefined,
        province: a.province?.trim() || undefined,
        postalCode: a.postalCode?.trim() || undefined,
        country: a.country?.trim() || country.trim() || "Thailand",
        googleMapsUrl: a.googleMapsUrl?.trim() || undefined,
        isDefault: !!a.isDefault,
      }));

    setIsSubmitting(true);
    try {
      const created = await createCompany({
        displayName: displayName.trim(),
        name: name.trim(),
        phone: phone.trim() || undefined,
        type: accountType,
        country: country.trim() || "Thailand",
        notes: notes.trim() || undefined,
        addresses: validAddresses.length > 0 ? validAddresses : undefined,
      });

      toast({
        title: "Account Created",
        description: `Successfully registered ${created.name}`,
        type: "success",
      });

      resetForm();
      onClose();
      onAccountCreated(created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create account";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={handleClose}
      title="Add New Account"
      subtitle="Register an account with multiple location addresses"
      widthClass="w-[740px]"
      headerRight={
        <button
          type="button"
          onClick={() => {
            const formEl = document.getElementById("create-account-form") as HTMLFormElement | null;
            if (formEl) formEl.requestSubmit();
          }}
          disabled={isSubmitting}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          {isSubmitting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
          ) : (
            <Plus className="w-3.5 h-3.5 text-black" />
          )}
          <span>Create Account</span>
        </button>
      }
    >
      <form id="create-account-form" onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Section 1: Account Overview */}
        <div className="bg-[#3A3B3C] rounded-2xl p-5 space-y-4 border-0">
          <div className="flex items-center gap-2 pb-1 border-b border-[#252728]">
            <Building2 className="w-4 h-4 text-[#C7F33C]" />
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Account Information
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Account Display Name */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300">
                Account Display Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Siam Logistics (Short name shown on cards)"
                required
                className="w-full bg-[#252728] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0 transition-colors"
              />
            </div>

            {/* Account Name */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300">
                Account / Company Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Siam Logistics Global Co., Ltd."
                required
                className="w-full bg-[#252728] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0 transition-colors"
              />
            </div>

            {/* Account Type (Moved from Contact) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#C7F33C]" />
                <span>Account Type</span>
              </label>
              <AccountTypeSelect
                value={accountType}
                onChange={setAccountType}
              />
            </div>

            {/* Account Country */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#C7F33C]" />
                <span>Country</span>
              </label>
              <CountrySelect
                value={country}
                onChange={handleAccountCountryChange}
                placeholder="Select country..."
              />
            </div>

            {/* Office Phone / Landline */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#C7F33C]" />
                  <span>Office Phone / Landline</span>
                </span>
                <span className="text-xs text-slate-400 font-normal">
                  e.g. 02 123 4567 ext. 12 or +66 2 123 4567
                </span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 02 123 4567 ext. 12"
                className="w-full bg-[#252728] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0 transition-colors"
              />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Account Notes (Optional)</span>
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Business line, payment terms, or general background..."
                className="w-full bg-[#252728] rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Multiple Addresses */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#C7F33C]" />
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Addresses ({addresses.length})
              </h4>
            </div>

            <button
              type="button"
              onClick={handleAddAddress}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Address</span>
            </button>
          </div>

          {/* List of Address Forms */}
          <div className="space-y-4">
            {addresses.map((addr, idx) => {
              const isExpanded = isAddressExpanded(addr.tempId);
              const summaryText = [
                addr.addressLine1,
                addr.subdistrict,
                addr.district,
                addr.province,
                addr.postalCode,
                addr.country,
              ]
                .filter(Boolean)
                .join(", ");

              return (
                <div
                  key={addr.tempId}
                  className={`bg-[#3A3B3C] rounded-2xl border transition-all ${
                    isExpanded
                      ? "relative z-20 border-[#C7F33C]/60"
                      : "border-[#4E4F50]/40 overflow-hidden"
                  }`}
                >
                  {/* Address Card Header (Clickable to toggle expand/collapse) */}
                  <div
                    className={`flex items-center justify-between p-4 cursor-pointer select-none transition-colors hover:bg-[#434446] ${
                      isExpanded ? "border-b border-[#252728] rounded-t-2xl" : "rounded-2xl"
                    }`}
                    onClick={() => toggleAddressExpand(addr.tempId)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-1 rounded-lg bg-[#252728] text-slate-400 hover:text-slate-200">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-300" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-300" />
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-slate-200 truncate">
                          Address #{idx + 1}
                        </span>
                        
                        <span className="text-xs text-slate-400 px-2 py-0.5 rounded-full bg-[#252728] w-fit">
                          {addr.type}
                        </span>

                        {!isExpanded && summaryText && (
                          <span className="text-xs text-slate-400 truncate max-w-xs sm:max-w-md hidden sm:inline ml-1">
                            • {summaryText}
                          </span>
                        )}
                      </div>

                      {/* Main Address Badge / Toggle */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetMainAddress(idx);
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0 ml-1 ${
                          addr.isDefault
                            ? "bg-[#C7F33C] text-black"
                            : "bg-[#252728] text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Star className={`w-3 h-3 ${addr.isDefault ? "fill-black" : ""}`} />
                        <span>{addr.isDefault ? "Main Address" : "Set as Main"}</span>
                      </button>
                    </div>

                    <div
                      className="flex items-center gap-1.5 shrink-0 ml-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Copy / Duplicate Address Button */}
                      <button
                        type="button"
                        onClick={() => handleDuplicateAddress(idx)}
                        className="px-2.5 py-1 rounded-xl text-xs font-medium text-slate-300 bg-[#252728] hover:bg-[#4E4F50] hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                        title="Duplicate this address form"
                      >
                        <Copy className="w-3 h-3 text-slate-400" />
                        <span>Copy</span>
                      </button>

                      {/* Clear / Reset Address Fields Button */}
                      <button
                        type="button"
                        onClick={() => handleClearAddress(idx)}
                        className="px-2.5 py-1 rounded-xl text-xs font-medium text-slate-300 bg-[#252728] hover:bg-[#4E4F50] hover:text-amber-300 transition-colors flex items-center gap-1 cursor-pointer"
                        title="Clear all fields in this address"
                      >
                        <RotateCcw className="w-3 h-3 text-slate-400" />
                        <span>Clear</span>
                      </button>

                      {/* Delete Address Button (if > 1) */}
                      {addresses.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAddress(idx)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                          title="Remove this address"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Address Form Body (Expandable) */}
                  {isExpanded && (
                    <div className="p-5 space-y-3.5 animate-in fade-in duration-150 rounded-b-2xl">
                      {/* Global Google Places Autocomplete */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[#C7F33C]" />
                          <span>Global Address Search (Auto-fill)</span>
                        </label>
                        <AddressAutocomplete
                          key={addr.tempId}
                          onAddressSelected={(parsed) => {
                            if (parsed.addressLine1) handleAddressChange(idx, "addressLine1", parsed.addressLine1);
                            if (parsed.subdistrict) handleAddressChange(idx, "subdistrict", parsed.subdistrict);
                            if (parsed.district) handleAddressChange(idx, "district", parsed.district);
                            if (parsed.province) handleAddressChange(idx, "province", parsed.province);
                            if (parsed.postalCode) handleAddressChange(idx, "postalCode", parsed.postalCode);
                            if (parsed.country) handleAddressChange(idx, "country", parsed.country);
                            if (parsed.googleMapsUrl) handleAddressChange(idx, "googleMapsUrl", parsed.googleMapsUrl);
                            if (parsed.title && (!addr.title || addr.title.startsWith("Headquarters") || addr.title.startsWith("Branch"))) {
                              handleAddressChange(idx, "title", parsed.title);
                            }
                            toast({ title: "Address Auto-filled", description: "Details populated from Google Places.", type: "success" });
                          }}
                          placeholder="Type business name, building, or address worldwide..."
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                        {/* Location Name */}
                        <div className="sm:col-span-2 flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-300">
                            Location Name / Branch Title
                          </label>
                          <input
                            type="text"
                            value={addr.title || ""}
                            onChange={(e) => handleAddressChange(idx, "title", e.target.value)}
                            placeholder="e.g. Headquarters, Bangna Hub"
                            className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                          />
                        </div>

                        {/* Address Type */}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-300">
                            Address Type
                          </label>
                          <AddressTypeSelect
                            value={addr.type || "HEADQUARTERS"}
                            onChange={(val) => handleAddressChange(idx, "type", val)}
                          />
                        </div>

                        {/* Branch Code */}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-300">
                            Branch Code
                          </label>
                          <input
                            type="text"
                            value={addr.branchNumber || ""}
                            onChange={(e) => handleAddressChange(idx, "branchNumber", e.target.value)}
                            placeholder="00000 or 00001"
                            className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                          />
                        </div>
                      </div>

                      {/* Tax ID & Country */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-300">
                            Tax ID
                          </label>
                          <input
                            type="text"
                            value={addr.taxId || ""}
                            onChange={(e) => handleAddressChange(idx, "taxId", e.target.value)}
                            placeholder="e.g. 0105558000000"
                            className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-300">
                            Country
                          </label>
                          <CountrySelect
                            value={addr.country || country || "Thailand"}
                            onChange={(val) => handleAddressChange(idx, "country", val)}
                            placeholder="Select Country"
                          />
                        </div>
                      </div>

                      {/* Address Line 1 */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-300">
                          Address Line 1 <span className="text-[#C7F33C]">*</span>
                        </label>
                        <input
                          type="text"
                          value={addr.addressLine1}
                          onChange={(e) => handleAddressChange(idx, "addressLine1", e.target.value)}
                          placeholder="e.g. 123 Sukhumvit Road, Building A, Floor 5"
                          className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>

                      {/* Address Line 2 */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-300">
                          Address Line 2
                        </label>
                        <input
                          type="text"
                          value={addr.addressLine2 || ""}
                          onChange={(e) => handleAddressChange(idx, "addressLine2", e.target.value)}
                          placeholder="e.g. Near BTS Asok, Soi 21"
                          className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>

                      {/* Thai Postal Subdivisions */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-300">
                            Subdistrict
                          </label>
                          <input
                            type="text"
                            value={addr.subdistrict || ""}
                            onChange={(e) => handleAddressChange(idx, "subdistrict", e.target.value)}
                            placeholder="e.g. Khlong Toei Nuea"
                            className="w-full bg-[#252728] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-300">
                            District
                          </label>
                          <input
                            type="text"
                            value={addr.district || ""}
                            onChange={(e) => handleAddressChange(idx, "district", e.target.value)}
                            placeholder="e.g. Watthana"
                            className="w-full bg-[#252728] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-300">
                            Province / State
                          </label>
                          <input
                            type="text"
                            value={addr.province || ""}
                            onChange={(e) => handleAddressChange(idx, "province", e.target.value)}
                            placeholder="e.g. Bangkok"
                            className="w-full bg-[#252728] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-300">
                            Postal Code
                          </label>
                          <input
                            type="text"
                            value={addr.postalCode || ""}
                            onChange={(e) => handleAddressChange(idx, "postalCode", e.target.value)}
                            placeholder="e.g. 10540"
                            className="w-full bg-[#252728] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                          />
                        </div>
                      </div>

                      {/* Google Maps Link */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-300">
                          Google Maps URL (Optional)
                        </label>
                        <input
                          type="url"
                          value={addr.googleMapsUrl || ""}
                          onChange={(e) => handleAddressChange(idx, "googleMapsUrl", e.target.value)}
                          placeholder="https://maps.google.com/..."
                          className="w-full bg-[#252728] rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </form>
    </SlideOverPanel>
  );
}
