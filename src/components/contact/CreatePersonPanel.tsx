"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { 
  UserPlus, 
  Loader2, 
  Upload, 
  X, 
  Building2, 
  Briefcase, 
  Mail, 
  Phone,
  Trash2
} from "lucide-react";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { PhoneInputWithCountry } from "@/components/ui/PhoneInputWithCountry";
import { EmailInput, isValidEmail } from "@/components/ui/EmailInput";
import { useDialog } from "@/providers/DialogProvider";
import { createContact } from "@/lib/actions/contact";
import { ContactStatus } from "@prisma/client";

interface CreatePersonPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (contactId: string) => void;
  prefillCompany?: { id: string; name: string } | null;
}

export function CreatePersonPanel({
  isOpen,
  onClose,
  onCreated,
  prefillCompany,
}: CreatePersonPanelProps) {
  const { toast } = useDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    role: "",
    contactDepartment: "",
    departmentId: "",
    emails: [""] as string[],
    phones: [""] as string[],
    email: "",
    phone: "",
    image: "",
    status: "UNQUALIFIED" as ContactStatus,
  });

  const resetForm = useCallback(() => {
    setAvatarPreview(null);
    setForm({
      name: "",
      role: "",
      contactDepartment: "",
      departmentId: "",
      emails: [""],
      phones: [""],
      email: "",
      phone: "",
      image: "",
      status: "UNQUALIFIED",
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // When panel closes or reopens, reset form so unsaved inputs are not retained
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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
      setForm((prev) => ({ ...prev, image: data.url }));
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
    setForm((prev) => ({ ...prev, image: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      return toast({ title: "Validation", description: "Person name is required", type: "warning" });
    }
    if (!prefillCompany?.id) {
      return toast({ 
        title: "Account Required", 
        description: "A contact must be associated with an account. Please select or create an account first.", 
        type: "warning" 
      });
    }

    const cleanEmails = form.emails.map((e) => e.trim()).filter(Boolean);
    const cleanPhones = form.phones.map((p) => p.trim()).filter(Boolean);

    const invalidEmail = cleanEmails.find((em) => !isValidEmail(em));
    if (invalidEmail) {
      return toast({
        title: "Invalid Email Address",
        description: `Email "${invalidEmail}" is invalid. Please enter a valid email format (e.g. name@company.com).`,
        type: "warning",
      });
    }

    setIsSubmitting(true);
    try {
      const created = await createContact({
        name: form.name.trim(),
        role: form.role.trim() || undefined,
        contactDepartment: form.contactDepartment.trim() || undefined,
        departmentId: form.departmentId || undefined,
        image: form.image || undefined,
        emails: cleanEmails,
        phones: cleanPhones,
        email: cleanEmails[0] || undefined,
        phone: cleanPhones[0] || undefined,
        status: form.status,
        companyId: prefillCompany.id,
      });

      toast({
        title: "Person Created",
        description: `Successfully added ${form.name} to ${prefillCompany.name}`,
        type: "success",
      });

      // Reset form
      setAvatarPreview(null);
      setForm({
        name: "",
        role: "",
        contactDepartment: "",
        departmentId: "",
        emails: [""],
        phones: [""],
        email: "",
        phone: "",
        image: "",
        status: "UNQUALIFIED",
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
    <SlideOverPanel
      isOpen={isOpen}
      onClose={handleClose}
      title="Add New Person"
      subtitle={
        prefillCompany?.name 
          ? `Adding contact under ${prefillCompany.name}` 
          : "Register a contact person for the selected account"
      }
      widthClass="w-[650px]"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Linked Account Banner */}
        <div className="bg-[#252728] border border-[#4E4F50]/50 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#3A3B3C] flex items-center justify-center text-[#C7F33C] shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                Target Account
              </span>
              <span className="text-xs font-bold text-slate-100 truncate block">
                {prefillCompany?.name || "No Account Selected"}
              </span>
            </div>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-[#C7F33C] text-black font-bold shrink-0">
            Active Account
          </span>
        </div>

        {/* Profile Picture Uploader */}
        <div className="bg-[#3A3B3C] rounded-2xl p-5 border-0 flex items-center gap-5">
          <div className="relative group">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-[#252728] border-2 border-[#C7F33C]/40 flex items-center justify-center shrink-0">
              {avatarPreview ? (
                <Image
                  src={avatarPreview}
                  alt="Avatar preview"
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              ) : (
                <UserPlus className="w-7 h-7 text-slate-400" />
              )}
            </div>
            {isUploadingImage && (
              <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-[#C7F33C] animate-spin" />
              </div>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-200">Contact Avatar / Photo</span>
              <span className="text-xs text-slate-400 font-normal">Optional</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload face image or photo (Max 5MB)
            </p>

            <div className="flex items-center gap-2 mt-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="create-person-avatar-file"
              />
              <label
                htmlFor="create-person-avatar-file"
                className="cursor-pointer px-3 py-1 rounded-xl text-xs font-semibold bg-[#252728] text-slate-200 hover:bg-[#C7F33C] hover:text-black transition-colors flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Photo</span>
              </label>

              {avatarPreview && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="p-1 rounded-lg text-red-400 hover:bg-red-950/40 transition-colors"
                  title="Remove Photo"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Section: Personal Details */}
        <div className="bg-[#3A3B3C] rounded-2xl p-5 space-y-4 border-0">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[#C7F33C]" />
            Personal & Contact Details
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Full Name */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300">
                Full Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Somchai Suksan"
                required
                className="bg-[#252728] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0"
              />
            </div>

            {/* Position / Role */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5 text-[#C7F33C]" />
                Position / Job Title
              </label>
              <input
                type="text"
                name="role"
                value={form.role}
                onChange={handleChange}
                placeholder="e.g. Procurement Lead / MD"
                className="bg-[#252728] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0"
              />
            </div>

            {/* Department */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-[#C7F33C]" />
                Department
              </label>
              <input
                type="text"
                name="contactDepartment"
                value={form.contactDepartment}
                onChange={handleChange}
                placeholder="e.g. HR, Purchasing, Procurement, Marketing"
                className="bg-[#252728] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0"
              />
            </div>

            {/* Multi-Email Addresses */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>Email Addresses</span>
                </label>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, emails: [...prev.emails, ""] }))}
                  className="text-xs font-semibold text-[#C7F33C] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  + Add Email
                </button>
              </div>
              <div className="space-y-2">
                {form.emails.map((emailVal, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <EmailInput
                      value={emailVal}
                      onChange={(val) => {
                        const next = [...form.emails];
                        next[idx] = val;
                        setForm((prev) => ({ ...prev, emails: next, email: next[0] || "" }));
                      }}
                      placeholder="e.g. contact@company.com"
                      className="flex-1"
                    />
                    {form.emails.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = form.emails.filter((_, i) => i !== idx);
                          setForm((prev) => ({ ...prev, emails: next.length > 0 ? next : [""], email: next[0] || "" }));
                        }}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-[#252728] rounded-xl transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-Phone Numbers with International Searchable Dial Code */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#C7F33C]" />
                  <span>Phone Numbers</span>
                </label>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, phones: [...prev.phones, ""] }))}
                  className="text-xs font-semibold text-[#C7F33C] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  + Add Phone
                </button>
              </div>
              <div className="space-y-2">
                {form.phones.map((phoneVal, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <PhoneInputWithCountry
                      value={phoneVal}
                      onChange={(val) => {
                        const next = [...form.phones];
                        next[idx] = val;
                        setForm((prev) => ({ ...prev, phones: next, phone: next[0] || "" }));
                      }}
                      placeholder="81 234 5678"
                      className="flex-1"
                    />
                    {form.phones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = form.phones.filter((_, i) => i !== idx);
                          setForm((prev) => ({ ...prev, phones: next.length > 0 ? next : [""], phone: next[0] || "" }));
                        }}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-[#252728] rounded-xl transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Initial Qualification */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Initial Qualification
              </label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="bg-[#252728] rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0 cursor-pointer"
              >
                <option value="UNQUALIFIED">Unqualified</option>
                <option value="QUALIFIED">Qualified</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#3A3B3C] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin text-black" />
            ) : (
              <UserPlus className="w-4 h-4 text-black" />
            )}
            <span>Create Person</span>
          </button>
        </div>
      </form>
    </SlideOverPanel>
  );
}
