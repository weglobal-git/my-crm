'use client';

import React, { useMemo } from 'react';
import { X, Loader2 } from 'lucide-react';

export type TeamMemberItem = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  department?: { name: string } | null;
  departments?: { id: string; name: string }[] | null;
  [key: string]: unknown;
};

interface DealTeamMembersSectionProps {
  dealId: string;
  owner: { id: string; name: string | null; email?: string | null; image?: string | null; role?: string; departments?: { id: string; name: string }[] } | null;
  ownerId: string;
  teamMembers: TeamMemberItem[];
  allUsers?: TeamMemberItem[];
  isOwner: boolean;
  isAdmin: boolean;
  currentUserId?: string | null;
  currentUserEmail?: string | null;
  isRemovingId?: string | null;
  onRemoveMember: (userId: string) => void | Promise<void>;
}

export function DealTeamMembersSection({
  owner,
  ownerId,
  teamMembers,
  allUsers,
  isOwner,
  isAdmin,
  currentUserId,
  currentUserEmail,
  isRemovingId,
  onRemoveMember,
}: DealTeamMembersSectionProps) {
  // Map of all known users to enrich team members with department and email if missing
  const userMap = useMemo(() => {
    return new Map((allUsers || []).map((u) => [u.id, u]));
  }, [allUsers]);

  // Combine owner and team members, ensuring owner is first and not duplicated
  const allMembers = [
    ...(owner ? [userMap.get(owner.id) || (owner as unknown as TeamMemberItem)] : []),
    ...(teamMembers || []).filter(tm => tm.id !== ownerId).map(tm => userMap.get(tm.id) || tm),
  ];

  // Group by department name
  const groupedMembers = allMembers.reduce((acc, member) => {
    const deptName =
      member.department?.name ||
      (Array.isArray(member.departments) && member.departments.length > 0 ? member.departments[0]?.name : null) ||
      'Unassigned';
    if (!acc[deptName]) acc[deptName] = [];
    acc[deptName].push(member);
    return acc;
  }, {} as Record<string, TeamMemberItem[]>);

  return (
    <div className="flex flex-col gap-6">
      {Object.entries(groupedMembers).map(([deptName, members]) => (
        <div key={deptName} className="flex flex-col gap-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 pl-1">
            {deptName}
          </h4>
          <div className="flex flex-col gap-2">
            {members.map(tm => {
              const isRowOwner = tm.id === ownerId;
              const isSelf = Boolean(
                (currentUserId && tm.id === currentUserId) ||
                (currentUserEmail && tm.email && currentUserEmail.toLowerCase() === tm.email.toLowerCase())
              );
              const canRemove = !isRowOwner && (isOwner || isAdmin || isSelf);
              const isRemoving = isRemovingId === tm.id;

              return (
                <div
                  key={tm.id}
                  className={`group flex items-center justify-between p-3 rounded-2xl border transition-all relative ${
                    isSelf
                      ? 'border-[#C7F33C] bg-[#3A3B3C]'
                      : 'border-[#4E4F50] bg-[#3A3B3C] hover:border-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full overflow-hidden shrink-0 ${
                        isSelf ? 'ring-2 ring-[#C7F33C]' : 'bg-[#4E4F50]'
                      }`}
                    >
                      <img
                        src={
                          tm.image ||
                          `https://api.dicebear.com/7.x/notionists/svg?seed=${tm.name || tm.email || tm.id}`
                        }
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-slate-100">
                          {tm.name || 'Unknown'}
                        </span>
                        {isSelf && (
                          <span className="text-xs font-medium px-2 rounded-lg bg-[#C7F33C]/15 text-[#C7F33C] border border-[#C7F33C] flex items-center gap-1 shrink-0">
                            You
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {isRowOwner ? 'Owner' : 'Member'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canRemove && (
                      <button
                        onClick={() => onRemoveMember(tm.id)}
                        disabled={isRemoving}
                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors disabled:opacity-50 cursor-pointer ${
                          isSelf
                            ? 'hover:bg-amber-500/10 text-slate-400 hover:text-amber-400'
                            : 'hover:bg-rose-500/10 text-slate-400 hover:text-rose-400'
                        }`}
                        title={
                          isSelf
                            ? 'ออกจากทีม (Leave team)'
                            : isOwner || isAdmin
                            ? 'ลบออกจากทีม (Remove from team)'
                            : 'Leave team'
                        }
                      >
                        {isRemoving ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
