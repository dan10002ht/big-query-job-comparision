const { BigQuery } = require('@google-cloud/bigquery');
const fs = require('fs');

let bigQueryClient = null;

function initBigQuery(projectId, keyFilename) {
  bigQueryClient = new BigQuery({
    projectId,
    keyFilename
  });
  return bigQueryClient;
}

/**
 * Fetch all jobs for a specific date
 * @param {string} targetDate - Date in YYYY-MM-DD format
 * @returns {Promise<Array>}
 */
async function fetchJobsForDate(targetDate) {
  try {
    const query = `
      SELECT 
        job_id,
        user_email,
        creation_time,
        ROUND(total_bytes_processed / 1e12 * 6.25, 4) as estimated_cost_usd,
        ROUND(total_bytes_processed / 1e9, 2) as gb_scanned,
        ROUND(total_slot_ms / 1000, 2) as slot_seconds,
        statement_type,
        SUBSTR(query, 1, 500) as query_snippet,
        query
      FROM \`region-us\`.INFORMATION_SCHEMA.JOBS_BY_PROJECT
      WHERE DATE(creation_time) = '${targetDate}'
        AND state = 'DONE'
        AND query NOT LIKE '%INFORMATION_SCHEMA%'
      ORDER BY total_bytes_processed DESC
      LIMIT 10000
    `;

    const options = {
      query: query,
      location: 'US',
      useQueryCache: false
    };

    const [rows] = await bigQueryClient.query(options);

    return rows.map(row => ({
      jobId: row.job_id,
      userEmail: row.user_email,
      creationTime: row.creation_time,
      estimatedCost: row.estimated_cost_usd,
      gbScanned: row.gb_scanned,
      slotSeconds: row.slot_seconds,
      statementType: row.statement_type,
      querySnippet: row.query_snippet,
      fullQuery: row.query,
      billedBytes: Math.round(row.gb_scanned * 1e9) // Convert GB back to bytes for consistency
    }));
  } catch (error) {
    console.error('❌ Error fetching jobs for date:', targetDate, error.message);
    throw error;
  }
}

/**
 * Save jobs to JSON file (for caching)
 * @param {string} filename
 * @param {Array} jobs
 */
function saveJobsToFile(filename, jobs) {
  try {
    fs.writeFileSync(filename, JSON.stringify(jobs, null, 2));
    console.log(`✅ Saved ${jobs.length} jobs to ${filename}`);
  } catch (error) {
    console.error('❌ Error saving jobs to file:', error.message);
  }
}

/**
 * Load jobs from JSON file
 * @param {string} filename
 * @returns {Array}
 */
function loadJobsFromFile(filename) {
  try {
    if (!fs.existsSync(filename)) {
      console.log(`ℹ️  File not found: ${filename}`);
      return [];
    }
    const data = fs.readFileSync(filename, 'utf8');
    const jobs = JSON.parse(data);
    console.log(`✅ Loaded ${jobs.length} jobs from ${filename}`);
    return jobs;
  } catch (error) {
    console.error('❌ Error loading jobs from file:', error.message);
    return [];
  }
}

module.exports = {
  initBigQuery,
  fetchJobsForDate,
  saveJobsToFile,
  loadJobsFromFile
};
