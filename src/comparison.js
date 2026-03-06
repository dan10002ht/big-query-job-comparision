/**
 * Compare two pattern maps (today vs yesterday)
 * @param {Object} todayPatterns - Pattern map from today
 * @param {Object} yesterdayPatterns - Pattern map from yesterday
 * @returns {Array} - Sorted comparison results
 */
function comparePatterns(todayPatterns, yesterdayPatterns) {
  const comparisons = [];

  // Compare each TODAY's pattern
  Object.entries(todayPatterns).forEach(([pattern, todayData]) => {
    const yesterdayData = yesterdayPatterns[pattern];

    if (!yesterdayData) {
      // NEW pattern (not in yesterday)
      comparisons.push({
        pattern: pattern,
        originalQuery: todayData.originalQuery,
        isNew: true,
        status: '[NEW]',
        
        yesterdayExecutions: 0,
        todayExecutions: todayData.executionCount,
        executionChange: todayData.executionCount,
        executionChangePercent: 100,
        
        yesterdayGB: 0,
        todayGB: todayData.totalGBScanned,
        gbChange: todayData.totalGBScanned,
        gbChangePercent: 100,
        
        yesterdayBytes: 0,
        todayBytes: todayData.totalBilledBytes,
        
        avgGBYesterday: 0,
        avgGBToday: parseFloat(todayData.avgGBPerQuery),
        
        changeScore: 1000 // NEW patterns get highest priority
      });
    } else {
      // Pattern exists in both days
      const executionChange = todayData.executionCount - yesterdayData.executionCount;
      const executionChangePercent = yesterdayData.executionCount > 0 
        ? Math.round((executionChange / yesterdayData.executionCount) * 100 * 100) / 100
        : (executionChange > 0 ? 100 : 0);

      const gbChange = todayData.totalGBScanned - yesterdayData.totalGBScanned;
      const gbChangePercent = yesterdayData.totalGBScanned > 0
        ? Math.round((gbChange / yesterdayData.totalGBScanned) * 100 * 100) / 100
        : (gbChange > 0 ? 100 : 0);

      // Calculate change score (higher = more significant change)
      const executionChangeScore = Math.abs(executionChangePercent);
      const gbChangeScore = Math.abs(gbChangePercent);
      const changeScore = Math.max(executionChangeScore, gbChangeScore);

      comparisons.push({
        pattern: pattern,
        originalQuery: todayData.originalQuery,
        isNew: false,
        status: getChangeStatus(executionChangePercent, gbChangePercent),
        
        yesterdayExecutions: yesterdayData.executionCount,
        todayExecutions: todayData.executionCount,
        executionChange: executionChange,
        executionChangePercent: executionChangePercent,
        
        yesterdayGB: yesterdayData.totalGBScanned,
        todayGB: todayData.totalGBScanned,
        gbChange: gbChange,
        gbChangePercent: gbChangePercent,
        
        yesterdayBytes: yesterdayData.totalBilledBytes,
        todayBytes: todayData.totalBilledBytes,
        
        avgGBYesterday: parseFloat(yesterdayData.avgGBPerQuery),
        avgGBToday: parseFloat(todayData.avgGBPerQuery),
        
        changeScore: changeScore
      });
    }
  });

  // Sort by change score (highest first)
  return comparisons.sort((a, b) => b.changeScore - a.changeScore);
}

/**
 * Get status emoji based on changes
 * @param {number} execChangePercent
 * @param {number} gbChangePercent
 * @returns {string}
 */
function getChangeStatus(execChangePercent, gbChangePercent) {
  const maxChange = Math.abs(Math.max(execChangePercent, gbChangePercent));

  if (maxChange >= 50) return '🚨';
  if (maxChange >= 20) return '⚠️';
  if (maxChange <= -20) return '📉';
  return '➡️';
}

/**
 * Compare daily statistics
 * @param {Object} todayStats
 * @param {Object} yesterdayStats
 * @returns {Object}
 */
function compareDailyStats(todayStats, yesterdayStats) {
  const queryChange = todayStats.totalQueries - yesterdayStats.totalQueries;
  const queryChangePercent = yesterdayStats.totalQueries > 0
    ? Math.round((queryChange / yesterdayStats.totalQueries) * 100 * 100) / 100
    : (queryChange > 0 ? 100 : 0);

  const gbChange = todayStats.totalGB - yesterdayStats.totalGB;
  const gbChangePercent = yesterdayStats.totalGB > 0
    ? Math.round((gbChange / yesterdayStats.totalGB) * 100 * 100) / 100
    : (gbChange > 0 ? 100 : 0);

  const costChange = todayStats.estimatedCost - yesterdayStats.estimatedCost;
  const costChangePercent = yesterdayStats.estimatedCost > 0
    ? Math.round((costChange / yesterdayStats.estimatedCost) * 100 * 100) / 100
    : (costChange > 0 ? 100 : 0);

  return {
    yesterdayQueries: yesterdayStats.totalQueries,
    todayQueries: todayStats.totalQueries,
    queryChange: queryChange,
    queryChangePercent: queryChangePercent,
    
    yesterdayGB: yesterdayStats.totalGB,
    todayGB: todayStats.totalGB,
    gbChange: gbChange,
    gbChangePercent: gbChangePercent,
    
    yesterdayEstimatedCost: yesterdayStats.estimatedCost,
    todayEstimatedCost: todayStats.estimatedCost,
    estimatedCostChange: costChange,
    estimatedCostChangePercent: costChangePercent,
    
    yesterdayAvgGB: parseFloat(yesterdayStats.avgGBPerQuery),
    todayAvgGB: todayStats.avgGBPerQuery,
    
    todayUniqueUsers: todayStats.uniqueUsers,
    yesterdayUniqueUsers: yesterdayStats.uniqueUsers
  };
}

module.exports = {
  comparePatterns,
  compareDailyStats,
  getChangeStatus
};
