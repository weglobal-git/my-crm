"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Check, X, Target } from "lucide-react";
import {
  getCompanySaleTargets,
  upsertCompanySaleTarget,
  deleteCompanySaleTarget,
  type CompanySaleTargetDTO,
} from "@/lib/actions/sales-target";
import { getBangkokYear, SUPPORTED_SALES_CURRENCIES } from "@/lib/dashboard/sales-overview";
import { useDialog } from "@/providers/DialogProvider";

interface SaleTargetTabProps {
  companyId: string;
}

function formatAmount(value: string | number, currency = "THB") {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function SaleTargetTab({ companyId }: SaleTargetTabProps) {
  const { toast, confirm } = useDialog();
  const [targets, setTargets] = useState<CompanySaleTargetDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add target form state
  const [isAdding, setIsAdding] = useState(false);
  const currentYear = getBangkokYear();
  const [newYear, setNewYear] = useState<number>(currentYear);
  const [newAmount, setNewAmount] = useState("");
  const [newCurrency, setNewCurrency] = useState("THB");
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Inline edit state
  const [editingKey, setEditingKey] = useState<string | null>(null); // `${year}-${currency}`
  const [editAmount, setEditAmount] = useState("");
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  // Past 10 years down to 2000
  const availableYears = Array.from({ length: 11 }, (_, i) => currentYear - i);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    getCompanySaleTargets(companyId)
      .then((data) => {
        if (isMounted) {
          setTargets(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load sale targets");
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [companyId]);

  const handleStartAdd = () => {
    setIsAdding(true);
    setNewYear(currentYear);
    setNewAmount("");
    setNewCurrency("THB");
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewAmount("");
  };

  const handleSaveNew = async () => {
    const cleanAmount = newAmount.replace(/,/g, "").trim();
    if (!cleanAmount || isNaN(Number(cleanAmount)) || Number(cleanAmount) < 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid positive number", type: "error" });
      return;
    }

    setIsSubmittingNew(true);
    try {
      const saved = await upsertCompanySaleTarget({
        companyId,
        year: newYear,
        amount: cleanAmount,
        currency: newCurrency,
      });

      setTargets((prev) => {
        const filtered = prev.filter((t) => !(t.year === saved.year && t.currency === saved.currency));
        return [saved, ...filtered].sort((a, b) => b.year - a.year || a.currency.localeCompare(b.currency));
      });
      setIsAdding(false);
      setNewAmount("");
      toast({ title: "Sale Target saved", type: "success" });
    } catch (err) {
      toast({
        title: "Failed to save sale target",
        description: err instanceof Error ? err.message : "Error saving target",
        type: "error",
      });
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const handleStartEdit = (target: CompanySaleTargetDTO) => {
    setEditingKey(`${target.year}-${target.currency}`);
    setEditAmount(target.amount);
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditAmount("");
  };

  const handleSaveEdit = async (target: CompanySaleTargetDTO) => {
    const key = `${target.year}-${target.currency}`;
    const cleanAmount = editAmount.replace(/,/g, "").trim();
    if (!cleanAmount || isNaN(Number(cleanAmount)) || Number(cleanAmount) < 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid positive number", type: "error" });
      return;
    }

    const previousAmount = target.amount;
    // Optimistic update
    setTargets((prev) =>
      prev.map((t) => (t.year === target.year && t.currency === target.currency ? { ...t, amount: cleanAmount } : t))
    );
    setEditingKey(null);
    setPendingKeys((prev) => new Set(prev).add(key));

    try {
      const saved = await upsertCompanySaleTarget({
        companyId,
        year: target.year,
        amount: cleanAmount,
        currency: target.currency,
      });
      setTargets((prev) =>
        prev.map((t) => (t.year === target.year && t.currency === target.currency ? saved : t))
      );
      toast({ title: "Sale Target updated", type: "success" });
    } catch (err) {
      // Rollback
      setTargets((prev) =>
        prev.map((t) => (t.year === target.year && t.currency === target.currency ? { ...t, amount: previousAmount } : t))
      );
      toast({
        title: "Failed to update sale target",
        description: err instanceof Error ? err.message : "Error updating target",
        type: "error",
      });
    } finally {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleDelete = async (target: CompanySaleTargetDTO) => {
    const ok = await confirm({
      title: "Delete Sale Target?",
      description: `Are you sure you want to delete the ${target.year} target (${formatAmount(target.amount, target.currency)})?`,
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!ok) return;

    const key = `${target.year}-${target.currency}`;
    const previousTargets = [...targets];
    // Optimistic delete
    setTargets((prev) => prev.filter((t) => !(t.year === target.year && t.currency === target.currency)));
    setPendingKeys((prev) => new Set(prev).add(key));

    try {
      await deleteCompanySaleTarget({
        companyId,
        year: target.year,
        currency: target.currency,
      });
      toast({ title: "Sale Target deleted", type: "success" });
    } catch (err) {
      // Rollback
      setTargets(previousTargets);
      toast({
        title: "Failed to delete sale target",
        description: err instanceof Error ? err.message : "Error deleting target",
        type: "error",
      });
    } finally {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-neutral-400 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-[#C7F33C]" />
        <span className="text-xs">Loading sale targets...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header action */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Target className="w-4 h-4 text-[#C7F33C]" />
            Annual Sale Targets
          </h3>
        </div>

        {!isAdding && (
          <button
            type="button"
            onClick={handleStartAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#C7F33C] text-black font-semibold text-xs rounded-lg hover:bg-[#b8e432] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add target
          </button>
        )}
      </div>

      {/* Inline add form */}
      {isAdding && (
        <div className="p-4 rounded-xl border border-[#4E4F50] bg-[#252728] space-y-3">
          <p className="text-xs font-semibold text-slate-200">New Target</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Year</label>
              <select
                value={newYear}
                onChange={(e) => setNewYear(Number(e.target.value))}
                className="w-full bg-[#1E1F20] border border-[#4E4F50] text-xs text-white px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[#C7F33C]"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} {yr === currentYear ? "(Current)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Currency</label>
              <select
                value={newCurrency}
                onChange={(e) => setNewCurrency(e.target.value)}
                className="w-full bg-[#1E1F20] border border-[#4E4F50] text-xs text-white px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[#C7F33C]"
              >
                {SUPPORTED_SALES_CURRENCIES.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Target Amount</label>
              <input
                type="text"
                placeholder="0.00"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveNew();
                  if (e.key === "Escape") handleCancelAdd();
                }}
                className="w-full bg-[#1E1F20] border border-[#4E4F50] text-xs text-white px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[#C7F33C]"
                autoFocus
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancelAdd}
              disabled={isSubmittingNew}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveNew}
              disabled={isSubmittingNew || !newAmount.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#C7F33C] text-black font-semibold text-xs rounded-lg hover:bg-[#b8e432] disabled:opacity-50 transition-colors"
            >
              {isSubmittingNew ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Target list */}
      {targets.length === 0 && !isAdding ? (
        <div className="p-8 text-center rounded-xl border border-[#4E4F50] bg-[#252728]">
          <Target className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No sale targets recorded yet for this account.</p>
          <p className="text-[11px] text-slate-500 mt-1">Set annual targets to track sales progress in the CRM overview.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#4E4F50] bg-[#252728]">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#4E4F50] bg-[#1E1F20] text-slate-400">
                <th className="px-4 py-2.5 font-medium">Year</th>
                <th className="px-4 py-2.5 font-medium">Target Amount</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#4E4F50]/50">
              {targets.map((target) => {
                const key = `${target.year}-${target.currency}`;
                const isEditing = editingKey === key;
                const isPending = pendingKeys.has(key);

                return (
                  <tr key={key} className="hover:bg-[#3A3B3C]/30 transition-colors">
                    <td className="px-4 py-3 text-slate-200 font-medium whitespace-nowrap">
                      {target.year}
                      {target.year === currentYear && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#C7F33C]/20 text-[#C7F33C] border border-[#C7F33C]/40">
                          Current
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-100">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5 max-w-xs">
                          <span className="text-slate-400 text-xs">{target.currency}</span>
                          <input
                            type="text"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit(target);
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                            className="flex-1 bg-[#1E1F20] border border-[#4E4F50] text-xs text-white px-2 py-1 rounded focus:outline-none focus:border-[#C7F33C]"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-100">
                            {formatAmount(target.amount, target.currency)}
                          </span>
                          {isPending && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(target)}
                            className="p-1 rounded bg-[#C7F33C] text-black hover:bg-[#b8e432] transition-colors"
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="p-1 rounded text-slate-400 hover:text-white transition-colors"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(target)}
                            disabled={isPending}
                            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-[#3A3B3C] disabled:opacity-50 transition-colors"
                            title="Edit target"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(target)}
                            disabled={isPending}
                            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-[#3A3B3C] disabled:opacity-50 transition-colors"
                            title="Delete target"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
