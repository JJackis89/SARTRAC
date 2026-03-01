import React, { useState } from 'react';
import { RealSatelliteService } from '../services/realSatelliteService';

const AccuracyTestPanel: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const realSatelliteService = new RealSatelliteService();

  const runAccuracyValidation = async () => {
    setIsRunning(true);
    setError(null);
    setResults(null);

    try {
      console.log('🎯 Starting Accuracy Validation Test...');

      // Test region around Ghana's coast
      const testRegion = {
        north: 6.0,
        south: 4.0,
        east: -1.0,
        west: -3.0
      };

      const now = new Date();
      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

      // Generate mock model predictions for testing
      console.log('📊 Generating mock model predictions...');
      const modelPredictions = realSatelliteService.generateMockModelPredictions(
        testRegion.north,
        testRegion.south,
        testRegion.east,
        testRegion.west,
        startDate,
        now,
        40 // Generate 40 predictions
      );

      console.log(`Generated ${modelPredictions.length} model predictions`);

      // Perform comprehensive accuracy assessment
      console.log('🔍 Performing accuracy assessment...');
      const assessmentResults = await realSatelliteService.performAccuracyAssessment(
        testRegion.north,
        testRegion.south,
        testRegion.east,
        testRegion.west,
        startDate,
        now,
        modelPredictions
      );

      console.log('✅ Accuracy validation completed!');
      setResults(assessmentResults);

    } catch (err) {
      console.error('❌ Accuracy validation failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsRunning(false);
    }
  };

  const runContinuousMonitoring = async () => {
    setIsRunning(true);
    setError(null);

    try {
      console.log('🔄 Starting continuous accuracy monitoring...');

      const monitoringRegions = [
        { name: 'Ghana West Coast', north: 6.0, south: 4.0, east: -1.0, west: -3.0 },
        { name: 'Ghana Central Coast', north: 6.0, south: 4.0, east: 1.0, west: -1.0 },
        { name: 'Ghana East Coast', north: 6.0, south: 4.0, east: 3.0, west: 1.0 }
      ];

      const stopMonitoring = await realSatelliteService.startAccuracyMonitoring(
        monitoringRegions,
        0.1, // Every 6 minutes for demo (normally would be hours)
        (regionName, results) => {
          console.log(`🔔 Accuracy update for ${regionName}:`, results.quality_assessment);
          setResults((prev: any) => ({
            ...prev,
            monitoringUpdate: {
              region: regionName,
              quality: results.quality_assessment.overall_quality,
              correlation: results.accuracy_metrics.correlationCoefficient,
              timestamp: new Date().toLocaleTimeString()
            }
          }));
        }
      );

      // Stop monitoring after 2 minutes for demo
      setTimeout(() => {
        stopMonitoring();
        console.log('🛑 Accuracy monitoring stopped');
        setIsRunning(false);
      }, 120000);

    } catch (err) {
      console.error('❌ Continuous monitoring failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setIsRunning(false);
    }
  };

  const renderAccuracyMetrics = (metrics: any) => {
    if (!metrics) return null;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 p-3 rounded">
            <div className="text-sm font-medium text-blue-900">Mean Absolute Error</div>
            <div className="text-lg font-bold text-blue-700">{metrics.meanAbsoluteError?.toFixed(4) || 'N/A'}</div>
          </div>
          <div className="bg-green-50 p-3 rounded">
            <div className="text-sm font-medium text-green-900">Correlation</div>
            <div className="text-lg font-bold text-green-700">{metrics.correlationCoefficient?.toFixed(3) || 'N/A'}</div>
          </div>
          <div className="bg-purple-50 p-3 rounded">
            <div className="text-sm font-medium text-purple-900">RMSE</div>
            <div className="text-lg font-bold text-purple-700">{metrics.rootMeanSquareError?.toFixed(4) || 'N/A'}</div>
          </div>
          <div className="bg-orange-50 p-3 rounded">
            <div className="text-sm font-medium text-orange-900">Skill Score</div>
            <div className="text-lg font-bold text-orange-700">{metrics.skillScore?.toFixed(3) || 'N/A'}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm font-medium text-gray-900">Sensitivity</div>
            <div className="text-lg font-bold text-gray-700">{metrics.sensitivity?.toFixed(3) || 'N/A'}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm font-medium text-gray-900">Precision</div>
            <div className="text-lg font-bold text-gray-700">{metrics.precision?.toFixed(3) || 'N/A'}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm font-medium text-gray-900">F1 Score</div>
            <div className="text-lg font-bold text-gray-700">{metrics.f1Score?.toFixed(3) || 'N/A'}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderQualityAssessment = (quality: any) => {
    if (!quality) return null;

    const qualityColors: { [key: string]: string } = {
      excellent: 'text-green-600 bg-green-100',
      good: 'text-blue-600 bg-blue-100',
      fair: 'text-yellow-600 bg-yellow-100',
      poor: 'text-red-600 bg-red-100'
    };
    
    const qualityColor = qualityColors[quality.overall_quality] || 'text-gray-600 bg-gray-100';

    return (
      <div className="space-y-3">
        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${qualityColor}`}>
          {quality.overall_quality?.toUpperCase()} Quality
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-600">Reliability Score</div>
            <div className="text-lg font-semibold">{(quality.reliability_score * 100)?.toFixed(1) || 'N/A'}%</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Uncertainty</div>
            <div className="text-lg font-semibold">±{quality.uncertainty_estimate?.toFixed(3) || 'N/A'}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          🎯 Accuracy Validation System
        </h2>
        <p className="text-gray-600 mt-1">
          Statistical analysis comparing satellite observations vs model predictions
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={runAccuracyValidation}
          disabled={isRunning}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          {isRunning ? 'Running Validation...' : 'Run Accuracy Validation'}
        </button>

        <button
          onClick={runContinuousMonitoring}
          disabled={isRunning}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          {isRunning ? 'Monitoring Active...' : 'Start Continuous Monitoring'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="text-red-600">❌</span>
            <span className="font-medium text-red-800">Validation Error</span>
          </div>
          <p className="text-red-700 mt-1">{error}</p>
        </div>
      )}

      {results && (
        <div className="space-y-6">
          {results.accuracyResults && (
            <>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Quality Assessment</h3>
                {renderQualityAssessment(results.accuracyResults.quality_assessment)}
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Accuracy Metrics</h3>
                {renderAccuracyMetrics(results.accuracyResults.accuracy_metrics)}
              </div>

              {results.recommendedWeights && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Recommended Fusion Weights</h3>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-sm text-blue-600">Satellite Weight</div>
                        <div className="text-xl font-bold text-blue-800">{results.recommendedWeights.satelliteWeight}</div>
                      </div>
                      <div>
                        <div className="text-sm text-blue-600">Model Weight</div>
                        <div className="text-xl font-bold text-blue-800">{results.recommendedWeights.modelWeight}</div>
                      </div>
                      <div>
                        <div className="text-sm text-blue-600">Hybrid Confidence</div>
                        <div className="text-xl font-bold text-blue-800">{results.recommendedWeights.hybridConfidence}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {results.accuracyResults.recommendations && results.accuracyResults.recommendations.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Recommendations</h3>
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <ul className="space-y-2">
                      {results.accuracyResults.recommendations.map((rec: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-yellow-600 mt-1">💡</span>
                          <span className="text-yellow-800">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Validation Summary</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-800">{results.accuracyResults.validation_summary}</p>
                </div>
              </div>
            </>
          )}

          {results.monitoringUpdate && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-600">🔔</span>
                <span className="font-medium text-green-800">Monitoring Update</span>
                <span className="text-sm text-green-600">({results.monitoringUpdate.timestamp})</span>
              </div>
              <p className="text-green-700">
                <strong>{results.monitoringUpdate.region}:</strong> {' '}
                Quality: {results.monitoringUpdate.quality}, {' '}
                Correlation: {results.monitoringUpdate.correlation?.toFixed(3)}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">Accuracy Validation Features:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>✅ Statistical accuracy metrics (MAE, RMSE, correlation, skill score)</li>
          <li>✅ Categorical performance metrics (sensitivity, precision, F1-score)</li>
          <li>✅ Spatial and temporal correlation analysis</li>
          <li>✅ Quality assessment and reliability scoring</li>
          <li>✅ Automated fusion weight recommendations</li>
          <li>✅ Continuous monitoring with real-time updates</li>
          <li>✅ Error pattern detection and regional analysis</li>
          <li>✅ Confidence intervals and uncertainty estimation</li>
        </ul>
      </div>
    </div>
  );
};

export default AccuracyTestPanel;