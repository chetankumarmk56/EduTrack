import random
import os
import sys
from datetime import datetime, timedelta

# Add the current directory to sys.path so we can import from 'app'
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.core.security import get_password_hash

# Centralized model imports
from app.models import (
    Institution, User, Student, Teacher, TeacherAssignment, 
    Mark, Attendance, Event, Subject, Grade, Section, SchoolClass as Classroom,
    Parent, Exam, Announcement
)

def get_or_create_user(db, email, name, password, role, institution_id=None):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            name=name,
            email=email,
            password_hash=get_password_hash(password),
            role=role,
            institution_id=institution_id,
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"Created User: {email} | password: {password}")
    return user

def seed_db():
    print("🚀 Initializing Relational Database Seeding Upgrade...")
    db = SessionLocal()
    
    try:
        # 0. Initial Institution
        inst = db.query(Institution).filter(Institution.slug == "st-marys").first()
        if not inst:
            inst = Institution(
                name="St. Mary's Excellence Academy",
                slug="st-marys",
                is_active=True
            )
            db.add(inst)
            db.commit()
            db.refresh(inst)
            print("🏢 Created default Institution: St. Mary's Excellence Academy")

        # 0.1 Admin Users
        get_or_create_user(db, "Chetan56", "Global SuperAdmin", "asdfghjkl", "super_admin")
        get_or_create_user(db, "admin@stmarys.edu", "School Admin", "admin123", "admin", institution_id=1)
        
        # 1. Academic Structure (Grades & Sections)
        grade_levels = [8, 9, 10]
        sections_list = ["A", "B", "C"]
        
        grades = {}
        sections = {} # Use a tuple key (grade_lvl, section_name) for unique mapping
        classrooms = []

        for lvl in grade_levels:
            # Get or create Grade
            g = db.query(Grade).filter(Grade.level == lvl, Grade.institution_id == inst.id).first()
            if not g:
                g = Grade(level=lvl, name=f"Grade {lvl}", institution_id=inst.id)
                db.add(g)
                db.commit()
                db.refresh(g)
            grades[lvl] = g
            
            # Create unique sections for this grade
            for s_name in sections_list:
                sec = db.query(Section).filter(Section.name == s_name, Section.grade_id == g.id).first()
                if not sec:
                    sec = Section(name=s_name, grade_id=g.id, institution_id=inst.id)
                    db.add(sec)
                    db.commit()
                    db.refresh(sec)
                sections[(lvl, s_name)] = sec

                # Create Classroom for this Grade+Section
                clr = db.query(Classroom).filter(
                    Classroom.grade_id == g.id, 
                    Classroom.section_id == sec.id
                ).first()
                if not clr:
                    clr = Classroom(
                        grade_id=g.id, 
                        section_id=sec.id, 
                        institution_id=inst.id,
                        display_name=f"{lvl}-{s_name}"
                    )
                    db.add(clr)
                classrooms.append(clr)
        
        db.commit()
        print(f"📐 Academic structure ready: {len(classrooms)} classrooms created.")

        # 2. Subjects
        subject_data = [
            ("Mathematics", "MATH"), ("Physics", "PHYS"), ("Chemistry", "CHEM"),
            ("Biology", "BIO"), ("History", "HIST"), ("Geography", "GEOG"),
            ("English", "ENG"), ("Computer Science", "COMP")
        ]
        subjects = {}
        for s_name, s_code in subject_data:
            sub = db.query(Subject).filter(Subject.name == s_name, Subject.institution_id == inst.id).first()
            if not sub:
                sub = Subject(name=s_name, code=s_code, institution_id=inst.id)
                db.add(sub)
                db.commit()
                db.refresh(sub)
            subjects[s_name] = sub
        print(f"📚 Subjects ready: {len(subjects)} created.")

        # 3. Teachers
        teachers = []
        for s_name, sub_obj in subjects.items():
            t_email = f"teacher.{sub_obj.code.lower()}@school.edu"
            u = get_or_create_user(db, t_email, f"Prof. {s_name}", "teacher123", "teacher", institution_id=inst.id)
            
            t = db.query(Teacher).filter(Teacher.user_id == u.id).first()
            if not t:
                t = Teacher(
                    user_id=u.id,
                    name=u.name,
                    email=u.email,
                    phone=f"9876543{random.randint(100, 999)}",
                    institution_id=inst.id
                )
                db.add(t)
                db.commit()
                db.refresh(t)
            teachers.append(t)
            
            # Create assignments (Assigned to all classrooms for this subject demo)
            for room in classrooms:
                assign = db.query(TeacherAssignment).filter(
                    TeacherAssignment.teacher_id == t.id,
                    TeacherAssignment.school_class_id == room.id
                ).first()
                if not assign:
                    assign = TeacherAssignment(
                        teacher_id=t.id,
                        school_class_id=room.id,
                        subject_id=sub_obj.id,
                        institution_id=inst.id
                    )
                    db.add(assign)
        db.commit()
        print(f"👨‍🏫 Teachers and assignments ready: {len(teachers)} created.")

        # 4. Exams
        exam_names = ["First Unit Test", "Midterm Examination", "Final Finals"]
        exams = {}
        for e_name in exam_names:
            ex = db.query(Exam).filter(Exam.name == e_name, Exam.institution_id == inst.id).first()
            if not ex:
                ex = Exam(name=e_name, institution_id=inst.id, term="Term 1")
                db.add(ex)
                db.commit()
                db.refresh(ex)
            exams[e_name] = ex
        print(f"📝 Exams ready: {len(exams)} created.")

        # 5. Students & Parents
        first_names = ["Arjun", "Ananya", "Bhuvan", "Chetan", "Deepa", "Eshan", "Farheen", "Gautam", "Hina", "Ishaan", "Jiya", "Karan"]
        last_names = ["Sharma", "Verma", "Reddy", "Patel", "Singh", "Nair"]
        
        for room in classrooms:
            # Check if room already has students
            if db.query(Student).filter(Student.school_class_id == room.id).count() == 0:
                for i in range(4): # 4 students per classroom
                    fname = random.choice(first_names)
                    lname = random.choice(last_names)
                    s_name = f"{fname} {lname}"
                    s_code = f"{room.display_name.replace('-','')}{i}"
                    s_email = f"student.{s_code.lower()}@school.edu"
                    p_email = f"parent.{s_code.lower()}@school.edu"
                    
                    # Parent
                    pu = get_or_create_user(db, p_email, f"Mr/Ms {lname}", "parent123", "parent", institution_id=inst.id)
                    p = db.query(Parent).filter(Parent.user_id == pu.id).first()
                    if not p:
                        p = Parent(user_id=pu.id, phone=f"99000{random.randint(10000, 99999)}", relation=random.choice(["Father", "Mother", "Guardian"]), institution_id=inst.id)
                        db.add(p)
                        db.commit()
                        db.refresh(p)
                    
                    # Student
                    su = get_or_create_user(db, s_email, s_name, "student123", "student", institution_id=inst.id)
                    s = Student(
                        user_id=su.id,
                        name=s_name,
                        dob=(datetime.now() - timedelta(days=365*random.randint(13, 16))).strftime("%Y-%m-%d"),
                        parent_id=p.id,
                        school_class_id=room.id,
                        institution_id=inst.id
                    )
                    db.add(s)
                    db.commit()
                    db.refresh(s)
                    
                    # 6. Marks & Attendance (Historical)
                    # Attendance for last 14 days
                    for day in range(14):
                        date_obj = datetime.now() - timedelta(days=day)
                        # Skip Sundays
                        if date_obj.weekday() == 6: continue
                        
                        date_str = date_obj.strftime("%Y-%m-%d")
                        # Random split subjects for attendance
                        for sub_name in random.sample(list(subjects.keys()), 2):
                            sub_obj = subjects[sub_name]
                            att = Attendance(
                                student_id=s.id,
                                date=date_str,
                                status=random.choices(["Present", "Absent"], weights=[90, 10])[0],
                                school_class_id=room.id,
                                subject_id=sub_obj.id,
                                institution_id= inst.id
                            )
                            db.add(att)
                    
                    # Marks (Midterm and Unit Tests)
                    for sub_name, sub_obj in subjects.items():
                        for ex_name, ex_obj in exams.items():
                            mark = Mark(
                                student_id=s.id,
                                exam_id=ex_obj.id,
                                subject_id=sub_obj.id,
                                score=random.randint(35, 100),
                                max_score=100,
                                institution_id=inst.id
                            )
                            db.add(mark)
                db.commit()
        print("🎒 Students, Parents, Marks, and Attendance populated.")

        # 7. Announcements
        announcements = [
            ("School Reopening", "Welcome back! Classes resume from Monday.", "all"),
            ("New Lab Equipment", "We've upgraded the Physics lab with new sensors.", "teacher"),
            ("Annual Sports Day", "Join us for the 10th Annual Sports Meet this Saturday.", "all"),
            ("Fee Payment Reminder", "Q3 tuition fees are due by the end of this week.", "parent"),
            ("Faculty Briefing", "All staff meeting in the auditorium at 3 PM today.", "teacher")
        ]
        for title, msg, target in announcements:
            if not db.query(Announcement).filter(Announcement.title == title).first():
                ann = Announcement(
                    title=title,
                    message=msg,
                    audience=target,
                    institution_id=inst.id,
                    created_by_id=user.id if (user := db.query(User).filter(User.role == "super_admin").first()) else None
                )
                db.add(ann)
        db.commit()
        print("📢 Announcements seeded.")

        # 8. Events
        events = [
            ("Independence Day", "Flag hoisting and cultural program.", "holiday", datetime.now().strftime("%Y-08-15"), "08:00", "Main Ground"),
            ("Sports Meet 2026", "Inter-house athletic competitions.", "sports", (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d"), "09:00", "State Athletic Stadium"),
            ("Teacher Seminar", "Workshop on pedagogical advancements.", "meeting", (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d"), "14:00", "Conference Hall"),
            ("Quarterly Exam", "Mid-term evaluations for all grades.", "exam", (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d"), "10:00", "Examination Cell")
        ]
        for title, desc, etype, edate, etime, loc in events:
            if not db.query(Event).filter(Event.title == title).first():
                evt = Event(
                    title=title,
                    description=desc,
                    type=etype,
                    date=edate,
                    time=etime,
                    location=loc,
                    institution_id=inst.id
                )
                db.add(evt)
        db.commit()
        print("📅 Events seeded.")

        print("\n🏆 --- COMPREHENSIVE SEEDING COMPLETE ---")
        print("Login with:")
        print("  Admin: admin@stmarys.edu | admin123")
        print("  Teacher: teacher.math@school.edu | teacher123")
        print("  Parent: parent.8a0.lower@school.edu | parent123")

    except Exception as e:
        db.rollback()
        print(f"❌ Error during seeding: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
