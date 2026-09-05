"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CompanyAddress, ContactType } from "@prisma/client";
import { 
  Building2, 
  MapPin, 
  Save, 
  Plus, 
  Trash2, 
  Loader2, 
  Star, 
  Edit3, 
  Tag, 
  Users, 
  Briefcase, 
  Mail, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Phone, 
  History, 
  Search,
  Bot,
  Folder
} from "lucide-react";
import { SlideOverPanel, SlideOverTab } from "@/components/ui/SlideOverPanel";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { AccountTypeSelect } from "@/components/ui/AccountTypeSelect";
import { AddressTypeSelect } from "@/components/ui/AddressTypeSelect";
import { PhoneInputWithCountry } from "@/components/ui/PhoneInputWithCountry";
import { 
  getAccountOverview, 
  updateCompanyDetails, 
  createCompanyAddress, 
  updateCompanyAddress, 
  deleteCompanyAddress, 
  setDefaultCompanyAddress, 
  createContact, 
  updateContact, 
  deleteContact, 
  AccountOverviewResult 
} from "@/lib/actions/contact";
import { useDialog } from "@/providers/DialogProvider";
import { usePermissions } from "@/providers/PermissionProvider";
import { ProjectsTab } from "./ProjectsTab";
import { EmailTab } from "./EmailTab";
import { AccountAITab } from "./AccountAITab";
import { SharedMediaTab } from "@/components/pipeline/SharedMediaTab";

interface EditAccountPanelProps {
  companyId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onAccountUpdated: () => void;
  initialTab?: "account" | "contact" | "projects" | "email" | "ai_analysis" | "sharedMedia" | string;
  selectedContactId?: string | null;
  onBusinessSummaryUpdated?: (summary: string) => void;
}

const formatDateTime = (date: Date | string) => {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
};

