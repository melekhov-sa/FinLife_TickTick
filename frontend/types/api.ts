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

export interface LevelBlock {
  level: number;
  total_xp: number;
  current_level_xp: number;
  xp_to_next_level: number;
  percent_progress: number;
  xp_this_month: number;
}

export interface EfficiencyBlock {
  score: number;
  snapshot_date: string | null;
}

export interface WeekEvent {
  event_id: number;
  occurrence_id: number;
  title: string;
  start_date: string;
  start_time: string | null;
  category_emoji: string | null;
  is_today: boolean;
}

export interface ExpiringSub {
  member_id: number;
  contact_name: string;
  subscription_title: string;
  paid_until: string;
  days_left: number;
}

export interface DashboardData {
  today: TodayBlock;
  upcoming_payments: UpcomingPayment[];
  habit_heatmap: HeatmapCell[];
  financial_summary: Record<string, FinancialCurrencyBlock>;
  fin_state: FinStateBlock;
  feed: FeedGroup[];
  level: LevelBlock | null;
  efficiency: EfficiencyBlock | null;
  week_events: WeekEvent[];
  expiring_subs: ExpiringSub[];
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
  hide_from_plan: boolean;
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
  note: string | null;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  project_id: number | null;
  category_id: number | null;
  category_emoji: string | null;
  is_overdue: boolean;
  is_recurring: boolean;
  occurrence_id: number | null;
  tag_ids: number[];
}

export interface TaskAttachment {
  id: number;
  original_filename: string;
  file_size: number;
  mime_type: string;
  url: string;
  uploaded_at: string;
}

// ── /api/v2/habits ────────────────────────────────────────────────────────────

export interface HabitItem {
  habit_id: number;
  title: string;
  note: string | null;
  level: number;
  level_label: string;
  category_id: number | null;
  category_emoji: string | null;
  category_title: string | null;
  current_streak: number;
  best_streak: number;
  done_count_30d: number;
  reminder_time: string | null;
  done_today: boolean;
  scheduled_today: boolean;
  recent_days: boolean[];
  is_archived: boolean;
}

// ── /api/v2/efficiency ────────────────────────────────────────────────────────

export interface MetricCard {
  key: string;
  label: string;
  description: string;
  raw_value: number;
  sub_score: number; // 40 / 70 / 100
  weight: number;
  higher_is_better: boolean;
}

export interface EfficiencyData {
  score: number;
  snapshot_date: string;
  metrics: MetricCard[];
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

// ── /api/v2/subscriptions ─────────────────────────────────────────────────────

export interface SubscriptionMember {
  member_id: number;
  contact_id: number;
  contact_name: string;
  paid_until: string | null;
  days_left: number | null;
  payment_per_month: number | null;
}

export interface SubscriptionItem {
  id: number;
  name: string;
  paid_until_self: string | null;
  days_left_self: number | null;
  members: SubscriptionMember[];
  total_members: number;
  is_archived: boolean;
}

// ── /api/v2/events ────────────────────────────────────────────────────────────

export interface EventItem {
  occurrence_id: number;
  event_id: number;
  title: string;
  description: string | null;
  start_date: string;
  start_time: string | null;
  end_date: string | null;
  is_all_day: boolean;
  category_id: number | null;
  category_emoji: string | null;
  category_title: string | null;
  is_today: boolean;
  is_past: boolean;
}

// ── /api/v2/knowledge ─────────────────────────────────────────────────────────

export interface ArticleTag {
  id: number;
  name: string;
}

export interface ArticleListItem {
  id: number;
  title: string;
  type: string;
  type_label: string;
  type_emoji: string;
  status: string;
  status_label: string;
  pinned: boolean;
  updated_at: string;
  tags: ArticleTag[];
}

// ── /api/v2/strategy ──────────────────────────────────────────────────────────

export interface StrategyScoreItem {
  key: string;
  label: string;
  score: number;
  raw_value: number | null;
  raw_label: string | null;
}

export interface StrategyHistoryPoint {
  year: number;
  month: number;
  life_score: number;
  finance_score: number;
  discipline_score: number;
  project_score: number;
  focus_score: number;
}

export interface StrategyTarget {
  id: number;
  title: string;
  metric_type: string;
  target_value: number;
  current_value: number | null;
  progress_pct: number | null;
  is_active: boolean;
}

export interface StrategyData {
  year: number;
  month: number;
  life_score: number;
  scores: StrategyScoreItem[];
  history: StrategyHistoryPoint[];
  targets: StrategyTarget[];
}

// ── /api/v2/work-categories ───────────────────────────────────────────────────

export interface WorkCategoryItem {
  category_id: number;
  title: string;
  emoji: string | null;
}

// ── /api/v2/wallets ───────────────────────────────────────────────────────────

export interface WalletItem {
  wallet_id: number;
  title: string;
  currency: string;
  wallet_type: string;
  balance: string;
  delta_30d: string;
  operations_count_30d: number;
  last_operation_at: string | null;
  is_archived: boolean;
}

// ── /api/v2/task-templates ────────────────────────────────────────────────────

export interface TaskTemplateItem {
  template_id: number;
  title: string;
  note: string | null;
  category_id: number | null;
  category_emoji: string | null;
  freq: string;
  interval: number;
  active_from: string;
  active_until: string | null;
  is_archived: boolean;
  next_occurrence: string | null;
}

// ── /api/v2/fin-categories ────────────────────────────────────────────────────

export interface FinCategoryItem {
  category_id: number;
  title: string;
  category_type: string; // INCOME | EXPENSE
  parent_id: number | null;
  is_frequent: boolean;
}

// ── Budget Matrix ──────────────────────────────────────────────────────────

export interface BudgetCell {
  plan: number;
  plan_manual: number;
  plan_planned: number;
  fact: number;
  deviation: number;
  note?: string;
}

export interface BudgetRow {
  category_id: number | null;
  title: string;
  kind: "INCOME" | "EXPENSE";
  parent_id: number | null;
  depth: number;
  is_group: boolean;
  is_child: boolean;
  cells: BudgetCell[];
  total: BudgetCell;
  avg_fact?: number;
}

export interface BudgetGoalRow {
  goal_id: number;
  title: string;
  currency: string;
  cells: BudgetCell[];
  total: BudgetCell;
}

export interface BudgetPeriod {
  index: number;
  label: string;
  short_label: string;
  range_start: string;
  range_end: string;
  year: number;
  month: number;
  has_manual_plan: boolean;
}

export interface BudgetSectionTotals {
  cells: BudgetCell[];
  total: BudgetCell;
  avg_total?: number;
}

export interface BudgetMatrix {
  grain: string;
  range_count: number;
  periods: BudgetPeriod[];
  income_rows: BudgetRow[];
  expense_rows: BudgetRow[];
  income_totals: BudgetSectionTotals;
  expense_totals: BudgetSectionTotals;
  result: { cells: { plan: number; fact: number }[]; total: { plan: number; fact: number } };
  goal_rows: BudgetGoalRow[];
  goal_totals: BudgetSectionTotals;
  withdrawal_rows: BudgetGoalRow[];
  withdrawal_totals: BudgetSectionTotals;
  avg_months: number;
}
