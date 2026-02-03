// src/redux/reducers/invoiceReducers.ts

import { Invoice } from '@/lib/data';
import { createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';


const isServer = typeof window === 'undefined';
 
const backendUrl =isServer? process.env.NEXT_PUBLIC_BACKEND_URL_FOR_EC2 // Use full URL on EC2 
: process.env.NEXT_PUBLIC_BACKEND_URL || ''; // Use relative in browser


export const submitInvoice = createAsyncThunk<Invoice, { token: string }>(
  'invoice/submitInvoice',
  async ({ token }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${backendUrl}/api/invoices/submit`, null, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to submit invoice');
    }
  }
);

export const getInvoiceHistory = createAsyncThunk<Invoice[], { token: string }>(
  'invoice/getInvoiceHistory',
  async ({ token }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${backendUrl}/api/invoices/history`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch invoice history');
    }
  }
);
