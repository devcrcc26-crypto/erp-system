export type HolidayNationality = 'ETHIOPIAN' | 'CHINESE' | 'ALL';

export type DayBreakdownType = 'working' | 'half' | 'weekend' | 'holiday';

export interface WorkScheduleDay {
  id: string;
  scheduleId: string;
  dayOfWeek: number;
  isWorkingDay: boolean;
  isHalfDay: boolean;
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
  totalHours: number;
}

export interface WorkSchedule {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  days: WorkScheduleDay[];
  workingDaysPerWeek: number;
  hoursPerWeek: number;
  assignedEmployeeCount: number;
}

export interface WorkScheduleDayInput {
  dayOfWeek: number;
  isWorkingDay: boolean;
  isHalfDay?: boolean;
  morningStart?: string | null;
  morningEnd?: string | null;
  afternoonStart?: string | null;
  afternoonEnd?: string | null;
}

export interface CreateWorkSchedulePayload {
  name: string;
  description?: string;
  isDefault?: boolean;
  isActive?: boolean;
  days: WorkScheduleDayInput[];
}

export type UpdateWorkSchedulePayload = Partial<CreateWorkSchedulePayload>;

/** Returned by DELETE /hr/work-schedules/:id — who was moved, and where to. */
export interface DeleteWorkScheduleResult {
  movedEmployees: number;
  defaultScheduleId: string;
  defaultScheduleName: string;
}

export interface AssignSchedulePayload {
  employeeId: string;
  effectiveFrom: string;
  notes?: string;
}

export interface ScheduleAssignmentHistoryItem {
  id: string;
  scheduleId: string;
  scheduleName: string;
  isDefault: boolean;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdAt: string;
}

export interface EmployeeScheduleView {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    chineseName: string | null;
    email: string | null;
    employeeId: string | null;
    nationality: 'ETHIOPIAN' | 'CHINESE' | null;
  };
  current: WorkSchedule;
  history: ScheduleAssignmentHistoryItem[];
}

export interface LeavePeriodInput {
  startDate: string;
  endDate: string;
}

export interface DayBreakdownItem {
  date: string;
  type: DayBreakdownType;
  holidayName?: string;
  weight: number;
}

export interface PreviewPeriodResult {
  startDate: string;
  endDate: string;
  days: number;
  breakdown: DayBreakdownItem[];
}

export interface PreviewDaysResult {
  totalDays: number;
  periods: PreviewPeriodResult[];
}

export interface PublicHoliday {
  id: string;
  companyId: string;
  name: string;
  nameZh: string | null;
  date: string;
  isRecurring: boolean;
  appliesToNationality: HolidayNationality;
  isActive: boolean;
  notes: string | null;
  notifyDaysBefore: number;
  createdAt: string;
  updatedAt: string;
  daysUntil: number;
  isPast: boolean;
}

export interface CreatePublicHolidayPayload {
  name: string;
  nameZh?: string;
  date: string;
  isRecurring?: boolean;
  appliesToNationality?: HolidayNationality;
  isActive?: boolean;
  notes?: string;
  notifyDaysBefore?: number;
}

export type UpdatePublicHolidayPayload = Partial<CreatePublicHolidayPayload>;

export interface ListPublicHolidaysParams {
  year?: number;
  nationality?: HolidayNationality;
  isActive?: boolean;
  /** Only holidays occurring within this many days from today. */
  upcoming?: number;
}

/** GET /hr/public-holidays/my/upcoming — `date` is the next occurrence. */
export interface MyUpcomingHoliday {
  id: string;
  name: string;
  nameZh: string | null;
  date: string;
  isRecurring: boolean;
  appliesToNationality: HolidayNationality;
  daysUntil: number;
}
