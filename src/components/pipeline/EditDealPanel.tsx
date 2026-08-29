"use client";

import { X, MessageSquare, Send, Users } from "lucide-react";
import { OpportunityWithRelations } from "./KanbanCard";
import { useRouter } from "next/navigation";
import { addActivityLog, removeTeamMember, addTeamMember, editActivityLog, deleteActivityLog, addSystemLog } from "@/lib/actions/opportunity";
import { getAllUsers } from "@/lib/actions/users";
import { requestDealTransfer } from "@/lib/actions/notification";
import { UserSearchDropdown } from "../ui/UserSearchDropdown";
import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { User } from "@prisma/client";
import { MoreHorizontal } from "lucide-react";
import { usePermissions } from "@/providers/PermissionProvider";
import { IconMap } from "@/lib/menu-registry";
import { useDialog } from "@/providers/DialogProvider";

const formatDateTime = (date: Date | string) => {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
};

const renderCommentContent = (text: string) => {
  if (!text) return null;
  const parts = text.split(/(@\S+)/g);
  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      return (
        <span key={index} className="font-bold text-black bg-[#d4ff3a] px-1.5 py-1 rounded-md text-xs mx-0.5 ">
          {part}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

import { ActivityLog } from "@prisma/client";
type ActivityLogWithRelations = ActivityLog & {
  user: User;
  replies?: ActivityLogWithRelations[];
};

function ActivityComment({ log, dealId, currentUser, refresh, onReplyClick }: { log: ActivityLogWithRelations, dealId: string, currentUser: { id: string; name?: string | null; image?: string | null; email?: string | null; }, refresh: () => void, onReplyClick?: (username: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(log.content);
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [replyingToUsername, setReplyingToUsername] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  
  // Close menu if click outside could be added, but a simple hover or blur works for now.
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isOwner = log.userId === currentUser.id;

  const handleEdit = async () => {
    if (!editContent.trim()) return;
    await editActivityLog(log.id, editContent, currentUser.id);
    setIsEditing(false);
    setShowMenu(false);
    refresh();
  };

  const handleReply = async () => {
    if (!replyContent.trim() && !replyingToUsername) return;
    const finalContent = replyingToUsername ? `@${replyingToUsername} ${replyContent}` : replyContent;
    await addActivityLog(dealId, finalContent, currentUser.id, log.id);
    setIsReplying(false);
    setReplyContent("");
    setReplyingToUsername(null);
    refresh();
  };

  const handleDelete = async () => {
    await deleteActivityLog(log.id, currentUser.id);
    refresh();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0 overflow-hidden">
          <img src={log.user?.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${log.user?.name || log.user?.email || log.userId}`} alt="Avatar" className="w-full h-full object-cover" />
        </div>
        <div className="flex flex-col flex-1">
          {/* Main Comment Bubble and Menu */}
          <div className="flex items-center gap-2 group/comment">
            <div className="bg-slate-100 rounded-2xl p-3 inline-block self-start relative max-w-full">
              <span className="text-sm font-bold text-slate-900 block mb-1">{log.user?.name || 'Unknown User'}</span>
              
              {isEditing ? (
                <div className="flex flex-col gap-2 min-w-[300px]">
                  <textarea 
                    value={editContent} 
                    onChange={e => setEditContent(e.target.value)} 
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm min-h-[60px]"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setIsEditing(false)} className="text-xs text-slate-500 hover:underline">Cancel</button>
                    <button onClick={handleEdit} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700">Save</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {renderCommentContent(log.content)}
                </p>
              )}
            </div>

            {/* Edit / Delete Menu (3 Dots) */}
            {isOwner && (
              <div className="relative opacity-0 group-hover/comment:opacity-100 transition-opacity" ref={menuRef}>
                <button 
                  onClick={() => setShowMenu(!showMenu)} 
                  className="p-1.5 hover:bg-slate-200 rounded-full transition-colors flex items-center justify-center"
                >
                  <MoreHorizontal className="w-4 h-4 text-slate-500" />
                </button>
                
                {showMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg  flex flex-col py-1 w-24 z-10">
                    <button 
                      onClick={() => { setIsEditing(true); setShowMenu(false); }} 
                      className="text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700 text-sm"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={handleDelete} 
                      className="text-left px-3 py-1.5 hover:bg-slate-50 text-red-600 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-4 mt-1 pl-2 text-xs font-semibold text-slate-500">
            <span className="font-normal text-slate-400">{formatDateTime(log.createdAt)}{log.isEdited && " (edited)"}</span>
            <button 
              onClick={() => {
                if (log.parentId && onReplyClick) {
                  onReplyClick(log.user?.name?.replace(/\s+/g, '') || 'Unknown');
                } else {
                  setIsReplying(true);
                }
              }} 
              className="hover:underline cursor-pointer"
            >
              Reply
            </button>
          </div>

          {/* Nested Replies */}
          {log.replies && log.replies.length > 0 && (
            <div className="flex flex-col gap-4 mt-4 border-l-2 border-slate-100 pl-4">
              {log.replies.map((reply) => (
                <ActivityComment 
                  key={reply.id} 
                  log={reply} 
                  dealId={dealId} 
                  currentUser={currentUser} 
                  refresh={refresh}
                  onReplyClick={(username) => {
                    setIsReplying(true);
                    setReplyingToUsername(username);
                  }} 
                />
              ))}
            </div>
          )}

          {/* Reply Form */}
          {isReplying && (
            <div className="flex gap-3 mt-4 border-l-2 border-slate-100 pl-4">
               <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0 overflow-hidden">
                <img src={currentUser?.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${currentUser?.name || currentUser?.email || currentUser?.id}`} alt="Avatar" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 min-h-[60px] focus-within:ring-1 focus-within:ring-slate-300 flex flex-col gap-1">
                  {replyingToUsername && (
                    <div className="flex items-center gap-1 mb-1">
                      <span className="font-bold text-black bg-[#d4ff3a] px-1.5 py-1 rounded-md text-xs  flex items-center gap-1">
                        @{replyingToUsername}
                        <button onClick={() => setReplyingToUsername(null)} className="hover:text-slate-600 ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                  )}
                  <textarea 
                    value={replyContent}
                    onChange={e => setReplyContent(e.target.value)}
                    placeholder="Write a reply..." 
                    autoFocus
                    className="w-full bg-transparent text-sm focus:outline-none resize-none"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setIsReplying(false); setReplyingToUsername(null); }} className="text-xs font-semibold text-slate-500 hover:underline">Cancel</button>
                  <button onClick={handleReply} className="text-xs font-bold bg-[#d4ff3a] text-black px-3 py-1.5 rounded-full hover:bg-[#b3ff25] "><Send className="w-3 h-3 inline mr-1"/> Reply</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type TabType = 'activity' | 'system' | 'collaborate' | 'information' | 'notes' | 'document' | 'images' | 'files';

interface EditDealPanelProps {
  deal: OpportunityWithRelations;
  initialTab?: TabType;
  isOpen: boolean;
  onClose: () => void;
}

export function EditDealPanel({ deal, initialTab = 'activity', isOpen, onClose }: EditDealPanelProps) {
  const router = useRouter();
  const [newLog, setNewLog] = useState("");
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const { visibleRightMenus } = usePermissions();
  const rightMenus = visibleRightMenus("pipeline");
  
  // Try to find the initial tab matching a visible right menu, fallback to the first one available
  const allowedInitialTab = rightMenus.find(m => m.key.endsWith(`.${initialTab}`)) ? initialTab : (rightMenus[0]?.key.split('.').pop() as TabType || 'activity');
  const [activeTab, setActiveTab] = useState<TabType>(allowedInitialTab);
  
  const { toast } = useDialog();

  // Users state for ownership transfer
  const [users, setUsers] = useState<Awaited<ReturnType<typeof getAllUsers>>>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const { data: session } = useSession();
  const isOwner = session?.user?.email === deal.owner.email;
  const isTeamMember = deal.teamMembers?.some(tm => tm.email === session?.user?.email);
  const canInvite = isOwner || isTeamMember;

  useEffect(() => {
    const t = setTimeout(() => setActiveTab(initialTab), 0);
    return () => clearTimeout(t);
  }, [initialTab, isOpen]);

  // Optimistic UI State
  type TeamMember = { id: string; name: string | null; email: string | null; image: string | null; role: string; department?: { name: string } | null; [key: string]: unknown };
  const [localTeamMembers, setLocalTeamMembers] = useState<TeamMember[]>(deal.teamMembers || []);
  useEffect(() => {
    const t = setTimeout(() => setLocalTeamMembers(deal.teamMembers || []), 0);
    return () => clearTimeout(t);
  }, [deal.teamMembers]);

  useEffect(() => {
    if (isOpen && activeTab === 'collaborate' && users.length === 0) {
      getAllUsers().then(setUsers);
    }
  }, [isOpen, activeTab, users.length]);

  const handleAddLog = async () => {
    if (!newLog.trim()) return;
    setIsSubmittingLog(true);
    try {
      await addActivityLog(deal.id, newLog.trim(), deal.ownerId);
      setNewLog("");
      router.refresh();
    } catch (e) {
      if (e instanceof Error) {
        toast({ title: "Error", description: "Failed to add log: " + e.message, type: "error" });
      }
    } finally {
      setIsSubmittingLog(false);
    }
  };

  const handleTransfer = async (newOwnerId: string) => {
    if (deal.ownerId === newOwnerId || !isOwner) return;
    setIsTransferring(true);
    try {
      await requestDealTransfer(deal.id, newOwnerId);
      
      const newOwner = users.find(u => u.id === newOwnerId);
      if (session?.user?.id && newOwner) {
        await addSystemLog(deal.id, `Transferred ownership to ${newOwner.name}`, session?.user?.id || 'SYSTEM');
      }
      toast({ title: "Success", description: "Transfer request sent successfully", type: "success" });
      router.refresh();
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to transfer ownership", type: "error" });
    } finally {
      setIsTransferring(false);
    }
  };

  const [isUpdatingTeam, setIsUpdatingTeam] = useState(false);

  const handleAddMember = async (userId: string) => {
    setIsUpdatingTeam(true);
    
    // Optimistic Update
    const userToAdd = users.find(u => u.id === userId);
    if (userToAdd) {
      setLocalTeamMembers(prev => [...prev, userToAdd]);
    }

    try {
      await addTeamMember(deal.id, userId);
      if (session?.user?.id && userToAdd) {
        await addSystemLog(deal.id, `Invited ${userToAdd.name} to the team`, session.user.id);
      }
      router.refresh();
    } catch (e) {
      setLocalTeamMembers(deal.teamMembers || []); // Revert
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
    } finally {
      setIsUpdatingTeam(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setIsUpdatingTeam(true);

    const userToRemove = localTeamMembers.find(u => u.id === userId) || deal.teamMembers.find(u => u.id === userId);

    // Optimistic Update
    setLocalTeamMembers(prev => prev.filter(u => u.id !== userId));

    try {
      await removeTeamMember(deal.id, userId);
      if (session?.user?.id && userToRemove) {
        await addSystemLog(deal.id, `Removed ${userToRemove.name} from the team`, session.user.id);
      }
      router.refresh();
    } catch (e) {
      setLocalTeamMembers(deal.teamMembers || []); // Revert
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
    } finally {
      setIsUpdatingTeam(false);
    }
  };

  const [mounted, setMounted] = useState(false);
  
  const [showTransferDropdown, setShowTransferDropdown] = useState(false);
  const [showInviteDropdown, setShowInviteDropdown] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timeout);
  }, []);

  if (!isOpen && !mounted) return null;

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`} 
        onClick={onClose}
      />
      
      <div className={`fixed inset-y-0 right-0 z-50 flex transform transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        
        {/* Tab Sidebar */}
        <div className="w-16 bg-white border-r border-slate-100  flex flex-col items-center py-3 gap-3 z-10 rounded-l-2xl">
          {rightMenus.map(menu => {
            const tabId = menu.key.split('.').pop() as TabType;
            const Icon = menu.iconName ? IconMap[menu.iconName] : MessageSquare;
            return (
              <button
                key={menu.key}
                onClick={() => setActiveTab(tabId)}
                title={menu.label}
                className={`
                  flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200
                  ${activeTab === tabId || (activeTab === 'system' && tabId === 'activity')
                    ? "bg-[#111111] text-white " 
                    : "text-[#888888] hover:bg-[#F4F5F7] hover:text-[#111111]"}
                `}
              >
                <Icon className="h-5 w-5" strokeWidth={activeTab === tabId || (activeTab === 'system' && tabId === 'activity') ? 2.5 : 2} />
              </button>
            )
          })}
        </div>

        {/* Main Panel Content */}
        <div className="w-[600px] max-w-[90vw] bg-white  flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
            <h2 className="text-xl font-bold text-slate-900 line-clamp-1">{deal.topic || 'Untitled Deal'}</h2>
            <button 
              onClick={onClose} 
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sticky Tabs for Activity/System */}
          {(activeTab === 'activity' || activeTab === 'system') && (
            <div className="px-6 pt-4 bg-white shrink-0 z-10">
              <div className="flex items-center gap-6 border-b border-slate-200">
                <button 
                  onClick={() => setActiveTab('activity')}
                  className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'activity' ? 'border-black text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  <MessageSquare className="w-4 h-4" /> Activity
                </button>
                <button 
                  onClick={() => setActiveTab('system')}
                  className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'system' ? 'border-black text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  System
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 custom-scrollbar">
            
            {(activeTab === 'activity' || activeTab === 'system') && (
              <>
                {/* Activity Logs (Facebook Style) */}
                <div className="flex flex-col gap-4 flex-1 pb-10">
                  
                  {activeTab === 'activity' && (
                    <div className="flex flex-col gap-6">


                      {/* Feed */}
                      <div className="flex flex-col gap-6 mt-4">
                        {deal.activityLogs.filter(log => log.type === 'COMMENT' && !log.parentId).length > 0 ? (
                          deal.activityLogs.filter(log => log.type === 'COMMENT' && !log.parentId).map(log => (
                            <ActivityComment 
                              key={log.id} 
                              log={log} 
                              dealId={deal.id}
                              currentUser={session?.user as unknown as { id: string; name?: string | null; image?: string | null; email?: string | null; }}
                              refresh={() => router.refresh()}
                            />
                          ))
                        ) : (
                          <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100">
                            <p className="text-sm text-slate-500 font-medium">No updates yet.</p>
                            <p className="text-xs text-slate-400 mt-1">Be the first to post an update on this deal.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'system' && (
                    <div className="flex flex-col gap-4 mt-2">
                      {deal.activityLogs.filter(log => log.type === 'SYSTEM_UPDATE').length > 0 ? (
                        deal.activityLogs.filter(log => log.type === 'SYSTEM_UPDATE').map(log => (
                          <div key={log.id} className="flex gap-3">
                            <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 shrink-0 mt-0.5 flex items-center justify-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            </div>
                            <div className="flex flex-col flex-1">
                              <span className="text-xs text-slate-400 mb-0.5">{formatDateTime(log.createdAt)}</span>
                              <p className="text-sm text-slate-600 font-medium italic">
                                {log.content?.trim()}
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-400 text-center py-4">No system activity.</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'collaborate' && (
              <div className="flex flex-col gap-8">
                
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-5 h-5 text-green-500" />
                      Team Members
                    </h3>
                    {canInvite && (
                      <div className="relative">
                        <button 
                          onClick={() => {
                            setShowInviteDropdown(!showInviteDropdown);
                            setShowTransferDropdown(false);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 rounded-lg text-xs font-semibold transition-colors border border-slate-200 hover:border-black hover:text-black"
                        >
                          + Add
                        </button>
                        <UserSearchDropdown
                          users={users}
                          isOpen={showInviteDropdown}
                          onClose={() => setShowInviteDropdown(false)}
                          onSelect={handleAddMember}
                          actionLabel="Invite"
                          isLoading={isUpdatingTeam}
                          excludeUserIds={[deal.ownerId, ...(localTeamMembers?.map(tm => tm.id) || [])]}
                          align="right"
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-6">
                    {(() => {
                      const allMembers = [deal.owner, ...(localTeamMembers || []).filter(tm => tm.id !== deal.ownerId)];
                      const groupedMembers = allMembers.reduce((acc, member) => {
                        const deptName = (member as User & { department?: { name: string } | null }).department?.name || 'Unassigned';
                        if (!acc[deptName]) acc[deptName] = [];
                        acc[deptName].push(member);
                        return acc;
                      }, {} as Record<string, typeof allMembers>);

                      return Object.entries(groupedMembers).map(([deptName, members]) => (
                        <div key={deptName} className="flex flex-col gap-2">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 pl-1">{deptName}</h4>
                          <div className="flex flex-col gap-2">
                            {members.map(tm => {
                              const isRowOwner = tm.id === deal.ownerId;
                              return (
                                <div key={tm.id} className="group flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-white  hover:border-slate-200 transition-all relative">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden shrink-0">
                                      <img src={tm.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${tm.name || tm.email || tm.id}`} alt="Avatar" className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-sm font-semibold text-slate-900">{tm.name || 'Unknown'}</span>
                                      <span className="text-xs text-slate-500">{isRowOwner ? 'Owner' : 'Member'}</span>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {isRowOwner ? (
                                      isOwner && (
                                        <div className="relative">
                                          <button
                                            onClick={() => {
                                              setShowTransferDropdown(!showTransferDropdown);
                                              setShowInviteDropdown(false);
                                            }}
                                            className="px-3 py-1 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:border-black hover:text-black rounded-lg transition-colors"
                                          >
                                            Transfer
                                          </button>
                                          <UserSearchDropdown
                                            users={users}
                                            isOpen={showTransferDropdown}
                                            onClose={() => setShowTransferDropdown(false)}
                                            onSelect={handleTransfer}
                                            actionLabel="Transfer"
                                            isLoading={isTransferring}
                                            excludeUserIds={[deal.ownerId]}
                                            align="right"
                                          />
                                        </div>
                                      )
                                    ) : (
                                      (isOwner || tm.email === session?.user?.email) && (
                                        <button 
                                          onClick={() => handleRemoveMember(tm.id)}
                                          disabled={isUpdatingTeam}
                                          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                          title={isOwner ? "Remove from team" : "Leave team"}
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      )
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

              </div>
            )}

            {['information', 'notes', 'document', 'images', 'files'].includes(activeTab) && (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
                <div className="p-4 bg-slate-50 rounded-full">
                  {(() => {
                    const Icon = IconMap[rightMenus.find(m => m.key.endsWith(`.${activeTab}`))?.iconName || 'Building2'];
                    return <Icon className="w-8 h-8" />;
                  })()}
                </div>
                <h3 className="text-lg font-bold text-slate-900 capitalize">{activeTab}</h3>
                <p className="text-slate-500 max-w-sm">
                  {activeTab} management will be implemented here. Currently in development.
                </p>
              </div>
            )}
          </div>

          {/* Sticky Footer for Activity Tab */}
          {activeTab === 'activity' && (
            <div className="p-4 bg-white border-t border-slate-100 shrink-0  z-10">
              <div className="flex gap-3 bg-white p-2 rounded-2xl border border-slate-200 focus-within:ring-2 focus-within:ring-slate-200 transition-">
                <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0 overflow-hidden mt-1 ml-1">
                  <img src={session?.user?.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${session?.user?.name || session?.user?.email || "User"}`} alt="Avatar" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 flex flex-col">
                  <textarea 
                    value={newLog}
                    onChange={e => setNewLog(e.target.value)}
                    placeholder="Write an update..." 
                    className="w-full bg-transparent border-none rounded-xl p-2 text-sm min-h-[40px] focus:outline-none resize-none"
                    rows={newLog.split('\n').length > 1 ? Math.min(newLog.split('\n').length, 5) : 1}
                  />
                  <div className="flex justify-end mt-2 pr-1 pb-1">
                    <button 
                      onClick={handleAddLog}
                      disabled={isSubmittingLog || !newLog.trim()}
                      className="flex items-center gap-2 bg-black text-white px-4 py-1.5 rounded-full text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-50 "
                    >
                      <Send className="w-3 h-3" />
                      {isSubmittingLog ? "Posting..." : "Post"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
