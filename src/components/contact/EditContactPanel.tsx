"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { SlideOverPanel, SlideOverTab } from "@/components/ui/SlideOverPanel";
import { usePermissions } from "@/providers/PermissionProvider";
import { getContactById } from "@/lib/actions/contact";
import { InformationTab } from "./InformationTab";
import { ProjectsTab } from "./ProjectsTab";
import { EmailTab } from "./EmailTab";
import { Loader2 } from "lucide-react";

export function EditContactPanel({
  contactId,
  isOpen,
  onClose,
  onContactUpdated,
  onContactDeleted,
}: {
  contactId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onContactUpdated: () => void;
  onContactDeleted: () => void;
}) {
  const { visibleRightMenus } = usePermissions();
  const rightMenus = visibleRightMenus("contact");

  // Map Right-Menu permissions to SlideOverTabs
  const tabs: SlideOverTab[] = rightMenus.map((menu) => {
    const key = menu.key.split(".").pop() || "information";
    return {
      key,
      label: menu.label,
      icon: menu.iconName || "Building2",
    };
  });

  const [activeTab, setActiveTab] = useState<string>("information");

  // Keep active tab valid with permissions
  const resolvedTab = tabs.length > 0 && !tabs.some((t) => t.key === activeTab) ? tabs[0].key : activeTab;
  if (resolvedTab !== activeTab) {
    setActiveTab(resolvedTab);
  }

  // Fetch contact details
  const { data: contact, isLoading, mutate } = useSWR(
    contactId && isOpen ? `contact-detail-${contactId}` : null,
    () => (contactId ? getContactById(contactId) : null),
    { revalidateOnFocus: false }
  );

  const handleUpdated = useCallback(() => {
    mutate();
    onContactUpdated();
  }, [mutate, onContactUpdated]);

  const handleDeleted = useCallback(() => {
    onClose();
    onContactDeleted();
  }, [onClose, onContactDeleted]);

  return (
    <SlideOverPanel
      isOpen={isOpen && !!contactId}
      onClose={onClose}
      title={contact ? contact.name : "Loading..."}
      subtitle={
        contact
          ? `${contact.company.name}${contact.company.country ? ` • ${contact.company.country}` : ""}`
          : undefined
      }
      tabs={tabs.length > 0 ? tabs : undefined}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {isLoading || !contact ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#C7F33C] animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === "information" && (
            <InformationTab
              contact={contact}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          )}

          {activeTab === "projects" && (
            <ProjectsTab
              companyName={contact.company.name}
              opportunities={contact.visibleOpportunities}
              maskedOpportunityCount={contact.maskedOpportunityCount}
            />
          )}

          {activeTab === "email" && (
            <EmailTab
              customerName={contact.name}
              customerEmail={contact.isMasked ? contact.email : (contact.rawEmail || contact.email)}
            />
          )}
        </>
      )}
    </SlideOverPanel>
  );
}
