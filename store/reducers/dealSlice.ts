import { createSlice } from '@reduxjs/toolkit';
import { addDeal, getDraftDeals, removeDeal , Deal } from '../actions/dealActions';

interface DealsState {
  deals: Deal[];
  loading: boolean;
  error: string | null;
}

const initialState: DealsState = {
  deals: [],
  loading: false,
  error: null,
};

const dealSlice = createSlice({
  name: 'deal',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // addDeal
      .addCase(addDeal.pending, (state) => {
        state.loading = true;
      })
      .addCase(addDeal.fulfilled, (state, action) => {
        state.loading = false;
        state.deals.push(action.payload);
      })
      .addCase(addDeal.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // getDraftDeals
      .addCase(getDraftDeals.pending, (state) => {
        state.loading = true;
      })
      .addCase(getDraftDeals.fulfilled, (state, action) => {
        state.loading = false;
        state.deals = action.payload;
      })
      .addCase(getDraftDeals.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // removeDeal
      .addCase(removeDeal.pending, (state) => {
        state.loading = true;
      })
      .addCase(removeDeal.fulfilled, (state, action) => {
        state.loading = false;
        state.deals = state.deals.filter((deal) => deal._id !== action.payload.id);
      })
      .addCase(removeDeal.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export default dealSlice.reducer;
