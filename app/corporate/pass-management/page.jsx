"use client";

import React, { useEffect, useState, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/* =========================================================
   Clean Pro UI Components
========================================================= */
function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200 ${className}`} />;
}

function Toast({ show, tone = "slate", title, desc, onClose }) {
  if (!show) return null;
  const map = {
    slate: "border-slate-200 bg-white text-slate-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
  };
  return (
    <div className="fixed top-4 right-4 z-[90] w-[360px] max-w-[90vw]">
      <div className={`rounded-2xl border p-4 shadow-lg ${map[tone] || map.slate}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            {desc ? <p className="mt-1 text-sm opacity-80">{desc}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-xl px-2 py-1 text-sm hover:bg-black/5 active:scale-[0.98]"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, right, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className="text-xs text-slate-500 mt-1">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Label({ children }) {
  return <p className="text-xs text-slate-600 mb-2">{children}</p>;
}

function Input({ value, onChange, placeholder, type = "text", disabled = false }) {
  return (
    <input
      type={type}
      value={value ?? ""}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
    />
  );
}

function Select({ value, onChange, options, placeholder, disabled = false }) {
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function PrimaryButton({ children, onClick, disabled = false, type = "button" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl bg-[#5D5FEF] hover:bg-[#4D4FDF] px-4 py-2 text-sm font-medium text-white active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed focus:ring-2 focus:ring-[#5D5FEF] focus:ring-offset-2"
    >
      {children}
    </button>
  );
}

function SoftButton({ children, onClick, disabled = false, type = "button" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function Badge({ tone = "slate", children }) {
  const map = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border border-rose-200",
    amber: "bg-amber-50 text-amber-700 border border-amber-200",
    blue: "bg-blue-50 text-blue-700 border border-blue-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${map[tone] || map.slate}`}>
      {children}
    </span>
  );
}

function StatCard({ title, value, subtitle, icon, trend }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {icon && (
          <div className="rounded-xl bg-slate-100 p-3">
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          <span className={trend.type === 'up' ? 'text-emerald-600' : 'text-rose-600'}>
            {trend.type === 'up' ? '↑' : '↓'} {trend.value}
          </span>
          <span className="text-slate-500">{trend.label}</span>
        </div>
      )}
    </div>
  );
}

function Modal({ show, onClose, title, children }) {
  if (!show) return null;
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-xl px-2 py-1 text-sm hover:bg-slate-100 active:scale-[0.98]"
          >
            ✕
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
        active
          ? "bg-[#5D5FEF] text-white"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

/* =========================================================
   Main Page Component
========================================================= */
export default function PassManagementPage() {
  const [loading, setLoading] = useState(true);
  const [corporateId, setCorporateId] = useState("8a6d0136-6566-4703-ac69-c59217302c56");
  
  // State
  const [passes, setPasses] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [activeTab, setActiveTab] = useState("all"); // all, active, pending, expired, revoked
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedPass, setSelectedPass] = useState(null);
  
  // Create pass form
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState("");
  const [passType, setPassType] = useState("single"); // single, monthly, annual
  const [maxUsagePerDay, setMaxUsagePerDay] = useState("1");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  
  // Toast
  const [toast, setToast] = useState({ show: false, tone: "slate", title: "", desc: "" });

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(tone, title, desc) {
    setToast({ show: true, tone, title, desc });
    setTimeout(() => setToast((p) => ({ ...p, show: false })), 3000);
  }

  async function loadData() {
    setLoading(true);
    try {
      // Load employees from corporate
      const { data: corpData } = await supabaseBrowser
        .from("corporates")
        .select("employees")
        .eq("id", corporateId)
        .single();

      if (corpData?.employees) {
        setEmployees(Array.isArray(corpData.employees) ? corpData.employees : []);
      }

      // Load restaurants (for pass assignment)
      const { data: restData } = await supabaseBrowser
        .from("restaurants")
        .select("id, name, city, area")
        .eq("is_active", true)
        .limit(50);

      if (restData) {
        setRestaurants(restData);
      }

      // Load passes (you'll need to create this table)
      const { data: passData } = await supabaseBrowser
        .from("corporate_passes")
        .select("*")
        .eq("corporate_id", corporateId)
        .order("created_at", { ascending: false });

      if (passData) {
        setPasses(passData);
      }

      setLoading(false);
    } catch (err) {
      showToast("rose", "Load failed", err.message || "Failed to load data");
      setLoading(false);
    }
  }

  async function createPass() {
    if (!selectedEmployee) {
      showToast("rose", "Missing employee", "Please select an employee");
      return;
    }
    if (!selectedRestaurant) {
      showToast("rose", "Missing restaurant", "Please select a restaurant");
      return;
    }
    if (!validFrom || !validUntil) {
      showToast("rose", "Missing dates", "Please select validity dates");
      return;
    }

    try {
      const employee = employees.find(e => e.user_id === selectedEmployee);
      const restaurant = restaurants.find(r => r.id === selectedRestaurant);

      const newPass = {
        corporate_id: corporateId,
        employee_id: selectedEmployee,
        employee_name: employee?.name || "",
        employee_email: employee?.email || "",
        restaurant_id: selectedRestaurant,
        restaurant_name: restaurant?.name || "",
        pass_type: passType,
        max_usage_per_day: parseInt(maxUsagePerDay) || 1,
        valid_from: validFrom,
        valid_until: validUntil,
        credit_limit: creditLimit ? parseFloat(creditLimit) : null,
        status: "active",
        times_used: 0,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseBrowser
        .from("corporate_passes")
        .insert([newPass])
        .select()
        .single();

      if (error) throw error;

      setPasses([data, ...passes]);
      setShowCreateModal(false);
      resetForm();
      showToast("emerald", "Pass created", "Employee pass has been created successfully");
    } catch (err) {
      showToast("rose", "Creation failed", err.message || "Failed to create pass");
    }
  }

  async function revokePass(passId) {
    try {
      const { error } = await supabaseBrowser
        .from("corporate_passes")
        .update({ status: "revoked" })
        .eq("id", passId);

      if (error) throw error;

      setPasses(passes.map(p => p.id === passId ? { ...p, status: "revoked" } : p));
      showToast("amber", "Pass revoked", "Pass has been revoked successfully");
      setShowDetailsModal(false);
    } catch (err) {
      showToast("rose", "Revoke failed", err.message || "Failed to revoke pass");
    }
  }

  function resetForm() {
    setSelectedEmployee("");
    setSelectedRestaurant("");
    setPassType("single");
    setMaxUsagePerDay("1");
    setValidFrom("");
    setValidUntil("");
    setCreditLimit("");
  }

  // Filter passes
  const filteredPasses = useMemo(() => {
    let filtered = passes;

    // Filter by tab
    if (activeTab !== "all") {
      if (activeTab === "active") {
        filtered = filtered.filter(p => p.status === "active" && new Date(p.valid_until) > new Date());
      } else if (activeTab === "pending") {
        filtered = filtered.filter(p => p.status === "pending");
      } else if (activeTab === "expired") {
        filtered = filtered.filter(p => new Date(p.valid_until) < new Date());
      } else if (activeTab === "revoked") {
        filtered = filtered.filter(p => p.status === "revoked");
      }
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        p =>
          p.employee_name?.toLowerCase().includes(q) ||
          p.employee_email?.toLowerCase().includes(q) ||
          p.restaurant_name?.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [passes, activeTab, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const now = new Date();
    return {
      total: passes.length,
      active: passes.filter(p => p.status === "active" && new Date(p.valid_until) > now).length,
      expired: passes.filter(p => new Date(p.valid_until) < now).length,
      revoked: passes.filter(p => p.status === "revoked").length,
      totalUsage: passes.reduce((sum, p) => sum + (p.times_used || 0), 0),
    };
  }, [passes]);

  function getPassStatus(pass) {
    if (pass.status === "revoked") return { label: "Revoked", tone: "slate" };
    if (new Date(pass.valid_until) < new Date()) return { label: "Expired", tone: "rose" };
    if (pass.status === "pending") return { label: "Pending", tone: "amber" };
    if (pass.status === "active") return { label: "Active", tone: "emerald" };
    return { label: pass.status, tone: "slate" };
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          <Skeleton className="h-10 w-56" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Toast
        show={toast.show}
        tone={toast.tone}
        title={toast.title}
        desc={toast.desc}
        onClose={() => setToast((p) => ({ ...p, show: false }))}
      />

      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500">Pass Management</p>
              <h1 className="text-2xl font-bold text-slate-900">Employee Passes</h1>
              <p className="text-sm text-slate-600 mt-1">
                Manage and track employee dining passes
              </p>
            </div>
            <PrimaryButton onClick={() => setShowCreateModal(true)}>
              + Create New Pass
            </PrimaryButton>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Passes"
            value={stats.total}
            icon={
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            }
          />
          <StatCard
            title="Active Passes"
            value={stats.active}
            subtitle="Currently valid"
            icon={
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Expired"
            value={stats.expired}
            subtitle="Need renewal"
            icon={
              <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Revoked"
            value={stats.revoked}
            subtitle="Deactivated"
            icon={
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            }
          />
          <StatCard
            title="Total Usage"
            value={stats.totalUsage}
            subtitle="Times used"
            icon={
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            }
          />
        </div>

        {/* Filters & Search */}
        <Section title="All Passes" subtitle={`${filteredPasses.length} passes found`}>
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")}>
                All ({passes.length})
              </TabButton>
              <TabButton active={activeTab === "active"} onClick={() => setActiveTab("active")}>
                Active ({stats.active})
              </TabButton>
              <TabButton active={activeTab === "pending"} onClick={() => setActiveTab("pending")}>
                Pending
              </TabButton>
              <TabButton active={activeTab === "expired"} onClick={() => setActiveTab("expired")}>
                Expired ({stats.expired})
              </TabButton>
              <TabButton active={activeTab === "revoked"} onClick={() => setActiveTab("revoked")}>
                Revoked ({stats.revoked})
              </TabButton>
            </div>

            {/* Search */}
            <div className="max-w-md">
              <Input
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by employee name, email, or restaurant..."
              />
            </div>

            {/* Passes Table */}
            {filteredPasses.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-900">No passes found</p>
                <p className="text-xs text-slate-500 mt-1">
                  {searchQuery ? "Try adjusting your search" : "Create your first employee pass to get started"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Employee</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Restaurant</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Type</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Valid Period</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Usage</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Status</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPasses.map((pass) => {
                      const status = getPassStatus(pass);
                      return (
                        <tr key={pass.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <p className="text-sm font-medium text-slate-900">{pass.employee_name}</p>
                            <p className="text-xs text-slate-500">{pass.employee_email}</p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-sm text-slate-900">{pass.restaurant_name}</p>
                          </td>
                          <td className="py-3 px-4">
                            <Badge tone="blue">{pass.pass_type}</Badge>
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-xs text-slate-600">
                              {new Date(pass.valid_from).toLocaleDateString()} 
                            </p>
                            <p className="text-xs text-slate-500">
                              to {new Date(pass.valid_until).toLocaleDateString()}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-sm text-slate-900">{pass.times_used || 0} times</p>
                            <p className="text-xs text-slate-500">Max: {pass.max_usage_per_day}/day</p>
                          </td>
                          <td className="py-3 px-4">
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <SoftButton
                              onClick={() => {
                                setSelectedPass(pass);
                                setShowDetailsModal(true);
                              }}
                            >
                              View Details
                            </SoftButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* Create Pass Modal */}
      <Modal
        show={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetForm();
        }}
        title="Create New Pass"
      >
        <div className="space-y-5">
          <div>
            <Label>Select Employee *</Label>
            <Select
              value={selectedEmployee}
              onChange={setSelectedEmployee}
              placeholder="Choose an employee"
              options={employees.map(emp => ({
                value: emp.user_id,
                label: `${emp.name} (${emp.email})`,
              }))}
            />
          </div>

          <div>
            <Label>Select Restaurant *</Label>
            <Select
              value={selectedRestaurant}
              onChange={setSelectedRestaurant}
              placeholder="Choose a restaurant"
              options={restaurants.map(rest => ({
                value: rest.id,
                label: `${rest.name} - ${rest.area}, ${rest.city}`,
              }))}
            />
          </div>

          <div>
            <Label>Pass Type *</Label>
            <Select
              value={passType}
              onChange={setPassType}
              options={[
                { value: "single", label: "Single Use" },
                { value: "daily", label: "Daily" },
                { value: "monthly", label: "Monthly" },
                { value: "annual", label: "Annual" },
              ]}
            />
          </div>

          <div>
            <Label>Max Usage Per Day</Label>
            <Input
              type="number"
              value={maxUsagePerDay}
              onChange={setMaxUsagePerDay}
              placeholder="1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Valid From *</Label>
              <Input
                type="date"
                value={validFrom}
                onChange={setValidFrom}
              />
            </div>
            <div>
              <Label>Valid Until *</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={setValidUntil}
              />
            </div>
          </div>

          <div>
            <Label>Credit Limit (Optional)</Label>
            <Input
              type="number"
              value={creditLimit}
              onChange={setCreditLimit}
              placeholder="e.g. 500"
            />
            <p className="text-xs text-slate-500 mt-1">Leave empty for unlimited</p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <SoftButton onClick={() => {
              setShowCreateModal(false);
              resetForm();
            }}>
              Cancel
            </SoftButton>
            <PrimaryButton onClick={createPass}>
              Create Pass
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Pass Details Modal */}
      <Modal
        show={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedPass(null);
        }}
        title="Pass Details"
      >
        {selectedPass && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Employee</Label>
                <p className="text-sm font-medium text-slate-900">{selectedPass.employee_name}</p>
                <p className="text-xs text-slate-500">{selectedPass.employee_email}</p>
              </div>
              <div>
                <Label>Status</Label>
                <Badge tone={getPassStatus(selectedPass).tone}>
                  {getPassStatus(selectedPass).label}
                </Badge>
              </div>
            </div>

            <div>
              <Label>Restaurant</Label>
              <p className="text-sm text-slate-900">{selectedPass.restaurant_name}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Pass Type</Label>
                <p className="text-sm text-slate-900">{selectedPass.pass_type}</p>
              </div>
              <div>
                <Label>Max Usage/Day</Label>
                <p className="text-sm text-slate-900">{selectedPass.max_usage_per_day}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valid From</Label>
                <p className="text-sm text-slate-900">
                  {new Date(selectedPass.valid_from).toLocaleDateString()}
                </p>
              </div>
              <div>
                <Label>Valid Until</Label>
                <p className="text-sm text-slate-900">
                  {new Date(selectedPass.valid_until).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div>
              <Label>Total Times Used</Label>
              <p className="text-sm text-slate-900">{selectedPass.times_used || 0} times</p>
            </div>

            {selectedPass.credit_limit && (
              <div>
                <Label>Credit Limit</Label>
                <p className="text-sm text-slate-900">₹{selectedPass.credit_limit}</p>
              </div>
            )}

            <div>
              <Label>Created At</Label>
              <p className="text-sm text-slate-900">
                {new Date(selectedPass.created_at).toLocaleString()}
              </p>
            </div>

            {selectedPass.status === "active" && (
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <SoftButton onClick={() => setShowDetailsModal(false)}>
                  Close
                </SoftButton>
                <button
                  onClick={() => revokePass(selectedPass.id)}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 active:scale-[0.98] transition"
                >
                  Revoke Pass
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}