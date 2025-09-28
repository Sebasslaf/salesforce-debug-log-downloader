<<<<<<< HEAD
# Salesforce Debug Log Search

A powerful command-line tool to search through Salesforce debug logs using session tokens. Perfect for developers who need to quickly find specific patterns, errors, or events across multiple debug logs.

## Features

- 🔍 **Text Search**: Search for specific text patterns across debug logs
- 📥 **Auto Download**: Automatically download matching logs to local folder
- 📅 **Date Filtering**: Filter logs by date ranges
- 👤 **User Filtering**: Search logs for specific users
- 🎯 **Multi-Pattern Search**: Search for multiple patterns simultaneously
- 📋 **Context Lines**: Show surrounding lines for better understanding
- 📊 **Smart Metadata**: Save log metadata and search results as JSON
- ⚡ **Batch Processing**: Efficient batch downloads with API rate limiting
- 🚀 **Fast & Efficient**: Uses Salesforce REST API for optimal performance
- 💻 **CLI Interface**: Easy-to-use command-line interface

## Installation

```bash
npm install -g salesforce-debug-log-search
```

Or run directly with npx:
```bash
npx salesforce-debug-log-search
```

## Configuration

### Environment Variables

Create a `.env` file in your project root or set these environment variables:

```bash
SF_INSTANCE_URL=https://your-org.my.salesforce.com
SF_SESSION_TOKEN=your_session_token_here
SF_API_VERSION=58.0  # Optional, defaults to 58.0
```

### Getting Your Session Token

You can obtain your Salesforce session token in several ways:

1. **Browser Developer Tools**:
   - Open Salesforce in your browser
   - Open Developer Tools (F12)
   - Go to Application/Storage → Cookies
   - Find the `sid` cookie value

2. **Salesforce CLI**:
   ```bash
   sf org display --verbose
   ```

3. **VS Code Salesforce Extension**:
   - Command Palette → "SFDX: Display Org Details for Default Org"

## Usage

### Basic Search

Search for text across debug logs:
```bash
sf-debug-search search "EXCEPTION"
```

### Advanced Options

```bash
# Case-sensitive search
sf-debug-search search "MyClass" --case-sensitive

# Search specific user's logs
sf-debug-search search "error" --user-id 005000000012345

# Search within date range
sf-debug-search search "timeout" --date-from 2024-01-01 --date-to 2024-01-31

# Limit results and context
sf-debug-search search "SOQL" --max-results 50 --context 5
```

### Download Matching Logs

Automatically download logs that match your search pattern:

```bash
# Download matching logs to default ./logs directory
sf-debug-search search "EXCEPTION" --download

# Download to custom directory
sf-debug-search search "EXCEPTION" --download ./my-logs

# Download with verbose output and no metadata
sf-debug-search search "ERROR" --download --verbose --no-metadata

# Download without summary file
sf-debug-search search "FATAL" --download --no-summary
```

### Multi-Pattern Search

Search for multiple patterns at once:
```bash
sf-debug-search multi-search "EXCEPTION" "ERROR" "FATAL"
```

### List Recent Logs

View recent debug logs without searching:
```bash
# List 20 most recent logs
sf-debug-search list

# List logs for specific user
sf-debug-search list --user-id 005000000012345

# List logs from date range
sf-debug-search list --date-from 2024-01-01 --max-results 100
```

### Download Specific Logs

Download logs by their IDs:
```bash
# Download specific logs by ID
sf-debug-search download 07L000001234567 07L000001234568 07L000001234569

# Download to custom directory with verbose output
sf-debug-search download 07L000001234567 --output-dir ./critical-logs --verbose
```

### Test Connection

Verify your configuration:
```bash
sf-debug-search test
```

## Command Reference

### Global Options

- `-i, --instance-url <url>`: Salesforce instance URL
- `-t, --session-token <token>`: Salesforce session token  
- `-v, --api-version <version>`: API version (default: 58.0)

### Search Command

```bash
sf-debug-search search <searchText> [options]
```

