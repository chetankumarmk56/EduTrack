import os
import sys
from datetime import date, time as dtime

# Add the current directory to sys.path so we can import from 'app'
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.core.security import get_password_hash

from app.models import (
    Institution, User, Student, Teacher, TeacherAssignment,
    Event, Subject, Grade, Section, SchoolClass as Classroom,
    Parent, SchedulePeriod, TimetableSlot,
)
from app.models.finance import StudentFee, StudentFeeStatus


# ─── idempotent helpers ───────────────────────────────────────────────────────

def get_or_create_user(db, email, name, password, role, institution_id=None):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            name=name,
            email=email,
            password_hash=get_password_hash(password),
            role=role,
            institution_id=institution_id,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"    + user  {email!r:45s} role={role}")
    return user


def get_or_create_grade(db, level, name, institution_id):
    g = db.query(Grade).filter(Grade.level == level, Grade.institution_id == institution_id).first()
    if not g:
        g = Grade(level=level, name=name, institution_id=institution_id)
        db.add(g)
        db.commit()
        db.refresh(g)
        print(f"    + grade {name}")
    return g


def get_or_create_section(db, name, grade_id, institution_id):
    sec = db.query(Section).filter(Section.name == name, Section.grade_id == grade_id).first()
    if not sec:
        sec = Section(name=name, grade_id=grade_id, institution_id=institution_id)
        db.add(sec)
        db.commit()
        db.refresh(sec)
    return sec


def get_or_create_classroom(db, grade_id, section_id, institution_id, display_name):
    clr = db.query(Classroom).filter(
        Classroom.grade_id == grade_id,
        Classroom.section_id == section_id,
    ).first()
    if not clr:
        clr = Classroom(
            grade_id=grade_id,
            section_id=section_id,
            institution_id=institution_id,
            display_name=display_name,
        )
        db.add(clr)
        db.commit()
        db.refresh(clr)
        print(f"    + classroom {display_name}")
    return clr


def get_or_create_subject(db, name, code, institution_id):
    sub = db.query(Subject).filter(Subject.name == name, Subject.institution_id == institution_id).first()
    if not sub:
        sub = Subject(name=name, code=code, institution_id=institution_id)
        db.add(sub)
        db.commit()
        db.refresh(sub)
    return sub


def get_or_create_teacher(db, email, name, password, institution_id, phone=None):
    u = get_or_create_user(db, email, name, password, "teacher", institution_id=institution_id)
    t = db.query(Teacher).filter(Teacher.user_id == u.id).first()
    if not t:
        t = Teacher(
            user_id=u.id,
            name=name,
            email=email,
            phone=phone,
            institution_id=institution_id,
            plain_password=password,
        )
        db.add(t)
        db.commit()
        db.refresh(t)
    return t


def get_or_create_assignment(db, teacher_id, class_id, subject_id, institution_id):
    a = db.query(TeacherAssignment).filter(
        TeacherAssignment.teacher_id == teacher_id,
        TeacherAssignment.school_class_id == class_id,
        TeacherAssignment.subject_id == subject_id,
    ).first()
    if not a:
        a = TeacherAssignment(
            teacher_id=teacher_id,
            school_class_id=class_id,
            subject_id=subject_id,
            institution_id=institution_id,
        )
        db.add(a)
    return a


def get_or_create_schedule_period(db, institution_id, name, period_type, order, start_t, end_t):
    sp = db.query(SchedulePeriod).filter(
        SchedulePeriod.institution_id == institution_id,
        SchedulePeriod.name == name,
    ).first()
    if not sp:
        sp = SchedulePeriod(
            institution_id=institution_id,
            name=name,
            period_type=period_type,
            order=order,
            start_time=start_t,
            end_time=end_t,
        )
        db.add(sp)
        db.commit()
        db.refresh(sp)
    return sp


def get_or_create_timetable_slot(db, institution_id, class_id, period_id, day_of_week, subject_id, teacher_id):
    slot = db.query(TimetableSlot).filter(
        TimetableSlot.school_class_id == class_id,
        TimetableSlot.schedule_period_id == period_id,
        TimetableSlot.day_of_week == day_of_week,
    ).first()
    if not slot:
        slot = TimetableSlot(
            institution_id=institution_id,
            school_class_id=class_id,
            schedule_period_id=period_id,
            day_of_week=day_of_week,
            subject_id=subject_id,
            teacher_id=teacher_id,
        )
        db.add(slot)
    return slot


