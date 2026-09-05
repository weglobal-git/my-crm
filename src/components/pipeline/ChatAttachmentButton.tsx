"use client";

import React, { useRef } from 'react';
import { Paperclip } from 'lucide-react';
import { useDialog } from '@/providers/DialogProvider';

interface ChatAttachmentButtonProps {
  onFileSelect: (files: File[]) => void;
}

export function ChatAttachmentButton({ onFileSelect }: ChatAttachmentButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useDialog();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    
    const selectedFiles = Array.from(e.target.files);
    
    // Validate: Prohibit videos and validate size
    const validFiles = selectedFiles.filter(file => {
      const isVideo = file.type.startsWith('video/') || Boolean(file.name.match(/\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v|3gp)$/i));
      if (isVideo) {
        toast({
          title: "ไม่อนุญาตให้อัปโหลดวิดีโอ",
          description: `"${file.name}" เป็นไฟล์วิดีโอ กรุณาอัปโหลดเข้า Google Drive หรือ YouTube แล้วนำลิงก์มาแนบแทนครับ`,
          type: "warning"
        });
        return false;
      }
      if (file.size > 4.5 * 1024 * 1024 && !file.type.startsWith('image/')) {
        toast({ title: "File too large", description: `"${file.name}" exceeds 4.5MB limit.`, type: "warning" });
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      onFileSelect(validFiles);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[#4E4F50] text-slate-400 hover:text-slate-200"
        title="Attach Files or Media"
      >
        <Paperclip className="w-5 h-5" />
      </button>
    </>
  );
}
