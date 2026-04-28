# EduTrack Mobile App 📱

A production-ready React Native + Expo mobile application for the EduTrack school management platform. Built with Expo Router (file-based routing), TypeScript, and a clean dark-themed UI.

---

## 🏗️ Architecture

```
mobile/
├── app/                         # Expo Router pages (file-based routes)
│   ├── _layout.tsx              # Root layout — AuthProvider + AuthGuard + Stack
│   ├── index.tsx                # Entry redirect (→ dashboard or login)
│   ├── login.tsx                # Login screen (student DOB + teacher email)
│   ├── ai-questions.tsx         # AI Question Generator (modal screen)
│   └── (tabs)/
│       ├── _layout.tsx          # Bottom tab navigator
│       ├── dashboard.tsx        # Home — grades, attendance, fee alerts
│       ├── announcements.tsx    # School announcements with filter + detail modal
│       ├── payments.tsx         # Fee dues + Razorpay payment flow
│       ├── academics.tsx        # Report card — per-subject marks + tests
│       └── profile.tsx          # User info + navigation + logout
│
├── components/
│   └── ui/
│       ├── Button.tsx           # Primary / secondary / ghost / danger buttons
│       ├── Card.tsx             # Card, StatCard, SectionHeader, Badge
│       ├── Feedback.tsx         # LoadingScreen, EmptyState, ErrorState, ProgressBar
│       └── Input.tsx            # Labelled input with icon slots + error state
│
├── hooks/
│   ├── useAuth.tsx              # Auth context + SecureStore session persistence
│   ├── useStudentData.ts        # Parallel data fetcher (marks/attendance/fees/profile)
│   └── index.ts                 # Barrel exports
│
├── services/
│   ├── apiClient.ts             # Axios instance with auth + error interceptors
│   ├── authService.ts           # Student / teacher login functions
│   └── index.ts                 # All domain services (announcements, finance, marks …)
│
├── constants/
│   ├── Colors.ts                # Complete dark-theme colour palette
│   └── index.ts                 # API_BASE_URL, STORAGE_KEYS, PRIORITY_CONFIG
│
└── app.json                     # Expo config (EduTrack branding, dark UI style)
```

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
cd mobile
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
EXPO_PUBLIC_API_BASE_URL=http://YOUR_BACKEND_IP:8000/api
```

> **Important:** For physical devices, use your machine's LAN IP (e.g. `192.168.1.x`), not `localhost`.

### 3. Start the dev server

```bash
npm start          # Opens Expo Dev Server
npm run ios        # iOS Simulator
npm run android    # Android Emulator / Device
```

---

## 🔐 Authentication

The app supports two login modes, matching the web frontend:

| Portal | Method | Fields |
|---|---|---|
| **Student / Parent** | DOB-based | Name, Grade, Section, Date of Birth, Institution Code |
| **Teacher** | Email + Password | Email, Password, Institution Code |

Sessions are stored securely using `expo-secure-store` and automatically restored on app boot.

**Token refresh:** The mobile app uses the same JWT token. If the token expires, users are redirected to the login screen.

---

## 📱 Screens

### Dashboard (`/(tabs)/dashboard`)
- Time-based greeting + student name
- Hero stat cards: Overall Grade % + Attendance %
- Fee alerts — overdue/upcoming dues tapping into Payments
- Subject performance progress bars (top 5)
- Attendance breakdown (Present / Absent / Late counts)

### Announcements (`/(tabs)/announcements`)
- Filter tabs: All / Unread / Urgent
- Priority-accented cards with unread dot indicators
- Native modal to read full announcement
- Attachment links (open in browser via `Linking.openURL`)
- Pull-to-refresh

### Payments (`/(tabs)/payments`)
- Fee summary: total due + student name
- Category-level breakdown (Tuition, Transport, etc.)
- Partial payment amount input with max capping
- Razorpay order creation — auto-detects mock mode
- Success / error status banners
- "All Paid" celebration state

### Academics (`/(tabs)/academics`)
- Overall grade card with letter grade badge
- Subject grid (tap to expand test-level detail)
- Per-test scores with date + percentage
- Link to AI Question Generator

### Profile (`/(tabs)/profile`)
- Avatar with initials + role chip
- Account details card (name, email, role, class)
- Quick-access navigation menu
- Secure logout with confirmation dialog

### AI Question Generator (`/ai-questions`)
- Topic + subject text inputs
- Question type selector (MCQ, Short Answer, True/False, Fill in the Blanks)
- Difficulty picker (Easy / Medium / Hard)
- Count selector (3 / 5 / 10 / 15)
- Expandable question cards with MCQ options highlighted and answers revealed

---

## 🔌 API Endpoints Used

| Feature | Endpoint |
|---|---|
| Student login | `POST /directory/students/login` |
| Teacher login | `POST /directory/teachers/login` |
| Student profile | `GET /directory/students/:id` |
| Marks | `GET /marks/:studentId` |
| Attendance | `GET /attendance/:studentId` |
| Announcements | `GET /announcements/my` |
| Parent fees | `GET /parent/fees` |
| Student dues | `GET /finance/students/:id/dues` |
| Create order | `POST /finance/payments/create-order` |
| Verify payment | `POST /finance/payments/verify` |
| AI questions | `POST /ai/generate-questions` |

All requests automatically include:
- `Authorization: Bearer <token>`
- `X-Institution-Id: <id>`
- `X-Portal-Role: <role>`

---

## 🎨 Design System

- **Theme:** Dark (`#0f0f1a` background)
- **Primary:** Indigo `#4f46e5`
- **Card surface:** `#1e1e35` with `#2d2d4a` borders
- **Fonts:** System default (San Francisco on iOS, Roboto on Android)
- **Corner radius:** 14–22px for cards, 12–16px for inputs/buttons

---

## 📦 Key Dependencies

| Package | Purpose |
|---|---|
| `expo-router` | File-based navigation |
| `expo-secure-store` | Encrypted JWT storage |
| `axios` | HTTP client with interceptors |
| `react-native-safe-area-context` | Safe area insets |
| `@react-navigation/bottom-tabs` | Tab navigator |

---

## 🚧 Razorpay Integration Notes

The backend auto-detects test vs production mode:
- **Mock mode:** `order.is_mock === true` — payment is simulated instantly without opening any UI
- **Production:** Pass `order.checkout_url` or use the official `react-native-razorpay` package

To add native Razorpay checkout:
```bash
npx expo install react-native-razorpay
```
Then in `payments.tsx`, replace the `Linking.openURL` block with the `RazorpayCheckout.open()` call.

---

## 🗂️ File Structure Decisions

- **No duplication of business logic** — all calculations stay on the backend
- **No CSS from web** — all styles are `StyleSheet.create()` optimised for native
- **Partial failures handled gracefully** — `Promise.allSettled` means one failing API call doesn't crash the whole dashboard
- **Protected routes** — `AuthGuard` in root layout redirects unauthenticated users before any screen renders
