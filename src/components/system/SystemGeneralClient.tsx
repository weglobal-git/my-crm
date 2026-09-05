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
import { HardDrive, Cloud, Link2, Archive, Activity, CheckCircle2, Edit2, Shield, User as UserIcon, Briefcase, Plus, Check, X, Trash2, BrainCircuit } from 'lucide-react';
import { useDialog } from '@/providers/DialogProvider';
import Image from "next/image";
import { getSystemAiStats, updateAiBudgetLimit } from "@/lib/actions/ai-admin";

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
  const [isLoadingCloudinary, setIsLoadingCloudinary] = useState(true);

  const [gdriveUsage, setGdriveUsage] = useState({ percent: 0, usageStr: '0 B', limitStr: '15 GB' });
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [connectedGoogleEmail, setConnectedGoogleEmail] = useState<string | null>(null);
  const [isLoadingGDrive, setIsLoadingGDrive] = useState(true);

  // AI Stats State
  const [aiStats, setAiStats] = useState<{ monthlyCost: number; monthlyCostThb?: number; totalTokens?: number; totalCalls?: number; budgetLimit: number } | null>(null);
  const [isLoadingAiStats, setIsLoadingAiStats] = useState(true);
  const [budgetLimitInput, setBudgetLimitInput] = useState('1.00');
  const [isSavingBudget, setIsSavingBudget] = useState(false);

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

  const startEditingDept = (dept: Department) => {
    setEditingDeptId(dept.id);
    setEditDeptName(dept.name);
  };

  const saveDeptName = async (deptId: string) => {
    if (!isAdmin) return;
    if (!editDeptName.trim()) return;
    try {
      await updateDepartmentName(deptId, editDeptName);
      setDepartments(departments.map(d => d.id === deptId ? { ...d, name: editDeptName } : d));
      setEditingDeptId(null);
      toast({ title: "Department updated", type: "success" });
    } catch {
      toast({ title: "Error updating department", type: "error" });
    }
  };

  const handleSaveBudgetLimit = async () => {
    if (!isAdmin) return;
    const limit = parseFloat(budgetLimitInput);
    if (isNaN(limit) || limit <= 0) {
      toast({ title: 'Invalid Budget', description: 'Please enter a budget greater than $0.', type: 'warning' });
      return;
    }

    if (aiStats && limit === aiStats.budgetLimit) return;

    setIsSavingBudget(true);
    try {
      const res = await updateAiBudgetLimit(limit);
      if (res.success) {
        setAiStats(prev => prev ? { ...prev, budgetLimit: limit } : { monthlyCost: 0, budgetLimit: limit });
        toast({ title: 'Budget Updated', description: `Monthly AI budget set to $${limit.toFixed(2)} USD.`, type: 'success' });
      } else {
        toast({ title: 'Error', description: res.error || 'Failed to update budget', type: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update budget';
      toast({ title: 'Error', description: msg, type: 'error' });
    } finally {
      setIsSavingBudget(false);
    }
  };

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");

  const startEditingUser = (user: UserWithDepts) => {
    setEditingUserId(user.id);
    setEditUserName(user.name || "");
    setEditUserEmail(user.email || "");
  };

  const saveUser = async (userId: string) => {
    if (!isAdmin) return;
    if (!editUserName.trim() || !editUserEmail.trim()) return;
    try {
      await updateUserDetails(userId, editUserName, editUserEmail);
      setUsers(users.map(u => u.id === userId ? { ...u, name: editUserName.trim(), email: editUserEmail.trim().toLowerCase() } : u));
      setEditingUserId(null);
    } catch (e) {
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
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
      if (finalDeptIds.length === 0) {
        return toast({ title: "Validation Error", description: "At least one department must be selected.", type: "warning" });
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
    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (activeTab === 'dashboard') {
      queueMicrotask(() => {
        setIsLoadingCloudinary(true);
        setIsLoadingGDrive(true);
        setIsLoadingAiStats(true);
      });
      // 1. Lazy load Cloudinary metrics
      fetch('/api/system/storage')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setCloudinaryStorage({ percent: data.storage.used_percent, usageStr: formatBytes(data.storage.usage), limitStr: formatBytes(data.storage.limit) });
            setCloudinaryBandwidth({ percent: data.bandwidth.used_percent, usageStr: formatBytes(data.bandwidth.usage), limitStr: formatBytes(data.bandwidth.limit) });
          }
        })
        .catch(error => console.error("Failed to load Cloudinary data", error))
        .finally(() => setIsLoadingCloudinary(false));

      // 2. Lazy load Google Drive quota
      fetch('/api/system/google/status')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setIsGoogleConnected(data.isConnected);
            if (data.email) setConnectedGoogleEmail(data.email);
            if (data.quota) {
              setGdriveUsage({ percent: data.quota.used_percent, usageStr: formatBytes(data.quota.usage), limitStr: formatBytes(data.quota.limit) });
            }
          }
        })
        .catch(error => console.error("Failed to load GDrive status", error))
        .finally(() => setIsLoadingGDrive(false));

      // 3. Lazy load AI Usage stats
      getSystemAiStats()
        .then(stats => {
          setAiStats(stats);
          if (stats?.budgetLimit) {
            setBudgetLimitInput(stats.budgetLimit.toString());
          }
        })
        .catch(error => console.error("Failed to load AI stats", error))
        .finally(() => setIsLoadingAiStats(false));

    } else if (activeTab === 'integrations') {
      queueMicrotask(() => setIsLoadingGDrive(true));
      fetch('/api/system/google/status')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setIsGoogleConnected(data.isConnected);
            if (data.email) setConnectedGoogleEmail(data.email);
            if (data.quota) {
              setGdriveUsage({ percent: data.quota.used_percent, usageStr: formatBytes(data.quota.usage), limitStr: formatBytes(data.quota.limit) });
            }
          }
        })
        .catch(error => console.error("Failed to load GDrive status", error))
        .finally(() => setIsLoadingGDrive(false));
    }
  }, [activeTab]);

  const handleConnectDrive = () => {
    window.open('/api/system/google/auth', '_self');
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
      queueMicrotask(() => setActiveTab('integrations'));
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
                <div className="flex flex-col gap-1">
                  <input
                    type="text"
                    value={editUserName}
                    onChange={e => setEditUserName(e.target.value)}
                    className="bg-transparent border-b border-[#C7F33C] text-[15px] font-semibold text-slate-100 outline-none pb-0.5"
                    placeholder="User Name"
                    autoFocus
                  />
                  <input
                    type="email"
                    value={editUserEmail}
                    onChange={e => setEditUserEmail(e.target.value)}
                    className="bg-transparent border-b border-[#4E4F50] focus:border-[#C7F33C] text-[13px] text-slate-400 outline-none pb-0.5"
                    placeholder="Email Address"
                    onBlur={() => saveUser(user.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveUser(user.id);
                      if (e.key === 'Escape') setEditingUserId(null);
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-100 text-[15px]">{user.name}</span>
                    <span className="text-slate-400 text-[13px]">{user.email}</span>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => startEditingUser(user)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white transition-opacity"
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
              label="Dashboard"
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
          <SettingsContent title="Dashboard">
            <SettingsGroup label="Cloudinary (Image CDN)">
              <SettingsRow>
                <div className="flex flex-col gap-2 py-1.5 w-full">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-100 flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-sky-400" />
                      Storage Usage
                    </span>
                    <span className="text-sm font-medium text-slate-400">
                      {isLoadingCloudinary ? (
                        <span className="inline-block w-24 h-4 bg-[#3A3B3C] animate-pulse rounded" />
                      ) : (
                        `${cloudinaryStorage.percent.toFixed(1)}% (${cloudinaryStorage.usageStr} / ${cloudinaryStorage.limitStr})`
                      )}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#1C1C1D] rounded-full overflow-hidden border border-[#4E4F50]/60">
                    {isLoadingCloudinary ? (
                      <div className="h-full w-1/3 bg-[#3A3B3C] animate-pulse rounded-full" />
                    ) : (
                      <div className={`h-full rounded-full transition-all duration-500 ${cloudinaryStorage.percent > 80 ? 'bg-rose-500' : 'bg-sky-500'}`} style={{ width: `${Math.min(cloudinaryStorage.percent, 100)}%` }} />
                    )}
                  </div>
                </div>
              </SettingsRow>
              <SettingsRow>
                <div className="flex flex-col gap-2 py-1.5 w-full">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-100 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-400" />
                      Monthly Bandwidth
                    </span>
                    <span className="text-sm font-medium text-slate-400">
                      {isLoadingCloudinary ? (
                        <span className="inline-block w-24 h-4 bg-[#3A3B3C] animate-pulse rounded" />
                      ) : (
                        `${cloudinaryBandwidth.percent.toFixed(1)}% (${cloudinaryBandwidth.usageStr} / ${cloudinaryBandwidth.limitStr})`
                      )}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#1C1C1D] rounded-full overflow-hidden border border-[#4E4F50]/60">
                    {isLoadingCloudinary ? (
                      <div className="h-full w-1/4 bg-[#3A3B3C] animate-pulse rounded-full" />
                    ) : (
                      <div className={`h-full rounded-full transition-all duration-500 ${cloudinaryBandwidth.percent > 80 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(cloudinaryBandwidth.percent, 100)}%` }} />
                    )}
                  </div>
                </div>
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup label="Google Drive (Cold Storage Archive)">
              <SettingsRow>
                <div className="flex flex-col gap-2 py-1.5 w-full">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-100 flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-yellow-400" />
                      Drive Storage
                    </span>
                    <span className="text-sm font-medium text-slate-400">
                      {isLoadingGDrive ? (
                        <span className="inline-block w-28 h-4 bg-[#3A3B3C] animate-pulse rounded" />
                      ) : isGoogleConnected ? (
                        `${gdriveUsage.percent.toFixed(1)}% (${gdriveUsage.usageStr} / ${gdriveUsage.limitStr})`
                      ) : (
                        'Not Connected'
                      )}
                    </span>
                  </div>
                  {isLoadingGDrive ? (
                    <div className="w-full h-2 bg-[#1C1C1D] rounded-full overflow-hidden border border-[#4E4F50]/60">
                      <div className="h-full w-1/3 bg-[#3A3B3C] animate-pulse rounded-full" />
                    </div>
                  ) : isGoogleConnected ? (
                    <div className="w-full h-2 bg-[#1C1C1D] rounded-full overflow-hidden border border-[#4E4F50]/60">
                      <div className="h-full bg-yellow-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(gdriveUsage.percent, 100)}%` }} />
                    </div>
                  ) : (
                    <div className="text-sm text-amber-500 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                      Please connect your Google Workspace account in the Integrations tab to view storage quota.
                    </div>
                  )}
                </div>
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup label="AI Usage & Budget">
              <SettingsRow>
                <div className="flex flex-col gap-2 py-1.5 w-full">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-100 flex items-center gap-2">
                      <BrainCircuit className="w-4 h-4 text-[#C7F33C]" />
                      Monthly Usage
                    </span>
                    <span className="text-sm font-medium text-slate-300 font-mono">
                      {isLoadingAiStats ? (
                        <span className="inline-block w-20 h-4 bg-[#3A3B3C] animate-pulse rounded" />
                      ) : (
                        `$${(aiStats?.monthlyCost || 0).toFixed(4)} / $${(aiStats?.budgetLimit || 1.0).toFixed(2)}`
                      )}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#1C1C1D] rounded-full overflow-hidden border border-[#4E4F50]/60">
                    {isLoadingAiStats ? (
                      <div className="h-full w-1/4 bg-[#3A3B3C] animate-pulse rounded-full" />
                    ) : (
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          (aiStats ? (aiStats.monthlyCost / (aiStats.budgetLimit || 1)) * 100 : 0) > 80
                            ? 'bg-rose-500'
                            : 'bg-[#C7F33C]'
                        }`}
                        style={{
                          width: `${Math.min(
                            aiStats && aiStats.budgetLimit > 0
                              ? (aiStats.monthlyCost / aiStats.budgetLimit) * 100
                              : 0,
                            100
                          )}%`,
                        }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>
                      {aiStats?.totalTokens ? `${aiStats.totalTokens.toLocaleString()} tokens (${aiStats.totalCalls || 0} calls)` : 'No usage this month'}
                    </span>
                    <span>
                      {(aiStats ? (aiStats.monthlyCost / (aiStats.budgetLimit || 1)) * 100 : 0).toFixed(1)}% used
                    </span>
                  </div>
                </div>
              </SettingsRow>

              <SettingsRow>
                <div className="flex items-center justify-between w-full py-1">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-100">Monthly Budget Cap</span>
                    <span className="text-sm text-slate-400">Auto-pause when limit is reached</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-mono text-slate-400">$</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.5"
                      value={budgetLimitInput}
                      onChange={e => setBudgetLimitInput(e.target.value)}
                      onBlur={handleSaveBudgetLimit}
                      onKeyDown={e => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      disabled={!isAdmin || isSavingBudget}
                      className="w-16 text-right bg-transparent border-none outline-none focus:ring-0 p-0 text-[15px] font-mono text-slate-100 placeholder:text-slate-500 hover:bg-[#4E4F50]/40 focus:bg-[#4E4F50]/60 px-1.5 py-0.5 rounded transition-colors"
                      placeholder="1.00"
                    />
                    <span className="text-xs text-slate-400 font-mono">USD</span>
                  </div>
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
                  <input
                    type="text"
                    value={editDeptName}
                    onChange={e => setEditDeptName(e.target.value)}
                    onBlur={() => saveDeptName(dept.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveDeptName(dept.id);
                      if (e.key === 'Escape') setEditingDeptId(null);
                    }}
                    className="bg-transparent border-b-2 border-[#C7F33C] text-2xl font-bold text-slate-100 outline-none pb-0.5"
                    autoFocus
                  />
                ) : (
                  <div className="flex items-center gap-2 group cursor-pointer" onClick={() => isAdmin && startEditingDept(dept)}>
                    <span>{dept.name}</span>
                    {isAdmin && (
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white transition-opacity"
                        title="Edit Department Name"
                      >
                        <Edit2 size={16} />
                      </button>
                    )}
                  </div>
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
