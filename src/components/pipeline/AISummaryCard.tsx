"use client";

import React, { useState } from 'react';
import { Wand2, Edit2, Check, X, AlertTriangle, AlertCircle, Info } from 'lucide-react';

function formatDateTime(date: Date | string) {
  const d = new Date(date);
  return new Intl.DateTimeFormat('en-GB', { 
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
  }).format(d);
}

export interface AISummaryData {
  summary: string;
  eventType: string;
  importance: number;
  confidence: number;
  needsContext: boolean;
  nextActions: string[];
  blockers: string[];
}

export interface AISummaryEvent {
  id: string;
  occurredAt: Date | string;
  status: string;
  currentRevision: {
    id: string;
    revision: number;
    authorType: 'AI' | 'USER' | 'SYSTEM';
    summary: string;
    structuredData: unknown;
    eventType: string;
    importance: number;
    confidence: number | null;
    needsContext: boolean;
    providerKey: string | null;
    modelId: string | null;
    createdAt: Date | string;
  } | null;
}

interface AISummaryCardProps {
  event: AISummaryEvent;
  onSave?: (eventId: string, expectedRevisionId: string, summary: string) => Promise<void>;
}

export function AISummaryCard({ event, onSave }: AISummaryCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  const revision = event.currentRevision;
  if (!revision) return null;
  const structured = revision.structuredData && typeof revision.structuredData === 'object'
    ? revision.structuredData as Partial<AISummaryData>
    : {};

  const data: AISummaryData = {
    summary: revision.summary,
    eventType: revision.eventType,
    importance: revision.importance,
    confidence: revision.confidence ?? 0,
    needsContext: revision.needsContext,
    nextActions: Array.isArray(structured.nextActions) ? structured.nextActions : [],
    blockers: Array.isArray(structured.blockers) ? structured.blockers : []
  };

  const handleEditClick = () => {
    setEditValue(data!.summary);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(event.id, revision.id, editValue);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save AI summary", error);
    } finally {
      setIsSaving(false);
    }
  };

  const renderStars = (rating: number) => {
    return Array(5).fill(0).map((_, i) => (
      <span key={i} className={i < rating ? "text-[#C7F33C]" : "text-slate-600"}>★</span>
    ));
  };

  const isHighConfidence = data.confidence >= 0.8;

  return (
    <div className="group relative w-full flex flex-col gap-3 p-4 bg-[#252728]/80 hover:bg-[#2A2C2D] backdrop-blur-md rounded-2xl border border-[#4E4F50]/50 transition-colors shadow-lg">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#C7F33C]/20 flex items-center justify-center border border-[#C7F33C]/30">
            <Wand2 className="w-3.5 h-3.5 text-[#C7F33C]" />
          </div>
          <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
            AI Event Summary
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-700/50 text-[10px] font-medium text-slate-300 border border-slate-600/50">
            {data.eventType}
          </span>
        </div>
        
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1 font-medium" title={`Confidence: ${Math.round(data.confidence * 100)}%`}>
             <span className={isHighConfidence ? "text-[#C7F33C]" : "text-amber-400"}>
               {Math.round(data.confidence * 100)}%
             </span>
             <span className="text-slate-500">Conf</span>
          </div>
          <div className="flex gap-0.5 text-[10px]" title={`Importance: ${data.importance}/5`}>
            {renderStars(data.importance)}
          </div>
        </div>
      </div>

      {/* Needs Context Warning */}
      {data.needsContext && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>This event is ambiguous and may need historical context.</span>
        </div>
      )}

      {/* Main Summary */}
      <div className="relative">
        {isEditing ? (
          <div className="flex flex-col gap-2">
            <textarea
              className="w-full min-h-[80px] bg-[#1C1C1D] border border-[#C7F33C]/50 rounded-lg p-3 text-sm text-slate-200 outline-none resize-y"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              disabled={isSaving}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setIsEditing(false)} 
                disabled={isSaving}
                className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <button 
                onClick={handleSave} 
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#C7F33C] hover:bg-[#b5dc35] text-black text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <p className="text-[13px] leading-relaxed text-slate-200">
              {data.summary}
            </p>
            {onSave && (
              <button 
                onClick={handleEditClick}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-slate-700 text-slate-400 transition-all shrink-0"
                title="Correct AI Summary"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Structured Info */}
      {(data.nextActions.length > 0 || data.blockers.length > 0) && (
        <div className="flex flex-col gap-2 mt-1">
          {data.blockers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.blockers.map((blocker, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  {blocker}
                </div>
              ))}
            </div>
          )}
          
          {data.nextActions.length > 0 && (
            <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-slate-800/30 border border-slate-700/50">
              <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">Next Actions</span>
              <ul className="flex flex-col gap-1.5">
                {data.nextActions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-sm bg-slate-600 shrink-0 mt-1" />
                    <span className="leading-tight">{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      {/* Timestamp */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-700/50 pt-3">
         <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
           <Info className="h-3 w-3" />
           Revision {revision.revision} · {revision.authorType === 'USER' ? 'Corrected by user' : 'AI generated'}
         </span>
         <span className="text-[10px] text-slate-500 font-medium">
           {formatDateTime(event.occurredAt)}
         </span>
      </div>
    </div>
  );
}
