"use client";

import { useState, useMemo, useCallback, forwardRef, useImperativeHandle, useEffect, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import { OpportunityWithRelations } from "./KanbanCard";
import { updateOpportunity } from "@/lib/actions/opportunity";
import { useDialog } from "@/providers/DialogProvider";
import {
  DollarSign,
  Package,
  Calendar,
  FileText,
  ChevronDown,
  Check,
  Building2,
  Users,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  Globe,
  Star,
  User,
  Loader2,
} from "lucide-react";
import { CalendarDatePicker } from "@/components/ui/CalendarDatePicker";
import { getAccountOverviewKey } from "@/lib/contact/account-cache-keys";
import { getAccountOverview } from "@/lib/actions/contact";

const CURRENCY_OPTIONS = [
  { value: "THB", label: "THB (฿)" },
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
  { value: "CNY", label: "CNY (¥)" },
] as const;

export interface CustomerTabRef {
  save: () => Promise<void>;
  isSaving: boolean;
}

export interface CustomerTabProps {
  deal: OpportunityWithRelations;
  onClose?: () => void;
  canEditDealDates?: boolean;
}

export const CustomerTab = forwardRef<CustomerTabRef, CustomerTabProps>(function CustomerTab(
  { deal, canEditDealDates = false },
  ref
) {
  const { mutate } = useSWRConfig();
  const { toast } = useDialog();
  const [isSaving, setIsSaving] = useState(false);
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);
  const currencyMenuRef = useRef<HTMLDivElement>(null);

  // Fetch full account information and contact persons on-demand
  const companyId = deal.company?.id;
  const overviewKey = companyId ? getAccountOverviewKey(companyId) : null;
  const { data: accountOverview, isLoading: isLoadingAccount } = useSWR(
    overviewKey,
    () => getAccountOverview(companyId!, { includeAddresses: true, includeLogs: false }),
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  const accountCompany = accountOverview?.company;
  const accountAddresses = accountOverview?.addresses || [];
  const primaryAddress = accountAddresses.find((a) => a.isDefault) || accountAddresses[0] || null;
  const accountContacts = accountOverview?.contacts || [];

  const accountPhones = useMemo(() => {
    if (!accountCompany) return [];
    if (accountCompany.phones && accountCompany.phones.length > 0) return accountCompany.phones;
    if (accountCompany.phone) return [accountCompany.phone];
    return [];
  }, [accountCompany]);

  const accountEmails = useMemo(() => {
    if (!accountCompany) return [];
    if (accountCompany.emails && accountCompany.emails.length > 0) return accountCompany.emails;
    if (accountCompany.email) return [accountCompany.email];
    return [];
  }, [accountCompany]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (currencyMenuRef.current && !currencyMenuRef.current.contains(event.target as Node)) {
        setShowCurrencyMenu(false);
      }
    }
    if (showCurrencyMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCurrencyMenu]);

  const dealKey = `${deal.id}-${deal.value}-${deal.currency}-${deal.goodsReadyDate}-${deal.goodsLoadingDate}-${deal.reserveId}-${deal.invoiceId}`;

  const initialFormData = useMemo(
    () => ({
      value: deal.value !== null && deal.value !== undefined ? deal.value : "",
      currency: deal.currency || "THB",
      goodsReadyDate: deal.goodsReadyDate
        ? new Date(deal.goodsReadyDate).toISOString().split("T")[0]
        : "",
      goodsLoadingDate: deal.goodsLoadingDate
        ? new Date(deal.goodsLoadingDate).toISOString().split("T")[0]
        : "",
      reserveId: deal.reserveId || "",
      invoiceId: deal.invoiceId || "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dealKey]
  );

  const [formData, setFormData] = useState(initialFormData);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = useCallback(async () => {
    const previousFormData = { ...formData };
    const updatedPayload = {
      value: formData.value !== "" ? parseFloat(formData.value.toString()) : null,
      currency: formData.currency,
      ...(formData.goodsReadyDate !== initialFormData.goodsReadyDate ? {
        goodsReadyDate: formData.goodsReadyDate ? new Date(formData.goodsReadyDate) : null,
      } : {}),
      ...(formData.goodsLoadingDate !== initialFormData.goodsLoadingDate ? {
        goodsLoadingDate: formData.goodsLoadingDate ? new Date(formData.goodsLoadingDate) : null,
      } : {}),
      reserveId: formData.reserveId || null,
      invoiceId: formData.invoiceId || null,
    };

    // 1. Optimistically patch SWR cache across pipeline deals immediately (< 50ms)
    void mutate(
      (key) => Array.isArray(key) && key[0] === "pipeline-deals",
      (currentDeals: OpportunityWithRelations[] | undefined) => {
        if (!currentDeals) return currentDeals;
        return currentDeals.map((d) =>
          d.id === deal.id ? { ...d, ...updatedPayload } : d
        );
      },
      false
    );

    // 2. Instant feedback toast
    toast({
      title: "Saved",
      description: "Sale deal information updated.",
      type: "success",
    });

    // 3. Fire server action in background
    setIsSaving(true);
    try {
      await updateOpportunity(deal.id, updatedPayload);
      void mutate((key) => Array.isArray(key) && key[0] === "pipeline-deals");
    } catch (error: unknown) {
      setFormData(previousFormData);
      void mutate((key) => Array.isArray(key) && key[0] === "pipeline-deals");
      const message = error instanceof Error ? error.message : "Failed to save information.";
      toast({ title: "Error", description: message, type: "error" });
    } finally {
      setIsSaving(false);
    }
  }, [deal.id, formData, initialFormData, mutate, toast]);

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      isSaving,
    }),
    [handleSave, isSaving]
  );

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Financials Section */}
      <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl p-5 flex flex-col gap-5">
        <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-slate-400" />
          Financials
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Total Value <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              name="value"
              value={formData.value}
              onChange={handleChange}
              placeholder="0.00"
              className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl px-3 py-2.5 text-slate-100 text-xs focus:outline-none focus:border-[#C7F33C] transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Currency <span className="text-rose-500">*</span>
            </label>
            <div className="relative" ref={currencyMenuRef}>
              <button
                type="button"
                onClick={() => setShowCurrencyMenu((prev) => !prev)}
                className={`w-full bg-[#252728] border rounded-xl px-3 py-2.5 text-slate-100 text-xs transition-colors cursor-pointer flex items-center justify-between ${
                  showCurrencyMenu
                    ? "border-[#C7F33C]"
                    : "border-[#4E4F50] hover:border-slate-400"
                }`}
                aria-haspopup="listbox"
                aria-expanded={showCurrencyMenu}
              >
                <span>
                  {CURRENCY_OPTIONS.find((c) => c.value === formData.currency)?.label || formData.currency}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                    showCurrencyMenu ? "rotate-180 text-[#C7F33C]" : ""
                  }`}
                />
              </button>

              {showCurrencyMenu && (
                <div className="absolute left-0 top-full mt-1.5 w-full min-w-[140px] bg-[#252728] border border-[#3A3B3C] rounded-xl p-1.5 z-50 shadow-xl animate-in fade-in zoom-in-95 duration-150">
                  {CURRENCY_OPTIONS.map((option) => {
                    const isSelected = formData.currency === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, currency: option.value }));
                          setShowCurrencyMenu(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left cursor-pointer ${
                          isSelected
                            ? "bg-[#3A3B3C] text-[#C7F33C]"
                            : "text-slate-200 hover:bg-[#3A3B3C] hover:text-white"
                        }`}
                      >
                        <span className="truncate">{option.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Shipment & Operations Section */}
      <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl p-5 flex flex-col gap-5">
        <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400" />
          Shipment & Operations
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Goods Ready Date
            </label>
            <CalendarDatePicker
              ariaLabel="Goods Ready Date"
              value={formData.goodsReadyDate}
              onChange={(date) =>
                setFormData((prev) => ({
                  ...prev,
                  goodsReadyDate: date,
                }))
              }
              disabled={!canEditDealDates}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Goods Loading Date <span className="text-rose-500">*</span>
            </label>
            <CalendarDatePicker
              ariaLabel="Goods Loading Date"
              value={formData.goodsLoadingDate}
              onChange={(date) =>
                setFormData((prev) => ({
                  ...prev,
                  goodsLoadingDate: date,
                }))
              }
              disabled={!canEditDealDates}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Reserve ID
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="reserveId"
                value={formData.reserveId}
                onChange={handleChange}
                placeholder="e.g. RS-2026-001"
                className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl pl-9 pr-3 py-2.5 text-slate-100 text-xs focus:outline-none focus:border-[#C7F33C] transition-colors"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              Invoice Number <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="invoiceId"
                value={formData.invoiceId}
                onChange={handleChange}
                placeholder="e.g. INV-2026-001"
                className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl pl-9 pr-3 py-2.5 text-slate-100 text-xs focus:outline-none focus:border-[#C7F33C] transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Account Information Section */}
      <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            Account Information
          </h4>
          {accountCompany && (
            <div className="flex items-center gap-1.5">
              {accountCompany.type && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#252728] text-slate-300 border border-[#4E4F50]">
                  {accountCompany.type}
                </span>
              )}
              {accountCompany.status && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    accountCompany.status === "QUALIFIED"
                      ? "bg-[#C7F33C]/10 text-[#C7F33C] border-[#C7F33C]/30"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  }`}
                >
                  {accountCompany.status === "QUALIFIED" ? "Qualified" : accountCompany.status}
                </span>
              )}
            </div>
          )}
        </div>

        {isLoadingAccount ? (
          <div className="flex items-center justify-center p-6 text-slate-400 gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-[#C7F33C]" />
            <span>Loading account details...</span>
          </div>
        ) : !companyId ? (
          <div className="text-xs text-slate-400 bg-[#252728] p-3.5 rounded-xl border border-[#4E4F50]/50 text-center">
            No account linked to this deal
          </div>
        ) : accountCompany ? (
          <div className="flex flex-col gap-3.5">
            {/* Account Name & Legal Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-[#252728] p-3.5 rounded-xl border border-[#4E4F50]/60">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Account Name</span>
                <span className="text-xs font-bold text-slate-100">{accountCompany.displayName || accountCompany.name}</span>
              </div>
              {accountCompany.displayName && accountCompany.name && accountCompany.displayName !== accountCompany.name && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Legal Entity</span>
                  <span className="text-xs text-slate-300 font-medium">{accountCompany.name}</span>
                </div>
              )}
              {accountCompany.country && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Country</span>
                  <span className="text-xs text-slate-200 flex items-center gap-1.5 font-medium">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    {accountCompany.country}
                  </span>
                </div>
              )}
              {accountCompany.starRating > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Star Rating</span>
                  <span className="text-xs text-amber-400 flex items-center gap-1 font-semibold">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    {accountCompany.starRating} / 5
                  </span>
                </div>
              )}
            </div>

            {/* Contact Channels (Phone / Email) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 bg-[#252728] p-3 rounded-xl border border-[#4E4F50]/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-slate-400" />
                  Phone
                </span>
                {accountPhones.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {accountPhones.map((ph, idx) => (
                      <a
                        key={idx}
                        href={`tel:${ph}`}
                        className="text-xs text-slate-200 hover:text-[#C7F33C] transition-colors font-medium"
                      >
                        {ph}
                      </a>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-500 italic">No phone number</span>
                )}
              </div>

              <div className="flex flex-col gap-1 bg-[#252728] p-3 rounded-xl border border-[#4E4F50]/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Mail className="w-3 h-3 text-slate-400" />
                  Email
                </span>
                {accountEmails.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {accountEmails.map((em, idx) => (
                      <a
                        key={idx}
                        href={`mailto:${em}`}
                        className="text-xs text-slate-200 hover:text-[#C7F33C] transition-colors font-medium truncate"
                      >
                        {em}
                      </a>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-500 italic">No email address</span>
                )}
              </div>
            </div>

            {/* Address */}
            {primaryAddress && (
              <div className="flex flex-col gap-1.5 bg-[#252728] p-3.5 rounded-xl border border-[#4E4F50]/60">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    {primaryAddress.title || (primaryAddress.type ? `${primaryAddress.type} Address` : "Address")}
                  </span>
                  {primaryAddress.googleMapsUrl && (
                    <a
                      href={primaryAddress.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[#C7F33C] hover:underline flex items-center gap-1 font-semibold"
                    >
                      <span>Google Maps</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {primaryAddress.formattedAddress || [
                    primaryAddress.addressLine1,
                    primaryAddress.addressLine2,
                    primaryAddress.district,
                    primaryAddress.province,
                    primaryAddress.postalCode,
                    primaryAddress.country,
                  ].filter(Boolean).join(" ")}
                </p>
              </div>
            )}

            {/* Notes if present */}
            {accountCompany.notes && (
              <div className="flex flex-col gap-1 bg-[#252728] p-3 rounded-xl border border-[#4E4F50]/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Notes</span>
                <p className="text-xs text-slate-300 whitespace-pre-wrap">{accountCompany.notes}</p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Contact Persons Section */}
      <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            Contact Persons
            {accountContacts.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#252728] text-slate-300 border border-[#4E4F50]">
                {accountContacts.length}
              </span>
            )}
          </h4>
        </div>

        {isLoadingAccount ? (
          <div className="flex items-center justify-center p-6 text-slate-400 gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-[#C7F33C]" />
            <span>Loading contacts...</span>
          </div>
        ) : accountContacts.length === 0 ? (
          <div className="text-xs text-slate-400 bg-[#252728] p-3.5 rounded-xl border border-[#4E4F50]/50 text-center">
            No contact persons registered for this account
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {accountContacts.map((contact) => {
              const contactPhones = (contact.phones && contact.phones.length > 0)
                ? contact.phones
                : contact.phone
                ? [contact.phone]
                : [];
              const contactEmails = (contact.emails && contact.emails.length > 0)
                ? contact.emails
                : contact.email
                ? [contact.email]
                : [];

              return (
                <div
                  key={contact.id}
                  className="bg-[#252728] border border-[#4E4F50]/60 rounded-xl p-3.5 flex flex-col gap-2.5 transition-colors hover:border-[#4E4F50]"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-[#4E4F50] bg-[#3A3B3C] flex items-center justify-center">
                      {contact.image ? (
                        <img
                          src={contact.image}
                          alt={contact.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-100 truncate">
                          {contact.name}
                        </span>
                        {contact.isActive ? (
                          <span className="text-[9px] font-semibold text-[#C7F33C] flex items-center gap-1 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C]" />
                            Active
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-500 shrink-0">Inactive</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        {contact.role && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#3A3B3C] text-slate-300 font-medium">
                            {contact.role}
                          </span>
                        )}
                        {contact.contactDepartment && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#3A3B3C] text-slate-300 font-medium">
                            {contact.contactDepartment}
                          </span>
                        )}
                        {contact.department?.name && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
                            {contact.department.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {(contactEmails.length > 0 || contactPhones.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-[#3A3B3C]/70">
                      {contactPhones.length > 0 && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-300 min-w-0">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <div className="flex flex-col min-w-0">
                            {contactPhones.map((ph, idx) => (
                              <a
                                key={idx}
                                href={`tel:${ph}`}
                                className="truncate hover:text-[#C7F33C] transition-colors"
                              >
                                {ph}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {contactEmails.length > 0 && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-300 min-w-0">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <div className="flex flex-col min-w-0">
                            {contactEmails.map((em, idx) => (
                              <a
                                key={idx}
                                href={`mailto:${em}`}
                                className="truncate hover:text-[#C7F33C] transition-colors"
                              >
                                {em}
                              </a>
                            ))}
                          </div>
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
    </div>
  );
});
