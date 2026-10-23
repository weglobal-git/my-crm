"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Loader2, Plus } from "lucide-react";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { createProduct, getProductCategories, getProductBrands } from "@/lib/actions/product";
import { ProductListItemDTO } from "@/lib/product/product-dto";

interface CreateProductPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onProductCreated: (product: ProductListItemDTO) => void;
  availableCategories?: { category: string; count: number }[];
  availableBrands?: { brand: string; count: number }[];
}

export function CreateProductPanel({
  isOpen,
  onClose,
  onProductCreated,
  availableCategories = [],
  availableBrands = [],
}: CreateProductPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available categories & brands with fallback loading
  const [categoriesList, setCategoriesList] = useState(availableCategories);
  const [brandsList, setBrandsList] = useState(availableBrands);

  useEffect(() => {
    if (availableCategories.length > 0) {
      setCategoriesList(availableCategories);
    } else if (isOpen) {
      void getProductCategories().then((res) => {
        if (Array.isArray(res)) setCategoriesList(res);
      });
    }
  }, [availableCategories, isOpen]);

  useEffect(() => {
    if (availableBrands.length > 0) {
      setBrandsList(availableBrands);
    } else if (isOpen) {
      void getProductBrands().then((res) => {
        if (Array.isArray(res)) setBrandsList(res);
      });
    }
  }, [availableBrands, isOpen]);

  // Form states (aligned with EditProductPanel Details tab)
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [hsCode, setHsCode] = useState("");
  const [remark, setRemark] = useState("");

  // Carton & Packing Specifications states
  const [cartonQuantity, setCartonQuantity] = useState<number | string>("");
  const [cartonGrossWeight, setCartonGrossWeight] = useState<number | string>("");
  const [cartonWidth, setCartonWidth] = useState<number | string>("");
  const [cartonLength, setCartonLength] = useState<number | string>("");
  const [cartonHeight, setCartonHeight] = useState<number | string>("");

  const numericW = typeof cartonWidth === "number" ? cartonWidth : parseFloat(String(cartonWidth)) || 0;
  const numericL = typeof cartonLength === "number" ? cartonLength : parseFloat(String(cartonLength)) || 0;
  const numericH = typeof cartonHeight === "number" ? cartonHeight : parseFloat(String(cartonHeight)) || 0;
  const computedCbmFromDim =
    numericW > 0 && numericL > 0 && numericH > 0
      ? Number(((numericW * numericL * numericH) / 1_000_000).toFixed(4))
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const parsedQty =
        typeof cartonQuantity === "number"
          ? cartonQuantity
          : parseInt(String(cartonQuantity), 10) || null;
      const parsedGw =
        typeof cartonGrossWeight === "number"
          ? cartonGrossWeight
          : parseFloat(String(cartonGrossWeight)) || null;
      const computedDimStr =
        numericW > 0 && numericL > 0 && numericH > 0
          ? `${numericW}x${numericL}x${numericH} cm`
          : null;

      const res = await createProduct({
        name: name.trim(),
        brand: brand.trim() || null,
        category: category.trim() || null,
        description: description.trim() || null,
        hsCode: hsCode.trim() || null,
        remark: remark.trim() || null,
        cbm: computedCbmFromDim > 0 ? computedCbmFromDim : null,
        cartonQuantity: parsedQty,
        cartonGrossWeight: parsedGw,
        cartonWidth: numericW > 0 ? numericW : null,
        cartonLength: numericL > 0 ? numericL : null,
        cartonHeight: numericH > 0 ? numericH : null,
        cartonDimension: computedDimStr,
      });

      if (res.success && res.product) {
        onProductCreated(res.product);
        onClose();
        // Reset form
        setName("");
        setBrand("");
        setCategory("");
        setDescription("");
        setHsCode("");
        setRemark("");
        setCartonQuantity("");
        setCartonGrossWeight("");
        setCartonWidth("");
        setCartonLength("");
        setCartonHeight("");
      }
    } catch (err) {
      console.error("Failed to create product:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryOptions = useMemo(() => {
    const opts = categoriesList.map((c) => ({
      label: c.category,
      value: c.category,
      searchTerms: c.category,
    }));
    if (category && !opts.some((o) => o.value.toLowerCase() === category.toLowerCase())) {
      opts.unshift({ label: category, value: category, searchTerms: category });
    }
    return opts;
  }, [categoriesList, category]);

  const brandOptions = useMemo(() => {
    const opts = brandsList.map((b) => ({
      label: b.brand,
      value: b.brand,
      searchTerms: b.brand,
    }));
    if (brand && !opts.some((o) => o.value.toLowerCase() === brand.toLowerCase())) {
      opts.unshift({ label: brand, value: brand, searchTerms: brand });
    }
    return opts;
  }, [brandsList, brand]);

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Create Product"
      subtitle="Add a new main catalog product and carton specifications"
      widthClass="w-[650px]"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 select-none pb-8">
        {/* Box 1: Product Basic Details */}
        <div className="bg-[#3A3B3C] rounded-2xl p-5 space-y-5 border-0">
          {/* Header: Title */}
          <div className="flex items-center justify-between border-b border-[#252728] pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Product Details
            </span>
          </div>

          {/* Full-Width Product Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Product Name <span className="text-[#C7F33C]">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none"
              placeholder="Enter product title..."
            />
          </div>

          {/* Category & Brand (2-Column Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Category</label>
              <SearchableSelect
                options={categoryOptions}
                value={category}
                onChange={setCategory}
                placeholder="Select or type category..."
                isClearable
                allowCustom
                buttonClassName="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-left text-xs text-slate-100 focus:border-[#C7F33C] transition-colors flex items-center justify-between outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Brand</label>
              <SearchableSelect
                options={brandOptions}
                value={brand}
                onChange={setBrand}
                placeholder="Select or type brand..."
                isClearable
                allowCustom
                buttonClassName="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-left text-xs text-slate-100 focus:border-[#C7F33C] transition-colors flex items-center justify-between outline-none"
              />
            </div>
          </div>

          {/* Thai Name & HS Code (2-Column Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Thai Name / Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none"
                placeholder="Thai name or local description..."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">HS Code</label>
              <input
                type="text"
                value={hsCode}
                onChange={(e) => setHsCode(e.target.value)}
                className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none"
                placeholder="e.g. 3304.99.90"
              />
            </div>
          </div>

          {/* Remark (Textarea) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300">Remark</label>
            <textarea
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none resize-none"
              placeholder="Additional notes for this product..."
            />
          </div>
        </div>

        {/* Box 2: Carton & Packing Specifications */}
        <div className="bg-[#3A3B3C] rounded-2xl p-5 space-y-4 border-0">
          <div className="flex items-center justify-between border-b border-[#252728] pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Carton & Packing Specifications
            </span>
            {computedCbmFromDim > 0 && (
              <span className="text-[11px] font-medium text-slate-400">
                CBM: <span className="text-slate-200 font-bold tabular-nums">{computedCbmFromDim} m³</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Units per Carton (pcs)
              </label>
              <input
                type="number"
                value={cartonQuantity}
                onChange={(e) => setCartonQuantity(e.target.value)}
                className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-[#C7F33C] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="e.g. 12"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Carton GW (kg)
              </label>
              <input
                type="number"
                step="0.01"
                value={cartonGrossWeight}
                onChange={(e) => setCartonGrossWeight(e.target.value)}
                className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-[#C7F33C] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="e.g. 12.5"
              />
            </div>
          </div>

          {/* Dimensions (cm) */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Width (cm)</label>
              <input
                type="number"
                step="0.1"
                value={cartonWidth}
                onChange={(e) => setCartonWidth(e.target.value)}
                className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-[#C7F33C] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="Width"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Length (cm)</label>
              <input
                type="number"
                step="0.1"
                value={cartonLength}
                onChange={(e) => setCartonLength(e.target.value)}
                className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-[#C7F33C] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="Length"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Height (cm)</label>
              <input
                type="number"
                step="0.1"
                value={cartonHeight}
                onChange={(e) => setCartonHeight(e.target.value)}
                className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-[#C7F33C] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="Height"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="px-5 py-2 text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] rounded-full transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Create Product</span>
              </>
            )}
          </button>
        </div>
      </form>
    </SlideOverPanel>
  );
}
