import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import api from '../../services/api';

export interface BankAccount {
  bankName: string;
  bankCode: string;
  accountNumberMasked: string;
  accountName: string;
  verifiedAt?: string | null;
}

export interface WalletTransaction {
  _id: string;
  type: 'refund_credit' | 'withdrawal_debit' | 'withdrawal_reversal';
  amount: number;
  balanceAfter: number;
  currency?: string;
  status: 'pending' | 'success' | 'failed' | 'reversed';
  description?: string;
  reference?: string | null;
  createdAt: string;
}

export interface PurchaseItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Purchase {
  _id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  source: string;
  amount: number;
  currency: string;
  merchant: { name: string; logo?: string | null };
  items: PurchaseItem[];
}

interface WalletState {
  balance: number;
  currency: string;
  bankAccount: BankAccount | null;
  transactions: WalletTransaction[];
  purchases: Purchase[];
  loading: {
    wallet: boolean;
    transactions: boolean;
    purchases: boolean;
    withdraw: boolean;
    bank: boolean;
  };
  error: string | null;
}

const initialState: WalletState = {
  balance: 0,
  currency: 'NGN',
  bankAccount: null,
  transactions: [],
  purchases: [],
  loading: { wallet: false, transactions: false, purchases: false, withdraw: false, bank: false },
  error: null,
};

export const fetchWallet = createAsyncThunk(
  'wallet/fetch',
  async (_, thunkAPI) => {
    try {
      const { data } = await api.get('/api/wallet');
      return data;
    } catch (err: any) {
      return thunkAPI.rejectWithValue(err.response?.data?.message || err.message);
    }
  },
);

export const fetchWalletTransactions = createAsyncThunk(
  'wallet/fetchTransactions',
  async (_, thunkAPI) => {
    try {
      const { data } = await api.get('/api/wallet/transactions');
      return data as WalletTransaction[];
    } catch (err: any) {
      return thunkAPI.rejectWithValue(err.response?.data?.message || err.message);
    }
  },
);

export const fetchPurchases = createAsyncThunk(
  'wallet/fetchPurchases',
  async (_, thunkAPI) => {
    try {
      const { data } = await api.get('/api/wallet/purchases');
      return data as Purchase[];
    } catch (err: any) {
      return thunkAPI.rejectWithValue(err.response?.data?.message || err.message);
    }
  },
);

export const fetchBanks = createAsyncThunk('wallet/fetchBanks', async (_, thunkAPI) => {
  try {
    const { data } = await api.get('/api/wallet/banks');
    return data.banks as { name: string; code: string }[];
  } catch (err: any) {
    return thunkAPI.rejectWithValue(err.response?.data?.message || err.message);
  }
});

export const resolveAccount = createAsyncThunk(
  'wallet/resolveAccount',
  async (
    args: { bankCode: string; accountNumber: string },
    thunkAPI,
  ) => {
    try {
      const { data } = await api.post('/api/wallet/resolve-account', args);
      return data as { accountNumber: string; accountName: string };
    } catch (err: any) {
      return thunkAPI.rejectWithValue(err.response?.data?.message || err.message);
    }
  },
);

export const sendBankChangeCode = createAsyncThunk(
  'wallet/sendBankChangeCode',
  async (_, thunkAPI) => {
    try {
      const { data } = await api.post('/api/wallet/bank-account/send-code');
      return data as { message: string; sentTo: string };
    } catch (err: any) {
      return thunkAPI.rejectWithValue(err.response?.data?.message || err.message);
    }
  },
);

export const saveBankAccount = createAsyncThunk(
  'wallet/saveBank',
  async (
    args: {
      bankCode: string;
      bankName: string;
      accountNumber: string;
      code: string;
    },
    thunkAPI,
  ) => {
    try {
      const { data } = await api.post('/api/wallet/bank-account', args);
      return data.bankAccount as BankAccount;
    } catch (err: any) {
      return thunkAPI.rejectWithValue(err.response?.data?.message || err.message);
    }
  },
);

export const withdraw = createAsyncThunk(
  'wallet/withdraw',
  async (args: { amount: number }, thunkAPI) => {
    try {
      const { data } = await api.post('/api/wallet/withdraw', args);
      return data as { balance: number; transferStatus: string };
    } catch (err: any) {
      return thunkAPI.rejectWithValue(err.response?.data?.message || err.message);
    }
  },
);

const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    clearWallet(state) {
      state.balance = 0;
      state.bankAccount = null;
      state.transactions = [];
      state.purchases = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWallet.pending, (s) => {
        s.loading.wallet = true;
      })
      .addCase(fetchWallet.fulfilled, (s, a: PayloadAction<any>) => {
        s.loading.wallet = false;
        s.balance = a.payload.balance || 0;
        s.currency = a.payload.currency || 'NGN';
        s.bankAccount = a.payload.bankAccount || null;
      })
      .addCase(fetchWallet.rejected, (s, a) => {
        s.loading.wallet = false;
        s.error = (a.payload as string) || 'Failed to load wallet';
      })
      .addCase(fetchWalletTransactions.pending, (s) => {
        s.loading.transactions = true;
      })
      .addCase(fetchWalletTransactions.fulfilled, (s, a) => {
        s.loading.transactions = false;
        s.transactions = a.payload || [];
      })
      .addCase(fetchWalletTransactions.rejected, (s) => {
        s.loading.transactions = false;
      })
      .addCase(fetchPurchases.pending, (s) => {
        s.loading.purchases = true;
      })
      .addCase(fetchPurchases.fulfilled, (s, a) => {
        s.loading.purchases = false;
        s.purchases = a.payload || [];
      })
      .addCase(fetchPurchases.rejected, (s) => {
        s.loading.purchases = false;
      })
      .addCase(saveBankAccount.pending, (s) => {
        s.loading.bank = true;
      })
      .addCase(saveBankAccount.fulfilled, (s, a) => {
        s.loading.bank = false;
        s.bankAccount = a.payload;
      })
      .addCase(saveBankAccount.rejected, (s, a) => {
        s.loading.bank = false;
        s.error = (a.payload as string) || 'Failed to save bank';
      })
      .addCase(withdraw.pending, (s) => {
        s.loading.withdraw = true;
      })
      .addCase(withdraw.fulfilled, (s, a) => {
        s.loading.withdraw = false;
        s.balance = a.payload.balance;
      })
      .addCase(withdraw.rejected, (s, a) => {
        s.loading.withdraw = false;
        s.error = (a.payload as string) || 'Withdrawal failed';
      });
  },
});

export const { clearWallet } = walletSlice.actions;
export default walletSlice.reducer;
