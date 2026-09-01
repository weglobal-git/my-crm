"use client";

import React, { useState } from 'react';
import { User, Department, Role } from "@prisma/client";
import { 
  updateUserRole, 
  createDepartment, 
  deleteDepartment,
  createUser,
  updateDepartmentName,
  updateUserDepartments,
  updateUserDetails
} from "@/lib/actions/user";
import { SettingsLayout, SettingsSidebar, SettingsSidebarItem, SettingsContent, SettingsGroup, SettingsRow } from '@/components/layout/SettingsLayout';
import { HardDrive, Cloud, Link2, Archive, Activity, CheckCircle2, Edit2, Shield, User as UserIcon, Briefcase, Plus, Check, X, Trash2, Mail } from 'lucide-react';
import { useDialog } from '@/providers/DialogProvider';
import Image from "next/image";

type UserWithDepts = User & { departments: Department[] };

type Tab = 'dashboard' | 'integrations' | 'archiving' | 'users_all' | string;

interface Props {
  initialUsers?: UserWithDepts[];
  initialDepartments?: Department[];
  currentUserRole?: string;
}

export default function SystemGeneralClient({ initialUsers = [], initialDepartments = [], currentUserRole = "GENERAL" }: Props) {
  const { toast, confirm } = useDialog();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  
  // Storage State
  const [cloudinaryStorage, setCloudinaryStorage] = useState({ percent: 0, usageStr: '0 B', limitStr: '25 GB' });
  const [cloudinaryBandwidth, setCloudinaryBandwidth] = useState({ percent: 0, usageStr: '0 B', limitStr: '25 GB' });
  
  const [gdriveUsage, setGdriveUsage] = useState({ percent: 0, usageStr: '0 B', limitStr: '15 GB' });
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [connectedGoogleEmail, setConnectedGoogleEmail] = useState<string | null>(null);
  const [isLoadingStorage, setIsLoadingStorage] = useState(true);

  // User & Dept State
  const [users, setUsers] = useState(initialUsers);
  const [departments, setDepartments] = useState(initialDepartments);
  const [newDeptName, setNewDeptName] = useState("");
  const [isCreatingDept, setIsCreatingDept] = useState(false);
  const isAdmin = currentUserRole === "ADMIN";

  // New User Form State
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "GENERAL" as Role, departmentIds: [] as string[] });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [addingUserToDeptId, setAddingUserToDeptId] = useState<string | null>(null);

  // Edit Department State
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState("");
  const [isSavingDept, setIsSavingDept] = useState(false);

  const startEditingDept = (dept: Department) => {
    setEditingDeptId(dept.id);
    setEditDeptName(dept.name);
  };

  const saveDeptName = async (deptId: string) => {
    if (!isAdmin) return;
    if (!editDeptName.trim()) return;
    setIsSavingDept(true);
    try {
      await updateDepartmentName(deptId, editDeptName);
      setDepartments(departments.map(d => d.id === deptId ? { ...d, name: editDeptName.trim() } : d));
      setEditingDeptId(null);
    } catch (e) {
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
    } finally {
      setIsSavingDept(false);
    }
  };

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [isSavingUser, setIsSavingUser] = useState(false);

  const startEditingUser = (user: UserWithDepts) => {
    setEditingUserId(user.id);
    setEditUserName(user.name || "");
    setEditUserEmail(user.email || "");
  };

  const saveUser = async (userId: string) => {
    if (!isAdmin) return;
    if (!editUserName.trim() || !editUserEmail.trim()) return;
    setIsSavingUser(true);
    try {
      await updateUserDetails(userId, editUserName, editUserEmail);
      setUsers(users.map(u => u.id === userId ? { ...u, name: editUserName.trim(), email: editUserEmail.trim().toLowerCase() } : u));
      setEditingUserId(null);
    } catch (e) {
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: Role) => {
    if (!isAdmin) return toast({ title: "Unauthorized", description: "Only ADMIN can change roles.", type: "error" });
    try {
      await updateUserRole(userId, newRole);
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (e) {
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
    }
  };

  const handleDepartmentChange = async (userId: string, deptId: string) => {
    if (!isAdmin) return toast({ title: "Unauthorized", description: "Only ADMIN can change departments.", type: "error" });
    try {
      const deptIds = deptId ? [deptId] : [];
      await updateUserDepartments(userId, deptIds);
      const newDepts = departments.filter(d => deptIds.includes(d.id));
      setUsers(users.map(u => u.id === userId ? { ...u, departments: newDepts } : u));
    } catch (e) {
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
    }
  };

  const handleCreateDept = async () => {
    if (!isAdmin) return toast({ title: "Unauthorized", description: "Only ADMIN can create departments.", type: "error" });
    if (!newDeptName.trim()) return;
    setIsCreatingDept(true);
    try {
      const dept = await createDepartment(newDeptName);
      setDepartments([...departments, dept].sort((a, b) => a.name.localeCompare(b.name)));
      setNewDeptName("");
      setIsCreatingDept(false);
    } catch (e) {
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
      setIsCreatingDept(false);
    }
  };

  const handleDeleteDept = async (id: string) => {
    if (!isAdmin) return toast({ title: "Unauthorized", description: "Only ADMIN can delete departments.", type: "error" });
    const ok = await confirm({ title: "Delete Department", description: "Are you sure you want to delete this department?", variant: "danger" });
    if (!ok) return;
    try {
      await deleteDepartment(id);
      setDepartments(departments.filter(d => d.id !== id));
      if (activeTab === `users_${id}`) setActiveTab('users_all');
    } catch (e) {
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
    }
  };

  const handleCreateUser = async () => {
    if (!isAdmin) return toast({ title: "Unauthorized", description: "Only ADMIN can create users.", type: "error" });
    if (!newUser.name.trim() || !newUser.email.trim()) {
      return toast({ title: "Validation Error", description: "Name, Email, and Role are required.", type: "warning" });
    }
    setIsCreatingUser(true);
    try {
      const finalDeptIds = [...newUser.departmentIds];
      if (addingUserToDeptId && !finalDeptIds.includes(addingUserToDeptId)) {
        finalDeptIds.push(addingUserToDeptId);
      }
      const created = await createUser({ ...newUser, departmentIds: finalDeptIds });
      const newDepts = departments.filter(d => finalDeptIds.includes(d.id));
      setUsers([{ ...created, departments: newDepts }, ...users]);
      setNewUser({ name: "", email: "", role: "GENERAL", departmentIds: [] });
      setAddingUserToDeptId(null);
      setIsCreatingUser(false);
    } catch (e) {
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
      setIsCreatingUser(false);
    }
  };

  React.useEffect(() => {
    async function fetchStorage() {
      try {
        const res = await fetch('/api/system/storage');
        const data = await res.json();
        if (data.success) {
          const formatBytes = (bytes: number) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
          };
          setCloudinaryStorage({ percent: data.storage.used_percent, usageStr: formatBytes(data.storage.usage), limitStr: formatBytes(data.storage.limit) });
          setCloudinaryBandwidth({ percent: data.bandwidth.used_percent, usageStr: formatBytes(data.bandwidth.usage), limitStr: formatBytes(data.bandwidth.limit) });
        }
      } catch (error) {
        console.error("Failed to load storage data", error);
      } finally {
        setIsLoadingStorage(false);
      }
    }
    async function fetchGDriveStatus() {
      try {
        const res = await fetch('/api/system/google/status');
        const data = await res.json();
        if (data.success) {
          setIsGoogleConnected(data.isConnected);
          if (data.email) setConnectedGoogleEmail(data.email);
          if (data.quota) {
            const formatBytes = (bytes: number) => {
              if (bytes === 0) return '0 B';
              const k = 1024;
              const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
              const i = Math.floor(Math.log(bytes) / Math.log(k));
              return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            };
            setGdriveUsage({ percent: data.quota.used_percent, usageStr: formatBytes(data.quota.usage), limitStr: formatBytes(data.quota.limit) });
          }
        }
      } catch (error) {
        console.error("Failed to load GDrive status", error);
      }
    }
    
    if (activeTab === 'dashboard') {
      fetchStorage();
      fetchGDriveStatus();
    } else if (activeTab === 'integrations') {
      fetchGDriveStatus();
    }
  }, [activeTab]);

  const handleConnectDrive = () => {
    window.location.href = '/api/system/google/auth';
  };

  const handleDisconnectDrive = async () => {
    try {
      const res = await fetch('/api/system/google/status', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setIsGoogleConnected(false);
        toast({ title: 'Disconnected', description: 'Google Drive has been unlinked.', type: 'info' });
      } else {
        toast({ title: 'Error', description: 'Failed to disconnect.', type: 'error' });
      }
    } catch {
      toast({ title: 'Error', description: 'An error occurred.', type: 'error' });
    }
  };

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'gdrive_connected') {
      toast({ title: 'Connected', description: 'Google Drive connected successfully.', type: 'success' });
      window.history.replaceState({}, '', '/system/general');
      setActiveTab('integrations');
    }
    if (params.get('error')) {
      toast({ title: 'Connection Failed', description: 'Failed to connect to Google Drive.', type: 'error' });
      window.history.replaceState({}, '', '/system/general');
    }
  }, [toast]);

  const adminUsers = users.filter(u => u.role === "ADMIN" || u.email === "weglobal.server@gmail.com");
  const regularUsers = users.filter(u => u.role !== "ADMIN" && u.email !== "weglobal.server@gmail.com");

  const renderUserGroup = (userList: UserWithDepts[], hideDepartment: boolean = false) => (
    <SettingsGroup>
      {userList.map(user => (
        <SettingsRow key={user.id}>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#252728] flex items-center justify-center text-slate-300 shrink-0 overflow-hidden">
              {user.image ? (
                <Image src={user.image} alt={user.name || "User"} width={40} height={40} unoptimized className="w-full h-full object-cover" />
              ) : (
                <span className="font-bold text-sm">
                  {user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "?"}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              {editingUserId === user.id ? (
                <div className="flex flex-col gap-1.5 w-[320px] bg-[#252728] border border-[#4E4F50] rounded-xl p-1.5 shadow-sm">
                  <div className="flex items-center gap-2 px-2 bg-[#3A3B3C] border border-transparent rounded-lg focus-within:border-[#C7F33C] focus-within:ring-1 focus-within:ring-[#C7F33C] transition-all">
                    <UserIcon className="w-4 h-4 text-slate-300 shrink-0" />
                    <input 
                      type="text" 
                      value={editUserName} 
                      onChange={e => setEditUserName(e.target.value)} 
                      className="w-full bg-transparent py-1.5 text-[14px] font-medium text-slate-100 outline-none placeholder:text-slate-300"
                      placeholder="User Name"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-2 px-2 bg-[#3A3B3C] border border-transparent rounded-lg focus-within:border-[#C7F33C] focus-within:ring-1 focus-within:ring-[#C7F33C] transition-all">
                    <Mail className="w-4 h-4 text-slate-300 shrink-0" />
                    <input 
                      type="email" 
                      value={editUserEmail} 
                      onChange={e => setEditUserEmail(e.target.value)} 
                      className="w-full bg-transparent py-1.5 text-[13px] text-slate-300 outline-none placeholder:text-slate-300"
                      placeholder="Email Address"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-1 mt-1 px-1">
                    <button 
                      onClick={() => setEditingUserId(null)} 
                      disabled={isSavingUser}
                      className="px-3 py-1.5 text-[12px] font-medium text-slate-300 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => saveUser(user.id)} 
                      disabled={isSavingUser}
                      className="px-3 py-1.5 text-[12px] font-bold bg-[#C7F33C] text-black rounded-lg hover:bg-[#b5dc35] transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-100 text-[15px]">{user.name}</span>
                    <span className="text-slate-300 text-[13px]">{user.email}</span>
                  </div>
                  {isAdmin && (
                    <button 
                      onClick={() => startEditingUser(user)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-white hover:bg-[#4E4F50] rounded-md transition-all ml-1"
                      title="Edit User"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-8">
            <div className="flex flex-col min-w-[120px]">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Role</span>
              <div className="relative group">
                <select 
                  value={user.role} 
                  onChange={e => handleRoleChange(user.id, e.target.value as Role)}
                  disabled={!isAdmin || user.email === "weglobal.server@gmail.com"}
                  className="appearance-none bg-transparent text-sm font-medium text-slate-300 hover:text-slate-100 cursor-pointer outline-none w-full border-b border-transparent hover:border-slate-500 focus:border-[#C7F33C] transition-all pb-1 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="MANAGEMENT">MANAGEMENT</option>
                  <option value="GENERAL">GENERAL</option>
                </select>
                {isAdmin && user.email !== "weglobal.server@gmail.com" && <Shield className="w-3 h-3 absolute right-0 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />}
              </div>
            </div>

            {!hideDepartment && (
              <div className="flex flex-col min-w-[140px]">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Department</span>
                <div className="relative group">
                  <select 
                    value={user.departments[0]?.id || ""} 
                    onChange={e => handleDepartmentChange(user.id, e.target.value)}
                    disabled={!isAdmin || user.role === "ADMIN"}
                    className="appearance-none bg-transparent text-sm font-medium text-slate-300 hover:text-slate-100 cursor-pointer outline-none w-full border-b border-transparent hover:border-slate-500 focus:border-[#C7F33C] transition-all pb-1 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <option value="">No Department</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  {isAdmin && user.role !== "ADMIN" && <Briefcase className="w-3 h-3 absolute right-0 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />}
                </div>
              </div>
            )}
          </div>
        </SettingsRow>
      ))}
    </SettingsGroup>
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto">
      <SettingsLayout>
        {/* Left Sidebar - Navigation */}
        <SettingsSidebar 
          title="General Settings"
        >
          <div className="mb-6 mt-4">
            <h3 className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Storage & System</h3>
            <SettingsSidebarItem 
              icon={<HardDrive />} 
              label="Storage Dashboard" 
              isActive={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')}
              iconBgColor="bg-slate-800"
            />
            <SettingsSidebarItem 
              icon={<Link2 />} 
              label="Integrations" 
              isActive={activeTab === 'integrations'} 
              onClick={() => setActiveTab('integrations')}
              iconBgColor="bg-indigo-500"
            />
            <SettingsSidebarItem 
              icon={<Archive />} 
              label="Archiving Policy" 
              isActive={activeTab === 'archiving'} 
              onClick={() => setActiveTab('archiving')}
              iconBgColor="bg-rose-500"
            />
          </div>

          <div>
            <div className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>Users & Departments</span>
              {isAdmin && (
                <button onClick={() => setIsCreatingDept(true)} className="p-1 bg-[#3A3B3C] hover:bg-slate-600 rounded-md transition-colors text-white" title="Add Department">
                  <Plus size={14} />
                </button>
              )}
            </div>
            {isCreatingDept && (
              <div className="px-4 py-2 mb-2 flex flex-col gap-2 bg-[#1C1C1D] rounded-xl border border-[#3A3B3C]">
                <input 
                  type="text" 
                  value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  className="w-full bg-[#252728] border border-[#4E4F50] rounded-lg px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-[#C7F33C] transition-colors placeholder:text-slate-500"
                  placeholder="Department Name"
                  autoFocus
                />
                <div className="flex justify-end gap-1">
                  <button onClick={() => { setIsCreatingDept(false); setNewDeptName(""); }} className="px-2 py-1 hover:bg-[#3A3B3C] text-slate-400 rounded transition-colors"><X size={14} /></button>
                  <button onClick={handleCreateDept} className="px-2 py-1 bg-[#C7F33C] text-black rounded hover:bg-[#b5dc35] transition-colors"><Check size={14} /></button>
                </div>
              </div>
            )}
            <SettingsSidebarItem 
              icon={<UserIcon size={18} />} 
              label="All Users" 
              isActive={activeTab === 'users_all'}
              onClick={() => setActiveTab('users_all')}
            />
            {departments.map(dept => (
              <div key={dept.id} className="relative group">
                <SettingsSidebarItem 
                  icon={<Briefcase size={18} />} 
                  label={dept.name} 
                  isActive={activeTab === `users_${dept.id}`}
                  onClick={() => setActiveTab(`users_${dept.id}`)}
                />
                {isAdmin && (
                  <button 
                    onClick={() => handleDeleteDept(dept.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-md transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </SettingsSidebar>

        {/* Right Content Area */}
        {activeTab === 'dashboard' && (
          <SettingsContent title="Storage & Bandwidth Dashboard">
            <SettingsGroup label="Cloudinary (Image CDN)">
              <SettingsRow>
                <div className="flex flex-col gap-2 py-2 w-full">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-100 flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-sky-400" />
                      Storage Usage
                    </span>
                    <span className="text-sm font-medium text-slate-400">
                      {isLoadingStorage ? 'Loading...' : `${cloudinaryStorage.percent.toFixed(1)}% (${cloudinaryStorage.usageStr} / ${cloudinaryStorage.limitStr})`}
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-[#1C1C1D] rounded-full overflow-hidden border border-[#4E4F50]">
                    <div className={`h-full rounded-full transition-all ${cloudinaryStorage.percent > 80 ? 'bg-rose-500' : 'bg-sky-500'}`} style={{ width: `${Math.min(cloudinaryStorage.percent, 100)}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">This represents the images and files currently hosted on Cloudinary's fast CDN.</p>
                </div>
              </SettingsRow>
              <SettingsRow>
                <div className="flex flex-col gap-2 py-2 w-full">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-100 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-400" />
                      Monthly Bandwidth
                    </span>
                    <span className="text-sm font-medium text-slate-400">
                      {isLoadingStorage ? 'Loading...' : `${cloudinaryBandwidth.percent.toFixed(1)}% (${cloudinaryBandwidth.usageStr} / ${cloudinaryBandwidth.limitStr})`}
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-[#1C1C1D] rounded-full overflow-hidden border border-[#4E4F50]">
                    <div className={`h-full rounded-full transition-all ${cloudinaryBandwidth.percent > 80 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(cloudinaryBandwidth.percent, 100)}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Bandwidth is consumed when users load images in the CRM. Keep this low with q_auto, f_auto.</p>
                </div>
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup label="Google Drive (Cold Storage Archive)">
              <SettingsRow>
                <div className="flex flex-col gap-2 py-2 w-full">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-100 flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-yellow-400" />
                      Drive Storage
                    </span>
                    <span className="text-sm font-medium text-slate-400">
                      {isGoogleConnected ? `${gdriveUsage.percent.toFixed(1)}% (${gdriveUsage.usageStr} / ${gdriveUsage.limitStr})` : 'Not Connected'}
                    </span>
                  </div>
                  {isGoogleConnected ? (
                    <div className="w-full h-2.5 bg-[#1C1C1D] rounded-full overflow-hidden border border-[#4E4F50]">
                      <div className="h-full bg-yellow-500 rounded-full transition-all" style={{ width: `${Math.min(gdriveUsage.percent, 100)}%` }} />
                    </div>
                  ) : (
                    <div className="text-sm text-amber-500 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                      Please connect your Google Workspace account in the Integrations tab to view storage quota.
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Archived photos and documents are moved here to save Cloudinary space.</p>
                </div>
              </SettingsRow>
            </SettingsGroup>
          </SettingsContent>
        )}

        {activeTab === 'integrations' && (
          <SettingsContent title="Integrations & OAuth">
            <SettingsGroup label="Google Workspace">
              <SettingsRow>
                <div className="flex items-center justify-between py-2 w-full">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-slate-100 flex items-center gap-2">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" alt="Google Drive" className="w-5 h-5" />
                      Google Drive
                    </span>
                    <span className="text-sm text-slate-400">
                      {isGoogleConnected && connectedGoogleEmail 
                        ? `Connected as ${connectedGoogleEmail}` 
                        : "Connect to enable automated file archiving."}
                    </span>
                  </div>
                  {isGoogleConnected ? (
                    <button 
                      onClick={handleDisconnectDrive}
                      className="px-4 py-2 bg-rose-500/10 text-rose-500 font-medium rounded-lg border border-rose-500/20 hover:bg-rose-500/20 transition-all flex items-center gap-2 text-sm">
                      Disconnect
                    </button>
                  ) : (
                    <button 
                      onClick={handleConnectDrive}
                      className="px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-slate-200 transition-all text-sm"
                    >
                      Connect Account
                    </button>
                  )}
                </div>
              </SettingsRow>
            </SettingsGroup>
          </SettingsContent>
        )}

        {activeTab === 'archiving' && (
          <SettingsContent title="Archiving Policy (Cron Job)">
            <SettingsGroup label="Automated Tasks">
              <SettingsRow>
                <div className="flex flex-col gap-3 py-2 w-full">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-slate-100 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Daily Cleanup Worker
                      </span>
                      <span className="text-sm text-slate-400">Runs every midnight to archive files from WON/LOST deals.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-[#3A3B3C] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#C7F33C]"></div>
                    </label>
                  </div>
                  
                  <div className="bg-[#1C1C1D] border border-[#3A3B3C] rounded-lg p-4 mt-2">
                    <p className="text-sm text-slate-300">
                      <strong>Policy:</strong> Move images and files to Google Drive, then permanently delete them from Cloudinary if the Opportunity is marked as WON or LOST and has been inactive for more than <strong className="text-white">30 days</strong>.
                    </p>
                  </div>
                </div>
              </SettingsRow>
            </SettingsGroup>
          </SettingsContent>
        )}

        {activeTab === 'users_all' && (
          <SettingsContent 
            title="All Users & Administrators" 
            action={isAdmin && (
              <button onClick={() => { setIsCreatingUser(true); setAddingUserToDeptId(null); }} className="flex items-center gap-2 bg-[#C7F33C] text-black px-4 py-2 rounded-full font-semibold text-sm hover:bg-[#b5dc35] transition-colors">
                <Plus size={16} /> New User
              </button>
            )}
          >
            {isCreatingUser && !addingUserToDeptId && (
              <SettingsGroup>
                <SettingsRow>
                  <div className="flex flex-col gap-4 py-2 w-full">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-slate-100">Create New User</h4>
                      <button onClick={() => setIsCreatingUser(false)} className="p-1 hover:bg-[#4E4F50] rounded-md transition-colors"><X size={16} className="text-slate-400" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Name</label>
                        <input type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full bg-[#252728] border border-[#4E4F50] rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#C7F33C] transition-colors" placeholder="Full Name" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Email</label>
                        <input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full bg-[#252728] border border-[#4E4F50] rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#C7F33C] transition-colors" placeholder="email@company.com" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Role</label>
                        <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as Role})} className="w-full bg-[#252728] border border-[#4E4F50] rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#C7F33C] transition-colors">
                          <option value="GENERAL">GENERAL</option>
                          <option value="MANAGEMENT">MANAGEMENT</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Department</label>
                        <select value={newUser.departmentIds[0] || ""} onChange={e => setNewUser({...newUser, departmentIds: e.target.value ? [e.target.value] : []})} className="w-full bg-[#252728] border border-[#4E4F50] rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#C7F33C] transition-colors">
                          <option value="">No Department</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end mt-2">
                      <button onClick={handleCreateUser} className="bg-[#C7F33C] text-black px-4 py-2 rounded-lg font-bold text-sm hover:bg-[#b5dc35] transition-colors">Create Account</button>
                    </div>
                  </div>
                </SettingsRow>
              </SettingsGroup>
            )}

            {adminUsers.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> System Administrators
                </h3>
                {renderUserGroup(adminUsers, true)}
              </div>
            )}
            
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
                <UserIcon className="w-4 h-4" /> General Users
              </h3>
              {renderUserGroup(regularUsers)}
            </div>
          </SettingsContent>
        )}

        {departments.map(dept => activeTab === `users_${dept.id}` && (
          <SettingsContent 
            key={dept.id} 
            title={
              <div className="flex items-center gap-3">
                {editingDeptId === dept.id ? (
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      value={editDeptName}
                      onChange={e => setEditDeptName(e.target.value)}
                      className="bg-[#252728] border border-[#4E4F50] rounded-lg px-3 py-1.5 text-lg font-bold text-slate-100 outline-none focus:border-[#C7F33C] transition-colors"
                      autoFocus
                    />
                    <button onClick={() => setEditingDeptId(null)} className="p-1.5 hover:bg-[#4E4F50] text-slate-400 rounded-md transition-colors"><X size={16} /></button>
                    <button onClick={() => saveDeptName(dept.id)} disabled={isSavingDept} className="p-1.5 bg-[#C7F33C] text-black rounded-md hover:bg-[#b5dc35] transition-colors disabled:opacity-50"><Check size={16} /></button>
                  </div>
                ) : (
                  <>
                    {dept.name}
                    {isAdmin && (
                      <button onClick={() => startEditingDept(dept)} className="p-1.5 text-slate-400 hover:text-white hover:bg-[#4E4F50] rounded-md transition-colors">
                        <Edit2 size={16} />
                      </button>
                    )}
                  </>
                )}
              </div>
            }
            action={isAdmin && (
              <button onClick={() => { setIsCreatingUser(true); setAddingUserToDeptId(dept.id); }} className="flex items-center gap-2 bg-[#C7F33C] text-black px-4 py-2 rounded-full font-semibold text-sm hover:bg-[#b5dc35] transition-colors">
                <Plus size={16} /> Add to {dept.name}
              </button>
            )}
          >
            {isCreatingUser && addingUserToDeptId === dept.id && (
              <SettingsGroup>
                <SettingsRow>
                  <div className="flex flex-col gap-4 py-2 w-full">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-slate-100">Add User to {dept.name}</h4>
                      <button onClick={() => { setIsCreatingUser(false); setAddingUserToDeptId(null); }} className="p-1 hover:bg-[#4E4F50] rounded-md transition-colors"><X size={16} className="text-slate-400" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Name</label>
                        <input type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full bg-[#252728] border border-[#4E4F50] rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#C7F33C] transition-colors" placeholder="Full Name" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Email</label>
                        <input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full bg-[#252728] border border-[#4E4F50] rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#C7F33C] transition-colors" placeholder="email@company.com" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Role</label>
                        <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as Role})} className="w-full bg-[#252728] border border-[#4E4F50] rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#C7F33C] transition-colors">
                          <option value="GENERAL">GENERAL</option>
                          <option value="MANAGEMENT">MANAGEMENT</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end mt-2">
                      <button onClick={handleCreateUser} className="bg-[#C7F33C] text-black px-4 py-2 rounded-lg font-bold text-sm hover:bg-[#b5dc35] transition-colors">Add User</button>
                    </div>
                  </div>
                </SettingsRow>
              </SettingsGroup>
            )}

            {users.filter(u => u.departments.some(d => d.id === dept.id)).length === 0 ? (
              <div className="bg-[#1C1C1D] border border-[#3A3B3C] border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center">
                <Briefcase className="w-12 h-12 text-slate-600 mb-4" />
                <h4 className="text-lg font-semibold text-slate-300 mb-2">No users in {dept.name}</h4>
                <p className="text-slate-500 max-w-sm">This department is currently empty. Add users to grant them access to department-specific features.</p>
              </div>
            ) : (
              renderUserGroup(users.filter(u => u.departments.some(d => d.id === dept.id)), true)
            )}
          </SettingsContent>
        ))}

      </SettingsLayout>
    </div>
  );
}
