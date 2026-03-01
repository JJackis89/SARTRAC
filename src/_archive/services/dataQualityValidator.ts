/**
 * Data Quality Validation System for Satellite-Model Fusion
 * Advanced algorithms for confidence scoring, accuracy metrics, and quality control
 */

import { SatelliteObservation } from './satelliteService';

export interface QualityMetrics {
  confidence: number;
  reliability: number;
  coverage: number;
  consistency: number;
  temporal_stability: number;
  spatial_coherence: number;
  overall_score: number;
}

export interface ValidationResult {
  passed: boolean;
  quality_metrics: QualityMetrics;
  quality_flags: string[];
  recommendations: string[];
  error_sources: string[];
  confidence_intervals: {
    lower: number;
    upper: number;
    margin_of_error: number;
  };
}

export interface DataFusionMetrics {
  model_weight: number;
  satellite_weight: number;
  fusion_confidence: number;
  uncertainty_reduction: number;
  information_gain: number;
  cross_validation_score: number;
}

export interface ModelPrediction {
  latitude: number;
  longitude: number;
  timestamp: Date;
  density: number;
  confidence: number;
  uncertainty: number;
  model_source: string;
}

export class DataQualityValidator {
  private readonly QUALITY_THRESHOLDS = {
    MIN_CONFIDENCE: 0.3,
    MIN_COVERAGE: 0.1,
    MIN_TEMPORAL_STABILITY: 0.5,
    MIN_SPATIAL_COHERENCE: 0.4,
    MAX_CLOUD_COVER: 80,
    MAX_SOLAR_ZENITH: 75,
    MAX_VIEWING_ANGLE: 60
  };

  private readonly WEIGHT_FACTORS = {
    CONFIDENCE: 0.25,
    RELIABILITY: 0.20,
    COVERAGE: 0.15,
    CONSISTENCY: 0.20,
    TEMPORAL_STABILITY: 0.10,
    SPATIAL_COHERENCE: 0.10
  };

  /**
   * Validate satellite observations with comprehensive quality assessment
   */
  validateSatelliteData(observations: SatelliteObservation[], bounds: [number, number, number, number]): ValidationResult {
    console.log(`🔍 Validating ${observations.length} satellite observations...`);

    if (observations.length === 0) {
      return this.createFailedValidation('No satellite observations available');
    }

    const qualityMetrics = this.calculateQualityMetrics(observations, bounds);
    const qualityFlags = this.generateQualityFlags(observations, qualityMetrics);
    const recommendations = this.generateRecommendations(qualityMetrics, qualityFlags);
    const errorSources = this.identifyErrorSources(observations, qualityMetrics);
    const confidenceIntervals = this.calculateConfidenceIntervals(observations);

    const passed = this.assessOverallQuality(qualityMetrics);

    return {
      passed,
      quality_metrics: qualityMetrics,
      quality_flags: qualityFlags,
      recommendations,
      error_sources: errorSources,
      confidence_intervals: confidenceIntervals
    };
  }

  /**
   * Calculate comprehensive quality metrics for satellite observations
   */
  private calculateQualityMetrics(observations: SatelliteObservation[], bounds: [number, number, number, number]): QualityMetrics {
    const confidence = this.calculateConfidenceScore(observations);
    const reliability = this.calculateReliabilityScore(observations);
    const coverage = this.calculateCoverageScore(observations, bounds);
    const consistency = this.calculateConsistencyScore(observations);
    const temporal_stability = this.calculateTemporalStability(observations);
    const spatial_coherence = this.calculateSpatialCoherence(observations);

    const overall_score = (
      confidence * this.WEIGHT_FACTORS.CONFIDENCE +
      reliability * this.WEIGHT_FACTORS.RELIABILITY +
      coverage * this.WEIGHT_FACTORS.COVERAGE +
      consistency * this.WEIGHT_FACTORS.CONSISTENCY +
      temporal_stability * this.WEIGHT_FACTORS.TEMPORAL_STABILITY +
      spatial_coherence * this.WEIGHT_FACTORS.SPATIAL_COHERENCE
    );

    return {
      confidence,
      reliability,
      coverage,
      consistency,
      temporal_stability,
      spatial_coherence,
      overall_score
    };
  }

  /**
   * Calculate confidence score based on observation quality indicators
   */
  private calculateConfidenceScore(observations: SatelliteObservation[]): number {
    if (observations.length === 0) return 0;

    const confidenceScores = observations.map(obs => {
      let score = obs.confidence;

      // Penalize high cloud cover
      if (obs.cloudCover && obs.cloudCover > 20) {
        score *= Math.max(0.1, 1 - (obs.cloudCover - 20) / 60);
      }

      // For future enhancement: add solar zenith and viewing angle checks
      // These properties would need to be added to the SatelliteObservation interface

      return Math.max(0, Math.min(1, score));
    });

    return confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length;
  }

