# Standard UX Guidelines

This project uses a custom, premium UI for notifications and confirmations. **Do not use native browser functions like `window.alert` or `window.confirm`.**

## Guidelines

1. **Never use `alert("...")` or `window.alert(...)`**
   - For showing errors or simple success notifications, use the `toast` function from the `useDialog` hook.
   - Example:
     ```tsx
     import { useDialog } from "@/providers/DialogProvider";
     
     // Inside component:
     const { toast } = useDialog();
     
     // Usage:
     toast({ title: "Error", description: e.message, type: "error" });
     toast({ title: "Success", description: "Saved successfully", type: "success" });
     ```

2. **Never use `confirm("...")` or `window.confirm(...)`**
   - For asking the user to confirm a destructive or important action, use the `confirm` function from the `useDialog` hook.
   - The `confirm` function returns a `Promise<boolean>`. Make sure to `await` it.
   - Example:
     ```tsx
     import { useDialog } from "@/providers/DialogProvider";
     
     // Inside component:
     const { confirm } = useDialog();
     
     // Usage:
     const ok = await confirm({
       title: "Delete Department",
       description: "Are you sure you want to delete this department? This action cannot be undone.",
       confirmText: "Delete",
       cancelText: "Cancel",
       variant: "danger"
     });
     
     if (!ok) return;
     ```

## When writing new code or modifying existing code
- Always check if you need to import `useDialog` from `@/providers/DialogProvider`.
- Maintain the premium and clean aesthetic of the app by providing good `title` and `description` texts.