def get_or_create_event(db, institution_id, title, date_str, **fields):
    evt = db.query(Event).filter(
        Event.institution_id == institution_id,
        Event.title == title,
        Event.date == date_str,
    ).first()
    if not evt:
        evt = Event(institution_id=institution_id, title=title, date=date_str, **fields)
        db.add(evt)
        db.commit()
        db.refresh(evt)
        flag = "holiday " if fields.get("is_holiday") else "event   "
        print(f"    + {flag} {title!r} on {date_str}")
    return evt


def get_or_create_student_fee(db, student_id, class_id, institution_id, total_amount, due_date):
    sf = db.query(StudentFee).filter(
        StudentFee.student_id == student_id,
        StudentFee.class_id == class_id,
    ).first()
    if not sf:
        sf = StudentFee(
            student_id=student_id,
            class_id=class_id,
            institution_id=institution_id,
            total_amount=total_amount,
            amount_paid=0.0,
            due_amount=total_amount,
            due_date=due_date,
            status=StudentFeeStatus.UNPAID,
        )
        db.add(sf)
    return sf


# ─── main seeder ─────────────────────────────────────────────────────────────

def seed_db():
    print("=" * 62)
    print("  EduTrack — Database Seeder")
    print("=" * 62)

    from app.core.database import sync_engine, Base
    Base.metadata.create_all(bind=sync_engine)

    environment = os.getenv("ENVIRONMENT", "dev").lower()
    is_prod     = environment == "prod"
    seed_demo   = os.getenv("SEED_DEMO_DATA", "false").lower() in ("true", "1", "yes")

    db = SessionLocal()
    try:
        # ── 1. SuperAdmin (always, every environment) ─────────────────────
        print("\n[1/8] SuperAdmin")
        sa_email    = os.getenv("SUPER_ADMIN_EMAIL",    "Chetan56")
        sa_password = os.getenv("SUPER_ADMIN_PASSWORD", "asdfghjkl")
        get_or_create_user(db, sa_email, "Global SuperAdmin", sa_password, "super_admin")

        if is_prod and not seed_demo:
            print("\n  Production seed complete — superadmin only.")
            print("  Set SEED_DEMO_DATA=true to also seed the demo school.\n")
            return

        if is_prod and seed_demo:
            print("\n  WARNING: SEED_DEMO_DATA=true — seeding demo school into PRODUCTION.")

        # ── 2. Demo institution ───────────────────────────────────────────
        print("\n[2/8] Institution & school admin")
        inst = db.query(Institution).filter(Institution.slug == "st-marys").first()
        if not inst:
            inst = Institution(
                name="St. Mary's Excellence Academy",
                slug="st-marys",
                is_active=True,
            )
            db.add(inst)
            db.commit()
            db.refresh(inst)
            print("    + institution  St. Mary's Excellence Academy")

        get_or_create_user(
            db, "admin@stmarys.edu", "School Admin", "Admin@123",
            "admin", institution_id=inst.id,
        )

        # ── 3. Academic structure ─────────────────────────────────────────
        print("\n[3/8] Grades, sections, classrooms")
        GRADE_LEVELS  = [8, 9, 10]
        SECTION_NAMES = ["A", "B", "C"]

        classrooms: dict = {}   # key "8-A" → Classroom
        grade_map:  dict = {}   # level → Grade

        for lvl in GRADE_LEVELS:
            g = get_or_create_grade(db, lvl, f"Grade {lvl}", inst.id)
            grade_map[lvl] = g
            for s_name in SECTION_NAMES:
                sec = get_or_create_section(db, s_name, g.id, inst.id)
                key = f"{lvl}-{s_name}"
                clr = get_or_create_classroom(db, g.id, sec.id, inst.id, key)
                classrooms[key] = clr

        print(f"    -> {len(classrooms)} classrooms ready")

        # ── 4. Subjects ───────────────────────────────────────────────────
        print("\n[4/8] Subjects")
        SUBJECT_DEFS = [
            ("Mathematics",     "MATH"),
            ("Physics",         "PHY"),
            ("Chemistry",       "CHEM"),
            ("English",         "ENG"),
            ("Computer Science","CS"),
            ("History",         "HIST"),
            ("Biology",         "BIO"),
            ("Hindi",           "HINDI"),
        ]
        subjects: dict = {}
        for s_name, s_code in SUBJECT_DEFS:
            subjects[s_name] = get_or_create_subject(db, s_name, s_code, inst.id)
        print(f"    -> {len(subjects)} subjects ready")

        # ── 5. Teachers (10 total, 3 Math) ────────────────────────────────
        print("\n[5/8] Teachers")
        # (email, name, password, phone, subject_name)
        TEACHER_DEFS = [
            ("rajesh.kumar@stmarys.edu",   "Rajesh Kumar",   "Teacher@123", "9876543210", "Mathematics"),
            ("anita.sharma@stmarys.edu",   "Anita Sharma",   "Teacher@123", "9876543211", "Mathematics"),
            ("priya.nair@stmarys.edu",     "Priya Nair",     "Teacher@123", "9876543212", "Mathematics"),
            ("suresh.patel@stmarys.edu",   "Suresh Patel",   "Teacher@123", "9876543213", "Physics"),
            ("meera.reddy@stmarys.edu",    "Meera Reddy",    "Teacher@123", "9876543214", "Chemistry"),
            ("arun.singh@stmarys.edu",     "Arun Singh",     "Teacher@123", "9876543215", "English"),
            ("deepa.menon@stmarys.edu",    "Deepa Menon",    "Teacher@123", "9876543216", "Computer Science"),
            ("vikram.iyer@stmarys.edu",    "Vikram Iyer",    "Teacher@123", "9876543217", "History"),
            ("kavitha.pillai@stmarys.edu", "Kavitha Pillai", "Teacher@123", "9876543218", "Biology"),
            ("mohan.das@stmarys.edu",      "Mohan Das",      "Teacher@123", "9876543219", "Hindi"),
        ]

        teacher_map:     dict = {}   # name -> Teacher
        teacher_subject: dict = {}   # name -> subject name

        for email, name, pwd, phone, subj_name in TEACHER_DEFS:
            t = get_or_create_teacher(db, email, name, pwd, inst.id, phone=phone)
            teacher_map[name]     = t
            teacher_subject[name] = subj_name

        # Math teachers are split by grade (one per grade level)
        math_teacher_by_grade: dict = {
            8:  "Rajesh Kumar",
            9:  "Anita Sharma",
            10: "Priya Nair",
        }

        print("\n    Assigning teachers to classrooms ...")
        for key, clr in classrooms.items():
            grade_level = int(key.split("-")[0])
            for tname, t in teacher_map.items():
                subj_name = teacher_subject[tname]
                sub = subjects[subj_name]
                if subj_name == "Mathematics":
                    if math_teacher_by_grade.get(grade_level) != tname:
                        continue
                get_or_create_assignment(db, t.id, clr.id, sub.id, inst.id)

        db.commit()
        print("    -> teacher assignments committed")

        # ── 6. Bell schedule + timetable slots ────────────────────────────
        print("\n[6/8] Timetable (9 AM - 4 PM)")
        # Institution-wide bell schedule: 7 teaching periods + 2 breaks + 1 lunch
        BELL = [
            # (name,             period_type,    order, start,          end)
            ("Period 1",         "class_period", 1,     dtime(9,  0),   dtime(9,  45)),
            ("Period 2",         "class_period", 2,     dtime(9, 45),   dtime(10, 30)),
            ("Morning Break",    "break",        3,     dtime(10, 30),  dtime(10, 45)),
            ("Period 3",         "class_period", 4,     dtime(10, 45),  dtime(11, 30)),
            ("Period 4",         "class_period", 5,     dtime(11, 30),  dtime(12, 15)),
            ("Lunch Break",      "lunch",        6,     dtime(12, 15),  dtime(13,  0)),
            ("Period 5",         "class_period", 7,     dtime(13,  0),  dtime(13, 45)),
            ("Period 6",         "class_period", 8,     dtime(13, 45),  dtime(14, 30)),
            ("Afternoon Break",  "break",        9,     dtime(14, 30),  dtime(14, 45)),
            ("Period 7",         "class_period", 10,    dtime(14, 45),  dtime(15, 30)),
        ]

        period_objs = []
        for name, ptype, order, start_t, end_t in BELL:
            sp = get_or_create_schedule_period(db, inst.id, name, ptype, order, start_t, end_t)
            period_objs.append(sp)

        teaching_periods = [p for p in period_objs if p.period_type == "class_period"]
        # 7 teaching periods per day

        # Weekly subject rotation per teaching period (0=Mon ... 4=Fri)
        # Each day has exactly 7 entries, one per teaching period.
        ROTATION = {
            0: ["Mathematics", "Physics",          "Chemistry",  "English",       "Biology",    "History",       "Hindi"],
            1: ["Physics",     "Mathematics",       "English",    "Chemistry",     "Hindi",      "Mathematics",   "Computer Science"],
            2: ["Mathematics", "Chemistry",         "Physics",    "Hindi",         "Mathematics","English",       "History"],
            3: ["Computer Science","English",       "Mathematics","Physics",       "Chemistry",  "Mathematics",   "Biology"],
            4: ["English",     "Mathematics",       "Hindi",      "Mathematics",   "Chemistry",  "Physics",       "Biology"],
        }

        slot_count = 0
        for key, clr in classrooms.items():
            grade_level = int(key.split("-")[0])
            math_t      = teacher_map[math_teacher_by_grade[grade_level]]

            for day in range(5):  # Mon-Fri
                for idx, period_obj in enumerate(teaching_periods):
                    subj_name = ROTATION[day][idx]
                    sub = subjects[subj_name]
                    if subj_name == "Mathematics":
                        teacher_obj = math_t
                    else:
                        teacher_obj = next(
                            (teacher_map[tn] for tn, ts in teacher_subject.items() if ts == subj_name),
                            None,
                        )
                    get_or_create_timetable_slot(
                        db, inst.id, clr.id, period_obj.id, day,
                        sub.id, teacher_obj.id if teacher_obj else None,
                    )
                    slot_count += 1

        db.commit()
        print(f"    -> {slot_count} timetable slots committed  (9 classes x 5 days x 7 periods)")

        # ── 7. Students (20 per section) + parents + fees ─────────────────
        print("\n[7/8] Students, parents & fees")
        STUDENT_FIRST_NAMES = [
            "Aarav",   "Vivaan",  "Aditya",  "Vihaan",  "Arjun",
            "Sai",     "Reyansh", "Ayaan",   "Dhruv",   "Kabir",
            "Ananya",  "Diya",    "Ishita",  "Saanvi",  "Priya",
            "Kavya",   "Riya",    "Shreya",  "Pooja",   "Neha",
        ]  # exactly 20 — one student per name per section
        GRADE_LAST_NAMES = {8: "Kumar", 9: "Sharma", 10: "Patel"}
        GRADE_FEE        = {8: 15_000.0, 9: 17_000.0, 10: 20_000.0}  # annual tuition
        FEE_DUE_DATE     = date(2025, 6, 30)

        new_students = 0
        for key, clr in classrooms.items():
            grade_level  = int(key.split("-")[0])
            section_name = key.split("-")[1]
            last_name    = GRADE_LAST_NAMES[grade_level]
            fee_amount   = GRADE_FEE[grade_level]

            for i, first_name in enumerate(STUDENT_FIRST_NAMES):
                tag       = f"g{grade_level}s{section_name.lower()}{i + 1:02d}"
                p_email   = f"parent.{tag}@stmarys.edu"
                s_email   = f"student.{tag}@stmarys.edu"
                full_name = f"{first_name} {last_name}"

                # Unique deterministic 10-digit phone per parent (no collisions across 180 students)
                phone_idx     = (
                    GRADE_LEVELS.index(grade_level) * len(SECTION_NAMES) * len(STUDENT_FIRST_NAMES)
                    + SECTION_NAMES.index(section_name) * len(STUDENT_FIRST_NAMES)
                    + i
                )
                primary_phone = f"9{phone_idx + 100_000_000:09d}"

                # Parent user + profile
                pu = get_or_create_user(
                    db, p_email, f"Parent of {full_name}", "Parent@123",
                    "parent", institution_id=inst.id,
                )
                p = db.query(Parent).filter(Parent.user_id == pu.id).first()
                if not p:
                    p = Parent(
                        user_id=pu.id,
                        institution_id=inst.id,
                        name=f"Parent of {full_name}",
                        email=p_email,
                        primary_phone=primary_phone,
                        relation="Guardian",
                    )
                    db.add(p)
                    db.commit()
                    db.refresh(p)

                # Student user + profile
                su = get_or_create_user(
                    db, s_email, full_name, "Student@123",
                    "student", institution_id=inst.id,
                )
                st = db.query(Student).filter(Student.user_id == su.id).first()
                if not st:
                    base_year = 2012 - (grade_level - 8)
                    dob_str   = f"{base_year}-{(i % 12) + 1:02d}-{(i % 28) + 1:02d}"
                    st = Student(
                        user_id=su.id,
                        name=full_name,
                        dob=dob_str,
                        school_class_id=clr.id,
                        institution_id=inst.id,
                        parent_id=p.id,
                        plain_password="Student@123",
                    )
                    db.add(st)
                    db.commit()
                    db.refresh(st)
                    new_students += 1

                get_or_create_student_fee(db, st.id, clr.id, inst.id, fee_amount, FEE_DUE_DATE)

        db.commit()
        total_expected = len(GRADE_LEVELS) * len(SECTION_NAMES) * len(STUDENT_FIRST_NAMES)
        print(f"    -> {new_students} new students created  ({total_expected} total across 9 sections)")
        print(f"    -> StudentFee records seeded  (due {FEE_DUE_DATE}, status=UNPAID)")

        # ── 8. Events ─────────────────────────────────────────────────────
        print("\n[8/8] Events")
        ALL_ROLES  = {"teacher": True, "parent": True, "student": True}
        STAFF_ONLY = {"teacher": True, "parent": True, "student": False}

        EVENTS = [
            # title                       type       category   date           end_date       time    location               is_holiday visibility
            ("Independence Day",          "holiday", "National","2025-08-15",  None,          "00:00","School Premises",     True,  ALL_ROLES),
            ("Gandhi Jayanti",            "holiday", "National","2025-10-02",  None,          "00:00","School Premises",     True,  ALL_ROLES),
            ("Diwali Vacation",           "holiday", "Festival","2025-10-20",  "2025-10-25",  "00:00","School Premises",     True,  ALL_ROLES),
            ("Republic Day",              "holiday", "National","2026-01-26",  None,          "00:00","School Premises",     True,  ALL_ROLES),
            ("Holi",                      "holiday", "Festival","2026-03-13",  None,          "00:00","School Premises",     True,  ALL_ROLES),
            ("Christmas",                 "holiday", "Festival","2025-12-25",  None,          "00:00","School Premises",     True,  ALL_ROLES),
            ("Annual Sports Day",         "sports",  "Sports",  "2025-12-05",  None,          "09:00","School Grounds",      False, ALL_ROLES),
            ("Parent-Teacher Meeting",    "meeting", "Academic","2025-09-27",  None,          "10:00","School Hall",         False, STAFF_ONLY),
            ("Mid-term Examinations",     "exam",    "Academic","2025-10-07",  "2025-10-11",  "09:00","Examination Hall",    False, ALL_ROLES),
            ("Annual Day Celebration",    "general", "Cultural","2026-02-14",  None,          "17:00","School Auditorium",   False, ALL_ROLES),
            ("Science Exhibition",        "general", "Academic","2025-11-15",  None,          "10:00","School Hall",         False, ALL_ROLES),
            ("Final Examinations",        "exam",    "Academic","2026-03-01",  "2026-03-15",  "09:00","Examination Hall",    False, ALL_ROLES),
        ]

        for title, etype, category, date_str, end_date, time_str, location, is_holiday, visibility in EVENTS:
            get_or_create_event(
                db, inst.id, title, date_str,
                description=f"{title} — St. Mary's school calendar.",
                type=etype,
                category=category,
                end_date=end_date,
                time=time_str,
                location=location,
                is_holiday=is_holiday,
                visibility=visibility,
            )

        db.commit()
        print(f"    -> {len(EVENTS)} events seeded  (6 holidays, 2 exams, 1 sports, 1 meeting, 2 general)")

        # ── Summary ───────────────────────────────────────────────────────
        print()
        print("=" * 62)
        print("  Seeding complete!")
        print("=" * 62)
        print(f"  Institution : St. Mary's Excellence Academy  (slug=st-marys)")
        print(f"  SuperAdmin  : {sa_email!r}  /  {sa_password!r}")
        print(f"  Admin       : admin@stmarys.edu  /  Admin@123")
        print(f"  Grades      : 8, 9, 10  x  sections A, B, C  =  9 classrooms")
        print(f"  Subjects    : {len(subjects)}")
        print(f"  Teachers    : {len(TEACHER_DEFS)}  (3 Math, 1 each for the rest)")
        print(f"  Timetable   : {slot_count} slots  (Mon-Fri, 09:00-15:30)")
        print(f"  Students    : 20 / section  =  {total_expected} total")
        print(f"  Fees        : Rs 15000 / 17000 / 20000 per grade, due {FEE_DUE_DATE}")
        print(f"  Events      : {len(EVENTS)}  (holidays + exams + sports + meetings)")
        print()

    except Exception as e:
        db.rollback()
        print(f"\n  Seeding failed: {e}")
        raise
    finally:
        db.close()


def run_migrations():
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect
    from app.core.database import sync_engine

    here = os.path.dirname(os.path.abspath(__file__))
    cfg  = Config(os.path.join(here, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(here, "alembic"))

    inspector = inspect(sync_engine)
    existing  = set(inspector.get_table_names())
    if "alembic_version" not in existing and "institutions" in existing:
        print("[migrations] Legacy schema detected — stamping at c9f8a1b2e3d4 before upgrade.")
        command.stamp(cfg, "c9f8a1b2e3d4")

    command.upgrade(cfg, "head")


if __name__ == "__main__":
    run_migrations()
    seed_db()
