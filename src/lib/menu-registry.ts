import { 
  LayoutDashboard, Briefcase, Megaphone, Wrench, Settings, MousePointer2, FileText, Users, Package, MessageSquare, Building2, FileBadge, Image as ImageIcon, Paperclip,
  Home, Box, BarChart, Calendar, Bell, Shield, Mail, File, Folder, Link, Map, Phone, ShoppingCart, Tag, Video, Zap, Activity, Book, Camera, Database, Globe, Heart, Key, Lock, Monitor, Printer, Search, Star, Truck, UserCircle, Grid, Menu, MoreHorizontal, CheckSquare, ClipboardList, PenTool, LayoutTemplate, PieChart, HardDrive
} from "lucide-react";

export type MenuLevel = 1 | 2 | 3;

export interface MenuDefinition {
  key: string;         // unique dot-notation key
  label: string;
  level: MenuLevel;    // 1=MAIN, 2=SUB, 3=RIGHT
  parentKey?: string;
  iconName?: string;   // string reference for DB storage
  href?: string;
  description?: string;
  sortOrder: number;
}

export const MENU_REGISTRY: MenuDefinition[] = [
  // === MAIN MENU (Level 1) ===
  { key: "dashboard",   label: "Dashboard",           level: 1, iconName: "LayoutDashboard", sortOrder: 1 },
  { key: "sales_ops",   label: "Sales & Operations",  level: 1, iconName: "Briefcase",       href: "/sale", sortOrder: 2 },
  { key: "marketing",   label: "Marketing & Growth",  level: 1, iconName: "Megaphone",       href: "/marketing", sortOrder: 3 },
  { key: "service",     label: "Service & Support",   level: 1, iconName: "Wrench",          href: "/maintenance", sortOrder: 4 },
  { key: "setting",     label: "Setting",             level: 1, iconName: "UserCircle",      sortOrder: 5 },
  { key: "system",      label: "System Settings",     level: 1, iconName: "Settings",        href: "/system", sortOrder: 99 },

  // === SUB-MENU (Level 2) ===
  { key: "crm_overview", label: "CRM Overview", level: 2, parentKey: "dashboard", iconName: "LayoutDashboard", href: "/dashboard/overview", sortOrder: 1 },
  { key: "pipeline",    label: "Pipeline",     level: 2, parentKey: "sales_ops", iconName: "MousePointer2",   href: "/pipeline",   sortOrder: 1 },
  { key: "quotation",   label: "Quotation",    level: 2, parentKey: "sales_ops", iconName: "FileText",        href: "/quotations", sortOrder: 2 },
  { key: "customers",   label: "Customers",    level: 2, parentKey: "sales_ops", iconName: "Users",           href: "/customers",  sortOrder: 3 },
  { key: "product",     label: "Product",      level: 2, parentKey: "marketing", iconName: "Package",         href: "/product",    sortOrder: 4 },

  // User Setting Sub-Menus
  { key: "setting.profile", label: "User Profile", level: 2, parentKey: "setting", iconName: "UserCircle", href: "/profile", sortOrder: 1 },

  // System Sub-Menus
  { key: "system.general",     label: "General",   level: 2, parentKey: "system", iconName: "HardDrive",       href: "/system/general",     sortOrder: 0 },
  { key: "system.structure",   label: "Menu Structure",      level: 2, parentKey: "system", iconName: "LayoutDashboard", href: "/system/structure",   sortOrder: 2 },
  { key: "system.permissions", label: "Menu Permissions",    level: 2, parentKey: "system", iconName: "Settings",        href: "/system/permissions", sortOrder: 3 },

  // === RIGHT-MENU (Level 3) ===
  // ผูก parentKey กับ SUB-MENU
  { key: "pipeline.activity",    label: "Activity Log", level: 3, parentKey: "pipeline", iconName: "MessageSquare", sortOrder: 1 },
  { key: "pipeline.collaborate", label: "Collaborate",  level: 3, parentKey: "pipeline", iconName: "Users",         sortOrder: 2 },
  { key: "pipeline.information", label: "Customer",     level: 3, parentKey: "pipeline", iconName: "Building2",     sortOrder: 3 },
  { key: "pipeline.notes",       label: "Notes",        level: 3, parentKey: "pipeline", iconName: "FileText",      sortOrder: 4 },
  { key: "pipeline.sharedMedia", label: "Shared Media", level: 3, parentKey: "pipeline", iconName: "Folder",       sortOrder: 5 },
];

export function getMenuByKey(key: string): MenuDefinition | undefined {
  return MENU_REGISTRY.find(m => m.key === key);
}

export function getMainMenus(): MenuDefinition[] {
  return MENU_REGISTRY.filter(m => m.level === 1).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getSubMenus(): MenuDefinition[] {
  return MENU_REGISTRY.filter(m => m.level === 2).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getRightMenus(parentKey: string): MenuDefinition[] {
  return MENU_REGISTRY.filter(m => m.level === 3 && m.parentKey === parentKey).sort((a, b) => a.sortOrder - b.sortOrder);
}

// Icon Mapping helper
export const IconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Briefcase,
  Megaphone,
  Wrench,
  Settings,
  MousePointer2,
  FileText,
  Users,
  Package,
  MessageSquare,
  Building2,
  FileBadge,
  ImageIcon,
  Paperclip,
  Home,
  Box,
  BarChart,
  Calendar,
  Bell,
  Shield,
  Mail,
  File,
  Folder,
  Link,
  Map,
  Phone,
  ShoppingCart,
  Tag,
  Video,
  Zap,
  Activity,
  Book,
  Camera,
  Database,
  Globe,
  Heart,
  Key,
  Lock,
  Monitor,
  Printer,
  Search,
  Star,
  Truck,
  UserCircle,
  Grid,
  Menu,
  MoreHorizontal,
  CheckSquare,
  ClipboardList,
  PenTool,
  LayoutTemplate,
  PieChart,
  HardDrive
};