export function EditAccountPanel({
  companyId,
  isOpen,
  onClose,
  onAccountUpdated,
  initialTab = "account",
  selectedContactId = null,
  onBusinessSummaryUpdated,
}: EditAccountPanelProps) {
  const { toast, confirm } = useDialog();

  const [isLoading, setIsLoading] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [overview, setOverview] = useState<AccountOverviewResult | null>(null);

  const { visibleRightMenus, isAdmin } = usePermissions();
  const allowedRightMenus = useMemo(() => visibleRightMenus("contact"), [visibleRightMenus]);

  // All known tabs
  const ALL_TABS: SlideOverTab[] = useMemo(
    () => [
      { key: "account", label: "Account", icon: Building2 },
      { key: "contact", label: "Contact", icon: Users },
      { key: "projects", label: "Projects", icon: Briefcase },
      { key: "email", label: "Email", icon: Mail },
      { key: "ai_analysis", label: "Account AI", icon: Bot },
      { key: "sharedMedia", label: "Shared Media", icon: Folder },
    ],
    []
  );

  // Filter tabs by department permissions
  const tabs: SlideOverTab[] = useMemo(() => {
    return ALL_TABS.filter((tab) => {
      if (isAdmin) return true;
      return allowedRightMenus.some((m) => m.key === `contact.${tab.key}`);
    });
  }, [ALL_TABS, isAdmin, allowedRightMenus]);

  const resolveTargetTab = useCallback(
    (targetTab?: string) => {
      if (targetTab && tabs.some((t) => t.key === targetTab)) {
        return targetTab;
      }
      return tabs[0]?.key || "account";
    },
    [tabs]
  );

  const [activeTab, setActiveTab] = useState<string>(() => resolveTargetTab(initialTab));

  // Sync tab only when modal opens or initialTab prop changes
  const prevIsOpenRef = useRef(false);
  const prevInitialTabRef = useRef(initialTab);

  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    const initialTabChanged = initialTab !== prevInitialTabRef.current;

    if (justOpened || (isOpen && initialTabChanged)) {
      setActiveTab(resolveTargetTab(initialTab));
    }

    prevIsOpenRef.current = isOpen;
    prevInitialTabRef.current = initialTab;
  }, [isOpen, initialTab, resolveTargetTab]);

  // If current activeTab is no longer permitted (e.g. after permissions change), fallback to first permitted tab
  if (tabs.length > 0 && !tabs.some((t) => t.key === activeTab)) {
    setActiveTab(tabs[0].key);
  }

  // Sub-tabs in Account Tab
  const [accountSubTab, setAccountSubTab] = useState<"details" | "logs">("details");
  const [accountLogSearch, setAccountLogSearch] = useState("");

  // Company Profile Form State
  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<ContactType>("CUSTOMER");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");
  const [addresses, setAddresses] = useState<CompanyAddress[]>([]);
  const [expandedAddressIds, setExpandedAddressIds] = useState<Set<string>>(new Set());

  // Person inline accordion state
  const [expandedPersonIds, setExpandedPersonIds] = useState<Set<string>>(new Set());
  const [personSubTabs, setPersonSubTabs] = useState<Record<string, "info" | "logs">>({});
  const [personForms, setPersonForms] = useState<Record<string, {
    name: string;
    role: string;
    contactDepartment: string;
    email: string;
    phone: string;
  }>>({});
  const [isSavingPersonId, setIsSavingPersonId] = useState<string | null>(null);

  // Add Person form state
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [isSavingNewPerson, setIsSavingNewPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonRole, setNewPersonRole] = useState("");
  const [newPersonDept, setNewPersonDept] = useState("");
  const [newPersonEmail, setNewPersonEmail] = useState("");
  const [newPersonPhone, setNewPersonPhone] = useState("");

  // Email tab selection
  const [selectedEmailContactId, setSelectedEmailContactId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const res = await getAccountOverview(companyId, { includeLogs: true });
      setOverview(res);
      setName(res.company.name || "");
      setDisplayName(res.company.displayName || res.company.name || "");
      setAccountType(res.company.type || "CUSTOMER");
      setCountry(res.company.country || "");
      setNotes(res.company.notes || "");
      setAddresses(res.addresses || []);

      if (res.addresses && res.addresses.length > 0) {
        const defaultAddr = res.addresses.find((a) => a.isDefault) || res.addresses[0];
        setExpandedAddressIds(new Set([defaultAddr.id]));
      }

      // Initialize person forms
      const forms: Record<string, {
        name: string;
        role: string;
        contactDepartment: string;
        email: string;
        phone: string;
      }> = {};
      res.contacts?.forEach((c) => {
        forms[c.id] = {
          name: c.name || "",
          role: c.role || "",
          contactDepartment: c.contactDepartment || "",
          email: c.email || "",
          phone: c.phone || "",
        };
      });
      setPersonForms(forms);

      if (res.contacts && res.contacts.length > 0) {
        setSelectedEmailContactId((prev) => prev || res.contacts![0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load account details";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOpen) {
        if (selectedContactId) {
          setExpandedPersonIds(new Set([selectedContactId]));
        }
        if (companyId) {
          void loadData();
        }
      } else {
        setIsAddingPerson(false);
        setExpandedPersonIds(new Set());
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, companyId, selectedContactId, loadData]);

  // Address expand/collapse
  const toggleAddressExpand = (id: string) => {
    setExpandedAddressIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Person inline expand/collapse
  const togglePersonExpand = (id: string) => {
    setExpandedPersonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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
        type: accountType,
        notes: notes.trim() || undefined,
      });
      toast({
        title: "Account Updated",
        description: "Account details saved successfully.",
        type: "success",
      });
      await loadData();
      onAccountUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update account";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsSavingDetails(false);
    }
  };

  // Address handlers
  const handleAddNewAddress = async () => {
    if (!companyId) return;
    const nextIdx = addresses.length + 1;
    try {
      const created = await createCompanyAddress(companyId, {
        title: `Address #${nextIdx}`,
        type: nextIdx === 1 ? "HEADQUARTERS" : "BRANCH",
        country: country || "Thailand",
        addressLine1: "New Address Location",
        isDefault: addresses.length === 0,
      });
      toast({ title: "Address Added", description: `Created Address #${nextIdx}.`, type: "success" });
      await loadData();
      setExpandedAddressIds((prev) => new Set(prev).add(created.id));
      onAccountUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add address";
      toast({ title: "Error", description: msg, type: "error" });
    }
  };

  const handleUpdateAddressField = (addrId: string, field: keyof CompanyAddress, val: unknown) => {
    setAddresses((prev) =>
      prev.map((a) => (a.id === addrId ? { ...a, [field]: val } : a))
    );
  };

  const handleSaveAddressCard = async (addr: CompanyAddress) => {
    if (!addr.addressLine1?.trim()) {
      return toast({ title: "Validation", description: "Address Line 1 is required", type: "warning" });
    }
    try {
      await updateCompanyAddress(addr.id, {
        title: addr.title || "Address",
        type: addr.type,
        taxId: addr.taxId || undefined,
        branchNumber: addr.branchNumber || undefined,
        addressLine1: addr.addressLine1,
        addressLine2: addr.addressLine2 || undefined,
        subdistrict: addr.subdistrict || undefined,
        district: addr.district || undefined,
        province: addr.province || undefined,
        postalCode: addr.postalCode || undefined,
        country: addr.country || "Thailand",
        googleMapsUrl: addr.googleMapsUrl || undefined,
      });
      toast({ title: "Address Saved", description: `${addr.title || "Address"} updated successfully.`, type: "success" });
      await loadData();
      onAccountUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save address";
      toast({ title: "Error", description: msg, type: "error" });
    }
  };

  const handleDuplicateAddress = async (addr: CompanyAddress) => {
    if (!companyId) return;
    const nextIdx = addresses.length + 1;
    try {
      const created = await createCompanyAddress(companyId, {
        title: `Address #${nextIdx}`,
        type: addr.type,
        taxId: addr.taxId || undefined,
        branchNumber: addr.branchNumber || undefined,
        addressLine1: addr.addressLine1,
        addressLine2: addr.addressLine2 || undefined,
        subdistrict: addr.subdistrict || undefined,
        district: addr.district || undefined,
        province: addr.province || undefined,
        postalCode: addr.postalCode || undefined,
        country: addr.country || "Thailand",
        isDefault: false,
        googleMapsUrl: addr.googleMapsUrl || undefined,
      });
      toast({ title: "Address Duplicated", description: `Created Address #${nextIdx}.`, type: "success" });
      await loadData();
      setExpandedAddressIds((prev) => new Set(prev).add(created.id));
      onAccountUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to duplicate address";
      toast({ title: "Error", description: msg, type: "error" });
    }
  };

  const handleDeleteAddress = async (addrId: string, title?: string | null) => {
    const ok = await confirm({
      title: "Delete Address?",
      description: `Are you sure you want to remove ${title || "this address"}?`,
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

  const handleSetDefaultAddress = async (addrId: string) => {
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

  // Person inline edit save
  const handleSavePersonInline = async (personId: string) => {
    const formData = personForms[personId];
    if (!formData || !formData.name.trim()) {
      return toast({ title: "Validation", description: "Person name is required", type: "warning" });
    }

    setIsSavingPersonId(personId);
    try {
      await updateContact(personId, {
        name: formData.name.trim(),
        role: formData.role.trim() || undefined,
        contactDepartment: formData.contactDepartment.trim() || undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
      });
      toast({ title: "Contact Updated", description: `Changes to ${formData.name} saved.`, type: "success" });
      await loadData();
      onAccountUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save contact";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsSavingPersonId(null);
    }
  };

  // Create new person
  const handleCreateNewPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    if (!newPersonName.trim()) {
      return toast({ title: "Validation", description: "Person name is required", type: "warning" });
    }

    setIsSavingNewPerson(true);
    try {
      const created = await createContact({
        name: newPersonName.trim(),
        role: newPersonRole.trim() || undefined,
        contactDepartment: newPersonDept.trim() || undefined,
        email: newPersonEmail.trim() || undefined,
        phone: newPersonPhone.trim() || undefined,
        companyId: companyId,
      });

      toast({
        title: "Person Added",
        description: `Successfully added ${newPersonName.trim()} to ${name}`,
        type: "success",
      });

      setNewPersonName("");
      setNewPersonRole("");
      setNewPersonDept("");
      setNewPersonEmail("");
      setNewPersonPhone("");
      setIsAddingPerson(false);

      await loadData();
      setExpandedPersonIds((prev) => new Set(prev).add(created.id));
      onAccountUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add person";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsSavingNewPerson(false);
    }
  };

  const handleDeletePerson = async (personId: string, personName: string) => {
    const ok = await confirm({
      title: "Delete Contact Person?",
      description: `Are you sure you want to delete ${personName}? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await deleteContact(personId);
      toast({ title: "Contact Deleted", description: "Contact person was removed.", type: "success" });
      setExpandedPersonIds((prev) => {
        const next = new Set(prev);
        next.delete(personId);
        return next;
      });
      await loadData();
      onAccountUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete contact";
      toast({ title: "Error", description: msg, type: "error" });
    }
  };

  const getInitials = (contactName: string) => {
    const parts = contactName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return contactName.slice(0, 2).toUpperCase();
  };

  const activeEmailContact = overview?.contacts?.find((c) => c.id === selectedEmailContactId) || overview?.contacts?.[0];

  // Filtered account logs
  const accountLogs = overview?.company?.logs || [];
  const filteredAccountLogs = accountLogSearch.trim()
    ? accountLogs.filter(
        (l) =>
          l.summary.toLowerCase().includes(accountLogSearch.toLowerCase()) ||
          l.user?.name?.toLowerCase().includes(accountLogSearch.toLowerCase())
      )
    : accountLogs;

  return (
    <SlideOverPanel
      isOpen={isOpen && !!companyId}
      onClose={onClose}
      title={name || "Edit Account"}
      subtitle={
        country
          ? `${accountType} • ${country} • ${overview?.contacts?.length || 0} Contacts`
          : `${accountType} • ${overview?.contacts?.length || 0} Contacts`
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      widthClass="w-[750px]"
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#C7F33C] animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* TAB 1: ACCOUNT (Profile + Addresses + System Log) */}
          {activeTab === "account" && (
            <div className="flex flex-col gap-5">
              {/* Account Sub-Tabs */}
              <div className="flex items-center gap-1.5 bg-[#1C1C1D] p-1.5 rounded-full w-fit">
                <button
                  type="button"
                  onClick={() => setAccountSubTab("details")}
                  className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 cursor-pointer ${
                    accountSubTab === "details"
                      ? "bg-[#3A3B3C] text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Account Details & Addresses</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAccountSubTab("logs")}
                  className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 cursor-pointer ${
                    accountSubTab === "logs"
                      ? "bg-[#3A3B3C] text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>System Log ({accountLogs.length})</span>
                </button>
              </div>

              {accountSubTab === "details" ? (
                <>
                  {/* Account Profile Card */}
                  <div className="bg-[#3A3B3C] rounded-2xl p-5 space-y-4 border-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#C7F33C]" />
                        Account Profile Details
                      </h4>

                      <button
                        type="button"
                        onClick={handleSaveCompanyDetails}
                        disabled={isSavingDetails}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        {isSavingDetails ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                        ) : (
                          <Save className="w-3.5 h-3.5 text-black" />
                        )}
                        <span>Save Account</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Display Name */}
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <label className="text-xs font-semibold text-slate-300">
                          Account Display Name <span className="text-[#C7F33C]">*</span>
                        </label>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="e.g. SB Interlab"
                          className="w-full bg-[#252728] rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>

                      {/* Name */}
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <label className="text-xs font-semibold text-slate-300">
                          Account Name <span className="text-[#C7F33C]">*</span>
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. SB Interlab Co., Ltd."
                          className="w-full bg-[#252728] rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                        />
                      </div>

                      {/* Account Type */}
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

                      {/* Country */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-300">
                          Country
                        </label>
                        <CountrySelect
                          value={country}
                          onChange={(val) => setCountry(val)}
                          placeholder="Select account country..."
                        />
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                        <span>Account Notes & Information</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          Internal account documentation
                        </span>
                      </label>
                      <textarea
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Internal account notes, commercial terms, or company information..."
                        className="w-full bg-[#252728] rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0 resize-none"
                      />
                    </div>
                  </div>

                  {/* Company Addresses Section */}
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
                        onClick={handleAddNewAddress}
                        className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Address</span>
                      </button>
                    </div>

                    {/* Address Cards List */}
                    <div className="space-y-3">
                      {addresses.length === 0 ? (
                        <div className="p-8 text-center bg-[#3A3B3C] rounded-2xl text-slate-400 text-xs">
                          No addresses registered for this account. Click &quot;Add Address&quot; to create one.
                        </div>
                      ) : (
                        addresses.map((addr, idx) => {
                          const isExpanded = expandedAddressIds.has(addr.id);
                          const summary = [
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
                              key={addr.id}
                              className={`bg-[#3A3B3C] rounded-2xl border transition-all ${
                                isExpanded
                                  ? "relative z-20 border-[#C7F33C]/60"
                                  : "border-[#4E4F50]/40 overflow-hidden"
                              }`}
                            >
                              {/* Header (Expand / Collapse) */}
                              <div
                                className={`flex items-center justify-between p-4 cursor-pointer select-none transition-colors hover:bg-[#434446] ${
                                  isExpanded ? "border-b border-[#252728] rounded-t-2xl" : "rounded-2xl"
                                }`}
                                onClick={() => toggleAddressExpand(addr.id)}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="p-1 rounded-lg bg-[#252728] text-slate-400">
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

                                    <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded-full bg-[#252728] w-fit">
                                      {addr.type}
                                    </span>

                                    {!isExpanded && summary && (
                                      <span className="text-[11px] text-slate-400 truncate max-w-xs sm:max-w-md hidden sm:inline ml-1">
                                        • {summary}
                                      </span>
                                    )}
                                  </div>

                                  {/* Main Address Star Button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!addr.isDefault) handleSetDefaultAddress(addr.id);
                                    }}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0 ml-1 ${
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
                                  <button
                                    type="button"
                                    onClick={() => handleDuplicateAddress(addr)}
                                    className="px-2.5 py-1 rounded-xl text-xs font-medium text-slate-300 bg-[#252728] hover:bg-[#4E4F50] hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                                    title="Duplicate address"
                                  >
                                    <Copy className="w-3 h-3 text-slate-400" />
                                    <span>Copy</span>
                                  </button>

                                  {addresses.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAddress(addr.id, addr.title)}
                                      className="p-1.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                                      title="Delete address"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Body Form (Inline Expansion) */}
                              {isExpanded && (
                                <div className="p-5 space-y-3.5 animate-in fade-in duration-150">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[11px] font-semibold text-slate-300">
                                        Address Type
                                      </label>
                                      <AddressTypeSelect
                                        value={addr.type}
                                        onChange={(val) =>
                                          handleUpdateAddressField(addr.id, "type", val)
                                        }
                                      />
                                    </div>

                                    <div className="flex flex-col gap-1">
                                      <label className="text-[11px] font-semibold text-slate-300">
                                        Branch Code (รหัสสาขา)
                                      </label>
                                      <input
                                        type="text"
                                        value={addr.branchNumber || ""}
                                        onChange={(e) =>
                                          handleUpdateAddressField(addr.id, "branchNumber", e.target.value)
                                        }
                                        placeholder="00000"
                                        className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                                      />
                                    </div>

                                    <div className="flex flex-col gap-1">
                                      <label className="text-[11px] font-semibold text-slate-300">
                                        Tax ID (เลขประจำตัวผู้เสียภาษี)
                                      </label>
                                      <input
                                        type="text"
                                        value={addr.taxId || ""}
                                        onChange={(e) => handleUpdateAddressField(addr.id, "taxId", e.target.value)}
                                        placeholder="e.g. 0105558000000"
                                        className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] font-semibold text-slate-300">Country</label>
                                    <CountrySelect
                                      value={addr.country || country || "Thailand"}
                                      onChange={(val) => handleUpdateAddressField(addr.id, "country", val)}
                                      placeholder="Select Country"
                                    />
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] font-semibold text-slate-300">
                                      Address Line 1 (อาคาร, บ้านเลขที่, ถนน) <span className="text-[#C7F33C]">*</span>
                                    </label>
                                    <input
                                      type="text"
                                      value={addr.addressLine1}
                                      onChange={(e) =>
                                        handleUpdateAddressField(addr.id, "addressLine1", e.target.value)
                                      }
                                      placeholder="e.g. 123 Sukhumvit Road, Building A"
                                      className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                                    />
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] font-semibold text-slate-300">
                                      Address Line 2 (ข้อมูลเพิ่มเติม)
                                    </label>
                                    <input
                                      type="text"
                                      value={addr.addressLine2 || ""}
                                      onChange={(e) =>
                                        handleUpdateAddressField(addr.id, "addressLine2", e.target.value)
                                      }
                                      placeholder="e.g. Near BTS Asok"
                                      className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                                    />
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[11px] font-semibold text-slate-300">Subdistrict</label>
                                      <input
                                        type="text"
                                        value={addr.subdistrict || ""}
                                        onChange={(e) =>
                                          handleUpdateAddressField(addr.id, "subdistrict", e.target.value)
                                        }
                                        placeholder="ตำบล/แขวง"
                                        className="w-full bg-[#252728] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 border-0"
                                      />
                                    </div>

                                    <div className="flex flex-col gap-1">
                                      <label className="text-[11px] font-semibold text-slate-300">District</label>
                                      <input
                                        type="text"
                                        value={addr.district || ""}
                                        onChange={(e) =>
                                          handleUpdateAddressField(addr.id, "district", e.target.value)
                                        }
                                        placeholder="อำเภอ/เขต"
                                        className="w-full bg-[#252728] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 border-0"
                                      />
                                    </div>

                                    <div className="flex flex-col gap-1">
                                      <label className="text-[11px] font-semibold text-slate-300">Province</label>
                                      <input
                                        type="text"
                                        value={addr.province || ""}
                                        onChange={(e) =>
                                          handleUpdateAddressField(addr.id, "province", e.target.value)
                                        }
                                        placeholder="จังหวัด"
                                        className="w-full bg-[#252728] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 border-0"
                                      />
                                    </div>

                                    <div className="flex flex-col gap-1">
                                      <label className="text-[11px] font-semibold text-slate-300">Postal Code</label>
                                      <input
                                        type="text"
                                        value={addr.postalCode || ""}
                                        onChange={(e) =>
                                          handleUpdateAddressField(addr.id, "postalCode", e.target.value)
                                        }
                                        placeholder="รหัสไปรษณีย์"
                                        className="w-full bg-[#252728] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 border-0"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-end pt-1">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveAddressCard(addr)}
                                      className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Save className="w-3.5 h-3.5 text-black" />
                                      <span>Save Address</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              ) : (
                /* Account System Log Sub-tab */
                <div className="bg-[#3A3B3C] rounded-2xl p-5 space-y-4 border-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#252728]">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-[#C7F33C]" />
                      <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                        Account System Log ({accountLogs.length})
                      </h4>
                    </div>

                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={accountLogSearch}
                        onChange={(e) => setAccountLogSearch(e.target.value)}
                        placeholder="Search logs..."
                        className="w-full bg-[#252728] rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                      />
                    </div>
                  </div>

                  {filteredAccountLogs.length === 0 ? (
                    <div className="p-8 text-center bg-[#252728] rounded-2xl text-slate-400 text-xs">
                      {accountLogSearch.trim() ? "No matching system logs." : "No system logs recorded for this account."}
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[500px] overflow-y-auto hide-scrollbar">
                      {filteredAccountLogs.map((log) => (
                        <div key={log.id} className="flex gap-3 bg-[#252728] p-3 rounded-2xl border border-[#4E4F50]/40">
                          <div className="w-8 h-8 rounded-full bg-[#3A3B3C] shrink-0 overflow-hidden mt-0.5 flex items-center justify-center">
                            {log.user?.image ? (
                              <img src={log.user.image} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold text-[#C7F33C]">
                                {(log.user?.name || "System").slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col flex-1 justify-center min-w-0">
                            <span className="text-[11px] text-slate-400 mb-0.5 font-medium">
                              <strong className="text-slate-200 font-semibold">{log.user?.name || "System"}</strong> •{" "}
                              {formatDateTime(log.createdAt)}
                            </span>
                            <p className="text-xs text-slate-300 font-medium italic whitespace-pre-wrap">
                              {log.summary}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CONTACT / PERSON (Inline Accordion + Person System Log) */}
          {activeTab === "contact" && (
            <div className="flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#3A3B3C]">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#C7F33C]" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Company Persons / Contacts ({overview?.contacts?.length || 0})
                  </h4>
                </div>

                {!isAddingPerson && (
                  <button
                    type="button"
                    onClick={() => setIsAddingPerson(true)}
                    className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Person</span>
                  </button>
                )}
              </div>

              {/* Add New Person Form */}
              {isAddingPerson && (
                <form
                  onSubmit={handleCreateNewPerson}
                  className="bg-[#3A3B3C] rounded-2xl p-5 space-y-4 border border-[#C7F33C]/40 animate-in fade-in"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-[#252728]">
                    <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                      Add New Person to {name}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setIsAddingPerson(false)}
                      className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="sm:col-span-2 flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-300">
                        Full Name <span className="text-[#C7F33C]">*</span>
                      </label>
                      <input
                        type="text"
                        value={newPersonName}
                        onChange={(e) => setNewPersonName(e.target.value)}
                        placeholder="e.g. Somchai Prasert"
                        className="w-full bg-[#252728] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-300">Role / Position</label>
                      <input
                        type="text"
                        value={newPersonRole}
                        onChange={(e) => setNewPersonRole(e.target.value)}
                        placeholder="e.g. Procurement Manager"
                        className="w-full bg-[#252728] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-300">Department</label>
                      <input
                        type="text"
                        value={newPersonDept}
                        onChange={(e) => setNewPersonDept(e.target.value)}
                        placeholder="e.g. Purchasing"
                        className="w-full bg-[#252728] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-300">Email Address</label>
                      <input
                        type="email"
                        value={newPersonEmail}
                        onChange={(e) => setNewPersonEmail(e.target.value)}
                        placeholder="e.g. somchai@company.com"
                        className="w-full bg-[#252728] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-300">Phone Number</label>
                      <PhoneInputWithCountry
                        value={newPersonPhone}
                        onChange={setNewPersonPhone}
                        placeholder="081 234 5678"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingPerson(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingNewPerson}
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingNewPerson ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                      ) : (
                        <Plus className="w-3.5 h-3.5 text-black" />
                      )}
                      <span>Create Person</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Person Cards (Inline Accordion) */}
              {(!overview?.contacts || overview.contacts.length === 0) ? (
                <div className="p-12 text-center bg-[#3A3B3C] rounded-2xl flex flex-col items-center justify-center gap-3">
                  <Users className="w-10 h-10 text-slate-600" />
                  <div>
                    <span className="text-sm font-semibold text-slate-200 block">
                      No persons registered under {name}
                    </span>
                    <span className="text-xs text-slate-400 block mt-1">
                      Click &quot;+ Add Person&quot; to add contacts to this company.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddingPerson(true)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 mt-2 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add First Person</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {overview.contacts.map((c) => {
                    const isExpanded = expandedPersonIds.has(c.id);
                    const subTab = personSubTabs[c.id] || "info";
                    const pForm = personForms[c.id] || {
                      name: c.name || "",
                      role: c.role || "",
                      contactDepartment: c.contactDepartment || "",
                      email: c.email || "",
                      phone: c.phone || "",
                    };

                    return (
                      <div
                        key={c.id}
                        className={`bg-[#3A3B3C] rounded-2xl border transition-all ${
                          isExpanded
                            ? "relative z-20 border-[#C7F33C]/60"
                            : "border-[#4E4F50]/40 overflow-hidden"
                        }`}
                      >
                        {/* Person Card Header (Clickable Accordion) */}
                        <div
                          onClick={() => togglePersonExpand(c.id)}
                          className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors hover:bg-[#434446] ${
                            isExpanded ? "border-b border-[#252728] rounded-t-2xl" : "rounded-2xl"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Avatar */}
                            <div className="w-10 h-10 rounded-full bg-[#252728] flex items-center justify-center text-xs font-bold text-[#C7F33C] shrink-0 border border-[#4E4F50]">
                              {c.image ? (
                                <img
                                  src={c.image}
                                  alt={c.name}
                                  className="w-full h-full object-cover rounded-full"
                                />
                              ) : (
                                getInitials(c.name)
                              )}
                            </div>

                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-slate-100 truncate">
                                {c.name}
                              </span>
                              <span className="text-[11px] text-slate-400 truncate">
                                {c.role || "No Role"}
                                {c.contactDepartment ? ` • ${c.contactDepartment}` : ""}
                              </span>

                              {!isExpanded && (
                                <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                                  {c.email && (
                                    <span className="flex items-center gap-1 truncate max-w-[180px]">
                                      <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                                      <span className="truncate">{c.email}</span>
                                    </span>
                                  )}
                                  {c.phone && (
                                    <span className="flex items-center gap-1 truncate">
                                      <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                                      <span>{c.phone}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-1.5 shrink-0 ml-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => togglePersonExpand(c.id)}
                              className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-200 bg-[#252728] hover:bg-[#4E4F50] transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>{isExpanded ? "Collapse" : "Edit"}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeletePerson(c.id, c.name)}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                              title="Delete Person"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Person Expanded Body (Inline Editor & System Log) */}
                        {isExpanded && (
                          <div className="p-5 space-y-4 animate-in fade-in duration-150 bg-[#2d2e30] rounded-b-2xl">
                            {/* Sub-tabs: Edit Info vs System Log */}
                            <div className="flex items-center gap-1.5 bg-[#1C1C1D] p-1.5 rounded-full w-fit">
                              <button
                                type="button"
                                onClick={() =>
                                  setPersonSubTabs((prev) => ({ ...prev, [c.id]: "info" }))
                                }
                                className={`px-3.5 py-1 text-xs font-semibold rounded-full transition-colors cursor-pointer ${
                                  subTab === "info"
                                    ? "bg-[#3A3B3C] text-white"
                                    : "text-slate-400 hover:text-slate-200"
                                }`}
                              >
                                Edit Information
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPersonSubTabs((prev) => ({ ...prev, [c.id]: "logs" }))
                                }
                                className={`px-3.5 py-1 text-xs font-semibold rounded-full transition-colors flex items-center gap-1.5 cursor-pointer ${
                                  subTab === "logs"
                                    ? "bg-[#3A3B3C] text-white"
                                    : "text-slate-400 hover:text-slate-200"
                                }`}
                              >
                                <History className="w-3 h-3" />
                                <span>System Log ({c.logs?.length || 0})</span>
                              </button>
                            </div>

                            {subTab === "info" ? (
                              /* Sub-tab 1: Form Fields */
                              <div className="space-y-3.5 pt-1">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="sm:col-span-2 flex flex-col gap-1">
                                    <label className="text-[11px] font-semibold text-slate-300">
                                      Full Name <span className="text-[#C7F33C]">*</span>
                                    </label>
                                    <input
                                      type="text"
                                      value={pForm.name}
                                      onChange={(e) =>
                                        setPersonForms((prev) => ({
                                          ...prev,
                                          [c.id]: { ...pForm, name: e.target.value },
                                        }))
                                      }
                                      className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                                    />
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] font-semibold text-slate-300">
                                      Role / Position
                                    </label>
                                    <input
                                      type="text"
                                      value={pForm.role}
                                      onChange={(e) =>
                                        setPersonForms((prev) => ({
                                          ...prev,
                                          [c.id]: { ...pForm, role: e.target.value },
                                        }))
                                      }
                                      className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                                    />
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] font-semibold text-slate-300">
                                      Department
                                    </label>
                                    <input
                                      type="text"
                                      value={pForm.contactDepartment}
                                      onChange={(e) =>
                                        setPersonForms((prev) => ({
                                          ...prev,
                                          [c.id]: { ...pForm, contactDepartment: e.target.value },
                                        }))
                                      }
                                      className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                                    />
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] font-semibold text-slate-300">
                                      Email Address
                                    </label>
                                    <input
                                      type="email"
                                      value={pForm.email}
                                      onChange={(e) =>
                                        setPersonForms((prev) => ({
                                          ...prev,
                                          [c.id]: { ...pForm, email: e.target.value },
                                        }))
                                      }
                                      className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                                    />
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] font-semibold text-slate-300">
                                      Phone Number
                                    </label>
                                    <PhoneInputWithCountry
                                      value={pForm.phone}
                                      onChange={(val) =>
                                        setPersonForms((prev) => ({
                                          ...prev,
                                          [c.id]: { ...pForm, phone: val },
                                        }))
                                      }
                                      placeholder="081 234 5678"
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => togglePersonExpand(c.id)}
                                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                                  >
                                    Close
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSavePersonInline(c.id)}
                                    disabled={isSavingPersonId === c.id}
                                    className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                  >
                                    {isSavingPersonId === c.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                                    ) : (
                                      <Save className="w-3.5 h-3.5 text-black" />
                                    )}
                                    <span>Save Changes</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Sub-tab 2: Person System Log */
                              <div className="space-y-3 pt-1">
                                {(!c.logs || c.logs.length === 0) ? (
                                  <div className="p-6 text-center bg-[#252728] rounded-xl text-slate-400 text-xs">
                                    No system logs recorded for this person.
                                  </div>
                                ) : (
                                  <div className="space-y-2.5 max-h-[350px] overflow-y-auto hide-scrollbar">
                                    {c.logs.map((log) => (
                                      <div
                                        key={log.id}
                                        className="flex gap-3 bg-[#252728] p-3 rounded-xl border border-[#4E4F50]/40"
                                      >
                                        <div className="w-7 h-7 rounded-full bg-[#3A3B3C] shrink-0 overflow-hidden mt-0.5 flex items-center justify-center">
                                          {log.user?.image ? (
                                            <img
                                              src={log.user.image}
                                              alt="Avatar"
                                              className="w-full h-full object-cover"
                                            />
                                          ) : (
                                            <span className="text-[10px] font-bold text-[#C7F33C]">
                                              {(log.user?.name || "System").slice(0, 2).toUpperCase()}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex flex-col flex-1 justify-center min-w-0">
                                          <span className="text-[10px] text-slate-400 mb-0.5 font-medium">
                                            <strong className="text-slate-200 font-semibold">
                                              {log.user?.name || "System"}
                                            </strong>{" "}
                                            • {formatDateTime(log.createdAt)}
                                          </span>
                                          <p className="text-xs text-slate-300 font-medium italic whitespace-pre-wrap">
                                            {log.summary}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PROJECTS (Company pipeline opportunities) */}
          {activeTab === "projects" && (
            <div className="flex flex-col gap-4">
              <ProjectsTab
                companyName={name}
                opportunities={overview?.deals || []}
                maskedOpportunityCount={0}
              />
            </div>
          )}

          {/* TAB 4: EMAIL (Compose & Communications) */}
          {activeTab === "email" && (
            <div className="flex flex-col gap-4">
              {/* Recipient Person Picker */}
              {overview?.contacts && overview.contacts.length > 1 && (
                <div className="flex items-center gap-2 p-3 bg-[#3A3B3C] rounded-xl text-xs">
                  <span className="text-slate-400 font-medium">Recipient Person:</span>
                  <select
                    value={selectedEmailContactId || ""}
                    onChange={(e) => setSelectedEmailContactId(e.target.value)}
                    className="bg-[#252728] text-slate-100 rounded-lg px-3 py-1.5 border-0 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] cursor-pointer"
                  >
                    {overview.contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.email ? `(${c.email})` : "(No email)"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <EmailTab
                customerName={activeEmailContact?.name || name}
                customerEmail={activeEmailContact?.email || null}
              />
            </div>
          )}

          {/* TAB 5: ACCOUNT AI ANALYSIS (Unified Right-Menu AI Summary) */}
          {activeTab === "ai_analysis" && (
            <AccountAITab
              companyId={companyId}
              companyName={name}
              companyType={accountType}
              country={country}
              onAnalysisUpdated={() => {
                onAccountUpdated();
              }}
              onBusinessSummaryUpdated={(newSummary) => {
                onBusinessSummaryUpdated?.(newSummary);
              }}
            />
          )}

          {/* TAB 6: SHARED MEDIA (Company pipeline opportunities shared media & links) */}
          {activeTab === "sharedMedia" && companyId && (
            <SharedMediaTab
              companyId={companyId}
              groupByDeal={true}
            />
          )}
        </div>
      )}
    </SlideOverPanel>
  );
}
