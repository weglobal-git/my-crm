"use client";

import { useState } from "react";
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
import { Edit2, Shield, User as UserIcon, Briefcase, Plus, Check, X, Trash2, Search, ChevronRight, Mail } from "lucide-react";
import { useDialog } from "@/providers/DialogProvider";
import Image from "next/image";
import { SettingsLayout, SettingsSidebar, SettingsSidebarItem, SettingsContent, SettingsGroup, SettingsRow } from "@/components/layout/SettingsLayout";

type UserWithDepts = User & { departments: Department[] };

interface Props {
  initialUsers: UserWithDepts[];
  initialDepartments: Department[];
  currentUserRole: string;
}

export function UserManagementClient({ initialUsers, initialDepartments, currentUserRole }: Props) {
  const { toast, confirm } = useDialog();
  const [users, setUsers] = useState(initialUsers);
  const [departments, setDepartments] = useState(initialDepartments);
  
  const [newDeptName, setNewDeptName] = useState("");
  const [isCreatingDept, setIsCreatingDept] = useState(false);
  const isAdmin = currentUserRole === "ADMIN";

  // New User Form State
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "GENERAL" as Role, departmentIds: [] as string[] });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [addingUserToDeptId, setAddingUserToDeptId] = useState<string | null>(null);



  // Layout State
  const [selectedTab, setSelectedTab] = useState<string>("ALL");


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
    } catch (e) {
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
    } finally {
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
      // If adding from a specific department context, ensure it's in the list
      const finalDeptIds = [...newUser.departmentIds];
      if (addingUserToDeptId && !finalDeptIds.includes(addingUserToDeptId)) {
        finalDeptIds.push(addingUserToDeptId);
      }

      const created = await createUser({ ...newUser, departmentIds: finalDeptIds });
      const newDepts = departments.filter(d => finalDeptIds.includes(d.id));
      setUsers([{ ...created, departments: newDepts }, ...users]);
      setNewUser({ name: "", email: "", role: "GENERAL", departmentIds: [] });
      setAddingUserToDeptId(null);
    } catch (e) {
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
    } finally {
      setIsCreatingUser(false);
    }
  };


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
          <div className="flex items-center gap-4">
            {!hideDepartment && (
              <div className="flex items-center gap-2">
                <select 
                  value={user.departments.length > 0 ? user.departments[0].id : ""} 
                  onChange={e => handleDepartmentChange(user.id, e.target.value)}
                  className="text-slate-300 bg-transparent text-[15px] outline-none text-right appearance-none cursor-pointer hover:text-white transition-colors"
                  disabled={!isAdmin}
                >
                  <option value="" className="bg-[#252728]">No Department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id} className="bg-[#252728]">{d.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <select 
                value={user.role} 
                onChange={e => handleRoleChange(user.id, e.target.value as Role)} 
                className="text-slate-300 bg-transparent text-[15px] outline-none text-right appearance-none cursor-pointer hover:text-white transition-colors"
                disabled={!isAdmin}
              >
                <option value="GENERAL" className="bg-[#252728]">General</option>
                <option value="MANAGEMENT" className="bg-[#252728]">Management</option>
                <option value="ADMIN" className="bg-[#252728]">Admin</option>
              </select>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
          </div>
        </SettingsRow>
      ))}
      {userList.length === 0 && (
        <div className="py-10 text-center text-slate-300 text-sm">
          No users found.
        </div>
      )}
    </SettingsGroup>
  );
  const renderAddUserModal = () => {
    if (!addingUserToDeptId) return null;

    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-[#3A3B3C] rounded-2xl w-full max-w-md overflow-hidden shadow-xl border border-[#4E4F50]">
          <div className="px-6 py-4 border-b border-[#4E4F50] flex items-center justify-between">
            <h3 className="font-bold text-slate-100">Add New Member</h3>
            <button onClick={() => setAddingUserToDeptId(null)} className="text-slate-300 hover:text-white transition-colors p-1 rounded-md hover:bg-[#4E4F50]"><X className="w-5 h-5"/></button>
          </div>
          <div className="p-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-300">Name</label>
              <input type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full bg-[#252728] border border-[#4E4F50] text-slate-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#C7F33C]" placeholder="Enter full name" autoFocus/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-300">Email</label>
              <input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full bg-[#252728] border border-[#4E4F50] text-slate-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#C7F33C]" placeholder="Email address"/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-300">Role</label>
              <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as Role})} className="w-full bg-[#252728] border border-[#4E4F50] text-slate-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#C7F33C]">
                <option value="GENERAL">GENERAL</option>
                <option value="MANAGEMENT">MANAGEMENT</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            {addingUserToDeptId === 'ALL' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-300">Department</label>
                <select 
                  value={newUser.departmentIds[0] || ""} 
                  onChange={e => setNewUser({...newUser, departmentIds: e.target.value ? [e.target.value] : []})} 
                  className="w-full bg-[#252728] border border-[#4E4F50] text-slate-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#C7F33C]"
                >
                  <option value="">No Department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t border-[#4E4F50] bg-[#252728] flex items-center justify-end gap-3">
            <button onClick={() => setAddingUserToDeptId(null)} className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors">Cancel</button>
            <button onClick={handleCreateUser} disabled={isCreatingUser || !newUser.name.trim() || !newUser.email.trim()} className="bg-[#C7F33C] text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#b5dc35] disabled:opacity-50 transition-colors">Add Member</button>
          </div>
        </div>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto">
      <SettingsLayout>
        {/* Left Sidebar - Navigation */}
        <SettingsSidebar 
          title="System Settings"
          searchInput={
            <div className="relative">
              <Search className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="w-full bg-[#3A3B3C] text-slate-100 placeholder-slate-400 border border-[#4E4F50] rounded-full pl-9 pr-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#C7F33C] focus:border-[#C7F33C]"
              />
            </div>
          }
        >
          <SettingsSidebarItem 
            icon={<UserIcon />} 
            label="All System Users" 
            isActive={selectedTab === "ALL"} 
            onClick={() => setSelectedTab("ALL")} 
            iconBgColor="bg-blue-500"
          />
          <SettingsSidebarItem 
            icon={<Shield />} 
            label="System Administrators" 
            isActive={selectedTab === "ADMINS"} 
            onClick={() => setSelectedTab("ADMINS")} 
            iconBgColor="bg-rose-500"
          />

          <div className="mt-6 mb-2 px-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Departments</span>
            {isAdmin && (
              <button 
                onClick={handleCreateDept}
                disabled={isCreatingDept || !newDeptName.trim()}
                className="text-slate-300 hover:text-[#C7F33C] transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>

          {isAdmin && (
            <div className="px-2 mb-2">
              <input 
                type="text" 
                value={newDeptName}
                onChange={e => setNewDeptName(e.target.value)}
                placeholder="New Department..."
                className="w-full bg-[#3A3B3C] text-slate-100 placeholder-slate-400 border border-[#4E4F50] rounded-full px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#C7F33C] focus:border-[#C7F33C]"
                onKeyDown={e => e.key === 'Enter' && handleCreateDept()}
              />
            </div>
          )}
          
          <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto hide-scrollbar">
            {departments.map(dept => (
              <SettingsSidebarItem 
                key={dept.id}
                icon={<Briefcase />} 
                label={dept.name} 
                isActive={selectedTab === dept.id} 
                onClick={() => setSelectedTab(dept.id)} 
                iconBgColor="bg-emerald-500"
              />
            ))}
            {departments.length === 0 && (
              <div className="px-2 py-4 text-sm text-slate-300">
                No departments created yet.
              </div>
            )}
          </div>
        </SettingsSidebar>

        {/* Right Content Area */}
        <div className="flex-1 w-full min-h-[400px]">
          
          {selectedTab === "ALL" && (() => {
            const sortedAllUsers = [...regularUsers].sort((a, b) => {
              const deptA = a.departments[0]?.name || "";
              const deptB = b.departments[0]?.name || "";
              if (deptA !== deptB) return deptA.localeCompare(deptB);
              return a.role === "MANAGEMENT" ? -1 : (b.role === "MANAGEMENT" ? 1 : 0);
            });
            
            return (
              <SettingsContent 
                title="All System Users" 
                action={isAdmin ? (
                  <button 
                    onClick={() => { setAddingUserToDeptId("ALL"); setNewUser({name: "", email: "", role: "GENERAL", departmentIds: []}); }}
                    className="flex items-center gap-1.5 bg-[#C7F33C] text-black px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-[#b5dc35] transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Member
                  </button>
                ) : null}
              >
                {renderUserGroup(sortedAllUsers, false)}
              </SettingsContent>
            );
          })()}

          {selectedTab === "ADMINS" && (
            <SettingsContent title="System Administrators">
              {renderUserGroup(adminUsers, true)}
            </SettingsContent>
          )}

          {departments.map(dept => {
            if (selectedTab !== dept.id) return null;
            
            const deptUsers = regularUsers
              .filter(u => u.departments.some(d => d.id === dept.id))
              .sort((a, b) => a.role === "MANAGEMENT" ? -1 : (b.role === "MANAGEMENT" ? 1 : 0));
            
            return (
              <SettingsContent 
                key={dept.id}
                title={editingDeptId === dept.id ? "" : dept.name}
                action={
                  <div className="flex items-center gap-4">
                    {editingDeptId === dept.id ? (
                      <div className="flex items-center gap-2">
                        <input 
                          type="text"
                          value={editDeptName}
                          onChange={e => setEditDeptName(e.target.value)}
                          className="bg-[#252728] text-slate-100 border border-[#4E4F50] rounded-md px-3 py-1.5 text-sm outline-none focus:border-[#C7F33C] w-48 md:w-64"
                          autoFocus
                          onKeyDown={e => e.key === 'Enter' && saveDeptName(dept.id)}
                        />
                        <button onClick={() => saveDeptName(dept.id)} disabled={isSavingDept} className="text-black hover:bg-[#b5dc35] p-1.5 rounded-md transition-colors bg-[#C7F33C] border border-transparent"><Check className="w-4 h-4"/></button>
                        <button onClick={() => setEditingDeptId(null)} disabled={isSavingDept} className="text-slate-300 hover:bg-[#4E4F50] p-1.5 rounded-md transition-colors bg-[#252728] border border-[#4E4F50] hover:text-white"><X className="w-4 h-4"/></button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm text-slate-300">
                          {deptUsers.filter(u => u.role === "MANAGEMENT").length} Managers, {deptUsers.filter(u => u.role === "GENERAL").length} General
                        </span>
                        {isAdmin && (
                          <>
                            <button onClick={() => startEditingDept(dept)} className="text-slate-300 hover:text-[#C7F33C] transition-colors p-1.5 border border-[#4E4F50] rounded-md hover:border-[#C7F33C] bg-[#252728]">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteDept(dept.id)}
                              className="text-slate-300 hover:text-red-400 transition-colors bg-[#252728] p-1.5 rounded-md hover:border-red-400 border border-[#4E4F50]"
                              title="Delete Department"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => { setAddingUserToDeptId(dept.id); setNewUser({name: "", email: "", role: "GENERAL", departmentIds: [dept.id]}); }}
                              className="flex items-center gap-1.5 bg-[#C7F33C] text-black px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-[#b5dc35] transition-colors ml-2"
                            >
                              <Plus className="w-4 h-4" /> Add Member
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                }
              >
                {deptUsers.length > 0 || addingUserToDeptId === dept.id ? (
                  renderUserGroup(deptUsers, true)
                ) : (
                  <p className="text-slate-300 text-sm mb-6 text-center py-8">No users in this department.</p>
                )}
              </SettingsContent>
            );
          })}
          
        </div>
      </SettingsLayout>
      {renderAddUserModal()}
    </div>
  );
}
