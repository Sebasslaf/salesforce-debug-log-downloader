import axios, { AxiosInstance } from 'axios';
import { SalesforceConfig, DebugLog, DebugLogBody } from './types';

export class SalesforceClient {
  private client: AxiosInstance;
  private config: SalesforceConfig;

  constructor(config: SalesforceConfig) {
    this.config = {
      ...config,
      apiVersion: config.apiVersion || '58.0'
    };

    this.client = axios.create({
      baseURL: `${this.config.instanceUrl}/services/data/v${this.config.apiVersion}`,
      headers: {
        'Authorization': `Bearer ${this.config.sessionToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Retrieve all debug logs
   */
  async getDebugLogs(limit: number = 100): Promise<DebugLog[]> {
    try {
      const response = await this.client.get('/tooling/query/', {
        params: {
          q: `SELECT Id, LogUserId, LogLength, LastModifiedDate, Request, Operation, Application, Status, DurationMilliseconds, StartTime, Location FROM ApexLog ORDER BY LastModifiedDate DESC LIMIT ${limit}`
        }
      });

      return response.data.records;
    } catch (error) {
      throw new Error(`Failed to retrieve debug logs: ${error}`);
    }
  }

  /**
   * Get debug log body content by ID
   */
  async getDebugLogBody(logId: string): Promise<string> {
    try {
      const response = await this.client.get(`/tooling/sobjects/ApexLog/${logId}/Body`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to retrieve debug log body for ID ${logId}: ${error}`);
    }
  }

  /**
   * Get debug logs filtered by date range
   */
  async getDebugLogsByDateRange(dateFrom?: string, dateTo?: string, limit: number = 100): Promise<DebugLog[]> {
    let whereClause = '';
    
    if (dateFrom || dateTo) {
      const conditions = [];
      if (dateFrom) {
        conditions.push(`LastModifiedDate >= ${dateFrom}`);
      }
      if (dateTo) {
        conditions.push(`LastModifiedDate <= ${dateTo}`);
      }
      whereClause = ` WHERE ${conditions.join(' AND ')}`;
    }

    try {
      const response = await this.client.get('/tooling/query/', {
        params: {
          q: `SELECT Id, LogUserId, LogLength, LastModifiedDate, Request, Operation, Application, Status, DurationMilliseconds, StartTime, Location FROM ApexLog${whereClause} ORDER BY LastModifiedDate DESC LIMIT ${limit}`
        }
      });

      return response.data.records;
    } catch (error) {
      throw new Error(`Failed to retrieve debug logs by date range: ${error}`);
    }
  }

  /**
   * Get debug logs for specific user
   */
  async getDebugLogsByUser(userId: string, limit: number = 100): Promise<DebugLog[]> {
    try {
      const response = await this.client.get('/tooling/query/', {
        params: {
          q: `SELECT Id, LogUserId, LogLength, LastModifiedDate, Request, Operation, Application, Status, DurationMilliseconds, StartTime, Location FROM ApexLog WHERE LogUserId = '${userId}' ORDER BY LastModifiedDate DESC LIMIT ${limit}`
        }
      });

      return response.data.records;
    } catch (error) {
      throw new Error(`Failed to retrieve debug logs for user ${userId}: ${error}`);
    }
  }

  /**
   * Get multiple debug log bodies efficiently using batch requests
   */
  async getDebugLogBodies(logIds: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const batchSize = 10; // Process in batches to avoid overwhelming the API
    
    for (let i = 0; i < logIds.length; i += batchSize) {
      const batch = logIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (logId) => {
        try {
          const body = await this.getDebugLogBody(logId);
          return { logId, body };
        } catch (error) {
          console.warn(`Failed to retrieve log body for ${logId}: ${error}`);
          return { logId, body: null };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({ logId, body }) => {
        if (body !== null) {
          results.set(logId, body);
        }
      });
      
      // Small delay between batches to be respectful to the API
      if (i + batchSize < logIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }

  /**
   * Get ALL debug logs using batching to handle large datasets
   */
  async getAllDebugLogs(maxLogs?: number): Promise<DebugLog[]> {
    const allLogs: DebugLog[] = [];
    const batchSize = 200; // Salesforce SOQL limit per query
    let offset = 0;
    let hasMore = true;

    console.log('📦 Fetching logs in batches...');

    while (hasMore && (!maxLogs || allLogs.length < maxLogs)) {
      try {
        const remainingLogs = maxLogs ? maxLogs - allLogs.length : batchSize;
        const currentBatchSize = Math.min(batchSize, remainingLogs);
        
        const response = await this.client.get('/tooling/query/', {
          params: {
            q: `SELECT Id, LogUserId, LogLength, LastModifiedDate, Request, Operation, Application, Status, DurationMilliseconds, StartTime, Location FROM ApexLog ORDER BY LastModifiedDate DESC LIMIT ${currentBatchSize} OFFSET ${offset}`
          }
        });

        const batch = response.data.records;
        allLogs.push(...batch);

        console.log(`   Batch ${Math.floor(offset / batchSize) + 1}: ${batch.length} logs (total: ${allLogs.length})`);

        // Check if we got fewer logs than requested (end of data)
        hasMore = batch.length === currentBatchSize;
        offset += batch.length;

        // Small delay between batches to be API-friendly
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.warn(`Failed to fetch batch at offset ${offset}: ${error}`);
        break;
      }
    }

    console.log(`✅ Fetched ${allLogs.length} total logs`);
    return allLogs;
  }

  /**
   * Get ALL debug logs by user using batching
   */
  async getAllDebugLogsByUser(userId: string, maxLogs?: number): Promise<DebugLog[]> {
    const allLogs: DebugLog[] = [];
    const batchSize = 200;
    let offset = 0;
    let hasMore = true;

    console.log(`📦 Fetching logs for user ${userId} in batches...`);

    while (hasMore && (!maxLogs || allLogs.length < maxLogs)) {
      try {
        const remainingLogs = maxLogs ? maxLogs - allLogs.length : batchSize;
        const currentBatchSize = Math.min(batchSize, remainingLogs);

        const response = await this.client.get('/tooling/query/', {
          params: {
            q: `SELECT Id, LogUserId, LogLength, LastModifiedDate, Request, Operation, Application, Status, DurationMilliseconds, StartTime, Location FROM ApexLog WHERE LogUserId = '${userId}' ORDER BY LastModifiedDate DESC LIMIT ${currentBatchSize} OFFSET ${offset}`
          }
        });

        const batch = response.data.records;
        allLogs.push(...batch);

        console.log(`   Batch ${Math.floor(offset / batchSize) + 1}: ${batch.length} logs (total: ${allLogs.length})`);

        hasMore = batch.length === currentBatchSize;
        offset += batch.length;

        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.warn(`Failed to fetch batch at offset ${offset}: ${error}`);
        break;
      }
    }

    console.log(`✅ Fetched ${allLogs.length} total logs for user`);
    return allLogs;
  }

  /**
   * Get ALL debug logs by date range using batching
   */
  async getAllDebugLogsByDateRange(dateFrom?: string, dateTo?: string, maxLogs?: number): Promise<DebugLog[]> {
    const allLogs: DebugLog[] = [];
    const batchSize = 200;
    let offset = 0;
    let hasMore = true;

    let whereClause = '';
    if (dateFrom || dateTo) {
      const conditions = [];
      if (dateFrom) {
        conditions.push(`LastModifiedDate >= ${dateFrom}`);
      }
      if (dateTo) {
        conditions.push(`LastModifiedDate <= ${dateTo}`);
      }
      whereClause = ` WHERE ${conditions.join(' AND ')}`;
    }

    console.log(`📦 Fetching logs by date range in batches...`);

    while (hasMore && (!maxLogs || allLogs.length < maxLogs)) {
      try {
        const remainingLogs = maxLogs ? maxLogs - allLogs.length : batchSize;
        const currentBatchSize = Math.min(batchSize, remainingLogs);

        const response = await this.client.get('/tooling/query/', {
          params: {
            q: `SELECT Id, LogUserId, LogLength, LastModifiedDate, Request, Operation, Application, Status, DurationMilliseconds, StartTime, Location FROM ApexLog${whereClause} ORDER BY LastModifiedDate DESC LIMIT ${currentBatchSize} OFFSET ${offset}`
          }
        });

        const batch = response.data.records;
        allLogs.push(...batch);

        console.log(`   Batch ${Math.floor(offset / batchSize) + 1}: ${batch.length} logs (total: ${allLogs.length})`);

        hasMore = batch.length === currentBatchSize;
        offset += batch.length;

        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.warn(`Failed to fetch batch at offset ${offset}: ${error}`);
        break;
      }
    }

    console.log(`✅ Fetched ${allLogs.length} total logs by date range`);
    return allLogs;
  }

  /**
   * Get total count of debug logs (estimate)
   */
  async getDebugLogCount(userId?: string, dateFrom?: string, dateTo?: string): Promise<number> {
    try {
      let whereClause = '';
      const conditions = [];
      
      if (userId) {
        conditions.push(`LogUserId = '${userId}'`);
      }
      if (dateFrom) {
        conditions.push(`LastModifiedDate >= ${dateFrom}`);
      }
      if (dateTo) {
        conditions.push(`LastModifiedDate <= ${dateTo}`);
      }
      
      if (conditions.length > 0) {
        whereClause = ` WHERE ${conditions.join(' AND ')}`;
      }

      const response = await this.client.get('/tooling/query/', {
        params: {
          q: `SELECT COUNT(Id) totalCount FROM ApexLog${whereClause}`
        }
      });

      return response.data.records[0]?.totalCount || 0;
    } catch (error) {
      // If COUNT() fails, fall back to estimation method
      console.warn('COUNT query failed, using estimation method');
      return this.estimateLogCount(userId, dateFrom, dateTo);
    }
  }

  /**
   * Estimate log count by sampling
   */
  private async estimateLogCount(userId?: string, dateFrom?: string, dateTo?: string): Promise<number> {
    try {
      // Get a sample and estimate based on that
      const sampleSize = 200;
      let logs: DebugLog[];
      
      if (userId) {
        logs = await this.getDebugLogsByUser(userId, sampleSize);
      } else if (dateFrom || dateTo) {
        logs = await this.getDebugLogsByDateRange(dateFrom, dateTo, sampleSize);
      } else {
        logs = await this.getDebugLogs(sampleSize);
      }

      // If we got less than the sample size, that's likely the total
      if (logs.length < sampleSize) {
        return logs.length;
      }

      // Otherwise, this is just an estimate
      return logs.length;
    } catch (error) {
      throw new Error(`Failed to estimate log count: ${error}`);
    }
  }

  /**
   * Test the connection with current session token
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/tooling/query/', {
        params: {
          q: 'SELECT Id FROM ApexLog LIMIT 1'
        }
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
