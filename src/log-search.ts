import { SalesforceClient } from './salesforce-client';
import { DebugLog, SearchOptions, SearchResult, LogMatch, DownloadOptions, DownloadResult } from './types';
import { FileUtils } from './file-utils';
import * as path from 'path';

export class LogSearcher {
  private client: SalesforceClient;

  constructor(client: SalesforceClient) {
    this.client = client;
  }

  /**
   * Search for text across debug logs
   */
  async searchLogs(options: SearchOptions): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Get debug logs based on filters
    let logs: DebugLog[] = [];
    
    if (options.userId) {
      logs = await this.client.getDebugLogsByUser(options.userId, options.maxResults || 100);
    } else if (options.dateFrom || options.dateTo) {
      logs = await this.client.getDebugLogsByDateRange(
        options.dateFrom, 
        options.dateTo, 
        options.maxResults || 100
      );
    } else {
      logs = await this.client.getDebugLogs(options.maxResults || 100);
    }

    console.log(`Searching through ${logs.length} debug logs...`);

    // Search through each log
    for (const log of logs) {
      try {
        const logBody = await this.client.getDebugLogBody(log.Id);
        const matches = this.searchInLogBody(logBody, options.searchText, options.caseSensitive);
        
        if (matches.length > 0) {
          results.push({
            log,
            matches
          });
        }
      } catch (error) {
        console.warn(`Failed to retrieve log body for ${log.Id}: ${error}`);
        continue;
      }
    }

