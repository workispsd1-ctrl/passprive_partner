"use client";

import { useState } from "react";
import Image from "next/image";

export default function EmployeePassesPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [file, setFile] = useState(null);

  const handleAddEmployee = () => {
    // Handle add employee logic
    console.log({ firstName, lastName, email, phoneNumber });
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-50 py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8">
      {/* Whole Card Frame - Responsive */}
      <div className="flex flex-col gap-4 sm:gap-6 max-w-6xl mx-auto w-full">
        {/* Upper Card - Responsive */}
        <div 
          className="bg-white border border-[#D9D9D9] rounded-lg w-full"
          style={{ 
            paddingTop: 'clamp(32px, 5vw, 64px)',
            paddingBottom: 'clamp(32px, 5vw, 64px)',
            paddingLeft: 'clamp(16px, 4vw, 48px)',
            paddingRight: 'clamp(16px, 4vw, 48px)'
          }}
        >
          {/* Inner Frame - Responsive */}
          <div className="flex flex-col gap-4 sm:gap-6 w-full max-w-3xl mx-auto">
            {/* First Row - Responsive */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full">
              {/* First Name Input Field - Responsive */}
              <div className="flex flex-col gap-2 w-full sm:w-1/2">
                <label 
                  className="text-[#1E1E1E]"
                  style={{ 
                    fontSize: 'clamp(14px, 2vw, 16px)',
                    fontWeight: '400',
                    lineHeight: '140%',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                >
                  First Name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter first name"
                  className="border border-[#D9D9D9] rounded-lg px-3 sm:px-4 py-2 outline-none focus:border-[#5D5FEF] placeholder-[#B3B3B3] w-full"
                  style={{ 
                    minHeight: '49px',
                    fontSize: 'clamp(16px, 2.5vw, 18px)',
                    fontWeight: '500',
                    lineHeight: '140%',
                    fontFamily: 'Satoshi, system-ui, -apple-system, sans-serif'
                  }}
                />
              </div>

              {/* Last Name Input Field - Responsive */}
              <div className="flex flex-col gap-2 w-full sm:w-1/2">
                <label 
                  className="text-[#1E1E1E]"
                  style={{ 
                    fontSize: 'clamp(14px, 2vw, 16px)',
                    fontWeight: '400',
                    lineHeight: '140%',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                >
                  Last Name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter last name"
                  className="border border-[#D9D9D9] rounded-lg px-3 sm:px-4 py-2 outline-none focus:border-[#5D5FEF] placeholder-[#B3B3B3] w-full"
                  style={{ 
                    minHeight: '49px',
                    fontSize: 'clamp(16px, 2.5vw, 18px)',
                    fontWeight: '500',
                    lineHeight: '140%',
                    fontFamily: 'Satoshi, system-ui, -apple-system, sans-serif'
                  }}
                />
              </div>
            </div>

            {/* Second Row - Responsive */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full">
              {/* Email Input Field - Responsive */}
              <div className="flex flex-col gap-2 w-full sm:w-1/2">
                <label 
                  className="text-[#1E1E1E]"
                  style={{ 
                    fontSize: 'clamp(14px, 2vw, 16px)',
                    fontWeight: '400',
                    lineHeight: '140%',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address"
                  className="border border-[#D9D9D9] rounded-lg px-3 sm:px-4 py-2 outline-none focus:border-[#5D5FEF] placeholder-[#B3B3B3] w-full"
                  style={{ 
                    minHeight: '49px',
                    fontSize: 'clamp(16px, 2.5vw, 18px)',
                    fontWeight: '500',
                    lineHeight: '140%',
                    fontFamily: 'Satoshi, system-ui, -apple-system, sans-serif'
                  }}
                />
              </div>

              {/* Phone Number Input Field - Responsive */}
              <div className="flex flex-col gap-2 w-full sm:w-1/2">
                <label 
                  className="text-[#1E1E1E]"
                  style={{ 
                    fontSize: 'clamp(14px, 2vw, 16px)',
                    fontWeight: '400',
                    lineHeight: '140%',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                >
                  Phone number
                </label>
                <div className="flex gap-2 w-full">
                  <input
                    type="text"
                    value="+91"
                    disabled
                    className="border border-[#D9D9D9] bg-gray-50 rounded-lg px-2 sm:px-3 text-center text-gray-700"
                    style={{ width: 'clamp(50px, 10vw, 60px)', minHeight: '49px' }}
                  />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Enter phone number"
                    className="border border-[#D9D9D9] rounded-lg px-3 sm:px-4 py-2 outline-none focus:border-[#5D5FEF] placeholder-[#B3B3B3] flex-1"
                    style={{ 
                      minHeight: '49px',
                      fontSize: 'clamp(16px, 2.5vw, 18px)',
                      fontWeight: '500',
                      lineHeight: '140%',
                      fontFamily: 'Satoshi, system-ui, -apple-system, sans-serif'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Add Employee Button - Responsive */}
          <div className="flex justify-center mt-6 sm:mt-8">
            <button
              onClick={handleAddEmployee}
              className="bg-[#5D5FEF] border border-[#2C2C2C] rounded-lg hover:bg-[#4D4FDF] focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:ring-offset-2 w-full sm:w-auto"
              style={{ 
                maxWidth: '321px', 
                minHeight: '52px',
                padding: '12px 24px'
              }}
            >
              <span 
                className="text-white"
                style={{ 
                  fontSize: 'clamp(18px, 3vw, 23px)',
                  fontWeight: '700',
                  lineHeight: '120%',
                  fontFamily: 'Satoshi, system-ui, -apple-system, sans-serif'
                }}
              >
                Add Employee
              </span>
            </button>
          </div>
        </div>

        {/* Lower Card - File Upload Section - Responsive */}
        <div 
          className="bg-white border border-[#D9D9D9] rounded-lg w-full"
          style={{ 
            paddingTop: 'clamp(32px, 5vw, 64px)',
            paddingBottom: 'clamp(32px, 5vw, 64px)',
            paddingLeft: 'clamp(16px, 4vw, 48px)',
            paddingRight: 'clamp(16px, 4vw, 48px)'
          }}
        >
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center space-y-3 sm:space-y-4 py-6 sm:py-8"
          >
            {/* Upload Icon */}
            <div className="flex items-center justify-center rounded-full bg-indigo-100" 
              style={{ 
                width: 'clamp(64px, 12vw, 80px)', 
                height: 'clamp(64px, 12vw, 80px)' 
              }}
            >
              <Image
                src="/upload.png"
                alt="Upload"
                width={40}
                height={40}
                style={{ 
                  width: 'clamp(32px, 6vw, 40px)', 
                  height: 'clamp(32px, 6vw, 40px)' 
                }}
              />
            </div>

            {/* Upload Text */}
            <div className="text-center px-4">
              <h3 
                className="text-[#1E1E1E]"
                style={{ 
                  fontSize: 'clamp(16px, 2.5vw, 18px)',
                  fontWeight: '600',
                  lineHeight: '140%',
                  fontFamily: 'Satoshi, system-ui, -apple-system, sans-serif'
                }}
              >
                Upload Excel File
              </h3>
              <p 
                className="mt-1 text-[#757575]"
                style={{ 
                  fontSize: 'clamp(14px, 2vw, 16px)',
                  fontWeight: '400',
                  lineHeight: '140%'
                }}
              >
                Drag & drop file here, or
              </p>
            </div>

            {/* Browse File Button */}
            <div className="w-full sm:w-auto">
              <input
                type="file"
                id="file-upload"
                accept=".xlsx"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer bg-[#5D5FEF] border border-[#2C2C2C] rounded-lg hover:bg-[#4D4FDF] focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:ring-offset-2 inline-block w-full sm:w-auto text-center"
                style={{ 
                  maxWidth: '321px', 
                  minHeight: '52px',
                  padding: '12px 24px'
                }}
              >
                <span 
                  className="text-white"
                  style={{ 
                    fontSize: 'clamp(18px, 3vw, 23px)',
                    fontWeight: '700',
                    lineHeight: '120%',
                    fontFamily: 'Satoshi, system-ui, -apple-system, sans-serif'
                  }}
                >
                  Browse File
                </span>
              </label>
            </div>

            {/* File Requirements */}
            <div className="text-center text-[#757575] px-4" style={{ fontSize: 'clamp(12px, 1.8vw, 14px)' }}>
              <p>• Support .xlsx format only. Max file size 5MB</p>
              <p>• Upload a spreadsheet to add multiple employees at once</p>
            </div>

            {file && (
              <div className="mt-2 text-sm text-gray-700 px-4 text-center">
                Selected file: <span className="font-medium break-all">{file.name}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
