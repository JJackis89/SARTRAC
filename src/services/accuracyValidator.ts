import { SatelliteObservation } from './satelliteService';

export interface ModelPrediction {
  lat: number;
  lon: number;
  timestamp: Date;
  sargassumDensity: number; // Model predicted density (0-1)
  confidence: number; // Model confidence (0-1)
  source: 'HYCOM' | 'OPENDRIFT' | 'ENSEMBLE';
  windSpeed?: number;
  currentSpeed?: number;
  temperature?: number;
}

export interface ValidationPoint {
  lat: number;
  lon: number;
  timestamp: Date;
  satelliteValue: number;
  modelValue: number;
  difference: number;
  absoluteError: number;
  relativeError: number;
  spatialDistance: number; // Distance to nearest neighbors
  temporalDistance: number; // Time difference in hours
  weight: number; // Quality-based weight for analysis
}

export interface AccuracyMetrics {
  // Basic statistical measures
  meanAbsoluteError: number;
  rootMeanSquareError: number;
  meanBias: number;
  correlationCoefficient: number;
  
  // Advanced metrics
  skillScore: number; // Model skill vs persistence
  indexOfAgreement: number; // Willmott's index
  nashSutcliffeEfficiency: number;
  percentBias: number;
  
  // Confidence intervals
  confidenceInterval95: {
    lower: number;
    upper: number;
  };
  
  // Categorical metrics (for presence/absence)
  sensitivity: number; // True positive rate
  specificity: number; // True negative rate
  precision: number;
  recall: number;
  f1Score: number;
  
  // Spatial-temporal analysis
  spatialCorrelation: number;
  temporalCorrelation: number;
  spatialAutocorrelation: number;
  
  // Sample statistics
  sampleSize: number;
  validPairs: number;
  spatialCoverage: number; // % of region covered
  temporalCoverage: number; // % of time period covered
}

export interface ValidationResult {
  accuracy_metrics: AccuracyMetrics;
  validation_points: ValidationPoint[];
  quality_assessment: {
    overall_quality: 'excellent' | 'good' | 'fair' | 'poor';
    reliability_score: number; // 0-1
    uncertainty_estimate: number;
    data_completeness: number;
  };
  spatial_analysis: {
    hotspots: Array<{ lat: number; lon: number; error: number }>;
    error_patterns: string[];
    regional_performance: Map<string, AccuracyMetrics>;
  };
  temporal_analysis: {
    seasonal_patterns: Map<string, number>;
    daily_patterns: Map<number, number>;
    trend_analysis: {
      slope: number;
      significance: number;
      r_squared: number;
    };
  };
  recommendations: string[];
  validation_summary: string;
}

export class AccuracyValidator {
  private spatialThreshold: number = 0.01; // ~1km at equator
  private temporalThreshold: number = 6; // 6 hours
  private minValidationPoints: number = 10;
  private sargassumThreshold: number = 0.1; // Presence/absence threshold

  constructor(config: {
    spatialThreshold?: number;
    temporalThreshold?: number;
    minValidationPoints?: number;
    sargassumThreshold?: number;
  } = {}) {
    this.spatialThreshold = config.spatialThreshold || this.spatialThreshold;
    this.temporalThreshold = config.temporalThreshold || this.temporalThreshold;
    this.minValidationPoints = config.minValidationPoints || this.minValidationPoints;
    this.sargassumThreshold = config.sargassumThreshold || this.sargassumThreshold;
  }

