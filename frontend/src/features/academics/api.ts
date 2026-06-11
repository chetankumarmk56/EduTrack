import client from '@/shared/api/client';
import type { Grade, Section, SchoolClass, Subject } from '@/shared/types';

export interface GradeCreate {
  level: number;
  name: string;
  tuition_fee?: number;
  fee_due_date?: string;
}

export interface SectionCreate {
  name: string;
  grade_id: number;
}

// Unused — only referenced by createSchoolClass which is not called anywhere.
// export interface SchoolClassCreate {
//   grade_id: number;
//   section_id: number;
//   display_name?: string;
//   room_number?: string;
// }

export interface SchoolClassUpdate {
  display_name?: string;
  room_number?: string;
  tuition_fee?: number;
  other_fee?: number;
  fee_due_date?: string;
}

export interface SubjectCreate {
  name: string;
  code: string;
}

// Unused — only referenced by updateSection which is not called anywhere.
// export interface SectionUpdate {
//   name?: string;
//   grade_id?: number;
// }

// ── Academic year + year-end promotion ──────────────────────────────────────

export interface AcademicYear {
  id: number;
  label: string;
  start_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
  status: string;
}

export type PromotionDecision = 'PROMOTE' | 'RETAIN' | 'GRADUATE';

export interface PromotionStudentRow {
  student_id: number;
  name?: string | null;
  admission_number?: string | null;
  roll_number?: number | null;
  overall_percentage?: number | null;
  arrears: number;
  decision: PromotionDecision;
}

export interface PromotionClassGroup {
  school_class_id: number;
  class_name?: string | null;
  grade_id?: number | null;
  grade_level?: number | null;
  section_name?: string | null;
  is_top_grade: boolean;
  target_class_name?: string | null;
  will_create_target: boolean;
  student_count: number;
  class_overall_percentage?: number | null;
  students: PromotionStudentRow[];
}

export interface PromotionPreview {
  active_year?: { id: number; label: string } | null;
  next_year_label?: string | null;
  already_promoted: boolean;
  totals: { students: number; promote: number; retain: number; graduate: number; unassigned: number };
  auto_create_classes: string[];
  classes: PromotionClassGroup[];
  unassigned: PromotionStudentRow[];
}

export interface PromotionSummary {
  from_year?: { id: number; label: string } | null;
  to_year?: { id: number; label: string } | null;
  promoted: number;
  retained: number;
  graduated: number;
  skipped: number;
  created_classes: string[];
  already_promoted: boolean;
}

export const academicApi = {
  // Grades (Classes)
  // Unused — not called anywhere in the frontend.
  // getClasses: async () => {
  //   const response = await client.get<Grade[]>('academic/classes');
  //   return response.data;
  // },

  createClass: async (data: GradeCreate) => {
    const response = await client.post<Grade>('academic/classes', data);
    return response.data;
  },

  deleteClass: async (id: number) => {
    await client.delete(`academic/classes/${id}`);
  },

  updateClass: async (id: number, data: Partial<GradeCreate>) => {
    const response = await client.put<Grade>(`academic/classes/${id}`, data);
    return response.data;
  },

  // Sections
  // Unused — not called anywhere in the frontend.
  // getSections: async (gradeId?: number) => {
  //   const params = gradeId ? { grade_id: gradeId } : undefined;
  //   const response = await client.get<Section[]>('academic/sections', { params });
  //   return response.data;
  // },

  // Unused — not called anywhere in the frontend.
  // createSection: async (data: SectionCreate) => {
  //   const response = await client.post<Section>('academic/sections', data);
  //   return response.data;
  // },

  deploySegment: async (data: SectionCreate) => {
    const response = await client.post<Section>('academic/sections/deploy', data);
    return response.data;
  },

  /**
   * Create many sections at once (A, B, C, D…). The backend returns a
   * triage of created / skipped (with reason) / invalid (with reason)
   * plus the active naming rule so the UI can show a precise summary.
   */
  deploySegmentsBulk: async (grade_id: number, names: string[]) => {
    const response = await client.post<{
      created: Section[];
      skipped: { name: string; reason: 'already_exists' | 'duplicate_in_request' }[];
      invalid: { name: string; reason: 'invalid_format' }[];
      rule: string;
    }>(
      'academic/sections/deploy-bulk',
      { grade_id, names },
    );
    return response.data;
  },

  /** Counts of dependent records that will cascade when a class is deleted. */
  getClassDependents: async (grade_id: number) => {
    const response = await client.get<{
      sections: number;
      classrooms: number;
      students: number;
      teacher_assignments: number;
      teachers: number;
      timetable_slots: number;
    }>(`academic/classes/${grade_id}/dependents`);
    return response.data;
  },

  deleteSection: async (id: number) => {
    await client.delete(`academic/sections/${id}`);
  },

  // Unused — not called anywhere in the frontend.
  // updateSection: async (id: number, data: SectionUpdate) => {
  //   const response = await client.put<Section>(`academic/sections/${id}`, data);
  //   return response.data;
  // },

  // Subjects
  // Unused — not called anywhere in the frontend.
  // getSubjects: async () => {
  //   const response = await client.get<Subject[]>('academic/subjects');
  //   return response.data;
  // },

  createSubject: async (data: SubjectCreate) => {
    const response = await client.post<Subject>('academic/subjects', data);
    return response.data;
  },

  deleteSubject: async (id: number) => {
    await client.delete(`academic/subjects/${id}`);
  },

  updateSubject: async (id: number, data: Partial<SubjectCreate>) => {
    const response = await client.put<Subject>(`academic/subjects/${id}`, data);
    return response.data;
  },

  // School Classes
  // Unused — not called anywhere in the frontend.
  // getSchoolClasses: async () => {
  //   const response = await client.get<SchoolClass[]>('academic/school-classes');
  //   return response.data;
  // },

  // Unused — not called anywhere in the frontend.
  // createSchoolClass: async (data: SchoolClassCreate) => {
  //   const response = await client.post<SchoolClass>('academic/school-classes', data);
  //   return response.data;
  // },

  updateSchoolClass: async (id: number, data: SchoolClassUpdate) => {
    const response = await client.put<SchoolClass>(`academic/school-classes/${id}`, data);
    return response.data;
  },

  // ── Academic years & promotion ──
  getAcademicYears: async () => {
    const response = await client.get<AcademicYear[]>('academic/years');
    return response.data;
  },

  previewPromotion: async (retainedStudentIds: number[] = []) => {
    const response = await client.post<PromotionPreview>('academic/promotion/preview', {
      retained_student_ids: retainedStudentIds,
    });
    return response.data;
  },

  exportPromotionPreview: async (format: 'xlsx' | 'csv') => {
    const response = await client.get('academic/promotion/preview/export', {
      params: { format },
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  executePromotion: async (retainedStudentIds: number[], nextYearLabel?: string) => {
    const response = await client.post<PromotionSummary>('academic/promotion/execute', {
      retained_student_ids: retainedStudentIds,
      next_year_label: nextYearLabel,
    });
    return response.data;
  },

  // Unused — not called anywhere in the frontend.
  // deleteSchoolClass: async (id: number) => {
  //   await client.delete(`academic/school-classes/${id}`);
  // }
};
