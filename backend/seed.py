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
    Parent, Exam, Announcement, FeeStructure, Payment, PaymentAllocation
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

def get_or_create_grade(db, level, name, institution_id):
    g = db.query(Grade).filter(Grade.level == level, Grade.institution_id == institution_id).first()
    if not g:
        g = Grade(level=level, name=name, institution_id=institution_id)
        db.add(g)
        db.commit()
        db.refresh(g)
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
    clr = db.query(Classroom).filter(Classroom.grade_id == grade_id, Classroom.section_id == section_id).first()
    if not clr:
        clr = Classroom(grade_id=grade_id, section_id=section_id, institution_id=institution_id, display_name=display_name)
        db.add(clr)
        db.commit()
        db.refresh(clr)
    return clr

def get_or_create_subject(db, name, code, institution_id):
    sub = db.query(Subject).filter(Subject.name == name, Subject.institution_id == institution_id).first()
    if not sub:
        sub = Subject(name=name, code=code, institution_id=institution_id)
        db.add(sub)
        db.commit()
        db.refresh(sub)
    return sub

def seed_db():
    print("🚀 Initializing Relational Database Seeding Upgrade...")
    from app.core.database import sync_engine, Base
    Base.metadata.create_all(bind=sync_engine)

    is_prod = os.getenv("ENVIRONMENT", "dev").lower() == "prod"

    db = SessionLocal()

    try:
        # SuperAdmin always seeded — without it nobody can bootstrap institutions.
        # Production override: SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD env vars.
        sa_email = os.getenv("SUPER_ADMIN_EMAIL", "Chetan56")
        sa_password = os.getenv("SUPER_ADMIN_PASSWORD", "asdfghjkl")
        get_or_create_user(db, sa_email, "Global SuperAdmin", sa_password, "super_admin")

        if is_prod:
            print("✅ Production seed complete — super_admin only, no demo data.")
            return

        # --- Demo data below this line runs only in dev/test ---

        # 0. Initial Institution
        inst = db.query(Institution).filter(Institution.slug == "st-marys").first()
        if not inst:
            inst = Institution(name="St. Mary's Excellence Academy", slug="st-marys", is_active=True)
            db.add(inst)
            db.commit()
            db.refresh(inst)
            print("🏢 Created default Institution")

        # 0.1 Demo Admin Users
        get_or_create_user(db, "admin@stmarys.edu", "School Admin", "admin123", "admin", institution_id=1)
        
        # 1. Academic Structure
        grade_levels = [8, 9, 10]
        sections_list = ["A", "B", "C"]
        classrooms = []

        for lvl in grade_levels:
            g = get_or_create_grade(db, lvl, f"Grade {lvl}", inst.id)
            for s_name in sections_list:
                sec = get_or_create_section(db, s_name, g.id, inst.id)
                clr = get_or_create_classroom(db, g.id, sec.id, inst.id, f"{lvl}-{s_name}")
                classrooms.append(clr)
        print(f"🏫 Academic structure ready: {len(classrooms)} classrooms created.")
        
        # 2. Subjects
        subject_data = [("Mathematics", "MATH"), ("Physics", "PHYS"), ("English", "ENG"), ("Computer Science", "COMP")]
        subjects = {s_name: get_or_create_subject(db, s_name, s_code, inst.id) for s_name, s_code in subject_data}
        print(f"📚 Subjects ready: {len(subjects)} created.")

        # 3. Teachers
        for s_name, sub_obj in subjects.items():
            u = get_or_create_user(db, f"teacher.{sub_obj.code.lower()}@school.edu", f"Prof. {s_name}", "teacher123", "teacher", institution_id=inst.id)
            t = db.query(Teacher).filter(Teacher.user_id == u.id).first()
            if not t:
                t = Teacher(user_id=u.id, name=u.name, email=u.email, institution_id=inst.id)
                db.add(t)
                db.commit()
                db.refresh(t)
            
            for room in classrooms:
                if not db.query(TeacherAssignment).filter(TeacherAssignment.teacher_id == t.id, TeacherAssignment.school_class_id == room.id).first():
                    db.add(TeacherAssignment(teacher_id=t.id, school_class_id=room.id, subject_id=sub_obj.id, institution_id=inst.id))
        db.commit()
        print(f"👨‍🏫 Teachers and assignments ready: {len(subjects)} created.")

        # 4. Exams
        exams = {e: db.query(Exam).filter(Exam.name == e).first() or db.add(Exam(name=e, institution_id=inst.id, term="Term 1")) or db.commit() or db.query(Exam).filter(Exam.name == e).first() 
                 for e in ["Midterm", "Finals"]}
        db.commit()
        print(f"📝 Exams ready: {len(exams)} created.")

        # 5. Students & Parents
        for room in classrooms:
            if db.query(Student).filter(Student.school_class_id == room.id).count() < 2:
                for i in range(2):
                    s_code = f"{room.display_name.replace('-','')}{i}"
                    p_email, s_email = f"parent.{s_code.lower()}@school.edu", f"student.{s_code.lower()}@school.edu"
                    
                    pu = get_or_create_user(db, p_email, "Parent", "parent123", "parent", institution_id=inst.id)
                    p = db.query(Parent).filter(Parent.user_id == pu.id).first() or Parent(user_id=pu.id, institution_id=inst.id)
                    if not p.id: db.add(p); db.commit(); db.refresh(p)
                    
                    su = get_or_create_user(db, s_email, f"Student {s_code}", "student123", "student", institution_id=inst.id)
                    if not db.query(Student).filter(Student.user_id == su.id).first():
                        s = Student(user_id=su.id, name=su.name, parent_id=p.id, school_class_id=room.id, institution_id=inst.id)
                        db.add(s)
        print("👥 Students, Parents, Marks, and Attendance populated.")
        try:
            db.commit()
            print("✅ Database Seeding Complete (Idempotent)")
        except Exception as e:
            db.rollback()
            print(f"❌ SEEDING CRASHED: {str(e)}")
            print("🔍 Inspecting session objects:")
            for obj in db:
                print(f" - Object: {type(obj).__name__}")
                if hasattr(obj, 'title'):
                    print(f"   Title: {obj.title}")
                if hasattr(obj, 'audience'):
                    print(f"   Audience (ERROR FIELD): {obj.audience}")
            raise e
        finally:
            db.close()

    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
        raise
    finally:
        db.close()

def run_migrations():
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect
    from app.core.database import sync_engine

    here = os.path.dirname(os.path.abspath(__file__))
    cfg = Config(os.path.join(here, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(here, "alembic"))

    # If the DB was built outside of alembic (legacy schema from Base.metadata.create_all),
    # tables exist but alembic_version does not. Stamp it at the pre-head merge point
    # so upgrade head only applies migrations newer than the existing schema.
    inspector = inspect(sync_engine)
    existing = set(inspector.get_table_names())
    if "alembic_version" not in existing and "institutions" in existing:
        print("[migrations] Legacy schema detected — stamping at c9f8a1b2e3d4 before upgrade.")
        command.stamp(cfg, "c9f8a1b2e3d4")

    command.upgrade(cfg, "head")

if __name__ == "__main__":
    run_migrations()
    seed_db()
