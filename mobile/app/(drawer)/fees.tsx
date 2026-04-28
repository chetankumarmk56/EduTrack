import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { financeService, type StudentDues } from '../../services';
import { Colors } from '../../constants/Colors';
import { Card, SectionHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingScreen, EmptyState } from '../../components/ui/Feedback';

export default function FeesScreen() {
  const { user } = useAuth();
  const [dues, setDues] = useState<StudentDues | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const studentId = user?.student_id || user?.id;

  const loadDues = useCallback(async () => {
    if (!studentId) return;
    try {
      const data = await financeService.getStudentDues(studentId);
      setDues(data);
      setPayAmount(String(data.total_due));
    } catch (e: any) {
      // silently handle — show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  useEffect(() => { loadDues(); }, [loadDues]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDues();
  }, [loadDues]);

  const handlePayment = async () => {
    if (!dues || dues.total_due <= 0) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0 || amount > dues.total_due) {
      Alert.alert('Invalid Amount', `Please enter an amount between ₹1 and ₹${dues.total_due}`);
      return;
    }

    setProcessing(true);
    setStatusMsg(null);

    try {
      const order = await financeService.createOrder(studentId, amount);

      // Mock payment flow (no native Razorpay SDK here — use WebView or RazorpayCheckout)
      if (order.is_mock) {
        await financeService.verifyPayment({
          razorpay_order_id: order.order_id,
          razorpay_payment_id: `pay_mock_${Date.now()}`,
          razorpay_signature: 'mock_signature',
        });
        setStatusMsg({ type: 'success', text: '✅ Simulated payment successful! Dues updated.' });
        await loadDues();
        return;
      }

      // For real Razorpay, open the checkout URL
      if (order.checkout_url) {
        await Linking.openURL(order.checkout_url);
      } else {
        Alert.alert(
          'Payment Ready',
          `Order created (₹${amount}). Open Razorpay to complete payment.\n\nOrder ID: ${order.order_id}`,
          [{ text: 'OK' }],
        );
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: `❌ ${e.message || 'Payment failed. Please try again.'}` });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <LoadingScreen message="Loading fee details..." />;

  const isPaid = dues?.total_due === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Fee's Ledger</Text>
          <View style={[styles.statusChip, { backgroundColor: isPaid ? `${Colors.success}22` : `${Colors.danger}22` }]}>
            <Text style={[styles.statusChipText, { color: isPaid ? Colors.success : Colors.danger }]}>
              {isPaid ? '✓ Fully Paid' : '● Outstanding'}
            </Text>
          </View>
        </View>

        {/* Status Message */}
        {statusMsg && (
          <View style={[
            styles.statusBanner,
            { backgroundColor: statusMsg.type === 'success' ? `${Colors.success}22` : `${Colors.danger}22` },
          ]}>
            <Text style={[
              styles.statusBannerText,
              { color: statusMsg.type === 'success' ? Colors.success : Colors.danger },
            ]}>
              {statusMsg.text}
            </Text>
          </View>
        )}

        {/* Summary Cards */}
        {dues && (
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: Colors.card }]}>
              <Text style={styles.summaryLabel}>Total Due</Text>
              <Text style={[styles.summaryValue, { color: dues.total_due > 0 ? Colors.danger : Colors.success }]}>
                ₹{dues.total_due.toLocaleString()}
              </Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: Colors.card }]}>
              <Text style={styles.summaryLabel}>Account</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>{dues.student_name}</Text>
            </View>
          </View>
        )}

        {/* Breakdown */}
        {dues && dues.breakdown.length > 0 && (
          <View>
            <SectionHeader title="Fee Breakdown" subtitle="Academic cycle 2024-25" />
            <Card>
              {dues.breakdown.map((item, i) => (
                <View
                  key={i}
                  style={[
                    styles.breakdownRow,
                    i < dues.breakdown.length - 1 && styles.breakdownDivider,
                  ]}
                >
                  <View style={styles.breakdownLeft}>
                    <View style={styles.breakdownIcon}>
                      <Text style={styles.breakdownIconText}>{item.fee_type[0]}</Text>
                    </View>
                    <View>
                      <Text style={styles.breakdownType}>{item.fee_type}</Text>
                      <Text style={styles.breakdownMeta}>
                        Total ₹{item.total.toLocaleString()} · Paid ₹{item.paid.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.breakdownDue, { color: item.due > 0 ? Colors.danger : Colors.success }]}>
                    {item.due > 0 ? `₹${item.due.toLocaleString()}` : '✓ Clear'}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        )}

        {/* Payment Section */}
        {dues && dues.total_due > 0 && (
          <View>
            <SectionHeader title="Make a Payment" subtitle="Powered by Razorpay" />
            <Card style={styles.paymentCard}>
              {/* Amount Input */}
              <View style={styles.amountRow}>
                <Text style={styles.rupeeSymbol}>₹</Text>
                <TextInput
                  style={styles.amountInput}
                  value={payAmount}
                  onChangeText={(t) => {
                    const n = parseFloat(t);
                    if (!t || isNaN(n)) { setPayAmount(t); return; }
                    setPayAmount(String(Math.min(n, dues.total_due)));
                  }}
                  keyboardType="numeric"
                  placeholder={String(dues.total_due)}
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <Text style={styles.amountHint}>
                Max payable: ₹{dues.total_due.toLocaleString()}
              </Text>

              <Button
                label={`Pay ₹${parseFloat(payAmount || '0').toLocaleString()}`}
                onPress={handlePayment}
                loading={processing}
                size="lg"
                style={styles.payBtn}
              />

              {/* Security Note */}
              <View style={styles.securityNote}>
                <Text style={styles.securityText}>
                  🔒 Payments are secured via Razorpay. Priority dues (Tuition) are cleared first.
                </Text>
              </View>
            </Card>
          </View>
        )}

        {/* All Paid State */}
        {isPaid && (
          <Card style={styles.paidCard}>
            <Text style={styles.paidEmoji}>🎉</Text>
            <Text style={styles.paidTitle}>Account Fully Settled</Text>
            <Text style={styles.paidSub}>
              All your academic dues are currently clear. Thank you!
            </Text>
          </Card>
        )}

        {/* No dues loaded */}
        {!dues && !loading && (
          <EmptyState
            icon={<Text style={{ fontSize: 40 }}>💳</Text>}
            title="No fee records found"
            subtitle="Your fee information will appear here once available"
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, gap: 24, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 26, fontWeight: '900', color: Colors.text, letterSpacing: -0.8 },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusChipText: { fontSize: 12, fontWeight: '800' },

  statusBanner: {
    padding: 14,
    borderRadius: 14,
  },
  statusBannerText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },

  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: {
    flex: 1,
    borderRadius: 18,
    padding: 18,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 18, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },

  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  breakdownDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  breakdownLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  breakdownIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.overlay10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownIconText: { fontSize: 18, fontWeight: '900', color: Colors.primary },
  breakdownType: { fontSize: 14, fontWeight: '700', color: Colors.text },
  breakdownMeta: { fontSize: 11, color: Colors.textMuted, fontWeight: '500', marginTop: 2 },
  breakdownDue: { fontSize: 15, fontWeight: '800' },

  paymentCard: { gap: 16 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rupeeSymbol: { fontSize: 22, fontWeight: '900', color: Colors.primary, marginRight: 8 },
  amountInput: {
    flex: 1,
    height: 56,
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  amountHint: { fontSize: 12, color: Colors.textMuted, fontWeight: '500', marginTop: -8 },
  payBtn: { marginTop: 4 },
  securityNote: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    padding: 12,
  },
  securityText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, fontWeight: '500' },

  paidCard: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  paidEmoji: { fontSize: 48 },
  paidTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  paidSub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
