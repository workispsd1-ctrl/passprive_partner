// features/admin/adminSlice.ts
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { verifyUserSession } from "../../../app/actions/auth";

interface AuthState {
  user: any;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  isAdmin: boolean;
}

const initialState: AuthState = {
  user: null,
  status: "idle",
  error: null,
  isAdmin: false,
};

/* thunk receives the browser access-token */
export const verifyUser = createAsyncThunk<
  { user: any },
  string | undefined,
  { rejectValue: string }
>("admin/verifyUser", async (accessToken, { rejectWithValue }) => {
  if (!accessToken) return rejectWithValue("Not authenticated");

  const res = await verifyUserSession(accessToken);
  if (res.status !== 200) return rejectWithValue(res.error ?? "Auth failed");
  console.log("User verified:", res.user);
  return { user: res.user };
});

const adminSlice = createSlice({
  name: "admin",
  initialState,
  reducers: {
    clearUser: (state) => {
      state.user = null;
      state.isAdmin = false;
      state.status = "idle";
    },
  },
  extraReducers: (b) => {
    b.addCase(verifyUser.pending, (s) => {
      s.status = "loading";
    })
      .addCase(verifyUser.fulfilled, (s, a) => {
        s.status = "succeeded";
        s.user = a.payload.user;
        s.isAdmin = ["admin", "superadmin"]?.includes(a.payload.user?.role);
        s.error = null;
      })
      .addCase(verifyUser.rejected, (s, a) => {
        s.status = "failed";
        s.error = a.payload ?? "Unknown error";
        s.user = null;
        s.isAdmin = false;
      });
  },
});

export const { clearUser } = adminSlice.actions;
export default adminSlice.reducer;
