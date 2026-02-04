"use client";

import { Line } from 'react-chartjs-2'
import Image from 'next/image'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

export default function CorporateDashboardPage() {
  const chartData = {
    labels: ['', '', '', '', '', '', '', '', '', '', '', ''],
    datasets: [
      {
        label: 'Last Month',
        data: [3.0, 3.2, 2.8, 3.1, 3.0, 3.2, 3.4, 3.5, 3.3, 3.2, 3.4, 3.6],
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#3B82F6',
        pointBorderColor: '#3B82F6',
        pointHoverRadius: 6
      },
      {
        label: 'Last Month',
        data: [3.5, 3.3, 3.2, 3.6, 3.4, 3.2, 3.6, 3.5, 3.8, 3.4, 3.3, 4.0],
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#10B981',
        pointBorderColor: '#10B981',
        pointHoverRadius: 6
      }
    ]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        titleFont: {
          size: 13
        },
        bodyFont: {
          size: 12
        }
      }
    },
    scales: {
      y: {
        display: false,
        beginAtZero: true,
        max: 5
      },
      x: {
        display: false
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  }

  return (
    <div className="space-y-6" style={{ maxWidth: '1800px', margin: '0 auto' }}>
      {/* KPI Cards */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {/* Total Employees */}
        <div 
          className="bg-white rounded-lg relative"
          style={{ 
            width: '100%',
            height: '183px',
            border: '1px solid #E5E7EB',
            boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
            position: 'relative'
          }}
        >
          {/* Title */}
          <h3 
            className="absolute"
            style={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 600,
              fontSize: '20px',
              lineHeight: '32px',
              color: '#05004E',
              top: '33px',
              left: '40px'
            }}
          >
            Total Employees
          </h3>
          
          {/* Icon */}
          <div 
            className="absolute flex items-center justify-center rounded-full"
            style={{
              width: '53.98px',
              height: '53.98px',
              top: '80px',
              left: '40px',
              background: 'linear-gradient(135deg, #E0D4F7 0%, #D4C5F9 100%)',
              border: '2px solid #B8A3E8'
            }}
          >
            <Image 
              src="/totalemployess.png" 
              alt="Total Employees" 
              width={44} 
              height={44}
            />
          </div>
          
          {/* Number */}
          <p 
            className="absolute"
            style={{
              fontFamily: 'Satoshi, sans-serif',
              fontWeight: 700,
              fontSize: '55px',
              lineHeight: '120%',
              color: '#1B1C30',
              top: '74px',
              left: '116px'
            }}
          >
            40,689
          </p>
        </div>

        {/* Total Passes */}
        <div 
          className="bg-white rounded-lg relative"
          style={{ 
            width: '100%',
            height: '183px',
            border: '1px solid #E5E7EB',
            boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
            position: 'relative'
          }}
        >
          {/* Title */}
          <h3 
            className="absolute"
            style={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 600,
              fontSize: '20px',
              lineHeight: '32px',
              color: '#05004E',
              top: '33px',
              left: '40px'
            }}
          >
            Total Passes
          </h3>
          
          {/* Icon */}
          <div 
            className="absolute flex items-center justify-center rounded-full"
            style={{
              width: '53.98px',
              height: '53.98px',
              top: '80px',
              left: '40px',
              background: 'linear-gradient(135deg, #E0D4F7 0%, #D4C5F9 100%)',
              border: '2px solid #B8A3E8'
            }}
          >
            <Image 
              src="/totalpasses.png" 
              alt="Total Passes" 
              width={44} 
              height={44}
            />
          </div>
          
          {/* Number */}
          <p 
            className="absolute"
            style={{
              fontFamily: 'Satoshi, sans-serif',
              fontWeight: 700,
              fontSize: '55px',
              lineHeight: '120%',
              color: '#1B1C30',
              top: '74px',
              left: '116px'
            }}
          >
            10,200
          </p>
        </div>

        {/* Active Gift Cards */}
        <div 
          className="bg-white rounded-lg relative"
          style={{ 
            width: '100%',
            height: '183px',
            border: '1px solid #E5E7EB',
            boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
            position: 'relative'
          }}
        >
          {/* Title */}
          <h3 
            className="absolute"
            style={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 600,
              fontSize: '20px',
              lineHeight: '32px',
              color: '#05004E',
              top: '33px',
              left: '40px'
            }}
          >
            Active Gift Cards
          </h3>
          
          {/* Icon */}
          <div 
            className="absolute flex items-center justify-center rounded-full"
            style={{
              width: '53.98px',
              height: '53.98px',
              top: '80px',
              left: '40px',
              background: 'linear-gradient(135deg, #E0D4F7 0%, #D4C5F9 100%)',
              border: '2px solid #B8A3E8'
            }}
          >
            <Image 
              src="/giftcards.png" 
              alt="Gift Cards" 
              width={44} 
              height={44}
            />
          </div>
          
          {/* Number */}
          <p 
            className="absolute"
            style={{
              fontFamily: 'Satoshi, sans-serif',
              fontWeight: 700,
              fontSize: '55px',
              lineHeight: '120%',
              color: '#1B1C30',
              top: '74px',
              left: '116px'
            }}
          >
            30,689
          </p>
        </div>
      </div>

      {/* Customer Satisfaction Chart */}
      <div 
        className="bg-white w-full"
        style={{
          minHeight: "351px",
          borderRadius: "20px",
          border: "1px solid #F8F9FA",
          boxShadow: "0px 4px 20px 0px rgba(238, 238, 238, 0.5)",
          padding: "clamp(16px, 3vw, 32px)"
        }}
      >
        <h3 
          className="font-semibold text-gray-900 mb-4 sm:mb-6"
          style={{
            fontSize: "clamp(16px, 2.5vw, 18px)",
            color: "#1F2937"
          }}
        >
          Customer Satisfaction
        </h3>
        <div className="relative h-[200px] mb-4 sm:mb-6">
          <Line data={chartData} options={chartOptions} />
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 pt-4">
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <line x1="1" y1="10" x2="20" y2="10" stroke="#3B82F6" strokeWidth="3"/>
              <circle cx="10" cy="10" r="4.5" fill="#3B82F6"/>
            </svg>
            <span className="text-sm text-gray-500">Last Month</span>
            <div 
              className="hidden sm:block"
              style={{
                width: "1px",
                height: "24px",
                backgroundColor: "#BDC9D3"
              }}
            ></div>
            <span className="text-sm font-semibold text-gray-900">MUR 3,004</span>
          </div>
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <line x1="1" y1="10" x2="20" y2="10" stroke="#10B981" strokeWidth="3"/>
              <circle cx="10" cy="10" r="4.5" fill="#10B981"/>
            </svg>
            <span className="text-sm text-gray-500">Last Month</span>
            <div 
              className="hidden sm:block"
              style={{
                width: "1px",
                height: "24px",
                backgroundColor: "#BDC9D3"
              }}
            ></div>
            <span className="text-sm font-semibold text-gray-900">MUR 4,504</span>
          </div>
        </div>
      </div>
    </div>
  );
}