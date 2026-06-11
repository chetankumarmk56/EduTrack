# ArkenEdu Mobile App 📱

A production-ready React Native + Expo Parent Portal mobile application for the ArkenEdu school management platform. Built with Expo Router (file-based routing), TypeScript, and a beautiful dark-themed UI optimized for mobile.

**Status:** ✅ **COMPLETE & PRODUCTION READY**

---

## 🎯 Key Features

### 6 Core Portal Screens
- **Dashboard** - At-a-glance overview with key metrics
- **Marks** - Academic performance, subjects, and test scores
- **Attendance** - Tracking with statistics and goals
- **Teachers** - Faculty directory with contact info
- **Events** - School calendar with event types
- **Announcements** - News and updates with filtering
- **Fees** - Read-only dues view; UPI payment is submitted in the web portal and verified by the school admin
- **Profile** - User settings and secure logout

### Technical Highlights
✅ Secure authentication with token persistence  
✅ Real-time data from backend APIs  
✅ Pull-to-refresh on all screens  
✅ Error handling with retry logic  
✅ Empty state messages  
✅ Loading indicators  
✅ Mobile-optimized card-based UI  
✅ Dark theme with proper contrast  
✅ TypeScript for type safety  
✅ Proper navigation flow with auth guard  

---

## 🏗️ Project Structure

```
mobile/
├── app/                              # Expo Router (file-based routing)
│   ├── _layout.tsx                   # Root with auth provider & guard
│   ├── login.tsx                     # Parent login screen
│   ├── index.tsx                     # Splash/redirect
│   ├── ai-questions.tsx              # Modal AI quiz
│   └── (drawer)/                     # Protected drawer navigation
│       ├── _layout.tsx               # Drawer config
│       ├── dashboard.tsx             # Overview
│       ├── marks.tsx                 # Academics
│       ├── attendance.tsx            # Attendance tracking
│       ├── teachers.tsx              # Faculty directory
│       ├── events.tsx                # School calendar
│       ├── announcements.tsx         # News & updates
│       ├── fees.tsx                  # Payment management
│       └── profile.tsx               # Profile & logout
│
├── services/                         # API services (Fully Implemented)
│   ├── apiClient.ts                  # Axios with interceptors
│   ├── authService.ts                # Auth operations
│   ├── marksService.ts               # Marks API
│   ├── attendanceService.ts          # Attendance API
│   ├── announcementService.ts        # Announcements API
│   ├── financeService.ts             # Payments & fees API
│   ├── directoryService.ts           # Teachers & students API
│   ├── eventsService.ts              # Events API
│   ├── dashboardService.ts           # Dashboard aggregation
│   └── aiService.ts                  # AI questions
│
├── hooks/                            # Custom React hooks
│   ├── useAuth.tsx                   # Auth context & management
│   ├── useDashboard.ts               # Dashboard data hook
│   └── useStudentData.ts             # Centralized data fetching
│
├── components/                       # Reusable components
│   └── ui/
│       ├── Button.tsx                # Buttons
│       ├── Card.tsx                  # Cards & sections
│       ├── Feedback.tsx              # Loading, error, empty states
│       ├── Input.tsx                 # Text inputs
│       └── ProgressBar.tsx           # Progress indicators
│
├── utils/
│   ├── formatters.ts                 # Data formatting helpers
│   └── animations.ts                 # Animation utilities
│
├── constants/
│   └── Colors.ts                     # Design system
│
└── types/
    └── index.ts                      # TypeScript interfaces
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
└── app.json                     # Expo config (ArkenEdu branding, dark UI style)
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

### Dashboard (`/dashboard`)
- Time-based greeting + student name
- Hero stat cards: Overall Grade % + Attendance %
- Fee alerts — overdue/upcoming dues tapping into Payments
- Subject performance progress bars (top 5)
- Attendance breakdown (Present / Absent / Late counts)

### Announcements (`/announcements`)
- Filter tabs: All / Unread / Urgent
- Priority-accented cards with unread dot indicators
- Native modal to read full announcement
- Attachment links (open in browser via `Linking.openURL`)
- Pull-to-refresh

### Payments (`/fees`)
- Fee summary: total due + student name
- Category-level breakdown (Tuition, Transport, etc.)
- "Open UPI Payment Portal" CTA that deep-links to the web parent portal
  (`/parent/fee-pay`), where the parent submits the UTR / screenshot for
  admin verification
- "All Paid" celebration state

### Academics (`/marks`)
- Overall grade card with letter grade badge
- Subject grid (tap to expand test-level detail)
- Per-test scores with date + percentage
- Link to AI Question Generator

### Profile (`/profile`)
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
| AI questions | `POST /ai/generate-questions` |

All requests automatically include:
- `Authorization: Bearer <token>`
- `X-Institution-Id: <id>`
- `X-Portal-Role: <role>`

---

## 🎨 Design System

- **Theme:** Modern Neon (Pure White background)
- **Primary Accent:** Royal Blue `#2563eb`
- **Secondary Accent:** Cyan Neon `#06b6d4`
- **Card surface:** Pure White with Slate `#e2e8f0` borders
- **Fonts:** System default (Inter/San Francisco on iOS, Roboto on Android)
- **Corner radius:** 28–32px for premium "Bento" cards, 12–16px for inputs/buttons

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

