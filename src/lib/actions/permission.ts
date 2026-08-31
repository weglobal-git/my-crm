"use server";

import prisma from "@/lib/prisma";
import { MENU_REGISTRY } from "../menu-registry";

export async function syncMenuRegistry() {
  // Sync the hardcoded MENU_REGISTRY with the database
  const existingMenus = await prisma.menuItem.findMany();
  const existingKeys = new Set(existingMenus.map((m) => m.key));

  for (const menu of MENU_REGISTRY) {
    if (existingKeys.has(menu.key)) {
      // Update existing, but DO NOT overwrite parentKey and sortOrder for Level 2 menus
      // because they are now controlled by the Drag-and-Drop UI in the database.
      const existingItem = existingMenus.find(m => m.key === menu.key);
      const isLevel2 = menu.level === 2;
      
      await prisma.menuItem.update({
        where: { key: menu.key },
        data: {
          label: menu.label,
          level: menu.level,
          icon: menu.iconName,
          href: menu.href,
          parentKey: isLevel2 && existingItem?.parentKey ? existingItem.parentKey : menu.parentKey,
          sortOrder: isLevel2 ? existingItem!.sortOrder : menu.sortOrder,
        },
      });
    } else {
      // Create new
      await prisma.menuItem.create({
        data: {
          key: menu.key,
          label: menu.label,
          level: menu.level,
          parentKey: menu.parentKey,
          icon: menu.iconName,
          href: menu.href,
          sortOrder: menu.sortOrder,
        },
      });
    }
  }

  // Optional: We can delete items from DB that are not in MENU_REGISTRY anymore,
  // but it's safer to just leave them or do a soft delete.
  return { success: true };
}

export async function getPermissionMatrix() {
  const departments = await prisma.department.findMany({
    include: {
      permissions: {
        include: { menuItem: true },
      },
    },
    orderBy: { name: 'asc' }
  });

  const menus = await prisma.menuItem.findMany({
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }]
  });

  return { departments, menus };
}

export async function updatePermission(departmentId: string, menuItemId: string, visible: boolean) {
  // 1. Update the target permission
  await prisma.departmentMenuPermission.upsert({
    where: {
      departmentId_menuItemId: {
        departmentId,
        menuItemId,
      },
    },
    update: { visible },
    create: {
      departmentId,
      menuItemId,
      visible,
    },
  });

  // 2. Auto subset logic
  const targetMenu = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
  if (!targetMenu) return { success: true };

  const allMenus = await prisma.menuItem.findMany();
  const menuMap = new Map(allMenus.map(m => [m.key, m]));

  if (visible) {
    // If checking a child, we MUST check its parent (and grandparent)
    let currentParentKey = targetMenu.parentKey;
    while (currentParentKey) {
      const parentMenu = menuMap.get(currentParentKey);
      if (parentMenu) {
        await prisma.departmentMenuPermission.upsert({
          where: { departmentId_menuItemId: { departmentId, menuItemId: parentMenu.id } },
          update: { visible: true },
          create: { departmentId, menuItemId: parentMenu.id, visible: true },
        });
        currentParentKey = parentMenu.parentKey;
      } else {
        break;
      }
    }
  } else {
    // If unchecking a parent, we MUST uncheck all its children
    const keysToUncheck = new Set<string>();
    
    // Recursive function to find all children
    const findChildren = (parentKey: string) => {
      allMenus.forEach(m => {
        if (m.parentKey === parentKey) {
          keysToUncheck.add(m.id);
          findChildren(m.key); // search deeper
        }
      });
    };
    
    findChildren(targetMenu.key);

    if (keysToUncheck.size > 0) {
      await prisma.departmentMenuPermission.updateMany({
        where: {
          departmentId,
          menuItemId: { in: Array.from(keysToUncheck) }
        },
        data: { visible: false }
      });
    }
  }

  return { success: true };
}