  /**
   * Calculate reliability score based on data source and consistency
   */
  private calculateReliabilityScore(observations: SatelliteObservation[]): number {
    if (observations.length === 0) return 0;

    const sourceReliability = {
      'VIIRS': 0.9,
      'OLCI': 0.85,
      'MODIS': 0.8,
      'SeaWiFS': 0.7,
      'MERIS': 0.75
    };

    const reliabilityScores = observations.map(obs => {
      const baseReliability = sourceReliability[obs.satelliteName as keyof typeof sourceReliability] || 0.6;
      
      // Adjust based on quality flags
      let flagMultiplier = 1.0;
      if (obs.qualityFlags && obs.qualityFlags.length > 0) {
        const mainFlag = obs.qualityFlags[0];
        switch (mainFlag) {
          case 'high_confidence': flagMultiplier = 1.0; break;
          case 'moderate_confidence': flagMultiplier = 0.8; break;
          case 'low_confidence': flagMultiplier = 0.6; break;
          case 'poor': flagMultiplier = 0.3; break;
          default: flagMultiplier = 0.7;
        }
      }

      return baseReliability * flagMultiplier;
    });

    return reliabilityScores.reduce((sum, score) => sum + score, 0) / reliabilityScores.length;
  }

  /**
   * Calculate spatial coverage score within the specified bounds
   */
  private calculateCoverageScore(observations: SatelliteObservation[], bounds: [number, number, number, number]): number {
    if (observations.length === 0) return 0;

    const [minLon, minLat, maxLon, maxLat] = bounds;
    
    // Create a grid to assess coverage
    const gridResolution = 0.1; // degrees
    const gridCols = Math.ceil((maxLon - minLon) / gridResolution);
    const gridRows = Math.ceil((maxLat - minLat) / gridResolution);
    const coveredCells = new Set<string>();

    observations.forEach(obs => {
      if (obs.lat >= minLat && obs.lat <= maxLat && 
          obs.lon >= minLon && obs.lon <= maxLon) {
        const gridCol = Math.floor((obs.lon - minLon) / gridResolution);
        const gridRow = Math.floor((obs.lat - minLat) / gridResolution);
        coveredCells.add(`${gridCol},${gridRow}`);
      }
    });

    const totalCells = gridCols * gridRows;
    const coverageRatio = coveredCells.size / totalCells;

    return Math.min(1.0, coverageRatio * 2); // Scale to make 50% coverage = 1.0 score
  }

  /**
   * Calculate consistency score across observations
   */
  private calculateConsistencyScore(observations: SatelliteObservation[]): number {
    if (observations.length < 2) return 1.0;

    // Group observations by spatial proximity
    const spatialGroups = this.groupObservationsBySpatialProximity(observations, 0.05); // 0.05 degree threshold
    
    let consistencyScores: number[] = [];

    spatialGroups.forEach(group => {
      if (group.length < 2) return;

      const sargassumValues = group.map(obs => obs.sargassumIndex);
      const mean = sargassumValues.reduce((sum, val) => sum + val, 0) / sargassumValues.length;
      const variance = sargassumValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sargassumValues.length;
      const coefficientOfVariation = mean > 0 ? Math.sqrt(variance) / mean : 0;

      // Lower coefficient of variation = higher consistency
      const consistency = Math.max(0, 1 - coefficientOfVariation);
      consistencyScores.push(consistency);
    });

    return consistencyScores.length > 0 ? 
      consistencyScores.reduce((sum, score) => sum + score, 0) / consistencyScores.length : 1.0;
  }

  /**
   * Calculate temporal stability across time series
   */
  private calculateTemporalStability(observations: SatelliteObservation[]): number {
    if (observations.length < 2) return 1.0;

    // Sort observations by timestamp
    const sortedObs = [...observations].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    let stabilityScores: number[] = [];

    for (let i = 1; i < sortedObs.length; i++) {
      const prev = sortedObs[i - 1];
      const curr = sortedObs[i];
      
      // Calculate temporal distance in hours
      const timeDiff = (curr.timestamp.getTime() - prev.timestamp.getTime()) / (1000 * 60 * 60);
      
      // Only compare observations within reasonable temporal proximity (24 hours)
      if (timeDiff <= 24) {
        const sargassumChange = Math.abs(curr.sargassumIndex - prev.sargassumIndex);
        const expectedChange = Math.min(0.02, timeDiff * 0.001); // Expected gradual change
        const stability = Math.max(0, 1 - Math.max(0, sargassumChange - expectedChange) / 0.05);
        stabilityScores.push(stability);
      }
    }

    return stabilityScores.length > 0 ? 
      stabilityScores.reduce((sum, score) => sum + score, 0) / stabilityScores.length : 1.0;
  }

