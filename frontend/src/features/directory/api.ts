import client from '@/shared/api/client';
import type { Student, Teacher } from '@/shared/types';

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
  // Student email is optional — most schools enroll students by name + class +
  // DOB and never collect a student email. The backend derives a synthetic
  // address when this is omitted.
  email?: string;
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
  assignments: import('@/shared/types').TeacherAssignment[];
}

// Page size for admin "list all students/teachers" calls. The backend
// caps at 500; we ask for the smaller default here because the admin UI
// now pushes filters (school_class_id / search) down to SQL so we
// rarely need a full pull.
const ADMIN_LIST_PAGE_SIZE = 100;

export interface StudentListFilters {
  skip?: number;
  limit?: number;
  schoolClassId?: number | null;
  search?: string;
  isActive?: boolean;
}

export const directoryApi = {
  // Students
  //
  // Pass `schoolClassId` to load just one class (the admin directory's
  // common path) instead of all students. `search` is matched
  // server-side on name / parent_name / parent_email via ILIKE so the
  // client doesn't have to fetch then filter.
  getStudents: async (filters: StudentListFilters = {}) => {
    const params: Record<string, string | number | boolean> = {
      skip: filters.skip ?? 0,
      limit: filters.limit ?? ADMIN_LIST_PAGE_SIZE,
    };
    if (filters.schoolClassId != null) params.school_class_id = filters.schoolClassId;
    if (filters.search) params.search = filters.search;
    if (filters.isActive !== undefined) params.is_active = filters.isActive;
    const response = await client.get<Student[]>('directory/', { params });
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
  getTeachers: async (
    filters: { skip?: number; limit?: number; search?: string; isActive?: boolean } = {},
  ) => {
    const params: Record<string, string | number | boolean> = {
      skip: filters.skip ?? 0,
      limit: filters.limit ?? ADMIN_LIST_PAGE_SIZE,
    };
    if (filters.search) params.search = filters.search;
    if (filters.isActive !== undefined) params.is_active = filters.isActive;
    const response = await client.get<TeacherWithPassword[]>('directory/teachers/', { params });
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
    const response = await client.get<import('@/shared/types').Student[]>('directory/my-students');
    return response.data;
  },

  getMyTeachers: async () => {
    const response = await client.get<TeacherWithPassword[]>('directory/my-teachers');
    return response.data;
  },

  // Returns student record for logged-in student/parent user
  getMyProfile: async () => {
    const response = await client.get<import('@/shared/types').Student>('directory/my-profile');
    return response.data;
  },

  // Admin password reset for students
  updateStudentPassword: async (id: number, new_password: string) => {
    const response = await client.put<import('@/shared/types').Student>(`directory/students/${id}/password`, {
      new_password,
    });
    return response.data;
  },
};
