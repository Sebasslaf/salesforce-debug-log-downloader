#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import moment from 'moment';
import { SalesforceClient } from './salesforce-client';
import { LogSearcher } from './log-search';
import { SearchOptions, DownloadOptions } from './types';
import * as path from 'path';

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name('sf-debug-search')
  .description('Search Salesforce debug logs using session tokens')
  .version('1.0.0');

// Global options
program
  .option('-i, --instance-url <url>', 'Salesforce instance URL', process.env.SF_INSTANCE_URL)
  .option('-t, --session-token <token>', 'Salesforce session token', process.env.SF_SESSION_TOKEN)
  .option('-v, --api-version <version>', 'Salesforce API version', process.env.SF_API_VERSION || '58.0');

// Search command
program
  .command('search <searchText>')
  .description('Search for text in debug logs')
  .option('-c, --case-sensitive', 'Case sensitive search', false)
  .option('-m, --max-results <number>', 'Maximum number of logs to search', '100')
  .option('-u, --user-id <userId>', 'Filter logs by user ID')
  .option('--date-from <date>', 'Filter logs from date (YYYY-MM-DD or ISO format)')
  .option('--date-to <date>', 'Filter logs to date (YYYY-MM-DD or ISO format)')
  .option('--context <lines>', 'Number of context lines to show', '2')
  .option('-d, --download [dir]', 'Download matching logs to specified directory (default: ./logs)')
  .option('--no-metadata', 'Skip saving metadata files when downloading')
  .option('--no-summary', 'Skip creating download summary when downloading')
  .option('--verbose', 'Show detailed download progress')
  .option('--all', 'Search through ALL logs using batching (may take time for large datasets)')
  .option('--search-max <number>', 'Maximum number of logs to search through when using --all (default: unlimited)', '0')
  .action(async (searchText, options) => {
    try {
      const client = createClient(program.opts());
      const searcher = new LogSearcher(client);

      console.log(chalk.blue('🔍 Searching Salesforce debug logs...'));
      console.log(chalk.gray(`Search term: "${searchText}"`));

      const searchOptions: SearchOptions = {
        searchText,
        caseSensitive: options.caseSensitive,
        maxResults: options.all 
          ? (parseInt(options.searchMax) || undefined) // undefined means unlimited
          : parseInt(options.maxResults),
        userId: options.userId,
        dateFrom: formatDate(options.dateFrom),
        dateTo: formatDate(options.dateTo)
      };

      if (options.all) {
        console.log(chalk.yellow('🔄 Searching through ALL logs (this may take a while for large datasets)...'));
      }

      // Test connection first
      console.log(chalk.gray('Testing connection...'));
      const isConnected = await client.testConnection();
      if (!isConnected) {
        console.error(chalk.red('❌ Failed to connect to Salesforce. Please check your credentials.'));
        process.exit(1);
      }
      console.log(chalk.green('✅ Connected to Salesforce'));

      // Start timing
      const startTime = Date.now();

      // Check if download is requested
      if (options.download !== undefined) {
        const downloadDir = typeof options.download === 'string' 
          ? path.resolve(options.download)
          : path.resolve('./logs');

        const downloadOptions: DownloadOptions = {
          outputDir: downloadDir,
          includeMetadata: !options.noMetadata,
          createSummary: !options.noSummary,
          verbose: options.verbose
        };

        console.log(chalk.blue(`📥 Download mode enabled. Output directory: ${downloadDir}`));

        const downloadResult = await searcher.searchAndDownloadLogs(searchOptions, downloadOptions, options.all);

        // Display download summary
        console.log(chalk.green('\n📊 Download Summary:'));
        console.log(chalk.white(`   Search term: "${downloadResult.searchText}"`));
        console.log(chalk.white(`   Total logs searched: ${downloadResult.totalLogsSearched}`));
        console.log(chalk.white(`   Logs with matches: ${downloadResult.matchingLogs}`));
        console.log(chalk.green(`   ✅ Successfully downloaded: ${downloadResult.downloadedLogs}`));
        
        if (downloadResult.failedDownloads.length > 0) {
          console.log(chalk.red(`   ❌ Failed downloads: ${downloadResult.failedDownloads.length}`));
          if (options.verbose) {
            downloadResult.failedDownloads.forEach(logId => {
              console.log(chalk.red(`      - ${logId}`));
            });
          }
        }
        
        console.log(chalk.white(`   📁 Download location: ${downloadResult.downloadPath}`));
        console.log(chalk.white(`   💾 Total size: ${require('./file-utils').FileUtils.formatBytes(downloadResult.estimatedSize)}`));
        
        // Show timing
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        console.log(chalk.white(`   ⏱️  Total time: ${duration} seconds`));

        return;
      }

      // Regular search mode (no download)
      const { results, totalLogsSearched } = options.all 
        ? await searcher.searchAllLogsWithStats(searchOptions)
        : await searcher.searchLogsWithStats(searchOptions);

      // Calculate timing
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      // Always show search summary
      console.log(chalk.blue(`\n📊 Search Summary:`));
      console.log(chalk.white(`   Search term: "${searchOptions.searchText}"`));
      console.log(chalk.white(`   Total logs searched: ${totalLogsSearched}`));
      console.log(chalk.white(`   Logs with matches: ${results.length}`));
      console.log(chalk.white(`   ⏱️  Search time: ${duration} seconds`));

      if (results.length === 0) {
        console.log(chalk.yellow('\n❌ No matches found.'));
        return;
      }

      console.log(chalk.green(`\n🎯 Detailed Results:\n`));

      results.forEach((result, index) => {
        console.log(chalk.cyan(`\n📋 Log ${index + 1}: ${result.log.Id}`));
        console.log(chalk.gray(`   User: ${result.log.LogUserId}`));
        console.log(chalk.gray(`   Date: ${moment(result.log.LastModifiedDate).format('YYYY-MM-DD HH:mm:ss')}`));
        console.log(chalk.gray(`   Operation: ${result.log.Operation}`));
        console.log(chalk.gray(`   Status: ${result.log.Status}`));
        console.log(chalk.gray(`   Duration: ${result.log.DurationMilliseconds}ms`));
        console.log(chalk.gray(`   Length: ${result.log.LogLength} bytes`));

        console.log(chalk.yellow(`\n   📍 ${result.matches.length} matches found:`));

        result.matches.forEach((match, matchIndex) => {
          console.log(chalk.white(`\n   Match ${matchIndex + 1} (line ${match.lineNumber}):`));
          console.log(chalk.green(`   → ${match.line}`));
          
          if (match.context && match.context.length > 0) {
            console.log(chalk.gray('   Context:'));
            match.context.forEach(contextLine => {
              console.log(chalk.gray(`     ${contextLine}`));
            });
          }
        });
        console.log(chalk.gray('   ' + '─'.repeat(80)));
      });

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error}`));
      process.exit(1);
    }
  });

// Multi-search command
program
  .command('multi-search <patterns...>')
  .description('Search for multiple patterns in debug logs')
  .option('-c, --case-sensitive', 'Case sensitive search', false)
  .option('-m, --max-results <number>', 'Maximum number of logs to search', '100')
  .option('-u, --user-id <userId>', 'Filter logs by user ID')
  .option('--date-from <date>', 'Filter logs from date (YYYY-MM-DD or ISO format)')
  .option('--date-to <date>', 'Filter logs to date (YYYY-MM-DD or ISO format)')
  .action(async (patterns, options) => {
    try {
      const client = createClient(program.opts());
      const searcher = new LogSearcher(client);

      console.log(chalk.blue('🔍 Searching Salesforce debug logs for multiple patterns...'));
      console.log(chalk.gray(`Patterns: ${patterns.join(', ')}`));

      const searchOptions = {
        caseSensitive: options.caseSensitive,
        maxResults: parseInt(options.maxResults),
        userId: options.userId,
        dateFrom: formatDate(options.dateFrom),
        dateTo: formatDate(options.dateTo)
      };

      // Test connection first
      console.log(chalk.gray('Testing connection...'));
      const isConnected = await client.testConnection();
      if (!isConnected) {
        console.error(chalk.red('❌ Failed to connect to Salesforce. Please check your credentials.'));
        process.exit(1);
      }
      console.log(chalk.green('✅ Connected to Salesforce'));

      const results = await searcher.searchMultiplePatterns(patterns, searchOptions);

      let totalMatches = 0;
      results.forEach((patternResults, pattern) => {
        totalMatches += patternResults.length;
        console.log(chalk.cyan(`\n🎯 Pattern "${pattern}": ${patternResults.length} logs with matches`));
        
        patternResults.forEach((result, index) => {
          console.log(chalk.white(`  📋 Log ${index + 1}: ${result.log.Id} (${result.matches.length} matches)`));
        });
      });

      if (totalMatches === 0) {
        console.log(chalk.yellow('No matches found for any pattern.'));
      }

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error}`));
      process.exit(1);
    }
  });

