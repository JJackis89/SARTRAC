import React, { useState } from 'react';
import { BrowserSatelliteTest, TestResult } from '../tests/satelliteIntegrationTest';

const SatelliteTestPanel: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [testOutput, setTestOutput] = useState<string[]>([]);

  const runTests = async () => {
    setIsRunning(true);
    setResults([]);
    setTestOutput([]);

    // Capture console output
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...args) => {
      const message = args.join(' ');
      logs.push(message);
      setTestOutput(prev => [...prev, message]);
      originalLog(...args);
    };

    try {
      const tester = new BrowserSatelliteTest();
      const testResults = await tester.runTests();
      setResults(testResults);
    } catch (error) {
      console.log(`❌ Test execution failed: ${error}`);
    }

    // Restore console
    console.log = originalLog;
    setIsRunning(false);
  };

  const getStatusIcon = (success: boolean) => success ? '✅' : '❌';
  const successRate = results.length > 0 
    ? (results.filter(r => r.success).length / results.length) * 100 
    : 0;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center">
          🛰️ Satellite Data Integration Test
        </h2>
        <button
          onClick={runTests}
          disabled={isRunning}
          className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
            isRunning
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isRunning ? '🔄 Running Tests...' : '▶️ Run Tests'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">📊 Test Summary</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{results.length}</div>
              <div className="text-sm text-gray-600">Total Tests</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {results.filter(r => r.success).length}
              </div>
              <div className="text-sm text-gray-600">Passed</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${successRate >= 80 ? 'text-green-600' : successRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                {successRate.toFixed(0)}%
              </div>
              <div className="text-sm text-gray-600">Success Rate</div>
            </div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4">📋 Test Results</h3>
          <div className="space-y-3">
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-l-4 ${
                  result.success 
                    ? 'bg-green-50 border-green-500' 
                    : 'bg-red-50 border-red-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">{getStatusIcon(result.success)}</span>
                    <span className="font-semibold">{result.testName}</span>
                    <span className="text-sm text-gray-500">
                      ({result.duration < 1000 ? `${result.duration}ms` : `${(result.duration/1000).toFixed(1)}s`})
                    </span>
                  </div>
                </div>
                
                {result.error && (
                  <div className="mt-2 text-red-600 text-sm">
                    Error: {result.error}
                  </div>
                )}
                
                {result.data && (
                  <div className="mt-2 text-xs text-gray-600">
                    <details>
                      <summary className="cursor-pointer hover:text-gray-800">View Data</summary>
                      <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {testOutput.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">📝 Console Output</h3>
          <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
            {testOutput.map((line, index) => (
              <div key={index} className="whitespace-pre-wrap">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isRunning && results.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-4">🛰️</div>
          <p>Click "Run Tests" to validate satellite data integration</p>
          <p className="text-sm mt-2">Tests will validate ERDDAP connections, data quality, and performance</p>
        </div>
      )}
    </div>
  );
};

export default SatelliteTestPanel;