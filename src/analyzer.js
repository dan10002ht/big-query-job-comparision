/**
 * Normalize SQL query by replacing literals with placeholders
 * Makes similar queries group together regardless of values
 * @param {string} sql
 * @returns {string}
 */
function normalizeQuery(sql) {
  if (!sql) return '';

  let normalized = sql
    // Replace string literals in single quotes with ?
    .replace(/'[^']*'/g, '?')
    // Replace numbers with ?
    .replace(/\b\d+\b/g, '?')
    // Replace UUIDs pattern
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '?')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Trim
    .trim();

  return normalized;
}

/**
 * Group jobs by normalized query pattern
 * @param {Array} jobs
 * @returns {Object} - Map of normalized pattern to aggregated data
 */
function groupJobsByPattern(jobs) {
  const patternMap = {};

  jobs.forEach(job => {
    const pattern = normalizeQuery(job.fullQuery);

    if (!patternMap[pattern]) {
      patternMap[pattern] = {
        pattern,
        originalQuery: job.fullQuery,
        totalBilledBytes: 0,
        totalGBScanned: 0,
        executionCount: 0,
        totalDurationSec: 0,
        users: new Set(),
        statementTypes: new Set(),
        jobIds: [],
        minCreationTime: null,
        maxCreationTime: null
      };
    }

    const ptn = patternMap[pattern];
    ptn.totalBilledBytes += job.billedBytes;
    ptn.totalGBScanned += job.gbScanned;
    ptn.executionCount += 1;
    ptn.totalDurationSec += job.durationSec;
    ptn.users.add(job.userEmail);
    ptn.statementTypes.add(job.statementType);
    ptn.jobIds.push(job.jobId);

    if (!ptn.minCreationTime || job.creationTime < ptn.minCreationTime) {
      ptn.minCreationTime = job.creationTime;
    }
    if (!ptn.maxCreationTime || job.creationTime > ptn.maxCreationTime) {
      ptn.maxCreationTime = job.creationTime;
    }
  });

  // Convert Sets to Arrays and calculate metrics
  Object.keys(patternMap).forEach(pattern => {
    const ptn = patternMap[pattern];
    ptn.users = Array.from(ptn.users);
    ptn.statementTypes = Array.from(ptn.statementTypes);
    ptn.avgBytesPerQuery = Math.round(ptn.totalBilledBytes / ptn.executionCount);
    ptn.avgGBPerQuery = (ptn.avgBytesPerQuery / 1e9).toFixed(2);
    ptn.avgDurationSec = (ptn.totalDurationSec / ptn.executionCount).toFixed(2);
    ptn.totalGBScanned = Math.round(ptn.totalGBScanned * 100) / 100;
  });

  return patternMap;
}

/**
 * Get top N patterns sorted by total billed bytes
 * @param {Object} patternMap
 * @param {number} topN - Number of top patterns (default: 5)
 * @returns {Array}
 */
function getTopPatterns(patternMap, topN = 5) {
  return Object.values(patternMap)
    .sort((a, b) => b.totalBilledBytes - a.totalBilledBytes)
    .slice(0, topN)
    .map((pattern, index) => ({
      ...pattern,
      rank: index + 1
    }));
}

/**
 * Calculate daily stats
 * @param {Array} jobs
 * @returns {Object}
 */
function calculateDailyStats(jobs) {
  const totalBytes = jobs.reduce((sum, job) => sum + job.billedBytes, 0);
  const totalGB = (totalBytes / 1e9).toFixed(2);
  const totalQueries = jobs.length;
  const avgBytesPerQuery = Math.round(totalBytes / totalQueries);
  const avgGBPerQuery = (avgBytesPerQuery / 1e9).toFixed(4);

  return {
    totalQueries,
    totalBytes,
    totalGB: parseFloat(totalGB),
    avgBytesPerQuery,
    avgGBPerQuery: parseFloat(avgGBPerQuery),
    uniqueUsers: new Set(jobs.map(j => j.userEmail)).size,
    statementTypes: Array.from(new Set(jobs.map(j => j.statementType)))
  };
}

module.exports = {
  normalizeQuery,
  groupJobsByPattern,
  getTopPatterns,
  calculateDailyStats
};