  /**
   * Calculate spatial coherence of observations
   */
  private calculateSpatialCoherence(observations: SatelliteObservation[]): number {
    if (observations.length < 3) return 1.0;

    let coherenceScores: number[] = [];

    observations.forEach((obs, index) => {
      // Find nearby observations within 0.1 degrees
      const nearbyObs = observations.filter((other, otherIndex) => {
        if (index === otherIndex) return false;
        const distance = Math.sqrt(
          Math.pow(obs.lat - other.lat, 2) + 
          Math.pow(obs.lon - other.lon, 2)
        );
        return distance <= 0.1;
      });

      if (nearbyObs.length > 0) {
        const meanNearbySargassum = nearbyObs.reduce((sum, nearby) => sum + nearby.sargassumIndex, 0) / nearbyObs.length;
        const sargassumDifference = Math.abs(obs.sargassumIndex - meanNearbySargassum);
        const coherence = Math.max(0, 1 - sargassumDifference / 0.05); // Normalize by expected max difference
        coherenceScores.push(coherence);
      }
    });

    return coherenceScores.length > 0 ? 
      coherenceScores.reduce((sum, score) => sum + score, 0) / coherenceScores.length : 1.0;
  }

  /**
   * Group observations by spatial proximity
   */
  private groupObservationsBySpatialProximity(observations: SatelliteObservation[], threshold: number): SatelliteObservation[][] {
    const groups: SatelliteObservation[][] = [];
    const processed = new Set<number>();

    observations.forEach((obs, index) => {
      if (processed.has(index)) return;

      const group = [obs];
      processed.add(index);

      observations.forEach((other, otherIndex) => {
        if (processed.has(otherIndex)) return;
        
        const distance = Math.sqrt(
          Math.pow(obs.lat - other.lat, 2) + 
          Math.pow(obs.lon - other.lon, 2)
        );

        if (distance <= threshold) {
          group.push(other);
          processed.add(otherIndex);
        }
      });

      groups.push(group);
    });

    return groups;
  }

  /**
   * Generate quality flags based on analysis
   */
  private generateQualityFlags(observations: SatelliteObservation[], metrics: QualityMetrics): string[] {
    const flags: string[] = [];

    if (metrics.confidence < this.QUALITY_THRESHOLDS.MIN_CONFIDENCE) {
      flags.push('LOW_CONFIDENCE');
    }
    if (metrics.coverage < this.QUALITY_THRESHOLDS.MIN_COVERAGE) {
      flags.push('INSUFFICIENT_COVERAGE');
    }
    if (metrics.temporal_stability < this.QUALITY_THRESHOLDS.MIN_TEMPORAL_STABILITY) {
      flags.push('TEMPORAL_INSTABILITY');
    }
    if (metrics.spatial_coherence < this.QUALITY_THRESHOLDS.MIN_SPATIAL_COHERENCE) {
      flags.push('SPATIAL_INCOHERENCE');
    }

    // Check for high cloud cover
    const highCloudObs = observations.filter(obs => (obs.cloudCover || 0) > this.QUALITY_THRESHOLDS.MAX_CLOUD_COVER);
    if (highCloudObs.length / observations.length > 0.5) {
      flags.push('HIGH_CLOUD_CONTAMINATION');
    }

    // Check for extreme viewing conditions - placeholder for future enhancement
    // These properties would need to be added to the SatelliteObservation interface
    // const extremeConditions = observations.filter(obs => extreme conditions exist);
    // if (extremeConditions.length / observations.length > 0.3) {
    //   flags.push('EXTREME_VIEWING_CONDITIONS');
    // }

    if (flags.length === 0) {
      flags.push('GOOD_QUALITY');
    }

    return flags;
  }