  /**
   * Main validation method comparing satellite observations with model predictions
   */
  validateAccuracy(
    satelliteData: SatelliteObservation[],
    modelPredictions: ModelPrediction[],
    bounds: [number, number, number, number] // [north, south, east, west]
  ): ValidationResult {
    console.log(`🔍 Starting accuracy validation with ${satelliteData.length} satellite observations and ${modelPredictions.length} model predictions`);

    // Step 1: Create validation pairs
    const validationPoints = this.createValidationPairs(satelliteData, modelPredictions);
    console.log(`📍 Created ${validationPoints.length} validation point pairs`);

    if (validationPoints.length < this.minValidationPoints) {
      console.warn(`⚠️ Insufficient validation points (${validationPoints.length} < ${this.minValidationPoints})`);
      return this.createMinimalValidationResult(validationPoints, 'Insufficient data for reliable validation');
    }

    // Step 2: Calculate accuracy metrics
    const accuracyMetrics = this.calculateAccuracyMetrics(validationPoints);

    // Step 3: Perform spatial analysis
    const spatialAnalysis = this.performSpatialAnalysis(validationPoints, bounds);

    // Step 4: Perform temporal analysis
    const temporalAnalysis = this.performTemporalAnalysis(validationPoints);

    // Step 5: Assess overall quality
    const qualityAssessment = this.assessValidationQuality(accuracyMetrics, validationPoints);

    // Step 6: Generate recommendations
    const recommendations = this.generateValidationRecommendations(
      accuracyMetrics,
      spatialAnalysis,
      temporalAnalysis,
      qualityAssessment
    );

    // Step 7: Create summary
    const validationSummary = this.createValidationSummary(accuracyMetrics, qualityAssessment);

    return {
      accuracy_metrics: accuracyMetrics,
      validation_points: validationPoints,
      quality_assessment: qualityAssessment,
      spatial_analysis: spatialAnalysis,
      temporal_analysis: temporalAnalysis,
      recommendations,
      validation_summary: validationSummary
    };
  }

  /**
   * Create validation pairs by matching satellite observations with model predictions
   */
  private createValidationPairs(
    satelliteData: SatelliteObservation[],
    modelPredictions: ModelPrediction[]
  ): ValidationPoint[] {
    const validationPoints: ValidationPoint[] = [];

    for (const satObs of satelliteData) {
      // Find the best matching model prediction
      let bestMatch: ModelPrediction | null = null;
      let minDistance = Infinity;

      for (const modelPred of modelPredictions) {
        const spatialDist = this.calculateSpatialDistance(
          satObs.lat, satObs.lon,
          modelPred.lat, modelPred.lon
        );

        const temporalDist = this.calculateTemporalDistance(
          satObs.timestamp, modelPred.timestamp
        );

        // Combined distance metric (normalized)
        const combinedDistance = spatialDist / this.spatialThreshold + temporalDist / this.temporalThreshold;

        if (combinedDistance < minDistance && 
            spatialDist <= this.spatialThreshold && 
            temporalDist <= this.temporalThreshold) {
          minDistance = combinedDistance;
          bestMatch = modelPred;
        }
      }

      if (bestMatch) {
        const difference = satObs.sargassumIndex - bestMatch.sargassumDensity;
        const absoluteError = Math.abs(difference);
        const relativeError = bestMatch.sargassumDensity > 0 ? 
          absoluteError / bestMatch.sargassumDensity : 0;

        // Calculate weight based on observation quality
        const weight = this.calculateValidationWeight(satObs, bestMatch);

        validationPoints.push({
          lat: satObs.lat,
          lon: satObs.lon,
          timestamp: satObs.timestamp,
          satelliteValue: satObs.sargassumIndex,
          modelValue: bestMatch.sargassumDensity,
          difference,
          absoluteError,
          relativeError,
          spatialDistance: this.calculateSpatialDistance(
            satObs.lat, satObs.lon, bestMatch.lat, bestMatch.lon
          ),
          temporalDistance: this.calculateTemporalDistance(
            satObs.timestamp, bestMatch.timestamp
          ),
          weight
        });
      }
    }

    return validationPoints;
  }

