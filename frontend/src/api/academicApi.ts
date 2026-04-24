import client from './client';
import type { Grade, Section, SchoolClass, Subject } from '../types';

export interface GradeCreate {
  level: number;
  name: string;
}

export interface SectionCreate {
  name: string;
  grade_id: number;
}

export interface SchoolClassCreate {
  grade_id: number;
  section_id: number;
  display_name?: string;
}

export interface SubjectCreate {
  name: string;
  code: string;
}

export interface SectionUpdate {
  name?: string;
  grade_id?: number;
}

export const academicApi = {
  // Grades (Classes)
  getClasses: async () => {
    const response = await client.get<Grade[]>('academic/classes');
    return response.data;
  },

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
  getSections: async (gradeId?: number) => {
    const params = gradeId ? { grade_id: gradeId } : undefined;
    const response = await client.get<Section[]>('academic/sections', { params });
    return response.data;
  },

  createSection: async (data: SectionCreate) => {
    const response = await client.post<Section>('academic/sections', data);
    return response.data;
  },

  deploySegment: async (data: SectionCreate) => {
    const response = await client.post<Section>('academic/sections/deploy', data);
    return response.data;
  },

  deleteSection: async (id: number) => {
    await client.delete(`academic/sections/${id}`);
  },

  updateSection: async (id: number, data: SectionUpdate) => {
    const response = await client.put<Section>(`academic/sections/${id}`, data);
    return response.data;
  },

  // Subjects
  getSubjects: async () => {
    const response = await client.get<Subject[]>('academic/subjects');
    return response.data;
  },

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
  getSchoolClasses: async () => {
    const response = await client.get<SchoolClass[]>('academic/school-classes');
    return response.data;
  },

  createSchoolClass: async (data: SchoolClassCreate) => {
    const response = await client.post<SchoolClass>('academic/school-classes', data);
    return response.data;
  },

  deleteSchoolClass: async (id: number) => {
    await client.delete(`academic/school-classes/${id}`);
  }
};