  /**
   * Generate recommendations for data improvement
   */
  private generateRecommendations(metrics: QualityMetrics, flags: string[]): string[] {
    const recommendations: string[] = [];

    if (flags.includes('LOW_CONFIDENCE')) {
      recommendations.push('Apply stricter quality filters to remove low-confidence observations');
      recommendations.push('Consider using only recent, high-resolution satellite data');
    }

    if (flags.includes('INSUFFICIENT_COVERAGE')) {
      recommendations.push('Expand temporal window to include more observations');
      recommendations.push('Consider integrating additional satellite data sources');
    }

    if (flags.includes('HIGH_CLOUD_CONTAMINATION')) {
      recommendations.push('Implement cloud masking algorithms');
      recommendations.push('Use gap-filling techniques for cloud-covered areas');
    }

    if (flags.includes('TEMPORAL_INSTABILITY')) {
      recommendations.push('Apply temporal smoothing filters');
      recommendations.push('Investigate potential data processing issues');
    }

    if (flags.includes('SPATIAL_INCOHERENCE')) {
      recommendations.push('Apply spatial interpolation and smoothing');
      recommendations.push('Check for potential geolocation errors');
    }

    if (flags.includes('EXTREME_VIEWING_CONDITIONS')) {
      recommendations.push('Filter out observations with extreme viewing geometries');
      recommendations.push('Apply viewing angle corrections where appropriate');
    }

    if (metrics.overall_score > 0.8) {
      recommendations.push('Data quality is excellent - suitable for operational use');
    } else if (metrics.overall_score > 0.6) {
      recommendations.push('Data quality is good - minor improvements possible');
    } else {
      recommendations.push('Data quality needs improvement before operational use');
    }

    return recommendations;
  }

  /**
   * Identify potential error sources
   */
  private identifyErrorSources(observations: SatelliteObservation[], metrics: QualityMetrics): string[] {
    const errorSources: string[] = [];

    if (metrics.reliability < 0.7) {
      errorSources.push('Inconsistent data source quality');
    }

    if (metrics.consistency < 0.6) {
      errorSources.push('High spatial variability may indicate noise or real phenomena');
    }

    // Check for low processing level data - placeholder for future enhancement
    // This would require adding processingLevel to SatelliteObservation interface
    // const processingLevelIssues = observations.filter(obs => 
    //   !obs.processingLevel || obs.processingLevel === 'L1' || obs.processingLevel === 'L2'
    // );
    // if (processingLevelIssues.length / observations.length > 0.5) {
    //   errorSources.push('Low processing level data may contain atmospheric effects');
    // }

    const oldObservations = observations.filter(obs => {
      const ageHours = (Date.now() - obs.timestamp.getTime()) / (1000 * 60 * 60);
      return ageHours > 72;
    });
    if (oldObservations.length / observations.length > 0.7) {
      errorSources.push('Data may be outdated for real-time applications');
    }

    return errorSources;
  }

  /**
   * Calculate confidence intervals for observations
   */
  private calculateConfidenceIntervals(observations: SatelliteObservation[]): { lower: number; upper: number; margin_of_error: number } {
    if (observations.length === 0) {
      return { lower: 0, upper: 0, margin_of_error: 0 };
    }

    const sargassumValues = observations.map(obs => obs.sargassumIndex);
    const mean = sargassumValues.reduce((sum, val) => sum + val, 0) / sargassumValues.length;
    const variance = sargassumValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sargassumValues.length;
    const standardError = Math.sqrt(variance / sargassumValues.length);
    
    // 95% confidence interval (z = 1.96)
    const marginOfError = 1.96 * standardError;
    
    return {
      lower: Math.max(0, mean - marginOfError),
      upper: mean + marginOfError,
      margin_of_error: marginOfError
    };
  }

  /**
   * Assess overall data quality
   */
  private assessOverallQuality(metrics: QualityMetrics): boolean {
    return metrics.overall_score >= 0.6 && 
           metrics.confidence >= this.QUALITY_THRESHOLDS.MIN_CONFIDENCE &&
           metrics.coverage >= this.QUALITY_THRESHOLDS.MIN_COVERAGE;
  }

  /**
   * Create a failed validation result
   */
  private createFailedValidation(reason: string): ValidationResult {
    return {
      passed: false,
      quality_metrics: {
        confidence: 0,
        reliability: 0,
        coverage: 0,
        consistency: 0,
        temporal_stability: 0,
        spatial_coherence: 0,
        overall_score: 0
      },
      quality_flags: ['VALIDATION_FAILED'],
      recommendations: [`Validation failed: ${reason}`],
      error_sources: [reason],
      confidence_intervals: { lower: 0, upper: 0, margin_of_error: 0 }
    };
  }