  /**
   * Calculate comprehensive accuracy metrics
   */
  private calculateAccuracyMetrics(validationPoints: ValidationPoint[]): AccuracyMetrics {
    const n = validationPoints.length;
    const weights = validationPoints.map(p => p.weight);

    // Weighted means
    const satMean = this.calculateWeightedMean(
      validationPoints.map(p => p.satelliteValue), weights
    );

    // Basic metrics
    const meanAbsoluteError = this.calculateWeightedMean(
      validationPoints.map(p => p.absoluteError), weights
    );

    const rootMeanSquareError = Math.sqrt(
      this.calculateWeightedMean(
        validationPoints.map(p => p.difference * p.difference), weights
      )
    );

    const meanBias = this.calculateWeightedMean(
      validationPoints.map(p => p.difference), weights
    );

    // Correlation coefficient
    const correlationCoefficient = this.calculateWeightedCorrelation(
      validationPoints.map(p => p.satelliteValue),
      validationPoints.map(p => p.modelValue),
      weights
    );

    // Advanced metrics
    const skillScore = this.calculateSkillScore(validationPoints, weights);
    const indexOfAgreement = this.calculateIndexOfAgreement(validationPoints, weights);
    const nashSutcliffeEfficiency = this.calculateNashSutcliffe(validationPoints, satMean, weights);
    const percentBias = (meanBias / satMean) * 100;

    // Confidence intervals (95%)
    const confidenceInterval95 = this.calculateConfidenceInterval(validationPoints, weights);

    // Categorical metrics for presence/absence
    const categoricalMetrics = this.calculateCategoricalMetrics(validationPoints);

    // Spatial-temporal correlations
    const spatialCorrelation = this.calculateSpatialCorrelation(validationPoints);
    const temporalCorrelation = this.calculateTemporalCorrelation(validationPoints);
    const spatialAutocorrelation = this.calculateSpatialAutocorrelation(validationPoints);

    // Coverage metrics
    const spatialCoverage = this.calculateSpatialCoverage(validationPoints);
    const temporalCoverage = this.calculateTemporalCoverage(validationPoints);

    return {
      meanAbsoluteError,
      rootMeanSquareError,
      meanBias,
      correlationCoefficient,
      skillScore,
      indexOfAgreement,
      nashSutcliffeEfficiency,
      percentBias,
      confidenceInterval95,
      sensitivity: categoricalMetrics.sensitivity,
      specificity: categoricalMetrics.specificity,
      precision: categoricalMetrics.precision,
      recall: categoricalMetrics.recall,
      f1Score: categoricalMetrics.f1Score,
      spatialCorrelation,
      temporalCorrelation,
      spatialAutocorrelation,
      sampleSize: n,
      validPairs: n,
      spatialCoverage,
      temporalCoverage
    };
  }

  /**
   * Perform spatial analysis to identify error patterns
   */
  private performSpatialAnalysis(
    validationPoints: ValidationPoint[],
    bounds: [number, number, number, number]
  ): ValidationResult['spatial_analysis'] {
    // Identify error hotspots
    const hotspots = validationPoints
      .filter(p => p.absoluteError > 0.15) // High error threshold
      .sort((a, b) => b.absoluteError - a.absoluteError)
      .slice(0, 10)
      .map(p => ({
        lat: p.lat,
        lon: p.lon,
        error: p.absoluteError
      }));

    // Analyze error patterns
    const errorPatterns: string[] = [];
    
    // Check for coastal vs open ocean bias
    const coastalPoints = validationPoints.filter(p => this.isCoastal(p.lat, p.lon, bounds));
    const openOceanPoints = validationPoints.filter(p => !this.isCoastal(p.lat, p.lon, bounds));
    
    if (coastalPoints.length > 0 && openOceanPoints.length > 0) {
      const coastalMAE = coastalPoints.reduce((sum, p) => sum + p.absoluteError, 0) / coastalPoints.length;
      const openOceanMAE = openOceanPoints.reduce((sum, p) => sum + p.absoluteError, 0) / openOceanPoints.length;
      
      if (Math.abs(coastalMAE - openOceanMAE) > 0.05) {
        errorPatterns.push(
          coastalMAE > openOceanMAE 
            ? 'Higher errors in coastal regions' 
            : 'Higher errors in open ocean regions'
        );
      }
    }

    // Check for latitudinal bias
    const northernPoints = validationPoints.filter(p => p.lat > (bounds[0] + bounds[1]) / 2);
    const southernPoints = validationPoints.filter(p => p.lat <= (bounds[0] + bounds[1]) / 2);
    
    if (northernPoints.length > 0 && southernPoints.length > 0) {
      const northernMAE = northernPoints.reduce((sum, p) => sum + p.absoluteError, 0) / northernPoints.length;
      const southernMAE = southernPoints.reduce((sum, p) => sum + p.absoluteError, 0) / southernPoints.length;
      
      if (Math.abs(northernMAE - southernMAE) > 0.05) {
        errorPatterns.push(
          northernMAE > southernMAE 
            ? 'Higher errors in northern regions' 
            : 'Higher errors in southern regions'
        );
      }
    }

    // Regional performance analysis
    const regionalPerformance = new Map<string, AccuracyMetrics>();
    const regions = this.divideIntoRegions(validationPoints, bounds);
    
    for (const [regionName, regionPoints] of regions) {
      if (regionPoints.length >= 5) { // Minimum points for regional analysis
        regionalPerformance.set(regionName, this.calculateAccuracyMetrics(regionPoints));
      }
    }

    return {
      hotspots,
      error_patterns: errorPatterns,
      regional_performance: regionalPerformance
    };
  }

