export interface PerUserStats {
  userId: string;
  name: string;
  email: string;
  role: string;
  profilePictureUrl: string | null;
  messagesSent: number;
  messagesReceived: number;
  ticketsCreated: number;
  ticketsClosed: number;
  ticketsCancelled: number;
  totalActivity: number;
  lastActivityAt: string | null;
}

export interface FunnelStage {
  name: string;
  color: string;
  count: number;
}

export interface DailyPoint {
  date: string;
  messagesSent: number;
  messagesReceived: number;
  ticketsCreated: number;
  ticketsClosed: number;
  ticketsCancelled: number;
}

export interface TeamOverviewResponse {
  period: { from: string; to: string };
  totals: {
    activeUsers: number;
    messagesSent: number;
    messagesReceived: number;
    ticketsCreated: number;
    ticketsClosed: number;
    ticketsCancelled: number;
    openTickets: number;
  };
  perUser: PerUserStats[];
  funnel: FunnelStage[];
  daily: DailyPoint[];
}