// List logs command
program
  .command('list')
  .description('List recent debug logs')
  .option('-m, --max-results <number>', 'Maximum number of logs to list', '20')
  .option('-u, --user-id <userId>', 'Filter logs by user ID')
  .option('--date-from <date>', 'Filter logs from date (YYYY-MM-DD or ISO format)')
  .option('--date-to <date>', 'Filter logs to date (YYYY-MM-DD or ISO format)')
  .action(async (options) => {
    try {
      const client = createClient(program.opts());

      console.log(chalk.blue('📋 Listing recent debug logs...'));

      // Test connection first
      console.log(chalk.gray('Testing connection...'));
      const isConnected = await client.testConnection();
      if (!isConnected) {
        console.error(chalk.red('❌ Failed to connect to Salesforce. Please check your credentials.'));
        process.exit(1);
      }
      console.log(chalk.green('✅ Connected to Salesforce'));

      let logs;
      if (options.userId) {
        logs = await client.getDebugLogsByUser(options.userId, parseInt(options.maxResults));
      } else if (options.dateFrom || options.dateTo) {
        logs = await client.getDebugLogsByDateRange(
          formatDate(options.dateFrom),
          formatDate(options.dateTo),
          parseInt(options.maxResults)
        );
      } else {
        logs = await client.getDebugLogs(parseInt(options.maxResults));
      }

      if (logs.length === 0) {
        console.log(chalk.yellow('No debug logs found.'));
        return;
      }

      console.log(chalk.green(`\nFound ${logs.length} debug logs:\n`));

      logs.forEach((log, index) => {
        console.log(chalk.cyan(`📋 Log ${index + 1}: ${log.Id}`));
        console.log(chalk.gray(`   User: ${log.LogUserId}`));
        console.log(chalk.gray(`   Date: ${moment(log.LastModifiedDate).format('YYYY-MM-DD HH:mm:ss')}`));
        console.log(chalk.gray(`   Operation: ${log.Operation}`));
        console.log(chalk.gray(`   Status: ${log.Status}`));
        console.log(chalk.gray(`   Duration: ${log.DurationMilliseconds}ms`));
        console.log(chalk.gray(`   Length: ${log.LogLength} bytes`));
        console.log('');
      });

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error}`));
      process.exit(1);
    }
  });

// Download command
program
  .command('download <logIds...>')
  .description('Download specific logs by their IDs')
  .option('-o, --output-dir <dir>', 'Output directory for downloaded logs', './logs')
  .option('--no-metadata', 'Skip saving metadata files')
  .option('--no-summary', 'Skip creating download summary')
  .option('--verbose', 'Show detailed download progress')
  .action(async (logIds, options) => {
    try {
      const client = createClient(program.opts());
      const searcher = new LogSearcher(client);

      console.log(chalk.blue(`📥 Downloading ${logIds.length} specific logs...`));

      // Test connection first
      console.log(chalk.gray('Testing connection...'));
      const isConnected = await client.testConnection();
      if (!isConnected) {
        console.error(chalk.red('❌ Failed to connect to Salesforce. Please check your credentials.'));
        process.exit(1);
      }
      console.log(chalk.green('✅ Connected to Salesforce'));

      const downloadOptions: DownloadOptions = {
        outputDir: path.resolve(options.outputDir),
        includeMetadata: !options.noMetadata,
        createSummary: !options.noSummary,
        verbose: options.verbose
      };

      const downloadResult = await searcher.downloadLogsByIds(logIds, downloadOptions);

      // Display download summary
      console.log(chalk.green('\n📊 Download Summary:'));
      console.log(chalk.white(`   Requested logs: ${logIds.length}`));
      console.log(chalk.green(`   ✅ Successfully downloaded: ${downloadResult.downloadedLogs}`));
      
      if (downloadResult.failedDownloads.length > 0) {
        console.log(chalk.red(`   ❌ Failed downloads: ${downloadResult.failedDownloads.length}`));
        if (options.verbose) {
          downloadResult.failedDownloads.forEach(logId => {
            console.log(chalk.red(`      - ${logId}`));
          });
        }
      }
      
      console.log(chalk.white(`   📁 Download location: ${downloadResult.downloadPath}`));

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error}`));
      process.exit(1);
    }
  });

