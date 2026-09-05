"use client";

import { useState, useEffect, useCallback } from "react";
import { CompanyAddress } from "@prisma/client";
import { 
  Building2, 
  MapPin, 
  X, 
  Save, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Loader2, 
  Star,
  Edit3
} from "lucide-react";
import { 
  getAccountOverview, 
  updateCompanyDetails, 
  createCompanyAddress, 
  updateCompanyAddress, 
  deleteCompanyAddress, 
  setDefaultCompanyAddress,
  CreateCompanyAddressInput
} from "@/lib/actions/contact";
import { useDialog } from "@/providers/DialogProvider";
import { AddressTypeSelect } from "@/components/ui/AddressTypeSelect";

interface EditAccountModalProps {
  companyId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onAccountUpdated: () => void;
}

export function EditAccountModal({
  companyId,
  isOpen,
  onClose,
  onAccountUpdated,
}: EditAccountModalProps) {
  const { toast, confirm } = useDialog();

  const [isLoading, setIsLoading] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Company Form State
  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");
  const [addresses, setAddresses] = useState<CompanyAddress[]>([]);

  // Address sub-form state
  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [isSavingAddress, setIsSavingAddress] = useState(false);

  const initialAddressForm: CreateCompanyAddressInput = {
    title: "",
    type: "BILLING",
    taxId: "",
    branchNumber: "00000",
    addressLine1: "",
    addressLine2: "",
    subdistrict: "",
    district: "",
    province: "",
    postalCode: "",
    country: "Thailand",
    isDefault: false,
    googleMapsUrl: "",
  };
  const [addrForm, setAddrForm] = useState<CreateCompanyAddressInput>(initialAddressForm);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const res = await getAccountOverview(companyId, { includeAddresses: true, includeLogs: true });
      setDisplayName(res.company.displayName || res.company.name || "");
      setName(res.company.name || "");
      setCountry(res.company.country || "");
      setNotes(res.company.notes || "");
      setAddresses(res.addresses || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load account details";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [companyId, toast]);

  // Load account data when modal opens
  useEffect(() => {
    if (isOpen && companyId) {
      const timer = setTimeout(() => {
        void loadData();
      }, 0);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        setIsAddressFormOpen(false);
        setEditingAddressId(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, companyId, loadData]);

  const handleSaveCompanyDetails = async () => {
    if (!companyId) return;
    if (!displayName.trim()) {
      return toast({ title: "Validation", description: "Account display name is required", type: "warning" });
    }
    if (!name.trim()) {
      return toast({ title: "Validation", description: "Account name is required", type: "warning" });
    }

    setIsSavingDetails(true);
    try {
      await updateCompanyDetails(companyId, {
        displayName: displayName.trim(),
        name: name.trim(),
        country: country.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast({
        title: "Account Updated",
        description: "Account details saved successfully.",
        type: "success",
      });
      onAccountUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update account";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleOpenAddAddress = () => {
    setEditingAddressId(null);
    setAddrForm({
      ...initialAddressForm,
      isDefault: addresses.length === 0, // auto default if first address
    });
    setIsAddressFormOpen(true);
  };

  const handleOpenEditAddress = (addr: CompanyAddress) => {
    setEditingAddressId(addr.id);
    setAddrForm({
      title: addr.title || "",
      type: addr.type || "BILLING",
      taxId: addr.taxId || "",
      branchNumber: addr.branchNumber || "",
      addressLine1: addr.addressLine1 || "",
      addressLine2: addr.addressLine2 || "",
      subdistrict: addr.subdistrict || "",
      district: addr.district || "",
      province: addr.province || "",
      postalCode: addr.postalCode || "",
      country: addr.country || "Thailand",
      isDefault: addr.isDefault || false,
      googleMapsUrl: addr.googleMapsUrl || "",
    });
    setIsAddressFormOpen(true);
  };

  const handleSaveAddress = async () => {
    if (!companyId) return;
    if (!addrForm.addressLine1.trim()) {
      return toast({ title: "Validation", description: "Address Line 1 is required", type: "warning" });
    }

    setIsSavingAddress(true);
    try {
      if (editingAddressId) {
        await updateCompanyAddress(editingAddressId, addrForm);
        toast({ title: "Address Updated", description: "Address saved successfully.", type: "success" });
      } else {
        await createCompanyAddress(companyId, addrForm);
        toast({ title: "Address Created", description: "New address added to account.", type: "success" });
      }
      setIsAddressFormOpen(false);
      setEditingAddressId(null);
      await loadData();
      onAccountUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save address";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (addrId: string, title?: string | null) => {
    const ok = await confirm({
      title: "Delete Address?",
      description: `Are you sure you want to remove address "${title || "Address"}"?`,
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await deleteCompanyAddress(addrId);
      toast({ title: "Address Deleted", description: "Address was removed.", type: "success" });
      await loadData();
      onAccountUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete address";
      toast({ title: "Error", description: msg, type: "error" });
    }
  };

  const handleSetDefault = async (addrId: string) => {
    if (!companyId) return;
    try {
      await setDefaultCompanyAddress(companyId, addrId);
      toast({ title: "Default Set", description: "Primary address updated.", type: "success" });
      await loadData();
      onAccountUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to set default address";
      toast({ title: "Error", description: msg, type: "error" });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div 
        className="bg-[#1C1C1D] w-full max-w-3xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col border-0 animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-16 px-6 flex items-center justify-between shrink-0 bg-[#252728]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#3A3B3C] flex items-center justify-center">
              <Building2 className="w-5 h-5 text-[#C7F33C]" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">
                Edit Account & Addresses
              </h3>
              <span className="text-xs text-slate-400">
                Manage account profile, tax details and multiple locations
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#3A3B3C] text-slate-400 hover:text-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-[#C7F33C] animate-spin" />
            </div>
          ) : (
            <>
              {/* SECTION 1: ACCOUNT GENERAL INFO */}
              <div className="bg-[#252728] rounded-2xl p-5 space-y-4 border-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#C7F33C]" />
                    Account Profile
                  </h4>
                  <button
                    type="button"
                    onClick={handleSaveCompanyDetails}
                    disabled={isSavingDetails}
                    className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSavingDetails ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>Save Profile</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Display Name */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Account Display Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. SB Interlab"
                      className="w-full bg-[#3A3B3C] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                    />
                  </div>

                  {/* Name */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Account Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. SB Interlab Co., Ltd."
                      className="w-full bg-[#3A3B3C] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                    />
                  </div>

                  {/* Country */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Country
                    </label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="e.g. Thailand, Vietnam, Japan"
                      className="w-full bg-[#3A3B3C] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                    />
                  </div>
                </div>

                {/* Notes / Legacy Migration Archive */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Account Notes & Information</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      Includes preserved legacy records
                    </span>
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Internal account notes, commercial terms, or legacy details..."
                    className="w-full bg-[#3A3B3C] rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0 resize-none"
                  />
                </div>
              </div>

              {/* SECTION 2: MULTIPLE CRM ADDRESSES */}
              <div className="bg-[#252728] rounded-2xl p-5 space-y-4 border-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#C7F33C]" />
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Structured Addresses ({addresses.length})
                    </h4>
                  </div>
                  {!isAddressFormOpen && (
                    <button
                      type="button"
                      onClick={handleOpenAddAddress}
                      className="px-3 py-1 rounded-full text-xs font-bold bg-[#3A3B3C] text-slate-200 hover:bg-[#C7F33C] hover:text-black transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Address</span>
                    </button>
                  )}
                </div>

                {/* Address Form (Inline) */}
                {isAddressFormOpen && (
                  <div className="bg-[#1C1C1D] rounded-2xl p-4.5 space-y-3.5 border-0">
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-xs font-bold text-slate-200">
                        {editingAddressId ? "Edit Address" : "Add New Address"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAddressFormOpen(false)}
                        className="text-xs text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {/* Title */}
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Address Title / Branch Name
                        </label>
                        <input
                          type="text"
                          value={addrForm.title || ""}
                          onChange={(e) => setAddrForm((p) => ({ ...p, title: e.target.value }))}
                          placeholder="e.g. Headquarters, Rayong Plant"
                          className="w-full bg-[#252728] rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>

                      {/* Type */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Address Type
                        </label>
                        <AddressTypeSelect
                          value={addrForm.type}
                          onChange={(val) => setAddrForm((p) => ({ ...p, type: val }))}
                        />
                      </div>

                      {/* Branch Code */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Branch Code (รหัสสาขา)
                        </label>
                        <input
                          type="text"
                          value={addrForm.branchNumber || ""}
                          onChange={(e) => setAddrForm((p) => ({ ...p, branchNumber: e.target.value }))}
                          placeholder="e.g. 00000"
                          className="w-full bg-[#252728] rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Tax ID */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Tax ID (เลขประจำตัวผู้เสียภาษี)
                        </label>
                        <input
                          type="text"
                          value={addrForm.taxId || ""}
                          onChange={(e) => setAddrForm((p) => ({ ...p, taxId: e.target.value }))}
                          placeholder="e.g. 0105558123456"
                          className="w-full bg-[#252728] rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>

                      {/* Google Maps URL */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Google Maps URL (Optional)
                        </label>
                        <input
                          type="url"
                          value={addrForm.googleMapsUrl || ""}
                          onChange={(e) => setAddrForm((p) => ({ ...p, googleMapsUrl: e.target.value }))}
                          placeholder="https://maps.google.com/..."
                          className="w-full bg-[#252728] rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>
                    </div>

                    {/* Address Line 1 & Line 2 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Address Line 1 <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={addrForm.addressLine1}
                          onChange={(e) => setAddrForm((p) => ({ ...p, addressLine1: e.target.value }))}
                          placeholder="Building, House No, Street"
                          className="w-full bg-[#252728] rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Address Line 2
                        </label>
                        <input
                          type="text"
                          value={addrForm.addressLine2 || ""}
                          onChange={(e) => setAddrForm((p) => ({ ...p, addressLine2: e.target.value }))}
                          placeholder="Soi, Floor, Room"
                          className="w-full bg-[#252728] rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>
                    </div>

                    {/* Sub-district, District, Province, Postal Code */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Subdistrict (ตำบล/แขวง)
                        </label>
                        <input
                          type="text"
                          value={addrForm.subdistrict || ""}
                          onChange={(e) => setAddrForm((p) => ({ ...p, subdistrict: e.target.value }))}
                          placeholder="e.g. สีลม"
                          className="w-full bg-[#252728] rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          District (อำเภอ/เขต)
                        </label>
                        <input
                          type="text"
                          value={addrForm.district || ""}
                          onChange={(e) => setAddrForm((p) => ({ ...p, district: e.target.value }))}
                          placeholder="e.g. บางรัก"
                          className="w-full bg-[#252728] rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Province (จังหวัด)
                        </label>
                        <input
                          type="text"
                          value={addrForm.province || ""}
                          onChange={(e) => setAddrForm((p) => ({ ...p, province: e.target.value }))}
                          placeholder="e.g. กรุงเทพมหานคร"
                          className="w-full bg-[#252728] rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Postal Code
                        </label>
                        <input
                          type="text"
                          value={addrForm.postalCode || ""}
                          onChange={(e) => setAddrForm((p) => ({ ...p, postalCode: e.target.value }))}
                          placeholder="e.g. 10500"
                          className="w-full bg-[#252728] rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>
                    </div>

                    {/* Default Checkbox & Action Buttons */}
                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={!!addrForm.isDefault}
                          onChange={(e) => setAddrForm((p) => ({ ...p, isDefault: e.target.checked }))}
                          className="w-4 h-4 rounded bg-[#252728] text-[#C7F33C] focus:ring-0 border-0"
                        />
                        <span>Set as Default Address</span>
                      </label>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsAddressFormOpen(false)}
                          className="px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-400 hover:text-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveAddress}
                          disabled={isSavingAddress}
                          className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {isSavingAddress && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>Save Address</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Address Cards List */}
                {addresses.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs bg-[#1C1C1D] rounded-xl">
                    No structured addresses registered yet. Click &quot;Add Address&quot; above.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {addresses.map((addr) => (
                      <div
                        key={addr.id}
                        className={`bg-[#1C1C1D] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                          addr.isDefault ? "ring-1 ring-[#C7F33C]/40" : ""
                        }`}
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-slate-100">
                              {addr.title || "Address"}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#3A3B3C] text-slate-300 uppercase">
                              {addr.type}
                            </span>
                            {addr.isDefault && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C7F33C]/20 text-[#C7F33C] flex items-center gap-1">
                                <Star className="w-2.5 h-2.5 fill-current" />
                                Primary
                              </span>
                            )}
                            {addr.branchNumber && (
                              <span className="text-[10px] text-slate-400">
                                สาขา {addr.branchNumber}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed">
                            {addr.formattedAddress || addr.addressLine1}
                          </p>

                          {addr.taxId && (
                            <span className="text-[11px] text-slate-400 block font-mono">
                              Tax ID: {addr.taxId}
                            </span>
                          )}
                        </div>

                        {/* Action buttons & Google Maps link */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {addr.googleMapsUrl && (
                            <a
                              href={addr.googleMapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#252728] text-slate-200 hover:text-[#C7F33C] transition-colors flex items-center gap-1.5"
                              title="Open in Google Maps"
                            >
                              <MapPin className="w-3.5 h-3.5 text-[#C7F33C]" />
                              <span>Google Maps</span>
                              <ExternalLink className="w-3 h-3 text-slate-500" />
                            </a>
                          )}

                          {!addr.isDefault && (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(addr.id)}
                              className="p-1.5 rounded-lg bg-[#252728] text-slate-400 hover:text-slate-100 transition-colors text-xs"
                              title="Set as Primary Address"
                            >
                              <Star className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenEditAddress(addr)}
                            className="p-1.5 rounded-lg bg-[#252728] text-slate-400 hover:text-slate-100 transition-colors text-xs"
                            title="Edit Address"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteAddress(addr.id, addr.title)}
                            className="p-1.5 rounded-lg bg-[#252728] text-slate-500 hover:text-red-400 transition-colors text-xs"
                            title="Delete Address"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="h-16 px-6 flex items-center justify-end gap-3 shrink-0 bg-[#252728]">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full text-xs font-semibold text-slate-400 hover:text-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

