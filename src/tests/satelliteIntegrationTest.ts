/**
 * Browser-compatible Satellite Integration Test
 * Test real-time satellite data integration within the application
 */

import { RealSatelliteService } from '../services/realSatelliteService';

export interface TestResult {
  testName: string;
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

export class BrowserSatelliteTest {
  private realSatelliteService: RealSatelliteService;
  private testResults: TestResult[] = [];

  constructor() {
    this.realSatelliteService = new RealSatelliteService();
  }

  /**
   * Run all satellite data tests in browser environment
   */
  async runTests(): Promise<TestResult[]> {
    console.log('🛰️ Starting Real Satellite Data Integration Tests in Browser...\n');
    
    // Test 1: ERDDAP Server Health Checks
    await this.testServerHealth();
    
    // Test 2: VIIRS Data Fetching
    await this.testVIIRSDataFetch();
    
    // Test 3: OLCI Data Fetching  
    await this.testOLCIDataFetch();
    
    // Test 4: Comprehensive Data Integration
    await this.testComprehensiveDataFetch();
    
    // Test 5: Data Quality Validation
    await this.testDataQualityValidation();
    
    // Test 6: Performance and Caching
    await this.testPerformanceMetrics();
    
    // Generate report
    this.generateTestReport();
    
    return this.testResults;
  }

