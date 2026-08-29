"use client";

import React, { useState } from 'react';
import { SettingsLayout, SettingsSidebar, SettingsSidebarItem, SettingsContent, SettingsGroup, SettingsRow } from '@/components/layout/SettingsLayout';
import { User, Globe, Moon, Bell, Camera } from 'lucide-react';
import Image from 'next/image';

import { Search } from 'lucide-react';

import { useSession } from 'next-auth/react';
import { updateProfileImage } from '@/lib/actions/profile';
import { useDialog } from '@/providers/DialogProvider';

type Tab = 'profile' | 'language' | 'theme' | 'notifications';

const PREDEFINED_AVATARS = Array.from({ length: 80 }).map((_, i) => {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${i + 1}`;
});

export default function UserProfileClient() {
  const { data: session, update } = useSession();
  const { toast } = useDialog();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [nickname, setNickname] = useState(session?.user?.name || 'User');
  const [language, setLanguage] = useState<'EN' | 'TH'>('EN');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleAvatarSelect = async (url: string) => {
    setIsUpdatingAvatar(true);
    try {
      await updateProfileImage(url);
      await update({ image: url }); // Update next-auth session immediately
      toast({ title: "Success", description: "Profile picture updated.", type: "success" });
      setIsAvatarModalOpen(false);
    } catch {
      toast({ title: "Error", description: "Failed to update profile picture.", type: "error" });
    } finally {
      setIsUpdatingAvatar(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please select an image under 5MB.", type: "error" });
      return;
    }

    setIsUpdatingAvatar(true);
    try {
      // Convert to Base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64data = reader.result;
        
        const response = await fetch('/api/upload/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64data })
        });

        if (!response.ok) throw new Error("Upload failed");

        const data = await response.json();
        
        // Update local session
        await update({ image: data.url });
        toast({ title: "Success", description: "Custom photo uploaded successfully.", type: "success" });
        setIsAvatarModalOpen(false);
      };
    } catch {
      toast({ title: "Error", description: "Failed to upload photo.", type: "error" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setIsUpdatingAvatar(false);
    }
  };

  const currentImage = session?.user?.image;
  const initial = session?.user?.name?.charAt(0).toUpperCase() || session?.user?.email?.charAt(0).toUpperCase() || "U";

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto">
      <SettingsLayout>
        {/* Left Sidebar - Navigation */}
        <SettingsSidebar 
          title="User Settings"
          searchInput={
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#d4ff3a] focus:bg-white transition-all"
              />
            </div>
          }
        >
          <SettingsSidebarItem 
            icon={<User />} 
            label="Profile Information" 
            isActive={activeTab === 'profile'} 
            onClick={() => setActiveTab('profile')}
            iconBgColor="bg-slate-800"
          />
          <SettingsSidebarItem 
            icon={<Globe />} 
            label="System Language" 
            isActive={activeTab === 'language'} 
            onClick={() => setActiveTab('language')}
            iconBgColor="bg-sky-500"
          />
          <SettingsSidebarItem 
            icon={<Moon />} 
            label="Theme & Appearance" 
            isActive={activeTab === 'theme'} 
            onClick={() => setActiveTab('theme')}
            iconBgColor="bg-indigo-500"
          />
          <SettingsSidebarItem 
            icon={<Bell />} 
            label="Notifications" 
            isActive={activeTab === 'notifications'} 
            onClick={() => setActiveTab('notifications')}
            iconBgColor="bg-rose-500"
          />
        </SettingsSidebar>

        {/* Right Content Area */}
        {activeTab === 'profile' && (
          <SettingsContent title="Profile Information">
            <SettingsGroup label="Personal Details">
              <SettingsRow>
                <div className="flex items-center gap-4 py-2">
                  <div className="relative group cursor-pointer" onClick={() => setIsAvatarModalOpen(true)}>
                    <div className="w-16 h-16 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center">
                      {currentImage ? (
                        <Image src={currentImage} alt="Profile" width={64} height={64} unoptimized className="object-cover w-full h-full" />
                      ) : (
                        <span className="text-2xl font-bold text-slate-700">{initial}</span>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-900">Profile Picture</span>
                    <span className="text-sm text-slate-500">Click to select an avatar.</span>
                  </div>
                </div>
              </SettingsRow>
              
              {/* Avatar Selection Expanded UI */}
              {isAvatarModalOpen && (
                <div className="px-6 pb-6 pt-2 bg-slate-50 rounded-b-xl -mt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-4 border-b border-slate-200">
                      <button className="pb-2 font-semibold text-slate-900 border-b-2 border-slate-900">Choose Avatar</button>
                      
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept="image/png, image/jpeg, image/webp" 
                        className="hidden" 
                      />
                      <button 
                        className="pb-2 font-semibold text-slate-400 hover:text-slate-600 border-b-2 border-transparent disabled:opacity-50"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUpdatingAvatar}
                      >
                        {isUpdatingAvatar ? "Uploading..." : "Upload Photo"}
                      </button>
                    </div>
                    <button onClick={() => setIsAvatarModalOpen(false)} className="text-sm text-slate-500 hover:text-slate-900">Close</button>
                  </div>
                  <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-3 overflow-y-auto custom-scrollbar p-1">
                    {PREDEFINED_AVATARS.map((url, idx) => (
                      <button 
                        key={idx}
                        onClick={() => handleAvatarSelect(url)}
                        disabled={isUpdatingAvatar}
                        className={`relative rounded-full aspect-square border-2 overflow-hidden transition-all duration-200 hover:scale-110 ${currentImage === url ? 'border-[#d4ff3a] shadow-[0_0_0_4px_rgba(212,255,58,0.2)] scale-110' : 'border-transparent hover:border-slate-200'}`}
                      >
                        <Image src={url} alt={`Avatar ${idx + 1}`} fill unoptimized className="object-cover bg-white" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <SettingsRow>
                <div className="flex items-center justify-between w-full py-1">
                  <div className="flex flex-col w-1/3">
                    <span className="font-semibold text-slate-900">Nickname</span>
                    <span className="text-sm text-slate-500">How you appear to others</span>
                  </div>
                  <div className="flex-1 max-w-md">
                    <input 
                      type="text" 
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#d4ff3a]"
                    />
                  </div>
                </div>
              </SettingsRow>
              <SettingsRow>
                <div className="flex items-center justify-between w-full py-1">
                  <div className="flex flex-col w-1/3">
                    <span className="font-semibold text-slate-900">Email Address</span>
                    <span className="text-sm text-slate-500">Managed by Administrator</span>
                  </div>
                  <div className="flex-1 max-w-md">
                    <input 
                      type="email" 
                      value={session?.user?.email || ""}
                      disabled
                      className="w-full bg-slate-100 border border-slate-200 text-slate-500 rounded-lg px-3 py-2 text-sm cursor-not-allowed"
                    />
                  </div>
                </div>
              </SettingsRow>
            </SettingsGroup>
          </SettingsContent>
        )}

        {activeTab === 'language' && (
          <SettingsContent title="System Language">
            <SettingsGroup label="Language Preferences">
              <SettingsRow>
                <div className="flex items-center justify-between w-full py-1">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-900">Display Language</span>
                    <span className="text-sm text-slate-500">Change the system interface language</span>
                  </div>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button 
                      onClick={() => setLanguage('EN')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${language === 'EN' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      English (EN)
                    </button>
                    <button 
                      onClick={() => setLanguage('TH')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${language === 'TH' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      ภาษาไทย (TH)
                    </button>
                  </div>
                </div>
              </SettingsRow>
            </SettingsGroup>
          </SettingsContent>
        )}

        {activeTab === 'theme' && (
          <SettingsContent title="Theme & Appearance">
            <SettingsGroup label="Appearance">
              <SettingsRow>
                <div className="flex items-center justify-between w-full py-1">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-900">Theme Mode</span>
                    <span className="text-sm text-slate-500">Select your preferred color scheme</span>
                  </div>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button 
                      onClick={() => setTheme('light')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${theme === 'light' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Light
                    </button>
                    <button 
                      onClick={() => setTheme('dark')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${theme === 'dark' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Dark
                    </button>
                    <button 
                      onClick={() => setTheme('system')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${theme === 'system' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      System
                    </button>
                  </div>
                </div>
              </SettingsRow>
            </SettingsGroup>
          </SettingsContent>
        )}

        {activeTab === 'notifications' && (
          <SettingsContent title="Notifications">
            <SettingsGroup label="Integrations">
              <SettingsRow>
                <div className="flex items-center justify-between w-full py-1">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-900">LINE Notify</span>
                    <span className="text-sm text-slate-500">Receive system alerts via LINE messaging</span>
                  </div>
                  <button className="flex items-center gap-2 bg-[#00B900] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#009900] transition-colors">
                    <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
                      <div className="w-2.5 h-2.5 bg-[#00B900] rounded-full"></div>
                    </div>
                    Connect LINE
                  </button>
                </div>
              </SettingsRow>
            </SettingsGroup>
          </SettingsContent>
        )}

      </SettingsLayout>
    </div>
  );
}