Options:
- `-c, --case-sensitive`: Case sensitive search
- `-m, --max-results <number>`: Maximum logs to search (default: 100)
- `-u, --user-id <userId>`: Filter by user ID
- `--date-from <date>`: Filter from date (YYYY-MM-DD or ISO)
- `--date-to <date>`: Filter to date (YYYY-MM-DD or ISO)
- `--context <lines>`: Context lines to show (default: 2)
- `-d, --download [dir]`: Download matching logs (default: ./logs)
- `--no-metadata`: Skip saving metadata files when downloading
- `--no-summary`: Skip creating download summary when downloading
- `--verbose`: Show detailed download progress

### Multi-Search Command

```bash
sf-debug-search multi-search <pattern1> <pattern2> ... [options]
```

Same options as search command (except no context option).

### Download Command

```bash
sf-debug-search download <logId1> <logId2> ... [options]
```

Options:
- `-o, --output-dir <dir>`: Output directory (default: ./logs)
- `--no-metadata`: Skip saving metadata files
- `--no-summary`: Skip creating download summary
- `--verbose`: Show detailed download progress

### List Command

```bash
sf-debug-search list [options]
```

Options:
- `-m, --max-results <number>`: Maximum logs to list (default: 20)
- `-u, --user-id <userId>`: Filter by user ID
- `--date-from <date>`: Filter from date
- `--date-to <date>`: Filter to date

## Examples

### Find Exceptions in Recent Logs
```bash
sf-debug-search search "EXCEPTION" --max-results 50
```

### Search for SOQL Issues in Specific User's Logs
```bash
sf-debug-search search "SOQL" --user-id 005000000012345 --case-sensitive
```

### Multi-Pattern Error Search
```bash
sf-debug-search multi-search "NullPointerException" "FIELD_CUSTOM_VALIDATION_EXCEPTION" "REQUIRED_FIELD_MISSING"
```

### Debug Performance Issues
```bash
sf-debug-search search "LIMIT_USAGE" --date-from 2024-01-15 --context 5
```

### Download All Errors from Today
```bash
sf-debug-search search "ERROR" --date-from $(date +%Y-%m-%d) --download ./today-errors --verbose
```

### Download Specific Critical Logs
```bash
sf-debug-search download 07L000001234567 07L000001234568 --output-dir ./critical --verbose
```

## Downloaded File Structure

When you download logs, the tool creates organized files:

```
./logs/
├── 2024-01-15_14-30-45_Anonymous_07L12345.log          # Log content
├── 2024-01-15_14-30-45_Anonymous_07L12345.json         # Metadata + matches
├── 2024-01-15_15-22-10_ValidationRule_07L67890.log     # Another log
├── 2024-01-15_15-22-10_ValidationRule_07L67890.json    # Its metadata
└── download-summary.json                                # Download summary
```

### File Contents

**Log Files (.log)**: Raw debug log content from Salesforce  
**Metadata Files (.json)**: Log metadata plus search match details  
**Summary File**: Overall download statistics and failed downloads

## Programmatic Usage

You can also use this tool as a library in your Node.js applications:

```typescript
import { SalesforceClient, LogSearcher } from 'salesforce-debug-log-search';

const client = new SalesforceClient({
  instanceUrl: 'https://your-org.my.salesforce.com',
  sessionToken: 'your_session_token',
  apiVersion: '58.0'
});

const searcher = new LogSearcher(client);

const results = await searcher.searchLogs({
  searchText: 'EXCEPTION',
  maxResults: 100,
  caseSensitive: false
});

console.log(`Found ${results.length} logs with matches`);
```

## Troubleshooting

### Authentication Issues

- Ensure your session token is valid and not expired
- Verify your instance URL is correct
- Check that you have proper permissions to access debug logs

### No Results Found

- Try case-insensitive search
- Increase `--max-results` limit
- Check date filters aren't too restrictive
- Verify debug logs exist for the specified criteria

### API Errors

- Check your API version compatibility
- Ensure your org allows REST API access
- Verify network connectivity to your Salesforce instance

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.
=======
# salesforce-debug-log-downloader
A powerful CLI tool to search and download Salesforce debug logs using session tokens. Batch process hundreds of logs, find specific patterns, and auto-download matches with organized filenames.
