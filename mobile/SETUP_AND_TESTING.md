# Mobile App Setup & Testing Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI
- iOS Simulator / Android Emulator (or physical device)

### Installation

```bash
cd /Users/luffy/Desktop/SCHOOL/mobile

# Install dependencies
npm install

# OR with yarn
yarn install

# Install Expo CLI if not already installed
npm install -g expo-cli
```

### Environment Setup

Create a `.env` file in the mobile directory:

```env
API_BASE_URL=http://localhost:8000/api
# OR for production
API_BASE_URL=https://your-production-api.com/api
```

### Running the App

**Development Mode (Expo):**
```bash
npm start
# or
expo start
```

Then press:
- `i` - Run on iOS Simulator
- `a` - Run on Android Emulator
- `w` - Run in web browser
- `j` - Open debugger

**Production Build:**
```bash
eas build --platform ios
eas build --platform android
```

## 🧪 Testing Features

### 1. Authentication Flow

**Test Login:**
```bash
# Use valid parent credentials
- Parent Name: [From backend]
- Class: [Student's class]
- Section: [Student's section]
- DOB: [Student's DOB]
```

**Verify:**
- Token stored in secure storage
- User data persists after app restart
- Auto-redirect to dashboard on successful login
- Error message shown on invalid credentials

### 2. Dashboard Screen

**Visual Checks:**
- [ ] Greeting message shows time-appropriate text
- [ ] Student name and class display correctly
- [ ] Overall grade percentage calculated
- [ ] Attendance percentage shows correct color
- [ ] Fee alerts show (if applicable)
- [ ] Recent marks display
- [ ] Refresh button pulls latest data

### 3. Marks Screen

**Data Validation:**
- [ ] All marks loaded from backend
- [ ] Subjects listed with passing grades
- [ ] Overall % = average of all subjects
- [ ] Expanding subject shows individual test scores
- [ ] Grade badges show correct colors (A+, A, B+, etc.)
- [ ] Test dates format correctly

**Edge Cases:**
- [ ] Empty marks state shows message
- [ ] Error retry works
- [ ] Pull-to-refresh updates data

### 4. Attendance Screen

**Calculation Verification:**
```
Attendance % = (Present + Late) / Total * 100
```

**Test:**
- [ ] Attendance rate displayed
- [ ] Count breakdown (Present, Absent, Late, Excused)
- [ ] Color coding: Green (85%+), Orange (<85%), Red (<75%)
- [ ] Recent logs show date and status
- [ ] All statuses color-coded correctly

### 5. Teachers Screen

**Display:**
- [ ] Teacher name, subject, email display
- [ ] Avatar with first letter
- [ ] Email link clickable (opens mail)
- [ ] Phone/WhatsApp buttons functional (if available)
- [ ] Empty state if no teachers

### 6. Events Screen

**Functionality:**
- [ ] Events from backend load
- [ ] Date format: "Jan 15, 2024"
- [ ] Event types color-coded
- [ ] Event cards show title and description
- [ ] Error handling and empty states work

### 7. Announcements Screen

**Features to Test:**
- [ ] List of announcements loads
- [ ] Unread count badge shows
- [ ] Filter tabs (All, Unread, Urgent) work
- [ ] Card shows priority, teacher, date
- [ ] Tapping opens modal
- [ ] Modal shows full message
- [ ] Attachment links open correctly
- [ ] Mark as read works

### 8. Fees Screen

**Payment Flow:**
- [ ] Total due amount displays
- [ ] Fee breakdown shows all categories
- [ ] Amount input validates (max = due amount)
- [ ] Payment button triggers Razorpay flow
- [ ] Fully paid state shows when due = 0
- [ ] Paid status persists after refresh

### 9. Profile Screen

**Information Display:**
- [ ] User name and avatar
- [ ] Role displays correctly
- [ ] User details section complete
- [ ] Settings options available
- [ ] Logout button works
- [ ] Confirmation alert shows before logout
- [ ] Successfully clears tokens and navigates to login

### 10. Animations & UX

**Smooth Interactions:**
- [ ] Screen transitions animate smoothly
- [ ] Pull-to-refresh animation is fluid
- [ ] Card expansions feel responsive
- [ ] No console warnings or errors
- [ ] Loading states don't block UI
- [ ] Scrolling is smooth without jank

## 🔍 API Endpoint Verification

### Expected Endpoints

```
GET /marks/{student_id}
GET /attendance/{student_id}
GET /attendance/{student_id}/stats
GET /events
GET /directory/my-teachers
GET /announcements/my
GET /parent/fees
GET /finance/students/{student_id}/dues
POST /finance/payments/create-order
POST /finance/payments/verify
GET /dashboard
```

**Test with curl:**
```bash
# Get marks
curl -H "Authorization: Bearer {token}" \
     -H "X-Institution-Id: 1" \
     -H "X-Portal-Role: parent" \
     http://localhost:8000/api/marks/1

# Get attendance
curl -H "Authorization: Bearer {token}" \
     -H "X-Institution-Id: 1" \
     -H "X-Portal-Role: parent" \
     http://localhost:8000/api/attendance/1
```

## 🐛 Debugging

### Enable Debug Logging

In `services/apiClient.ts`, uncomment logging:
```typescript
// Uncomment for request logging
// console.log('[API Request]', config);
// console.log('[API Response]', response.data);
```

### Common Issues

| Issue | Solution |
|-------|----------|
| CORS errors | Ensure backend has CORS enabled |
| 401 Unauthorized | Token expired; user needs to login |
| 404 Not Found | API endpoint doesn't exist/wrong path |
| Network timeouts | Increase timeout in apiClient (currently 15s) |
| Blank screens | Check console for errors; verify data structure |

### Check App State

Open Expo debugger and inspect:
```javascript
// In Flipper or React Native debugger
AsyncStorage.getAllKeys() // For secure storage
// Check Redux DevTools if redux is used
```

## 📊 Performance Benchmarks

Target metrics:
- **First Paint:** < 2s
- **Interactive:** < 3s
- **Screen Navigation:** < 300ms
- **Data Load:** < 2s (depending on connection)
- **Scroll FPS:** 60 FPS

**Profiling:**
```bash
# React Native profiler
expo start --dev-client
# Then use React Profiler in Flipper
```

## 📋 Pre-Launch Checklist

### Code Quality
- [ ] No console.log statements (except errors)
- [ ] No TypeScript errors
- [ ] Proper error handling for all async calls
- [ ] No hardcoded values or URLs
- [ ] All strings are constants or i18n ready

### Functionality
- [ ] All 6 main screens working
- [ ] Login/logout flow tested
- [ ] Data persistence working
- [ ] Offline graceful degradation
- [ ] Error recovery working

### Mobile Specific
- [ ] Tested on iOS and Android
- [ ] Safe area padding correct
- [ ] No keyboard overlap issues
- [ ] Touch targets are 44px+
- [ ] Text is readable (min 14sp)

### Security
- [ ] No sensitive data in logs
- [ ] Token stored securely
- [ ] No passwords stored locally
- [ ] HTTPS enforced for API
- [ ] Input validation complete

### Performance
- [ ] App loads in < 3s
- [ ] Scroll smooth (60 FPS)
- [ ] No memory leaks
- [ ] Images optimized
- [ ] Bundle size reasonable

## 📞 Support & Troubleshooting

For issues:
1. Check this guide's debugging section
2. Review API response in browser DevTools
3. Check backend logs for errors
4. Verify backend API endpoints exist
5. Test with curl first, then mobile app

---

**Documentation Version:** 1.0
**Last Updated:** April 29, 2026
