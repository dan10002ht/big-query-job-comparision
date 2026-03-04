# BigQuery Job Analyzer 📊

Compare BigQuery job patterns between days and detect execution anomalies.

**Features:**
- ✅ Daily job pattern analysis
- ✅ Automatic pattern normalization (groups similar queries)
- ✅ Day-over-day comparison
- ✅ Top 5 pattern change ranking
- ✅ Discord webhook integration
- ✅ Job data caching
- ✅ Manual trigger + optional cron scheduling

---

## Architecture

```
BigQuery INFORMATION_SCHEMA
         ↓
    Fetch Jobs (today)
    Fetch Jobs (yesterday)
         ↓
    Normalize Queries
    Group by Pattern
         ↓
    Calculate Daily Stats
    Top 5 Expensive Patterns
         ↓
    Compare Today vs Yesterday
    Rank by Change Score
         ↓
    Send to Discord
    Archive Data for Next Run
```

---

## Setup

### 1. Prerequisites

- **Node.js** 14+ 
- **GCP Project** with BigQuery enabled
- **Service Account** with BigQuery permissions
- **Discord Webhook** (optional, for notifications)

### 2. Clone Repository

```bash
git clone https://github.com/dan10002ht/big-query-job-comparision.git
cd big-query-job-comparision
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Setup GCP Service Account

```bash
# Create service account (if not done)
gcloud iam service-accounts create bq-analyzer \
  --display-name="BigQuery Job Analyzer"

# Grant BigQuery permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=serviceAccount:bq-analyzer@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/bigquery.dataViewer

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=serviceAccount:bq-analyzer@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/bigquery.jobUser

# Download key
gcloud iam service-accounts keys create key.json \
  --iam-account=bq-analyzer@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 5. Configure Environment

```bash
# Copy example config
cp .env.example .env

# Edit .env with your values
nano .env
```

**Required:**
```env
GCP_PROJECT_ID=your-gcp-project-id
GOOGLE_APPLICATION_CREDENTIALS=./key.json
```

**Optional:**
```env
DISCORD_WEBHOOK=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN
```

### 6. Setup Discord Webhook (Optional)

1. Go to your Discord server
2. **Server Settings** → **Webhooks** → **New Webhook**
3. Select target channel
4. Copy webhook URL
5. Add to `.env` as `DISCORD_WEBHOOK`

---

## Usage

### Manual Trigger

```bash
# Normal run (fetches from BigQuery, sends to Discord)
npm start

# Dry run (shows analysis, no Discord send)
npm run dev

# Test mode (uses cached data, no Discord send)
npm run test
```

### Automatic Scheduling (Cron)

```bash
# Edit crontab
crontab -e

# Add this line to run daily at 8 AM
0 8 * * * cd /path/to/big-query-job-comparision && npm start >> /var/log/bq-analyzer.log 2>&1
```

---

## How It Works

### Level 1: Daily Comparison
- Compares total queries & GB scanned between today and yesterday
- Provides overall statistics

### Level 2: Top 5 Pattern Analysis (Always Runs)
1. **Get top 5 most expensive patterns from TODAY**
2. **Find same patterns in YESTERDAY's data**
3. **Compare execution counts and GB scanned**
4. **Rank by largest change/spike**
5. **Send report to Discord**

### Pattern Matching
Queries are normalized to group similar patterns:
```
SELECT * FROM users WHERE id = 123
SELECT * FROM users WHERE id = 456
        ↓ (normalized)
SELECT * FROM users WHERE id = ?
```

This allows the analyzer to group similar queries regardless of parameter values.

---

## Report Format

### Discord Message

**Daily Summary:**
- Yesterday stats: queries, GB
- Today stats: queries, GB
- Change percentage

**Top 5 Patterns:**
1. Query with largest execution increase
2. Query with largest GB increase
3. New patterns (not in yesterday)
4. ...

**Example:**
```
📊 BigQuery Job Analysis Report
📅 Yesterday: 1000 queries • 500 GB
📅 Today:     1500 queries • 750 GB
📈 Change:    +50% (+500 queries), +50% (+250 GB)

📈 Top 5 Pattern Changes:
1. 🚨 [NEW] SELECT * FROM users...
   GB: 0 → 100 GB (NEW)

2. ⚠️ SELECT ... WHERE id = ?
   Executions: 200 → 300 (+50%)
   GB: 100 → 150 GB (+50%)

...
```

---

## Data Files

```
data/
├── jobs-today.json      # Today's job snapshot
└── jobs-yesterday.json  # Yesterday's snapshot (for next run)
```

- Files are auto-created/updated
- Store last 2 days of data for comparison
- Can be deleted and refetched if needed

---

## Troubleshooting

### "BigQuery client creation failed"
- Check `GOOGLE_APPLICATION_CREDENTIALS` path is correct
- Verify service account has BigQuery permissions

### "No jobs found for today"
- Check if jobs exist in INFORMATION_SCHEMA
- Ensure service account can query BigQuery

### "Webhook failed (401)"
- Verify Discord webhook URL is correct
- Check webhook hasn't expired

### "No yesterday data found"
- First run is baseline - creates initial data
- Second run will have comparison data

---

## Code Structure

```
src/
├── bigquery.js      - BigQuery API interactions
├── analyzer.js      - Query normalization & pattern grouping
├── comparison.js    - Day-over-day comparison logic
├── discord.js       - Discord webhook formatting & sending
└── index.js         - Main orchestration
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GCP_PROJECT_ID` | Yes | - | GCP project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | `./key.json` | Path to service account key |
| `DISCORD_WEBHOOK` | No | - | Discord webhook URL for notifications |

### In Code

- `CONFIG.topPatternsCount` - Number of top patterns to show (default: 5)
- `CONFIG.dataDir` - Directory for caching job data (default: `./data`)

---

## Notes

- **First Run:** Creates baseline data, no comparison available
- **Subsequent Runs:** Compares with previous day
- **Query Normalization:** Makes parameter values irrelevant (e.g., WHERE id = ? groups all WHERE clauses)
- **Pattern Grouping:** Automatically aggregates similar queries
- **Discord Optional:** Tool works fine without Discord webhook

---

## Support

Issues? Check:
1. GCP credentials are valid
2. Service account has BigQuery permissions
3. Discord webhook URL is correct (if using)
4. Job data exists in INFORMATION_SCHEMA

---

## License

MIT