export async function getUserVisibleMenuKeys(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { departments: true }
  });

  if (!user) return [];

  // If Admin, they see everything
  if (user.role === "ADMIN") {
    return MENU_REGISTRY.map(m => m.key);
  }

  if (user.departments.length === 0) {
    return []; // No department assigned
  }

  // Get permissions for all user's departments
  const permissions = await prisma.departmentMenuPermission.findMany({
    where: {
      departmentId: { in: user.departments.map(d => d.id) },
      visible: true
    },
    include: { menuItem: true }
  });

  // A user can see a menu if ANY of their departments has it visible
  const visibleKeys = new Set(permissions.map(p => p.menuItem.key));

  return Array.from(visibleKeys);
}

export async function updateMenuStructure(menuId: string, newParentKey: string, newSortOrder: number) {
  await prisma.menuItem.update({
    where: { id: menuId },
    data: {
      parentKey: newParentKey,
      sortOrder: newSortOrder,
    },
  });
  return { success: true };
}

export async function getDbMenus() {
  return await prisma.menuItem.findMany({
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }]
  });
}

export async function createMainMenu(label: string, icon: string) {
  // Find highest sortOrder among level 1
  const existing = await prisma.menuItem.findMany({ where: { level: 1 } });
  const maxSort = existing.length > 0 ? Math.max(...existing.map(m => m.sortOrder)) : 0;
  
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  
  await prisma.menuItem.create({
    data: {
      key: `custom_${key}_${Date.now()}`,
      label,
      level: 1,
      icon,
      sortOrder: maxSort + 1,
    }
  });
  return { success: true };
}

export async function updateMenuDetails(id: string, label: string, icon: string, description?: string) {
  await prisma.menuItem.update({
    where: { id },
    data: { label, icon, description }
  });
  return { success: true };
}

export async function deleteMainMenu(id: string) {
  const menu = await prisma.menuItem.findUnique({ where: { id } });
  if (!menu) return { success: false, error: "Menu not found" };
  
  // Check if sub-menus exist
  const subMenusCount = await prisma.menuItem.count({
    where: { parentKey: menu.key }
  });

  if (subMenusCount > 0) {
    return { success: false, error: "Cannot delete category: Please move or delete all sub-menus inside it first." };
  }
  
  // Delete permissions associated with it
  await prisma.departmentMenuPermission.deleteMany({
    where: { menuItemId: id }
  });
  
  await prisma.menuItem.delete({ where: { id } });
  return { success: true };
}

export async function updateMainMenuSortOrders(updates: {id: string, sortOrder: number}[]) {
  // Use a transaction to perform all updates safely
  await prisma.$transaction(
    updates.map(update => 
      prisma.menuItem.update({
        where: { id: update.id },
        data: { sortOrder: update.sortOrder }
      })
    )
  );
  return { success: true };
}

export async function batchUpdatePermissions(updates: { deptId: string, menuId: string, visible: boolean }[]) {
  if (!updates || updates.length === 0) return { success: true };
  
  await prisma.$transaction(
    updates.map(update => 
      prisma.departmentMenuPermission.upsert({
        where: { departmentId_menuItemId: { departmentId: update.deptId, menuItemId: update.menuId } },
        update: { visible: update.visible },
        create: { departmentId: update.deptId, menuItemId: update.menuId, visible: update.visible }
      })
    )
  );
  return { success: true };
}

export async function toggleMenuLock(menuId: string, isLocked: boolean) {
  // Update the menu item to be locked/unlocked
  await prisma.menuItem.update({
    where: { id: menuId },
    data: { isLocked }
  });

  // If locked, we need to enforce that all departments that have access to the parent menu 
  // also get access to this menu.
  if (isLocked) {
    const menu = await prisma.menuItem.findUnique({ where: { id: menuId } });
    if (menu && menu.parentKey) {
      const parent = await prisma.menuItem.findUnique({ where: { key: menu.parentKey } });
      if (parent) {
        // Find all departments that have the parent menu enabled
        const parentPermissions = await prisma.departmentMenuPermission.findMany({
          where: { menuItemId: parent.id, visible: true }
        });

        // Grant this child menu to those same departments
        const updates = parentPermissions.map(p => ({
          deptId: p.departmentId,
          menuId: menuId,
          visible: true
        }));
        
        await batchUpdatePermissions(updates);
      }
    }
  }

  return { success: true };
}
