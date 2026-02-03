export const SUBSCRIPTION_TIERS = {
  basic: {
    rate: 0.2,
    price: 299,
    name: "20% Commission",
    paymentLink: process.env.STRIPE_BASIC_PLAN_LINK,
  },
  standard: {
    rate: 0.25,
    price: 499,
    name: "25% Commission",
    paymentLink: process.env.STRIPE_STANDARD_PLAN_LINK,
  },
  premium: {
    rate: 0.3,
    price: 699,
    name: "30% Commission",
    paymentLink: process.env.STRIPE_PREMIUM_PLAN_LINK,
  },
  professional: {
    rate: 0.35,
    price: 999,
    name: "35% Commission",
    paymentLink: process.env.STRIPE_PROFESSIONAL_PLAN_LINK,
  },
  elite: {
    rate: 0.4,
    price: 1399,
    name: "40% Commission",
    paymentLink: process.env.STRIPE_ELITE_PLAN_LINK,
  },
  master: {
    rate: 0.45,
    price: 1699,
    name: "45% Commission",
    paymentLink: process.env.STRIPE_MASTER_PLAN_LINK,
  },
  vip: {
    rate: 0.5,
    price: 0,
    name: "VIP Tier - Contact Us",
    paymentLink: "/contact",
  },
};

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

export const getSubscriptionDetails = (plan: SubscriptionTier) => {
  return SUBSCRIPTION_TIERS[plan] || SUBSCRIPTION_TIERS["basic"];
};

export const user = {
  id: "1",
  email: "waleed09ahmad42@gmail.com",
  firstName: "John",
  lastName: "Doe",
  subscriptionTier: "premium",
  commissionRate: SUBSCRIPTION_TIERS.premium.rate,
  subscriptionPrice: SUBSCRIPTION_TIERS.premium.price,
};

export interface DealData {
  // Client and Vehicle Info
  clientName: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleVin: string;

  // Sold Items
  salesPrice: number;
  warrantySold: number;
  gapSold: number;
  additionalFee: number;
  adminFee: number;
  reserve: number;

  // Deductions
  vehicleCost: number;
  safetyCost: number;
  lotPack: number;
  warrantyCost: number;
  gapCost: number;
  feeCost: number;
  adminCost: number;
  lienOwed: number;
  referral: number;
  miscellaneous: number;
}

export const dealVal = {
  clientName: "",
  vehicleYear: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleVin: "",
  salesPrice: 0,
  warrantySold: 0,
  gapSold: 0,
  additionalFee: 0,
  adminFee: 0,
  reserve: 0,
  vehicleCost: 0,
  safetyCost: 1000,
  lotPack: 1250,
  warrantyCost: 0,
  gapCost: 0,

  feeCost: 0,
  adminCost: 999,

  lienOwed: 0,
  referral: 0,
  miscellaneous: 0,
};

export interface InvoiceItem {
  id: string;
  date: string;
  clientName: string;
  vehicle: string;
  vin: string;
  profit: number;
  commission: number;
  dealData: any;
}

export interface Invoice {
  _id: string;
  salesperson: string;
  month: string;
  deals: string[]; // array of deal IDs
  totalCommission: number;
  totalProfit: number;
  submittedDate?: string; // optional
}
