class QueryOptimizer {
  constructor() {
    this.queryCache = new Map();
    this.slowQueryThreshold = 1000; // 1 second
    this.setupQueryMonitoring();
  }

  // Optimize lead queries with proper indexing
  async optimizedLeadQuery(filters, options = {}) {
    const queryParts = [];
    const values = [];
    let paramCount = 1;

    // Base query with CTEs for performance
    let query = `
      WITH filtered_leads AS (
        SELECT 
          l.*,
          u.full_name as owner_name,
          u.email as owner_email,
          COUNT(*) OVER() as total_count
        FROM leads l
        INNER JOIN users u ON l.user_id = u.id
        WHERE 1=1
    `;

    // Apply filters efficiently
    if (filters.region) {
      queryParts.push(`l.region = $${paramCount++}`);
      values.push(filters.region);
    }

    if (filters.status) {
      queryParts.push(`l.status = $${paramCount++}`);
      values.push(filters.status);
    }

    if (filters.dateRange) {
      queryParts.push(`l.created_at BETWEEN $${paramCount++} AND $${paramCount++}`);
      values.push(filters.dateRange.start, filters.dateRange.end);
    }

    if (filters.scoreRange) {
      queryParts.push(`l.score BETWEEN $${paramCount++} AND $${paramCount++}`);
      values.push(filters.scoreRange.min, filters.scoreRange.max);
    }

    if (filters.search) {
      queryParts.push(`
        (l.name ILIKE $${paramCount} OR 
         l.email ILIKE $${paramCount} OR 
         l.phone ILIKE $${paramCount++})
      `);
      const searchPattern = `%${filters.search}%`;
      values.push(searchPattern, searchPattern, searchPattern);
    }

    if (queryParts.length > 0) {
      query += ' AND ' + queryParts.join(' AND ');
    }

    // Add RLS conditions
    query += `
        AND (
          l.user_id = current_setting('app.current_user_id')::UUID OR
          l.region = current_setting('app.current_region')::VARCHAR OR
          current_setting('app.user_role')::VARCHAR = 'super_admin'
        )
      )
    `;

    // Pagination with proper sorting
    const sortColumn = this.getSafeColumn(options.sortBy) || 'created_at';
    const sortOrder = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    query += `
      SELECT * FROM filtered_leads
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `;

    values.push(options.limit || 50, options.offset || 0);

    // Execute with timing
    const start = Date.now();
    const result = await pool.query(query, values);
    const duration = Date.now() - start;

    // Log slow queries
    if (duration > this.slowQueryThreshold) {
      await this.logSlowQuery(query, values, duration);
    }

    return {
      data: result.rows,
      total: result.rows[0]?.total_count || 0,
      queryTime: duration
    };
  }

  // Batch operations optimization
  async batchInsertLeads(leads) {
    if (leads.length === 0) return { inserted: 0 };

    const columns = Object.keys(leads[0]);
    const values = [];
    const placeholders = [];

    leads.forEach((lead, index) => {
      const rowPlaceholders = columns.map((_, colIndex) => 
        `$${index * columns.length + colIndex + 1}`
      );
      placeholders.push(`(${rowPlaceholders.join(', ')})`);
      values.push(...columns.map(col => lead[col]));
    });

    const query = `
      INSERT INTO leads (${columns.join(', ')})
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
      RETURNING id
    `;

    try {
      const result = await pool.query(query, values);
      return { inserted: result.rowCount };
    } catch (error) {
      logger.error('Batch insert failed:', error);
      throw error;
    }
  }