  /**
   * Perform temporal analysis to identify time-based patterns
   */
  private performTemporalAnalysis(validationPoints: ValidationPoint[]): ValidationResult['temporal_analysis'] {
    // Seasonal patterns (by month)
    const seasonalPatterns = new Map<string, number>();
    const monthlyErrors = new Map<number, number[]>();

    for (const point of validationPoints) {
      const month = point.timestamp.getMonth();
      
      if (!monthlyErrors.has(month)) {
        monthlyErrors.set(month, []);
      }
      monthlyErrors.get(month)!.push(point.absoluteError);
    }

    for (const [month, errors] of monthlyErrors) {
      const meanError = errors.reduce((sum, err) => sum + err, 0) / errors.length;
      const seasonName = this.getSeasonName(month);
      seasonalPatterns.set(seasonName, meanError);
    }

    // Daily patterns (by hour)
    const dailyPatterns = new Map<number, number>();
    const hourlyErrors = new Map<number, number[]>();

    for (const point of validationPoints) {
      const hour = point.timestamp.getHours();
      
      if (!hourlyErrors.has(hour)) {
        hourlyErrors.set(hour, []);
      }
      hourlyErrors.get(hour)!.push(point.absoluteError);
    }

    for (const [hour, errors] of hourlyErrors) {
      const meanError = errors.reduce((sum, err) => sum + err, 0) / errors.length;
      dailyPatterns.set(hour, meanError);
    }

    // Trend analysis
    const trendAnalysis = this.calculateTrendAnalysis(validationPoints);

    return {
      seasonal_patterns: seasonalPatterns,
      daily_patterns: dailyPatterns,
      trend_analysis: trendAnalysis
    };
  }

  /**
   * Assess overall validation quality
   */
  private assessValidationQuality(
    metrics: AccuracyMetrics,
    _validationPoints: ValidationPoint[]
  ): ValidationResult['quality_assessment'] {
    // Calculate overall quality score (0-1)
    const correlationScore = Math.max(0, metrics.correlationCoefficient);
    const errorScore = Math.max(0, 1 - metrics.meanAbsoluteError / 0.5); // Normalize by max expected error
    const skillScoreNorm = Math.max(0, metrics.skillScore);
    const coverageScore = (metrics.spatialCoverage + metrics.temporalCoverage) / 2;

    const reliabilityScore = (correlationScore + errorScore + skillScoreNorm + coverageScore) / 4;

    // Determine quality category
    let overallQuality: 'excellent' | 'good' | 'fair' | 'poor';
    if (reliabilityScore >= 0.8) overallQuality = 'excellent';
    else if (reliabilityScore >= 0.6) overallQuality = 'good';
    else if (reliabilityScore >= 0.4) overallQuality = 'fair';
    else overallQuality = 'poor';

    // Calculate uncertainty estimate
    const uncertaintyEstimate = metrics.rootMeanSquareError;

    // Data completeness based on spatial-temporal coverage
    const dataCompleteness = Math.min(1, (metrics.spatialCoverage + metrics.temporalCoverage) / 2);

    return {
      overall_quality: overallQuality,
      reliability_score: reliabilityScore,
      uncertainty_estimate: uncertaintyEstimate,
      data_completeness: dataCompleteness
    };
  }