    return results;
  }

  /**
   * Search for text across debug logs with detailed results
   */
  async searchLogsWithStats(options: SearchOptions): Promise<{ results: SearchResult[], totalLogsSearched: number }> {
    const results: SearchResult[] = [];

    // Get debug logs based on filters
    let logs: DebugLog[] = [];
    
    if (options.userId) {
      logs = await this.client.getDebugLogsByUser(options.userId, options.maxResults || 100);
    } else if (options.dateFrom || options.dateTo) {
      logs = await this.client.getDebugLogsByDateRange(
        options.dateFrom, 
        options.dateTo, 
        options.maxResults || 100
      );
    } else {
      logs = await this.client.getDebugLogs(options.maxResults || 100);
    }

    console.log(`Searching through ${logs.length} debug logs...`);

    // Search through each log
    for (const log of logs) {
      try {
        const logBody = await this.client.getDebugLogBody(log.Id);
        const matches = this.searchInLogBody(logBody, options.searchText, options.caseSensitive);
        
        if (matches.length > 0) {
          results.push({
            log,
            matches
          });
        }
      } catch (error) {
        console.warn(`Failed to retrieve log body for ${log.Id}: ${error}`);
        continue;
      }
    }

    return { results, totalLogsSearched: logs.length };
  }

  /**
   * Search for text across ALL debug logs using batching
   */
  async searchAllLogsWithStats(options: SearchOptions): Promise<{ results: SearchResult[], totalLogsSearched: number }> {
    const results: SearchResult[] = [];

    // Get ALL debug logs using batching
    let logs: DebugLog[] = [];
    
    if (options.userId) {
      logs = await this.client.getAllDebugLogsByUser(options.userId, options.maxResults);
    } else if (options.dateFrom || options.dateTo) {
      logs = await this.client.getAllDebugLogsByDateRange(
        options.dateFrom, 
        options.dateTo, 
        options.maxResults
      );
    } else {
      logs = await this.client.getAllDebugLogs(options.maxResults);
    }

    console.log(`Searching through ${logs.length} debug logs...`);

    // Search through each log
    for (const log of logs) {
      try {
        const logBody = await this.client.getDebugLogBody(log.Id);
        const matches = this.searchInLogBody(logBody, options.searchText, options.caseSensitive);
        
        if (matches.length > 0) {
          results.push({
            log,
            matches
          });
        }
      } catch (error) {
        console.warn(`Failed to retrieve log body for ${log.Id}: ${error}`);
        continue;
      }
    }

    return { results, totalLogsSearched: logs.length };
  }

  /**
   * Search for text within a single log body
   */
  private searchInLogBody(logBody: string, searchText: string, caseSensitive: boolean = false): LogMatch[] {
    const matches: LogMatch[] = [];
    const lines = logBody.split('\n');
    const searchPattern = caseSensitive ? searchText : searchText.toLowerCase();

    lines.forEach((line, index) => {
      const searchLine = caseSensitive ? line : line.toLowerCase();
      
      if (searchLine.includes(searchPattern)) {
        matches.push({
          lineNumber: index + 1,
          line: line.trim(),
          context: this.getContext(lines, index, 2) // 2 lines of context before/after
        });
      }
    });

    return matches;
  }

  /**
   * Get context lines around a match
   */
  private getContext(lines: string[], matchIndex: number, contextLines: number): string[] {
    const context: string[] = [];
    const start = Math.max(0, matchIndex - contextLines);
    const end = Math.min(lines.length - 1, matchIndex + contextLines);

    for (let i = start; i <= end; i++) {
      if (i !== matchIndex) {
        context.push(`${i + 1}: ${lines[i].trim()}`);
      }
    }

    return context;
  }

  /**
   * Search for multiple patterns in logs
   */
  async searchMultiplePatterns(patterns: string[], options: Omit<SearchOptions, 'searchText'>): Promise<Map<string, SearchResult[]>> {
    const results = new Map<string, SearchResult[]>();

    for (const pattern of patterns) {
      const searchOptions: SearchOptions = {
        ...options,
        searchText: pattern
      };
      
      const patternResults = await this.searchLogs(searchOptions);
      results.set(pattern, patternResults);
    }

    return results;
  }

  /**
   * Search and download matching logs efficiently
   */
  async searchAndDownloadLogs(searchOptions: SearchOptions, downloadOptions: DownloadOptions, useAllLogs: boolean = false): Promise<DownloadResult> {
    console.log(`🔍 Searching logs for pattern: "${searchOptions.searchText}"`);
    
    // First, search for matching logs with stats
    const { results: searchResults, totalLogsSearched } = useAllLogs 
      ? await this.searchAllLogsWithStats(searchOptions)
      : await this.searchLogsWithStats(searchOptions);
    
    if (searchResults.length === 0) {
      return {
        searchText: searchOptions.searchText,
        totalLogsSearched,
        matchingLogs: 0,
        downloadedLogs: 0,
        failedDownloads: [],
        downloadPath: downloadOptions.outputDir,
        estimatedSize: 0
      };
    }

    console.log(`📋 Found ${searchResults.length} logs with matches`);

    // Check disk space
    const logs = searchResults.map(r => r.log);
    const { hasSpace, estimatedSize } = FileUtils.checkDiskSpace(logs, downloadOptions.outputDir);
    
    if (!hasSpace) {
      throw new Error(`Insufficient disk space. Estimated size needed: ${FileUtils.formatBytes(estimatedSize)}`);
    }

    console.log(`💾 Estimated download size: ${FileUtils.formatBytes(estimatedSize)}`);

    // Ensure output directory exists
    FileUtils.ensureDirectoryExists(downloadOptions.outputDir);

    // Extract log IDs for efficient batch download
    const logIds = logs.map(log => log.Id);
    console.log(`⬇️  Downloading ${logIds.length} log files...`);

    // Download log bodies efficiently in batches
    const logBodies = await this.client.getDebugLogBodies(logIds);
    
    const downloadedLogs: string[] = [];
    const failedDownloads: string[] = [];

    // Save each log and its metadata
    for (const result of searchResults) {
      const logBody = logBodies.get(result.log.Id);
      
      if (!logBody) {
        failedDownloads.push(result.log.Id);
        continue;
      }

      try {
        // Generate filenames
        const logFileName = FileUtils.generateLogFileName(result.log);
        const metadataFileName = FileUtils.generateMetadataFileName(result.log);
        
        const logFilePath = path.join(downloadOptions.outputDir, logFileName);
        const metadataFilePath = path.join(downloadOptions.outputDir, metadataFileName);

        // Save log content
        await FileUtils.saveLogToFile(logFilePath, logBody);
        
        // Save metadata with match information
        if (downloadOptions.includeMetadata) {
          await FileUtils.saveMetadataToFile(metadataFilePath, result.log, result.matches);
        }

        downloadedLogs.push(result.log.Id);
        
        if (downloadOptions.verbose) {
          console.log(`✅ Downloaded: ${logFileName}`);
        }
        
      } catch (error) {
        console.warn(`❌ Failed to save log ${result.log.Id}: ${error}`);
        failedDownloads.push(result.log.Id);
      }
    }

    // Create download summary
    if (downloadOptions.createSummary) {
      const summaryPath = path.join(downloadOptions.outputDir, 'download-summary.json');
      await FileUtils.createDownloadSummary(
        summaryPath,
        searchOptions.searchText,
        logs.length,
        searchResults.length,
        downloadedLogs.length,
        failedDownloads
      );
    }

    const result: DownloadResult = {
      searchText: searchOptions.searchText,
      totalLogsSearched,
      matchingLogs: searchResults.length,
      downloadedLogs: downloadedLogs.length,
      failedDownloads,
      downloadPath: downloadOptions.outputDir,
      estimatedSize
    };

    console.log(`🎉 Download complete: ${downloadedLogs.length}/${searchResults.length} logs saved`);
    if (failedDownloads.length > 0) {
      console.log(`⚠️  ${failedDownloads.length} downloads failed`);
    }

    return result;
  }

  /**
   * Download specific logs by their IDs
   */
  async downloadLogsByIds(logIds: string[], downloadOptions: DownloadOptions): Promise<DownloadResult> {
    console.log(`📋 Downloading ${logIds.length} specific logs...`);

    // Get log metadata first
    const allLogs: DebugLog[] = [];
    for (const logId of logIds) {
      try {
        // We need to fetch logs to get metadata - this is a limitation of the current approach
        // In a production system, you might want to cache log metadata or fetch it separately
        const logs = await this.client.getDebugLogs(1000); // Get recent logs to find our IDs
        const log = logs.find(l => l.Id === logId);
        if (log) {
          allLogs.push(log);
        }
      } catch (error) {
        console.warn(`Failed to get metadata for log ${logId}: ${error}`);
      }
    }

    // Check disk space
    const { hasSpace, estimatedSize } = FileUtils.checkDiskSpace(allLogs, downloadOptions.outputDir);
    
    if (!hasSpace) {
      throw new Error(`Insufficient disk space. Estimated size needed: ${FileUtils.formatBytes(estimatedSize)}`);
    }

    // Ensure output directory exists
    FileUtils.ensureDirectoryExists(downloadOptions.outputDir);

    // Download log bodies efficiently
    const logBodies = await this.client.getDebugLogBodies(logIds);
    
    const downloadedLogs: string[] = [];
    const failedDownloads: string[] = [];

    // Save each log
    for (const log of allLogs) {
      const logBody = logBodies.get(log.Id);
      
      if (!logBody) {
        failedDownloads.push(log.Id);
        continue;
      }

      try {
        const logFileName = FileUtils.generateLogFileName(log);
        const logFilePath = path.join(downloadOptions.outputDir, logFileName);

        await FileUtils.saveLogToFile(logFilePath, logBody);
        
        if (downloadOptions.includeMetadata) {
          const metadataFileName = FileUtils.generateMetadataFileName(log);
          const metadataFilePath = path.join(downloadOptions.outputDir, metadataFileName);
          await FileUtils.saveMetadataToFile(metadataFilePath, log);
        }

        downloadedLogs.push(log.Id);
        
        if (downloadOptions.verbose) {
          console.log(`✅ Downloaded: ${logFileName}`);
        }
        
      } catch (error) {
        console.warn(`❌ Failed to save log ${log.Id}: ${error}`);
        failedDownloads.push(log.Id);
      }
    }

    return {
      searchText: 'Direct download',
      totalLogsSearched: logIds.length,
      matchingLogs: logIds.length,
      downloadedLogs: downloadedLogs.length,
      failedDownloads,
      downloadPath: downloadOptions.outputDir,
      estimatedSize
    };
  }
}