  // Materialized view for analytics
  async createAnalyticsViews() {
    const views = [
      {
        name: 'lead_analytics_daily',
        query: `
          CREATE MATERIALIZED VIEW IF NOT EXISTS lead_analytics_daily AS
          SELECT 
            DATE_TRUNC('day', created_at) as date,
            region,
            source,
            COUNT(*) as lead_count,
            COUNT(CASE WHEN status = 'converted' THEN 1 END) as conversions,
            AVG(score) as avg_score,
            SUM(CASE WHEN temperature = 'hot' THEN 1 ELSE 0 END) as hot_leads
          FROM leads
          GROUP BY DATE_TRUNC('day', created_at), region, source
          WITH DATA
        `
      },
      {
        name: 'campaign_performance',
        query: `
          CREATE MATERIALIZED VIEW IF NOT EXISTS campaign_performance AS
          SELECT 
            c.id,
            c.name,
            c.channel,
            c.region,
            COUNT(DISTINCT l.id) as total_leads,
            COUNT(DISTINCT CASE WHEN l.status = 'converted' THEN l.id END) as conversions,
            COALESCE(SUM(l.value), 0) as revenue,
            c.cost,
            CASE 
              WHEN c.cost > 0 THEN ((SUM(l.value) - c.cost) / c.cost * 100)
              ELSE 0 
            END as roi
          FROM campaigns c
          LEFT JOIN leads l ON l.campaign_id = c.id
          GROUP BY c.id, c.name, c.channel, c.region, c.cost
          WITH DATA
        `
      }
    ];

    for (const view of views) {
      try {
        await pool.query(view.query);
        
        // Create index on materialized view
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_${view.name}_date 
          ON ${view.name}(date) 
          WHERE date > NOW() - INTERVAL '90 days'
        `);
        
        logger.info(`Created materialized view: ${view.name}`);
      } catch (error) {
        logger.error(`Failed to create view ${view.name}:`, error);
      }
    }
  }

  // Refresh materialized views
  async refreshAnalyticsViews() {
    const views = ['lead_analytics_daily', 'campaign_performance'];
    
    for (const view of views) {
      try {
        await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
        logger.info(`Refreshed materialized view: ${view}`);
      } catch (error) {
        logger.error(`Failed to refresh view ${view}:`, error);
      }
    }
  }

  // Query plan analysis
  async analyzeQueryPlan(query, params) {
    const explainQuery = `EXPLAIN (ANALYZE, BUFFERS) ${query}`;
    
    try {
      const result = await pool.query(explainQuery, params);
      const plan = result.rows.map(row => row['QUERY PLAN']).join('\n');
      
      // Extract key metrics
      const metrics = {
        totalTime: this.extractMetric(plan, 'Execution Time'),
        planningTime: this.extractMetric(plan, 'Planning Time'),
        sharedHits: this.extractMetric(plan, 'Shared Hit Blocks'),
        sharedReads: this.extractMetric(plan, 'Shared Read Blocks')
      };

      // Identify issues
      const issues = [];
      if (plan.includes('Seq Scan')) {
        issues.push('Sequential scan detected - consider adding index');
      }
      if (metrics.totalTime > 1000) {
        issues.push('Query execution time exceeds 1 second');
      }

      return { plan, metrics, issues };
    } catch (error) {
      logger.error('Query plan analysis failed:', error);
      throw error;
    }
  }

  extractMetric(plan, metric) {
    const regex = new RegExp(`${metric}: ([\\d.]+)`);
    const match = plan.match(regex);
    return match ? parseFloat(match[1]) : 0;
  }

  getSafeColumn(column) {
    const allowedColumns = [
      'created_at', 'updated_at', 'score', 'name', 
      'email', 'status', 'temperature'
    ];
    return allowedColumns.includes(column) ? column : null;
  }

  async logSlowQuery(query, params, duration) {
    await auditLogger.logAction(
      'system',
      'SLOW_QUERY_DETECTED',
      'database',
      {
        query: query.substring(0, 200),
        paramCount: params.length,
        duration,
        threshold: this.slowQueryThreshold
      }
    );
  }

  setupQueryMonitoring() {
    // Monitor all queries in development
    if (process.env.NODE_ENV === 'development') {
      const originalQuery = pool.query.bind(pool);
      
      pool.query = async (...args) => {
        const start = Date.now();
        try {
          const result = await originalQuery(...args);
          const duration = Date.now() - start;
          
          if (duration > 100) {
            logger.debug(`Slow query (${duration}ms):`, args[0]);
          }
          
          return result;
        } catch (error) {
          logger.error('Query error:', error);
          throw error;
        }
      };
    }
  }
}

module.exports = new QueryOptimizer();