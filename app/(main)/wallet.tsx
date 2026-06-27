import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppDispatch, RootState } from '../../src/store';
import {
  fetchWallet,
  fetchWalletTransactions,
  fetchBanks,
  resolveAccount,
  sendBankChangeCode,
  saveBankAccount,
  withdraw,
  WalletTransaction,
} from '../../src/store/slices/walletSlice';
import { Colors } from '../../src/constants/colors';
import { useThemedStyles } from '../../src/theme/useThemedStyles';

const formatAmount = (n: number) =>
  `${n < 0 ? '-' : ''}₦${Math.abs(Number(n || 0)).toLocaleString()}`;

const TYPE_LABEL: Record<string, string> = {
  refund_credit: 'Refund credit',
  withdrawal_debit: 'Withdrawal',
  withdrawal_reversal: 'Reversed withdrawal',
};

const STATUS_COLOR: Record<string, string> = {
  success: Colors.success,
  pending: Colors.warning,
  failed: Colors.error,
  reversed: Colors.textMuted,
};

export default function WalletScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const wallet = useSelector((s: RootState) => s.wallet);
  const [refreshing, setRefreshing] = useState(false);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showBankSheet, setShowBankSheet] = useState(false);
  const [detailTx, setDetailTx] = useState<WalletTransaction | null>(null);

  useEffect(() => {
    dispatch(fetchWallet());
    dispatch(fetchWalletTransactions());
  }, [dispatch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([dispatch(fetchWallet()), dispatch(fetchWalletTransactions())]);
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Wallet</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available balance</Text>
          {wallet.loading.wallet && wallet.balance === 0 ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.balanceAmount}>{formatAmount(wallet.balance)}</Text>
          )}
          <View style={styles.balanceActions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setShowWithdraw(true)}
              disabled={wallet.balance <= 0}
            >
              <Ionicons name="arrow-up-outline" size={16} color={Colors.primary} />
              <Text style={styles.primaryBtnText}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bankCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bankLabel}>Bank account</Text>
            {wallet.bankAccount ? (
              <>
                <Text style={styles.bankName}>{wallet.bankAccount.bankName}</Text>
                <Text style={styles.bankSub}>
                  {wallet.bankAccount.accountName} • {wallet.bankAccount.accountNumberMasked}
                </Text>
              </>
            ) : (
              <Text style={styles.bankSub}>
                Add a bank account to enable withdrawals.
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={() => setShowBankSheet(true)} style={styles.bankEdit}>
            <Text style={styles.bankEditText}>
              {wallet.bankAccount ? 'Change' : 'Add'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Transactions</Text>
        {wallet.transactions.length === 0 && !wallet.loading.transactions ? (
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              No wallet activity yet. Refunds from any store will show up here.
            </Text>
          </View>
        ) : (
          <View style={styles.txList}>
            {wallet.transactions.map((tx) => (
              <TxRow key={tx._id} tx={tx} styles={styles} onPress={() => setDetailTx(tx)} />
            ))}
          </View>
        )}
      </ScrollView>

      {showWithdraw && (
        <WithdrawModal onClose={() => setShowWithdraw(false)} />
      )}
      {showBankSheet && (
        <BankAccountModal onClose={() => setShowBankSheet(false)} />
      )}
      {detailTx && (
        <TxDetailModal tx={detailTx} styles={styles} onClose={() => setDetailTx(null)} />
      )}
    </View>
  );
}

function TxRow({
  tx,
  styles,
  onPress,
}: {
  tx: WalletTransaction;
  styles: any;
  onPress: () => void;
}) {
  const isCredit = tx.amount > 0;
  return (
    <TouchableOpacity style={styles.txRow} onPress={onPress} activeOpacity={0.6}>
      <View
        style={[
          styles.txIcon,
          { backgroundColor: isCredit ? Colors.successLight : Colors.surface },
        ]}
      >
        <Ionicons
          name={isCredit ? 'arrow-down-outline' : 'arrow-up-outline'}
          size={16}
          color={isCredit ? Colors.success : Colors.textSecondary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txTitle}>{TYPE_LABEL[tx.type] || tx.type}</Text>
        {!!tx.description && (
          <Text style={styles.txDesc} numberOfLines={1}>
            {tx.description}
          </Text>
        )}
        <Text style={styles.txDate}>
          {new Date(tx.createdAt).toLocaleString(undefined, {
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text
          style={[styles.txAmount, { color: isCredit ? Colors.success : Colors.text }]}
        >
          {formatAmount(tx.amount)}
        </Text>
        <Text style={[styles.txStatus, { color: STATUS_COLOR[tx.status] || Colors.textMuted }]}>
          {tx.status}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={Colors.textMuted}
          style={{ marginTop: 2 }}
        />
      </View>
    </TouchableOpacity>
  );
}

function TxDetailModal({
  tx,
  styles,
  onClose,
}: {
  tx: WalletTransaction;
  styles: any;
  onClose: () => void;
}) {
  const isCredit = tx.amount > 0;
  const fullDate = new Date(tx.createdAt).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />

              <View style={styles.detailHero}>
                <Text style={styles.detailType}>{TYPE_LABEL[tx.type] || tx.type}</Text>
                <Text
                  style={[
                    styles.detailAmount,
                    { color: isCredit ? Colors.success : Colors.text },
                  ]}
                >
                  {formatAmount(tx.amount)}
                </Text>
                <View
                  style={[
                    styles.detailStatusPill,
                    { backgroundColor: (STATUS_COLOR[tx.status] || Colors.textMuted) + '22' },
                  ]}
                >
                  <Text
                    style={[
                      styles.detailStatusText,
                      { color: STATUS_COLOR[tx.status] || Colors.textMuted },
                    ]}
                  >
                    {tx.status}
                  </Text>
                </View>
              </View>

              {!!tx.description && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailKey}>Description</Text>
                  <Text style={styles.detailVal}>{tx.description}</Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailKey}>Date</Text>
                <Text style={styles.detailVal}>{fullDate}</Text>
              </View>
              {typeof tx.balanceAfter === 'number' && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailKey}>Balance after</Text>
                  <Text style={styles.detailVal}>{formatAmount(tx.balanceAfter)}</Text>
                </View>
              )}
              {!!tx.reference && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailKey}>Reference</Text>
                  <Text style={[styles.detailVal, styles.detailMono]} selectable>
                    {tx.reference}
                  </Text>
                </View>
              )}
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.detailKey}>Transaction ID</Text>
                <Text style={[styles.detailVal, styles.detailMono]} selectable>
                  {tx._id}
                </Text>
              </View>

              <TouchableOpacity style={styles.detailCloseBtn} onPress={onClose}>
                <Text style={styles.detailCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function WithdrawModal({ onClose }: { onClose: () => void }) {
  const dispatch = useDispatch<AppDispatch>();
  const styles = useThemedStyles(makeStyles);
  const wallet = useSelector((s: RootState) => s.wallet);
  const [amount, setAmount] = useState('');

  const submit = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Enter an amount', 'Please enter how much you want to withdraw.');
      return;
    }
    if (n > wallet.balance) {
      Alert.alert('Insufficient balance', 'That amount is more than your wallet balance.');
      return;
    }
    if (!wallet.bankAccount) {
      Alert.alert('No bank account', 'Add a bank account first.');
      return;
    }
    const res = await dispatch(withdraw({ amount: n }));
    if (withdraw.fulfilled.match(res)) {
      Alert.alert(
        'Request submitted',
        `Your request to withdraw ₦${n.toLocaleString()} has been submitted and will be processed shortly.`,
      );
      dispatch(fetchWalletTransactions());
      onClose();
    } else {
      Alert.alert('Withdrawal failed', String(res.payload || 'Try again later.'));
    }
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Withdraw to bank</Text>
          <Text style={styles.modalLabel}>
            Available: {formatAmount(wallet.balance)}
          </Text>
          {wallet.bankAccount ? (
            <View style={styles.modalBankBlock}>
              <Text style={styles.modalBankName}>{wallet.bankAccount.bankName}</Text>
              <Text style={styles.modalBankSub}>
                {wallet.bankAccount.accountName} •{' '}
                {wallet.bankAccount.accountNumberMasked}
              </Text>
            </View>
          ) : (
            <Text style={styles.modalLabel}>Add a bank account first.</Text>
          )}

                <Text style={styles.modalLabel}>Amount (₦)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="5000"
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textMuted}
                />

                <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                  <TouchableOpacity style={styles.modalBtnSecondary} onPress={onClose}>
                    <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtnPrimary, { opacity: wallet.loading.withdraw ? 0.6 : 1 }]}
                    disabled={wallet.loading.withdraw}
                    onPress={submit}
                  >
                    {wallet.loading.withdraw ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={styles.modalBtnPrimaryText}>Request</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function BankAccountModal({ onClose }: { onClose: () => void }) {
  const dispatch = useDispatch<AppDispatch>();
  const styles = useThemedStyles(makeStyles);
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [bankSearch, setBankSearch] = useState('');
  const [selectedBank, setSelectedBank] = useState<{ name: string; code: string } | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');

  useEffect(() => {
    (async () => {
      const res = await dispatch(fetchBanks());
      if (fetchBanks.fulfilled.match(res)) setBanks(res.payload as any);
    })();
  }, [dispatch]);

  const filteredBanks = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    if (!q) return banks.slice(0, 50);
    return banks.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 50);
  }, [banks, bankSearch]);

  // Auto-resolve account name when bank + 10 digits entered.
  useEffect(() => {
    setAccountName('');
    if (!selectedBank || accountNumber.length < 10) return;
    let cancelled = false;
    setResolving(true);
    dispatch(
      resolveAccount({ bankCode: selectedBank.code, accountNumber }),
    ).then((res) => {
      if (cancelled) return;
      setResolving(false);
      if (resolveAccount.fulfilled.match(res)) {
        setAccountName(res.payload.accountName);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedBank, accountNumber, dispatch]);

  const sendCode = async () => {
    setSendingCode(true);
    const res = await dispatch(sendBankChangeCode());
    setSendingCode(false);
    if (sendBankChangeCode.fulfilled.match(res)) {
      setCodeSent(true);
      setMaskedEmail(res.payload.sentTo || 'your email');
    } else {
      Alert.alert('Could not send code', String(res.payload || 'Try again.'));
    }
  };

  const submit = async () => {
    if (!selectedBank || !accountNumber || !accountName) {
      Alert.alert('Incomplete', 'Pick a bank, enter your 10-digit account number, and wait for the name to resolve.');
      return;
    }
    if (code.trim().length !== 6) {
      Alert.alert('Enter the code', 'Enter the 6-digit confirmation code sent to your email.');
      return;
    }
    setSaving(true);
    const res = await dispatch(
      saveBankAccount({
        bankCode: selectedBank.code,
        bankName: selectedBank.name,
        accountNumber,
        code: code.trim(),
      }),
    );
    setSaving(false);
    if (saveBankAccount.fulfilled.match(res)) {
      onClose();
    } else {
      Alert.alert('Could not save', String(res.payload || 'Try again.'));
    }
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Bank account</Text>

          {!selectedBank ? (
            <>
              <Text style={styles.modalLabel}>Pick your bank</Text>
              <TextInput
                style={styles.modalInput}
                value={bankSearch}
                onChangeText={setBankSearch}
                placeholder="Search banks…"
                placeholderTextColor={Colors.textMuted}
              />
              <FlatList
                data={filteredBanks}
                keyExtractor={(item) => item.code}
                style={{ maxHeight: 280, marginTop: 8 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.bankPickRow}
                    onPress={() => setSelectedBank(item)}
                  >
                    <Text style={styles.bankPickText}>{item.name}</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}
              />
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => setSelectedBank(null)} style={styles.changeBankBtn}>
                <Ionicons name="arrow-back" size={14} color={Colors.primary} />
                <Text style={styles.changeBankText}>{selectedBank.name}</Text>
              </TouchableOpacity>

              <Text style={styles.modalLabel}>Account number</Text>
              <TextInput
                style={styles.modalInput}
                value={accountNumber}
                onChangeText={(t) => setAccountNumber(t.replace(/\D/g, '').slice(0, 10))}
                placeholder="1234567890"
                keyboardType="numeric"
                placeholderTextColor={Colors.textMuted}
              />

              <View style={styles.acctNameBox}>
                {resolving ? (
                  <ActivityIndicator color={Colors.primary} />
                ) : accountName ? (
                  <Text style={styles.acctNameText}>{accountName}</Text>
                ) : accountNumber.length === 10 ? (
                  <Text style={styles.acctNameError}>Could not resolve account</Text>
                ) : (
                  <Text style={styles.acctNameHint}>
                    Enter 10 digits to verify your account name.
                  </Text>
                )}
              </View>

              {/* Email confirmation — the buyer must confirm a code sent to
                  their account email before payout details can change. */}
              {accountName ? (
                !codeSent ? (
                  <TouchableOpacity
                    style={[styles.sendCodeBtn, { opacity: sendingCode ? 0.6 : 1 }]}
                    disabled={sendingCode}
                    onPress={sendCode}
                  >
                    {sendingCode ? (
                      <ActivityIndicator color={Colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="mail-outline" size={15} color={Colors.primary} />
                        <Text style={styles.sendCodeText}>Email me a confirmation code</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <>
                    <Text style={styles.modalLabel}>
                      Enter the 6-digit code sent to {maskedEmail}
                    </Text>
                    <TextInput
                      style={[styles.modalInput, styles.codeInput]}
                      value={code}
                      onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      keyboardType="number-pad"
                      maxLength={6}
                      placeholderTextColor={Colors.textMuted}
                    />
                    <TouchableOpacity onPress={sendCode} disabled={sendingCode}>
                      <Text style={styles.resendText}>
                        {sendingCode ? 'Sending…' : 'Resend code'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )
              ) : null}

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                <TouchableOpacity style={styles.modalBtnSecondary} onPress={onClose}>
                  <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalBtnPrimary,
                    { opacity: saving || !accountName || !codeSent || code.length !== 6 ? 0.6 : 1 },
                  ]}
                  disabled={saving || !accountName || !codeSent || code.length !== 6}
                  onPress={submit}
                >
                  {saving ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.modalBtnPrimaryText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerTitle: {
      fontSize: 22,
      fontFamily: 'Manrope_700Bold',
      color: C.text,
    },

    balanceCard: {
      margin: 16,
      backgroundColor: C.primary,
      borderRadius: 16,
      padding: 20,
    },
    balanceLabel: {
      color: C.white,
      opacity: 0.85,
      fontSize: 13,
      fontFamily: 'Manrope_500Medium',
    },
    balanceAmount: {
      color: C.white,
      fontSize: 34,
      fontFamily: 'Manrope_700Bold',
      marginTop: 6,
    },
    balanceActions: { flexDirection: 'row', gap: 8, marginTop: 18 },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: C.white,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 24,
    },
    primaryBtnText: {
      color: C.primary,
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
    },

    bankCard: {
      marginHorizontal: 16,
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,
    },
    bankLabel: {
      fontSize: 11,
      color: C.textMuted,
      fontFamily: 'Manrope_500Medium',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    bankName: {
      fontSize: 15,
      color: C.text,
      fontFamily: 'Manrope_600SemiBold',
      marginTop: 4,
    },
    bankSub: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
      fontFamily: 'Manrope_400Regular',
    },
    bankEdit: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: C.background,
      borderWidth: 1,
      borderColor: C.border,
    },
    bankEditText: {
      fontSize: 12,
      color: C.primary,
      fontFamily: 'Manrope_600SemiBold',
    },

    sectionTitle: {
      paddingHorizontal: 16,
      marginTop: 24,
      marginBottom: 8,
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
      color: C.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    txList: {
      marginHorizontal: 16,
      backgroundColor: C.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    txRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    txIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txTitle: { fontSize: 13, color: C.text, fontFamily: 'Manrope_600SemiBold' },
    txDesc: { fontSize: 12, color: C.textSecondary, marginTop: 1, fontFamily: 'Manrope_400Regular' },
    txDate: { fontSize: 11, color: C.textMuted, marginTop: 2, fontFamily: 'Manrope_400Regular' },
    txAmount: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
    txStatus: { fontSize: 10, marginTop: 2, fontFamily: 'Manrope_500Medium', textTransform: 'capitalize' },

    empty: { alignItems: 'center', padding: 32, gap: 12 },
    emptyText: {
      color: C.textSecondary,
      fontSize: 13,
      textAlign: 'center',
      fontFamily: 'Manrope_400Regular',
    },

    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalSheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 32,
    },
    modalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
      alignSelf: 'center',
      marginBottom: 12,
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: 'Manrope_700Bold',
      color: C.text,
      marginBottom: 12,
    },
    modalLabel: {
      fontSize: 12,
      color: C.textSecondary,
      fontFamily: 'Manrope_500Medium',
      marginTop: 12,
      marginBottom: 6,
    },
    modalBankBlock: {
      backgroundColor: C.background,
      padding: 12,
      borderRadius: 10,
      marginBottom: 8,
    },
    modalBankName: { fontSize: 14, color: C.text, fontFamily: 'Manrope_600SemiBold' },
    modalBankSub: { fontSize: 12, color: C.textSecondary, marginTop: 2, fontFamily: 'Manrope_400Regular' },
    modalInput: {
      backgroundColor: C.background,
      borderRadius: 10,
      padding: 12,
      fontSize: 15,
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
      fontFamily: 'Manrope_500Medium',
    },
    modalBtnSecondary: {
      flex: 1,
      padding: 14,
      borderRadius: 24,
      backgroundColor: C.background,
      alignItems: 'center',
    },
    modalBtnSecondaryText: { color: C.text, fontFamily: 'Manrope_600SemiBold', fontSize: 14 },
    modalBtnPrimary: {
      flex: 1,
      padding: 14,
      borderRadius: 24,
      backgroundColor: C.primary,
      alignItems: 'center',
    },
    modalBtnPrimaryText: { color: C.white, fontFamily: 'Manrope_700Bold', fontSize: 14 },

    bankPickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    bankPickText: { fontSize: 14, color: C.text, fontFamily: 'Manrope_500Medium' },

    changeBankBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      marginBottom: 6,
    },
    changeBankText: { color: C.primary, fontSize: 13, fontFamily: 'Manrope_600SemiBold' },

    acctNameBox: {
      backgroundColor: C.background,
      padding: 12,
      borderRadius: 10,
      marginTop: 8,
      minHeight: 42,
      justifyContent: 'center',
    },
    acctNameText: { color: C.success, fontSize: 14, fontFamily: 'Manrope_700Bold' },
    acctNameError: { color: C.error, fontSize: 12, fontFamily: 'Manrope_500Medium' },
    acctNameHint: { color: C.textMuted, fontSize: 12, fontFamily: 'Manrope_400Regular' },

    sendCodeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.primary,
      backgroundColor: C.background,
    },
    sendCodeText: { color: C.primary, fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
    codeInput: { letterSpacing: 6, fontFamily: 'Manrope_700Bold', textAlign: 'center' },
    resendText: {
      color: C.primary,
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      marginTop: 8,
      textAlign: 'right',
    },

    detailHero: { alignItems: 'center', paddingVertical: 8, marginBottom: 8 },
    detailType: {
      fontSize: 13,
      color: C.textSecondary,
      fontFamily: 'Manrope_600SemiBold',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    detailAmount: { fontSize: 30, fontFamily: 'Manrope_700Bold', marginTop: 6 },
    detailStatusPill: {
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    detailStatusText: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'capitalize',
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    detailKey: {
      fontSize: 13,
      color: C.textSecondary,
      fontFamily: 'Manrope_500Medium',
      flexShrink: 0,
    },
    detailVal: {
      fontSize: 13,
      color: C.text,
      fontFamily: 'Manrope_600SemiBold',
      flex: 1,
      textAlign: 'right',
    },
    detailMono: { fontFamily: 'Manrope_500Medium', fontSize: 12 },
    detailCloseBtn: {
      marginTop: 20,
      padding: 14,
      borderRadius: 24,
      backgroundColor: C.background,
      alignItems: 'center',
    },
    detailCloseText: { color: C.text, fontFamily: 'Manrope_600SemiBold', fontSize: 14 },
  });
