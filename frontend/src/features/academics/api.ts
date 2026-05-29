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
  transport_fee?: number;
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
   * Create many sections at once (A, B, C, D…). The backend skips any
   * names that already exist in the class and reports them in `skipped`
   * so the UI can show a partial-success message.
   */
  deploySegmentsBulk: async (grade_id: number, names: string[]) => {
    const response = await client.post<{ created: Section[]; skipped: string[] }>(
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

  // Unused — not called anywhere in the frontend.
  // deleteSchoolClass: async (id: number) => {
  //   await client.delete(`academic/school-classes/${id}`);
  // }
};
