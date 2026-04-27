-- Create compound indexes for performance optimization

-- Attendance batch queries: (student_id, institution_id, subject, date)
CREATE INDEX IF NOT EXISTS ix_attendance_student_institution_subject_date ON attendance(student_id, institution_id, subject, date);

-- Attendance queries by class: (school_class_id, date, institution_id)
CREATE INDEX IF NOT EXISTS ix_attendance_class_date_institution ON attendance(school_class_id, date, institution_id);

-- Marks queries: (student_id, institution_id, test_name, subject)
CREATE INDEX IF NOT EXISTS ix_marks_student_institution_test_subject ON marks(student_id, institution_id, test_name, subject);

-- Marks queries by exam: (exam_id, institution_id, student_id)
CREATE INDEX IF NOT EXISTS ix_marks_exam_institution_student ON marks(exam_id, institution_id, student_id);

-- Student queries by institution: (institution_id, id)
CREATE INDEX IF NOT EXISTS ix_students_institution_id_student_id ON students(institution_id, id);
