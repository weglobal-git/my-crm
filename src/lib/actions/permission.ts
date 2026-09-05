"use server";

import prisma from "@/lib/prisma";
import { MENU_REGISTRY } from "../menu-registry";
import { revalidatePath } from "next/cache";

export async function syncMenuRegistry(shouldRevalidate: boolean = true) {
  // Sync the hardcoded MENU_REGISTRY with the database
  const existingMenus = await prisma.menuItem.findMany();
  const existingKeys = new Set<string>(existingMenus.map((m: { key: string }) => m.key));

  for (const menu of MENU_REGISTRY) {
    if (existingKeys.has(menu.key)) {
      // Update existing, but DO NOT overwrite parentKey and sortOrder for Level 2 menus
      // because they are now controlled by the Drag-and-Drop UI in the database.
      const existingItem = existingMenus.find((m: { key: string }) => m.key === menu.key);
      const isLevel2 = menu.level === 2;
      
      await prisma.menuItem.update({
        where: { key: menu.key },
        data: {
          label: menu.label,
          level: menu.level,
          icon: menu.iconName,
          href: menu.href,
          description: menu.description ?? null,
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
          description: menu.description ?? null,
          sortOrder: menu.sortOrder,
          isLocked: menu.isLocked ?? false,
        },
      });
    }
  }

  // Delete items from DB that are not in MENU_REGISTRY anymore
  const currentRegistryKeys = new Set<string>(MENU_REGISTRY.map((m: { key: string }) => m.key));
  const keysToDelete = Array.from(existingKeys).filter((key: string) => !currentRegistryKeys.has(key));
  if (keysToDelete.length > 0) {
    await prisma.menuItem.deleteMany({
      where: { key: { in: keysToDelete } }
    });
  }

  // Synchronize permissions for locked menus:
  // Any child menu that is locked MUST mirror its parent's visibility across all departments
  const lockedMenus = await prisma.menuItem.findMany({
    where: { level: 3, isLocked: true }
  });

  for (const lockedMenu of lockedMenus) {
    if (!lockedMenu.parentKey) continue;
    const parent = await prisma.menuItem.findUnique({ where: { key: lockedMenu.parentKey } });
    if (!parent) continue;

    const parentPermissions = await prisma.departmentMenuPermission.findMany({
      where: { menuItemId: parent.id }
    });

    for (const p of parentPermissions) {
      await prisma.departmentMenuPermission.upsert({
        where: {
          departmentId_menuItemId: {
            departmentId: p.departmentId,
            menuItemId: lockedMenu.id
          }
        },
        update: { visible: p.visible },
        create: {
          departmentId: p.departmentId,
          menuItemId: lockedMenu.id,
          visible: p.visible
        }
      });
    }
  }

  if (shouldRevalidate) {
    try {
      revalidatePath("/", "layout");
    } catch {
      // Ignore if called during render
    }
  }
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
  type MenuItemRecord = { id: string; key: string; parentKey: string | null; label: string; level: number; sortOrder: number; icon: string | null; href: string | null };
  const menuMap = new Map<string, MenuItemRecord>(allMenus.map((m: MenuItemRecord) => [m.key, m]));

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
      allMenus.forEach((m: { id: string; key: string; parentKey: string | null }) => {
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
    select: {
      id: true,
      role: true,
      departments: {
        select: { id: true }
      }
    }
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
      departmentId: { in: user.departments.map((d: { id: string }) => d.id) },
      visible: true
    },
    select: {
      menuItem: {
        select: { key: true }
      }
    }
  });

  // A user can see a menu if ANY of their departments has it visible
  const visibleKeys = new Set<string>(permissions.map((p: { menuItem: { key: string } }) => p.menuItem.key));

  // If a parent sub-menu is visible, any of its children that are isLocked MUST be visible
  const allMenus = await prisma.menuItem.findMany({
    select: {
      level: true,
      isLocked: true,
      parentKey: true,
      key: true
    }
  });
  allMenus.forEach((m: { level: number; isLocked: boolean; parentKey: string | null; key: string }) => {
    if (m.level === 3 && m.isLocked && m.parentKey) {
      if (visibleKeys.has(m.parentKey)) {
        visibleKeys.add(m.key);
      }
    }
  });

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
  try {
    return await prisma.menuItem.findMany({
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }]
    });
  } catch (err) {
    console.error("[getDbMenus] Error:", err);
    return [];
  }
}

export async function createMainMenu(label: string, icon: string) {
  // Find highest sortOrder among level 1
  const existing = await prisma.menuItem.findMany({ where: { level: 1 } });
  const maxSort = existing.length > 0 ? Math.max(...existing.map((m: { sortOrder: number }) => m.sortOrder)) : 0;
  
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  
  const created = await prisma.menuItem.create({
    data: {
      key: `custom_${key}_${Date.now()}`,
      label,
      level: 1,
      icon,
      sortOrder: maxSort + 1,
    }
  });
  return { success: true, menu: created };
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

  // Auto-sync locked children if a parent sub-menu (level 2) visibility changed
  const allMenus = await prisma.menuItem.findMany();
  const menuMap = new Map(allMenus.map(m => [m.id, m]));

  const lockedUpdates: { deptId: string; menuId: string; visible: boolean }[] = [];
  for (const update of updates) {
    const menu = menuMap.get(update.menuId);
    if (menu && menu.level === 2) {
      const lockedChildren = allMenus.filter(m => m.parentKey === menu.key && m.isLocked);
      for (const child of lockedChildren) {
        lockedUpdates.push({
          deptId: update.deptId,
          menuId: child.id,
          visible: update.visible,
        });
      }
    }
  }

  if (lockedUpdates.length > 0) {
    await prisma.$transaction(
      lockedUpdates.map(u =>
        prisma.departmentMenuPermission.upsert({
          where: { departmentId_menuItemId: { departmentId: u.deptId, menuItemId: u.menuId } },
          update: { visible: u.visible },
          create: { departmentId: u.deptId, menuItemId: u.menuId, visible: u.visible }
        })
      )
    );
  }

  try {
    revalidatePath("/", "layout");
  } catch {
    // Ignore if during render
  }
  return { success: true };
}

export async function toggleMenuLock(menuId: string, isLocked: boolean) {
  // Update the menu item to be locked/unlocked
  await prisma.menuItem.update({
    where: { id: menuId },
    data: { isLocked }
  });

  const menu = await prisma.menuItem.findUnique({ where: { id: menuId } });
  if (menu && menu.parentKey) {
    const parent = await prisma.menuItem.findUnique({ where: { key: menu.parentKey } });
    if (parent) {
      if (isLocked) {
        // Enforce that all departments have this child menu match the parent menu's visibility
        const departments = await prisma.department.findMany({
          include: {
            permissions: { where: { menuItemId: parent.id } }
          }
        });

        const updates = departments.map((d) => {
          const parentPerm = d.permissions.find(p => p.menuItemId === parent.id);
          return {
            deptId: d.id,
            menuId: menuId,
            visible: parentPerm ? parentPerm.visible : false
          };
        });
        
        await batchUpdatePermissions(updates);
      }
    }
  }

  try {
    revalidatePath("/", "layout");
  } catch {
    // Ignore if during render
  }
  return { success: true };
}
