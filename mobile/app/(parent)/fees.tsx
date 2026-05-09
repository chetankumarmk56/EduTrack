import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { financeService } from '../../services/financeService';
import { Colors } from '../../constants/Colors';
import { LoadingScreen, EmptyState, ErrorState } from '../../components/ui/Feedback';
import { PaymentModal, RazorpayOrder } from '../../components/ui/PaymentModal';
import type { StudentDues } from '../../types';

interface FeeItem {
  id: number;
  fee_type: string;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  status: 'paid' | 'partial' | 'pending';
}

const FEE_ICON_MAP: Record<string, { icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; color: string }> = {
  TUITION:   { icon: 'school',     color: '#2563eb' },
  TRANSPORT: { icon: 'bus',        color: '#0891b2' },
  LIBRARY:   { icon: 'library',    color: '#7c3aed' },
  EXAM:      { icon: 'document-text', color: '#dc2626' },
  LAB:       { icon: 'flask',      color: '#16a34a' },
  SPORTS:    { icon: 'football',   color: '#ea580c' },
  HOSTEL:    { icon: 'home',       color: '#65a30d' },
  CANTEEN:   { icon: 'restaurant', color: '#ca8a04' },
  UNIFORM:   { icon: 'shirt',      color: '#0d9488' },
  ACTIVITY:  { icon: 'sparkles',   color: '#9333ea' },
  MISC:      { icon: 'ellipsis-horizontal', color: '#475569' },
};

function iconForFee(type: string): { icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; color: string } {
  const key = (type || '').toUpperCase();
  for (const k of Object.keys(FEE_ICON_MAP)) {
    if (key.includes(k)) return FEE_ICON_MAP[k];
  }
  return { icon: 'cash', color: Colors.primary };
}

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

