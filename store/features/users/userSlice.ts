// features/users/usersSlice.ts
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';

const isServer = typeof window === 'undefined';

const backendUrl = isServer
  ? process.env.NEXT_PUBLIC_BACKEND_URL_FOR_EC2
  : process.env.NEXT_PUBLIC_BACKEND_URL || '';


interface UsersState {
  users: any;
  loading: boolean;
  error: string | null;
}

const initialState: UsersState = {
  users: null,
  loading: false,
  error: null,
};

export const fetchAllUsers = createAsyncThunk(
  'users/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${backendUrl}/api/users`);
      return response.data.users;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch users');
    }
  }
);

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAllUsers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAllUsers.fulfilled, (state, action) => {
        state.loading = false;
        state.users = action.payload;
      })
      .addCase(fetchAllUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export default usersSlice.reducer;