# System Architecture & Feature Analysis

## 1️⃣ SYSTEM OVERVIEW

### Technology Stack
- **Backend**: FastAPI 0.110.0, SQLAlchemy 2.0 async ORM, PostgreSQL (Neon)
- **Frontend**: React 18 + TypeScript, Vite, React Router v6
- **Auth**: JWT + HttpOnly Cookies, roles: student, parent, teacher, admin, super_admin, finance
- **Payments**: Razorpay integration (with mock mode support)

### Multi-Portal Architecture
| Portal | Role | Access Level |
|--------|------|--------------|
| Parent Portal | parent | View child payments, attendance, marks, announcements |
| Teacher Portal | teacher | Create marks, mark attendance, post announcements |
| Admin Portal | admin | Manage institution, users, fees |
| SuperAdmin Portal | super_admin | System-wide administration |
| Student | student | View own data (limited) |
| Finance | finance | Payment admin role |

---

## 2️⃣ CORE FEATURES & DATA FLOWS

### Feature 1: AUTHENTICATION
**Routes**: POST `/api/auth/login`, POST `/api/auth/refresh`
**Models**: User, Institution
**Key Logic**:
- Cookie: `edu_refresh_{role}_{user_id}` (path="/api/auth/refresh")
- JWT validation: extract user_id from `sub` claim
- HttpOnly cookie prevents XSS access to tokens

**Data Flow**:
1. Login: verify credentials → create JWT → store refresh in cookie → return access token
2. Refresh: decode cookie → validate JWT signature → extract user_id → issue new token
3. Session: JWT in memory, refresh cookie in storage (browser-only)

**Multi-Login Fix** (PHASE 2):
- Cookie isolation by user_id prevents session collision
- Two teachers same role now have separate sessions
- JWT validation ensures token ownership

---

### Feature 2: PAYMENT SYSTEM (Razorpay)
**Routes**: 
- GET `/api/finance/students/{student_id}/dues` - Student dues
- POST `/api/finance/payments/create-order` - Create Razorpay order
- POST `/api/finance/payments/verify` - Verify payment
- Webhook: `/api/finance/webhook/razorpay` - Webhook notification

**Models**: Payment, StudentFee, PaymentAllocation, FeeStructure

**Tables**:
- `payments`: Master payment record (student_id, amount, status, razorpay_order_id, etc.)
- `student_fees`: Fee tracking per class (student_id, class_id, total_amount, amount_paid, status)
- `fee_structure`: Fee categories (student_id, fee_type, total_amount, paid_amount)
- `payment_allocations`: Distributed amounts across fees
- `payment_transactions`: Granular transaction logs

**Key Logic**:
1. **Order Creation**:
   - Detect mock mode (placeholder keys)
   - Call Razorpay API → get order_id
   - Save PENDING payment record

2. **Payment Verification**:
   - Find payment by order_id
   - Verify signature (or skip if mock)
   - Mark as SUCCESS
   - Trigger allocation logic
   - Update StudentFee

3. **Payment Allocation**:
   - Get fees sorted by priority
   - Distribute amount across fees (FIFO)
   - Update each fee's paid_amount and status
   - Create PaymentAllocation records

4. **Webhook Processing**:
   - Razorpay posts payment.authorized event
   - Verify webhook signature
   - Trigger capture and allocation

**Data Integrity**:
- Idempotent operations prevent duplicate charges
- Locking prevents race conditions
- Signature verification prevents fraud

---

### Feature 3: MARKS / REPORT CARD
**Routes**:
- POST `/api/marks/` - Record single mark
- POST `/api/marks/batch` - Batch record marks
- GET `/api/marks/{student_id}` - Student marks
- GET `/api/marks/subject/{subject}` - Class marks by subject
- POST `/api/marks/exams` - Create exam

**Models**: Mark, Exam, Student, Teacher

**Tables**:
- `marks`: Individual mark (student_id, exam_id, subject, score, max_score, teacher_id)
- `exams`: Assessment definition (name, date, term, school_class_id, subject_id)

**Key Logic**:
1. **Recording Mark**:
   - Validate student exists
   - Validate teacher assigned to class
   - Check for duplicate (update if exists)
   - Clamp score (0-max_score)

2. **Batch Recording**:
   - Loop through records
   - Validate each student-teacher-class relationship
   - Upsert (update if exists, create if new)
   - Single commit for all

3. **Viewing**:
   - Student/Parent: see own marks grouped by subject
   - Teacher: see class marks
   - Admin/Finance: see all

**Data Security**:
- Teacher can only record for assigned classes
- Student/Parent can only view own marks

---

### Feature 4: ATTENDANCE
**Routes**:
- POST `/api/attendance/` - Mark single attendance
- POST `/api/attendance/batch` - Batch mark attendance
- GET `/api/attendance/{student_id}` - Student attendance
- GET `/api/attendance/class/{school_class_id}/{date}` - Class attendance

**Models**: Attendance, Student, Teacher

**Tables**:
- `attendance`: Per-student per-date record (student_id, date, status, subject, school_class_id)

**Key Logic**:
1. **Marking Attendance**:
   - Validate student exists
   - Validate teacher assigned to class
   - Check for duplicate (update if exists)
   - Status: Present/Absent/Late

2. **Batch Marking**:
   - All records for same class, same date, same subject
   - Upsert logic (prevent duplicates)
   - Single commit

3. **Viewing**:
   - Parent/Student: see attendance with stats (present %, total days, etc.)
   - Teacher: see class attendance by date

**Data Integrity**:
- No duplicate entries per (student, date, subject)
- Immutable once submitted (update not delete)

---

