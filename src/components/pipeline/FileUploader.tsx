"use client";

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import imageCompression from 'browser-image-compression';
import { Upload, File, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useDialog } from '@/providers/DialogProvider';

import { Attachment } from '@prisma/client';

interface FileUploaderProps {
  opportunityId: string;
  onUploadSuccess: (attachment: Attachment) => void;
}

export default function FileUploader({ opportunityId, onUploadSuccess }: FileUploaderProps) {
  const [progressFiles, setProgressFiles] = useState<{name: string, status: 'uploading'|'success'|'error'}[]>([]);
  const { toast } = useDialog();

  const handleUpload = useCallback(async (files: File[]) => {
    if (!files.length) return;

    // Filter out videos
    const allowedFiles: File[] = [];
    for (const f of files) {
      const isVideo = f.type.startsWith('video/') || Boolean(f.name.match(/\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v|3gp)$/i));
      if (isVideo) {
        toast({
          title: "ไม่อนุญาตให้อัปโหลดวิดีโอ",
          description: `"${f.name}" เป็นไฟล์วิดีโอ กรุณาอัปโหลดเข้า Google Drive หรือ YouTube แล้วนำลิงก์มาแนบแทนครับ`,
          type: "warning"
        });
      } else {
        allowedFiles.push(f);
      }
    }

    if (!allowedFiles.length) return;
    
    const newProgress = allowedFiles.map(f => ({ name: f.name, status: 'uploading' as const }));
    setProgressFiles(prev => [...newProgress, ...prev]);

    for (let i = 0; i < allowedFiles.length; i++) {
      const file = allowedFiles[i];
      const isImage = file.type.startsWith('image/');
      const isRaw = !isImage;

      try {
        let fileToUpload = file;

        // Compress if image
        if (isImage) {
          const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
          };
          fileToUpload = await imageCompression(file, options);
        }

        // Convert to Base64
        const fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(fileToUpload);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
        });

        // Upload
        const response = await fetch('/api/upload/opportunity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            opportunityId,
            fileBase64,
            fileName: file.name,
            fileType: file.type,
            size: fileToUpload.size,
            isRaw
          })
        });

        const data = await response.json();
        if (data.success) {
          onUploadSuccess(data.attachment);
          setProgressFiles(prev => prev.map(p => p.name === file.name ? { ...p, status: 'success' } : p));
        } else {
          throw new Error(data.error || "Upload failed");
        }
      } catch (error) {
        console.error("Upload error:", error);
        toast({ title: "Upload Failed", description: `Could not upload ${file.name}`, type: "error" });
        setProgressFiles(prev => prev.map(p => p.name === file.name ? { ...p, status: 'error' } : p));
      }
    }
    
    // Clear success items after 3 seconds
    setTimeout(() => {
      setProgressFiles(prev => prev.filter(p => p.status !== 'success'));
    }, 3000);
  }, [opportunityId, onUploadSuccess, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleUpload,
    // Disallow videos by specifying accepted file types
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
    },
    maxSize: 4.5 * 1024 * 1024,
    onDropRejected: () => {
      toast({ title: "ไฟล์ไม่ถูกต้องหรือมีขนาดเกิน 4.5MB", description: "รองรับเฉพาะไฟล์รูปภาพและเอกสาร (ไม่อนุญาตไฟล์วิดีโอ)", type: "warning" });
    }
  });

  return (
    <div className="flex flex-col gap-3">
      <div 
        {...getRootProps()} 
        className={`w-full p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-[#C7F33C] bg-[#C7F33C]/10' : 'border-[#4E4F50] bg-[#1C1C1D] hover:bg-[#252728]'}`}
      >
        <input {...getInputProps()} />
        <Upload className={`w-8 h-8 mb-3 ${isDragActive ? 'text-[#C7F33C]' : 'text-slate-400'}`} />
        <h4 className="text-sm font-semibold text-slate-200 mb-1">
          {isDragActive ? "Drop files here..." : "Click or drag files to upload"}
        </h4>
        <p className="text-xs text-slate-400">
          Supports JPG, PNG, PDF, Docs (No video files allowed)
        </p>
      </div>

      {progressFiles.length > 0 && (
        <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
          {progressFiles.map((file, idx) => (
            <div key={`${file.name}-${idx}`} className="flex items-center justify-between p-2 rounded-lg bg-[#252728] border border-[#3A3B3C]">
              <div className="flex items-center gap-2 overflow-hidden">
                {file.name.match(/\.(jpeg|jpg|png|gif|webp)$/i) ? <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" /> : <File className="w-4 h-4 text-slate-400 shrink-0" />}
                <span className="text-sm text-slate-200 truncate">{file.name}</span>
              </div>
              <div className="shrink-0 ml-2">
                {file.status === 'uploading' && <Loader2 className="w-4 h-4 text-[#C7F33C] animate-spin" />}
                {file.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {file.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
