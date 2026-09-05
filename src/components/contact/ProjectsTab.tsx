"use client";

import Link from "next/link";
import { 
  Briefcase, 
  Calendar, 
  ExternalLink, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  Tag
} from "lucide-react";
import { OpportunityStatus } from "@prisma/client";

interface OpportunityItem {
  id: string;
  topic: string;
  value: number | null;
  currency: string | null;
  status: OpportunityStatus;
  dueDate: Date | string | null;
  createdAt: Date | string;
  stage?: { id: string; name: string } | null;
  owner: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
  teamMembers?: {
    id: string;
    name: string | null;
    email: string | null;
  }[];
}

export function ProjectsTab({
  companyName,
  opportunities = [],
  maskedOpportunityCount = 0,
}: {
  companyName: string;
  opportunities?: OpportunityItem[];
  maskedOpportunityCount?: number;
}) {
  const formatCurrency = (val: number | null, curr: string | null = "THB") => {
    if (val === null || val === undefined) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: curr || "THB",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(date));
  };

  const getStatusBadge = (status: OpportunityStatus) => {
    switch (status) {
      case "WON":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/60 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> WON
          </span>
        );
      case "LOST":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-950 text-red-400 border border-red-800/60 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> LOST
          </span>
        );
      case "COMPLETED":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800/60">
            COMPLETED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#C7F33C]/20 text-[#C7F33C] border border-[#C7F33C]/40">
            OPEN
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Info */}
      <div className="flex items-center justify-between pb-4 border-b border-[#3A3B3C]">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-[#C7F33C]" />
            Deals / Projects for Account: {companyName}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Showing project cards accessible by your department permissions.
          </p>
        </div>

        <Link
          href={`/pipeline?search=${encodeURIComponent(companyName)}`}
          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#3A3B3C] text-slate-200 hover:bg-[#4E4F50] transition-colors flex items-center gap-1.5"
        >
          <span>Open in Pipeline</span>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
        </Link>
      </div>

      {/* Cross-Department Masked Alert */}
      {maskedOpportunityCount > 0 && (
        <div className="bg-amber-950/30 rounded-xl p-3.5 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex flex-col text-xs">
            <span className="font-bold text-amber-200">
              Cross-Department Projects Notice
            </span>
            <span className="text-amber-300/80 mt-0.5">
              There are{" "}
              <strong className="text-amber-100 underline">
                {maskedOpportunityCount} additional project(s)
              </strong>{" "}
              associated with this account belonging to other departments.
            </span>
          </div>
        </div>
      )}

      {/* Projects List */}
      {opportunities.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-[#3A3B3C]/40 rounded-2xl flex flex-col items-center gap-2">
          <Briefcase className="w-8 h-8 text-slate-500 mb-1" />
          <span className="font-semibold text-slate-200">
            No projects found for this account
          </span>
          <span className="text-xs text-slate-500">
            Projects created in Pipeline for this account will appear here.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {opportunities.map((deal) => (
            <div
              key={deal.id}
              className="bg-[#3A3B3C] rounded-2xl p-4 flex flex-col gap-3 hover:bg-[#474849] transition-colors"
            >
              {/* Top line: Topic & Status */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-bold text-slate-100 truncate">
                    {deal.topic}
                  </span>
                  {deal.stage && (
                    <span className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-slate-500" />
                      Stage: {deal.stage.name}
                    </span>
                  )}
                </div>

                <div className="shrink-0">{getStatusBadge(deal.status)}</div>
              </div>

              {/* Bottom line: Value, Date, Owner */}
              <div className="flex items-center justify-between pt-2 border-t border-[#252728] text-xs text-slate-300">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 font-semibold text-[#C7F33C]">
                    <span>{formatCurrency(deal.value, deal.currency)}</span>
                  </div>

                  <div className="flex items-center gap-1 text-slate-400">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>Due: {formatDate(deal.dueDate)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#252728] flex items-center justify-center text-[10px] font-bold text-slate-300">
                    {deal.owner.name ? deal.owner.name.slice(0, 2).toUpperCase() : "U"}
                  </div>
                  <span className="text-slate-400 truncate max-w-[120px]">
                    {deal.owner.name || "Unassigned"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
