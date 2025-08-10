const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class ROICalculator {
  constructor() {
    this.initializeTables();
  }

  async initializeTables() {
    const query = `
      CREATE TABLE IF NOT EXISTS roi_calculations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        property_id UUID REFERENCES properties(id),
        lead_id UUID REFERENCES leads(id),
        calculation_type VARCHAR(50),
        inputs JSONB,
        results JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS market_data (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        location VARCHAR(255),
        property_type VARCHAR(100),
        avg_appreciation_rate DECIMAL(5,2),
        avg_rental_yield DECIMAL(5,2),
        market_trend VARCHAR(50),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_roi_property ON roi_calculations(property_id);
      CREATE INDEX idx_roi_lead ON roi_calculations(lead_id);
      CREATE INDEX idx_market_location ON market_data(location);
    `;

    try {
      await pool.query(query);
    } catch (error) {
      logger.error('Failed to create ROI tables:', error);
    }
  }

  // Basic property ROI calculation
  calculatePropertyROI(investment, monthlyRental, appreciation, expenses, years = 5) {
    const annualRental = monthlyRental * 12;
    const annualExpenses = expenses;
    const netAnnualIncome = annualRental - annualExpenses;
    
    // Rental yield
    const rentalYield = (netAnnualIncome / investment) * 100;
    
    // Total return calculation
    let totalValue = investment;
    let totalRentalIncome = 0;
    
    for (let year = 1; year <= years; year++) {
      // Property appreciation
      totalValue *= (1 + appreciation / 100);
      
      // Rental income (assuming 3% annual increase)
      const yearlyRental = netAnnualIncome * Math.pow(1.03, year - 1);
      totalRentalIncome += yearlyRental;
    }
    
    const totalReturn = totalValue + totalRentalIncome - investment;
    const totalROI = (totalReturn / investment) * 100;
    const annualizedROI = (Math.pow(1 + totalROI / 100, 1 / years) - 1) * 100;
    
    return {
      investment,
      rentalYield: parseFloat(rentalYield.toFixed(2)),
      appreciationRate: appreciation,
      totalReturn: parseFloat(totalReturn.toFixed(2)),
      totalROI: parseFloat(totalROI.toFixed(2)),
      annualizedROI: parseFloat(annualizedROI.toFixed(2)),
      breakEvenYears: parseFloat((investment / netAnnualIncome).toFixed(1)),
      projectedValue: parseFloat(totalValue.toFixed(2)),
      totalRentalIncome: parseFloat(totalRentalIncome.toFixed(2)),
      netAnnualIncome: parseFloat(netAnnualIncome.toFixed(2))
    };
  }

  // Advanced ROI with financing
  calculateFinancedROI(propertyPrice, downPayment, loanAmount, interestRate, loanTenure, monthlyRental, appreciation, expenses) {
    const monthlyEMI = this.calculateEMI(loanAmount, interestRate, loanTenure);
    const annualEMI = monthlyEMI * 12;
    const annualRental = monthlyRental * 12;
    const annualExpenses = expenses;
    
    // Cash flow analysis
    const annualCashFlow = annualRental - annualEMI - annualExpenses;
    const monthlyCashFlow = annualCashFlow / 12;
    
    // Calculate total interest paid
    const totalPaid = monthlyEMI * loanTenure * 12;
    const totalInterest = totalPaid - loanAmount;
    
    // ROI on cash invested (down payment)
    const cashOnCashReturn = (annualCashFlow / downPayment) * 100;
    
    // Property value after loan tenure
    const futurePropertyValue = propertyPrice * Math.pow(1 + appreciation / 100, loanTenure);
    
    // Net worth gain
    const equityBuilt = futurePropertyValue - 0; // Assuming loan paid off
    const totalRentalReceived = annualRental * loanTenure;
    const totalExpensesPaid = annualExpenses * loanTenure;
    
    const netGain = equityBuilt + totalRentalReceived - downPayment - totalInterest - totalExpensesPaid;
    const leveragedROI = (netGain / downPayment) * 100;
    
    return {
      propertyPrice,
      downPayment,
      loanAmount,
      monthlyEMI: parseFloat(monthlyEMI.toFixed(2)),
      monthlyCashFlow: parseFloat(monthlyCashFlow.toFixed(2)),
      annualCashFlow: parseFloat(annualCashFlow.toFixed(2)),
      cashOnCashReturn: parseFloat(cashOnCashReturn.toFixed(2)),
      totalInterest: parseFloat(totalInterest.toFixed(2)),
      futurePropertyValue: parseFloat(futurePropertyValue.toFixed(2)),
      equityBuilt: parseFloat(equityBuilt.toFixed(2)),
      netGain: parseFloat(netGain.toFixed(2)),
      leveragedROI: parseFloat(leveragedROI.toFixed(2)),
      paybackPeriod: downPayment / annualCashFlow
    };
  }

  calculateEMI(principal, annualRate, years) {
    const monthlyRate = annualRate / 12 / 100;
    const months = years * 12;
    
    if (monthlyRate === 0) {
      return principal / months;
    }
    
    const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) / 
                (Math.pow(1 + monthlyRate, months) - 1);
    
    return emi;
  }

  // Compare multiple properties
  async comparePropertiesROI(propertyIds, leadData) {
    const comparisons = [];
    
    for (const propertyId of propertyIds) {
      const property = await this.getPropertyDetails(propertyId);
      
      if (!property) continue;
      
      const roiBasic = this.calculatePropertyROI(
        property.price,
        property.estimated_rental,
        property.appreciation_rate || 8,
        property.annual_expenses || property.price * 0.02,
        5
      );
      
      // If lead has loan preference
      let roiFinanced = null;
      if (leadData.loan_required) {
        roiFinanced = this.calculateFinancedROI(
          property.price,
          property.price * 0.2, // 20% down
          property.price * 0.8, // 80% loan
          leadData.preferred_interest_rate || 8.5,
          leadData.preferred_tenure || 20,
          property.estimated_rental,
          property.appreciation_rate || 8,
          property.annual_expenses || property.price * 0.02
        );
      }
      
      comparisons.push({
        propertyId,
        propertyName: property.name,
        location: property.location,
        price: property.price,
        roiBasic,
        roiFinanced,
        score: this.calculateInvestmentScore(roiBasic, roiFinanced, leadData)
      });
    }
    
    // Sort by investment score
    comparisons.sort((a, b) => b.score - a.score);
    
    // Save calculation
    await this.saveCalculation(leadData.leadId, comparisons);
    
    return comparisons;
  }

  calculateInvestmentScore(roiBasic, roiFinanced, leadData) {
    let score = 0;
    
    // ROI weight (40%)
    const roi = roiFinanced?.leveragedROI || roiBasic.totalROI;
    score += Math.min(roi * 2, 40); // Cap at 40 points
    
    // Cash flow weight (30%)
    if (roiFinanced) {
      const cashFlowScore = roiFinanced.monthlyCashFlow > 0 ? 30 : 
                           roiFinanced.monthlyCashFlow > -10000 ? 15 : 0;
      score += cashFlowScore;
    } else {
      score += 30; // Full points for cash purchase
    }
    
    // Rental yield weight (20%)
    score += Math.min(roiBasic.rentalYield * 2.5, 20);
    
    // Risk assessment (10%)
    const breakEven = roiBasic.breakEvenYears;
    if (breakEven < 10) score += 10;
    else if (breakEven < 15) score += 5;
    
    return Math.round(score);
  }

  async getPropertyDetails(propertyId) {
    const query = `
      SELECT p.*, 
        COALESCE(m.avg_appreciation_rate, 8) as appreciation_rate,
        COALESCE(m.avg_rental_yield, 4) as rental_yield
      FROM properties p
      LEFT JOIN market_data m ON p.location = m.location
      WHERE p.id = $1
    `;
    
    const result = await pool.query(query, [propertyId]);
    return result.rows[0];
  }

  async saveCalculation(leadId, calculations) {
    const query = `
      INSERT INTO roi_calculations (lead_id, calculation_type, inputs, results)
      VALUES ($1, $2, $3, $4)
    `;
    
    await pool.query(query, [
      leadId,
      'property_comparison',
      JSON.stringify({ leadId, timestamp: new Date() }),
      JSON.stringify(calculations)
    ]);
  }

  // Market analysis
  async getMarketAnalysis(location, propertyType) {
    const query = `
      SELECT * FROM market_data 
      WHERE location = $1 AND property_type = $2
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    
    const result = await pool.query(query, [location, propertyType]);
    
    if (result.rows.length === 0) {
      // Return default market data
      return {
        location,
        propertyType,
        avgAppreciationRate: 8,
        avgRentalYield: 3.5,
        marketTrend: 'stable',
        analysis: 'Default market data - actual data not available'
      };
    }
    
    return result.rows[0];
  }

  // Tax calculations
  calculateTaxBenefits(loanAmount, interestRate, annualIncome) {
    const annualInterest = loanAmount * (interestRate / 100);
    const maxDeduction = 200000; // Section 24(b) limit
    const actualDeduction = Math.min(annualInterest, maxDeduction);
    
    // Tax calculation based on income slabs
    let taxSlab = 0;
    if (annualIncome > 1500000) taxSlab = 0.30;
    else if (annualIncome > 1000000) taxSlab = 0.20;
    else if (annualIncome > 500000) taxSlab = 0.10;
    else taxSlab = 0.05;
    
    const taxSaved = actualDeduction * taxSlab;
    
    return {
      annualInterest,
      deductionClaimed: actualDeduction,
      taxSlab: taxSlab * 100,
      annualTaxSaved: taxSaved,
      effectiveInterestRate: ((annualInterest - taxSaved) / loanAmount) * 100
    };
  }

  // Investment recommendation engine
  async generateInvestmentRecommendation(leadId) {
    const lead = await this.getLeadDetails(leadId);
    const suitableProperties = await this.findSuitableProperties(lead);
    
    const recommendations = [];
    
    for (const property of suitableProperties) {
      const analysis = {
        property,
        roi: this.calculatePropertyROI(
          property.price,
          property.estimated_rental,
          property.appreciation_rate,
          property.annual_expenses,
          5
        ),
        matchScore: this.calculatePropertyMatchScore(property, lead),
        riskAssessment: this.assessInvestmentRisk(property, lead)
      };
      
      recommendations.push(analysis);
    }
    
    // Sort by match score
    recommendations.sort((a, b) => b.matchScore - a.matchScore);
    
    return {
      leadId,
      recommendations: recommendations.slice(0, 5), // Top 5
      generatedAt: new Date()
    };
  }

  calculatePropertyMatchScore(property, lead) {
    let score = 0;
    
    // Budget match (40%)
    const budgetRatio = property.price / lead.budget;
    if (budgetRatio >= 0.8 && budgetRatio <= 1.2) score += 40;
    else if (budgetRatio >= 0.6 && budgetRatio <= 1.4) score += 20;
    
    // Location match (30%)
    if (property.location === lead.interested_location) score += 30;
    else if (property.city === lead.interested_city) score += 15;
    
    // ROI expectations (20%)
    if (property.expected_roi >= lead.min_roi_expectation) score += 20;
    
    // Property type (10%)
    if (property.type === lead.preferred_property_type) score += 10;
    
    return score;
  }

  assessInvestmentRisk(property, lead) {
    const risks = [];
    let riskLevel = 'low';
    
    // Market risk
    if (property.market_trend === 'declining') {
      risks.push('Market showing declining trend');
      riskLevel = 'high';
    }
    
    // Liquidity risk
    if (property.avg_days_to_sell > 180) {
      risks.push('Low liquidity - takes time to sell');
      riskLevel = riskLevel === 'high' ? 'high' : 'medium';
    }
    
    // Concentration risk
    if (property.price > lead.budget * 0.5) {
      risks.push('High investment concentration');
      riskLevel = riskLevel === 'low' ? 'medium' : riskLevel;
    }
    
    return {
      level: riskLevel,
      factors: risks,
      mitigation: this.getRiskMitigation(risks)
    };
  }

  getRiskMitigation(risks) {
    const mitigations = {
      'Market showing declining trend': 'Consider properties in emerging locations',
      'Low liquidity - takes time to sell': 'Ensure adequate emergency funds',
      'High investment concentration': 'Consider diversifying across multiple properties'
    };
    
    return risks.map(risk => ({
      risk,
      mitigation: mitigations[risk] || 'Consult with financial advisor'
    }));
  }

  async getLeadDetails(leadId) {
    const query = 'SELECT * FROM leads WHERE id = $1';
    const result = await pool.query(query, [leadId]);
    return result.rows[0];
  }

  async findSuitableProperties(lead) {
    const budgetMin = lead.budget * 0.8;
    const budgetMax = lead.budget * 1.2;
    
    const query = `
      SELECT * FROM properties 
      WHERE price BETWEEN $1 AND $2
      AND (location = $3 OR $3 IS NULL)
      AND units_available > 0
      ORDER BY roi_percentage DESC
      LIMIT 20
    `;
    
    const result = await pool.query(query, [
      budgetMin,
      budgetMax,
      lead.interested_location
    ]);
    
    return result.rows;
  }
}

module.exports = new ROICalculator();