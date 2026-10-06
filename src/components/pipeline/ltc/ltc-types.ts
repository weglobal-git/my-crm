export type LtcTier = 'TIER_1' | 'TIER_2' | 'TIER_3';

export interface LtcMonthlySale {
  monthYear: string; // e.g. "02/2026"
  amount: number;
  dealCount: number;
  dealTitles: string[];
}

export interface LtcContactPerson {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  contactDepartment: string | null;
  isActive: boolean;
}

export interface LtcAccountItem {
  id: string; // companyId
  name: string; // Account Name (smaller, underneath)
  displayName: string | null; // Account Display Name (primary)
  phone: string | null;
  email: string | null;
  address: string | null;
  country: string | null;
  starRating: number;

  // RFM & LTC Metrics
  tier: LtcTier;
  thresholdDays: number;
  daysSinceLastContact: number;
  formattedDuration: string; // e.g. "25D", "3M12D", "1Y2M"
  lastInteractionDate: string; // ISO string
  lastInteractionSource: 'ACTIVITY' | 'DEAL' | 'COMPANY_LOG' | 'CREATED_AT';

  totalWonAmount: number;
  purchaseCount: number;

  // Expanded accordion details
  contacts: LtcContactPerson[];
  salesHistory: LtcMonthlySale[];
}

export interface LtcSummaryResult {
  totalCount: number;
  accounts: LtcAccountItem[];
}
