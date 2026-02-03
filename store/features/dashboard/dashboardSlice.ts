// store/features/dashboard/dashboardSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface DashboardState {
  totalUsers: number;
  activeSubscribers: number;
  totalRevenue: number;
  chartData: number[];
  chartLabels: string[];
  SeminarTabName: string;
}

const initialState: DashboardState = {
  totalUsers: 0,
  activeSubscribers: 0,
  totalRevenue: 0,
  chartData: [],
  chartLabels: [],
  SeminarTabName: "",
};

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    setDashboardStats: (state, action: PayloadAction<DashboardState>) => {
      return { ...state, ...action.payload };
    },
    setSeminarTabName: (state, action: PayloadAction<string>) => {
      state.SeminarTabName = action.payload;
    },
  },
});

export const { setDashboardStats, setSeminarTabName } = dashboardSlice.actions;
export default dashboardSlice.reducer;
