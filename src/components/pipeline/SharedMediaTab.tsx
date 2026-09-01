"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { OpportunityWithRelations } from "./KanbanCard";
import { Folder, Download, FileText, Link2, ExternalLink, Image as ImageIcon } from "lucide-react";
import { formatBytes, getOptimizedCloudinaryUrl } from "@/lib/utils";

interface AttachmentData {
  id: string;
  fileType: string;
  cloudinaryUrl: string;
  filename: string;
  fileName?: string;
  size: number;
  createdAt: string | Date;
  [key: string]: unknown;
}
import { ActivityLog } from "@prisma/client";

interface SharedMediaTabProps {
  deal: OpportunityWithRelations;
  activityLogs: ActivityLog[];
  onImageClick?: (url: string) => void;
}

type TabType = "images" | "links" | "files";

export function SharedMediaTab({ deal, activityLogs, onImageClick }: SharedMediaTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<TabType>("images");

  const fetcher = (url: string) => fetch(url).then(res => res.json()).then(data => data.success ? data.attachments : []);
  
  const { data: rawAttachments, isValidating: isLoading } = useSWR(
    `/api/opportunities/${deal.id}/attachments`,
    fetcher
  );
  
  const attachments = rawAttachments || [];

  // Extract Links from ActivityLogs
  const links = useMemo(() => {
    const extractedLinks: { url: string; logId: string; date: Date }[] = [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    
    activityLogs.forEach(log => {
      if (!log.content) return;
      // Strip attachments first so we don't pick up image URLs
      const cleanContent = log.content.replace(/\[ATTACHMENT:[^\]]+\]/g, '');
      const matches = cleanContent.match(urlRegex);
      if (matches) {
        matches.forEach(url => {
          extractedLinks.push({
            url,
            logId: log.id,
            date: new Date(log.createdAt)
          });
        });
      }
    });
    
    return extractedLinks.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [activityLogs]);

  const imagesAndVideos = attachments.filter((a: AttachmentData) => a.fileType.startsWith('image/') || a.fileType.startsWith('video/'));
  const otherFiles = attachments.filter((a: AttachmentData) => !a.fileType.startsWith('image/') && !a.fileType.startsWith('video/'));

  return (
    <div className="flex flex-col h-full bg-[#252728]">
      {/* Sticky Header */}
      <div className="pb-0 shrink-0">
        <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-4">
          <Folder className="w-5 h-5 text-[#C7F33C]" />
          Shared Media
        </h3>

        <div className="flex gap-1 bg-[#1C1C1D] p-1 rounded-xl w-full">
          <button
            onClick={() => setActiveSubTab("images")}
            className={`flex-1 justify-center px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
              activeSubTab === "images" ? "bg-[#3A3B3C] text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ImageIcon className="w-4 h-4" /> Photos & Videos
          </button>
          <button
            onClick={() => setActiveSubTab("links")}
            className={`flex-1 justify-center px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
              activeSubTab === "links" ? "bg-[#3A3B3C] text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Link2 className="w-4 h-4" /> Links
          </button>
          <button
            onClick={() => setActiveSubTab("files")}
            className={`flex-1 justify-center px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
              activeSubTab === "files" ? "bg-[#3A3B3C] text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-4 h-4" /> Files
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto pt-4 custom-scrollbar">
        
        {/* IMAGES & VIDEOS TAB */}
        {activeSubTab === "images" && (
          <div className="flex flex-col gap-4">
            {isLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="aspect-square bg-[#3A3B3C] animate-pulse rounded-xl" />
                ))}
              </div>
            ) : imagesAndVideos.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-slate-400 text-sm">No photos or videos shared yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {imagesAndVideos.map((media: AttachmentData) => {
                  if (media.fileType.startsWith('image/')) {
                    return (
                      <div 
                        key={media.id} 
                        onClick={() => onImageClick?.(media.cloudinaryUrl)}
                        className="cursor-pointer aspect-square rounded-xl overflow-hidden bg-[#1C1C1D] group relative border border-[#3A3B3C] hover:border-[#C7F33C] transition-colors block"
                      >
                        <img 
                          src={getOptimizedCloudinaryUrl(media.cloudinaryUrl, 300)} 
                          alt={media.fileName} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = "https://placehold.co/600x400/252728/4E4F50?text=Image+Unavailable";
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      </div>
                    );
                  }
                  
                  return (
                    <a 
                      key={media.id} 
                      href={media.cloudinaryUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="aspect-square rounded-xl overflow-hidden bg-[#1C1C1D] group relative border border-[#3A3B3C] hover:border-[#C7F33C] transition-colors block"
                    >
                      <div className="w-full h-full flex items-center justify-center text-slate-500">
                        <ImageIcon className="w-8 h-8" />
                      </div>
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <ExternalLink className="w-6 h-6 text-white" />
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* LINKS TAB */}
        {activeSubTab === "links" && (
          <div className="flex flex-col gap-2">
            {links.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-slate-400 text-sm">No links shared yet.</p>
              </div>
            ) : (
              links.map((link, idx) => (
                <a 
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl border border-[#4E4F50] bg-[#3A3B3C] hover:bg-[#4E4F50] hover:border-[#C7F33C] transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#C7F33C]/10 text-[#C7F33C] flex items-center justify-center shrink-0">
                    <Link2 className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-medium text-slate-100 truncate">{link.url}</span>
                    <span className="text-xs text-slate-400">
                      {new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(link.date)}
                    </span>
                  </div>
                </a>
              ))
            )}
          </div>
        )}

        {/* FILES TAB */}
        {activeSubTab === "files" && (
          <div className="flex flex-col gap-2">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-[#3A3B3C] animate-pulse rounded-xl" />
                ))}
              </div>
            ) : otherFiles.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-slate-400 text-sm">No files shared yet.</p>
              </div>
            ) : (
              otherFiles.map((file: AttachmentData) => (
                <a 
                  key={file.id} 
                  href={file.cloudinaryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl border border-[#4E4F50] bg-[#3A3B3C] hover:bg-[#4E4F50] transition-colors group"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-orange-500/10 text-orange-400">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-sm font-semibold text-slate-100 truncate">{file.fileName}</span>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{formatBytes(file.size)}</span>
                        <span>•</span>
                        <span>
                          {new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(file.createdAt))}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 pl-2">
                    <div className="p-2 bg-[#252728] group-hover:bg-[#1C1C1D] rounded-lg text-slate-300 transition-colors">
                      <Download className="w-4 h-4" />
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
