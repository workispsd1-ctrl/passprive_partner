"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import * as XLSX from "xlsx";

export default function EmployeeManagementPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");
  const [corporateId, setCorporateId] = useState("8a6d0136-6566-4703-ac69-c59217302c56");

  const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

  // Fetch employees from backend
  const [employees, setEmployees] = useState([]);
  const [fetchingEmployees, setFetchingEmployees] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Authentication removed for now - using hardcoded corporate ID
  // TODO: Re-enable authentication when corporate login is implemented

  // Fetch employees from backend
  const fetchEmployees = async () => {
    setFetchingEmployees(true);
    setFetchError("");
    
    try {
      const url = `${API_BASE}/api/corporates/${corporateId}/employees`;
      console.log("Fetching employees from:", url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend response error:", response.status, errorText);
        throw new Error(
          `Backend returned ${response.status}: ${errorText || "Failed to fetch employees"}. 
          Please ensure the endpoint ${url} exists in your backend.`
        );
      }
      
      const data = await response.json();
      console.log("Received employee data:", data);
      
      // Transform the data to match our UI format
      const transformedEmployees = (data.employees || []).map((emp, index) => ({
        id: index + 1,
        name: emp.name || "N/A",
        email: emp.email || "N/A",
        phone: emp.phone || "N/A",
        department: emp.department || "N/A",
        designation: emp.designation || "N/A",
        status: "Active",
        joinedDate: emp.created_at ? new Date(emp.created_at).toISOString().split('T')[0] : "N/A"
      }));
      
      setEmployees(transformedEmployees);
    } catch (err) {
      console.error("Error fetching employees:", err);
      setFetchError(err.message || "Failed to load employees");
    } finally {
      setFetchingEmployees(false);
    }
  };

  // Fetch employees on component mount
  useEffect(() => {
    if (corporateId) {
      fetchEmployees();
    }
  }, [corporateId]);

  const handleAddEmployee = async () => {
    // Reset messages
    setError("");
    setSuccess("");

    // Validation
    if (!firstName || !lastName || !email || !phoneNumber || !department || !designation) {
      setError("Please fill in all required fields");
      return;
    }

    if (!corporateId) {
      setError("Corporate ID not found. Please try refreshing the page.");
      return;
    }

    setLoading(true);

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      
      // Generate a default password (can be customized)
      const defaultPassword = `Pass@${Math.random().toString(36).slice(-8)}`;
      
      const cleanedEmployee = {
        full_name: fullName,
        email: email.trim(),
        phone: phoneNumber.trim(),
        password: defaultPassword,
        role: "user",
        department: department.trim() || undefined,
        designation: designation.trim() || undefined,
      };

      // Step 1: Create user in Supabase Auth (no authentication for now)
      const res = await fetch(`${API_BASE}/api/auth/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ users: [cleanedEmployee] }),
      });

      const json = await res.json();
      
      if (!res.ok) throw new Error(json?.error || "Failed to create employee");

      const createdUsers = Array.isArray(json?.created) ? json.created : [];
      const failedUsers = Array.isArray(json?.failed) ? json.failed : [];

      // Check if all failures are "already registered" - we can still add them to corporate
      if (failedUsers.length > 0) {
        const allAlreadyRegistered = failedUsers.every(f => 
          String(f.error || "").toLowerCase().includes("already registered")
        );
        
        if (allAlreadyRegistered && failedUsers.length > 0) {
          // TODO: Fetch existing user IDs and add them to corporate
          const failureEmails = failedUsers.map(f => f.email).join(", ");
          setError(`These users already exist: ${failureEmails}. Please contact admin to add them to your corporate.`);
          setLoading(false);
          return;
        }
      }

      // Step 2: Append to corporate.employees jsonb
      if (createdUsers.length) {
        const employeesPayload = createdUsers.map((u) => ({
          user_id: u.id,
          name: u.full_name || fullName || "",
          email: u.email,
          phone: u.phone || phoneNumber.trim() || "",
          department: cleanedEmployee.department || null,
          designation: cleanedEmployee.designation || null,
          created_at: u.created_at || new Date().toISOString(),
        }));

        const res2 = await fetch(`${API_BASE}/api/corporates/${corporateId}/employees`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ employees: employeesPayload }),
        });

        let json2;
        const responseText = await res2.text();
        
        try {
          json2 = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
          console.error("Failed to parse response:", parseError);
          json2 = { error: "Invalid response from server" };
        }
        
        console.log("Step 2 - Update Corporate Response:", json2);
        
        if (!res2.ok) {
          console.error("Step 2 failed with error:", json2?.error || responseText);
          throw new Error(json2?.error || json2?.message || "Failed to update corporate employees");
        }
      }

      // Reset form
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhoneNumber("");
      setDepartment("");
      setDesignation("");
      
      // Show detailed message if there are failures
      if (failedUsers.length > 0) {
        const failureReasons = failedUsers.map(f => `${f.email}: ${f.error || 'Unknown error'}`).join(', ');
        setError(`Failed to create employee(s): ${failureReasons}`);
      } else {
        // Add new employee to the local state
        const newEmployee = {
          id: employees.length + 1,
          name: fullName,
          email: email.trim(),
          phone: `+91 ${phoneNumber.trim()}`,
          department: department.trim(),
          designation: designation.trim(),
          status: "Active",
          joinedDate: new Date().toISOString().split('T')[0]
        };
        setEmployees([...employees, newEmployee]);
        
        setSuccess(`Employee created successfully!`);
        // Refresh employee list from backend
        await fetchEmployees();
        // Close form after 2 seconds
        setTimeout(() => {
          setShowAddForm(false);
          setSuccess("");
        }, 2000);
      }
    } catch (err) {
      setError(err.message || "Failed to add employee. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      setFiles((prev) => [...prev, ...selectedFiles]);
      setError("");
      setSuccess("");
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      setFiles((prev) => [...prev, ...droppedFiles]);
      setError("");
      setSuccess("");
    }
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setFiles([]);
    setError("");
    setSuccess("");
    setUploadProgress("");
  };

  // Parse Excel file and extract employee data
  const parseExcelFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          
          // Get first sheet
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          
          if (jsonData.length < 2) {
            reject(new Error(`File ${file.name}: No data found in Excel file`));
            return;
          }

          // First row is header
          const headers = jsonData[0].map(h => String(h || "").toLowerCase().trim());
          
          // Map column indices
          const firstNameIdx = headers.findIndex(h => h.includes("first") && h.includes("name"));
          const lastNameIdx = headers.findIndex(h => h.includes("last") && h.includes("name"));
          const fullNameIdx = headers.findIndex(h => h === "name" || h === "full name" || h === "fullname");
          const emailIdx = headers.findIndex(h => h.includes("email") || h.includes("e-mail"));
          const phoneIdx = headers.findIndex(h => h.includes("phone") || h.includes("mobile") || h.includes("contact"));
          const deptIdx = headers.findIndex(h => h.includes("department") || h.includes("dept"));
          const desigIdx = headers.findIndex(h => h.includes("designation") || h.includes("position") || h.includes("role"));

          if (emailIdx === -1) {
            reject(new Error(`File ${file.name}: Email column not found. Please ensure your Excel has an 'Email' column.`));
            return;
          }

          // Process data rows
          const employees = [];
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            // Skip empty rows
            if (!row || row.length === 0 || !row[emailIdx]) continue;

            let fullName = "";
            
            // Try to get full name
            if (fullNameIdx !== -1 && row[fullNameIdx]) {
              fullName = String(row[fullNameIdx]).trim();
            } else if (firstNameIdx !== -1 && lastNameIdx !== -1) {
              const firstName = row[firstNameIdx] ? String(row[firstNameIdx]).trim() : "";
              const lastName = row[lastNameIdx] ? String(row[lastNameIdx]).trim() : "";
              fullName = `${firstName} ${lastName}`.trim();
            } else if (firstNameIdx !== -1) {
              fullName = row[firstNameIdx] ? String(row[firstNameIdx]).trim() : "";
            }

            const employee = {
              full_name: fullName || "Employee",
              email: row[emailIdx] ? String(row[emailIdx]).trim() : "",
              phone: phoneIdx !== -1 && row[phoneIdx] ? String(row[phoneIdx]).trim() : "",
              department: deptIdx !== -1 && row[deptIdx] ? String(row[deptIdx]).trim() : "",
              designation: desigIdx !== -1 && row[desigIdx] ? String(row[desigIdx]).trim() : "",
            };

            // Validate email
            if (employee.email && employee.email.includes("@")) {
              employees.push(employee);
            }
          }

          if (employees.length === 0) {
            reject(new Error(`File ${file.name}: No valid employee data found`));
            return;
          }

          resolve(employees);
        } catch (err) {
          reject(new Error(`File ${file.name}: Failed to parse Excel - ${err.message}`));
        }
      };

      reader.onerror = () => {
        reject(new Error(`File ${file.name}: Failed to read file`));
      };

      reader.readAsArrayBuffer(file);
    });
  };

  // Handle bulk upload from Excel files
  const handleBulkUpload = async () => {
    if (files.length === 0) {
      setError("Please select at least one Excel file to upload");
      return;
    }

    if (!corporateId) {
      setError("Corporate ID not found. Please try refreshing the page.");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");
    setUploadProgress("Reading Excel files...");

    try {
      // Parse all files
      const allEmployees = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Processing file ${i + 1} of ${files.length}: ${file.name}...`);
        
        try {
          const employees = await parseExcelFile(file);
          allEmployees.push(...employees);
        } catch (err) {
          console.error("File parse error:", err);
          setError(err.message);
          setUploading(false);
          setUploadProgress("");
          return;
        }
      }

      if (allEmployees.length === 0) {
        setError("No valid employees found in the selected files");
        setUploading(false);
        setUploadProgress("");
        return;
      }

      setUploadProgress(`Found ${allEmployees.length} employees. Creating accounts...`);

      // Add default password for each employee
      const employeesWithPassword = allEmployees.map(emp => ({
        ...emp,
        password: `Pass@${Math.random().toString(36).slice(-8)}`,
        role: "user",
        department: emp.department || undefined,
        designation: emp.designation || undefined,
      }));

      // Step 1: Create users in Supabase Auth
      const res = await fetch(`${API_BASE}/api/auth/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ users: employeesWithPassword }),
      });

      const json = await res.json();
      
      if (!res.ok) throw new Error(json?.error || "Failed to create employees");

      const createdUsers = Array.isArray(json?.created) ? json.created : [];
      const failedUsers = Array.isArray(json?.failed) ? json.failed : [];

      setUploadProgress(`Created ${createdUsers.length} accounts. Adding to corporate...`);

      // Step 2: Add to corporate
      if (createdUsers.length > 0) {
        const employeesPayload = createdUsers.map((u, idx) => {
          const originalEmp = employeesWithPassword[idx] || {};
          return {
            user_id: u.id,
            name: u.full_name || originalEmp.full_name || "",
            email: u.email,
            phone: u.phone || originalEmp.phone || "",
            department: originalEmp.department || null,
            designation: originalEmp.designation || null,
            created_at: u.created_at || new Date().toISOString(),
          };
        });

        const res2 = await fetch(`${API_BASE}/api/corporates/${corporateId}/employees`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ employees: employeesPayload }),
        });

        let json2;
        const responseText = await res2.text();
        
        try {
          json2 = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
          console.error("Failed to parse response:", parseError);
          json2 = { error: "Invalid response from server" };
        }
        
        if (!res2.ok) {
          console.error("Step 2 failed:", json2?.error || responseText);
          throw new Error(json2?.error || json2?.message || "Failed to add employees to corporate");
        }
      }

      // Clear files and show results
      setFiles([]);
      
      let message = `Successfully uploaded ${createdUsers.length} employee(s)!`;
      if (failedUsers.length > 0) {
        message += ` ${failedUsers.length} failed (possibly already exist).`;
      }
      
      setSuccess(message);
      setUploadProgress("");
      
      // Refresh employee list from backend
      await fetchEmployees();
    } catch (err) {
      setError(err.message || "Failed to upload employees. Please try again.");
      setUploadProgress("");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-50 py-6 sm:py-8 lg:py-10 px-4 sm:px-6 lg:px-8">
      {/* Whole Card Frame - Responsive */}
      <div className="flex flex-col gap-5 sm:gap-6 max-w-7xl mx-auto w-full">
        
        {/* Header Section with Title and Add Employee Button */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#1E1E1E]">Employee Management</h1>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-[#5D5FEF] hover:bg-[#4D4FDF] text-white rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:ring-offset-2 shadow-sm flex items-center gap-2"
            style={{ 
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: '600',
              lineHeight: '1.2',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showAddForm ? "M6 18L18 6M6 6l12 12" : "M12 4v16m8-8H4"} />
            </svg>
            {showAddForm ? "Cancel" : "Add Employee"}
          </button>
        </div>

        {/* Conditional Rendering: Show Form or Table */}
        {!showAddForm ? (
          /* Employee Table View */
          <div className="bg-white border border-[#E5E5E5] rounded-xl shadow-sm w-full overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-[#E5E5E5]">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">
                      Department
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">
                      Designation
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-[#E5E5E5]">
                  {fetchingEmployees ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-12 text-center">
                        <div className="flex justify-center items-center gap-2 text-gray-500">
                          <svg className="animate-spin h-5 w-5 text-[#5D5FEF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Loading employees...
                        </div>
                      </td>
                    </tr>
                  ) : fetchError ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-12 text-center">
                        <div className="text-red-600 max-w-2xl mx-auto">
                          <svg className="mx-auto h-12 w-12 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <p className="font-semibold text-lg mb-2">Error loading employees</p>
                          <p className="text-sm text-gray-600 mb-3 whitespace-pre-line">{fetchError}</p>
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3 text-left">
                            <p className="text-sm text-yellow-800">
                              <strong>ℹ️ Backend Setup Required:</strong><br/>
                              Create GET endpoint: <code className="bg-yellow-100 px-1 rounded">/api/corporates/{"{corporate_id}"}/employees</code><br/>
                              Check <strong>BACKEND_ENDPOINT_NEEDED.md</strong> for implementation details.
                            </p>
                          </div>
                          <button
                            onClick={fetchEmployees}
                            className="mt-2 bg-[#5D5FEF] hover:bg-[#4D4FDF] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            Try Again
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : employees.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                        No employees found. Click "Add Employee" to add your first employee.
                      </td>
                    </tr>
                  ) : (
                    employees.map((employee) => (
                      <tr key={employee.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-[#5D5FEF] rounded-full flex items-center justify-center text-white font-semibold">
                              {employee.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-[#1E1E1E]">{employee.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-[#1E1E1E]">{employee.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-[#1E1E1E]">{employee.phone}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-[#1E1E1E]">{employee.department}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-[#1E1E1E]">{employee.designation}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            {employee.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button className="text-[#5D5FEF] hover:text-[#4D4FDF] mr-4">
                            Edit
                          </button>
                          <button className="text-red-600 hover:text-red-700">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Add Employee Form View */
          <>
        {/* Upper Card - Responsive */}
        <div 
          className="bg-white border border-[#E5E5E5] rounded-xl shadow-sm w-full"
          style={{ 
            paddingTop: '28px',
            paddingBottom: '28px',
            paddingLeft: '24px',
            paddingRight: '24px'
          }}
        >
          {/* Inner Frame - Responsive */}
          <div className="flex flex-col gap-4 sm:gap-5 w-full max-w-4xl mx-auto">
            {/* First Row - Responsive */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-4 w-full">
              {/* First Name Input Field - Responsive */}
              <div className="flex flex-col gap-1.5 w-full sm:w-1/2">
                <label 
                  className="text-[#1E1E1E] font-medium"
                  style={{ 
                    fontSize: '13px',
                    fontWeight: '500',
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
                  className="border border-[#D9D9D9] rounded-lg px-3 py-2.5 outline-none focus:border-[#5D5FEF] focus:ring-1 focus:ring-[#5D5FEF] placeholder-[#B3B3B3] w-full transition-all"
                  style={{ 
                    minHeight: '42px',
                    fontSize: '14px',
                    fontWeight: '400',
                    lineHeight: '140%',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                />
              </div>

              {/* Last Name Input Field - Responsive */}
              <div className="flex flex-col gap-1.5 w-full sm:w-1/2">
                <label 
                  className="text-[#1E1E1E] font-medium"
                  style={{ 
                    fontSize: '13px',
                    fontWeight: '500',
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
                  className="border border-[#D9D9D9] rounded-lg px-3 py-2.5 outline-none focus:border-[#5D5FEF] focus:ring-1 focus:ring-[#5D5FEF] placeholder-[#B3B3B3] w-full transition-all"
                  style={{ 
                    minHeight: '42px',
                    fontSize: '14px',
                    fontWeight: '400',
                    lineHeight: '140%',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                />
              </div>
            </div>

            {/* Second Row - Responsive */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-4 w-full">
              {/* Email Input Field - Responsive */}
              <div className="flex flex-col gap-1.5 w-full sm:w-1/2">
                <label 
                  className="text-[#1E1E1E] font-medium"
                  style={{ 
                    fontSize: '13px',
                    fontWeight: '500',
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
                  className="border border-[#D9D9D9] rounded-lg px-3 py-2.5 outline-none focus:border-[#5D5FEF] focus:ring-1 focus:ring-[#5D5FEF] placeholder-[#B3B3B3] w-full transition-all"
                  style={{ 
                    minHeight: '42px',
                    fontSize: '14px',
                    fontWeight: '400',
                    lineHeight: '140%',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                />
              </div>

              {/* Phone Number Input Field - Responsive */}
              <div className="flex flex-col gap-1.5 w-full sm:w-1/2">
                <label 
                  className="text-[#1E1E1E] font-medium"
                  style={{ 
                    fontSize: '13px',
                    fontWeight: '500',
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
                    className="border border-[#D9D9D9] bg-gray-50 rounded-lg px-2 text-center text-gray-700 font-medium"
                    style={{ width: '56px', minHeight: '42px', fontSize: '14px' }}
                  />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Enter phone number"
                    className="border border-[#D9D9D9] rounded-lg px-3 py-2.5 outline-none focus:border-[#5D5FEF] focus:ring-1 focus:ring-[#5D5FEF] placeholder-[#B3B3B3] flex-1 transition-all"
                    style={{ 
                      minHeight: '42px',
                      fontSize: '14px',
                      fontWeight: '400',
                      lineHeight: '140%',
                      fontFamily: 'system-ui, -apple-system, sans-serif'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Third Row - Department and Designation */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-4 w-full">
              {/* Department Input Field */}
              <div className="flex flex-col gap-1.5 w-full sm:w-1/2">
                <label 
                  className="text-[#1E1E1E] font-medium"
                  style={{ 
                    fontSize: '13px',
                    fontWeight: '500',
                    lineHeight: '140%',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                >
                  Department
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Enter department"
                  className="border border-[#D9D9D9] rounded-lg px-3 py-2.5 outline-none focus:border-[#5D5FEF] focus:ring-1 focus:ring-[#5D5FEF] placeholder-[#B3B3B3] w-full transition-all"
                  style={{ 
                    minHeight: '42px',
                    fontSize: '14px',
                    fontWeight: '400',
                    lineHeight: '140%',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                />
              </div>

              {/* Designation Input Field */}
              <div className="flex flex-col gap-1.5 w-full sm:w-1/2">
                <label 
                  className="text-[#1E1E1E] font-medium"
                  style={{ 
                    fontSize: '13px',
                    fontWeight: '500',
                    lineHeight: '140%',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                >
                  Designation
                </label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="Enter designation"
                  className="border border-[#D9D9D9] rounded-lg px-3 py-2.5 outline-none focus:border-[#5D5FEF] focus:ring-1 focus:ring-[#5D5FEF] placeholder-[#B3B3B3] w-full transition-all"
                  style={{ 
                    minHeight: '42px',
                    fontSize: '14px',
                    fontWeight: '400',
                    lineHeight: '140%',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Error and Success Messages */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm text-center">
              {success}
            </div>
          )}

          {/* Add Employee Button - Responsive */}
          <div className="flex justify-center mt-6">
            <button
              onClick={handleAddEmployee}
              disabled={loading}
              className="bg-[#5D5FEF] hover:bg-[#4D4FDF] text-white rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:ring-offset-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ 
                padding: '10px 24px',
                fontSize: '13px',
                fontWeight: '600',
                lineHeight: '1.2',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}
            >
              {loading ? "Adding Employee..." : "Add Employee"}
            </button>
          </div>
        </div>

        {/* Lower Card - File Upload Section - Responsive */}
        <div 
          className="bg-white border border-[#E5E5E5] rounded-xl shadow-sm w-full"
          style={{ 
            paddingTop: '32px',
            paddingBottom: '32px',
            paddingLeft: '24px',
            paddingRight: '24px'
          }}
        >
          {/* Error and Success Messages for Bulk Upload */}
          {error && !loading && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          {success && !loading && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {success}
            </div>
          )}

          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center space-y-4 py-2"
          >
            {/* Upload Icon */}
            <div className="flex items-center justify-center rounded-full bg-indigo-50" 
              style={{ 
                width: '56px', 
                height: '56px' 
              }}
            >
              <Image
                src="/upload.png"
                alt="Upload"
                width={26}
                height={26}
                style={{ 
                  width: '26px', 
                  height: '26px' 
                }}
              />
            </div>

            {/* Upload Text */}
            <div className="text-center px-4">
              <h3 
                className="text-[#1E1E1E] font-semibold"
                style={{ 
                  fontSize: '15px',
                  fontWeight: '600',
                  lineHeight: '140%',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}
              >
                Upload Excel Files
              </h3>
              <p 
                className="mt-1 text-[#6B6B6B]"
                style={{ 
                  fontSize: '13px',
                  fontWeight: '400',
                  lineHeight: '140%'
                }}
              >
                Drag & drop files here, or browse to select multiple files
              </p>
            </div>

            {/* Browse and Download Template Buttons */}
            <div className="w-full sm:w-auto flex flex-wrap justify-center gap-3">
              <input
                type="file"
                id="file-upload"
                accept=".xlsx,.xls"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer bg-[#5D5FEF] hover:bg-[#4D4FDF] text-white rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:ring-offset-2 inline-block text-center shadow-sm"
                style={{ 
                  padding: '10px 24px',
                  fontSize: '13px',
                  fontWeight: '600',
                  lineHeight: '1.2',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}
              >
                Browse Files
              </label>
              
              <button
                onClick={() => {
                  // Create sample data for template
                  const sampleData = [
                    ['Email', 'First Name', 'Last Name', 'Phone', 'Department', 'Designation'],
                    ['john.doe@example.com', 'John', 'Doe', '9876543210', 'Engineering', 'Software Developer'],
                    ['jane.smith@example.com', 'Jane', 'Smith', '9876543211', 'Marketing', 'Marketing Manager'],
                    ['mike.wilson@example.com', 'Mike', 'Wilson', '9876543212', 'Sales', 'Sales Executive']
                  ];
                  
                  // Create workbook and worksheet
                  const wb = XLSX.utils.book_new();
                  const ws = XLSX.utils.aoa_to_sheet(sampleData);
                  
                  // Add worksheet to workbook
                  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
                  
                  // Download
                  XLSX.writeFile(wb, 'employee_template.xlsx');
                }}
                className="cursor-pointer border border-[#5D5FEF] text-[#5D5FEF] hover:bg-[#5D5FEF] hover:text-white rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:ring-offset-2 inline-block text-center shadow-sm"
                style={{ 
                  padding: '10px 24px',
                  fontSize: '13px',
                  fontWeight: '600',
                  lineHeight: '1.2',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}
              >
                Download Template
              </button>
            </div>

            {/* File Requirements */}
            <div className="text-center text-[#6B6B6B] px-4 space-y-0.5" style={{ fontSize: '12px', lineHeight: '1.5' }}>
              <p>• Support .xlsx and .xls formats. Max file size 5MB each</p>
              <p>• Upload multiple spreadsheets to add employees in bulk</p>
              <p>• Excel must have columns: Email (required), Name/First Name/Last Name, Phone, Department, Designation</p>
            </div>

            {/* Selected Files List */}
            {files.length > 0 && (
              <div className="w-full max-w-2xl mt-6 space-y-3">
                <div className="flex items-center justify-between px-2">
                  <h4 className="text-sm font-semibold text-[#1E1E1E]">
                    Selected Files ({files.length})
                  </h4>
                  <button
                    onClick={clearAllFiles}
                    disabled={uploading}
                    className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                  >
                    Clear All
                  </button>
                </div>
                
                <div className="border border-[#E5E5E5] rounded-lg divide-y divide-[#E5E5E5] max-h-60 overflow-y-auto">
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 hover:bg-gray-50">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V6.414A2 2 0 0016.414 5L14 2.586A2 2 0 0012.586 2H9z" />
                            <path d="M3 8a2 2 0 012-2v10h8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1E1E1E] truncate">{file.name}</p>
                          <p className="text-xs text-[#6B6B6B]">
                            {(file.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        disabled={uploading}
                        className="ml-3 text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Upload Progress */}
                {uploadProgress && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm text-center">
                    {uploadProgress}
                  </div>
                )}

                {/* Upload Button */}
                <div className="flex justify-center mt-4">
                  <button
                    onClick={handleBulkUpload}
                    disabled={uploading}
                    className="bg-[#5D5FEF] hover:bg-[#4D4FDF] text-white rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#5D5FEF] focus:ring-offset-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ 
                      padding: '12px 32px',
                      fontSize: '14px',
                      fontWeight: '600',
                      lineHeight: '1.2',
                      fontFamily: 'system-ui, -apple-system, sans-serif'
                    }}
                  >
                    {uploading ? "Uploading..." : `Upload ${files.length} File${files.length > 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