  /**
   * Generate actionable recommendations
   */
  private generateValidationRecommendations(
    metrics: AccuracyMetrics,
    spatialAnalysis: ValidationResult['spatial_analysis'],
    temporalAnalysis: ValidationResult['temporal_analysis'],
    qualityAssessment: ValidationResult['quality_assessment']
  ): string[] {
    const recommendations: string[] = [];

    // Accuracy-based recommendations
    if (metrics.meanAbsoluteError > 0.2) {
      recommendations.push('High mean absolute error detected - consider model recalibration');
    }

    if (metrics.correlationCoefficient < 0.6) {
      recommendations.push('Low correlation between satellite and model data - review model parameters');
    }

    if (Math.abs(metrics.percentBias) > 20) {
      recommendations.push(
        metrics.percentBias > 0 
          ? 'Model consistently overestimates - apply negative bias correction'
          : 'Model consistently underestimates - apply positive bias correction'
      );
    }

    // Spatial pattern recommendations
    if (spatialAnalysis.error_patterns.length > 0) {
      recommendations.push(`Spatial error patterns detected: ${spatialAnalysis.error_patterns.join(', ')}`);
    }

    if (spatialAnalysis.hotspots.length > 3) {
      recommendations.push('Multiple error hotspots identified - consider regional model adjustments');
    }

    // Temporal pattern recommendations
    if (temporalAnalysis.seasonal_patterns.size > 0) {
      const seasonalErrors = Array.from(temporalAnalysis.seasonal_patterns.values());
      const maxSeasonalError = Math.max(...seasonalErrors);
      const minSeasonalError = Math.min(...seasonalErrors);
      
      if (maxSeasonalError - minSeasonalError > 0.1) {
        recommendations.push('Significant seasonal variation in accuracy - implement seasonal corrections');
      }
    }

    // Coverage recommendations
    if (metrics.spatialCoverage < 0.7) {
      recommendations.push('Low spatial coverage - increase satellite observation density');
    }

    if (metrics.temporalCoverage < 0.7) {
      recommendations.push('Low temporal coverage - increase observation frequency');
    }

    // Quality-based recommendations
    if (qualityAssessment.overall_quality === 'poor') {
      recommendations.push('Overall validation quality is poor - consider fundamental model review');
    }

    if (qualityAssessment.data_completeness < 0.6) {
      recommendations.push('Insufficient data completeness - expand validation dataset');
    }

    return recommendations;
  }

  /**
   * Create validation summary
   */
  private createValidationSummary(
    metrics: AccuracyMetrics,
    qualityAssessment: ValidationResult['quality_assessment']
  ): string {
    return `Validation Summary: ${qualityAssessment.overall_quality.toUpperCase()} quality ` +
           `(reliability: ${(qualityAssessment.reliability_score * 100).toFixed(1)}%). ` +
           `MAE: ${metrics.meanAbsoluteError.toFixed(3)}, ` +
           `RMSE: ${metrics.rootMeanSquareError.toFixed(3)}, ` +
           `Correlation: ${metrics.correlationCoefficient.toFixed(3)}, ` +
           `Sample size: ${metrics.sampleSize} validation pairs.`;
  }

  // Utility methods for calculations...
  
  private calculateSpatialDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    // Haversine formula for great circle distance
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private calculateTemporalDistance(time1: Date, time2: Date): number {
    return Math.abs(time1.getTime() - time2.getTime()) / (1000 * 60 * 60); // Hours
  }

  private calculateValidationWeight(satObs: SatelliteObservation, modelPred: ModelPrediction): number {
    // Weight based on observation quality and model confidence
    const satWeight = satObs.confidence || 0.8; // Default if no confidence
    const modelWeight = modelPred.confidence;
    const cloudWeight = satObs.cloudCover ? Math.max(0, 1 - satObs.cloudCover / 100) : 1;
    
    return (satWeight + modelWeight + cloudWeight) / 3;
  }

  private calculateWeightedMean(values: number[], weights: number[]): number {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const weightedSum = values.reduce((sum, val, i) => sum + val * weights[i], 0);
    return weightedSum / totalWeight;
  }

