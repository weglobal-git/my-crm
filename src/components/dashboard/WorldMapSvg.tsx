"use client";

import { memo, useMemo, useState, useRef } from "react";
import {
  WORLD_MAP_VIEWBOX,
  WORLD_MAP_FEATURES,
  type MapCountryFeature,
} from "@/lib/data/world-map-paths";
import type { CountrySalesSummary } from "@/lib/dashboard/sales-overview";
import { COUNTRIES } from "@/lib/data/countries";

interface WorldMapSvgProps {
  countrySales: CountrySalesSummary[];
  selectedCountryCode: string | null;
  onSelectCountry: (countryCode: string | null) => void;
}

interface TooltipState {
  code: string;
  name: string;
  dealCount: number;
  totalAmount: number;
  currency: string;
  x: number;
  y: number;
}

function formatMoney(amount: number, currency = "THB") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Fallback country info lookup
const countryInfoMap = new Map(COUNTRIES.map((c) => [c.code.toUpperCase(), c]));

function WorldMapSvgComponent({
  countrySales,
  selectedCountryCode,
  onSelectCountry,
}: WorldMapSvgProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const maxAmount = useMemo(() => {
    const amounts = countrySales.map((c) => c.totalAmount).filter((a) => a > 0);
    return amounts.length > 0 ? Math.max(...amounts) : 0;
  }, [countrySales]);

  const maxDeals = useMemo(() => {
    const deals = countrySales.map((c) => c.dealCount).filter((d) => d > 0);
    return deals.length > 0 ? Math.max(...deals) : 1;
  }, [countrySales]);

  const salesMap = useMemo(() => {
    const map = new Map<string, CountrySalesSummary>();
    for (const item of countrySales) {
      map.set(item.countryCode.toUpperCase(), item);
    }
    return map;
  }, [countrySales]);

  // Clean flat minimalist colors with sales-proportional gradient (choropleth)
  const getCountryStyle = (featureId: string, isHovered: boolean) => {
    const data = salesMap.get(featureId);
    const hasSales = Boolean(data && (data.totalAmount > 0 || data.dealCount > 0));
    const isSelected = selectedCountryCode === featureId;

    if (!hasSales) {
      return {
        fill: isSelected ? "#F59E0B" : isHovered ? "#4E5052" : "#36383A",
        stroke: isSelected ? "#FFFFFF" : isHovered ? "#FFFFFF" : "#1C1D1E",
        strokeWidth: isSelected ? "1.5" : isHovered ? "0.8" : "0.35",
        cursor: "pointer",
        hasSales: false,
      };
    }

    // Dynamic green gradient: high sales = deep vibrant #C7F33C, lower sales = softer translucent green
    const amount = data?.totalAmount || 0;
    const ratio =
      maxAmount > 0
        ? Math.min(amount / maxAmount, 1)
        : Math.min((data?.dealCount || 1) / maxDeals, 1);
    const intensity = 0.28 + 0.72 * Math.sqrt(ratio);

    // If another country is selected, make all other countries grey so the selected country stands out
    let fill = `rgba(199, 243, 60, ${intensity.toFixed(2)})`;
    if (isSelected) {
      fill = "#F59E0B";
    } else if (selectedCountryCode) {
      fill = isHovered ? "#4E5052" : "#36383A";
    } else if (isHovered) {
      fill = "#E5FF8F";
    }

    return {
      fill,
      stroke: isSelected ? "#FFFFFF" : isHovered ? "#FFFFFF" : "#1C1D1E",
      strokeWidth: isSelected ? "1.5" : isHovered ? "0.8" : selectedCountryCode ? "0.35" : "0.4",
      cursor: "pointer",
      hasSales: true,
    };
  };

  const handleMouseEnter = (
    e: React.MouseEvent,
    feature: MapCountryFeature
  ) => {
    const data = salesMap.get(feature.id);
    const info = countryInfoMap.get(feature.id);
    const name = data?.countryName || info?.name || feature.id;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    setTooltip({
      code: feature.id,
      name,
      dealCount: data?.dealCount || 0,
      totalAmount: data?.totalAmount || 0,
      currency: data?.currency || "THB",
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || !tooltip) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${e.clientX - rect.left}px`;
      tooltipRef.current.style.top = `${e.clientY - rect.top}px`;
    }
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  const handleCountryClick = (featureId: string) => {
    onSelectCountry(selectedCountryCode === featureId ? null : featureId);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden select-none flex items-center justify-center"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <svg
        viewBox={WORLD_MAP_VIEWBOX}
        className="w-full h-auto drop-shadow-none transition-all"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g id="world-countries">
          {WORLD_MAP_FEATURES.map((feature) => {
            const isHovered = tooltip?.code === feature.id;
            const style = getCountryStyle(feature.id, isHovered);

            return (
              <g
                key={feature.id}
                id={`country-${feature.id}`}
                onClick={() => handleCountryClick(feature.id)}
                onMouseEnter={(e) => handleMouseEnter(e, feature)}
                className="cursor-pointer transition-colors duration-150"
              >
                {feature.paths.map((d, index) => (
                  <path
                    key={index}
                    d={d}
                    fill={style.fill}
                    stroke={style.stroke}
                    strokeWidth={style.strokeWidth}
                    className="transition-colors duration-150"
                  />
                ))}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating Interactive Tooltip */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full transform pb-3 transition-all duration-75"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
        >
          <div className="rounded-xl border border-[#4E4F50] bg-[#1C1C1D]/95 px-3 py-2 backdrop-blur-md">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white tracking-wide">
                {tooltip.name}
              </span>
            </div>

            <div className="mt-1 flex items-center gap-2 text-[11px]">
              {tooltip.dealCount > 0 ? (
                <>
                  <span className="font-semibold text-[#C7F33C]">
                    {formatMoney(tooltip.totalAmount, tooltip.currency)}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-300">
                    {tooltip.dealCount} {tooltip.dealCount === 1 ? "deal" : "deals"}
                  </span>
                </>
              ) : (
                <span className="text-slate-500 italic">No sales recorded</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const WorldMapSvg = memo(WorldMapSvgComponent);
