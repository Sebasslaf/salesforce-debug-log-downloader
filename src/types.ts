export interface SalesforceConfig {
  instanceUrl: string;
  sessionToken: string;
  apiVersion?: string;
}

export interface DebugLog {
  Id: string;
  LogUserId: string;
  LogLength: number;
  LastModifiedDate: string;
  Request: string;
  Operation: string;
  Application: string;
  Status: string;
  DurationMilliseconds: number;
  StartTime: string;
  Location: string;
}

export interface DebugLogBody {
  Id: string;
  Body: string;
}

export interface SearchOptions {
  searchText: string;
  caseSensitive?: boolean;
  maxResults?: number;
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
}

export interface SearchResult {
  log: DebugLog;
  matches: LogMatch[];
}

export interface LogMatch {
  lineNumber: number;
  line: string;
  context?: string[];
}

export interface DownloadOptions {
  outputDir: string;
  includeMetadata?: boolean;
  createSummary?: boolean;
  verbose?: boolean;
}

export interface DownloadResult {
  searchText: string;
  totalLogsSearched: number;
  matchingLogs: number;
  downloadedLogs: number;
  failedDownloads: string[];
  downloadPath: string;
  estimatedSize: number;
}