  private calculateWeightedCorrelation(x: number[], y: number[], weights: number[]): number {
    const n = x.length;
    
    const xMean = this.calculateWeightedMean(x, weights);
    const yMean = this.calculateWeightedMean(y, weights);
    
    let numerator = 0;
    let xVariance = 0;
    let yVariance = 0;
    
    for (let i = 0; i < n; i++) {
      const xDiff = x[i] - xMean;
      const yDiff = y[i] - yMean;
      const weight = weights[i];
      
      numerator += weight * xDiff * yDiff;
      xVariance += weight * xDiff * xDiff;
      yVariance += weight * yDiff * yDiff;
    }
    
    return numerator / Math.sqrt(xVariance * yVariance);
  }

  private calculateSkillScore(validationPoints: ValidationPoint[], weights: number[]): number {
    // Skill score vs persistence (assumes persistence = mean)
    const meanSatellite = this.calculateWeightedMean(
      validationPoints.map(p => p.satelliteValue), weights
    );
    
    const modelMSE = this.calculateWeightedMean(
      validationPoints.map(p => p.difference * p.difference), weights
    );
    
    const persistenceMSE = this.calculateWeightedMean(
      validationPoints.map(p => (p.satelliteValue - meanSatellite) ** 2), weights
    );
    
    return 1 - modelMSE / persistenceMSE;
  }

  private calculateIndexOfAgreement(validationPoints: ValidationPoint[], weights: number[]): number {
    const satMean = this.calculateWeightedMean(
      validationPoints.map(p => p.satelliteValue), weights
    );
    
    const numerator = this.calculateWeightedMean(
      validationPoints.map(p => p.difference * p.difference), weights
    );
    
    const denominator = this.calculateWeightedMean(
      validationPoints.map(p => 
        (Math.abs(p.modelValue - satMean) + Math.abs(p.satelliteValue - satMean)) ** 2
      ), weights
    );
    
    return 1 - numerator / denominator;
  }

  private calculateNashSutcliffe(validationPoints: ValidationPoint[], satMean: number, weights: number[]): number {
    const numerator = this.calculateWeightedMean(
      validationPoints.map(p => p.difference * p.difference), weights
    );
    
    const denominator = this.calculateWeightedMean(
      validationPoints.map(p => (p.satelliteValue - satMean) ** 2), weights
    );
    
    return 1 - numerator / denominator;
  }

  private calculateConfidenceInterval(validationPoints: ValidationPoint[], weights: number[]): {lower: number, upper: number} {
    const errors = validationPoints.map(p => p.difference);
    const weightedMean = this.calculateWeightedMean(errors, weights);
    
    // Calculate weighted standard deviation
    const weightedVariance = this.calculateWeightedMean(
      errors.map(err => (err - weightedMean) ** 2), weights
    );
    const weightedStd = Math.sqrt(weightedVariance);
    
    // 95% confidence interval (assuming normal distribution)
    const marginOfError = 1.96 * weightedStd / Math.sqrt(validationPoints.length);
    
    return {
      lower: weightedMean - marginOfError,
      upper: weightedMean + marginOfError
    };
  }

  private calculateCategoricalMetrics(validationPoints: ValidationPoint[]): {
    sensitivity: number;
    specificity: number;
    precision: number;
    recall: number;
    f1Score: number;
  } {
    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;

    for (const point of validationPoints) {
      const satPresence = point.satelliteValue > this.sargassumThreshold;
      const modelPresence = point.modelValue > this.sargassumThreshold;

      if (satPresence && modelPresence) truePositives++;
      else if (!satPresence && modelPresence) falsePositives++;
      else if (!satPresence && !modelPresence) trueNegatives++;
      else if (satPresence && !modelPresence) falseNegatives++;
    }

    const sensitivity = truePositives / (truePositives + falseNegatives) || 0;
    const specificity = trueNegatives / (trueNegatives + falsePositives) || 0;
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = sensitivity;
    const f1Score = 2 * (precision * recall) / (precision + recall) || 0;

    return { sensitivity, specificity, precision, recall, f1Score };
  }

