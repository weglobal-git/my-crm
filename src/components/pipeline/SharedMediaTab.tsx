"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { OpportunityWithRelations } from "./KanbanCard";
import { ActivityLog } from "@prisma/client";
import {
  Folder,
  Download,
  FileText,
  Link2,
  ExternalLink,
  Image as ImageIcon,
  Briefcase,
  X,
  Cloud,
} from "lucide-react";
import { formatBytes, getOptimizedCloudinaryUrl } from "@/lib/utils";
import { getAccountSharedMedia } from "@/lib/actions/contact";

export interface AttachmentData {
  id: string;
  fileType: string;
  cloudinaryUrl?: string | null;
  filename?: string;
  fileName?: string;
  size: number;
  createdAt: string | Date;
  googleDriveFileId?: string | null;
  deal?: {
    id: string;
    topic: string;
    status: string;
    createdAt?: string | Date;
  };
  [key: string]: unknown;
}

export interface LinkData {
  url: string;
  logId?: string;
  date: string | Date;
  deal?: {
    id: string;
    topic: string;
    status: string;
    createdAt?: string | Date;
  };
}

export interface SharedMediaTabProps {
  deal?: OpportunityWithRelations;
  activityLogs?: ActivityLog[];
  companyId?: string;
  onImageClick?: (url: string, index?: number, allUrls?: string[]) => void;
  groupByDeal?: boolean;
}

type TabType = "images" | "links" | "files";

interface DealGroup<T> {
  dealId: string;
  dealTopic: string;
  dealStatus: string;
  items: T[];
}

function groupItemsByDeal<T extends { deal?: { id: string; topic: string; status: string } }>(
  items: T[]
): DealGroup<T>[] {
  const groupsMap = new Map<string, DealGroup<T>>();
  items.forEach((item) => {
    const dealId = item.deal?.id || "general";
    const dealTopic = item.deal?.topic || "General";
    const dealStatus = item.deal?.status || "OPEN";
    if (!groupsMap.has(dealId)) {
      groupsMap.set(dealId, { dealId, dealTopic, dealStatus, items: [] });
    }
    groupsMap.get(dealId)!.items.push(item);
  });
  // Rule: Do not show group if there are no items
  return Array.from(groupsMap.values()).filter((g) => g.items.length > 0);
}

