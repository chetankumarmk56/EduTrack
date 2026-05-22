import client from '@/shared/api/client';
import type {
  SchedulePeriod,
  SchedulePeriodType,
  TimetableSlot,
  ClassTimetable,
  TeacherTimetable,
} from '@/shared/types';

export interface SchedulePeriodCreate {
  name: string;
  period_type: SchedulePeriodType;
  order: number;
  start_time: string;  // "HH:MM" or "HH:MM:SS"
  end_time: string;
}

export interface SchedulePeriodUpdate {
  name?: string;
  period_type?: SchedulePeriodType;
  order?: number;
  start_time?: string;
  end_time?: string;
}

export interface TimetableSlotUpsert {
  school_class_id: number;
  schedule_period_id: number;
  day_of_week: number;
  subject_id?: number | null;
  teacher_id?: number | null;
  room?: string | null;
}

export const timetableApi = {
  // ---------- Periods ----------
  getPeriods: async () => {
    const response = await client.get<SchedulePeriod[]>('timetable/periods');
    return response.data;
  },

  createPeriod: async (data: SchedulePeriodCreate) => {
    const response = await client.post<SchedulePeriod>('timetable/periods', data);
    return response.data;
  },

  updatePeriod: async (id: number, data: SchedulePeriodUpdate) => {
    const response = await client.put<SchedulePeriod>(`timetable/periods/${id}`, data);
    return response.data;
  },

  deletePeriod: async (id: number) => {
    await client.delete(`timetable/periods/${id}`);
  },

  // ---------- Class timetable ----------
  getClassTimetable: async (classId: number) => {
    const response = await client.get<ClassTimetable>(`timetable/class/${classId}`);
    return response.data;
  },

  // ---------- Teacher timetable ----------
  getMyTimetable: async () => {
    const response = await client.get<TeacherTimetable>('timetable/me');
    return response.data;
  },

  // Unused — getMyTimetable() is used instead; nothing calls this in the frontend.
  // getTeacherTimetable: async (teacherId: number) => {
  //   const response = await client.get<TeacherTimetable>(`timetable/teacher/${teacherId}`);
  //   return response.data;
  // },

  // ---------- Slots ----------
  upsertSlot: async (data: TimetableSlotUpsert) => {
    const response = await client.post<TimetableSlot>('timetable/slots', data);
    return response.data;
  },

  deleteSlot: async (id: number) => {
    await client.delete(`timetable/slots/${id}`);
  },
};