### Feature 5: ANNOUNCEMENTS
**Routes**:
- POST `/api/announcements/` - Create announcement
- GET `/api/announcements/my` - Get relevant announcements
- GET `/api/announcements/teacher/{teacher_id}` - Teacher's announcements (with engagement stats)
- GET `/api/announcements/parent/{parent_id}` - Announcements for parent's children
- POST `/api/announcements/{id}/read` - Mark as read

**Models**: Announcement, AnnouncementRead, Teacher, Parent, Student

**Tables**:
- `announcements`: Announcement (teacher_id, title, message, type, class_id, student_id, attachment_url)
- `announcement_reads`: Read status (parent_id/user_id, announcement_id)

**Announcement Types**:
- CLASS: visible to parent if child in that class
- STUDENT: visible to parent/student if their child/self
- BROADCAST: visible to all in institution

**Key Logic**:
1. **Creation**:
   - Teacher specifies type (CLASS/STUDENT)
   - If CLASS: enters class_id
   - If STUDENT: enters student_id
   - Optionally upload attachment

2. **Visibility**:
   - Parent sees announcements for children's classes + BROADCAST
   - Student sees announcements for own class + own student announcements
   - Teacher sees own announcements (with metrics)

3. **Read Status**:
   - Each parent views → create AnnouncementRead record
   - UI marks as "read" if record exists

4. **Engagement Metrics**:
   - Read count: count of AnnouncementRead records
   - Target count: count of parents in class
   - Engagement rate: read_count / target_count

**Data Flow**:
- Teacher creates → stored in announcements
- Parent accesses → visibility query checks role + relationships
- Parent views → AnnouncementRead created

---

## 3️⃣ CRITICAL DATA RELATIONSHIPS

### User Roles & Relationships
```
User (email, password_hash, role)
  ├─ Teacher (teacher_profile) → TeacherAssignment (school_class_id)
  ├─ Parent (parent_profile) → Student (ward)
  └─ Student (student_profile) → Parent (parent_id)
```

### Finance Data Chain
```
Student → StudentFee → Payment → PaymentAllocation
              ↓
        FeeStructure
```

### Marks Data Chain
```
Student → Mark ← Teacher
            ↓
          Exam ← Subject
```

### Attendance Data Chain
```
Student → Attendance
            ↓
        SchoolClass, Subject
```

---

## 4️⃣ KNOWN ISSUES & FIXES

### Issue 1: Multi-Login Session Collision (FIXED ✅)
- **Before**: Cookie `edu_refresh_{role}` shared by all users with same role
- **After**: Cookie `edu_refresh_{role}_{user_id}` unique per user
- **Impact**: Multiple teachers same role now have independent sessions

### Issue 2: Debug Code Removed (FIXED ✅)  
- **Before**: `print("[DEBUG] Request...")` on every request
- **After**: Removed, using logger instead
- **Impact**: Performance + security improvement

### Issue 3: Service Print Statements (FIXED ✅)
- **Before**: print() in storage, finance, ai services
- **After**: logger.error()/logger.warning()
- **Impact**: Proper error tracking with log levels

---

## 5️⃣ TEST PLAN

### Test 1: Authentication
- [ ] Parent login (student + DOB)
- [ ] Teacher login (email)
- [ ] Admin login (email)
- [ ] Multi-login same role (no collision)
- [ ] Token refresh works
- [ ] 401 handling correct
- [ ] Logout clears storage

### Test 2: Payment System
- [ ] Create order (mock mode)
- [ ] Verify payment (mock mode)
- [ ] Payment marked SUCCESS
- [ ] StudentFee updated with amount
- [ ] Payment allocation created
- [ ] Multiple payments accumulate correctly
- [ ] Webhook processing

### Test 3: Marks
- [ ] Teacher records mark for own class
- [ ] Teacher cannot record for other classes
- [ ] Parent views child's marks
- [ ] Student views own marks
- [ ] Duplicate prevention (upsert)
- [ ] Batch recording

### Test 4: Attendance
- [ ] Teacher marks attendance for own class
- [ ] Teacher cannot mark for other classes
- [ ] Parent views child's attendance with stats
- [ ] No duplicate per (student, date, subject)
- [ ] Batch marking

### Test 5: Announcements
- [ ] Teacher creates CLASS announcement
- [ ] Parent visibility correct (children only)
- [ ] Teacher views engagement metrics
- [ ] AnnouncementRead tracked
- [ ] Broadcast announcement visibility

---

## 6️⃣ EDGE CASES TO CHECK

### Auth
- Expired token → refresh → get new token
- Invalid refresh token in cookie → 401
- Cookie with user_id not matching JWT
- Rapid refresh requests (queue handling)

### Payments
- Multiple payments for same student
- Partial payment (amount < dues)
- Full payment (amount = dues)
- Over-payment (amount > dues)
- Webhook duplicate (idempotency)

### Marks
- Same mark recorded twice (should update)
- Score > max_score (should clamp)
- Teacher recording for unassigned class (should fail)
- Exam with multiple marks per student

### Attendance
- Duplicate attendance same day/subject (should update)
- Status changes (Present → Absent)
- Week/month filtering

### Announcements
- Announcement for class with no students
- Parent with multiple children
- Read status toggle
- Engagement metrics accuracy

---

## 7️⃣ DEPLOYMENT READINESS CHECKLIST

- [ ] No debug print statements (DONE)
- [ ] Logger properly configured
- [ ] Database migrations applied
- [ ] Razorpay keys configured (or mock mode)
- [ ] Authentication working across portals
- [ ] Payment flow end-to-end verified
- [ ] Cross-portal permissions enforced
- [ ] Error handling comprehensive
- [ ] Performance acceptable
- [ ] No N+1 queries

