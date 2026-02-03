// src/redux/slices/userSlice.ts
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';

interface UserState {
  user: any;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const isServer = typeof window === 'undefined';
 
const backendUrl =isServer? process.env.NEXT_PUBLIC_BACKEND_URL_FOR_EC2 // Use full URL on EC2 
: process.env.NEXT_PUBLIC_BACKEND_URL || ''; // Use relative in browser


const initialState: UserState = {
  user: null,
  status: 'idle',
  error: null
};

export const updateUserProfile = createAsyncThunk(
  'user/updateProfile',
  async (updateData: any, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { user: UserState };
      const currentUser = state.user.user;
      
      if (!currentUser) {
        throw new Error('No user logged in');
      }

      const response = await axios.patch(
        `${backendUrl}/api/users/${currentUser.clerkId}`,
        updateData
      );

      return response.data.user;
    } catch (error: any) {
      let errorMessage = 'Failed to update profile';
      if (error.response) {
        errorMessage = error.response.data.message || error.response.data.error || errorMessage;
      }
      return rejectWithValue(errorMessage);
    }
  }
);

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser: (state, action) => {  
      state.user = action.payload;
      state.status = 'succeeded';
    },
    setLoading: (state) => {
      state.status = 'loading';
    },
    setError: (state, action: { payload: string }) => {
      state.error = action.payload;
      state.status = 'failed';
    },
    clearUser: (state) => {
      state.user = null;
      state.status = 'idle';
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(updateUserProfile.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'succeeded';
      })
      .addCase(updateUserProfile.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  }
});

export const { setUser, setLoading, setError, clearUser } = userSlice.actions;
export const selectCurrentUser = (state: { user?: UserState }) => state.user?.user;
export default userSlice.reducer;