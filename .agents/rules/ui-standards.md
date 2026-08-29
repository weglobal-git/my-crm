# UI Standards and Reusable Components

## User Search Dropdown
When implementing a feature that requires searching and selecting a user (e.g., inviting a team member, transferring ownership, assigning a task):
1. **Always use the standard component:** Use the `UserSearchDropdown` component located in `src/components/ui/UserSearchDropdown.tsx`.
2. **Standard UX:** The trigger button should typically be a small, white button with a border (e.g., `+ Add`, `Transfer`, `Assign`) placed neatly next to the section title or row it applies to.
3. **Do not create custom dropdowns:** Avoid building inline custom dropdowns or large bulky list designs for user selection. Stick to this popover UX for consistency.

Example usage:
```tsx
import { UserSearchDropdown } from "@/components/ui/UserSearchDropdown";

// ... inside component ...
<div className="relative">
  <button onClick={() => setIsOpen(!isOpen)} className="...">
    + Add
  </button>
  <UserSearchDropdown
    users={usersList}
    isOpen={isOpen}
    onClose={() => setIsOpen(false)}
    onSelect={handleUserSelect}
    actionLabel="Invite"
    excludeUserIds={[currentUserId]}
    align="right"
  />
</div>
```
