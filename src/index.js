require('dotenv').config();
const path = require('path');
const fs = require('fs');

const bq = require('./bigquery');
const analyzer = require('./analyzer');
const comparison = require('./comparison');
const discord = require('./discord');

// Configuration
const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'avada-subscription-app',
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || './key.json',
  discordWebhook: process.env.DISCORD_WEBHOOK || '',
  dataDir: './data',
  topPatternsCount: 5
};

// Ensure data directory exists
if (!fs.existsSync(CONFIG.dataDir)) {
  fs.mkdirSync(CONFIG.dataDir, { recursive: true });
}

const DATA_FILES = {
  today: path.join(CONFIG.dataDir, 'jobs-today.json'),
  yesterday: path.join(CONFIG.dataDir, 'jobs-yesterday.json')
};

/**
 * Get date in YYYY-MM-DD format
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Main analysis function
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isTest = args.includes('--test');

  console.log('\n===========================================');
  console.log('📊 BigQuery Job Analyzer');
  console.log('===========================================\n');

  try {
    // Initialize BigQuery
    console.log(`📌 Project: ${CONFIG.projectId}`);
    console.log(`🔑 Key: ${CONFIG.keyFilename}`);
    bq.initBigQuery(CONFIG.projectId, CONFIG.keyFilename);

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayDate = formatDate(today);
    const yesterdayDate = formatDate(yesterday);

    console.log(`📅 Today: ${todayDate}`);
    console.log(`📅 Yesterday: ${yesterdayDate}\n`);

    // Fetch jobs
    console.log('⏳ Fetching jobs from BigQuery...');
    let todayJobs = [];
    let yesterdayJobs = [];

    if (!isTest) {
      todayJobs = await bq.fetchJobsForDate(todayDate);
      console.log(`✅ Fetched ${todayJobs.length} jobs for today`);

      // Save today's jobs
      bq.saveJobsToFile(DATA_FILES.today, todayJobs);
    } else {
      // For testing, use cached data if available
      todayJobs = bq.loadJobsFromFile(DATA_FILES.today);
      console.log(`✅ Loaded ${todayJobs.length} cached jobs for today`);
    }

    if (todayJobs.length === 0) {
      console.warn('⚠️  No jobs found for today. Exiting.');
      return;
    }

    // Load yesterday's jobs (from cache or fetch)
    yesterdayJobs = bq.loadJobsFromFile(DATA_FILES.yesterday);
    if (yesterdayJobs.length === 0 && !isTest) {
      console.log('ℹ️  Yesterday data not found in cache, fetching from BigQuery...');
      yesterdayJobs = await bq.fetchJobsForDate(yesterdayDate);
      console.log(`✅ Fetched ${yesterdayJobs.length} jobs for yesterday`);
    }

    if (yesterdayJobs.length === 0) {
      console.warn('⚠️  No yesterday data found. Creating baseline.');
    }

    // Analyze today's jobs
    console.log('\n⏳ Analyzing today\'s jobs...');
    const todayPatterns = analyzer.groupJobsByPattern(todayJobs);
    const todayTopPatterns = analyzer.getTopPatterns(todayPatterns, CONFIG.topPatternsCount);
    const todayStats = analyzer.calculateDailyStats(todayJobs);

    console.log(`✅ Found ${Object.keys(todayPatterns).length} unique patterns`);
    console.log(`   Top ${CONFIG.topPatternsCount} patterns by cost`);

    // Analyze yesterday's jobs
    let yesterdayPatterns = {};
    let yesterdayStats = {
      totalQueries: 0,
      totalGB: 0,
      avgGBPerQuery: 0,
      uniqueUsers: 0,
      totalBytes: 0
    };

    if (yesterdayJobs.length > 0) {
      console.log('\n⏳ Analyzing yesterday\'s jobs...');
      yesterdayPatterns = analyzer.groupJobsByPattern(yesterdayJobs);
      yesterdayStats = analyzer.calculateDailyStats(yesterdayJobs);
      console.log(`✅ Found ${Object.keys(yesterdayPatterns).length} unique patterns`);
    }

    // Compare patterns
    console.log('\n⏳ Comparing patterns...');
    const patternComparisons = comparison.comparePatterns(todayPatterns, yesterdayPatterns);
    const topPatternComparisons = patternComparisons.slice(0, CONFIG.topPatternsCount);

    console.log(`✅ Top ${CONFIG.topPatternsCount} patterns ranked by change`);

    // Compare daily stats
    const dailyComparison = comparison.compareDailyStats(todayStats, yesterdayStats);

    console.log('\n📊 Daily Statistics:');
    console.log(`   Yesterday: ${dailyComparison.yesterdayQueries} queries, ${dailyComparison.yesterdayGB} GB`);
    console.log(`   Today:     ${dailyComparison.todayQueries} queries, ${dailyComparison.todayGB} GB`);
    console.log(`   Change:    ${dailyComparison.queryChangePercent > 0 ? '+' : ''}${dailyComparison.queryChangePercent}% (${dailyComparison.queryChange > 0 ? '+' : ''}${dailyComparison.queryChange} queries)`);
    console.log(`              ${dailyComparison.gbChangePercent > 0 ? '+' : ''}${dailyComparison.gbChangePercent}% (${dailyComparison.gbChange > 0 ? '+' : ''}${dailyComparison.gbChange.toFixed(2)} GB)`);

    // Print top patterns
    console.log('\n📈 Top 5 Pattern Changes:');
    topPatternComparisons.forEach((comp, idx) => {
      console.log(`\n   ${idx + 1}. ${comp.status} ${comp.originalQuery.substring(0, 60)}...`);
      if (comp.isNew) {
        console.log(`      [NEW] ${comp.todayExecutions} executions, ${comp.todayGB} GB`);
      } else {
        console.log(`      Executions: ${comp.yesterdayExecutions} → ${comp.todayExecutions} (${comp.executionChangePercent > 0 ? '+' : ''}${comp.executionChangePercent}%)`);
        console.log(`      GB: ${comp.yesterdayGB} → ${comp.todayGB} (${comp.gbChangePercent > 0 ? '+' : ''}${comp.gbChangePercent}%)`);
      }
    });

    // Prepare report
    const report = {
      todayDate,
      yesterdayDate,
      dailyComparison,
      topPatternComparisons,
      todayStats,
      yesterdayStats
    };

    // Send to Discord
    if (!isDryRun && !isTest) {
      console.log('\n⏳ Sending to Discord...');
      await discord.sendDiscordReport(CONFIG.discordWebhook, report);
    } else {
      if (isDryRun) console.log('\nℹ️  Dry run mode - Discord not sent');
      if (isTest) console.log('\nℹ️  Test mode - Discord not sent');
    }

    // Update yesterday's data for next run
    if (!isTest) {
      console.log('\n⏳ Archiving today\'s jobs for next run...');
      bq.saveJobsToFile(DATA_FILES.yesterday, todayJobs);
    }

    console.log('\n===========================================');
    console.log('✅ Analysis completed successfully!');
    console.log('===========================================\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run main
main();
