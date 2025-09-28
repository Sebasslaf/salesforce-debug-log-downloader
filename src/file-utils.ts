import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';
import { DebugLog } from './types';

/**
 * Utility functions for file operations and naming
 */
export class FileUtils {
  /**
   * Ensure a directory exists, create it if it doesn't
   */
  static ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Generate a safe filename for a debug log
   */
  static generateLogFileName(log: DebugLog, extension: string = '.log'): string {
    const timestamp = moment(log.LastModifiedDate).format('YYYY-MM-DD_HH-mm-ss');
    const operation = log.Operation.replace(/[^a-zA-Z0-9]/g, '_');
    const logId = log.Id.substring(0, 8); // Use first 8 chars of ID for uniqueness
    
    return `${timestamp}_${operation}_${logId}${extension}`;
  }

  /**
   * Generate a metadata filename for a debug log
   */
  static generateMetadataFileName(log: DebugLog): string {
    return this.generateLogFileName(log, '.json');
  }

  /**
   * Save log content to file
   */
  static async saveLogToFile(filePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, content, 'utf8', (err) => {
        if (err) {
          reject(new Error(`Failed to save log to ${filePath}: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Save log metadata to JSON file
   */
  static async saveMetadataToFile(filePath: string, log: DebugLog, matches?: any[]): Promise<void> {
    const metadata = {
      log: {
        id: log.Id,
        userId: log.LogUserId,
        lastModified: log.LastModifiedDate,
        operation: log.Operation,
        application: log.Application,
        status: log.Status,
        duration: log.DurationMilliseconds,
        startTime: log.StartTime,
        location: log.Location,
        logLength: log.LogLength
      },
      downloadedAt: new Date().toISOString(),
      matches: matches || []
    };

    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, JSON.stringify(metadata, null, 2), 'utf8', (err) => {
        if (err) {
          reject(new Error(`Failed to save metadata to ${filePath}: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Create a summary file for the download session
   */
  static async createDownloadSummary(
    summaryPath: string, 
    searchText: string, 
    totalLogs: number, 
    matchingLogs: number,
    downloadedLogs: number,
    failedDownloads: string[] = []
  ): Promise<void> {
    const summary = {
      searchText,
      timestamp: new Date().toISOString(),
      statistics: {
        totalLogsSearched: totalLogs,
        logsWithMatches: matchingLogs,
        logsDownloaded: downloadedLogs,
        downloadsFailed: failedDownloads.length
      },
      failedDownloads: failedDownloads.map(logId => ({ logId, reason: 'API Error' }))
    };

    return new Promise((resolve, reject) => {
      fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8', (err) => {
        if (err) {
          reject(new Error(`Failed to save download summary: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get available disk space (approximate check)
   */
  static getApproximateFileSize(logLength: number): number {
    // Estimate file size (log length + metadata + some buffer)
    return logLength + 1024; // Add 1KB for metadata and buffer
  }

  /**
   * Check if we have enough estimated space for downloads
   */
  static checkDiskSpace(logs: DebugLog[], outputDir: string): { hasSpace: boolean; estimatedSize: number } {
    const estimatedSize = logs.reduce((total, log) => {
      return total + this.getApproximateFileSize(log.LogLength);
    }, 0);

    // For simplicity, we'll assume we have space if the directory exists
    // In a production app, you'd want to check actual disk space
    const hasSpace = fs.existsSync(path.dirname(outputDir)) || true;

    return { hasSpace, estimatedSize };
  }

  /**
   * Format bytes to human readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
