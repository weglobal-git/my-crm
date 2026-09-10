'use client';

import React, { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface DealImageLightboxProps {
  lightbox: {
    images: string[];
    currentIndex: number;
  } | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function DealImageLightbox({
  lightbox,
  onClose,
  onNavigate,
}: DealImageLightboxProps) {
  useEffect(() => {
    if (!lightbox) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        if (lightbox.images.length <= 1) return;
        const nextIdx = lightbox.currentIndex > 0 ? lightbox.currentIndex - 1 : lightbox.images.length - 1;
        onNavigate(nextIdx);
      } else if (e.key === 'ArrowRight') {
        if (lightbox.images.length <= 1) return;
        const nextIdx = lightbox.currentIndex < lightbox.images.length - 1 ? lightbox.currentIndex + 1 : 0;
        onNavigate(nextIdx);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightbox, onClose, onNavigate]);

  if (!lightbox || !lightbox.images || lightbox.images.length === 0) return null;

  return (
    <div
      className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Header Controls: Counter badge + Close button */}
      <div className="absolute top-6 inset-x-6 flex items-center justify-between z-10 pointer-events-none">
        {lightbox.images.length > 1 ? (
          <div className="bg-[#1C1C1D]/80 border border-[#3A3B3C] text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-md pointer-events-auto">
            {lightbox.currentIndex + 1} / {lightbox.images.length}
          </div>
        ) : (
          <div />
        )}

        <button
          type="button"
          className="p-2.5 rounded-full bg-[#1C1C1D]/80 border border-[#3A3B3C] text-slate-200 hover:bg-[#C7F33C] hover:text-black transition-all cursor-pointer pointer-events-auto"
          onClick={onClose}
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Previous Button */}
      {lightbox.images.length > 1 && (
        <button
          type="button"
          className="absolute left-6 z-10 p-3 rounded-full bg-[#1C1C1D]/80 border border-[#3A3B3C] text-slate-200 hover:bg-[#C7F33C] hover:text-black transition-all cursor-pointer backdrop-blur-md hover:scale-105 active:scale-95"
          onClick={(e) => {
            e.stopPropagation();
            const prevIdx = lightbox.currentIndex > 0 ? lightbox.currentIndex - 1 : lightbox.images.length - 1;
            onNavigate(prevIdx);
          }}
          title="Previous (Left Arrow)"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Main Image */}
      <div className="relative max-w-full max-h-full flex items-center justify-center">
        <img
          key={lightbox.images[lightbox.currentIndex]}
          src={lightbox.images[lightbox.currentIndex]}
          className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl transition-all"
          onClick={(e) => e.stopPropagation()}
          alt={`Preview ${lightbox.currentIndex + 1}`}
        />
      </div>

      {/* Next Button */}
      {lightbox.images.length > 1 && (
        <button
          type="button"
          className="absolute right-6 z-10 p-3 rounded-full bg-[#1C1C1D]/80 border border-[#3A3B3C] text-slate-200 hover:bg-[#C7F33C] hover:text-black transition-all cursor-pointer backdrop-blur-md hover:scale-105 active:scale-95"
          onClick={(e) => {
            e.stopPropagation();
            const nextIdx = lightbox.currentIndex < lightbox.images.length - 1 ? lightbox.currentIndex + 1 : 0;
            onNavigate(nextIdx);
          }}
          title="Next (Right Arrow)"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Bottom Thumbnail Strip */}
      {lightbox.images.length > 1 && (
        <div
          className="absolute bottom-6 inset-x-0 flex justify-center items-center gap-2 z-10 pointer-events-auto px-4 overflow-x-auto max-w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-[#1C1C1D]/80 border border-[#3A3B3C] p-1.5 rounded-2xl flex items-center gap-2 backdrop-blur-md">
            {lightbox.images.map((imgUrl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onNavigate(idx)}
                className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                  idx === lightbox.currentIndex
                    ? 'border-[#C7F33C] scale-105'
                    : 'border-transparent opacity-50 hover:opacity-100 hover:border-slate-500'
                }`}
              >
                <img src={imgUrl} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
