"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Loader2, Plus, Image as ImageIcon, Upload, X, Star } from "lucide-react";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { createProduct, getProductCategories, getProductBrands } from "@/lib/actions/product";
import { ProductListItemDTO } from "@/lib/product/product-dto";
import { getOptimizedCloudinaryUrl } from "@/lib/utils";

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
  const [isUploadingImage, setIsUploadingImage] = useState(false);

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

  // Form states
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [starRating, setStarRating] = useState(0);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const [price, setPrice] = useState<number | string>("");
  const [productCost, setProductCost] = useState<number | string>("");
  const [priceCondition, setPriceCondition] = useState("");
  const [cbm, setCbm] = useState<number | string>("");
  const [cartonQuantity, setCartonQuantity] = useState<number | string>("");
  const [remark, setRemark] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Image Upload to Cloudinary
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read as Base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setIsUploadingImage(true);
      try {
        const res = await fetch("/api/upload/product-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64 }),
        });
        const data = await res.json();
        if (data.success && data.url) {
          setImageUrl(data.url);
        } else {
          alert("Image upload failed: " + (data.error || "Unknown error"));
        }
      } catch (err) {
        console.error("Upload error:", err);
        alert("Image upload failed");
      } finally {
        setIsUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await createProduct({
        name: name.trim(),
        brand: brand.trim() || null,
        category: category.trim() || null,
        description: description.trim() || null,
        imageUrl: imageUrl.trim() || null,
        starRating,
        price: typeof price === "number" ? price : parseFloat(price as string) || 0,
        productCost: typeof productCost === "number" ? productCost : parseFloat(productCost as string) || null,
        priceCondition: priceCondition.trim() || null,
        cbm: typeof cbm === "number" ? cbm : parseFloat(cbm as string) || null,
        cartonQuantity: typeof cartonQuantity === "number" ? cartonQuantity : parseInt(cartonQuantity as string, 10) || null,
        remark: remark.trim() || null,
      });

      if (res.success && res.product) {
        onProductCreated(res.product);
        onClose();
        // Reset form
        setName("");
        setBrand("");
        setCategory("");
        setDescription("");
        setImageUrl("");
        setStarRating(0);
        setPrice("");
        setProductCost("");
        setPriceCondition("");
        setCbm("");
        setCartonQuantity("");
        setRemark("");
      }
    } catch (err) {
      console.error("Failed to create product:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const effectiveRating = hoverRating !== null ? hoverRating : starRating;

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
      subtitle="Add a new catalog product with image and specifications"
      widthClass="w-[600px]"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 select-none pb-8">
        {/* UNIFIED PRODUCT INFORMATION & MEDIA CARD (Requirement 3 & 4) */}
        <div className="bg-[#3A3B3C] rounded-2xl p-5 space-y-5 border-0">
          {/* Header: Title & Priority Star Rating */}
          <div className="flex items-center justify-between border-b border-[#252728] pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Product Details & Media
            </span>

            {/* Star Rating Priority */}
            <div
              className="flex items-center gap-1.5"
              onMouseLeave={() => setHoverRating(null)}
            >
              <span className="text-xs font-semibold text-slate-400 mr-1">Priority:</span>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setStarRating(starRating === star ? 0 : star)}
                  onMouseEnter={() => setHoverRating(star)}
                  className="p-0.5 cursor-pointer hover:scale-125 transition-transform"
                >
                  <Star
                    className={`w-4 h-4 ${
                      star <= effectiveRating
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-600 fill-transparent"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Full-Width Product Image Section (User Request) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Product Image</span>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] text-[#C7F33C] hover:underline cursor-pointer"
                >
                  Replace Image
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageFileChange}
              className="hidden"
            />

            {imageUrl ? (
              <div className="relative group w-full h-52 sm:h-56 rounded-2xl overflow-hidden bg-[#252728] border-2 border-[#C7F33C]/40 hover:border-[#C7F33C] flex items-center justify-center shadow-lg transition-all">
                <img
                  src={getOptimizedCloudinaryUrl(imageUrl, 600)}
                  alt="Product preview"
                  className="w-full h-full object-contain p-3"
                />
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-black/75 text-white hover:bg-rose-600 transition-colors cursor-pointer shadow-md"
                  title="Remove Image"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-x-0 bottom-0 py-2 bg-black/80 text-white text-xs font-semibold text-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm"
                >
                  Change Image (Auto-optimized via Cloudinary)
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-40 border-2 border-dashed border-[#555] hover:border-[#C7F33C] rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer bg-[#252728]/60 hover:bg-[#252728] transition-all text-center"
              >
                {isUploadingImage ? (
                  <Loader2 className="w-7 h-7 text-[#C7F33C] animate-spin" />
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-[#3A3B3C] flex items-center justify-center text-slate-300">
                      <Upload className="w-5 h-5 text-[#C7F33C]" />
                    </div>
                    <span className="text-xs font-bold text-slate-200">
                      Click to upload product image
                    </span>
                    <span className="text-[11px] text-slate-400">
                      PNG, JPG, WebP (Automatically optimized via Cloudinary)
                    </span>
                  </>
                )}
              </div>
            )}
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
              placeholder="e.g. Carebeau Body Lotion Vitamin E 500ml"
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

          {/* Bottom Section: Thai Description */}
          <div className="space-y-3 pt-3 border-t border-[#252728]">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Thai Name / Description
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none resize-none"
                placeholder="Thai name or local description..."
              />
            </div>
          </div>
        </div>

        {/* PRICING */}
        <div className="bg-[#3A3B3C] rounded-2xl p-5 space-y-4 border-0">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Initial Pricing
          </span>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Export Price (THB) <span className="text-[#C7F33C]">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="0.00"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Cost (THB)</label>
              <input
                type="number"
                step="0.01"
                value={productCost}
                onChange={(e) => setProductCost(e.target.value)}
                className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="Optional cost..."
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Volume Tier Discounts
            </label>
            <input
              type="text"
              value={priceCondition}
              onChange={(e) => setPriceCondition(e.target.value)}
              className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none"
              placeholder="e.g. 1-20 ctns 5%, 21-100 ctns 10%"
            />
          </div>
        </div>

        {/* LOGISTICS & REMARK */}
        <div className="bg-[#3A3B3C] rounded-2xl p-5 space-y-4 border-0">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Logistics & Remark
          </span>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">CBM (m³)</label>
              <input
                type="number"
                step="0.001"
                value={cbm}
                onChange={(e) => setCbm(e.target.value)}
                className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:border-[#C7F33C] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="0.028"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Units / Carton</label>
              <input
                type="number"
                value={cartonQuantity}
                onChange={(e) => setCartonQuantity(e.target.value)}
                className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:border-[#C7F33C] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="12"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300">Remark</label>
            <textarea
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="w-full bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none resize-none"
              placeholder="Additional notes..."
            />
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