  /**
   * Perform satellite-model data fusion with quality weighting
   */
  fuseSatelliteModelData(
    satelliteObs: SatelliteObservation[],
    modelPredictions: ModelPrediction[],
    bounds: [number, number, number, number]
  ): DataFusionMetrics {
    const satelliteValidation = this.validateSatelliteData(satelliteObs, bounds);
    
    // Calculate fusion weights based on quality
    const satelliteWeight = this.calculateSatelliteWeight(satelliteValidation);
    const modelWeight = 1 - satelliteWeight;
    
    // Calculate fusion metrics
    const fusionConfidence = this.calculateFusionConfidence(satelliteValidation, modelPredictions);
    const uncertaintyReduction = this.calculateUncertaintyReduction(satelliteObs, modelPredictions);
    const informationGain = this.calculateInformationGain(satelliteObs, modelPredictions);
    const crossValidationScore = this.calculateCrossValidationScore(satelliteObs, modelPredictions);

    return {
      model_weight: modelWeight,
      satellite_weight: satelliteWeight,
      fusion_confidence: fusionConfidence,
      uncertainty_reduction: uncertaintyReduction,
      information_gain: informationGain,
      cross_validation_score: crossValidationScore
    };
  }

  private calculateSatelliteWeight(validation: ValidationResult): number {
    if (!validation.passed) return 0.1; // Minimum weight for failed validation
    
    const qualityScore = validation.quality_metrics.overall_score;
    const baseWeight = 0.7; // Base satellite weight when quality is perfect
    
    return Math.min(baseWeight, qualityScore * baseWeight);
  }

  private calculateFusionConfidence(validation: ValidationResult, modelPredictions: ModelPrediction[]): number {
    const satelliteConfidence = validation.quality_metrics.confidence;
    const modelConfidence = modelPredictions.length > 0 ? 
      modelPredictions.reduce((sum, pred) => sum + pred.confidence, 0) / modelPredictions.length : 0;
    
    // Weighted average of confidences
    const satelliteWeight = this.calculateSatelliteWeight(validation);
    const modelWeight = 1 - satelliteWeight;
    
    return satelliteConfidence * satelliteWeight + modelConfidence * modelWeight;
  }

  private calculateUncertaintyReduction(satelliteObs: SatelliteObservation[], modelPredictions: ModelPrediction[]): number {
    if (satelliteObs.length === 0 || modelPredictions.length === 0) return 0;
    
    // Calculate uncertainty before and after fusion
    const modelUncertainty = modelPredictions.reduce((sum, pred) => sum + pred.uncertainty, 0) / modelPredictions.length;
    const satelliteUncertainty = 1 - (satelliteObs.reduce((sum, obs) => sum + obs.confidence, 0) / satelliteObs.length);
    
    // Fusion reduces uncertainty through information combination
    const fusedUncertainty = Math.sqrt(modelUncertainty * satelliteUncertainty);
    
    return Math.max(0, (modelUncertainty - fusedUncertainty) / modelUncertainty);
  }

  private calculateInformationGain(satelliteObs: SatelliteObservation[], modelPredictions: ModelPrediction[]): number {
    if (satelliteObs.length === 0 || modelPredictions.length === 0) return 0;
    
    // Simplified information gain calculation based on data correlation
    // Higher gain when satellite and model data are complementary
    const correlationStrength = this.calculateDataCorrelation(satelliteObs, modelPredictions);
    
    return Math.max(0, 1 - Math.abs(correlationStrength)); // Higher gain for lower correlation
  }

  private calculateCrossValidationScore(satelliteObs: SatelliteObservation[], modelPredictions: ModelPrediction[]): number {
    if (satelliteObs.length === 0 || modelPredictions.length === 0) return 0;
    
    // Simplified cross-validation score
    const correlation = this.calculateDataCorrelation(satelliteObs, modelPredictions);
    
    return Math.max(0, Math.min(1, (correlation + 1) / 2)); // Normalize to 0-1 range
  }

  private calculateDataCorrelation(satelliteObs: SatelliteObservation[], modelPredictions: ModelPrediction[]): number {
    // Simplified correlation calculation
    // In practice, this would involve spatial and temporal matching of data points
    
    if (satelliteObs.length === 0 || modelPredictions.length === 0) return 0;
    
    const avgSatelliteSargassum = satelliteObs.reduce((sum, obs) => sum + obs.sargassumIndex, 0) / satelliteObs.length;
    const avgModelDensity = modelPredictions.reduce((sum, pred) => sum + pred.density, 0) / modelPredictions.length;
    
    // Normalized correlation approximation
    const normalizedCorrelation = Math.min(avgSatelliteSargassum, avgModelDensity) / Math.max(avgSatelliteSargassum, avgModelDensity);
    
    return normalizedCorrelation;
  }
}

export default DataQualityValidator;