export function SharedMediaTab({
  deal,
  activityLogs = [],
  companyId,
  onImageClick,
  groupByDeal = false,
}: SharedMediaTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<TabType>("images");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // 1. Account Mode SWR Fetcher
  const { data: accountMedia, isValidating: isAccountLoading } = useSWR(
    companyId ? ["account-shared-media", companyId] : null,
    () => getAccountSharedMedia(companyId!)
  );

  // 2. Deal Mode SWR Fetcher
  const dealFetcher = (url: string) =>
    fetch(url)
      .then((res) => res.json())
      .then((data) => (data.success ? data.attachments : []));

  const { data: rawDealAttachments, isValidating: isDealLoading } = useSWR(
    deal?.id ? `/api/opportunities/${deal.id}/attachments` : null,
    dealFetcher
  );

  const isLoading = companyId ? isAccountLoading : isDealLoading;

  // Unified Attachments
  const attachments: AttachmentData[] = useMemo(() => {
    if (companyId) return accountMedia?.attachments || [];
    return rawDealAttachments || [];
  }, [companyId, accountMedia, rawDealAttachments]);

  // Unified Links
  const links: LinkData[] = useMemo(() => {
    if (companyId) return accountMedia?.links || [];
    if (!activityLogs || activityLogs.length === 0) return [];

    const extractedLinks: LinkData[] = [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    activityLogs.forEach((log) => {
      if (!log.content) return;
      const cleanContent = log.content.replace(/\[ATTACHMENT:[^\]]+\]/g, "");
      const matches = cleanContent.match(urlRegex);
      if (matches) {
        matches.forEach((url) => {
          const cleanUrl = url.replace(/[),.]+$/, "");
          extractedLinks.push({
            url: cleanUrl,
            logId: log.id,
            date: new Date(log.createdAt),
          });
        });
      }
    });

    return extractedLinks.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [companyId, accountMedia, activityLogs]);

  const imagesAndVideos = useMemo(
    () =>
      attachments.filter(
        (a) => a.fileType?.startsWith("image/") || a.fileType?.startsWith("video/")
      ),
    [attachments]
  );

  const otherFiles = useMemo(
    () =>
      attachments.filter(
        (a) => !a.fileType?.startsWith("image/") && !a.fileType?.startsWith("video/")
      ),
    [attachments]
  );

  // Grouped datasets (only used if groupByDeal is true)
  const groupedImages = useMemo(
    () => (groupByDeal ? groupItemsByDeal(imagesAndVideos) : []),
    [groupByDeal, imagesAndVideos]
  );

  const groupedLinks = useMemo(
    () => (groupByDeal ? groupItemsByDeal(links) : []),
    [groupByDeal, links]
  );

  const groupedFiles = useMemo(
    () => (groupByDeal ? groupItemsByDeal(otherFiles) : []),
    [groupByDeal, otherFiles]
  );

  const allImageUrls = useMemo(() => {
    return imagesAndVideos
      .map(m => m.cloudinaryUrl)
      .filter(Boolean) as string[];
  }, [imagesAndVideos]);

  const handleImageClick = (url: string) => {
    if (onImageClick) {
      const idx = allImageUrls.indexOf(url);
      onImageClick(url, idx >= 0 ? idx : 0, allImageUrls);
    } else {
      setLightboxUrl(url);
    }
  };

  // Render individual media item (Image/Video)
  const renderMediaItem = (media: AttachmentData) => {
    const isImage = media.fileType?.startsWith("image/");
    const isArchivedInDrive = !media.cloudinaryUrl && Boolean(media.googleDriveFileId);
    const driveUrl = media.googleDriveFileId
      ? `https://drive.google.com/file/d/${media.googleDriveFileId}/view`
      : null;

    if (isArchivedInDrive && driveUrl) {
      return (
        <a
          key={media.id}
          href={driveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="aspect-square rounded-xl bg-[#1C1C1D] border border-[#3A3B3C] hover:border-[#C7F33C] p-2.5 flex flex-col items-center justify-center text-center group transition-colors cursor-pointer"
          title={`Open in Google Drive: ${media.fileName || media.filename}`}
        >
          <Cloud className="w-7 h-7 text-sky-400 group-hover:scale-110 transition-transform mb-1.5" />
          <span className="text-[11px] font-semibold text-slate-200 truncate w-full">
            {media.fileName || media.filename}
          </span>
          <span className="text-[9px] text-sky-400/90 font-medium">Google Drive</span>
        </a>
      );
    }

    if (isImage && media.cloudinaryUrl) {
      return (
        <div
          key={media.id}
          onClick={() => handleImageClick(media.cloudinaryUrl!)}
          className="cursor-pointer aspect-square rounded-xl overflow-hidden bg-[#1C1C1D] group relative border border-[#3A3B3C] hover:border-[#C7F33C] transition-colors block"
        >
          <img
            src={getOptimizedCloudinaryUrl(media.cloudinaryUrl, 300)}
            alt={media.fileName || media.filename || "Photo"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src =
                "https://placehold.co/600x400/252728/4E4F50?text=Image+Unavailable";
            }}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          {media.googleDriveFileId && (
            <div className="absolute top-1.5 right-1.5 bg-black/60 rounded-md p-0.5 text-sky-400">
              <Cloud className="w-3 h-3" />
            </div>
          )}
        </div>
      );
    }

    return (
      <a
        key={media.id}
        href={media.cloudinaryUrl || driveUrl || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="aspect-square rounded-xl overflow-hidden bg-[#1C1C1D] group relative border border-[#3A3B3C] hover:border-[#C7F33C] transition-colors block"
      >
        <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-2">
          <ImageIcon className="w-7 h-7 mb-1" />
          <span className="text-[10px] text-slate-400 truncate w-full text-center">
            {media.fileName || media.filename}
          </span>
        </div>
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <ExternalLink className="w-5 h-5 text-white" />
        </div>
      </a>
    );
  };

  // Render individual link item
  const renderLinkItem = (link: LinkData, idx: number) => {
    const formattedDate = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(link.date));

    return (
      <a
        key={link.logId || idx}
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 rounded-xl border border-[#4E4F50] bg-[#3A3B3C] hover:bg-[#4E4F50] hover:border-[#C7F33C] transition-colors group"
      >
        <div className="w-9 h-9 rounded-lg bg-[#C7F33C]/10 text-[#C7F33C] flex items-center justify-center shrink-0">
          <Link2 className="w-4 h-4" />
        </div>
        <div className="flex flex-col overflow-hidden min-w-0 flex-1">
          <span className="text-xs font-medium text-slate-100 truncate">{link.url}</span>
          <span className="text-[11px] text-slate-400">{formattedDate}</span>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 shrink-0" />
      </a>
    );
  };

  // Render individual file item
  const renderFileItem = (file: AttachmentData) => {
    const formattedDate = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(file.createdAt));

    const fileUrl =
      file.cloudinaryUrl ||
      (file.googleDriveFileId
        ? `https://drive.google.com/file/d/${file.googleDriveFileId}/view`
        : "#");

    return (
      <a
        key={file.id}
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between p-3 rounded-xl border border-[#4E4F50] bg-[#3A3B3C] hover:bg-[#4E4F50] transition-colors group"
      >
        <div className="flex items-center gap-3 overflow-hidden min-w-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-orange-500/10 text-orange-400">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex flex-col overflow-hidden min-w-0">
            <span className="text-xs font-semibold text-slate-100 truncate">
              {file.fileName || file.filename}
            </span>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>{formatBytes(file.size)}</span>
              <span>•</span>
              <span>{formattedDate}</span>
              {file.googleDriveFileId && (
                <>
                  <span>•</span>
                  <span className="text-sky-400 flex items-center gap-1 font-medium">
                    <Cloud className="w-3 h-3" /> Drive
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 pl-2">
          <div className="p-2 bg-[#252728] group-hover:bg-[#1C1C1D] rounded-lg text-slate-300 transition-colors">
            <Download className="w-3.5 h-3.5" />
          </div>
        </div>
      </a>
    );
  };

  // Render Deal Group Header
  const renderDealHeader = (dealTopic: string, dealStatus: string, itemCount: number) => {
    return (
      <div className="flex items-center justify-between pb-2 border-b border-[#3A3B3C]/80 mt-1">
        <div className="flex items-center gap-2 min-w-0">
          <Briefcase className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
          <span className="text-xs font-bold text-slate-200 truncate">{dealTopic}</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 uppercase ${
              dealStatus === "WON"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : dealStatus === "LOST"
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
            }`}
          >
            {dealStatus}
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-medium shrink-0">
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#252728]">
      {/* Sticky Sub-Tab Header */}
      <div className="pb-0 shrink-0">
        <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-3.5">
          <Folder className="w-5 h-5 text-[#C7F33C]" />
          Shared Media
        </h3>

        <div className="flex gap-1 bg-[#1C1C1D] p-1 rounded-xl w-full">
          <button
            type="button"
            onClick={() => setActiveSubTab("images")}
            className={`flex-1 justify-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === "images"
                ? "bg-[#3A3B3C] text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Photos</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("links")}
            className={`flex-1 justify-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === "links"
                ? "bg-[#3A3B3C] text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Links</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("files")}
            className={`flex-1 justify-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === "files"
                ? "bg-[#3A3B3C] text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Files</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto pt-4 custom-scrollbar">
        {/* 1. PHOTOS SUB-TAB */}
        {activeSubTab === "images" && (
          <div className="flex flex-col gap-4">
            {isLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="aspect-square bg-[#3A3B3C] animate-pulse rounded-xl" />
                ))}
              </div>
            ) : imagesAndVideos.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 text-xs">No photos shared yet.</p>
              </div>
            ) : groupByDeal ? (
              // Timeline Grouped by Deals (Only showing groups with items)
              <div className="space-y-6">
                {groupedImages.map((group) => (
                  <div key={group.dealId} className="space-y-2.5">
                    {renderDealHeader(group.dealTopic, group.dealStatus, group.items.length)}
                    <div className="grid grid-cols-3 gap-2">
                      {group.items.map(renderMediaItem)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Single Deal Grid
              <div className="grid grid-cols-3 gap-2">
                {imagesAndVideos.map(renderMediaItem)}
              </div>
            )}
          </div>
        )}

        {/* 2. LINKS SUB-TAB */}
        {activeSubTab === "links" && (
          <div className="flex flex-col gap-2">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-[#3A3B3C] animate-pulse rounded-xl" />
                ))}
              </div>
            ) : links.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 text-xs">No links shared yet.</p>
              </div>
            ) : groupByDeal ? (
              // Timeline Grouped by Deals (Only showing groups with items)
              <div className="space-y-6">
                {groupedLinks.map((group) => (
                  <div key={group.dealId} className="space-y-2.5">
                    {renderDealHeader(group.dealTopic, group.dealStatus, group.items.length)}
                    <div className="flex flex-col gap-2">
                      {group.items.map(renderLinkItem)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Single Deal Links
              <div className="flex flex-col gap-2">{links.map(renderLinkItem)}</div>
            )}
          </div>
        )}

        {/* 3. FILES SUB-TAB */}
        {activeSubTab === "files" && (
          <div className="flex flex-col gap-2">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-[#3A3B3C] animate-pulse rounded-xl" />
                ))}
              </div>
            ) : otherFiles.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 text-xs">No files shared yet.</p>
              </div>
            ) : groupByDeal ? (
              // Timeline Grouped by Deals (Only showing groups with items)
              <div className="space-y-6">
                {groupedFiles.map((group) => (
                  <div key={group.dealId} className="space-y-2.5">
                    {renderDealHeader(group.dealTopic, group.dealStatus, group.items.length)}
                    <div className="flex flex-col gap-2">
                      {group.items.map(renderFileItem)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Single Deal Files
              <div className="flex flex-col gap-2">{otherFiles.map(renderFileItem)}</div>
            )}
          </div>
        )}
      </div>

      {/* Built-in Lightbox Overlay for Image Preview */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute top-6 right-6 p-2 rounded-full bg-[#1C1C1D]/80 text-white hover:bg-[#C7F33C] hover:text-black transition-colors cursor-pointer"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxUrl}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            alt="Preview"
          />
        </div>
      )}
    </div>
  );
}