  private calculateSpatialCorrelation(validationPoints: ValidationPoint[]): number {
    // Simplified spatial correlation based on distance-weighted errors
    const n = validationPoints.length;
    if (n < 3) return 0;

    let correlation = 0;
    let count = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const distance = this.calculateSpatialDistance(
          validationPoints[i].lat, validationPoints[i].lon,
          validationPoints[j].lat, validationPoints[j].lon
        );

        if (distance < 50) { // Within 50km
          const errorCorr = validationPoints[i].absoluteError * validationPoints[j].absoluteError;
          const weight = Math.exp(-distance / 20); // Exponential decay
          correlation += errorCorr * weight;
          count += weight;
        }
      }
    }

    return count > 0 ? correlation / count : 0;
  }

  private calculateTemporalCorrelation(validationPoints: ValidationPoint[]): number {
    // Sort by time and calculate temporal autocorrelation of errors
    const sortedPoints = [...validationPoints].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    if (sortedPoints.length < 3) return 0;

    let correlation = 0;
    let count = 0;

    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const timeDiff = this.calculateTemporalDistance(
        sortedPoints[i].timestamp, sortedPoints[i + 1].timestamp
      );

      if (timeDiff < 24) { // Within 24 hours
        const errorCorr = sortedPoints[i].absoluteError * sortedPoints[i + 1].absoluteError;
        const weight = Math.exp(-timeDiff / 12); // Exponential decay
        correlation += errorCorr * weight;
        count += weight;
      }
    }

    return count > 0 ? correlation / count : 0;
  }

  private calculateSpatialAutocorrelation(validationPoints: ValidationPoint[]): number {
    // Moran's I statistic for spatial autocorrelation
    const n = validationPoints.length;
    if (n < 4) return 0;

    const meanError = validationPoints.reduce((sum, p) => sum + p.absoluteError, 0) / n;
    let numerator = 0;
    let denominator = 0;
    let totalWeight = 0;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          const distance = this.calculateSpatialDistance(
            validationPoints[i].lat, validationPoints[i].lon,
            validationPoints[j].lat, validationPoints[j].lon
          );

          const weight = distance < 25 ? 1 / (1 + distance) : 0; // Inverse distance weighting
          
          if (weight > 0) {
            numerator += weight * (validationPoints[i].absoluteError - meanError) * 
                        (validationPoints[j].absoluteError - meanError);
            totalWeight += weight;
          }
        }
      }
      denominator += (validationPoints[i].absoluteError - meanError) ** 2;
    }

    return totalWeight > 0 ? (n * numerator) / (totalWeight * denominator) : 0;
  }

  private calculateSpatialCoverage(validationPoints: ValidationPoint[]): number {
    // Estimate spatial coverage as ratio of convex hull area to total region area
    if (validationPoints.length < 3) return 0;

    // Simple approximation using bounding box
    const lats = validationPoints.map(p => p.lat);
    const lons = validationPoints.map(p => p.lon);
    
    const latRange = Math.max(...lats) - Math.min(...lats);
    const lonRange = Math.max(...lons) - Math.min(...lons);
    
    // Normalize by typical ocean region size
    const typicalLatRange = 2.0; // degrees
    const typicalLonRange = 2.0; // degrees
    
    return Math.min(1, (latRange * lonRange) / (typicalLatRange * typicalLonRange));
  }

  private calculateTemporalCoverage(validationPoints: ValidationPoint[]): number {
    if (validationPoints.length < 2) return 0;

    const times = validationPoints.map(p => p.timestamp.getTime());
    const timeRange = Math.max(...times) - Math.min(...times);
    
    // Normalize by typical forecast period (7 days)
    const typicalTimeRange = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    
    return Math.min(1, timeRange / typicalTimeRange);
  }

  private isCoastal(lat: number, lon: number, bounds: [number, number, number, number]): boolean {
    // Simple heuristic: points within 20% of the boundary are considered coastal
    const [north, south, east, west] = bounds;
    const latMargin = (north - south) * 0.2;
    const lonMargin = (east - west) * 0.2;

    return lat <= south + latMargin || lat >= north - latMargin ||
           lon <= west + lonMargin || lon >= east - lonMargin;
  }

  private divideIntoRegions(
    validationPoints: ValidationPoint[],
    bounds: [number, number, number, number]
  ): Map<string, ValidationPoint[]> {
    const regions = new Map<string, ValidationPoint[]>();
    const [north, south, east, west] = bounds;
    
    const latMid = (north + south) / 2;
    const lonMid = (east + west) / 2;

    regions.set('NW', []);
    regions.set('NE', []);
    regions.set('SW', []);
    regions.set('SE', []);

    for (const point of validationPoints) {
      let regionKey = '';
      regionKey += point.lat >= latMid ? 'N' : 'S';
      regionKey += point.lon >= lonMid ? 'E' : 'W';
      
      regions.get(regionKey)!.push(point);
    }

    return regions;
  }

  private getSeasonName(month: number): string {
    if (month >= 2 && month <= 4) return 'Spring';
    if (month >= 5 && month <= 7) return 'Summer';
    if (month >= 8 && month <= 10) return 'Fall';
    return 'Winter';
  }

  private calculateTrendAnalysis(validationPoints: ValidationPoint[]): {
    slope: number;
    significance: number;
    r_squared: number;
  } {
    const sortedPoints = [...validationPoints].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    if (sortedPoints.length < 3) {
      return { slope: 0, significance: 0, r_squared: 0 };
    }

    // Linear regression of error vs time
    const n = sortedPoints.length;
    const times = sortedPoints.map((_p, i) => i); // Use index as time proxy
    const errors = sortedPoints.map(p => p.absoluteError);

    const timeMean = times.reduce((sum, t) => sum + t, 0) / n;
    const errorMean = errors.reduce((sum, e) => sum + e, 0) / n;

    let numerator = 0;
    let denominator = 0;
    let totalSumSquares = 0;

    for (let i = 0; i < n; i++) {
      const timeDiff = times[i] - timeMean;
      const errorDiff = errors[i] - errorMean;
      
      numerator += timeDiff * errorDiff;
      denominator += timeDiff * timeDiff;
      totalSumSquares += errorDiff * errorDiff;
    }

    const slope = denominator > 0 ? numerator / denominator : 0;
    
    // Calculate R-squared
    let residualSumSquares = 0;
    for (let i = 0; i < n; i++) {
      const predicted = errorMean + slope * (times[i] - timeMean);
      residualSumSquares += (errors[i] - predicted) ** 2;
    }

    const rSquared = totalSumSquares > 0 ? 1 - residualSumSquares / totalSumSquares : 0;
    
    // Simple significance test (t-statistic approximation)
    const standardError = Math.sqrt(residualSumSquares / (n - 2)) / Math.sqrt(denominator);
    const tStatistic = standardError > 0 ? Math.abs(slope / standardError) : 0;
    const significance = Math.min(1, tStatistic / 2); // Simplified p-value approximation

    return { slope, significance, r_squared: rSquared };
  }

  private createMinimalValidationResult(
    validationPoints: ValidationPoint[],
    message: string
  ): ValidationResult {
    return {
      accuracy_metrics: {
        meanAbsoluteError: 0,
        rootMeanSquareError: 0,
        meanBias: 0,
        correlationCoefficient: 0,
        skillScore: 0,
        indexOfAgreement: 0,
        nashSutcliffeEfficiency: 0,
        percentBias: 0,
        confidenceInterval95: { lower: 0, upper: 0 },
        sensitivity: 0,
        specificity: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        spatialCorrelation: 0,
        temporalCorrelation: 0,
        spatialAutocorrelation: 0,
        sampleSize: validationPoints.length,
        validPairs: validationPoints.length,
        spatialCoverage: 0,
        temporalCoverage: 0
      },
      validation_points: validationPoints,
      quality_assessment: {
        overall_quality: 'poor',
        reliability_score: 0,
        uncertainty_estimate: 1,
        data_completeness: 0
      },
      spatial_analysis: {
        hotspots: [],
        error_patterns: [],
        regional_performance: new Map()
      },
      temporal_analysis: {
        seasonal_patterns: new Map(),
        daily_patterns: new Map(),
        trend_analysis: { slope: 0, significance: 0, r_squared: 0 }
      },
      recommendations: [message],
      validation_summary: message
    };
  }
}