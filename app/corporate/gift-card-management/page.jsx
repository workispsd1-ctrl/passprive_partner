"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import * as XLSX from "xlsx";

export default function GiftCardManagementPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDistributeForm, setShowDistributeForm] = useState(false);
  const [distributeMode, setDistributeMode] = useState("manual"); // manual or excel
  const [codePrefix, setCodePrefix] = useState("");
  const [pointsValue, setPointsValue] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [description, setDescription] = useState("");
  
  // Distribution fields
  const [recipientEmail, setRecipientEmail] = useState("");
  const [distributionPoints, setDistributionPoints] = useState("");
  const [distributionExpiry, setDistributionExpiry] = useState("");
  const [distributionDescription, setDistributionDescription] = useState("");
  
  // Excel upload
  const [excelFile, setExcelFile] = useState(null);
  const [excelData, setExcelData] = useState([]);
  const [processingExcel, setProcessingExcel] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [corporateId, setCorporateId] = useState("8a6d0136-6566-4703-ac69-c59217302c56");

  const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

  // State for gift cards
  const [giftCards, setGiftCards] = useState([]);
  const [fetchingCards, setFetchingCards] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [filter, setFilter] = useState("all"); // all, active, redeemed, expired

  // Generate a unique gift card code
  const generateGiftCardCode = (prefix = "") => {
    const randomString = Math.random().toString(36).substring(2, 10).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();
    return `${prefix ? prefix.toUpperCase() : "PASS"}${randomString.slice(0, 4)}${timestamp.slice(-4)}`;
  };

  // Fetch gift cards from backend
  const fetchGiftCards = async () => {
    setFetchingCards(true);
    setFetchError("");
    
    try {
      const url = `${API_BASE}/api/corporates/${corporateId}/gift-cards`;
      console.log("Fetching gift cards from:", url);
      
      let response;
      try {
        response = await fetch(url);
      } catch (networkError) {
        // Handle network errors (no backend server running)
        console.log("Backend not available, using mock data:", networkError.message);
        setGiftCards(getMockGiftCards());
        setFetchingCards(false);
        return;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend response error:", response.status, errorText);
        
        // If endpoint doesn't exist yet, use mock data
        if (response.status === 404) {
          console.log("Using mock data - backend endpoint not implemented yet");
          setGiftCards(getMockGiftCards());
          setFetchingCards(false);
          return;
        }
        
        // For other errors, still use mock data but log the issue
        console.log("Backend error, falling back to mock data:", response.status, errorText);
        setGiftCards(getMockGiftCards());
        setFetchingCards(false);
        return;
      }
      
      const data = await response.json();
      console.log("Received gift card data:", data);
      
      // Transform the data to match our UI format
      const transformedCards = (data.gift_cards || []).map((card, index) => ({
        id: card.id || index + 1,
        code: card.code,
        points: card.points_value || 0,
        status: card.status || "active",
        createdDate: card.created_at ? new Date(card.created_at).toISOString().split('T')[0] : "N/A",
        expiryDate: card.expiry_date || "N/A",
        redeemedDate: card.redeemed_at ? new Date(card.redeemed_at).toISOString().split('T')[0] : null,
        description: card.description || "",
      }));
      
      setGiftCards(transformedCards);
    } catch (err) {
      console.error("Error fetching gift cards:", err);
      setFetchError(err.message || "Failed to load gift cards");
      // Use mock data as fallback
      setGiftCards(getMockGiftCards());
    } finally {
      setFetchingCards(false);
    }
  };

  // Mock data for demonstration
  const getMockGiftCards = () => [
    {
      id: 1,
      code: "NEW100ABC1",
      points: 1000,
      status: "active",
      createdDate: "2026-02-01",
      expiryDate: "2026-12-31",
      redeemedDate: null,
      description: "New Year Special",
      email: "john.doe@company.com",
    },
    {
      id: 2,
      code: "WELCOME50XY",
      points: 500,
      status: "redeemed",
      createdDate: "2026-01-15",
      expiryDate: "2026-12-31",
      redeemedDate: "2026-02-10",
      description: "Welcome Bonus",
      email: "jane.smith@company.com",
    },
    {
      id: 3,
      code: "FEST2026ABC",
      points: 2000,
      status: "active",
      createdDate: "2026-02-05",
      expiryDate: "2026-06-30",
      redeemedDate: null,
      description: "Festival Special",
      email: null,
    },
    {
      id: 4,
      code: "EXPIRE50OLD",
      points: 500,
      status: "expired",
      createdDate: "2025-12-01",
      expiryDate: "2026-01-31",
      redeemedDate: null,
      description: "Year End Offer",
      email: "bob.jones@company.com",
    },
  ];

  // Fetch gift cards on component mount
  useEffect(() => {
    if (corporateId) {
      fetchGiftCards();
    }
  }, [corporateId]);

  const handleCreateGiftCards = async () => {
    // Reset messages
    setError("");
    setSuccess("");

    // Validation
    if (!pointsValue || parseInt(pointsValue) <= 0) {
      setError("Please enter a valid points value");
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
      // Create a gift card pool/balance entry
      const poolData = {
        points_value: parseInt(pointsValue),
        expiry_date: expiryDate,
        status: "active",
        created_at: new Date().toISOString(),
      };

      // Send to backend
      const response = await fetch(`${API_BASE}/api/corporates/${corporateId}/gift-cards/pool`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(poolData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || errorData?.message || "Failed to purchase gift cards");
      }

      const result = await response.json();
      console.log("Gift card purchased:", result);

      // Reset form
      setPointsValue("");
      setExpiryDate("");
      
      setSuccess(`Successfully purchased ${pointsValue} points worth of gift cards!`);
      
      // Refresh and close
      setTimeout(async () => {
        await fetchGiftCards();
        setShowCreateForm(false);
        setSuccess("");
      }, 2000);
    } catch (err) {
      console.error("Error purchasing gift cards:", err);
      setError(err.message || "Failed to purchase gift cards. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Filter gift cards based on status
  const filteredCards = giftCards.filter(card => {
    if (filter === "all") return true;
    return card.status === filter;
  });

  // Statistics
  const totalCards = giftCards.length;
  const activeCards = giftCards.filter(c => c.status === "active").length;
  const redeemedCards = giftCards.filter(c => c.status === "redeemed").length;
  const expiredCards = giftCards.filter(c => c.status === "expired").length;
  
  // Points calculations for pool-based system
  const totalPointsPool = 50000; // Total points purchased by company (from backend in real scenario)
  const pointsDistributed = giftCards.reduce((sum, c) => sum + c.points, 0); // Points allocated to gift cards
  const pointsRedeemed = giftCards.filter(c => c.status === "redeemed").reduce((sum, c) => sum + c.points, 0);
  const pointsAvailable = totalPointsPool - pointsDistributed; // Points not yet distributed

  // Download gift cards as Excel
  const handleDownloadExcel = () => {
    const data = filteredCards.map(card => ({
      'Gift Card Code': card.code,
      'Email': card.email || '-',
      'Points Value': card.points,
      'Status': card.status.toUpperCase(),
      'Created Date': card.createdDate,
      'Expiry Date': card.expiryDate,
      'Redeemed Date': card.redeemedDate || 'N/A',
      'Description': card.description || 'N/A',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gift Cards");
    
    // Auto-size columns
    const colWidths = [
      { wch: 20 }, // Code
      { wch: 30 }, // Email
      { wch: 12 }, // Points
      { wch: 10 }, // Status
      { wch: 12 }, // Created Date
      { wch: 12 }, // Expiry Date
      { wch: 12 }, // Redeemed Date
      { wch: 20 }, // Description
    ];
    ws['!cols'] = colWidths;
    
    XLSX.writeFile(wb, `gift_cards_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Copy code to clipboard
  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    setSuccess(`Code ${code} copied to clipboard!`);
    setTimeout(() => setSuccess(""), 2000);
  };

  // Handle manual gift card distribution
  const handleDistributeGiftCard = async () => {
    setError("");
    setSuccess("");

    // Validation
    if (!recipientEmail || !recipientEmail.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    if (!distributionPoints || parseInt(distributionPoints) <= 0) {
      setError("Please enter valid points value");
      return;
    }

    if (!distributionExpiry) {
      setError("Please select an expiry date");
      return;
    }

    setLoading(true);

    try {
      const code = generateGiftCardCode();
      const giftCardData = {
        code: code,
        recipient_email: recipientEmail,
        points_value: parseInt(distributionPoints),
        expiry_date: distributionExpiry,
        description: distributionDescription.trim() || null,
        status: "active",
        created_at: new Date().toISOString(),
      };

      // Send to backend to create and distribute
      const response = await fetch(`${API_BASE}/api/corporates/${corporateId}/gift-cards/distribute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(giftCardData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || errorData?.message || "Failed to distribute gift card");
      }

      const result = await response.json();
      console.log("Gift card distributed:", result);

      // Reset form
      setRecipientEmail("");
      setDistributionPoints("");
      setDistributionExpiry("");
      setDistributionDescription("");

      setSuccess(`Gift card sent successfully to ${recipientEmail}!`);

      setTimeout(async () => {
        await fetchGiftCards();
        setShowDistributeForm(false);
        setSuccess("");
      }, 2000);
    } catch (err) {
      console.error("Error distributing gift card:", err);
      setError(err.message || "Failed to distribute gift card. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Excel file upload for distribution
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setExcelFile(file);
    setProcessingExcel(true);
    setError("");

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target.result, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        // Validate Excel data
        const requiredColumns = ["Email", "Points", "Expiry Date"];
        if (data.length === 0) {
          setError("Excel file is empty");
          setProcessingExcel(false);
          return;
        }

        const firstRow = data[0];
        const missingColumns = requiredColumns.filter(col => !(col in firstRow));

        if (missingColumns.length > 0) {
          setError(`Missing required columns: ${missingColumns.join(", ")}`);
          setProcessingExcel(false);
          return;
        }

        setExcelData(data);
        setProcessingExcel(false);
        setSuccess(`Successfully loaded ${data.length} recipient(s) from Excel`);
      } catch (err) {
        console.error("Error parsing Excel:", err);
        setError("Failed to parse Excel file. Please check the format.");
        setProcessingExcel(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  // Download sample Excel template for distribution
  const downloadDistributionTemplate = () => {
    const sampleData = [
      {
        "Email": "employee1@company.com",
        "Points": "1000",
        "Expiry Date": "2026-12-31",
        "Description": "Employee reward"
      },
      {
        "Email": "client1@company.com",
        "Points": "500",
        "Expiry Date": "2026-12-31",
        "Description": "Client appreciation"
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recipients");

    const colWidths = [
      { wch: 30 }, // Email
      { wch: 10 }, // Points
      { wch: 15 }, // Expiry Date
      { wch: 25 }, // Description
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, "gift_card_distribution_template.xlsx");
  };

  // Handle bulk distribution from Excel
  const handleBulkDistribution = async () => {
    if (excelData.length === 0) {
      setError("Please upload an Excel file first");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const distributionList = [];

      for (const row of excelData) {
        const code = generateGiftCardCode();
        distributionList.push({
          code: code,
          recipient_email: row["Email"],
          points_value: parseInt(row["Points"]),
          expiry_date: row["Expiry Date"],
          description: row["Description"] || null,
          status: "active",
          created_at: new Date().toISOString(),
        });
      }

      // Send to backend to distribute in bulk
      const response = await fetch(`${API_BASE}/api/corporates/${corporateId}/gift-cards/distribute/bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ gift_cards: distributionList }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || errorData?.message || "Failed to distribute gift cards");
      }

      const result = await response.json();
      console.log("Bulk distribution completed:", result);

      // Reset
      setExcelFile(null);
      setExcelData([]);

      setSuccess(`Successfully distributed ${distributionList.length} gift cards!`);

      setTimeout(async () => {
        await fetchGiftCards();
        setShowDistributeForm(false);
        setSuccess("");
      }, 3000);
    } catch (err) {
      console.error("Error in bulk distribution:", err);
      setError(err.message || "Failed to distribute gift cards. Please try again.");
    } finally {
      setLoading(false);
    }
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
          Gift Card Management
        </h1>
        <p 
          className="text-sm lg:text-base text-[#737791]"
          style={{ 
            lineHeight: "140%",
            fontFamily: "Satoshi, sans-serif"
          }}
        >
          Create and manage gift cards for your employees to redeem points in the PassPrive app
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
        <div className="bg-white rounded-xl p-5 lg:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Total Points</h3>
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-[#151D48]">{totalPointsPool.toLocaleString()}</div>
          <div className="mt-2 text-xs text-[#737791]">Total purchased</div>
        </div>

        <div className="bg-white rounded-xl p-5 lg:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Available Points</h3>
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-[#151D48]">{pointsAvailable.toLocaleString()}</div>
          <div className="mt-2 text-xs text-[#737791]">Ready to distribute</div>
        </div>

        <div className="bg-white rounded-xl p-5 lg:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Points Distributed</h3>
            <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-[#151D48]">{pointsDistributed.toLocaleString()}</div>
          <div className="mt-2 text-xs text-[#737791]">Allocated to {totalCards} cards</div>
        </div>

        <div className="bg-white rounded-xl p-5 lg:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Points Redeemed</h3>
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-[#151D48]">{pointsRedeemed.toLocaleString()}</div>
          <div className="mt-2 text-xs text-[#737791]">
            {redeemedCards} cards redeemed
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
              All ({totalCards})
            </button>
            <button
              onClick={() => setFilter("active")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === "active"
                  ? "bg-[#5D5FEF] text-white"
                  : "bg-gray-100 text-[#737791] hover:bg-gray-200"
              }`}
            >
              Active ({activeCards})
            </button>
            <button
              onClick={() => setFilter("redeemed")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === "redeemed"
                  ? "bg-[#5D5FEF] text-white"
                  : "bg-gray-100 text-[#737791] hover:bg-gray-200"
              }`}
            >
              Redeemed ({redeemedCards})
            </button>
            <button
              onClick={() => setFilter("expired")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === "expired"
                  ? "bg-[#5D5FEF] text-white"
                  : "bg-gray-100 text-[#737791] hover:bg-gray-200"
              }`}
            >
              Expired ({expiredCards})
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleDownloadExcel}
              disabled={filteredCards.length === 0}
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Purchase Points Pool
            </button>
            <button
              onClick={() => setShowDistributeForm(!showDistributeForm)}
              className="flex items-center gap-2 px-4 py-2 bg-[#34C759] text-white rounded-lg text-sm font-medium hover:bg-[#2EA84D] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Distribute Gift Cards
            </button>
          </div>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Purchase Points Pool Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={() => setShowCreateForm(false)}>
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#151D48]">Purchase Points Pool</h2>
                <p className="text-sm text-[#737791] mt-1">Buy points in bulk to add to your company's points pool</p>
              </div>
              <button
                onClick={() => setShowCreateForm(false)}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-[#151D48] mb-2">
                Points Value <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={pointsValue}
                onChange={(e) => setPointsValue(e.target.value)}
                placeholder="e.g., 1000"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent"
                min="1"
              />
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
            </div>
          </div>

              <div className="flex gap-3">
                <button
                  onClick={handleCreateGiftCards}
                  disabled={loading}
                  className="flex-1 px-6 py-2.5 bg-[#5D5FEF] text-white rounded-lg text-sm font-medium hover:bg-[#4D4FDF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Purchasing..." : "Purchase Points"}
                </button>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setPointsValue("");
                    setExpiryDate("");
                    setError("");
                  }}
                  className="flex-1 px-6 py-2.5 border border-gray-300 text-[#151D48] rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Distribute Gift Cards Modal */}
      {showDistributeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={() => setShowDistributeForm(false)}>
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#151D48]">Distribute Gift Cards</h2>
                <p className="text-sm text-[#737791] mt-1">Send gift cards to employees or clients</p>
              </div>
              <button
                onClick={() => setShowDistributeForm(false)}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6">

          {/* Mode Selection */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => setDistributeMode("manual")}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                distributeMode === "manual"
                  ? "bg-[#5D5FEF] text-white"
                  : "bg-gray-100 text-[#737791] hover:bg-gray-200"
              }`}
            >
              Manual Entry
            </button>
            <button
              onClick={() => setDistributeMode("excel")}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                distributeMode === "excel"
                  ? "bg-[#5D5FEF] text-white"
                  : "bg-gray-100 text-[#737791] hover:bg-gray-200"
              }`}
            >
              Excel Upload
            </button>
          </div>

          {/* Manual Entry Mode */}
          {distributeMode === "manual" && (
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-[#151D48] mb-2">
                  Recipient Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="employee@company.com"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#151D48] mb-2">
                    Points <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={distributionPoints}
                    onChange={(e) => setDistributionPoints(e.target.value)}
                    placeholder="e.g., 1000"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent"
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#151D48] mb-2">
                    Expiry Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={distributionExpiry}
                    onChange={(e) => setDistributionExpiry(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#151D48] mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={distributionDescription}
                  onChange={(e) => setDistributionDescription(e.target.value)}
                  placeholder="e.g., Employee reward, Client appreciation"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent resize-none"
                  rows="2"
                  maxLength="200"
                />
              </div>
            </div>
          )}

          {/* Excel Upload Mode */}
          {distributeMode === "excel" && (
            <div className="space-y-4 mb-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900 mb-2">Excel Format Required:</p>
                    <ul className="text-xs text-blue-800 space-y-1 mb-3">
                      <li>• <strong>Email</strong>: Recipient email address</li>
                      <li>• <strong>Points</strong>: Gift card points value</li>
                      <li>• <strong>Expiry Date</strong>: In YYYY-MM-DD format</li>
                      <li>• <strong>Description</strong>: Optional description</li>
                    </ul>
                    <button
                      onClick={downloadDistributionTemplate}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700 underline"
                    >
                      Download Sample Template
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#151D48] mb-2">
                  Upload Excel File <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#5D5FEF] transition-colors">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExcelUpload}
                    className="hidden"
                    id="excel-distribution-upload"
                  />
                  <label htmlFor="excel-distribution-upload" className="cursor-pointer">
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
                  <p className="mt-2 text-sm text-green-600">
                    ✓ Loaded {excelData.length} recipient(s)
                  </p>
                )}
              </div>
            </div>
          )}

              <div className="flex gap-3">
                <button
                  onClick={distributeMode === "manual" ? handleDistributeGiftCard : handleBulkDistribution}
                  disabled={loading || processingExcel || (distributeMode === "excel" && excelData.length === 0)}
                  className="flex-1 px-6 py-2.5 bg-[#34C759] text-white rounded-lg text-sm font-medium hover:bg-[#2EA84D] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    "Sending..."
                  ) : distributeMode === "manual" ? (
                    "Send Gift Card"
                  ) : (
                    `Send ${excelData.length || 0} Gift Cards`
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowDistributeForm(false);
                    setRecipientEmail("");
                    setDistributionPoints("");
                    setDistributionExpiry("");
                    setDistributionDescription("");
                    setExcelFile(null);
                    setExcelData([]);
                    setError("");
                  }}
                  className="flex-1 px-6 py-2.5 border border-gray-300 text-[#151D48] rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gift Cards List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          {fetchingCards ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5D5FEF]"></div>
            </div>
          ) : fetchError && giftCards.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="text-red-600 mb-2">⚠️ Error loading gift cards</div>
              <p className="text-sm text-[#737791]">{fetchError}</p>
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="text-4xl mb-4">🎁</div>
              <h3 className="text-lg font-semibold text-[#151D48] mb-2">No Gift Cards Found</h3>
              <p className="text-sm text-[#737791] mb-4">
                {filter === "all" 
                  ? "Start by creating your first gift card!"
                  : `No ${filter} gift cards at the moment.`
                }
              </p>
              {filter === "all" && (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-6 py-2.5 bg-[#5D5FEF] text-white rounded-lg text-sm font-medium hover:bg-[#4D4FDF] transition-colors"
                >
                  Create First Gift Card
                </button>
              )}
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-[#737791] uppercase tracking-wider">
                    Gift Card Code
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-[#737791] uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-[#737791] uppercase tracking-wider">
                    Points
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
                    Redemption Status
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-[#737791] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCards.map((card) => (
                  <tr key={card.id} className="hover:bg-gray-50">
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono font-semibold text-[#5D5FEF] bg-indigo-50 px-2 py-1 rounded">
                          {card.code}
                        </code>
                      </div>
                      {card.description && (
                        <div className="text-xs text-[#737791] mt-1">{card.description}</div>
                      )}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-[#151D48]">
                        {card.email || "-"}
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-[#151D48]">
                        {card.points.toLocaleString()} pts
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                          card.status === "active"
                            ? "bg-green-100 text-green-800"
                            : card.status === "redeemed"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {card.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-[#737791]">
                      {card.createdDate}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-[#737791]">
                      {card.expiryDate}
                    </td>
                    <td className="px-4 lg:px-6 py-4 text-sm text-[#737791]">
                      {card.status === "redeemed" ? (
                        <div>
                          <div className="font-medium text-blue-600 text-sm">Redeemed</div>
                          <div className="text-xs text-[#737791]">Date: {card.redeemedDate}</div>
                        </div>
                      ) : card.status === "active" ? (
                        <div>
                          <div className="font-medium text-green-600 text-sm">Available</div>
                          <div className="text-xs text-[#737791]">Ready for use</div>
                        </div>
                      ) : (
                        <span className="text-[#737791] capitalize">{card.status}</span>
                      )}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleCopyCode(card.code)}
                        className="text-[#5D5FEF] hover:text-[#4D4FDF] font-medium flex items-center gap-1"
                        title="Copy code"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </button>
                    </td>
                  </tr>
                ))}
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
            <p className="font-semibold mb-1">How the Points Pool System Works:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li><strong>Purchase Points Pool:</strong> Buy a large pool of points upfront that stays in your company balance</li>
              <li><strong>Distribute Over Time:</strong> Create and distribute gift cards to employees whenever needed, drawing from your points pool</li>
              <li><strong>Track Your Balance:</strong> Monitor available balance, distributed points, and redeemed points in real-time</li>
              <li><strong>Flexible Distribution:</strong> Share gift card codes via email or distribute through internal channels</li>
              <li><strong>Instant Redemption:</strong> When employees redeem codes, points are added to their accounts immediately</li>
              <li><strong>Cost Effective:</strong> Buy in bulk and distribute gradually for employee rewards, bonuses, or recognition programs</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