// Count logs command
program
  .command('count')
  .description('Show total number of debug logs available')
  .option('-u, --user-id <userId>', 'Count logs for specific user')
  .option('--date-from <date>', 'Count logs from date (YYYY-MM-DD or ISO format)')
  .option('--date-to <date>', 'Count logs to date (YYYY-MM-DD or ISO format)')
  .option('--detailed', 'Show detailed breakdown by user and operation')
  .option('--all', 'Fetch ALL logs using batching (may take time for large datasets)')
  .option('--max <number>', 'Maximum number of logs to fetch (default: 2000)', '2000')
  .action(async (options) => {
    try {
      const client = createClient(program.opts());

      console.log(chalk.blue('📊 Counting debug logs...'));

      // Test connection first
      console.log(chalk.gray('Testing connection...'));
      const isConnected = await client.testConnection();
      if (!isConnected) {
        console.error(chalk.red('❌ Failed to connect to Salesforce. Please check your credentials.'));
        process.exit(1);
      }
      console.log(chalk.green('✅ Connected to Salesforce'));

      let logs;
      const maxLogs = options.all ? undefined : parseInt(options.max);

      if (options.all) {
        console.log(chalk.yellow('🔄 Fetching ALL logs (this may take a while for large datasets)...'));
        
        if (options.userId) {
          logs = await client.getAllDebugLogsByUser(options.userId, maxLogs);
          console.log(chalk.cyan(`\n📋 ALL debug logs for user ${options.userId}:`));
        } else if (options.dateFrom || options.dateTo) {
          logs = await client.getAllDebugLogsByDateRange(
            formatDate(options.dateFrom),
            formatDate(options.dateTo),
            maxLogs
          );
          const dateRange = [
            options.dateFrom ? `from ${options.dateFrom}` : '',
            options.dateTo ? `to ${options.dateTo}` : ''
          ].filter(Boolean).join(' ');
          console.log(chalk.cyan(`\n📋 ALL debug logs ${dateRange}:`));
        } else {
          logs = await client.getAllDebugLogs(maxLogs);
          console.log(chalk.cyan(`\n📋 ALL debug logs:`));
        }
      } else {
        // Quick count using limited fetch
        if (options.userId) {
          logs = await client.getDebugLogsByUser(options.userId, maxLogs);
          console.log(chalk.cyan(`\n📋 Debug logs for user ${options.userId} (sample):`));
        } else if (options.dateFrom || options.dateTo) {
          logs = await client.getDebugLogsByDateRange(
            formatDate(options.dateFrom),
            formatDate(options.dateTo),
            maxLogs
          );
          const dateRange = [
            options.dateFrom ? `from ${options.dateFrom}` : '',
            options.dateTo ? `to ${options.dateTo}` : ''
          ].filter(Boolean).join(' ');
          console.log(chalk.cyan(`\n📋 Debug logs ${dateRange} (sample):`));
        } else {
          logs = await client.getDebugLogs(maxLogs);
          console.log(chalk.cyan(`\n📋 Recent debug logs (sample):`));
        }
      }

      // Basic count
      console.log(chalk.green(`   Total logs found: ${logs.length}`));
      if (!options.all && logs.length === maxLogs) {
        console.log(chalk.yellow(`   ⚠️  Showing first ${maxLogs} logs (use --all to fetch everything)`));
      }

      if (logs.length === 0) {
        console.log(chalk.yellow('   No logs found for the specified criteria.'));
        return;
      }

      // Calculate total size
      const totalSize = logs.reduce((sum, log) => sum + log.LogLength, 0);
      console.log(chalk.white(`   Total size: ${require('./file-utils').FileUtils.formatBytes(totalSize)}`));

      // Date range of logs
      if (logs.length > 0) {
        const dates = logs.map(log => new Date(log.LastModifiedDate)).sort((a, b) => a.getTime() - b.getTime());
        const oldest = moment(dates[0]).format('YYYY-MM-DD HH:mm:ss');
        const newest = moment(dates[dates.length - 1]).format('YYYY-MM-DD HH:mm:ss');
        console.log(chalk.white(`   Date range: ${oldest} to ${newest}`));
      }

      // Detailed breakdown
      if (options.detailed) {
        console.log(chalk.blue('\n📈 Detailed Breakdown:'));

        // Group by user
        const byUser = logs.reduce((acc, log) => {
          acc[log.LogUserId] = (acc[log.LogUserId] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        console.log(chalk.yellow('\n👥 By User:'));
        Object.entries(byUser)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10) // Top 10 users
          .forEach(([userId, count]) => {
            console.log(chalk.white(`   ${userId}: ${count} logs`));
          });

        // Group by operation
        const byOperation = logs.reduce((acc, log) => {
          acc[log.Operation] = (acc[log.Operation] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        console.log(chalk.yellow('\n⚙️  By Operation:'));
        Object.entries(byOperation)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10) // Top 10 operations
          .forEach(([operation, count]) => {
            console.log(chalk.white(`   ${operation}: ${count} logs`));
          });

        // Group by status
        const byStatus = logs.reduce((acc, log) => {
          acc[log.Status] = (acc[log.Status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        console.log(chalk.yellow('\n📊 By Status:'));
        Object.entries(byStatus)
          .sort(([,a], [,b]) => b - a)
          .forEach(([status, count]) => {
            console.log(chalk.white(`   ${status}: ${count} logs`));
          });

        // Average log size
        const avgSize = totalSize / logs.length;
        console.log(chalk.white(`\n📏 Average log size: ${require('./file-utils').FileUtils.formatBytes(avgSize)}`));
      }

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error}`));
      process.exit(1);
    }
  });

// Delete logs command
program
  .command('delete <logIds...>')
  .description('⚠️  DELETE specific debug logs by their IDs (DESTRUCTIVE OPERATION)')
  .option('--force', 'Skip confirmation prompt (dangerous!)')
  .option('--dry-run', 'Show what would be deleted without actually deleting')
  .action(async (logIds, options) => {
    try {
      const client = createClient(program.opts());

      console.log(chalk.red('⚠️  DESTRUCTIVE OPERATION: DELETE DEBUG LOGS'));
      console.log(chalk.yellow(`📋 Requested to delete ${logIds.length} log(s):`));
      
      logIds.forEach((logId: string, index: number) => {
        console.log(chalk.white(`   ${index + 1}. ${logId}`));
      });

      // Test connection first
      console.log(chalk.gray('\nTesting connection...'));
      const isConnected = await client.testConnection();
      if (!isConnected) {
        console.error(chalk.red('❌ Failed to connect to Salesforce. Please check your credentials.'));
        process.exit(1);
      }
      console.log(chalk.green('✅ Connected to Salesforce'));

      // Dry run mode
      if (options.dryRun) {
        console.log(chalk.yellow('\n🔍 DRY RUN MODE - No actual deletions will be made'));
        console.log(chalk.blue('The following logs would be deleted:'));
        logIds.forEach((logId: string, index: number) => {
          console.log(chalk.white(`   ${index + 1}. ${logId}`));
        });
        console.log(chalk.yellow('\n💡 Run without --dry-run to actually delete these logs'));
        return;
      }

      // Safety confirmation (unless --force is used)
      if (!options.force) {
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(chalk.red('\n⚠️  Are you absolutely sure you want to DELETE these logs? This cannot be undone! (type "DELETE" to confirm): '), resolve);
        });
        
        rl.close();

        if (answer !== 'DELETE') {
          console.log(chalk.yellow('❌ Deletion cancelled. Logs were not deleted.'));
          return;
        }
      }

      // Start timing
      const startTime = Date.now();
      
      console.log(chalk.red('\n🗑️  Starting deletion process...'));
      const { deleted, failed } = await client.deleteDebugLogs(logIds);

      // Calculate timing
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      // Display results
      console.log(chalk.blue('\n📊 Deletion Summary:'));
      console.log(chalk.green(`   ✅ Successfully deleted: ${deleted.length}`));
      if (failed.length > 0) {
        console.log(chalk.red(`   ❌ Failed to delete: ${failed.length}`));
        console.log(chalk.red('   Failed log IDs:'));
        failed.forEach(logId => {
          console.log(chalk.red(`      - ${logId}`));
        });
      }
      console.log(chalk.white(`   ⏱️  Total time: ${duration} seconds`));

      if (deleted.length > 0) {
        console.log(chalk.red('\n⚠️  LOGS HAVE BEEN PERMANENTLY DELETED!'));
      }

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error}`));
      process.exit(1);
    }
  });

// Delete all logs command (VERY DANGEROUS)
program
  .command('delete-all')
  .description('⚠️  DELETE ALL debug logs in the org (EXTREMELY DANGEROUS)')
  .option('--force', 'Skip confirmation prompts (extremely dangerous!)')
  .option('--dry-run', 'Show what would be deleted without actually deleting')
  .option('-u, --user-id <userId>', 'Delete logs only for specific user')
  .option('--date-from <date>', 'Delete logs from date (YYYY-MM-DD or ISO format)')
  .option('--date-to <date>', 'Delete logs to date (YYYY-MM-DD or ISO format)')
  .action(async (options) => {
    try {
      const client = createClient(program.opts());

      console.log(chalk.red('🚨 EXTREMELY DANGEROUS OPERATION: DELETE ALL DEBUG LOGS'));
      
      // Test connection first
      console.log(chalk.gray('Testing connection...'));
      const isConnected = await client.testConnection();
      if (!isConnected) {
        console.error(chalk.red('❌ Failed to connect to Salesforce. Please check your credentials.'));
        process.exit(1);
      }
      console.log(chalk.green('✅ Connected to Salesforce'));

      // Get logs to delete
      let logs;
      if (options.userId) {
        logs = await client.getAllDebugLogsByUser(options.userId);
        console.log(chalk.yellow(`📋 Found ${logs.length} logs for user ${options.userId}`));
      } else if (options.dateFrom || options.dateTo) {
        logs = await client.getAllDebugLogsByDateRange(
          formatDate(options.dateFrom),
          formatDate(options.dateTo)
        );
        const dateRange = [
          options.dateFrom ? `from ${options.dateFrom}` : '',
          options.dateTo ? `to ${options.dateTo}` : ''
        ].filter(Boolean).join(' ');
        console.log(chalk.yellow(`📋 Found ${logs.length} logs ${dateRange}`));
      } else {
        logs = await client.getAllDebugLogs();
        console.log(chalk.red(`📋 Found ${logs.length} TOTAL logs in the org`));
      }

      if (logs.length === 0) {
        console.log(chalk.yellow('No logs found to delete.'));
        return;
      }

      // Dry run mode
      if (options.dryRun) {
        console.log(chalk.yellow('\n🔍 DRY RUN MODE - No actual deletions will be made'));
        console.log(chalk.blue(`Would delete ${logs.length} logs`));
        console.log(chalk.yellow('\n💡 Run without --dry-run to actually delete these logs'));
        return;
      }

      // Multiple safety confirmations (unless --force is used)
      if (!options.force) {
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        // First confirmation
        const answer1 = await new Promise<string>((resolve) => {
          rl.question(chalk.red(`\n⚠️  You are about to DELETE ${logs.length} debug logs. This CANNOT be undone! Type "I UNDERSTAND" to continue: `), resolve);
        });
        
        if (answer1 !== 'I UNDERSTAND') {
          rl.close();
          console.log(chalk.yellow('❌ Deletion cancelled. Logs were not deleted.'));
          return;
        }

        // Second confirmation
        const answer2 = await new Promise<string>((resolve) => {
          rl.question(chalk.red(`\n🚨 FINAL WARNING: This will permanently delete ${logs.length} logs. Type "DELETE ALL LOGS" to proceed: `), resolve);
        });
        
        rl.close();

        if (answer2 !== 'DELETE ALL LOGS') {
          console.log(chalk.yellow('❌ Deletion cancelled. Logs were not deleted.'));
          return;
        }
      }

      // Start timing
      const startTime = Date.now();
      
      console.log(chalk.red('\n🗑️  Starting mass deletion process...'));
      const logIds = logs.map(log => log.Id);
      const { deleted, failed } = await client.deleteDebugLogs(logIds);

      // Calculate timing
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      // Display results
      console.log(chalk.blue('\n📊 Mass Deletion Summary:'));
      console.log(chalk.green(`   ✅ Successfully deleted: ${deleted.length}`));
      if (failed.length > 0) {
        console.log(chalk.red(`   ❌ Failed to delete: ${failed.length}`));
      }
      console.log(chalk.white(`   ⏱️  Total time: ${duration} seconds`));

      if (deleted.length > 0) {
        console.log(chalk.red('\n🚨 LOGS HAVE BEEN PERMANENTLY DELETED FROM YOUR ORG!'));
      }

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error}`));
      process.exit(1);
    }
  });

// Test connection command
program
  .command('test')
  .description('Test connection to Salesforce')
  .action(async () => {
    try {
      const client = createClient(program.opts());
      
      console.log(chalk.blue('🔗 Testing connection to Salesforce...'));
      
      const isConnected = await client.testConnection();
      
      if (isConnected) {
        console.log(chalk.green('✅ Connection successful!'));
        
        // Get a sample log to show more info
        const logs = await client.getDebugLogs(1);
        if (logs.length > 0) {
          console.log(chalk.gray(`Sample log found: ${logs[0].Id}`));
        }
      } else {
        console.log(chalk.red('❌ Connection failed. Please check your credentials.'));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error}`));
      process.exit(1);
    }
  });

function createClient(options: any): SalesforceClient {
  if (!options.instanceUrl || !options.sessionToken) {
    console.error(chalk.red('❌ Missing required configuration:'));
    if (!options.instanceUrl) console.error(chalk.red('  - Instance URL (use --instance-url or SF_INSTANCE_URL env var)'));
    if (!options.sessionToken) console.error(chalk.red('  - Session Token (use --session-token or SF_SESSION_TOKEN env var)'));
    process.exit(1);
  }

  return new SalesforceClient({
    instanceUrl: options.instanceUrl,
    sessionToken: options.sessionToken,
    apiVersion: options.apiVersion
  });
}

function formatDate(dateInput?: string): string | undefined {
  if (!dateInput) return undefined;
  
  // If it's already in ISO format, return as is
  if (dateInput.includes('T')) {
    return dateInput;
  }
  
  // Parse YYYY-MM-DD format and convert to ISO
  const date = moment(dateInput, 'YYYY-MM-DD');
  if (!date.isValid()) {
    throw new Error(`Invalid date format: ${dateInput}. Use YYYY-MM-DD or ISO format.`);
  }
  
  return date.toISOString();
}

program.parse();
