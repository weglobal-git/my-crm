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
  Folder,
  Sparkles,
  ExternalLink
} from "lucide-react";
import { SlideOverPanel, SlideOverTab } from "@/components/ui/SlideOverPanel";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { AccountTypeSelect } from "@/components/ui/AccountTypeSelect";
import { AddressTypeSelect } from "@/components/ui/AddressTypeSelect";
import { AddressAutocomplete } from "@/components/contact/AddressAutocomplete";
import type { ParsedAddressResult } from "@/lib/actions/places";
import { PhoneInputWithCountry } from "@/components/ui/PhoneInputWithCountry";
import { EmailInput, isValidEmail } from "@/components/ui/EmailInput";
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
  AccountOverviewResult,
  CompanyMasterItem
} from "@/lib/actions/contact";
import { useDialog } from "@/providers/DialogProvider";
import { usePermissions } from "@/providers/PermissionProvider";
import dynamic from "next/dynamic";
import { ProjectsTab } from "./ProjectsTab";
import { EmailTab } from "./EmailTab";

const AccountAITab = dynamic(() => import("./AccountAITab").then((m) => m.AccountAITab), {
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-[#C7F33C] animate-spin" />
    </div>
  ),
  ssr: false,
});

const SharedMediaTab = dynamic(() => import("@/components/pipeline/SharedMediaTab").then((m) => m.SharedMediaTab), {
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-[#C7F33C] animate-spin" />
    </div>
  ),
  ssr: false,
});

