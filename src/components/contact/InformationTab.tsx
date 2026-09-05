"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useDialog } from "@/providers/DialogProvider";
import { updateContact, deleteContact } from "@/lib/actions/contact";
import { ContactType, ContactStatus } from "@prisma/client";
import { 
  Building2, 
  User, 
  Mail, 
  Phone, 
  ShieldCheck, 
  Trash2, 
  Save, 
  Loader2,
  History,
  Upload,
  X,
  Briefcase,
  Tag
} from "lucide-react";
import { PhoneInputWithCountry } from "@/components/ui/PhoneInputWithCountry";

interface LogItem {
  id: string;
  summary: string;
  action: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: Date | string;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

interface ContactDetail {
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
  isActive?: boolean;
  type: ContactType;
  status: ContactStatus;
  isMasked?: boolean;
  canDelete?: boolean;
  department?: { id: string; name: string } | null;
  company: {
    id: string;
    name: string;
    type?: ContactType;
    country: string | null;
    address: string | null;
  };
  logs?: LogItem[];
}

export function InformationTab({
  contact,
  onUpdated,
  onDeleted,
}: {
  contact: ContactDetail;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const { toast, confirm } = useDialog();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLogTab, setShowLogTab] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(contact.image || null);

  // Form state focusing strictly on Person
  const [formData, setFormData] = useState({
    name: contact.name || "",
    role: contact.role || "",
    contactDepartment: contact.contactDepartment || "",
    departmentId: contact.department?.id || "",
    image: contact.image || "",
    isActive: contact.isActive !== undefined ? contact.isActive : true,
    email: contact.email || "",
    phone: contact.phone || "",
    emails: contact.emails && contact.emails.length > 0 ? contact.emails : (contact.email ? [contact.email] : [""]),
    phones: contact.phones && contact.phones.length > 0 ? contact.phones : (contact.phone ? [contact.phone] : [""]),
    isEmailVerified: contact.isEmailVerified || false,
    isPhoneVerified: contact.isPhoneVerified || false,
    type: contact.type || "CUSTOMER",
    status: contact.status || "UNQUALIFIED",
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setFormData({
        name: contact.name || "",
        role: contact.role || "",
        contactDepartment: contact.contactDepartment || "",
        departmentId: contact.department?.id || "",
        image: contact.image || "",
        isActive: contact.isActive !== undefined ? contact.isActive : true,
        email: contact.email || "",
        phone: contact.phone || "",
        emails: contact.emails && contact.emails.length > 0 ? contact.emails : (contact.email ? [contact.email] : [""]),
        phones: contact.phones && contact.phones.length > 0 ? contact.phones : (contact.phone ? [contact.phone] : [""]),
        isEmailVerified: contact.isEmailVerified || false,
        isPhoneVerified: contact.isPhoneVerified || false,
        type: contact.type || "CUSTOMER",
        status: contact.status || "UNQUALIFIED",
      });
      setAvatarPreview(contact.image || null);
    }, 0);
    return () => clearTimeout(timer);
  }, [contact]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      return toast({ title: "Invalid File", description: "Please choose an image file (PNG, JPG, WebP)", type: "warning" });
    }

    if (file.size > 5 * 1024 * 1024) {
      return toast({ title: "File Too Large", description: "Image size must not exceed 5MB", type: "warning" });
    }

    setIsUploadingImage(true);
    try {
      const uploadData = new FormData();
      uploadData.append("file", file);

      const res = await fetch("/api/upload/contact-avatar", {
        method: "POST",
        body: uploadData,
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to upload image");
      }

      setAvatarPreview(data.url);
      setFormData((prev) => ({ ...prev, image: data.url }));
      toast({ title: "Image Uploaded", description: "Profile photo set successfully.", type: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error uploading avatar";
      toast({ title: "Upload Failed", description: msg, type: "error" });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setAvatarPreview(null);
    setFormData((prev) => ({ ...prev, image: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleEmailChange = (index: number, val: string) => {
    setFormData((prev) => {
      const nextEmails = [...prev.emails];
      nextEmails[index] = val;
      return { ...prev, emails: nextEmails, email: nextEmails[0] || "" };
    });
  };

  const handleAddEmail = () => {
    setFormData((prev) => ({ ...prev, emails: [...prev.emails, ""] }));
  };

  const handleRemoveEmail = (index: number) => {
    setFormData((prev) => {
      const nextEmails = prev.emails.filter((_, i) => i !== index);
      const updated = nextEmails.length > 0 ? nextEmails : [""];
      return { ...prev, emails: updated, email: updated[0] || "" };
    });
  };

  const handlePhoneChange = (index: number, val: string) => {
    setFormData((prev) => {
      const nextPhones = [...prev.phones];
      nextPhones[index] = val;
      return { ...prev, phones: nextPhones, phone: nextPhones[0] || "" };
    });
  };

  const handleAddPhone = () => {
    setFormData((prev) => ({ ...prev, phones: [...prev.phones, ""] }));
  };

  const handleRemovePhone = (index: number) => {
    setFormData((prev) => {
      const nextPhones = prev.phones.filter((_, i) => i !== index);
      const updated = nextPhones.length > 0 ? nextPhones : [""];
      return { ...prev, phones: updated, phone: updated[0] || "" };
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      return toast({ title: "Validation", description: "Person name is required", type: "warning" });
    }

    setIsSaving(true);
    try {
      await updateContact(contact.id, {
        name: formData.name.trim(),
        role: formData.role.trim() || undefined,
        contactDepartment: formData.contactDepartment.trim() || undefined,
        departmentId: formData.departmentId || null,
        image: formData.image || null,
        isActive: formData.isActive,
        email: (formData.emails[0] ? formData.emails[0].trim() : formData.email.trim()) || undefined,
        phone: (formData.phones[0] ? formData.phones[0].trim() : formData.phone.trim()) || undefined,
        emails: formData.emails.filter((e) => e.trim()).map((e) => e.trim()),
        phones: formData.phones.filter((p) => p.trim()).map((p) => p.trim()),
        isEmailVerified: formData.isEmailVerified,
        isPhoneVerified: formData.isPhoneVerified,
        type: formData.type as ContactType,
        status: formData.status as ContactStatus,
      });
      toast({
        title: "Person Saved",
        description: "Person profile updated successfully.",
        type: "success",
      });
      onUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update person";
      toast({ title: "Error", description: msg, type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const isConfirmed = await confirm({
      title: "Delete Person",
      description: `Are you sure you want to delete ${contact.name}? This action cannot be undone.`,
      confirmText: "Delete Person",
      cancelText: "Cancel",
      variant: "danger",
    });

    if (!isConfirmed) return;

    setIsDeleting(true);
    try {
      await deleteContact(contact.id);
      toast({
        title: "Deleted",
        description: "Contact deleted successfully.",
        type: "success",
      });
      onDeleted();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete contact";
      toast({ title: "Cannot Delete", description: msg, type: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Controls & Status Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-[#3A3B3C]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#C7F33C]" />
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              {contact.name}
            </span>
          </div>

          {contact.department && (
            <span className="text-xs bg-[#3A3B3C] text-slate-300 px-2.5 py-1 rounded-full font-medium border border-[#4E4F50]">
              Dept: {contact.department.name}
            </span>
          )}

          {contact.isMasked && (
            <span className="text-xs bg-amber-900/40 text-amber-300 px-2.5 py-1 rounded-full font-medium border border-amber-800/60">
              Cross-Department (Masked)
            </span>
          )}
        </div>

        {/* View Switcher: Details vs System Log */}
        <div className="flex items-center gap-1 bg-[#1C1C1D] p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setShowLogTab(false)}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              !showLogTab
                ? "bg-[#3A3B3C] text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => setShowLogTab(true)}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              showLogTab
                ? "bg-[#3A3B3C] text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            System Log ({contact.logs?.length || 0})
          </button>
        </div>
      </div>

      {!showLogTab ? (
        /* Form Section */
        <div className="flex flex-col gap-6">
          {/* Section 1: Person Details */}
          <div className="bg-[#3A3B3C] rounded-2xl p-5 flex flex-col gap-4 border-0">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <User className="w-4 h-4 text-[#C7F33C]" />
                Person Profile
              </h4>
            </div>

            {/* Avatar Uploader */}
            <div className="bg-[#252728] rounded-xl p-3.5 flex items-center gap-4">
              <div className="relative group">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-[#1C1C1D] border-2 border-[#C7F33C]/40 flex items-center justify-center shrink-0">
                  {avatarPreview ? (
                    <Image
                      src={avatarPreview}
                      alt="Avatar preview"
                      width={56}
                      height={56}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <User className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                {isUploadingImage && (
                  <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-[#C7F33C] animate-spin" />
                  </div>
                )}
              </div>

              <div className="flex-1">
                <span className="text-xs font-bold text-slate-200 block">Contact Profile Photo</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Upload an image for this contact (Max 5MB)
                </span>

                <div className="flex items-center gap-2 mt-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="edit-contact-avatar-file"
                  />
                  <label
                    htmlFor="edit-contact-avatar-file"
                    className="cursor-pointer px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#3A3B3C] text-slate-200 hover:bg-[#C7F33C] hover:text-black transition-colors flex items-center gap-1.5"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Change Photo</span>
                  </label>

                  {avatarPreview && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="p-1 rounded-lg text-red-400 hover:bg-red-950/40 transition-colors"
                      title="Remove Photo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. John Doe"
                  className="bg-[#252728] rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5 text-[#C7F33C]" />
                  Position / Job Title
                </label>
                <input
                  type="text"
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  placeholder="e.g. Procurement Lead, Managing Director"
                  className="bg-[#252728] rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-[#C7F33C]" />
                  Department
                </label>
                <input
                  type="text"
                  name="contactDepartment"
                  value={formData.contactDepartment}
                  onChange={handleInputChange}
                  placeholder="e.g. HR, Purchasing, Procurement, Marketing"
                  className="bg-[#252728] rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-[#C7F33C]" />
                  <span>Account Type</span>
                </label>
                <div className="bg-[#252728] rounded-xl px-3 py-2 text-sm text-slate-300 border-0 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C]" />
                  <span className="capitalize">{((contact.company.type || formData.type || "CUSTOMER") as string).toLowerCase()}</span>
                  <span className="text-[10px] text-slate-500 font-normal ml-auto">From Account</span>
                </div>
              </div>

              {/* Email Addresses with Multi-support & Verification */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    Email Addresses
                  </label>
                  <button
                    type="button"
                    onClick={handleAddEmail}
                    className="text-[11px] font-semibold text-[#C7F33C] hover:underline flex items-center gap-1"
                  >
                    + Add Email
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.emails.map((em, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="email"
                        value={em}
                        onChange={(e) => handleEmailChange(idx, e.target.value)}
                        placeholder="contact@company.com"
                        disabled={contact.isMasked}
                        className="flex-1 bg-[#252728] rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors disabled:opacity-60 border-0"
                      />
                      {idx === 0 && (
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, isEmailVerified: !prev.isEmailVerified }))}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shrink-0 ${
                            formData.isEmailVerified
                              ? "bg-[#C7F33C]/20 text-[#C7F33C]"
                              : "bg-[#3A3B3C] text-slate-400 hover:text-slate-200"
                          }`}
                          title="Click to toggle email verification"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{formData.isEmailVerified ? "Verified" : "Verify"}</span>
                        </button>
                      )}
                      {formData.emails.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEmail(idx)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-[#3A3B3C] rounded-lg transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Phone Numbers with Multi-support & Verification */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    Phone Numbers
                  </label>
                  <button
                    type="button"
                    onClick={handleAddPhone}
                    className="text-[11px] font-semibold text-[#C7F33C] hover:underline flex items-center gap-1"
                  >
                    + Add Phone
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.phones.map((ph, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <PhoneInputWithCountry
                        value={ph}
                        onChange={(val) => handlePhoneChange(idx, val)}
                        disabled={contact.isMasked}
                        className="flex-1"
                      />
                      {idx === 0 && (
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, isPhoneVerified: !prev.isPhoneVerified }))}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shrink-0 ${
                            formData.isPhoneVerified
                              ? "bg-[#C7F33C]/20 text-[#C7F33C]"
                              : "bg-[#3A3B3C] text-slate-400 hover:text-slate-200"
                          }`}
                          title="Click to toggle phone verification"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{formData.isPhoneVerified ? "Verified" : "Verify"}</span>
                        </button>
                      )}
                      {formData.phones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePhone(idx)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-[#3A3B3C] rounded-lg transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Associated Account Information (Read-only reference) */}
          <div className="bg-[#252728] rounded-2xl p-4.5 flex flex-col gap-2 border-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#C7F33C]" />
                Associated Account
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                Managed in Account View
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="font-bold text-sm text-slate-100 block">
                  {contact.company.name}
                </span>
                {contact.company.country && (
                  <span className="text-xs text-slate-400">
                    {contact.company.country}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <div>
              {contact.canDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-red-400 bg-red-950/40 hover:bg-red-900/40 transition-colors flex items-center gap-2"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Delete Person
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl text-sm font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-2"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin text-black" />
              ) : (
                <Save className="w-4 h-4 text-black" />
              )}
              Save Changes
            </button>
          </div>
        </div>
      ) : (
        /* System Log Section matching Pipeline Activity design */
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Audit trail of all changes made to this contact person.</span>
            <span className="px-2 py-0.5 rounded-full bg-[#252728] text-[11px] font-semibold">
              {contact.logs?.length || 0} entries
            </span>
          </div>

          {(!contact.logs || contact.logs.length === 0) ? (
            <div className="p-8 text-center text-slate-400 bg-[#252728] rounded-2xl border border-[#4E4F50]/40 text-xs">
              No system logs recorded for this contact yet.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {contact.logs.map((log) => (
                <div key={log.id} className="flex gap-3 bg-[#252728] p-3 rounded-2xl border border-[#4E4F50]/40">
                  <div className="w-8 h-8 rounded-full bg-[#3A3B3C] shrink-0 overflow-hidden mt-0.5 flex items-center justify-center">
                    {log.user?.image ? (
                      <img
                        src={log.user.image}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-bold text-[#C7F33C]">
                        {(log.user?.name || "System").slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col flex-1 justify-center min-w-0">
                    <span className="text-[11px] text-slate-400 mb-0.5 font-medium">
                      <strong className="text-slate-200 font-semibold">{log.user?.name || "System"}</strong> •{" "}
                      {new Intl.DateTimeFormat("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(log.createdAt))}
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
  );
}
