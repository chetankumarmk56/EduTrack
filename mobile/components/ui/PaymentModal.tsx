import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Colors } from '../../constants/Colors';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

export interface RazorpayOrder {
  order_id: string;
  amount: number;     // in paise (100 = ₹1)
  key_id: string;
  currency: string;
  is_mock: boolean;
}

interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the real Razorpay payment_id and signature after checkout */
  onSuccess: (paymentId: string, signature: string) => void;
  onFailed: (reason: string) => void;
  order: RazorpayOrder | null;
  /** True while the verify API call is in-flight */
  verifying: boolean;
}

// Build the Razorpay Standard Checkout HTML page.
// postMessage back to RN with { type, payment_id?, order_id?, signature?, error? }
function buildCheckoutHtml(order: RazorpayOrder): string {
  const amountRupees = (order.amount / 100).toLocaleString('en-IN');
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f8fafc; font-family: -apple-system, sans-serif; }
    .center {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; height: 100vh; gap: 16px; padding: 24px;
    }
    .spinner {
      width: 40px; height: 40px; border: 4px solid #e2e8f0;
      border-top-color: #3392FF; border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { color: #64748b; font-size: 15px; text-align: center; }
    .amount { font-size: 28px; font-weight: 800; color: #0f172a; }
    .error { color: #dc2626; font-size: 14px; text-align: center; }
    button {
      margin-top: 8px; padding: 12px 32px; background: #3392FF;
      color: #fff; border: none; border-radius: 12px;
      font-size: 16px; font-weight: 700; cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="center" id="loading">
    <div class="spinner"></div>
    <span class="amount">₹${amountRupees}</span>
    <p>Opening Razorpay secure checkout…</p>
  </div>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    function post(obj) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch(e) {}
    }

    window.addEventListener('load', function() {
      var options = {
        key: "${order.key_id}",
        amount: ${order.amount},
        currency: "${order.currency || 'INR'}",
        order_id: "${order.order_id}",
        name: "School Fees",
        description: "Academic Fee Payment",
        image: "",
        theme: { color: "#3392FF" },
        handler: function(response) {
          post({
            type: "SUCCESS",
            payment_id: response.razorpay_payment_id,
            order_id:   response.razorpay_order_id,
            signature:  response.razorpay_signature
          });
        },
        modal: {
          ondismiss: function() { post({ type: "DISMISSED" }); },
          escape: false,
          backdropclose: false
        }
      };
      var rzp = new Razorpay(options);
      rzp.on("payment.failed", function(r) {
        post({ type: "FAILED", error: (r.error && r.error.description) || "Payment failed" });
      });
      document.getElementById("loading").style.display = "none";
      rzp.open();
    });
  </script>
</body>
</html>`;
}

// Mock confirmation for demo/test mode (placeholder Razorpay keys)
function MockConfirmation({
  order,
  verifying,
  onConfirm,
  onCancel,
}: {
  order: RazorpayOrder;
  verifying: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const rupees = (order.amount / 100).toLocaleString('en-IN');
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.kvContainer}
    >
      <Animated.View entering={SlideInDown} style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>🧪</Text>
          <View>
            <Text style={styles.headerTitle}>Test Payment</Text>
            <Text style={styles.headerSub}>Demo Environment</Text>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.amountLabel}>Amount to Pay</Text>
          <Text style={styles.amountDisplay}>₹{rupees}</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Razorpay keys are in <Text style={{ fontWeight: '900' }}>test mode</Text>.
              No real money will be charged. Tap "Confirm Test Payment" to simulate
              a successful transaction and update your fee ledger.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={verifying}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.payButton, verifying && { opacity: 0.7 }]}
            onPress={onConfirm}
            disabled={verifying}
          >
            {verifying ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.payText}>Confirm Test Payment</Text>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

export function PaymentModal({
  visible,
  onClose,
  onSuccess,
  onFailed,
  order,
  verifying,
}: PaymentModalProps) {
  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'SUCCESS') {
        onSuccess(msg.payment_id, msg.signature);
      } else if (msg.type === 'DISMISSED') {
        onClose();
      } else if (msg.type === 'FAILED') {
        onFailed(msg.error || 'Payment failed');
      }
    } catch {
      // ignore malformed message
    }
  };

  const handleMockConfirm = () => {
    // Mock: pass sentinel values the backend recognises as test mode
    onSuccess('pay_mock_success', 'mock_signature');
  };

  return (
    <Modal
      visible={visible}
      transparent={!order || order.is_mock}
      animationType={order && !order.is_mock ? 'slide' : 'fade'}
      onRequestClose={onClose}
    >
      {!order ? (
        // Still creating the order — show a spinner
        <View style={[styles.overlay, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ marginTop: 12, color: Colors.white, fontWeight: '700' }}>
            Preparing payment…
          </Text>
        </View>
      ) : order.is_mock ? (
        // Demo / test mode — bottom-sheet confirmation
        <View style={styles.overlay}>
          <Animated.View entering={FadeIn} style={styles.backdrop}>
            <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
          </Animated.View>
          <MockConfirmation
            order={order}
            verifying={verifying}
            onConfirm={handleMockConfirm}
            onCancel={onClose}
          />
        </View>
      ) : (
        // Real Razorpay — full-screen WebView checkout
        <View style={styles.fullScreen}>
          <View style={styles.webviewHeader}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={verifying}>
              <Text style={styles.closeText}>✕ Close</Text>
            </TouchableOpacity>
            {verifying && (
              <View style={styles.verifyingBadge}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.verifyingText}>Verifying…</Text>
              </View>
            )}
          </View>
          <WebView
            source={{ html: buildCheckoutHtml(order) }}
            onMessage={handleWebViewMessage}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            mixedContentMode="always"
            style={{ flex: 1 }}
          />
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  kvContainer: { width: '100%' },
  content: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  headerEmoji: { fontSize: 32 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: Colors.text },
  headerSub: {
    fontSize: 13, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase',
  },
  body: { marginBottom: 30, alignItems: 'center' },
  amountLabel: {
    fontSize: 13, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  amountDisplay: {
    fontSize: 52, fontWeight: '900', color: Colors.text, marginTop: 8, letterSpacing: -2,
  },
  infoBox: {
    backgroundColor: '#FFF7ED',
    padding: 16,
    borderRadius: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#FED7AA',
    width: '100%',
  },
  infoText: {
    fontSize: 14, color: '#92400E', textAlign: 'center', lineHeight: 21,
  },
  footer: { flexDirection: 'row', gap: 16 },
  cancelButton: {
    flex: 1, padding: 18, borderRadius: 18,
    backgroundColor: Colors.divider, alignItems: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '800', color: Colors.textSecondary },
  payButton: {
    flex: 2, padding: 18, borderRadius: 18,
    backgroundColor: '#3392FF', alignItems: 'center', justifyContent: 'center',
  },
  payText: { fontSize: 16, fontWeight: '900', color: Colors.white },

  // Real Razorpay full-screen
  fullScreen: { flex: 1, backgroundColor: '#fff' },
  webviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    backgroundColor: Colors.white,
  },
  closeBtn: { padding: 8 },
  closeText: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  verifyingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${Colors.primary}10`, paddingHorizontal: 12,
    paddingVertical: 6, borderRadius: 20,
  },
  verifyingText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
});