interface EditAccountPanelProps {
  companyId: string | null;
  initialOverview?: AccountOverviewResult | null;
  isOpen: boolean;
  onClose: () => void;
  onAccountUpdated: (updatedCompany?: Partial<CompanyMasterItem>) => void;
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

const buildPersonForms = (contacts?: AccountOverviewResult['contacts']) => {
  const forms: Record<string, {
    name: string;
    role: string;
    contactDepartment: string;
    email: string;
    phone: string;
    emails: string[];
    phones: string[];
  }> = {};
  contacts?.forEach((c) => {
    const hasEmails = Array.isArray(c.emails);
    const emails = hasEmails && c.emails.length > 0 
      ? [...c.emails] 
      : (hasEmails && c.emails.length === 0 ? [""] : (c.email ? [c.email] : [""]));
    const hasPhones = Array.isArray(c.phones);
    const phones = hasPhones && c.phones.length > 0 
      ? [...c.phones] 
      : (hasPhones && c.phones.length === 0 ? [""] : (c.phone ? [c.phone] : [""]));
    forms[c.id] = {
      name: c.name || "",
      role: c.role || "",
      contactDepartment: c.contactDepartment || "",
      email: emails[0] || "",
      phone: phones[0] || "",
      emails,
      phones,
    };
  });
  return forms;
};

export function EditAccountPanel({
  companyId,
  initialOverview = null,
  isOpen,
  onClose,
  onAccountUpdated,
  initialTab = "account",
  selectedContactId = null,
  onBusinessSummaryUpdated,
}: EditAccountPanelProps) {
  const { toast, confirm } = useDialog();

  const isInitialMatch = Boolean(initialOverview && companyId && initialOverview.company.id === companyId);
  const [isLoading, setIsLoading] = useState(!isInitialMatch);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [overview, setOverview] = useState<AccountOverviewResult | null>(() => isInitialMatch ? initialOverview : null);

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
  const [displayName, setDisplayName] = useState(() => isInitialMatch && initialOverview ? (initialOverview.company.displayName || initialOverview.company.name || "") : "");
  const [name, setName] = useState(() => isInitialMatch && initialOverview ? (initialOverview.company.name || "") : "");
  const [phone, setPhone] = useState(() => isInitialMatch && initialOverview ? (initialOverview.company.phone || "") : "");
  const [accountType, setAccountType] = useState<ContactType>(() => isInitialMatch && initialOverview ? (initialOverview.company.type || "CUSTOMER") : "CUSTOMER");
  const [country, setCountry] = useState(() => isInitialMatch && initialOverview ? (initialOverview.company.country || "") : "");
  const [notes, setNotes] = useState(() => isInitialMatch && initialOverview ? (initialOverview.company.notes || "") : "");
  const [addresses, setAddresses] = useState<CompanyAddress[]>(() => isInitialMatch && initialOverview ? (initialOverview.addresses || []) : []);
  const [expandedAddressIds, setExpandedAddressIds] = useState<Set<string>>(() => {
    if (isInitialMatch && initialOverview?.addresses && initialOverview.addresses.length > 0) {
      const defaultAddr = initialOverview.addresses.find((a) => a.isDefault) || initialOverview.addresses[0];
      return new Set([defaultAddr.id]);
    }
    return new Set();
  });

  // Person inline accordion state
  const [expandedPersonIds, setExpandedPersonIds] = useState<Set<string>>(() => {
    if (selectedContactId) return new Set([selectedContactId]);
    return new Set();
  });
  const [personSubTabs, setPersonSubTabs] = useState<Record<string, "info" | "logs">>({});
  const [personForms, setPersonForms] = useState<Record<string, {
    name: string;
    role: string;
    contactDepartment: string;
    email: string;
    phone: string;
    emails: string[];
    phones: string[];
  }>>(() => isInitialMatch && initialOverview ? buildPersonForms(initialOverview.contacts) : {});
  const [isSavingPersonId, setIsSavingPersonId] = useState<string | null>(null);

  // Add Person form state
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [isSavingNewPerson, setIsSavingNewPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonRole, setNewPersonRole] = useState("");
  const [newPersonDept, setNewPersonDept] = useState("");
  const [newPersonEmails, setNewPersonEmails] = useState<string[]>([""]);
  const [newPersonPhones, setNewPersonPhones] = useState<string[]>([""]);

  // In-memory draft address state (not saved until explicitly confirmed)
  const [draftAddress, setDraftAddress] = useState<Partial<CompanyAddress> | null>(null);
  const isSavingDraftRef = useRef(false);
  const [isSavingDraftAddress, setIsSavingDraftAddress] = useState(false);
  const [savingAddressId, setSavingAddressId] = useState<string | null>(null);

  // Email tab selection
  const [selectedEmailContactId, setSelectedEmailContactId] = useState<string | null>(() => {
    if (isInitialMatch && initialOverview?.contacts && initialOverview.contacts.length > 0) {
      return initialOverview.contacts[0].id;
    }
    return null;
  });

  const applyOverviewData = useCallback((res: AccountOverviewResult) => {
    setOverview(res);
    setName(res.company.name || "");
    setDisplayName(res.company.displayName || res.company.name || "");
    setPhone(res.company.phone || "");
    setAccountType(res.company.type || "CUSTOMER");
    setCountry(res.company.country || "");
    setNotes(res.company.notes || "");
    setAddresses(res.addresses || []);

    if (res.addresses && res.addresses.length > 0) {
      const defaultAddr = res.addresses.find((a) => a.isDefault) || res.addresses[0];
      setExpandedAddressIds((prev) => prev.size > 0 ? prev : new Set([defaultAddr.id]));
    }

    setPersonForms(buildPersonForms(res.contacts));

    if (res.contacts && res.contacts.length > 0) {
      setSelectedEmailContactId((prev) => prev || res.contacts![0].id);
    }
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!companyId) return;
    if (!silent) setIsLoading(true);
    try {
      const res = await getAccountOverview(companyId, { includeAddresses: true, includeLogs: false });
      applyOverviewData(res);
    } catch (err: unknown) {
      if (!silent) {
        const msg = err instanceof Error ? err.message : "Failed to load account details";
        toast({ title: "Error", description: msg, type: "error" });
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [companyId, applyOverviewData, toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isOpen) {
        setIsAddingPerson(false);
        setExpandedPersonIds(new Set());
        return;
      }

      if (selectedContactId) {
        setExpandedPersonIds(new Set([selectedContactId]));
      }

      if (!companyId) return;

      // Direct Object Passing (0ms instant render):
      // If initialOverview matches current companyId, apply it immediately without full-panel loading!
      if (initialOverview && initialOverview.company.id === companyId) {
        applyOverviewData(initialOverview);
        setIsLoading(false);
        // Silently fetch complete details (including addresses and full logs) in the background
        // so tabs like Address and Logs are fully populated without blocking the 0ms panel open
        void loadData(true);
        return;
      }

      void loadData(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, companyId, selectedContactId, initialOverview, applyOverviewData, loadData]);

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
        phone: phone.trim() || null,
        country: country.trim() || undefined,
        type: accountType,
        notes: notes.trim() || undefined,
      });
      toast({
        title: "Account Updated",
        description: "Account details saved successfully.",
        type: "success",
      });
      setOverview((prev) => prev ? {
        ...prev,
        company: {
          ...prev.company,
          name: name.trim(),
          displayName: displayName.trim(),
          phone: phone.trim() || null,
          country: country.trim() || null,
          type: accountType,
          notes: notes.trim() || null,
        }
      } : prev);
      onAccountUpdated({
        name: name.trim(),
        displayName: displayName.trim(),
        country: country.trim() || null,
        type: accountType,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update account";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsSavingDetails(false);
    }
  };

  // Address handlers
  const handleAddNewAddress = () => {
    if (draftAddress) return;
    const nextIdx = addresses.length + 1;
    setDraftAddress({
      title: `Address #${nextIdx}`,
      type: nextIdx === 1 ? "HEADQUARTERS" : "BRANCH",
      country: country || "Thailand",
      addressLine1: "",
      addressLine2: "",
      subdistrict: "",
      district: "",
      province: "",
      postalCode: "",
      googleMapsUrl: "",
      isDefault: addresses.length === 0,
    });
  };

  const handleSaveDraftAddress = async () => {
    if (!companyId || !draftAddress) return;
    if (isSavingDraftRef.current) return;
    const addrLine1 = draftAddress.addressLine1?.trim();
    if (!addrLine1) {
      return toast({ title: "Validation", description: "Address Line 1 is required", type: "warning" });
    }

    isSavingDraftRef.current = true;
    setIsSavingDraftAddress(true);

    const nextIdx = addresses.length + 1;
    const draftSnapshot = { ...draftAddress };
    const tempId = `temp_addr_${Date.now()}`;
    const shouldBeDefault = addresses.length === 0 || Boolean(draftSnapshot.isDefault);

    const optimisticAddr: CompanyAddress = {
      id: tempId,
      companyId,
      title: draftSnapshot.title || `Address #${nextIdx}`,
      type: draftSnapshot.type || (nextIdx === 1 ? "HEADQUARTERS" : "BRANCH"),
      taxId: draftSnapshot.taxId || null,
      branchNumber: draftSnapshot.branchNumber || null,
      addressLine1: addrLine1,
      addressLine2: draftSnapshot.addressLine2?.trim() || null,
      subdistrict: draftSnapshot.subdistrict?.trim() || null,
      district: draftSnapshot.district?.trim() || null,
      province: draftSnapshot.province?.trim() || null,
      postalCode: draftSnapshot.postalCode?.trim() || null,
      country: draftSnapshot.country || country || "Thailand",
      googleMapsUrl: draftSnapshot.googleMapsUrl?.trim() || null,
      formattedAddress: [
        addrLine1,
        draftSnapshot.addressLine2?.trim(),
        draftSnapshot.subdistrict?.trim(),
        draftSnapshot.district?.trim(),
        draftSnapshot.province?.trim(),
        draftSnapshot.postalCode?.trim(),
        draftSnapshot.country || country || "Thailand",
      ]
        .filter(Boolean)
        .join(" "),
      isDefault: shouldBeDefault,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Instant optimistic update (<5ms): close draft form and show card immediately
    setDraftAddress(null);
    setAddresses((prev) => {
      const list = shouldBeDefault ? prev.map((a) => ({ ...a, isDefault: false })) : prev;
      return [...list, optimisticAddr];
    });
    setExpandedAddressIds((prev) => new Set(prev).add(tempId));

    try {
      const created = await createCompanyAddress(companyId, {
        title: optimisticAddr.title || undefined,
        type: optimisticAddr.type,
        taxId: optimisticAddr.taxId || undefined,
        branchNumber: optimisticAddr.branchNumber || undefined,
        addressLine1: optimisticAddr.addressLine1,
        addressLine2: optimisticAddr.addressLine2 || undefined,
        subdistrict: optimisticAddr.subdistrict || undefined,
        district: optimisticAddr.district || undefined,
        province: optimisticAddr.province || undefined,
        postalCode: optimisticAddr.postalCode || undefined,
        country: optimisticAddr.country || undefined,
        googleMapsUrl: optimisticAddr.googleMapsUrl || undefined,
        isDefault: shouldBeDefault,
      });

      // Replace optimistic temp ID with server ID
      setAddresses((prev) =>
        prev.map((a) => (a.id === tempId ? created : a))
      );
      setExpandedAddressIds((prev) => {
        const next = new Set(prev);
        next.delete(tempId);
        next.add(created.id);
        return next;
      });

      toast({ title: "Address Created", description: `Added ${created.title} successfully.`, type: "success" });
      onAccountUpdated();
    } catch (err: unknown) {
      // Revert on error
      setAddresses((prev) => prev.filter((a) => a.id !== tempId));
      setDraftAddress(draftSnapshot);
      const msg = err instanceof Error ? err.message : "Failed to add address";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      isSavingDraftRef.current = false;
      setIsSavingDraftAddress(false);
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
    setSavingAddressId(addr.id);
    const previous = addresses;
    try {
      const updated = await updateCompanyAddress(addr.id, {
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
      setAddresses((prev) => prev.map((a) => (a.id === addr.id ? updated : a)));
      toast({ title: "Address Saved", description: `${addr.title || "Address"} updated successfully.`, type: "success" });
      onAccountUpdated();
    } catch (err: unknown) {
      setAddresses(previous);
      const msg = err instanceof Error ? err.message : "Failed to save address";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setSavingAddressId(null);
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
      setAddresses((prev) => [...prev, created]);
      setExpandedAddressIds((prev) => new Set(prev).add(created.id));
      toast({ title: "Address Duplicated", description: `Created Address #${nextIdx}.`, type: "success" });
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

    const previous = addresses;

    // 1. Instant optimistic delete (<5ms)
    setAddresses((prev) => prev.filter((a) => a.id !== addrId));
    toast({ title: "Address Deleted", description: "Address was removed.", type: "success" });

    // 2. Fire server action in background
    try {
      await deleteCompanyAddress(addrId);
      onAccountUpdated();
    } catch (err: unknown) {
      setAddresses(previous);
      const msg = err instanceof Error ? err.message : "Failed to delete address";
      toast({ title: "Error", description: msg, type: "error" });
    }
  };

  const handleSetDefaultAddress = async (addrId: string) => {
    if (!companyId) return;
    const previous = addresses;

    // 1. Instant optimistic flip (<5ms)
    setAddresses((prev) =>
      prev.map((a) => ({
        ...a,
        isDefault: a.id === addrId,
      }))
    );
    toast({ title: "Default Set", description: "Primary address updated.", type: "success" });

    // 2. Fire server action in background
    try {
      await setDefaultCompanyAddress(companyId, addrId);
      onAccountUpdated();
    } catch (err: unknown) {
      setAddresses(previous);
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

    const cleanEmails = (formData.emails || [formData.email]).map((e) => e.trim()).filter(Boolean);
    const cleanPhones = (formData.phones || [formData.phone]).map((p) => p.trim()).filter(Boolean);

    const invalidEmail = cleanEmails.find((em) => !isValidEmail(em));
    if (invalidEmail) {
      return toast({
        title: "Invalid Email Address",
        description: `Email "${invalidEmail}" is invalid. Please enter a valid email format (e.g. name@company.com).`,
        type: "warning",
      });
    }

    setIsSavingPersonId(personId);
    try {
      await updateContact(personId, {
        name: formData.name.trim(),
        role: formData.role.trim() || undefined,
        contactDepartment: formData.contactDepartment.trim() || undefined,
        emails: cleanEmails,
        phones: cleanPhones,
        email: cleanEmails[0] || null,
        phone: cleanPhones[0] || null,
      });
      toast({ title: "Contact Updated", description: `Changes to ${formData.name} saved.`, type: "success" });
      setOverview((prev) => prev ? {
        ...prev,
        contacts: prev.contacts.map((c) => c.id === personId ? {
          ...c,
          name: formData.name.trim(),
          role: formData.role.trim() || null,
          contactDepartment: formData.contactDepartment.trim() || null,
          emails: cleanEmails,
          phones: cleanPhones,
          email: cleanEmails[0] || null,
          phone: cleanPhones[0] || null,
        } : c)
      } : prev);
      setPersonForms((prev) => ({
        ...prev,
        [personId]: {
          ...prev[personId],
          name: formData.name.trim(),
          role: formData.role.trim(),
          contactDepartment: formData.contactDepartment.trim(),
          emails: cleanEmails.length > 0 ? cleanEmails : [""],
          phones: cleanPhones.length > 0 ? cleanPhones : [""],
          email: cleanEmails[0] || "",
          phone: cleanPhones[0] || "",
        },
      }));
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

    const cleanEmails = newPersonEmails.map((e) => e.trim()).filter(Boolean);
    const cleanPhones = newPersonPhones.map((p) => p.trim()).filter(Boolean);

    const invalidEmail = cleanEmails.find((em) => !isValidEmail(em));
    if (invalidEmail) {
      return toast({
        title: "Invalid Email Address",
        description: `Email "${invalidEmail}" is invalid. Please enter a valid email format (e.g. name@company.com).`,
        type: "warning",
      });
    }

    setIsSavingNewPerson(true);
    try {
      const created = await createContact({
        name: newPersonName.trim(),
        role: newPersonRole.trim() || undefined,
        contactDepartment: newPersonDept.trim() || undefined,
        emails: cleanEmails,
        phones: cleanPhones,
        email: cleanEmails[0] || undefined,
        phone: cleanPhones[0] || undefined,
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
      setNewPersonEmails([""]);
      setNewPersonPhones([""]);
      setIsAddingPerson(false);

      await loadData(true);
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
      setOverview((prev) => prev ? {
        ...prev,
        contacts: prev.contacts.filter((c) => c.id !== personId)
      } : prev);
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

                      {/* Office Phone / Landline */}
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-[#C7F33C]" />
                            <span>Office Phone / Landline</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            e.g. 02 123 4567 ext. 12 or +66 2 123 4567
                          </span>
                        </label>
                        <input
                          type="text"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="e.g. 02 123 4567 ext. 12"
                          className="w-full bg-[#252728] rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0 transition-colors"
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
                      {/* In-memory Draft Address Card */}
                      {draftAddress && (
                        <div className="bg-[#3A3B3C] rounded-2xl border-2 border-[#C7F33C]/80 relative z-20 shadow-xl overflow-hidden animate-in fade-in duration-200">
                          {/* Draft Card Header */}
                          <div className="flex items-center justify-between p-4 bg-[#2D2E30] border-b border-[#252728]">
                            <div className="flex items-center gap-2.5">
                              <span className="text-xs font-bold text-[#C7F33C]">
                                {draftAddress.title || `Address #${addresses.length + 1}`}
                              </span>
                              <span className="text-[10px] uppercase font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                Draft (Unsaved)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDraftAddress(null)}
                              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg transition-colors cursor-pointer"
                            >
                              Discard
                            </button>
                          </div>

                          {/* Draft Card Body */}
                          <div className="p-5 space-y-3.5">
                            {/* Autocomplete with Google Places */}
                            <div>
                              <label className="text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-[#C7F33C]" />
                                <span>Quick Auto-Fill with Google Places</span>
                              </label>
                              <AddressAutocomplete
                                onAddressSelected={(place: ParsedAddressResult) => {
                                  setDraftAddress((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          addressLine1: place.addressLine1 || prev.addressLine1,
                                          subdistrict: place.subdistrict || prev.subdistrict,
                                          district: place.district || prev.district,
                                          province: place.province || prev.province,
                                          postalCode: place.postalCode || prev.postalCode,
                                          country: place.country || prev.country,
                                          googleMapsUrl: place.googleMapsUrl || prev.googleMapsUrl,
                                        }
                                      : null
                                  );
                                }}
                                placeholder="Search building name, company, or full address..."
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-semibold text-slate-300">
                                  Address Type
                                </label>
                                <AddressTypeSelect
                                  value={draftAddress.type || "BRANCH"}
                                  onChange={(val) =>
                                    setDraftAddress((prev) => (prev ? { ...prev, type: val } : null))
                                  }
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-semibold text-slate-300">
                                  Branch Code
                                </label>
                                <input
                                  type="text"
                                  value={draftAddress.branchNumber || ""}
                                  onChange={(e) =>
                                    setDraftAddress((prev) => (prev ? { ...prev, branchNumber: e.target.value } : null))
                                  }
                                  placeholder="00000"
                                  className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-semibold text-slate-300">
                                  Tax ID
                                </label>
                                <input
                                  type="text"
                                  value={draftAddress.taxId || ""}
                                  onChange={(e) =>
                                    setDraftAddress((prev) => (prev ? { ...prev, taxId: e.target.value } : null))
                                  }
                                  placeholder="e.g. 0105558000000"
                                  className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                                />
                              </div>
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-semibold text-slate-300">Country</label>
                              <CountrySelect
                                value={draftAddress.country || country || "Thailand"}
                                onChange={(val) =>
                                  setDraftAddress((prev) => (prev ? { ...prev, country: val } : null))
                                }
                                placeholder="Select Country"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-semibold text-slate-300">
                                Address Line 1 <span className="text-[#C7F33C]">*</span>
                              </label>
                              <input
                                type="text"
                                value={draftAddress.addressLine1 || ""}
                                onChange={(e) =>
                                  setDraftAddress((prev) => (prev ? { ...prev, addressLine1: e.target.value } : null))
                                }
                                placeholder="e.g. 123 Sukhumvit Road, Building A"
                                className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-semibold text-slate-300">
                                Address Line 2
                              </label>
                              <input
                                type="text"
                                value={draftAddress.addressLine2 || ""}
                                onChange={(e) =>
                                  setDraftAddress((prev) => (prev ? { ...prev, addressLine2: e.target.value } : null))
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
                                  value={draftAddress.subdistrict || ""}
                                  onChange={(e) =>
                                    setDraftAddress((prev) => (prev ? { ...prev, subdistrict: e.target.value } : null))
                                  }
                                  placeholder="e.g. Khlong Toei Nuea"
                                  className="w-full bg-[#252728] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 border-0"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-semibold text-slate-300">District</label>
                                <input
                                  type="text"
                                  value={draftAddress.district || ""}
                                  onChange={(e) =>
                                    setDraftAddress((prev) => (prev ? { ...prev, district: e.target.value } : null))
                                  }
                                  placeholder="e.g. Watthana"
                                  className="w-full bg-[#252728] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 border-0"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-semibold text-slate-300">Province</label>
                                <input
                                  type="text"
                                  value={draftAddress.province || ""}
                                  onChange={(e) =>
                                    setDraftAddress((prev) => (prev ? { ...prev, province: e.target.value } : null))
                                  }
                                  placeholder="e.g. Bangkok"
                                  className="w-full bg-[#252728] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 border-0"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-semibold text-slate-300">Postal Code</label>
                                <input
                                  type="text"
                                  value={draftAddress.postalCode || ""}
                                  onChange={(e) =>
                                    setDraftAddress((prev) => (prev ? { ...prev, postalCode: e.target.value } : null))
                                  }
                                  placeholder="e.g. 10110"
                                  className="w-full bg-[#252728] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 border-0"
                                />
                              </div>
                            </div>

                            {/* Google Maps URL */}
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[11px] font-semibold text-slate-300">
                                  Google Maps URL (Optional)
                                </label>
                                {draftAddress.googleMapsUrl && (
                                  <a
                                    href={draftAddress.googleMapsUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-[#C7F33C] hover:underline flex items-center gap-1"
                                  >
                                    <span>Open Map</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                              <input
                                type="url"
                                value={draftAddress.googleMapsUrl || ""}
                                onChange={(e) =>
                                  setDraftAddress((prev) => (prev ? { ...prev, googleMapsUrl: e.target.value } : null))
                                }
                                placeholder="https://maps.google.com/?q=..."
                                className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                              />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#252728]">
                              <button
                                type="button"
                                onClick={() => setDraftAddress(null)}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveDraftAddress}
                                disabled={isSavingDraftAddress}
                                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                              >
                                {isSavingDraftAddress ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                                ) : (
                                  <Save className="w-3.5 h-3.5 text-black" />
                                )}
                                <span>Save Address</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {addresses.length === 0 && !draftAddress ? (
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
                                  {/* Google Places Autocomplete Auto-Fill */}
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                                      <Sparkles className="w-3.5 h-3.5 text-[#C7F33C]" />
                                      <span>Auto-Fill with Google Places</span>
                                    </label>
                                    <AddressAutocomplete
                                      onAddressSelected={(place: ParsedAddressResult) => {
                                        setAddresses((prev) =>
                                          prev.map((a) =>
                                            a.id === addr.id
                                              ? {
                                                  ...a,
                                                  addressLine1: place.addressLine1 || a.addressLine1,
                                                  subdistrict: place.subdistrict || a.subdistrict,
                                                  district: place.district || a.district,
                                                  province: place.province || a.province,
                                                  postalCode: place.postalCode || a.postalCode,
                                                  country: place.country || a.country,
                                                  googleMapsUrl: place.googleMapsUrl || a.googleMapsUrl,
                                                }
                                              : a
                                          )
                                        );
                                      }}
                                      placeholder="Search building name, company, or full address..."
                                    />
                                  </div>

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
                                        Branch Code
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
                                        Tax ID
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
                                      Address Line 1 <span className="text-[#C7F33C]">*</span>
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
                                      Address Line 2
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
                                        placeholder="e.g. Khlong Toei Nuea"
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
                                        placeholder="e.g. Watthana"
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
                                        placeholder="e.g. Bangkok"
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
                                        placeholder="e.g. 10110"
                                        className="w-full bg-[#252728] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 border-0"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                      <label className="text-[11px] font-semibold text-slate-300">
                                        Google Maps URL (Optional)
                                      </label>
                                      {addr.googleMapsUrl && (
                                        <a
                                          href={addr.googleMapsUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-[10px] text-[#C7F33C] hover:underline flex items-center gap-1"
                                        >
                                          <span>Open Map</span>
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      )}
                                    </div>
                                    <input
                                      type="url"
                                      value={addr.googleMapsUrl || ""}
                                      onChange={(e) =>
                                        handleUpdateAddressField(addr.id, "googleMapsUrl", e.target.value)
                                      }
                                      placeholder="https://maps.google.com/?q=..."
                                      className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                                    />
                                  </div>

                                  <div className="flex items-center justify-end pt-1">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveAddressCard(addr)}
                                      disabled={savingAddressId === addr.id}
                                      className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                    >
                                      {savingAddressId === addr.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                                      ) : (
                                        <Save className="w-3.5 h-3.5 text-black" />
                                      )}
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

                    {/* Multi-Email Addresses */}
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>Email Addresses</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setNewPersonEmails((prev) => [...prev, ""])}
                          className="text-[11px] font-semibold text-[#C7F33C] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          + Add Email
                        </button>
                      </div>
                      <div className="space-y-2">
                        {newPersonEmails.map((emailVal, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <EmailInput
                              value={emailVal}
                              onChange={(val) => {
                                const next = [...newPersonEmails];
                                next[idx] = val;
                                setNewPersonEmails(next);
                              }}
                              placeholder="e.g. somchai@company.com"
                              className="flex-1"
                            />
                            {newPersonEmails.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setNewPersonEmails((prev) => prev.filter((_, i) => i !== idx))}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-[#252728] rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Multi-Phone Numbers */}
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>Phone Numbers</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setNewPersonPhones((prev) => [...prev, ""])}
                          className="text-[11px] font-semibold text-[#C7F33C] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          + Add Phone
                        </button>
                      </div>
                      <div className="space-y-2">
                        {newPersonPhones.map((phoneVal, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <PhoneInputWithCountry
                              value={phoneVal}
                              onChange={(val) => {
                                const next = [...newPersonPhones];
                                next[idx] = val;
                                setNewPersonPhones(next);
                              }}
                              placeholder="081 234 5678"
                              className="flex-1"
                            />
                            {newPersonPhones.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setNewPersonPhones((prev) => prev.filter((_, i) => i !== idx))}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-[#252728] rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
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
                                          [c.id]: { ...(prev[c.id] || pForm), contactDepartment: e.target.value },
                                        }))
                                      }
                                      className="w-full bg-[#252728] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] border-0"
                                    />
                                  </div>

                                  {/* Multi-Email Addresses */}
                                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                                    <div className="flex items-center justify-between">
                                      <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                                        <span>Email Addresses</span>
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPersonForms((prev) => {
                                            const existing = prev[c.id] || pForm;
                                            const currentEmails = existing.emails && existing.emails.length > 0 ? existing.emails : (existing.email ? [existing.email] : [""]);
                                            return {
                                              ...prev,
                                              [c.id]: {
                                                ...existing,
                                                emails: [...currentEmails, ""],
                                              },
                                            };
                                          });
                                        }}
                                        className="text-[11px] font-semibold text-[#C7F33C] hover:underline flex items-center gap-1 cursor-pointer"
                                      >
                                        + Add Email
                                      </button>
                                    </div>
                                    <div className="space-y-2">
                                      {(pForm.emails && pForm.emails.length > 0 ? pForm.emails : (pForm.email ? [pForm.email] : [""])).map((em, eIdx) => (
                                        <div key={eIdx} className="flex items-center gap-2">
                                          <EmailInput
                                            value={em}
                                            onChange={(val) => {
                                              setPersonForms((prev) => {
                                                const existing = prev[c.id] || pForm;
                                                const currentEmails = [...(existing.emails && existing.emails.length > 0 ? existing.emails : (existing.email ? [existing.email] : [""]))];
                                                currentEmails[eIdx] = val;
                                                return {
                                                  ...prev,
                                                  [c.id]: {
                                                    ...existing,
                                                    emails: currentEmails,
                                                    email: currentEmails[0] || "",
                                                  },
                                                };
                                              });
                                            }}
                                            placeholder="e.g. contact@company.com"
                                            className="flex-1"
                                          />
                                          {(pForm.emails?.length || 1) > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const currentEmails = (pForm.emails || []).filter((_, i) => i !== eIdx);
                                                setPersonForms((prev) => ({
                                                  ...prev,
                                                  [c.id]: {
                                                    ...pForm,
                                                    emails: currentEmails.length > 0 ? currentEmails : [""],
                                                    email: currentEmails[0] || "",
                                                  },
                                                }));
                                              }}
                                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-[#252728] rounded-lg transition-colors cursor-pointer"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Multi-Phone Numbers */}
                                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                                    <div className="flex items-center justify-between">
                                      <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                                        <span>Phone Numbers</span>
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const currentPhones = pForm.phones && pForm.phones.length > 0 ? pForm.phones : (pForm.phone ? [pForm.phone] : [""]);
                                          setPersonForms((prev) => ({
                                            ...prev,
                                            [c.id]: {
                                              ...pForm,
                                              phones: [...currentPhones, ""],
                                            },
                                          }));
                                        }}
                                        className="text-[11px] font-semibold text-[#C7F33C] hover:underline flex items-center gap-1 cursor-pointer"
                                      >
                                        + Add Phone
                                      </button>
                                    </div>
                                    <div className="space-y-2">
                                      {(pForm.phones && pForm.phones.length > 0 ? pForm.phones : (pForm.phone ? [pForm.phone] : [""])).map((ph, pIdx) => (
                                        <div key={pIdx} className="flex items-center gap-2">
                                          <PhoneInputWithCountry
                                            value={ph}
                                            onChange={(val) => {
                                              setPersonForms((prev) => {
                                                const existing = prev[c.id] || pForm;
                                                const currentPhones = [...(existing.phones && existing.phones.length > 0 ? existing.phones : (existing.phone ? [existing.phone] : [""]))];
                                                currentPhones[pIdx] = val;
                                                return {
                                                  ...prev,
                                                  [c.id]: {
                                                    ...existing,
                                                    phones: currentPhones,
                                                    phone: currentPhones[0] || "",
                                                  },
                                                };
                                              });
                                            }}
                                            placeholder="081 234 5678"
                                            className="flex-1"
                                          />
                                          {(pForm.phones?.length || 1) > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const currentPhones = (pForm.phones || []).filter((_, i) => i !== pIdx);
                                                setPersonForms((prev) => ({
                                                  ...prev,
                                                  [c.id]: {
                                                    ...pForm,
                                                    phones: currentPhones.length > 0 ? currentPhones : [""],
                                                    phone: currentPhones[0] || "",
                                                  },
                                                }));
                                              }}
                                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-[#252728] rounded-lg transition-colors cursor-pointer"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
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
