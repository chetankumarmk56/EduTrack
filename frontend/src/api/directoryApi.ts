import client from './client';
import type { Student, Teacher } from '../types';

// Typed payloads matching backend schemas exactly
export interface TeacherCreatePayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
  is_active?: boolean;
}

export interface TeacherUpdatePayload {
  name?: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
}

export interface AssignmentCreatePayload {
  teacher_id: number;
  school_class_id: number;
  subject_id: number;
}

export interface StudentCreatePayload {
  name: string;
  email: string;
  password: string;
  dob?: string;
  whatsapp?: string;
  school_class_id?: number;
  parent_id?: number;
  parent_name?: string;
  parent_email?: string;
  parent_phone?: string;
}

// Extend Teacher type to include admin-visible password
export interface TeacherWithPassword {
  id: number;
  user_id: number;
  name: string;
  email?: string;
  phone?: string;
  is_active: boolean;
  plain_password?: string;
  assignments: import('../types').TeacherAssignment[];
}

export const directoryApi = {
  // Students
  getStudents: async (skip = 0, limit = 100) => {
    const response = await client.get<Student[]>('directory/', { params: { skip, limit } });
    return response.data;
  },

  getStudent: async (id: number) => {
    const response = await client.get<Student>(`directory/students/${id}`);
    return response.data;
  },

  createStudent: async (data: StudentCreatePayload) => {
    const response = await client.post<Student>('directory/', data);
    return response.data;
  },

  updateStudent: async (id: number, data: Partial<StudentCreatePayload>) => {
    const response = await client.put<Student>(`directory/students/${id}`, data);
    return response.data;
  },

  deleteStudent: async (id: number) => {
    const response = await client.delete(`directory/students/${id}`);
    return response.data;
  },

  // Teachers
  getTeachers: async (skip = 0, limit = 100) => {
    const response = await client.get<TeacherWithPassword[]>('directory/teachers/', { params: { skip, limit } });
    return response.data;
  },

  getTeacher: async (id: number) => {
    const response = await client.get<TeacherWithPassword>(`directory/teachers/${id}`);
    return response.data;
  },

  createTeacher: async (data: TeacherCreatePayload) => {
    const response = await client.post<Teacher>('directory/teachers/', data);
    return response.data;
  },

  updateTeacher: async (id: number, data: TeacherUpdatePayload) => {
    const response = await client.put<Teacher>(`directory/teachers/${id}`, data);
    return response.data;
  },

  // Admin password reset
  updateTeacherPassword: async (id: number, new_password: string) => {
    const response = await client.put<Teacher>(`directory/teachers/${id}/password`, {
      new_password,
    });
    return response.data;
  },

  deleteTeacher: async (id: number) => {
    const response = await client.delete(`directory/teachers/${id}`);
    return response.data;
  },

  // Assignments
  createAssignment: async (data: AssignmentCreatePayload) => {
    const response = await client.post('directory/teachers/assignments/', data);
    return response.data;
  },

  deleteAssignment: async (id: number) => {
    const response = await client.delete(`directory/teachers/assignments/${id}`);
    return response.data;
  },

  // Context-aware smart endpoints
  getMyStudents: async () => {
    const response = await client.get<import('../types').Student[]>('directory/my-students');
    return response.data;
  },

  getMyTeachers: async () => {
    const response = await client.get<TeacherWithPassword[]>('directory/my-teachers');
    return response.data;
  },

  // Returns student record for logged-in student/parent user
  getMyProfile: async () => {
    const response = await client.get<import('../types').Student>('directory/my-profile');
    return response.data;
  },

  // Admin password reset for students
  updateStudentPassword: async (id: number, new_password: string) => {
    const response = await client.put<import('../types').Student>(`directory/students/${id}/password`, {
      new_password,
    });
    return response.data;
  },
};
