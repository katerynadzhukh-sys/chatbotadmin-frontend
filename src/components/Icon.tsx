import type { CSSProperties } from "react";
import {
  Plus,
  ArrowLeft,
  ChartColumn,
  MessageSquare,
  Check,
  X,
  Code,
  Copy,
  Database,
  Trash2,
  CircleAlert,
  ChevronDown,
  ListFilter,
  MessagesSquare,
  LayoutGrid,
  Info,
  Link,
  LogIn,
  LogOut,
  MailCheck,
  Bell,
  ExternalLink,
  Palette,
  CirclePause,
  User,
  CirclePlay,
  LoaderCircle,
  RefreshCw,
  Clock,
  Search,
  Send,
  Settings,
  Bot,
  ArrowUpDown,
  Gauge,
  Star,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  SlidersHorizontal,
  Upload,
  Eye,
  EyeOff,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

/**
 * UI-Icons aus der Lucide-Bibliothek (https://lucide.dev).
 * Die Schlüssel sind die historischen (Material-)Namen, damit bestehende
 * Aufrufe `<Icon name="..." />` unverändert funktionieren. Gerendert wird mit
 * width/height = 1em, sodass Größenklassen wie `text-[18px]` weiterhin greifen.
 */
const ICONS: Record<string, LucideIcon> = {
  add: Plus,
  arrow_back: ArrowLeft,
  bar_chart: ChartColumn,
  chat: MessageSquare,
  check: Check,
  close: X,
  code: Code,
  content_copy: Copy,
  database: Database,
  delete: Trash2,
  error: CircleAlert,
  expand_more: ChevronDown,
  filter_list: ListFilter,
  forum: MessagesSquare,
  grid_view: LayoutGrid,
  info: Info,
  link: Link,
  login: LogIn,
  logout: LogOut,
  mark_email_read: MailCheck,
  notifications: Bell,
  open_in_new: ExternalLink,
  palette: Palette,
  pause_circle: CirclePause,
  person: User,
  play_circle: CirclePlay,
  progress_activity: LoaderCircle,
  refresh: RefreshCw,
  schedule: Clock,
  search: Search,
  send: Send,
  settings: Settings,
  smart_toy: Bot,
  sort: ArrowUpDown,
  speed: Gauge,
  star: Star,
  thumb_down: ThumbsDown,
  thumb_up: ThumbsUp,
  trending_down: TrendingDown,
  trending_up: TrendingUp,
  tune: SlidersHorizontal,
  upload: Upload,
  visibility: Eye,
  visibility_off: EyeOff,
};

interface IconProps {
  name: string;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, className = "", style }: IconProps) {
  const Cmp = ICONS[name] ?? HelpCircle;
  return <Cmp className={className} style={style} width="1em" height="1em" aria-hidden />;
}