  /**
   * Test ERDDAP server health and connectivity
   */
  private async testServerHealth(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('📡 Testing ERDDAP Server Health...');
      
      const healthStatus = this.realSatelliteService.getHealthStatus();
      const healthyServers = Object.values(healthStatus).filter(healthy => healthy).length;
      const totalServers = Object.keys(healthStatus).length;
      
      const success = healthyServers > 0;
      
      this.testResults.push({
        testName: 'ERDDAP Server Health',
        success,
        data: {
          healthyServers,
          totalServers,
          healthStatus
        },
        duration: Date.now() - startTime
      });
      
      console.log(`   ✅ ${healthyServers}/${totalServers} servers healthy`);
      
    } catch (error) {
      this.testResults.push({
        testName: 'ERDDAP Server Health',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      
      console.log(`   ❌ Server health check failed: ${error}`);
    }
  }

  /**
   * Test VIIRS satellite data fetching
   */
  private async testVIIRSDataFetch(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('🛰️ Testing VIIRS Data Fetching...');
      
      const testDate = new Date();
      testDate.setDate(testDate.getDate() - 1); // Yesterday's data
      const dateStr = testDate.toISOString().split('T')[0];
      
      const viirsResponse = await this.realSatelliteService.fetchVIIRSData({
        source: 'VIIRS',
        date: dateStr,
        bounds: [-4.5, 3.0, 2.5, 7.0], // Ghana bounds
        quality_threshold: 0.5
      });
      
      const success = viirsResponse.success && viirsResponse.data.length >= 0;
      
      this.testResults.push({
        testName: 'VIIRS Data Fetch',
        success,
        data: {
          dataPoints: viirsResponse.data.length,
          qualityScore: viirsResponse.metadata.quality_score,
          coverage: viirsResponse.metadata.coverage_percentage,
          source: viirsResponse.metadata.source
        },
        duration: Date.now() - startTime
      });
      
      if (success) {
        console.log(`   ✅ VIIRS data: ${viirsResponse.data.length} observations`);
        console.log(`   📊 Quality: ${(viirsResponse.metadata.quality_score * 100).toFixed(1)}%`);
        console.log(`   🗺️ Coverage: ${viirsResponse.metadata.coverage_percentage.toFixed(1)}%`);
      } else {
        console.log(`   ⚠️ VIIRS data fetch returned no data`);
        if (viirsResponse.errors) {
          console.log(`   Error: ${viirsResponse.errors.join(', ')}`);
        }
      }
      
    } catch (error) {
      this.testResults.push({
        testName: 'VIIRS Data Fetch',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      
      console.log(`   ❌ VIIRS data fetch failed: ${error}`);
    }
  }

  /**
   * Test OLCI satellite data fetching
   */
  private async testOLCIDataFetch(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('🛰️ Testing OLCI Data Fetching...');
      
      const testDate = new Date();
      testDate.setDate(testDate.getDate() - 1); // Yesterday's data
      const dateStr = testDate.toISOString().split('T')[0];
      
      const olciResponse = await this.realSatelliteService.fetchOLCIData({
        source: 'OLCI',
        date: dateStr,
        bounds: [-4.5, 3.0, 2.5, 7.0], // Ghana bounds
        quality_threshold: 0.5
      });
      
      const success = olciResponse.success && olciResponse.data.length >= 0;
      
      this.testResults.push({
        testName: 'OLCI Data Fetch',
        success,
        data: {
          dataPoints: olciResponse.data.length,
          qualityScore: olciResponse.metadata.quality_score,
          coverage: olciResponse.metadata.coverage_percentage,
          source: olciResponse.metadata.source
        },
        duration: Date.now() - startTime
      });
      
      if (success) {
        console.log(`   ✅ OLCI data: ${olciResponse.data.length} observations`);
        console.log(`   📊 Quality: ${(olciResponse.metadata.quality_score * 100).toFixed(1)}%`);
        console.log(`   🗺️ Coverage: ${olciResponse.metadata.coverage_percentage.toFixed(1)}%`);
      } else {
        console.log(`   ⚠️ OLCI data fetch returned no data`);
        if (olciResponse.errors) {
          console.log(`   Error: ${olciResponse.errors.join(', ')}`);
        }
      }
      
    } catch (error) {
      this.testResults.push({
        testName: 'OLCI Data Fetch',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      
      console.log(`   ❌ OLCI data fetch failed: ${error}`);
    }
  }

  /**
   * Test comprehensive satellite data integration
   */
  private async testComprehensiveDataFetch(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('📡 Testing Comprehensive Data Integration...');
      
      const testDate = new Date();
      testDate.setDate(testDate.getDate() - 1);
      const dateStr = testDate.toISOString().split('T')[0];
      
      const comprehensiveData = await this.realSatelliteService.getComprehensiveSatelliteData(
        dateStr,
        [-4.5, 3.0, 2.5, 7.0]
      );
      
      const totalObservations = comprehensiveData.combined.length;
      const viirsCount = comprehensiveData.viirs.data.length;
      const olciCount = comprehensiveData.olci.data.length;
      
      const success = totalObservations >= 0;
      
      this.testResults.push({
        testName: 'Comprehensive Data Integration',
        success,
        data: {
          totalObservations,
          viirsObservations: viirsCount,
          olciObservations: olciCount,
          overallQuality: comprehensiveData.overall_quality,
          viirsSuccess: comprehensiveData.viirs.success,
          olciSuccess: comprehensiveData.olci.success
        },
        duration: Date.now() - startTime
      });
      
      console.log(`   ✅ Total observations: ${totalObservations}`);
      console.log(`   🛰️ VIIRS: ${viirsCount} | OLCI: ${olciCount}`);
      console.log(`   🎯 Overall Quality: ${(comprehensiveData.overall_quality * 100).toFixed(1)}%`);
      
    } catch (error) {
      this.testResults.push({
        testName: 'Comprehensive Data Integration',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      
      console.log(`   ❌ Comprehensive data integration failed: ${error}`);
    }
  }

  /**
   * Test data quality validation algorithms
   */
  private async testDataQualityValidation(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('🔍 Testing Data Quality Validation...');
      
      // Get some test data first
      const testDate = new Date();
      testDate.setDate(testDate.getDate() - 1);
      const dateStr = testDate.toISOString().split('T')[0];
      
      const viirsResponse = await this.realSatelliteService.fetchVIIRSData({
        source: 'VIIRS',
        date: dateStr,
        bounds: [-4.5, 3.0, 2.5, 7.0]
      });
      
      if (viirsResponse.data.length > 0) {
        // Analyze data quality metrics
        const observations = viirsResponse.data;
        const avgConfidence = observations.reduce((sum, obs) => sum + obs.confidence, 0) / observations.length;
        const highQualityCount = observations.filter(obs => obs.confidence > 0.7).length;
        const cloudyCount = observations.filter(obs => (obs.cloudCover || 0) > 50).length;
        
        const qualityMetrics = {
          averageConfidence: avgConfidence,
          highQualityPercentage: (highQualityCount / observations.length) * 100,
          cloudyPercentage: (cloudyCount / observations.length) * 100,
          totalObservations: observations.length
        };
        
        const success = avgConfidence > 0.3; // Minimum quality threshold
        
        this.testResults.push({
          testName: 'Data Quality Validation',
          success,
          data: qualityMetrics,
          duration: Date.now() - startTime
        });
        
        console.log(`   ✅ Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
        console.log(`   🎯 High Quality: ${qualityMetrics.highQualityPercentage.toFixed(1)}%`);
        console.log(`   ☁️ Cloudy: ${qualityMetrics.cloudyPercentage.toFixed(1)}%`);
        
      } else {
        this.testResults.push({
          testName: 'Data Quality Validation',
          success: false,
          error: 'No data available for quality validation',
          duration: Date.now() - startTime
        });
        
        console.log(`   ⚠️ No data available for quality validation`);
      }
      
    } catch (error) {
      this.testResults.push({
        testName: 'Data Quality Validation',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      
      console.log(`   ❌ Data quality validation failed: ${error}`);
    }
  }

  /**
   * Test performance metrics and caching
   */
  private async testPerformanceMetrics(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('⚡ Testing Performance Metrics...');
      
      const performanceData = this.realSatelliteService.getPerformanceMetrics();
      const performanceMetrics = performanceData.serverMetrics;
      const healthStatus = this.realSatelliteService.getHealthStatus();
      
      const servers = Object.keys(performanceMetrics);
      const avgResponseTimes = servers.map(server => {
        const metrics = performanceMetrics[server];
        return {
          server,
          avgResponseTime: metrics.avg,
          latestResponseTime: metrics.latest,
          healthy: healthStatus[server] || false
        };
      });
      
      const success = servers.length > 0;
      
      this.testResults.push({
        testName: 'Performance Metrics',
        success,
        data: {
          serverCount: servers.length,
          avgResponseTimes,
          fastestServer: avgResponseTimes.length > 0 ? 
            avgResponseTimes.reduce((prev, curr) => prev.avgResponseTime < curr.avgResponseTime ? prev : curr) : null
        },
        duration: Date.now() - startTime
      });
      
      console.log(`   ✅ Monitored Servers: ${servers.length}`);
      avgResponseTimes.forEach(server => {
        const status = server.healthy ? '🟢' : '🔴';
        console.log(`   ${status} ${server.server}: ${server.avgResponseTime.toFixed(0)}ms avg`);
      });
      
    } catch (error) {
      this.testResults.push({
        testName: 'Performance Metrics',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      
      console.log(`   ❌ Performance metrics test failed: ${error}`);
    }
  }

  /**
   * Generate comprehensive test report
   */
  private generateTestReport(): void {
    console.log('\n📊 SATELLITE DATA INTEGRATION TEST REPORT');
    console.log('=' .repeat(50));
    
    const successfulTests = this.testResults.filter(result => result.success).length;
    const totalTests = this.testResults.length;
    const overallSuccess = (successfulTests / totalTests) * 100;
    
    console.log(`\n🎯 Overall Success Rate: ${overallSuccess.toFixed(1)}% (${successfulTests}/${totalTests})`);
    
    console.log('\n📋 Test Results:');
    this.testResults.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      const duration = result.duration < 1000 ? `${result.duration}ms` : `${(result.duration/1000).toFixed(1)}s`;
      
      console.log(`   ${index + 1}. ${status} ${result.testName} (${duration})`);
      
      if (!result.success && result.error) {
        console.log(`      Error: ${result.error}`);
      }
    });
    
    console.log('\n🔍 Recommendations:');
    
    if (overallSuccess < 50) {
      console.log('   ⚠️ CRITICAL: Most tests failed. Check ERDDAP server connectivity and API keys.');
    } else if (overallSuccess < 80) {
      console.log('   ⚠️ WARNING: Some tests failed. Review error messages and improve fallback systems.');
    } else {
      console.log('   ✅ EXCELLENT: Satellite data integration is working well!');
    }
    
    console.log('\n🚀 Next Steps:');
    console.log('   1. Configure API keys for production ERDDAP access');
    console.log('   2. Implement data quality thresholds based on test results');
    console.log('   3. Set up monitoring alerts for satellite data availability');
    console.log('   4. Optimize caching strategies for better performance');
    
    console.log('\n' + '=' .repeat(50));
    console.log('🛰️ Real Satellite Data Integration Tests Complete!\n');
  }
}

// Export for use in console testing
(window as any).BrowserSatelliteTest = BrowserSatelliteTest;

export default BrowserSatelliteTest;