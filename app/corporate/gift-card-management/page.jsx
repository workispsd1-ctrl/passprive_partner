"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import * as XLSX from "xlsx";

export default function GiftCardManagementPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [codePrefix, setCodePrefix] = useState("");
  const [pointsValue, setPointsValue] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [expiryDate, setExpiryDate] = useState("");
  const [description, setDescription] = useState("");
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
      
      const response = await fetch(url);
      
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
        
        throw new Error(
          `Backend returned ${response.status}: ${errorText || "Failed to fetch gift cards"}. 
          Please ensure the endpoint ${url} exists in your backend.`
        );
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
        redeemedBy: card.redeemed_by_email || null,
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
      redeemedBy: null,
      description: "New Year Special",
    },
    {
      id: 2,
      code: "WELCOME50XY",
      points: 500,
      status: "redeemed",
      createdDate: "2026-01-15",
      expiryDate: "2026-12-31",
      redeemedDate: "2026-02-10",
      redeemedBy: "john.doe@example.com",
      description: "Welcome Bonus",
    },
    {
      id: 3,
      code: "FEST2026ABC",
      points: 2000,
      status: "active",
      createdDate: "2026-02-05",
      expiryDate: "2026-06-30",
      redeemedDate: null,
      redeemedBy: null,
      description: "Festival Special",
    },
    {
      id: 4,
      code: "EXPIRE50OLD",
      points: 500,
      status: "expired",
      createdDate: "2025-12-01",
      expiryDate: "2026-01-31",
      redeemedDate: null,
      redeemedBy: null,
      description: "Year End Offer",
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

    if (!quantity || parseInt(quantity) <= 0 || parseInt(quantity) > 100) {
      setError("Please enter quantity between 1 and 100");
      return;
    }

    if (!corporateId) {
      setError("Corporate ID not found. Please try refreshing the page.");
      return;
    }

    setLoading(true);

    try {
      const qty = parseInt(quantity);
      const newCards = [];

      // Generate multiple gift cards
      for (let i = 0; i < qty; i++) {
        const code = generateGiftCardCode(codePrefix);
        newCards.push({
          code: code,
          points_value: parseInt(pointsValue),
          status: "active",
          expiry_date: expiryDate || null,
          description: description.trim() || null,
          created_at: new Date().toISOString(),
        });
      }

      // Send to backend
      const response = await fetch(`${API_BASE}/api/corporates/${corporateId}/gift-cards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ gift_cards: newCards }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || errorData?.message || "Failed to create gift cards");
      }

      const result = await response.json();
      console.log("Gift cards created:", result);

      // Reset form
      setCodePrefix("");
      setPointsValue("");
      setQuantity("1");
      setExpiryDate("");
      setDescription("");
      
      // Add new cards to the local state for immediate display
      const displayCards = newCards.map((card, index) => ({
        id: giftCards.length + index + 1,
        code: card.code,
        points: card.points_value,
        status: "active",
        createdDate: new Date().toISOString().split('T')[0],
        expiryDate: card.expiry_date || "N/A",
        redeemedDate: null,
        redeemedBy: null,
        description: card.description || "",
      }));
      
      setGiftCards([...displayCards, ...giftCards]);
      
      setSuccess(`Successfully created ${qty} gift card${qty > 1 ? 's' : ''}!`);
      
      // Refresh gift cards list from backend
      setTimeout(async () => {
        await fetchGiftCards();
        setShowCreateForm(false);
        setSuccess("");
      }, 2000);
    } catch (err) {
      console.error("Error creating gift cards:", err);
      setError(err.message || "Failed to create gift cards. Please try again.");
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
  const totalPointsIssued = giftCards.reduce((sum, c) => sum + c.points, 0);
  const totalPointsRedeemed = giftCards.filter(c => c.status === "redeemed").reduce((sum, c) => sum + c.points, 0);

  // Download gift cards as Excel
  const handleDownloadExcel = () => {
    const data = filteredCards.map(card => ({
      'Gift Card Code': card.code,
      'Points Value': card.points,
      'Status': card.status.toUpperCase(),
      'Created Date': card.createdDate,
      'Expiry Date': card.expiryDate,
      'Redeemed Date': card.redeemedDate || 'N/A',
      'Redeemed By': card.redeemedBy || 'N/A',
      'Description': card.description || 'N/A',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gift Cards");
    
    // Auto-size columns
    const colWidths = [
      { wch: 20 }, // Code
      { wch: 12 }, // Points
      { wch: 10 }, // Status
      { wch: 12 }, // Created Date
      { wch: 12 }, // Expiry Date
      { wch: 12 }, // Redeemed Date
      { wch: 25 }, // Redeemed By
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-6 lg:mb-8">
        <div className="bg-white rounded-xl p-5 lg:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Total Gift Cards</h3>
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-[#151D48]">{totalCards}</div>
          <div className="mt-2 text-xs text-[#737791]">
            <span className="text-green-600 font-semibold">{activeCards} Active</span> • 
            <span className="text-gray-600"> {redeemedCards} Redeemed</span> • 
            <span className="text-red-600"> {expiredCards} Expired</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 lg:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Total Points Issued</h3>
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-[#151D48]">{totalPointsIssued.toLocaleString()}</div>
          <div className="mt-2 text-xs text-[#737791]">Across all gift cards</div>
        </div>

        <div className="bg-white rounded-xl p-5 lg:p-6 shadow-sm border border-gray-100 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#737791]">Points Redeemed</h3>
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-[#151D48]">{totalPointsRedeemed.toLocaleString()}</div>
          <div className="mt-2 text-xs text-[#737791]">
            {totalPointsIssued > 0 ? `${((totalPointsRedeemed / totalPointsIssued) * 100).toFixed(1)}% redemption rate` : '0% redemption rate'}
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Gift Cards
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

      {/* Create Gift Card Form */}
      {showCreateForm && (
        <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-gray-100 mb-6">
          <h2 className="text-lg font-semibold text-[#151D48] mb-4">Create New Gift Cards</h2>
          
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
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1-100"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent"
                min="1"
                max="100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#151D48] mb-2">
                Code Prefix (Optional)
              </label>
              <input
                type="text"
                value={codePrefix}
                onChange={(e) => setCodePrefix(e.target.value.slice(0, 6))}
                placeholder="e.g., NEW, FEST (max 6 chars)"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent uppercase"
                maxLength="6"
              />
              <p className="mt-1 text-xs text-[#737791]">
                Preview: {generateGiftCardCode(codePrefix)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#151D48] mb-2">
                Expiry Date (Optional)
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-[#151D48] mb-2">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., New Year Special Offer"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:border-transparent resize-none"
                rows="2"
                maxLength="200"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCreateGiftCards}
              disabled={loading}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-[#5D5FEF] text-white rounded-lg text-sm font-medium hover:bg-[#4D4FDF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating..." : "Create Gift Cards"}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setCodePrefix("");
                setPointsValue("");
                setQuantity("1");
                setExpiryDate("");
                setDescription("");
                setError("");
              }}
              className="px-6 py-2.5 border border-gray-300 text-[#151D48] rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
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
                    Redeemed Info
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
                          <div className="font-medium text-[#151D48]">{card.redeemedBy}</div>
                          <div className="text-xs">{card.redeemedDate}</div>
                        </div>
                      ) : (
                        <span className="text-[#737791]">—</span>
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
            <p className="font-semibold mb-1">How Gift Cards Work:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Create gift cards with unique codes and point values</li>
              <li>Share codes with your employees via email or other channels</li>
              <li>Employees can redeem codes in the PassPrive mobile app</li>
              <li>Points are added to their account instantly upon redemption</li>
              <li>Track redemption status and analytics in real-time</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