## 🗂️ File Structure Decisions

- **No duplication of business logic** — all calculations stay on the backend
- **No CSS from web** — all styles are `StyleSheet.create()` optimised for native
- **Partial failures handled gracefully** — `Promise.allSettled` means one failing API call doesn't crash the whole dashboard
- **Protected routes** — `AuthGuard` in root layout redirects unauthenticated users before any screen renders

---

## 📚 Documentation

For more information, see:

- **[IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md)** - Complete technical overview and architecture
- **[PARENT_PORTAL_GUIDE.md](./PARENT_PORTAL_GUIDE.md)** - Feature parity checklist and code organization
- **[SETUP_AND_TESTING.md](./SETUP_AND_TESTING.md)** - Setup guide, testing procedures, and troubleshooting

---

## 🎯 Development Workflow

### Add a new endpoint

1. Create a service method in `services/myFeatureService.ts`
2. Import it in the screen component
3. Call it with `try-catch` in `useCallback`
4. Display loading, error, and data states

### Add a new screen

1. Create file in `app/(drawer)/myscreen.tsx`
2. Add to drawer config in `app/(drawer)/_layout.tsx`
3. Use `SafeAreaView` + `ScrollView` + consistent spacing
4. Follow existing patterns for data loading and error handling

### Update the API base URL

Edit `.env`:
```env
EXPO_PUBLIC_API_BASE_URL=https://your-api.com/api
```

Then restart the dev server.

---

## ✅ Production Readiness

- [x] All screens fully implemented with real data
- [x] No mock or placeholder data
- [x] Proper error handling and recovery
- [x] Loading and empty states
- [x] Mobile-optimized UI
- [x] Secure token management
- [x] Protected routes
- [x] TypeScript strict mode
- [x] Comprehensive documentation
- [x] Ready for iOS and Android deployment

---

## 🚀 Building for Production

### iOS (App Store)

```bash
# Create build
eas build --platform ios --auto-submit

# Distribute to TestFlight
# (automatic if --auto-submit is used)
```

### Android (Google Play)

```bash
# Create build  
eas build --platform android --auto-submit

# Distribute to Google Play
# (automatic if --auto-submit is used)
```

---

## 📞 Support & Troubleshooting

### Common Issues

**"Cannot GET /api/marks/..."**
- Verify backend is running
- Check API_BASE_URL in .env
- Check network connectivity

**Token expired errors**
- User needs to log in again
- This is expected behavior for security

**Data not loading**
- Check backend API response with curl
- Verify JWT token is valid
- Check X-Institution-Id header

**Slow performance**
- Check network speed
- Verify backend is optimized
- Profile with React Native Profiler

### Debug Mode

Open Expo Dev Menu (shake device or press `m` in terminal):
- View console logs
- Toggle element inspector
- Reload app
- Enable remote debugging

---

## 📋 Git Workflow

```bash
# Clone repo
git clone https://github.com/your-org/school-app.git
cd school-app/mobile

# Create feature branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "feat: Add new feature"

# Push and create PR
git push origin feature/my-feature
```

---

## 🎓 Learning Resources

- **Expo Router:** https://docs.expo.dev/router/introduction
- **React Native:** https://reactnative.dev/docs/getting-started
- **React Navigation:** https://reactnavigation.org/docs
- **TypeScript:** https://www.typescriptlang.org/docs/

---

## 📄 License

This project is part of the ArkenEdu school management system.

---

## 👥 Contributors

- **Mobile Development:** Senior React Native Engineer
- **Backend API:** Full-stack team
- **Design & UX:** Mobile-first approach

---

**Last Updated:** April 29, 2026  
**Version:** 1.0.0  
**Status:** ✅ Production Ready  

🎉 **The Parent Portal mobile app is complete, tested, and ready for deployment!**
