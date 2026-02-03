import axios from "axios";
import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/lib/supabaseClient";

const isServer = typeof window === 'undefined';
 
const backendUrl =isServer? process.env.NEXT_PUBLIC_BACKEND_URL_FOR_EC2 // Use full URL on EC2 
: process.env.NEXT_PUBLIC_BACKEND_URL || ''; // Use relative in browser


// Define types
export interface Deal {
  _id?: string;
  clientName: string;
  vehicle: string;
  vin: string;
  profit: number;
  commission: number;
  dealData: Record<string, any>;
  date?: string;
  status?: 'draft' | 'submitted';
}

// Thunk
export const addDeal = createAsyncThunk<Deal, {
  dealData: Record<string, any>;
  profit: number;
  commission: number;
  token:string;
  userId: string | null;
}>(
  "deal/addDeal",
   async ({ dealData, profit, commission, token, userId }, { rejectWithValue }) => {
    if (!token) {
      return rejectWithValue("Token is missing.");
    }

    try {
      const payload = {
        clientName: dealData.clientName,
        vehicle: `${dealData.vehicleYear} ${dealData.vehicleMake} ${dealData.vehicleModel}`,
        vin: dealData.vehicleVin,
        profit,
        commission,
        dealData,
        user_id: userId
      };

      // 1. Send to backend
      const response = await axios.post(`${backendUrl}/api/deal/addDeal`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to add deal"
      );
    }
  }
);

export const getDeals = createAsyncThunk(
  "deal/getDeals",
  async ({ token, userId }: { token: string; userId: string }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${backendUrl}/api/deal/getDeals?userId=${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || "Failed to fetch deals");
    }
  }
);


// typescript type for array of deals
export const getDraftDeals = createAsyncThunk<Deal[], { token: string }>(
  'deal/getDraftDeals',
  async ({ token }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${backendUrl}/api/deals/drafts`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch draft deals');
    }
  }
);


export const removeDeal = createAsyncThunk<
  { message: string; id: string }, // return value
  { id: string; token: string }     // input params
>(
  'deal/removeDeal',
  async ({ id, token }, { rejectWithValue }) => {
    try {
      const response = await axios.delete(`${backendUrl}/api/deals/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return { message: response.data.message, id }; // id ko payload mein return karenge to remove it from local state
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to remove deal');
    }
  }
);

