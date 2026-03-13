// ── /api/v2/me ────────────────────────────────────────────────────────────────

export interface UserMe {
  id: number;
  email: string;
  theme: string | null;
  is_admin: boolean;
  enable_task_expense_link: boolean;
  enable_task_templates: boolean;
  enable_task_reschedule_reasons: boolean;
}

// ── /api/v2/dashboard ─────────────────────────────────────────────────────────

export interface DashboardItem {
  kind: string;
  id: number;
  title: string;
  date: string | null;
  time: string | null;
  is_done: boolean;
  is_overdue: boolean;
  category_emoji: string | null;
  meta: Record<string, unknown>;
}

export interface ProgressBlock {
  total: number;
  done: number;
  left: number;
}

export interface TodayBlock {
  overdue: DashboardItem[];
  active: DashboardItem[];
  done: DashboardItem[];
  events: DashboardItem[];
  progress: ProgressBlock;
}

export interface UpcomingPayment {
  occurrence_id: number;
  template_id: number;
  title: string;
  scheduled_date: string;
  kind: string;
  kind_label: string;
  amount: number;
  amount_formatted: string;
  days_until: number;
}

export interface HeatmapCell {
  date: string;
  done_count: number;
  due_count: number;
  ratio: number;
  level: number;
}

export interface FinancialCurrencyBlock {
  income: number;
  expense: number;
  difference: number;
}

export interface FinStateBlock {
  regular_total: number;
  credit_total: number;
  savings_total: number;
  financial_result: number;
  debt_load_pct: number | null;
  capital_delta_30: number | null;
}

export interface FeedEvent {
  icon: string;
  title: string;
  subtitle: string;
  occurred_at: string;
  time_str: string;
  amount_label: string | null;
  amount_css: string | null;
}

export interface FeedGroup {
  label: string;
  date: string;
  events: FeedEvent[];
}

export interface DashboardData {
  today: TodayBlock;
  upcoming_payments: UpcomingPayment[];
  habit_heatmap: HeatmapCell[];
  financial_summary: Record<string, FinancialCurrencyBlock>;
  fin_state: FinStateBlock;
  feed: FeedGroup[];
}

// ── /api/v2/projects ──────────────────────────────────────────────────────────

export interface ProjectSummary {
  id: number;
  title: string;
  description: string | null;
  status: string;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  total_tasks: number;
  done_tasks: number;
  progress: number;
}

export interface ProjectTag {
  id: number;
  name: string;
  color: string;
}

export interface TaskCard {
  task_id: number;
  title: string;
  status: string;
  board_status: string;
  due_date: string | null;
  completed_at: string | null;
  is_overdue: boolean;
  tags: ProjectTag[];
  tag_ids: number[];
}

export interface BoardColumn {
  key: string;
  label: string;
}

export interface ProjectDetail extends ProjectSummary {
  columns: BoardColumn[];
  groups: Record<string, TaskCard[]>;
  tags: ProjectTag[];
}

// ── /api/v2/tasks ─────────────────────────────────────────────────────────────

export interface TaskItem {
  task_id: number;
  title: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  project_id: number | null;
  is_overdue: boolean;
}

// ── /api/v2/notifications ─────────────────────────────────────────────────────

export interface NotificationItem {
  id: number;
  rule_code: string;
  entity_type: string | null;
  entity_id: number | null;
  severity: string;
  title: string;
  body_inapp: string;
  is_read: boolean;
  created_at: string;
}

export interface BadgeResponse {
  unread_count: number;
}