function describeDueDate(due_date: string | null | undefined, is_overdue: boolean | undefined, hasDue: boolean) {
  if (!hasDue) return { label: 'All Cleared', tone: 'good', icon: 'checkmark-done-circle' as const };
  if (!due_date) return { label: 'Pending Dues', tone: 'warn', icon: 'time' as const };
  const today = startOfDay(new Date());
  const target = startOfDay(new Date(due_date));
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (is_overdue || diff < 0) {
    return { label: `Overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'}`, tone: 'danger', icon: 'alert-circle' as const };
  }
  if (diff === 0) return { label: 'Due Today', tone: 'danger', icon: 'alert-circle' as const };
  if (diff <= 7) return { label: `Due in ${diff} day${diff === 1 ? '' : 's'}`, tone: 'warn', icon: 'time' as const };
  return { label: `Due by ${target.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, tone: 'ok', icon: 'calendar' as const };
}

export default function FeesScreen() {
  const { user } = useAuth();
  const [dues, setDues] = useState<StudentDues | null>(null);
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
      setDues(data);
      const items: FeeItem[] = (data?.breakdown || []).map((item: any, index: number) => {
        const total = item.total || 0;
        const paid = item.paid || 0;
        const due = item.due || 0;
        return {
          id: index,
          fee_type: item.fee_type || 'Fee',
          total_amount: total,
          paid_amount: paid,
          due_amount: due,
          status: due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending',
        };
      });
      setFees(items);
    } catch (e: any) {
      setError(e.message || 'Failed to load fees');
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

  const totals = useMemo(() => {
    const due = fees.reduce((a, f) => a + f.due_amount, 0);
    const paid = fees.reduce((a, f) => a + f.paid_amount, 0);
    const total = fees.reduce((a, f) => a + f.total_amount, 0);
    const pct = total > 0 ? Math.round((paid / total) * 100) : 100;
    return { due, paid, total, pct };
  }, [fees]);

  const dueInfo = describeDueDate(dues?.due_date, dues?.is_overdue, totals.due > 0);

  const heroColor = totals.due === 0
    ? Colors.success
    : dueInfo.tone === 'danger'
    ? Colors.danger
    : dueInfo.tone === 'warn'
    ? Colors.warning
    : Colors.primary;

  const handleInitializePayment = async () => {
    if (totals.due <= 0 || !studentId || orderLoading) return;
    setOrderLoading(true);
    try {
      const data = await financeService.createOrder(studentId, totals.due);
      const rzpOrder: RazorpayOrder = {
        order_id: data.order_id,
        amount: data.amount,
        key_id: data.key_id,
        currency: data.currency || 'INR',
        is_mock: data.is_mock,
      };
      setOrder(rzpOrder);
      setPaymentVisible(true);
    } catch (err: any) {
      Alert.alert('Payment Error', err?.message || 'Failed to initialize payment. Please try again.');
    } finally {
      setOrderLoading(false);
    }
  };

  const handleModalClose = useCallback(async () => {
    setPaymentVisible(false);
    if (order && studentId) financeService.cancelOrder(studentId, order.order_id);
    setOrder(null);
  }, [order, studentId]);

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
      Alert.alert('Payment Successful', `₹${rupees} has been recorded. Your fee ledger will update now.`);
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

  if (loading) return <LoadingScreen message="Loading your fee ledger..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.scroll, totals.due > 0 && { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInUp.duration(400)} style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Fee Ledger</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {dues?.student_name || user?.name || 'Account'}
            </Text>
          </View>
          <View
            style={[
              styles.statusChip,
              {
                backgroundColor:
                  dueInfo.tone === 'good' ? `${Colors.success}15` :
                  dueInfo.tone === 'danger' ? `${Colors.danger}15` :
                  dueInfo.tone === 'warn' ? `${Colors.warning}15` :
                  `${Colors.primary}15`,
                borderColor:
                  dueInfo.tone === 'good' ? `${Colors.success}40` :
                  dueInfo.tone === 'danger' ? `${Colors.danger}40` :
                  dueInfo.tone === 'warn' ? `${Colors.warning}40` :
                  `${Colors.primary}40`,
              },
            ]}
          >
            <Ionicons name={dueInfo.icon} size={12} color={heroColor} />
            <Text style={[styles.statusChipText, { color: heroColor }]}>{dueInfo.label}</Text>
          </View>
        </Animated.View>

        {error && <ErrorState message={error} onRetry={fetchFees} />}

        {/* HERO */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.heroWrap}>
          <View style={[styles.heroCard, { backgroundColor: heroColor }]}>
            <View style={styles.heroBgCircle1} />
            <View style={styles.heroBgCircle2} />

            <View style={styles.heroTop}>
              <View style={styles.heroPill}>
                <Ionicons
                  name={totals.due === 0 ? 'checkmark-circle' : 'wallet'}
                  size={12}
                  color={Colors.white}
                />
                <Text style={styles.heroPillText}>
                  {totals.due === 0 ? 'CLEARED' : 'OUTSTANDING'}
                </Text>
              </View>
              <Text style={styles.heroLabel}>FEE BALANCE</Text>
            </View>

            <View style={styles.heroAmtRow}>
              <Text style={styles.heroCur}>₹</Text>
              <Text style={styles.heroAmt}>{totals.due.toLocaleString('en-IN')}</Text>
            </View>

            <View style={styles.heroBarTrack}>
              <View style={[styles.heroBarFill, { width: `${Math.max(2, totals.pct)}%` }]} />
            </View>
            <View style={styles.heroBarLegend}>
              <Text style={styles.heroLegendText}>
                ₹{totals.paid.toLocaleString('en-IN')} paid
              </Text>
              <Text style={styles.heroLegendText}>{totals.pct}% of ₹{totals.total.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Summary tiles */}
        {fees.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200)} style={styles.summaryRow}>
            <SummaryTile label="Total Fees" value={totals.total} color={Colors.text} />
            <View style={styles.summaryDivider} />
            <SummaryTile label="Paid" value={totals.paid} color={Colors.success} />
            <View style={styles.summaryDivider} />
            <SummaryTile label="Due" value={totals.due} color={totals.due > 0 ? Colors.danger : Colors.success} />
          </Animated.View>
        )}

        {/* Section header */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Breakdown</Text>
          <Text style={styles.sectionSub}>{fees.length} categor{fees.length === 1 ? 'y' : 'ies'}</Text>
        </View>

        {/* Breakdown list */}
        <View style={styles.list}>
          {fees.length === 0 && !error ? (
            <EmptyState
              icon={<Ionicons name="checkmark-done-circle" size={48} color={Colors.success} />}
              title="All caught up!"
              subtitle="There are no outstanding fees on your account."
            />
          ) : (
            fees.map((fee, index) => {
              const meta = iconForFee(fee.fee_type);
              const paidPct = fee.total_amount > 0
                ? Math.round((fee.paid_amount / fee.total_amount) * 100)
                : 100;
              const statusMeta =
                fee.status === 'paid'
                  ? { color: Colors.success, label: 'Paid', icon: 'checkmark-circle' as const }
                  : fee.status === 'partial'
                  ? { color: Colors.warning, label: 'Partial', icon: 'pie-chart' as const }
                  : { color: Colors.danger, label: 'Pending', icon: 'time' as const };

              return (
                <Animated.View key={fee.id} entering={FadeInDown.delay(280 + index * 50)}>
                  <View style={[styles.feeCard, { borderLeftColor: meta.color }]}>
                    <View style={styles.feeTopRow}>
                      <View style={[styles.feeIconBox, { backgroundColor: `${meta.color}15` }]}>
                        <Ionicons name={meta.icon} size={20} color={meta.color} />
                      </View>
                      <View style={styles.feeInfo}>
                        <Text style={styles.feeTitle} numberOfLines={1}>{fee.fee_type}</Text>
                        <Text style={styles.feeMeta}>
                          ₹{fee.paid_amount.toLocaleString('en-IN')} / ₹{fee.total_amount.toLocaleString('en-IN')}
                        </Text>
                      </View>
                      <View style={styles.feeAmount}>
                        <Text style={styles.feeAmtLabel}>DUE</Text>
                        <Text
                          style={[
                            styles.feeAmtVal,
                            { color: fee.due_amount > 0 ? Colors.danger : Colors.success },
                          ]}
                        >
                          ₹{fee.due_amount.toLocaleString('en-IN')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.feeProgressRow}>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.max(2, paidPct)}%`,
                              backgroundColor: statusMeta.color,
                            },
                          ]}
                        />
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: `${statusMeta.color}15` }]}>
                        <Ionicons name={statusMeta.icon} size={11} color={statusMeta.color} />
                        <Text style={[styles.statusPillText, { color: statusMeta.color }]}>
                          {paidPct}% · {statusMeta.label}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Animated.View>
              );
            })
          )}
        </View>

        {/* Trust footer */}
        {fees.length > 0 && (
          <Animated.View entering={FadeInDown.delay(500)} style={styles.trustRow}>
            <Ionicons name="shield-checkmark" size={14} color={Colors.textMuted} />
            <Text style={styles.trustText}>
              Secured by Razorpay · Payments are encrypted end-to-end
            </Text>
          </Animated.View>
        )}
      </ScrollView>

      {/* Sticky pay bar */}
      {totals.due > 0 && (
        <View style={styles.payBar}>
          <View style={styles.payBarInfo}>
            <Text style={styles.payBarLabel}>Pay Now</Text>
            <Text style={styles.payBarAmt}>₹{totals.due.toLocaleString('en-IN')}</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleInitializePayment}
            disabled={orderLoading}
            style={[styles.payBtn, orderLoading && { opacity: 0.7 }]}
          >
            {orderLoading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Ionicons name="lock-closed" size={14} color={Colors.white} />
                <Text style={styles.payBtnText}>Pay Securely</Text>
                <Ionicons name="arrow-forward" size={14} color={Colors.white} />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

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

interface SummaryTileProps {
  label: string;
  value: number;
  color: string;
}
function SummaryTile({ label, value, color }: SummaryTileProps) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        ₹{value.toLocaleString('en-IN')}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 18, gap: 16 },

  // Header
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 28, fontWeight: '900', color: Colors.text, letterSpacing: -1 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginTop: 2 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusChipText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.3 },

  // HERO
  heroWrap: { borderRadius: 26, overflow: 'hidden' },
  heroCard: {
    borderRadius: 26,
    padding: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  heroBgCircle1: {
    position: 'absolute',
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.10)',
    top: -90, right: -60,
  },
  heroBgCircle2: {
    position: 'absolute',
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -60, left: -40,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
  },
  heroPillText: { color: Colors.white, fontWeight: '900', fontSize: 11, letterSpacing: 0.4 },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  heroAmtRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 16, marginBottom: 14 },
  heroCur: { color: Colors.white, fontSize: 28, fontWeight: '900', marginTop: 8, marginRight: 4 },
  heroAmt: { color: Colors.white, fontSize: 56, fontWeight: '900', letterSpacing: -2.5, lineHeight: 60 },

  heroBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  heroBarFill: { height: 8, borderRadius: 4, backgroundColor: Colors.white },
  heroBarLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  heroLegendText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '800' },

  // SUMMARY
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 16, fontWeight: '900', letterSpacing: -0.4 },
  summaryLabel: {
    fontSize: 10, fontWeight: '900',
    color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  summaryDivider: { width: 1, marginVertical: 2, backgroundColor: Colors.divider },

  // SECTION
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: Colors.text, letterSpacing: -0.3 },
  sectionSub: { fontSize: 11, fontWeight: '800', color: Colors.textMuted },

  list: { gap: 12 },
  feeCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    gap: 12,
  },
  feeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  feeIconBox: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  feeInfo: { flex: 1 },
  feeTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, textTransform: 'capitalize' },
  feeMeta: { fontSize: 12, color: Colors.textMuted, fontWeight: '700', marginTop: 2 },
  feeAmount: { alignItems: 'flex-end' },
  feeAmtLabel: { fontSize: 9, fontWeight: '900', color: Colors.textMuted, letterSpacing: 0.6 },
  feeAmtVal: { fontSize: 16, fontWeight: '900', letterSpacing: -0.4, marginTop: 1 },

  feeProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: {
    flex: 1, height: 8,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 4, overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },

  // TRUST
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginTop: 8,
  },
  trustText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },

  // PAY BAR
  payBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
  payBarInfo: { flex: 1 },
  payBarLabel: {
    fontSize: 10, fontWeight: '900',
    color: Colors.textMuted, letterSpacing: 0.6,
  },
  payBarAmt: { fontSize: 22, fontWeight: '900', color: Colors.text, letterSpacing: -0.8 },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  payBtnText: { color: Colors.white, fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },
});
