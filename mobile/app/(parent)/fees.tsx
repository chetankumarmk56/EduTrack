import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useAuth } from '../../hooks/useAuth';
import { financeService } from '../../services/financeService';
import { Colors } from '../../constants/Colors';
import { Card, SectionHeader } from '../../components/ui/Card';
import { ProgressBar, LoadingScreen, EmptyState, ErrorState } from '../../components/ui/Feedback';
import { PaymentModal, RazorpayOrder } from '../../components/ui/PaymentModal';

interface FeeItem {
  id: number;
  fee_type: string;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  status: string;
}

export default function FeesScreen() {
  const { user } = useAuth();
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payment flow state
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [order, setOrder] = useState<RazorpayOrder | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const studentId = user?.student_id || user?.id;

  const fetchFees = useCallback(async () => {
    if (!studentId) { setLoading(false); return; }
    setError(null);
    try {
      const data = await financeService.getStudentDues(studentId);
      const items: FeeItem[] = (data?.breakdown || []).map((item: any, index: number) => ({
        id: index,
        fee_type: item.fee_type || 'Fee',
        total_amount: item.total || 0,
        paid_amount: item.paid || 0,
        due_amount: item.due || 0,
        status: (item.due || 0) > 0 ? 'pending' : 'paid',
      }));
      setFees(items);
    } catch (e: any) {
      setError(e.message || 'Failed to sync financial records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  useEffect(() => { fetchFees(); }, [fetchFees]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFees();
  }, [fetchFees]);

  const totalDue = useMemo(() => fees.reduce((acc, f) => acc + f.due_amount, 0), [fees]);
  const totalPaid = useMemo(() => fees.reduce((acc, f) => acc + f.paid_amount, 0), [fees]);
  const totalAmount = useMemo(() => fees.reduce((acc, f) => acc + f.total_amount, 0), [fees]);

  // Step 1: Create the order on backend FIRST, then show the modal
  const handleInitializePayment = async () => {
    if (totalDue <= 0 || !studentId || orderLoading) return;
    setOrderLoading(true);
    try {
      const data = await financeService.createOrder(studentId, totalDue);
      const rzpOrder: RazorpayOrder = {
        order_id: data.order_id,
        amount: data.amount,          // already in paise from backend
        key_id: data.key_id,
        currency: data.currency || 'INR',
        is_mock: data.is_mock,
      };
      setOrder(rzpOrder);
      setPaymentVisible(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to initialize payment. Please try again.');
    } finally {
      setOrderLoading(false);
    }
  };

  // Step 2: User dismisses modal → cancel the pending order
  const handleModalClose = useCallback(async () => {
    setPaymentVisible(false);
    if (order && studentId) {
      financeService.cancelOrder(studentId, order.order_id);
    }
    setOrder(null);
  }, [order, studentId]);

  // Step 3: Razorpay returns real payment_id + signature → verify on backend
  const handlePaymentSuccess = useCallback(async (paymentId: string, signature: string) => {
    if (!studentId || !order) return;
    setVerifying(true);
    try {
      await financeService.verifyPayment({
        razorpay_order_id: order.order_id,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      });
      setPaymentVisible(false);
      setOrder(null);
      const rupees = (order.amount / 100).toLocaleString('en-IN');
      Alert.alert(
        'Payment Successful',
        `₹${rupees} has been recorded. Your fee ledger will update now.`,
      );
      fetchFees();
    } catch (err: any) {
      Alert.alert('Verification Failed', err?.message || 'Could not verify payment. Contact support.');
    } finally {
      setVerifying(false);
    }
  }, [studentId, order, fetchFees]);

  const handlePaymentFailed = useCallback((reason: string) => {
    Alert.alert('Payment Failed', reason || 'Your payment could not be processed.');
    handleModalClose();
  }, [handleModalClose]);

  if (loading) return <LoadingScreen message="Securing financial ledger..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        <Animated.View entering={FadeInDown} style={styles.header}>
          <Text style={styles.title}>Financial Ledger</Text>
          <Text style={styles.subtitle}>Secure Payment Portal</Text>
        </Animated.View>

        {error && <ErrorState message={error} onRetry={fetchFees} />}

        {/* Hero summary card */}
        <Animated.View entering={FadeInDown.delay(200)}>
          <View style={[styles.heroCard, { backgroundColor: Colors.primary }]}>
            <View>
              <Text style={styles.heroLabel}>Total Outstanding</Text>
              <Text style={styles.heroAmount}>₹{totalDue.toLocaleString()}</Text>
            </View>
            <View style={styles.heroStatus}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{totalDue > 0 ? 'Pending' : 'Cleared'}</Text>
            </View>
            <View style={styles.neonAccent} />
          </View>
        </Animated.View>

        {/* Summary row */}
        {fees.length > 0 && (
          <Animated.View entering={FadeInDown.delay(300)} style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>₹{totalAmount.toLocaleString()}</Text>
              <Text style={styles.summaryLabel}>Total Fees</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: Colors.success }]}>
                ₹{totalPaid.toLocaleString()}
              </Text>
              <Text style={styles.summaryLabel}>Paid</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: Colors.danger }]}>
                ₹{totalDue.toLocaleString()}
              </Text>
              <Text style={styles.summaryLabel}>Due</Text>
            </View>
          </Animated.View>
        )}

        <SectionHeader title="Dues Breakdown" subtitle="Academic cycle 2024-25" />

        <View style={styles.list}>
          {fees.length > 0 ? (
            fees.map((fee, index) => {
              const paidPct = fee.total_amount > 0
                ? Math.round((fee.paid_amount / fee.total_amount) * 100)
                : 0;
              return (
                <Card key={fee.id} index={index} style={styles.feeCard}>
                  <View style={styles.feeRow}>
                    <View style={[styles.iconBox, { backgroundColor: `${Colors.primary}10` }]}>
                      <Text style={styles.iconText}>📜</Text>
                    </View>
                    <View style={styles.feeInfo}>
                      <Text style={styles.feeTitle}>{fee.fee_type}</Text>
                      <Text style={styles.feeMeta}>Total: ₹{fee.total_amount.toLocaleString()}</Text>
                    </View>
                    <View style={styles.feeValue}>
                      <Text style={styles.dueLabel}>Due Amount</Text>
                      <Text style={[styles.dueAmount, { color: fee.due_amount > 0 ? Colors.danger : Colors.success }]}>
                        ₹{fee.due_amount.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardFooter}>
                    <View style={{ flex: 1 }}>
                      <ProgressBar
                        value={paidPct}
                        color={Colors.success}
                        height={6}
                        backgroundColor={`${Colors.success}15`}
                      />
                    </View>
                    <Text style={styles.progressText}>{paidPct}% Paid</Text>
                  </View>
                </Card>
              );
            })
          ) : !error && (
            <EmptyState
              icon={<Text style={{ fontSize: 50 }}>🎉</Text>}
              title="All caught up!"
              subtitle="Your financial ledger is completely cleared."
            />
          )}
        </View>

        {totalDue > 0 && (
          <Animated.View entering={FadeInRight.delay(400)} style={styles.paymentSticky}>
            <TouchableOpacity
              style={[styles.payButton, orderLoading && { opacity: 0.7 }]}
              activeOpacity={0.9}
              onPress={handleInitializePayment}
              disabled={orderLoading}
            >
              <Text style={styles.payButtonText}>
                {orderLoading ? 'Preparing…' : 'Pay with Razorpay'}
              </Text>
              <Text style={styles.payButtonSub}>₹{totalDue.toLocaleString()}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <PaymentModal
        visible={paymentVisible}
        order={order}
        verifying={verifying}
        onClose={handleModalClose}
        onSuccess={handlePaymentSuccess}
        onFailed={handlePaymentFailed}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20 },
  header: { marginBottom: 26 },
  title: { fontSize: 34, fontWeight: '900', color: Colors.text, letterSpacing: -1.5 },
  subtitle: { fontSize: 16, color: Colors.textSecondary, fontWeight: '600', marginTop: 4 },

  heroCard: {
    padding: 30, borderRadius: 32, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20, overflow: 'hidden',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 8,
  },
  heroLabel: {
    fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase', letterSpacing: 1,
  },
  heroAmount: { fontSize: 44, fontWeight: '900', color: Colors.white, letterSpacing: -2, marginTop: 4 },
  heroStatus: {
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  statusText: { color: Colors.white, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  neonAccent: {
    position: 'absolute', right: -20, bottom: -20,
    width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.1)',
  },

  summaryRow: {
    flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 20,
    padding: 20, marginBottom: 24, borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '900', color: Colors.text },
  summaryLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', marginTop: 4,
  },
  summaryDivider: { width: 1, backgroundColor: Colors.divider },

  list: { gap: 16 },
  feeCard: { padding: 20 },
  feeRow: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 22 },
  feeInfo: { flex: 1, marginLeft: 16 },
  feeTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  feeMeta: { fontSize: 13, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  feeValue: { alignItems: 'flex-end' },
  dueLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase' },
  dueAmount: { fontSize: 18, fontWeight: '900' },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', marginTop: 20,
    paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.divider, gap: 12,
  },
  progressText: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },

  paymentSticky: { marginTop: 30 },
  payButton: {
    backgroundColor: Colors.text, padding: 22, borderRadius: 24,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 8,
  },
  payButtonText: { color: Colors.white, fontSize: 16, fontWeight: '900' },
  payButtonSub: { color: 'rgba(255,255,255,0.7)', fontSize: 18, fontWeight: '800' },
});
