import React from 'react';
import UserProfileClient from '@/components/user/UserProfileClient';

export default function ProfilePage() {
  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar p-6 bg-[#252728]">
      <div className="max-w-[1400px] mx-auto w-full flex flex-col h-full">
        <UserProfileClient />
      </div>
    </div>
  );
}
