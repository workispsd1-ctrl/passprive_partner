"use client";

import { useState } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function CorporateDashboardPage() {
  const [timePeriod, setTimePeriod] = useState('weekly');

  // Dynamic data based on time period
  const getMetricsData = () => {
    switch(timePeriod) {
      case 'daily':
        return {
          totalPointsPool: 50000,
          totalPasses: 142,
          redemptionRate: 42.2,
          pointsLabels: ['12 AM', '4 AM', '8 AM', '12 PM', '4 PM', '8 PM'],
          pointsData: [0, 500, 1200, 2500, 1850, 800],
          passesLabels: ['12 AM', '4 AM', '8 AM', '12 PM', '4 PM', '8 PM'],
          passesData: [12, 9, 18, 35, 42, 26],
          passTypeLabels: ['Classic', 'Deluxe', 'Super Deluxe'],
          passTypeData: [45, 38, 25],
          employeeEngagement: [35, 42, 48, 52, 45, 38],
          activePasses: 108,
          pointsDistributed: 11850,
          pointsRedeemed: 5000,
          periodLabel: 'Today'
        };
      case 'weekly':
        return {
          totalPointsPool: 50000,
          totalPasses: 540,
          redemptionRate: 51.2,
          pointsLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          pointsData: [2100, 2340, 2580, 2480, 2280, 2150, 2270],
          passesLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          passesData: [62, 74, 81, 79, 73, 66, 75],
          passTypeLabels: ['Classic', 'Deluxe', 'Super Deluxe'],
          passTypeData: [185, 162, 111],
          employeeEngagement: [68, 72, 78, 82, 75, 70, 73],
          activePasses: 458,
          pointsDistributed: 16200,
          pointsRedeemed: 8300,
          periodLabel: 'This Week'
        };
      case 'monthly':
        return {
          totalPointsPool: 50000,
          totalPasses: 2140,
          redemptionRate: 57.0,
          pointsLabels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
          pointsData: [4950, 5250, 5850, 5800],
          passesLabels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
          passesData: [490, 525, 560, 565],
          passTypeLabels: ['Classic', 'Deluxe', 'Super Deluxe'],
          passTypeData: [738, 648, 434],
          employeeEngagement: [280, 295, 305, 310],
          activePasses: 1820,
          pointsDistributed: 21850,
          pointsRedeemed: 12450,
          periodLabel: 'This Month'
        };
      default:
        return getMetricsData();
    }
  };

  const metrics = getMetricsData();

  const passesChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context) {
            return `Points: ${context.parsed.y.toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          font: {
            size: 11
          },
          color: '#6B7280'
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          },
          color: '#6B7280'
        }
      }
    }
  };

  const giftCardsChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context) {
            return `Passes: ${context.parsed.y.toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          font: {
            size: 11
          },
          color: '#6B7280'
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          },
          color: '#6B7280'
        }
      }
    }
  }

  const passesChartData = {
    labels: metrics.pointsLabels,
    datasets: [
      {
        label: 'Points Distributed',
        data: metrics.pointsData,
        borderColor: '#5D5FEF',
        backgroundColor: 'rgba(93, 95, 239, 0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#5D5FEF',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointHoverRadius: 6
      }
    ]
  };

  const giftCardsChartData = {
    labels: metrics.passesLabels,
    datasets: [
      {
        label: 'Passes',
        data: metrics.passesData,
        backgroundColor: 'rgba(93, 95, 239, 0.8)',
        borderColor: '#5D5FEF',
        borderWidth: 1,
        borderRadius: 6,
      }
    ]
  };

  const passTypeChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          padding: 15,
          font: {
            size: 12
          },
          color: '#6B7280'
        }
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context) {
            return `${context.label}: ${context.parsed.toLocaleString()} passes`;
          }
        }
      }
    }
  };

  const passTypeChartData = {
    labels: metrics.passTypeLabels,
    datasets: [
      {
        label: 'Pass Distribution',
        data: metrics.passTypeData,
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(168, 85, 247, 0.8)'
        ],
        borderColor: [
          '#22C55E',
          '#3B82F6',
          '#A855F7'
        ],
        borderWidth: 1,
      }
    ]
  };

  const engagementChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context) {
            return `Engaged Employees: ${context.parsed.y}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          font: {
            size: 11
          },
          color: '#6B7280'
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          },
          color: '#6B7280'
        }
      }
    }
  };

  const engagementChartData = {
    labels: metrics.pointsLabels,
    datasets: [
      {
        label: 'Employee Engagement',
        data: metrics.employeeEngagement,
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#10B981',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointHoverRadius: 6
      }
    ]
  };

  return (
    <div className="space-y-6" style={{ maxWidth: '1800px', margin: '0 auto' }}>
      {/* Header with Time Period Filter */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard Overview</h2>
          <p className="text-sm text-gray-500 mt-1">Track your corporate metrics and performance</p>
        </div>
        <div className="flex gap-2 bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
          <button
            onClick={() => setTimePeriod('daily')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              timePeriod === 'daily'
                ? 'bg-[#5D5FEF] text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => setTimePeriod('weekly')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              timePeriod === 'weekly'
                ? 'bg-[#5D5FEF] text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => setTimePeriod('monthly')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              timePeriod === 'monthly'
                ? 'bg-[#5D5FEF] text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      {/* KPI Cards - Simplified */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        {/* Total Points */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Total Points</h3>
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-bold text-[#151D48]">{metrics.totalPointsPool.toLocaleString()}</div>
          <div className="mt-2 text-xs text-[#737791]">Total purchased points</div>
        </div>

        {/* Total Passes */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Total Passes</h3>
            <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-bold text-[#151D48]">{metrics.totalPasses.toLocaleString()}</div>
          <div className="mt-2 text-xs text-[#737791]">{metrics.activePasses.toLocaleString()} active passes</div>
        </div>

        {/* Redemption Rate */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Redemption Rate</h3>
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-bold text-[#151D48]">{metrics.redemptionRate}%</div>
          <div className="mt-2 text-xs text-[#737791]">Points redeemed vs distributed</div>
        </div>
      </div>

      {/* Charts Grid - 2x2 Layout */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Points Distribution Chart */}
        <div 
          className="bg-white rounded-lg"
          style={{
            minHeight: "360px",
            border: "1px solid #F8F9FA",
            boxShadow: "0px 4px 20px 0px rgba(238, 238, 238, 0.5)",
            padding: "24px"
          }}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">Points Distribution Trend</h3>
              <p className="text-sm text-gray-500 mt-1">{metrics.periodLabel} Performance</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[#5D5FEF]"></div>
              <span className="text-xs font-medium text-[#5D5FEF]">Points</span>
            </div>
          </div>
          <div className="relative h-[260px]">
            <Line data={passesChartData} options={passesChartOptions} />
          </div>
        </div>

        {/* Pass Generation Chart */}
        <div 
          className="bg-white rounded-lg"
          style={{
            minHeight: "360px",
            border: "1px solid #F8F9FA",
            boxShadow: "0px 4px 20px 0px rgba(238, 238, 238, 0.5)",
            padding: "24px"
          }}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">Pass Generation Analytics</h3>
              <p className="text-sm text-gray-500 mt-1">{metrics.periodLabel} Distribution</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[#5D5FEF]"></div>
              <span className="text-xs font-medium text-[#5D5FEF]">Passes</span>
            </div>
          </div>
          <div className="relative h-[260px]">
            <Bar data={giftCardsChartData} options={giftCardsChartOptions} />
          </div>
        </div>

        {/* Pass Type Distribution Chart */}
        <div 
          className="bg-white rounded-lg"
          style={{
            minHeight: "360px",
            border: "1px solid #F8F9FA",
            boxShadow: "0px 4px 20px 0px rgba(238, 238, 238, 0.5)",
            padding: "24px"
          }}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">Pass Type Distribution</h3>
              <p className="text-sm text-gray-500 mt-1">Breakdown by tier</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg">
              <svg className="w-4 h-4 text-[#5D5FEF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="text-xs font-medium text-[#5D5FEF]">Types</span>
            </div>
          </div>
          <div className="relative h-[260px]">
            <Doughnut data={passTypeChartData} options={passTypeChartOptions} />
          </div>
        </div>

        {/* Employee Engagement Chart */}
        <div 
          className="bg-white rounded-lg"
          style={{
            minHeight: "360px",
            border: "1px solid #F8F9FA",
            boxShadow: "0px 4px 20px 0px rgba(238, 238, 238, 0.5)",
            padding: "24px"
          }}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">Employee Engagement</h3>
              <p className="text-sm text-gray-500 mt-1">{metrics.periodLabel} Activity</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[#10B981]"></div>
              <span className="text-xs font-medium text-green-600">Engaged</span>
            </div>
          </div>
          <div className="relative h-[260px]">
            <Line data={engagementChartData} options={engagementChartOptions} />
          </div>
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Pass Distribution Rate */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-[#151D48]">Pass Distribution</h4>
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-[#151D48] mb-2">
            {((metrics.activePasses / metrics.totalPasses) * 100).toFixed(1)}%
          </p>
          <p className="text-sm text-[#737791]">Active passes being utilized</p>
        </div>

        {/* Points Utilization */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-[#151D48]">Points Utilization</h4>
            <span className="text-2xl">💰</span>
          </div>
          <p className="text-3xl font-bold text-[#151D48] mb-2">
            {((metrics.pointsRedeemed / metrics.pointsDistributed) * 100).toFixed(1)}%
          </p>
          <p className="text-sm text-[#737791]">Distributed points redeemed</p>
        </div>

        {/* Pool Efficiency */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-[#151D48]">Pool Efficiency</h4>
            <span className="text-2xl">📊</span>
          </div>
          <p className="text-3xl font-bold text-[#151D48] mb-2">
            {((metrics.pointsDistributed / metrics.totalPointsPool) * 100).toFixed(1)}%
          </p>
          <p className="text-sm text-[#737791]">Pool distributed to employees</p>
        </div>
      </div>


    </div>
  );
}