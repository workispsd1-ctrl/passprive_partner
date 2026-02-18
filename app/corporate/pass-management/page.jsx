"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

export default function PassManagementPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [passType, setPassType] = useState("deluxe"); // Default to Deluxe
  const [passTypeDropdownOpen, setPassTypeDropdownOpen] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [expiryDate, setExpiryDate] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [corporateId, setCorporateId] = useState("8a6d0136-6566-4703-ac69-c59217302c56");
  
  // Excel upload states
  const [uploadMode, setUploadMode] = useState("manual"); // manual or excel
  const [excelFile, setExcelFile] = useState(null);
  const [excelData, setExcelData] = useState([]);
  const [processingUpload, setProcessingUpload] = useState(false);
  const fileInputRef = useRef(null);
  const passTypeDropdownRef = useRef(null);
  
  // Country code for mobile numbers
  const [countryCode, setCountryCode] = useState("+1");

  const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

  // State for passes
  const [passes, setPasses] = useState([]);
  const [fetchingPasses, setFetchingPasses] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [filter, setFilter] = useState("all"); // all, active, expired

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (passTypeDropdownRef.current && !passTypeDropdownRef.current.contains(event.target)) {
        setPassTypeDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Predefined pass types
  const PASS_TYPES = [
    { 
      id: "classic", 
      name: "Classic", 
      description: "Low value pass", 
      color: "bg-green-100 text-green-800",
      iconColor: "text-green-600",
      iconBg: "bg-green-50",
      textIcon: "🎫",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
      )
    },
    { 
      id: "deluxe", 
      name: "Deluxe", 
      description: "Medium valued pass", 
      color: "bg-blue-100 text-blue-800",
      iconColor: "text-blue-600",
      iconBg: "bg-blue-50",
      textIcon: "⭐",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      )
    },
    { 
      id: "super-deluxe", 
      name: "Super Deluxe", 
      description: "High valued pass", 
      color: "bg-purple-100 text-purple-800",
      iconColor: "text-purple-600",
      iconBg: "bg-purple-50",
      textIcon: "👑",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      )
    }
  ];

  // Country codes for mobile numbers
  const COUNTRY_CODES = [
    { code: "+1", country: "US/Canada" },
    { code: "+44", country: "UK" },
    { code: "+91", country: "India" },
    { code: "+971", country: "UAE" },
    { code: "+966", country: "Saudi Arabia" },
    { code: "+61", country: "Australia" },
    { code: "+33", country: "France" },
    { code: "+49", country: "Germany" },
    { code: "+86", country: "China" },
    { code: "+81", country: "Japan" },
  ];

  // Generate a unique pass code
  const generatePassCode = () => {
    const randomString = Math.random().toString(36).substring(2, 10).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();
    return `PASS${randomString.slice(0, 4)}${timestamp.slice(-4)}`;
  };

  // Fetch passes from backend
  const fetchPasses = async () => {
    setFetchingPasses(true);
    setFetchError("");
    
    try {
      const url = `${API_BASE}/api/corporates/${corporateId}/passes`;
      console.log("Fetching passes from:", url);
      
      let response;
      try {
        response = await fetch(url);
      } catch (networkError) {
        // Handle network errors (no backend server running)
        console.log("Backend not available, using mock data:", networkError.message);
        setPasses(getMockPasses());
        setFetchingPasses(false);
        return;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend response error:", response.status, errorText);
        
        // If endpoint doesn't exist yet, use mock data
        if (response.status === 404) {
          console.log("Using mock data - backend endpoint not implemented yet");
          setPasses(getMockPasses());
          setFetchingPasses(false);
          return;
        }
        
        // For other errors, still use mock data but log the issue
        console.log("Backend error, falling back to mock data:", response.status, errorText);
        setPasses(getMockPasses());
        setFetchingPasses(false);
        return;
      }
      
      const data = await response.json();
      console.log("Received pass data:", data);
      
      // Transform the data to match our UI format
      const transformedPasses = (data.passes || []).map((pass, index) => ({
        id: pass.id || index + 1,
        code: pass.code,
        passType: pass.passType || pass.pass_type,
        passName: pass.passName || pass.pass_name,
        status: pass.status || "active",
        createdDate: pass.created_at ? new Date(pass.created_at).toISOString().split('T')[0] : "N/A",
        expiryDate: pass.expiry_date || "N/A",
        description: pass.description || "",
      }));
      
      setPasses(transformedPasses);
    } catch (err) {
      console.error("Error fetching passes:", err);
      setFetchError(err.message || "Failed to load passes");
      // Use mock data as fallback
      setPasses(getMockPasses());
    } finally {
      setFetchingPasses(false);
    }
  };

  // Mock data for demonstration - showing pass inventory
  const getMockPasses = () => [
    {
      id: 1,
      code: "PASSDELUXE1",
      passType: "deluxe",
      passName: "Deluxe",
      status: "active",
      createdDate: "2026-02-01",
      expiryDate: "2026-12-31",
      description: "Employee Deluxe Pass",
      email: "john.doe@company.com",
    },
    {
      id: 2,
      code: "PASSCLASSIC2",
      passType: "classic",
      passName: "Classic",
      status: "active",
      createdDate: "2026-01-15",
      expiryDate: "2026-12-31",
      description: "Employee Classic Pass",
      email: "jane.smith@company.com",
    },
    {
      id: 3,
      code: "PASSSUPERDELUXE3",
      passType: "super-deluxe",
      passName: "Super Deluxe",
      status: "active",
      createdDate: "2026-02-05",
      expiryDate: "2026-06-30",
      description: "Employee Super Deluxe Pass",
      email: null,
    },
    {
      id: 4,
      code: "PASSDELUXE4",
      passType: "deluxe",
      passName: "Deluxe",
      status: "expired",
      createdDate: "2025-12-01",
      expiryDate: "2026-01-31",
      description: "Employee Deluxe Pass",
      email: "bob.jones@company.com",
    },
    {
      id: 5,
      code: "PASSCLASSIC5",
      passType: "classic",
      passName: "Classic",
      status: "active",
      createdDate: "2026-02-08",
      expiryDate: "2026-12-31",
      description: "Employee Classic Pass",
      email: "alice.williams@company.com",
    },
  ];

  // Fetch passes on component mount
  useEffect(() => {
    if (corporateId) {
      fetchPasses();
    }
  }, [corporateId]);

  const handleCreatePasses = async () => {
    // Reset messages
    setError("");
    setSuccess("");

    // Validation
    if (!passType || !PASS_TYPES.find(pt => pt.id === passType)) {
      setError("Please select a valid pass type");
      return;
    }

    if (!quantity || parseInt(quantity) <= 0 || parseInt(quantity) > 100000) {
      setError("Please enter quantity between 1 and 100,000");
      return;
    }

    if (!expiryDate) {
      setError("Please select an expiry date");
      return;
    }

    if (!corporateId) {
      setError("Corporate ID not found. Please try refreshing the page.");
      return;
    }

    setLoading(true);

    try {
      const qty = parseInt(quantity);
      const newPasses = [];
      const passTypeInfo = PASS_TYPES.find(pt => pt.id === passType);

      // Generate multiple passes
      for (let i = 0; i < qty; i++) {
        const code = generatePassCode();
        newPasses.push({
          code: code,
          passType: passType,
          passName: passTypeInfo.name,
          status: "active",
          expiry_date: expiryDate,
          description: description.trim() || `${passTypeInfo.name} Pass`,
          created_at: new Date().toISOString(),
        });
      }

      // Send to backend
      const response = await fetch(`${API_BASE}/api/corporates/${corporateId}/passes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ passes: newPasses }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || errorData?.message || "Failed to create passes");
      }

      const result = await response.json();
      console.log("Passes created:", result);

      // Reset form
      setQuantity("1");
      setExpiryDate("");
      setDescription("");
      
      // Add new passes to the local state for immediate display
      const displayPasses = newPasses.map((pass, index) => ({
        id: passes.length + index + 1,
        code: pass.code,
        passType: pass.passType,
        passName: pass.passName,
        status: "active",
        createdDate: new Date().toISOString().split('T')[0],
        expiryDate: pass.expiry_date || "N/A",
        description: pass.description || "",
      }));
      
      setPasses([...displayPasses, ...passes]);
      
      setSuccess(`Successfully created ${qty} pass${qty > 1 ? 'es' : ''}!`);
      
      // Refresh passes list from backend
      setTimeout(async () => {
        await fetchPasses();
        setShowCreateForm(false);
        setSuccess("");
      }, 2000);
    } catch (err) {
      console.error("Error creating passes:", err);
      setError(err.message || "Failed to create passes. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Excel file upload
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setExcelFile(file);
    setProcessingUpload(true);
    setError("");

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target.result, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        // Validate Excel data
        const requiredColumns = ["Employee Name", "Employee Email", "Pass Type", "Mobile Number"];
        if (data.length === 0) {
          setError("Excel file is empty");
          setProcessingUpload(false);
          return;
        }

        const firstRow = data[0];
        const missingColumns = requiredColumns.filter(col => !(col in firstRow));
        
        if (missingColumns.length > 0) {
          setError(`Missing required columns: ${missingColumns.join(", ")}`);
          setProcessingUpload(false);
          return;
        }

        setExcelData(data);
        setProcessingUpload(false);
        setSuccess(`Successfully loaded ${data.length} employee records from Excel`);
      } catch (err) {
        console.error("Error parsing Excel:", err);
        setError("Failed to parse Excel file. Please check the format.");
        setProcessingUpload(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  // Download sample Excel template
  const downloadSampleTemplate = () => {
    const sampleData = [
      {
        "Employee Name": "John Doe",
        "Employee Email": "john.doe@company.com",
        "Pass Type": "Deluxe",
        "Mobile Number": "+1234567890"
      },
      {
        "Employee Name": "Jane Smith",
        "Employee Email": "jane.smith@company.com",
        "Pass Type": "Classic",
        "Mobile Number": "+1234567891"
      },
      {
        "Employee Name": "Bob Johnson",
        "Employee Email": "bob.johnson@company.com",
        "Pass Type": "Super Deluxe",
        "Mobile Number": "+1234567892"
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    
    // Auto-size columns
    const colWidths = [
      { wch: 20 }, // Employee Name
      { wch: 30 }, // Employee Email
      { wch: 15 }, // Pass Type
      { wch: 18 }, // Mobile Number
    ];
    ws['!cols'] = colWidths;
    
    XLSX.writeFile(wb, "employee_pass_template.xlsx");
  };

  // Handle bulk pass generation from Excel
  const handleBulkPassGeneration = async () => {
    if (excelData.length === 0) {
      setError("Please upload an Excel file first");
      return;
    }

    if (!expiryDate) {
      setError("Please select an expiry date");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const newPasses = [];
      const emailNotifications = [];

      // Generate passes for each employee
      for (const employee of excelData) {
        const code = generatePassCode();
        const mobileNumber = employee["Mobile Number"] || "";

        // Validate pass type
        const passTypeInfo = PASS_TYPES.find(pt => 
          pt.name.toLowerCase() === employee["Pass Type"]?.toLowerCase()
        );

        if (!passTypeInfo) {
          throw new Error(`Invalid pass type "${employee["Pass Type"]}" for ${employee["Employee Name"]}. Valid types: Classic, Deluxe, Super Deluxe`);
        }

        newPasses.push({
          code: code,
          passType: passTypeInfo.id,
          passName: passTypeInfo.name,
          status: "active",
          expiry_date: expiryDate,
          description: `${passTypeInfo.name} Pass for ${employee["Employee Name"]}`,
          created_at: new Date().toISOString(),
        });

        emailNotifications.push({
          employeeName: employee["Employee Name"],
          employeeEmail: employee["Employee Email"],
          mobileNumber: mobileNumber,
          passCode: code,
          passType: passTypeInfo.name,
          expiryDate: expiryDate
        });
      }

      // Send to backend
      const response = await fetch(`${API_BASE}/api/corporates/${corporateId}/passes/bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          passes: newPasses,
          emailNotifications: emailNotifications 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || errorData?.message || "Failed to create passes");
      }

      const result = await response.json();
      console.log("Bulk passes created:", result);

      // Add new passes to local state
      const displayPasses = newPasses.map((pass, index) => ({
        id: passes.length + index + 1,
        code: pass.code,
        passType: pass.passType,
        passName: pass.passName,
        status: "active",
        createdDate: new Date().toISOString().split('T')[0],
        expiryDate: pass.expiry_date || "N/A",
        description: pass.description || "",
      }));
      
      setPasses([...displayPasses, ...passes]);
      
      setSuccess(`Successfully generated ${newPasses.length} passes and sent email notifications to employees!`);
      
      // Reset form
      setExcelFile(null);
      setExcelData([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      
      // Refresh and close modal
      setTimeout(async () => {
        await fetchPasses();
        setShowCreateForm(false);
        setSuccess("");
      }, 3000);
    } catch (err) {
      console.error("Error creating bulk passes:", err);
      setError(err.message || "Failed to generate passes. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Disable/Deactivate a pass
  const handleDisablePass = async (passId, passCode) => {
    if (!confirm(`Are you sure you want to disable pass ${passCode}? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/corporates/${corporateId}/passes/${passId}/disable`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to disable pass");
      }

      // Update local state
      setPasses(passes.map(pass => 
        pass.id === passId 
          ? { ...pass, status: "disabled" }
          : pass
      ));

      setSuccess(`Pass ${passCode} has been disabled successfully`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error disabling pass:", err);
      setError("Failed to disable pass. Please try again.");
      setTimeout(() => setError(""), 3000);
    }
  };

  // Filter passes based on status
  const filteredPasses = passes.filter(pass => {
    if (filter === "all") return true;
    return pass.status === filter;
  });

  // Statistics
  const totalPasses = passes.length;
  const activePasses = passes.filter(p => p.status === "active").length;
  const expiredPasses = passes.filter(p => p.status === "expired").length;

  // Pass type breakdown with inventory tracking
  const passClassicTotal = passes.filter(p => p.passType === "classic" || p.passName === "Classic").length;
  const passClassicActive = passes.filter(p => (p.passType === "classic" || p.passName === "Classic") && p.status === "active").length;
  const passClassicExpired = passes.filter(p => (p.passType === "classic" || p.passName === "Classic") && p.status === "expired").length;
  
  const passDeluxeTotal = passes.filter(p => p.passType === "deluxe" || p.passName === "Deluxe").length;
  const passDeluxeActive = passes.filter(p => (p.passType === "deluxe" || p.passName === "Deluxe") && p.status === "active").length;
  const passDeluxeExpired = passes.filter(p => (p.passType === "deluxe" || p.passName === "Deluxe") && p.status === "expired").length;
  
  const passSuperDeluxeTotal = passes.filter(p => p.passType === "super-deluxe" || p.passName === "Super Deluxe").length;
  const passSuperDeluxeActive = passes.filter(p => (p.passType === "super-deluxe" || p.passName === "Super Deluxe") && p.status === "active").length;
  const passSuperDeluxeExpired = passes.filter(p => (p.passType === "super-deluxe" || p.passName === "Super Deluxe") && p.status === "expired").length;

  // Download passes as Excel
  const handleDownloadExcel = () => {
    const data = filteredPasses.map(pass => ({
      'Pass Code': pass.code,
      'Email': pass.email || '-',
      'Pass Type': pass.passName || 'N/A',
      'Status': pass.status.toUpperCase(),
      'Created Date': pass.createdDate,
      'Expiry Date': pass.expiryDate,
      'Description': pass.description || 'N/A',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employee Passes");
    
    // Auto-size columns
    const colWidths = [
      { wch: 20 }, // Code
      { wch: 30 }, // Email
      { wch: 15 }, // Pass Type
      { wch: 10 }, // Status
      { wch: 12 }, // Created Date
      { wch: 12 }, // Expiry Date
      { wch: 25 }, // Description
    ];
    ws['!cols'] = colWidths;
    
    XLSX.writeFile(wb, `employee_passes_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Copy code to clipboard
  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    setSuccess(`Code ${code} copied to clipboard!`);
    setTimeout(() => setSuccess(""), 2000);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6 lg:mb-8">
        <h1 
          className="text-2xl lg:text-[32px] font-bold text-[#151D48] mb-2"
          style={{ 
            lineHeight: "140%",
            fontFamily: "Satoshi, sans-serif"
          }}
        >
          Pass Management
        </h1>
        <p 
          className="text-sm lg:text-base text-[#737791]"
          style={{ 
            lineHeight: "140%",
            fontFamily: "Satoshi, sans-serif"
          }}
        >
          Generate and manage employee passes with customizable values - Classic, Deluxe, and Super Deluxe tiers
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
        <div className="bg-white rounded-xl p-5 lg:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Total Passes</h3>
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-[#151D48]">{totalPasses}</div>
          <div className="mt-2 text-xs text-[#737791]">All passes</div>
        </div>

        <div className="bg-white rounded-xl p-5 lg:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Active Passes</h3>
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-[#151D48]">{activePasses}</div>
          <div className="mt-2 text-xs text-[#737791]">Ready to use</div>
        </div>

        <div className="bg-white rounded-xl p-5 lg:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Expired</h3>
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-[#151D48]">{expiredPasses}</div>
          <div className="mt-2 text-xs text-[#737791]">Past validity</div>
        </div>

        <div className="bg-white rounded-xl p-5 lg:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Pass Types</h3>
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-[#151D48]">3</div>
          <div className="mt-2 text-xs text-[#737791]">
            <span className="text-green-700">{passClassicActive} Classic</span> • 
            <span className="text-blue-700"> {passDeluxeActive} Deluxe</span> • 
            <span className="text-purple-700"> {passSuperDeluxeActive} Super</span>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === "all"
                  ? "bg-[#5D5FEF] text-white"
                  : "bg-gray-100 text-[#737791] hover:bg-gray-200"
              }`}
            >
              All ({totalPasses})
            </button>
            <button
              onClick={() => setFilter("active")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === "active"
                  ? "bg-[#5D5FEF] text-white"
                  : "bg-gray-100 text-[#737791] hover:bg-gray-200"
              }`}
            >
              Active ({activePasses})
            </button>
            <button
              onClick={() => setFilter("expired")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === "expired"
                  ? "bg-[#5D5FEF] text-white"
                  : "bg-gray-100 text-[#737791] hover:bg-gray-200"
              }`}
            >
              Expired ({expiredPasses})
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleDownloadExcel}
              disabled={filteredPasses.length === 0}
              className="flex items-center gap-2 px-4 py-2 border border-[#5D5FEF] text-[#5D5FEF] rounded-lg text-sm font-medium hover:bg-[#5D5FEF] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-2 px-4 py-2 bg-[#5D5FEF] text-white rounded-lg text-sm font-medium hover:bg-[#4D4FDF] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Generate Passes
            </button>
          </div>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && !showCreateForm && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {success}
        </div>
      )}
      {error && !showCreateForm && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Generate Passes Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={() => setShowCreateForm(false)}>
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-[#151D48]">Generate Employee Passes</h2>
                <p className="text-sm text-[#737791] mt-1">Create passes manually or bulk upload via Excel</p>
              </div>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setPassType("deluxe");
                  setQuantity("1");
                  setExpiryDate("");
                  setDescription("");
                  setError("");
                  setSuccess("");
                  setUploadMode("manual");
                  setExcelFile(null);
                  setExcelData([]);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-6">
              {/* Mode Selection */}
              <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => {
                    setUploadMode("manual");
                    setError("");
                    setSuccess("");
                  }}
                  className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                    uploadMode === "manual"
                      ? "bg-white text-[#5D5FEF] shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Manual Entry
                  </div>
                </button>
                <button
                  onClick={() => {
                    setUploadMode("excel");
                    setError("");
                    setSuccess("");
                  }}
                  className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                    uploadMode === "excel"
                      ? "bg-white text-[#5D5FEF] shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Excel Upload
                  </div>
                </button>
              </div>

              {/* Success/Error in Modal */}
              {success && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  {success}
                </div>
              )}
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}

              {/* Manual Entry Form */}
              {uploadMode === "manual" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="relative" ref={passTypeDropdownRef}>
                      <label className="block text-sm font-medium text-[#151D48] mb-2">
                        Pass Type <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setPassTypeDropdownOpen(!passTypeDropdownOpen)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent bg-white text-left flex items-center justify-between"
                        >
                          {(() => {
                            const selected = PASS_TYPES.find(pt => pt.id === passType);
                            return (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${selected?.color || "bg-gray-100 text-gray-800"}`}>
                                <span className={selected?.iconColor || 'text-gray-600'}>
                                  {selected?.icon}
                                </span>
                                <span>{selected?.name}</span>
                              </span>
                            );
                          })()}
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {passTypeDropdownOpen && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                            {PASS_TYPES.map((pt) => (
                              <button
                                key={pt.id}
                                type="button"
                                onClick={() => {
                                  setPassType(pt.id);
                                  setPassTypeDropdownOpen(false);
                                }}
                                className="w-full px-4 py-2.5 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none transition-colors"
                              >
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${pt.color}`}>
                                  <span className={pt.iconColor}>
                                    {pt.icon}
                                  </span>
                                  <span>{pt.name}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[#737791]">
                        Selected: {PASS_TYPES.find(pt => pt.id === passType)?.name}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#151D48] mb-2">
                        Quantity <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        placeholder="1-100000"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent"
                        min="1"
                        max="100000"
                      />
                      <p className="mt-1 text-xs text-[#737791]">
                        Number of passes to generate (up to 100,000)
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#151D48] mb-2">
                        Expiry Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent"
                        min={new Date().toISOString().split('T')[0]}
                        required
                      />
                      <p className="mt-1 text-xs text-[#737791]">Unique codes will be automatically generated</p>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-[#151D48] mb-2">
                        Description (Optional)
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={`${PASS_TYPES.find(pt => pt.id === passType)?.name} Pass`}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent resize-none"
                        rows="2"
                        maxLength="200"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Excel Upload Form */}
              {uploadMode === "excel" && (
                <div className="space-y-4">
                  {/* Download Template */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-900 mb-2">Excel Format Required:</p>
                        <ul className="text-xs text-blue-800 space-y-1 mb-3">
                          <li>• <strong>Employee Name</strong>: Full name of employee</li>
                          <li>• <strong>Employee Email</strong>: Valid email address</li>
                          <li>• <strong>Pass Type</strong>: Classic, Deluxe, or Super Deluxe</li>
                          <li>• <strong>Mobile Number</strong>: With country code (e.g., +1234567890)</li>
                        </ul>
                        <button
                          onClick={downloadSampleTemplate}
                          className="text-sm font-medium text-blue-600 hover:text-blue-700 underline"
                        >
                          Download Sample Template
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* File Upload */}
                  <div>
                    <label className="block text-sm font-medium text-[#151D48] mb-2">
                      Upload Excel File <span className="text-red-500">*</span>
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#5D5FEF] transition-colors">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleExcelUpload}
                        className="hidden"
                        id="excel-upload"
                      />
                      <label htmlFor="excel-upload" className="cursor-pointer">
                        <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          {excelFile ? excelFile.name : "Click to upload or drag and drop"}
                        </p>
                        <p className="text-xs text-gray-500">Excel files only (.xlsx, .xls)</p>
                      </label>
                    </div>
                    {excelData.length > 0 && (
                      <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm font-medium text-green-900">
                          ✓ {excelData.length} employee{excelData.length > 1 ? 's' : ''} loaded successfully
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Expiry Date for Bulk */}
                  <div>
                    <label className="block text-sm font-medium text-[#151D48] mb-2">
                      Expiry Date (for all passes) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent"
                      min={new Date().toISOString().split('T')[0]}
                      required
                    />
                    <p className="mt-1 text-xs text-[#737791]">This expiry date will apply to all passes in the upload</p>
                  </div>

                  {/* Preview Data */}
                  {excelData.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-[#151D48] mb-2">
                        Preview (first 3 records)
                      </label>
                      <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Email</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Pass Type</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Mobile</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {excelData.slice(0, 3).map((row, idx) => (
                              <tr key={idx}>
                                <td className="px-3 py-2 text-gray-900">{row["Employee Name"]}</td>
                                <td className="px-3 py-2 text-gray-600 text-xs">{row["Employee Email"]}</td>
                                <td className="px-3 py-2">
                                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                    {row["Pass Type"]}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-gray-600 text-xs">{row["Mobile Number"]}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Email notification info */}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-purple-900 mb-1">Email Notification</p>
                        <p className="text-xs text-purple-700">Passes will be automatically emailed to each employee with their unique pass code and redemption instructions.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 rounded-b-2xl border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setPassType("deluxe");
                  setQuantity("1");
                  setExpiryDate("");
                  setDescription("");
                  setError("");
                  setSuccess("");
                  setUploadMode("manual");
                  setExcelFile(null);
                  setExcelData([]);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                className="px-6 py-2.5 border border-gray-300 text-[#151D48] rounded-lg text-sm font-medium hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={uploadMode === "manual" ? handleCreatePasses : handleBulkPassGeneration}
                disabled={loading || processingUpload || (uploadMode === "excel" && excelData.length === 0)}
                className="px-6 py-2.5 bg-[#5D5FEF] text-white rounded-lg text-sm font-medium hover:bg-[#4D4FDF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating...
                  </>
                ) : uploadMode === "manual" ? (
                  `Generate ${quantity || 1} Pass${parseInt(quantity) > 1 ? 'es' : ''}`
                ) : (
                  `Generate ${excelData.length} Passes & Send Emails`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Passes List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          {fetchingPasses ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5D5FEF]"></div>
            </div>
          ) : fetchError && passes.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="text-red-600 mb-2">⚠️ Error loading passes</div>
              <p className="text-sm text-[#737791]">{fetchError}</p>
            </div>
          ) : filteredPasses.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="text-4xl mb-4">🎫</div>
              <h3 className="text-lg font-semibold text-[#151D48] mb-2">No Passes Found</h3>
              <p className="text-sm text-[#737791] mb-4">
                {filter === "all" 
                  ? "Start by purchasing your first employee passes!"
                  : `No ${filter} passes at the moment.`
                }
              </p>
              {filter === "all" && (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-6 py-2.5 bg-[#5D5FEF] text-white rounded-lg text-sm font-medium hover:bg-[#4D4FDF] transition-colors"
                >
                  Generate First Passes
                </button>
              )}
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-[#737791] uppercase tracking-wider">
                    Pass Code
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-[#737791] uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-[#737791] uppercase tracking-wider">
                    Pass Type
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-[#737791] uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-[#737791] uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-[#737791] uppercase tracking-wider">
                    Expiry
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-[#737791] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPasses.map((pass) => {
                  const passTypeInfo = PASS_TYPES.find(pt => pt.id === pass.passType || pt.name === pass.passName);
                  return (
                    <tr key={pass.id} className="hover:bg-gray-50">
                      <td className="px-4 lg:px-6 py-4">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono font-semibold text-[#5D5FEF] bg-indigo-50 px-2 py-1 rounded">
                            {pass.code}
                          </code>
                        </div>
                        {pass.description && (
                          <div className="text-xs text-[#737791] mt-1">{pass.description}</div>
                        )}
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-[#151D48]">
                          {pass.email || "-"}
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            passTypeInfo?.color || "bg-gray-100 text-gray-800"
                          }`}
                        >
                          <span className={passTypeInfo?.iconColor || 'text-gray-600'}>
                            {passTypeInfo?.icon || (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                              </svg>
                            )}
                          </span>
                          <span>{pass.passName || passTypeInfo?.name || 'N/A'}</span>
                        </span>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                            pass.status === "active"
                              ? "bg-green-100 text-green-800"
                              : pass.status === "disabled"
                              ? "bg-gray-100 text-gray-800"
                              : pass.status === "redeemed"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {pass.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-[#737791]">
                        {pass.createdDate}
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-[#737791]">
                        {pass.expiryDate}
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2"  >
                          <button
                            onClick={() => handleCopyCode(pass.code)}
                            className="text-[#5D5FEF] hover:text-[#4D4FDF] font-medium flex items-center gap-1"
                            title="Copy code"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy
                          </button>
                          {pass.status === "active" && (
                            <button
                              onClick={() => handleDisablePass(pass.id, pass.code)}
                              className="text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                              title="Disable pass"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                              Disable
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">How Employee Passes Work:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Generate passes in three types: Classic, Deluxe, or Super Deluxe</li>
              <li>Each pass comes with a unique code for employees to use</li>
              <li>Share pass codes with employees via email or internal communication</li>
              <li>Track pass inventory and expiry dates from this dashboard</li>
              <li>Use for employee benefits, meal vouchers, or reward programs</li>
              <li>Monitor active vs expired passes to manage your inventory</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}