"use client";

import { useState } from "react";
import { User, Department, Role } from "@prisma/client";
import { 
  updateUserRole, 
  updateUserDepartment, 
  createDepartment, 
  deleteDepartment,
  createUser,
  updateUserDetails,
  updateDepartmentName,
  deleteUser
} from "@/lib/actions/user";
import { Edit2, Shield, User as UserIcon, Briefcase, Plus, Mail, Check, X, Trash2 } from "lucide-react";

type UserWithDept = User & { department: Department | null };

interface Props {
  initialUsers: UserWithDept[];
  initialDepartments: Department[];
  currentUserRole: string;
  currentUserId: string;
}

export function UserManagementClient({ initialUsers, initialDepartments, currentUserRole, currentUserId }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [departments, setDepartments] = useState(initialDepartments);
  
  const [newDeptName, setNewDeptName] = useState("");
  const [isCreatingDept, setIsCreatingDept] = useState(false);
  const isAdmin = currentUserRole === "ADMIN";

  // New User Form State
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "GENERAL" as Role, departmentId: "NONE" });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [addingUserToDeptId, setAddingUserToDeptId] = useState<string | null>(null);

  // Layout State
  const [selectedTab, setSelectedTab] = useState<string>("ALL");

  // Edit User State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "" });
  const [isSavingUser, setIsSavingUser] = useState(false);

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
      if (e instanceof Error) alert("Error: " + e.message);
    } finally {
      setIsSavingDept(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: Role) => {
    if (!isAdmin) return alert("Only ADMIN can change roles.");
    try {
      await updateUserRole(userId, newRole);
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (e) {
      if (e instanceof Error) alert("Error: " + e.message);
    }
  };

  const handleDeptChange = async (userId: string, newDeptId: string) => {
    if (!isAdmin) return alert("Only ADMIN can change departments.");
    const deptId = newDeptId === "NONE" ? null : newDeptId;
    try {
      await updateUserDepartment(userId, deptId);
      const newDept = departments.find(d => d.id === deptId) || null;
      setUsers(users.map(u => u.id === userId ? { ...u, departmentId: deptId, department: newDept } : u));
    } catch (e) {
      if (e instanceof Error) alert("Error: " + e.message);
    }
  };

  const startEditing = (user: UserWithDept) => {
    setEditingUserId(user.id);
    setEditForm({ name: user.name || "", email: user.email || "" });
  };

  const cancelEditing = () => {
    setEditingUserId(null);
    setEditForm({ name: "", email: "" });
  };

  const saveUserDetails = async (userId: string) => {
    if (!isAdmin) return alert("Only ADMIN can edit users.");
    setIsSavingUser(true);
    try {
      await updateUserDetails(userId, editForm.name, editForm.email);
      setUsers(users.map(u => u.id === userId ? { ...u, name: editForm.name, email: editForm.email } : u));
      setEditingUserId(null);
    } catch (e) {
      if (e instanceof Error) alert("Error: " + e.message);
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleCreateDept = async () => {
    if (!isAdmin) return alert("Only ADMIN can create departments.");
    if (!newDeptName.trim()) return;
    setIsCreatingDept(true);
    try {
      const dept = await createDepartment(newDeptName);
      setDepartments([...departments, dept].sort((a, b) => a.name.localeCompare(b.name)));
      setNewDeptName("");
    } catch (e) {
      if (e instanceof Error) alert("Error: " + e.message);
    } finally {
      setIsCreatingDept(false);
    }
  };

  const handleDeleteDept = async (id: string) => {
    if (!isAdmin) return alert("Only ADMIN can delete departments.");
    if (!confirm("Are you sure you want to delete this department?")) return;
    try {
      await deleteDepartment(id);
      setDepartments(departments.filter(d => d.id !== id));
    } catch (e) {
      if (e instanceof Error) alert("Error: " + e.message);
    }
  };

  const handleCreateUser = async () => {
    if (!isAdmin) return alert("Only ADMIN can create users.");
    if (!newUser.name.trim() || !newUser.email.trim()) {
      return alert("Name, Email, and Role are required.");
    }
    setIsCreatingUser(true);
    try {
      const created = await createUser(newUser);
      const newDept = departments.find(d => d.id === created.departmentId) || null;
      setUsers([{ ...created, department: newDept }, ...users]);
      setNewUser({ name: "", email: "", role: "GENERAL", departmentId: "NONE" });
      setAddingUserToDeptId(null);
    } catch (e) {
      if (e instanceof Error) alert("Error: " + e.message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!isAdmin) return;
    if (confirm(`Are you sure you want to remove ${userName}? This action cannot be undone.`)) {
      try {
        await deleteUser(userId);
        setUsers(users.filter(u => u.id !== userId));
      } catch (e) {
        if (e instanceof Error) alert("Error: " + e.message);
      }
    }
  };

  const adminUsers = users.filter(u => u.role === "ADMIN" || u.email === "weglobal.server@gmail.com");
  const regularUsers = users.filter(u => u.role !== "ADMIN" && u.email !== "weglobal.server@gmail.com");

  const renderUserTable = (userList: UserWithDept[], hideDepartment: boolean = false, contextDeptId: string | null = null) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-100 text-sm text-slate-500">
            <th className="pb-4 font-semibold w-[30%]">Name</th>
            <th className="pb-4 font-semibold w-[30%]">Email</th>
            <th className="pb-4 font-semibold">Role</th>
            {!hideDepartment && <th className="pb-4 font-semibold">Department</th>}
            <th className="pb-4 font-semibold w-24"></th>
          </tr>
        </thead>
        <tbody>
          {addingUserToDeptId === contextDeptId && contextDeptId && (
            <tr className="border-b border-indigo-100 bg-indigo-50/50">
              <td className="py-4 pr-4 pl-4">
                <input type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" placeholder="Name" autoFocus/>
              </td>
              <td className="py-4 pr-4">
                <input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" placeholder="Email"/>
              </td>
              <td className="py-4 pr-4">
                <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as Role})} className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500">
                  <option value="GENERAL">GENERAL</option>
                  <option value="MANAGEMENT">MANAGEMENT</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </td>
              {!hideDepartment && (
                <td className="py-4 pr-4">
                  <select value={newUser.departmentId} onChange={e => setNewUser({...newUser, departmentId: e.target.value})} className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500">
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </td>
              )}
              <td className="py-4 pr-4 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={handleCreateUser} disabled={isCreatingUser || !newUser.name.trim() || !newUser.email.trim()} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">Add</button>
                  <button onClick={() => setAddingUserToDeptId(null)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-slate-200"><X className="w-4 h-4"/></button>
                </div>
              </td>
            </tr>
          )}
          {userList.map(user => {
            const isEditing = editingUserId === user.id;
            
            return (
              <tr key={user.id} className="border-b border-slate-50 last:border-none group">
                <td className="py-4 font-medium text-slate-900 pr-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden shrink-0">
                      <img src={user.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${user.name || user.email}`} alt="User Avatar" className="w-full h-full object-cover" />
                    </div>
                    {isEditing ? (
                      <input 
                        type="text" 
                        value={editForm.name} 
                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                        className="bg-white border border-slate-200 rounded-md px-2 py-1 text-sm outline-none focus:border-indigo-500 w-full"
                      />
                    ) : (
                      <span className="truncate">{user.name || "Unnamed User"}</span>
                    )}
                  </div>
                </td>
                <td className="py-4 text-slate-600 pr-4">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    {isEditing ? (
                      <input 
                        type="email" 
                        value={editForm.email} 
                        onChange={e => setEditForm({...editForm, email: e.target.value})}
                        className="bg-white border border-slate-200 rounded-md px-2 py-1 text-sm outline-none focus:border-indigo-500 w-full"
                      />
                    ) : (
                      <span className="truncate">{user.email}</span>
                    )}
                  </div>
                </td>
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-slate-400 shrink-0" />
                    <select 
                      value={user.role} 
                      onChange={e => handleRoleChange(user.id, e.target.value as Role)}
                      disabled={!isAdmin || user.email === "weglobal.server@gmail.com"}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed w-full max-w-[150px]"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="MANAGEMENT">MANAGEMENT</option>
                      <option value="GENERAL">GENERAL</option>
                    </select>
                  </div>
                </td>
                {!hideDepartment && (
                  <td className="py-4 pr-4">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
                      <select 
                        value={user.departmentId || "NONE"} 
                        onChange={e => handleDeptChange(user.id, e.target.value)}
                        disabled={!isAdmin}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed w-full max-w-[150px]"
                      >
                        <option value="NONE">Unassigned</option>
                        {departments.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                )}
                <td className="py-4 text-right">
                  {isAdmin && (
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isEditing ? (
                        <>
                          <button onClick={() => saveUserDetails(user.id)} disabled={isSavingUser} className="p-1.5 text-green-600 hover:bg-green-50 rounded-md transition-colors" title="Save">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={cancelEditing} disabled={isSavingUser} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors" title="Cancel">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditing(user)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Edit User">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {user.id !== currentUserId && user.email !== "weglobal.server@gmail.com" && (
                            <button onClick={() => handleDeleteUser(user.id, user.name || "Unknown User")} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Remove User">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          {userList.length === 0 && addingUserToDeptId !== contextDeptId && (
            <tr>
              <td colSpan={hideDepartment ? 4 : 5} className="py-10 text-center text-slate-400 text-sm">
                No users found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 mb-2 px-2">
        <UserIcon className="w-6 h-6 text-indigo-500" />
        <h2 className="text-2xl font-bold text-slate-900">System Users</h2>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Left Sidebar - Navigation */}
        <div className="w-full md:w-64 lg:w-72 shrink-0 flex flex-col gap-6">
          
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <button 
              onClick={() => setSelectedTab("ALL")}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${selectedTab === "ALL" ? "bg-indigo-50 border-l-2 border-indigo-500 text-indigo-700" : "hover:bg-slate-50 text-slate-700 border-l-2 border-transparent"}`}
            >
              <UserIcon className={`w-4 h-4 ${selectedTab === "ALL" ? "text-indigo-600" : "text-indigo-400"}`} />
              <span className="font-semibold text-sm">All System Users</span>
            </button>
            <button 
              onClick={() => setSelectedTab("ADMINS")}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-t border-slate-100 ${selectedTab === "ADMINS" ? "bg-rose-50 border-l-2 border-rose-500 text-rose-700" : "hover:bg-slate-50 text-slate-700 border-l-2 border-transparent"}`}
            >
              <Shield className={`w-4 h-4 ${selectedTab === "ADMINS" ? "text-rose-600" : "text-rose-400"}`} />
              <span className="font-semibold text-sm">System Administrators</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Briefcase className="w-4 h-4 text-emerald-500" />
                Departments
              </div>
            </div>

            {isAdmin && (
              <div className="p-3 border-b border-slate-100 bg-white">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newDeptName}
                    onChange={e => setNewDeptName(e.target.value)}
                    placeholder="New Department..."
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 min-w-0"
                    onKeyDown={e => e.key === 'Enter' && handleCreateDept()}
                  />
                  <button 
                    onClick={handleCreateDept}
                    disabled={isCreatingDept || !newDeptName.trim()}
                    className="flex items-center justify-center bg-black text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            
            <div className="flex flex-col max-h-[400px] overflow-y-auto">
              {departments.map(dept => (
                <button 
                  key={dept.id}
                  onClick={() => setSelectedTab(dept.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors border-b border-slate-50 last:border-none ${selectedTab === dept.id ? "bg-indigo-50 border-l-2 border-indigo-500 text-indigo-700" : "hover:bg-slate-50 text-slate-700 border-l-2 border-transparent"}`}
                >
                  <span className="font-medium text-sm truncate pr-2">{dept.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${selectedTab === dept.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                    {regularUsers.filter(u => u.departmentId === dept.id).length}
                  </span>
                </button>
              ))}
              {departments.length === 0 && (
                <div className="px-4 py-4 text-center text-sm text-slate-400">
                  No departments created yet.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 w-full bg-white rounded-2xl shadow-sm border border-slate-100 min-h-[400px]">
          
          {selectedTab === "ALL" && (() => {
            const sortedAllUsers = [...regularUsers].sort((a, b) => {
              const deptA = departments.find(d => d.id === a.departmentId)?.name || "";
              const deptB = departments.find(d => d.id === b.departmentId)?.name || "";
              if (deptA !== deptB) return deptA.localeCompare(deptB);
              return a.role === "MANAGEMENT" ? -1 : (b.role === "MANAGEMENT" ? 1 : 0);
            });
            
            return (
              <div className="p-6 md:p-8 flex flex-col h-full">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                  <div className="flex items-center gap-3">
                    <UserIcon className="w-5 h-5 text-indigo-500" />
                    <h3 className="text-lg font-bold text-slate-900">All System Users</h3>
                  </div>
                  {isAdmin && (
                    <button 
                      onClick={() => { setAddingUserToDeptId("ALL"); setNewUser({name: "", email: "", role: "GENERAL", departmentId: departments[0]?.id || "NONE"}); }}
                      className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Add Member
                    </button>
                  )}
                </div>
                <div className="flex-1">
                  <div className="bg-white rounded-xl border border-slate-100 overflow-hidden mb-6">
                    {renderUserTable(sortedAllUsers, false, "ALL")}
                  </div>
                </div>
              </div>
            );
          })()}

          {selectedTab === "ADMINS" && (
            <div className="p-6 md:p-8 flex flex-col h-full">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                <Shield className="w-5 h-5 text-rose-500" />
                <h3 className="text-lg font-bold text-slate-900">System Administrators</h3>
              </div>
              <div className="flex-1">
                <div className="bg-white rounded-xl border border-slate-100 overflow-hidden mb-6">
                  {renderUserTable(adminUsers, true, "ADMINS")}
                </div>
              </div>
            </div>
          )}

          {departments.map(dept => {
            if (selectedTab !== dept.id) return null;
            
            const deptUsers = regularUsers
              .filter(u => u.departmentId === dept.id)
              .sort((a, b) => a.role === "MANAGEMENT" ? -1 : (b.role === "MANAGEMENT" ? 1 : 0));
            
            return (
              <div key={dept.id} className="p-6 md:p-8 flex flex-col h-full">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-5 h-5 text-emerald-500" />
                    {editingDeptId === dept.id ? (
                      <div className="flex items-center gap-2">
                        <input 
                          type="text"
                          value={editDeptName}
                          onChange={e => setEditDeptName(e.target.value)}
                          className="bg-white border border-slate-300 rounded-md px-3 py-1.5 text-sm outline-none focus:border-indigo-500 w-48 md:w-64"
                          autoFocus
                          onKeyDown={e => e.key === 'Enter' && saveDeptName(dept.id)}
                        />
                        <button onClick={() => saveDeptName(dept.id)} disabled={isSavingDept} className="text-green-600 hover:bg-green-100 p-1.5 rounded-md transition-colors shadow-sm bg-white border border-green-200"><Check className="w-4 h-4"/></button>
                        <button onClick={() => setEditingDeptId(null)} disabled={isSavingDept} className="text-slate-400 hover:bg-slate-200 p-1.5 rounded-md transition-colors bg-white border border-slate-200"><X className="w-4 h-4"/></button>
                      </div>
                    ) : (
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        {dept.name}
                        {isAdmin && (
                          <button onClick={() => startEditingDept(dept)} className="text-slate-400 hover:text-indigo-600 transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </h3>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1 rounded-full font-medium">
                      {deptUsers.filter(u => u.role === "MANAGEMENT").length} Managers, {deptUsers.filter(u => u.role === "GENERAL").length} General
                    </span>
                    {isAdmin && (
                      <button 
                        onClick={() => handleDeleteDept(dept.id)}
                        className="text-slate-400 hover:text-red-500 transition-colors bg-white p-1.5 rounded-md hover:bg-red-50"
                        title="Delete Department"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {isAdmin && (
                      <button 
                        onClick={() => { setAddingUserToDeptId(dept.id); setNewUser({name: "", email: "", role: "GENERAL", departmentId: dept.id}); }}
                        className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors ml-2"
                      >
                        <Plus className="w-4 h-4" /> Add Member
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="flex-1">
                  {deptUsers.length > 0 || addingUserToDeptId === dept.id ? (
                    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden mb-6">
                      {renderUserTable(deptUsers, true, dept.id)}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm mb-6 text-center py-8 bg-slate-50 rounded-xl border border-slate-100 border-dashed">No users in this department.</p>
                  )}
                </div>
              </div>
            );
          })}
          
        </div>
      </div>
    </div>
  );
}
