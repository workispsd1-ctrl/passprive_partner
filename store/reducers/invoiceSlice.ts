// src/redux/slices/invoiceSlice.ts

import { createSlice } from '@reduxjs/toolkit';
import { getInvoiceHistory, submitInvoice } from '../actions/invoiceActions';
import { Invoice } from '@/lib/data';

interface InvoiceState {
  submittedInvoices: Invoice[];
  latestInvoice: Invoice | null;
  loading: boolean;
  error: string | null;
}

const initialState: InvoiceState = {
  submittedInvoices: [],
  latestInvoice: null,
  loading: false,
  error: null,
};

const invoiceSlice = createSlice({
  name: 'invoice',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // ✅ Submit
      .addCase(submitInvoice.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(submitInvoice.fulfilled, (state, action) => {
        state.latestInvoice = action.payload;
        state.loading = false;
      })
      .addCase(submitInvoice.rejected, (state, action) => {
        state.error = action.payload as string;
        state.loading = false;
      })

      // ✅ History
      .addCase(getInvoiceHistory.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getInvoiceHistory.fulfilled, (state, action) => {
        console.log("submited",state.submittedInvoices)
        state.submittedInvoices = action.payload;
        state.loading = false;
      })
      .addCase(getInvoiceHistory.rejected, (state, action) => {
        state.error = action.payload as string;
        state.loading = false;
      });
  },
});

export default invoiceSlice.reducer;
