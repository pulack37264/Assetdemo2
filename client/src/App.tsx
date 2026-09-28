import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';
import type { Asset, Employee, Repair, DashboardStats, License, GatePass, AuthUser, TrackingHistory } from './api';
import {
  assignAsset,
  assignAssets,
  clearToken,
  completeRepair,
  createAsset,
  createEmployee,
  createRepair,
  deleteAssetInvoice,
  getDashboardStats,
  getInvoiceUrl,
  getMe,
  getNeedSetup,
  getToken,
  getTrackingHistory,
  listAssets,
  listEmployees,
  listRepairs,
  login,
  returnAsset,
  setupFirstAdmin,
  setToken,
  updateAsset,
  updateEmployee,
  uploadAssetInvoice,
  listLicenses,
  createLicense,
  updateLicense,
  deleteLicense,
  listGatePasses,
  createGatePass,
  updateGatePass,
  deleteGatePass,
} from './api';

type Tab = 'dashboard' | 'employees' | 'assets' | 'repairs' | 'licenses' | 'gatepasses' | 'tracking';

/** Returns remaining days until date (YYYY-MM-DD). Negative if past, 0 if today. */
function getRemainingDays(dateStr: string | null | undefined): number | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const expiry = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  const diffMs = expiry.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** Format ISO or YYYY-MM-DD date for display (e.g. "5 Mar 2026"). Returns — for empty. */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr || !dateStr.trim()) return '—';
  const d = new Date(dateStr.trim());
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [needSetup, setNeedSetup] = useState<boolean | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthChecking(false);
      setAuthUser(null);
      return;
    }
    getMe()
      .then((user) => {
        setAuthUser(user);
      })
      .catch(() => {
        setAuthUser(null);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  useEffect(() => {
    const onLogout = () => setAuthUser(null);
    window.addEventListener('auth-logout', onLogout);
    return () => window.removeEventListener('auth-logout', onLogout);
  }, []);

  useEffect(() => {
    if (authChecking || authUser) return;
    getNeedSetup().then(setNeedSetup).catch(() => setNeedSetup(true));
  }, [authChecking, authUser]);

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Employees state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [empError, setEmpError] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [branch, setBranch] = useState('');
  const [empSubmitting, setEmpSubmitting] = useState(false);
  const [empStep, setEmpStep] = useState<'form' | 'preview'>('form');
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');

  // Assets state
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetLoading, setAssetLoading] = useState(true);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [assetName, setAssetName] = useState('');
  const [assetType, setAssetType] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [vendor, setVendor] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [warrantyExpiry, setWarrantyExpiry] = useState('');
  const [assetInvoiceFile, setAssetInvoiceFile] = useState<File | null>(null);
  const [assetInvoiceNumber, setAssetInvoiceNumber] = useState('');
  const [removeAssetInvoice, setRemoveAssetInvoice] = useState(false);
  const [assetSubmitting, setAssetSubmitting] = useState(false);
  const [invoiceNumberByAsset, setInvoiceNumberByAsset] = useState<Record<number, string>>({});
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [selectedBulkAssetIds, setSelectedBulkAssetIds] = useState<number[]>([]);
  const [bulkEmployeeId, setBulkEmployeeId] = useState<number | ''>('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [returningId, setReturningId] = useState<number | null>(null);
  const [uploadingInvoiceId, setUploadingInvoiceId] = useState<number | null>(null);
  const [showAddAssetForm, setShowAddAssetForm] = useState(false);
  const [assetStep, setAssetStep] = useState<'form' | 'preview'>('form');
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [assetSearchQuery, setAssetSearchQuery] = useState('');
  const [assetSortBy, setAssetSortBy] = useState<'Name' | 'Type' | 'SerialNumber' | 'Status' | 'AssignedTo' | 'Vendor'>('Name');
  const [assetSortDir, setAssetSortDir] = useState<'asc' | 'desc'>('asc');
  // per-asset selected employee id so dropdowns are independent
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Record<number, number | ''>>({});

  // Repairs state
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [repairLoading, setRepairLoading] = useState(true);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [showLogRepairForm, setShowLogRepairForm] = useState(false);
  const [repairAssetId, setRepairAssetId] = useState<number | ''>('');
  const [repairAssetSearchQuery, setRepairAssetSearchQuery] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [repairVendor, setRepairVendor] = useState('');
  const [repairCost, setRepairCost] = useState('');
  const [repairSubmitting, setRepairSubmitting] = useState(false);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [repairSearchQuery, setRepairSearchQuery] = useState('');
  const [repairSearchApplied, setRepairSearchApplied] = useState('');

  // Dashboard state
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashSearchQuery, setDashSearchQuery] = useState('');

  // Licenses state
  const [licenses, setLicenses] = useState<License[]>([]);
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [licenseName, setLicenseName] = useState('');
  const [licenseVendor, setLicenseVendor] = useState('');
  const [licensePurchaseDate, setLicensePurchaseDate] = useState('');
  const [licenseExpiryDate, setLicenseExpiryDate] = useState('');
  const [licenseCost, setLicenseCost] = useState('');
  const [licenseSubmitting, setLicenseSubmitting] = useState(false);
  const [editingLicenseId, setEditingLicenseId] = useState<number | null>(null);

  // Gate passes state
  const [gatePasses, setGatePasses] = useState<GatePass[]>([]);
  const [gatePassLoading, setGatePassLoading] = useState(true);
  const [gatePassError, setGatePassError] = useState<string | null>(null);
  const [gateReference, setGateReference] = useState('');
  const [gatePassNumber, setGatePassNumber] = useState('');
  const [gateFrom, setGateFrom] = useState('');
  const [gateTo, setGateTo] = useState('');
  const [gateProductName, setGateProductName] = useState('');
  const [gateSelectedAssetId, setGateSelectedAssetId] = useState<number | ''>('');
  const [gateAssetSearchQuery, setGateAssetSearchQuery] = useState('');
  const [gateAssetMode, setGateAssetMode] = useState<'database' | 'manual'>('database');
 
  const [gatePersonName, setGatePersonName] = useState('');
  const [gateSerialNumber, setGateSerialNumber] = useState('');
  const [gateNotes, setGateNotes] = useState('');
  const [gateReceivedBy, setGateReceivedBy] = useState('');
  const [gateIssuedBy, setGateIssuedBy] = useState('');
  const [gateDate, setGateDate] = useState('');
  const [gateSubmitting, setGateSubmitting] = useState(false);
  const [editingGatePassId, setEditingGatePassId] = useState<number | null>(null);
  const [previewGatePassId, setPreviewGatePassId] = useState<number | null>(null);

  // Tracking history state
  const [trackingHistory, setTrackingHistory] = useState<TrackingHistory[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackingSearchQuery, setTrackingSearchQuery] = useState('');

  async function refreshEmployees() {
    try {
      setEmpError(null);
      setEmpLoading(true);
      const data = await listEmployees();
      setEmployees(data);
    } catch (e: any) {
      setEmpError(e.message ?? 'Failed to load employees');
    } finally {
      setEmpLoading(false);
    }
  }

  async function refreshAssets() {
    try {
      setAssetError(null);
      setAssetLoading(true);
      const data = await listAssets();
      setAssets(data);
    } catch (e: any) {
      setAssetError(e.message ?? 'Failed to load assets');
    } finally {
      setAssetLoading(false);
    }
  }

  async function refreshRepairs() {
    try {
      setRepairError(null);
      setRepairLoading(true);
      const data = await listRepairs();
      setRepairs(data);
    } catch (e: any) {
      setRepairError(e.message ?? 'Failed to load repairs');
    } finally {
      setRepairLoading(false);
    }
  }

  async function refreshDashboard() {
    try {
      setDashboardError(null);
      setDashboardLoading(true);
      const data = await getDashboardStats();
      setDashboardStats(data);
    } catch (e: any) {
      setDashboardError(e.message ?? 'Failed to load dashboard');
    } finally {
      setDashboardLoading(false);
    }
  }

  async function refreshTrackingHistory() {
    try {
      setTrackingError(null);
      setTrackingLoading(true);
      const data = await getTrackingHistory();
      setTrackingHistory(data);
    } catch (e: any) {
      setTrackingError(e.message ?? 'Failed to load tracking history');
    } finally {
      setTrackingLoading(false);
    }
  }

  useEffect(() => {
    if (!authUser) return;
    void refreshEmployees();
    void refreshAssets();
    void refreshRepairs();
    void refreshDashboard();
    void (async () => {
      try {
        setLicenseError(null);
        setLicenseLoading(true);
        const data = await listLicenses();
        setLicenses(data);
      } catch (e: any) {
        setLicenseError(e.message ?? 'Failed to load licenses');
      } finally {
        setLicenseLoading(false);
      }
      try {
        setGatePassError(null);
        setGatePassLoading(true);
        const data = await listGatePasses();
        setGatePasses(data);
      } catch (e: any) {
        setGatePassError(e.message ?? 'Failed to load gate passes');
      } finally {
        setGatePassLoading(false);
      }
    })();
  }, [authUser]);

  function openGatePassPrint(gp: GatePass) {
    const w = window.open('', '_blank', 'width=820,height=720');
    if (!w) return;
    const logoUrl = `${window.location.origin}/CBLlogo.jpg`;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Ref: - ${gp.ReferenceNumber ?? ''}</title>
  <style>
    * { box-sizing: border-box; }
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap');
    body {
      font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      margin: 0;
      padding: 0.75rem;
      background: #f1f5f9;
      color: #1e293b;
      font-size: 14px;
      line-height: 1.3;
    }
    .doc-wrap {
      max-width: 720px;
      margin: 0 auto;
      background: #fff;
      padding: 1rem 1rem 0.75rem;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      border: 1px solid #e2e8f0;
      position: relative;
    }
    .header {
      text-align: center;
      padding-bottom: 0.75rem;
      border-bottom: 2px solid #e2e8f0;
      margin-bottom: 0.75rem;
    }
    .header img { height: 40px; width: auto; display: block; margin: 0 auto 0.35rem; }
    .company {
      font-size: 1.1rem;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: 0.02em;
      margin: 0 0 0.15rem 0;
    }
    .address {
      font-size: 0.8rem;
      color: #64748b;
      margin: 0 0 0.5rem 0;
    }
    .doc-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
      letter-spacing: 0.02em;
    }
    .title-section {
      text-align: center;
      margin-bottom: 0.75rem;
      position: relative;
    }
    .title-left {
      text-align: center;
    }
    .reference-box {
      position: absolute;
      top: 1rem;
      right: 1rem;
      padding: 0;
      min-width: auto;
      text-align: right;
      font-size: 0.85rem;
      color: #1e293b;
      background: none;
      border: none;
    }
    .reference-label {
      display: none;
    }
    .reference-value {
      font-size: 0.9375rem;
      font-weight: 400;
      color: #1e293b;
      letter-spacing: 0.02em;
    }
    .pass-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #e2e8f0;
      font-size: 0.9375rem;
    }
    .pass-table td {
      border: 1px solid #e2e8f0;
      padding: 0.45rem 0.75rem;
      vertical-align: top;
    }
    .pass-table .label {
      width: 26%;
      font-weight: 600;
      background: #f8fafc;
      color: #475569;
    }
    .pass-table .value {
      background: #fff;
      color: #1e293b;
    }
    .received-row .value { padding: 0.85rem 1rem; }
    .received-split {
      display: flex;
      gap: 1.5rem;
    }
    .received-split > div { flex: 1; }
    .sub-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 0.35rem;
    }
    .name-value {
      font-size: 0.9375rem;
      color: #1e293b;
      min-height: 1.5rem;
      margin-bottom: 0.5rem;
    }
    .name-box {
      border: 1px solid #cbd5e1;
      min-height: 56px;
      background: #fafafa;
      border-radius: 4px;
      padding: 0.5rem 0.75rem;
      font-size: 0.9375rem;
      color: #1e293b;
    }
    .sign-box {
      border: 1px solid #cbd5e1;
      height: 56px;
      background: #fafafa;
      border-radius: 4px;
    }
    .sign-section {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #e2e8f0;
    }
    .sign-section .section-title { font-weight: 600; color: #475569; margin-bottom: 0.75rem; }
    .sign-section .prepared-block { margin-bottom: 1rem; }
    .sign-section .prepared-block .sub-label { margin-bottom: 0.25rem; }
    .sign-section .sign-box { width: 100%; max-width: 240px; height: 52px; }
    .nb {
      text-align: center;
      font-size: 0.7rem;
      color: #64748b;
      margin: 0.75rem 0 0 0;
      padding: 0.5rem 0.75rem;
      background: #f8fafc;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .actions { margin-top: 0.75rem; text-align: center; }
    .actions button {
      padding: 0.6rem 1.75rem;
      border-radius: 8px;
      border: none;
      background: #0f172a;
      color: #fff;
      font-weight: 600;
      font-size: 0.9375rem;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(15,23,42,0.2);
    }
    .actions button:hover { background: #1e293b; }
    @media print {
      body { background: #fff; padding: 0; }
      .doc-wrap { box-shadow: none; border: none; padding: 1.5rem; }
      .actions { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="doc-wrap">
    <div class="header">
      <img src="${logoUrl}" alt="City Brokerage" />
      <div class="company">City Brokerage Limited</div>
      <div class="address">Head Office, City Center, Unit-12A & 12B(Level-13),90/1 Motijheel C/A, Dhaka-1000.</div>
    </div>
    <div class="reference-box">
      <div class="reference-value">Ref : ${gp.ReferenceNumber ?? ''}</div>
    </div>
    <div class="title-section">
      <div class="title-left">
        <div class="doc-title">Gate Pass</div>
      </div>
    </div>
    <table class="pass-table">
      <tr><td class="label">Date</td><td class="value">${gp.PassDate ?? ''}</td></tr>
      <tr><td class="label">From</td><td class="value">${gp.GatePassFrom ?? gp.IssuedBy ?? ''}</td></tr>
      <tr><td class="label">To</td><td class="value">${gp.GatePassTo ?? gp.PersonName ?? gp.ReceivedBy ?? ''}</td></tr>
      <tr><td class="label">Sent Product</td><td class="value">${gp.ProductName ?? ''}</td></tr>
      <tr><td class="label">Product S/N</td><td class="value">${gp.SerialNumber ?? ''}</td></tr>
      <tr><td class="label">Reason</td><td class="value">${gp.Notes ?? ''}</td></tr>
      <tr class="received-row">
        <td class="label">Received by</td>
        <td class="value">
          <div class="received-split">
            <div>
              <div class="sub-label">Name</div>
              <div class="name-box">${gp.ReceivedBy ?? gp.PersonName ?? ''}</div>
            </div>
            <div>
              <div class="sub-label">Signature with date</div>
              <div class="sign-box"></div>
            </div>
          </div>
        </td>
      </tr>
    </table>
    <div class="sign-section">
      <div class="section-title">Prepared by</div>
      <div class="prepared-block">
        <div class="sub-label">Name</div>
        <div class="name-value">${gp.IssuedBy ?? ''}</div>
      </div>
      <div class="prepared-block">
        <div class="sub-label">Signature</div>
        <div class="sign-box"></div>
      </div>
    </div>
    <p class="nb">N.B. Please don't allow or consider this gate pass if there is no official seal with authorized signature.</p>
  </div>
  <div class="actions">
    <button onclick="window.print()">View PDF / Print</button>
  </div>
</body>
</html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // Dashboard: filter assets by name, serial number, type, vendor, status, or assigned employee
  const dashSearchLower = dashSearchQuery.trim().toLowerCase();
  const dashSearchResults = dashSearchLower
    ? assets.filter((a) => {
        const assignedName = a.AssignedToId
          ? employees.find((e) => e.Id === a.AssignedToId)?.Name?.toLowerCase() ?? ''
          : '';
        return (
          a.Name.toLowerCase().includes(dashSearchLower) ||
          a.SerialNumber.toLowerCase().includes(dashSearchLower) ||
          a.Type.toLowerCase().includes(dashSearchLower) ||
          a.Vendor.toLowerCase().includes(dashSearchLower) ||
          a.Status.toLowerCase().includes(dashSearchLower) ||
          assignedName.includes(dashSearchLower)
        );
      })
    : assets;
  const dashSearchCount = dashSearchResults.length;
  const dashSearchLimited = dashSearchResults.slice(0, 100);
  const dashSearchHasMore = dashSearchResults.length > 100;
  const dashShowNoResults = dashSearchLower.length > 0 && dashSearchResults.length === 0;
  const dashShowTooMany = dashSearchHasMore;
  const dashShowResults = dashSearchLower.length > 0;

  // Employee handlers
  function validateEmployee(): boolean {
    const idNum = employeeId.trim() ? parseInt(employeeId, 10) : NaN;
    if (isNaN(idNum) || idNum < 1 || !Number.isInteger(idNum)) {
      setEmpError('Employee ID is required and must be a positive integer.');
      return false;
    }
    if (!name || !email || !department) {
      setEmpError('Name, email and department are required.');
      return false;
    }
    setEmpError(null);
    return true;
  }

  async function submitEmployee() {
    if (!validateEmployee()) return;
    const idNum = parseInt(employeeId, 10);
    try {
      setEmpSubmitting(true);
      setEmpError(null);
      await createEmployee({ id: idNum, name, email, department, branch });
      setEmployeeId('');
      setName('');
      setEmail('');
      setDepartment('');
      setBranch('');
      setEmpStep('form');
      await refreshEmployees();
    } catch (e: any) {
      setEmpError(e.message ?? 'Failed to create employee');
    } finally {
      setEmpSubmitting(false);
    }
  }

  function onEmployeePreview(e: FormEvent) {
    e.preventDefault();
    if (validateEmployee()) setEmpStep('preview');
  }

  function startEditEmployee(emp: Employee) {
    setEditingEmployeeId(emp.Id);
    setEmployeeId(String(emp.Id));
    setName(emp.Name);
    setEmail(emp.Email);
    setDepartment(emp.Department);
    setBranch(emp.Branch ?? '');
    setEmpError(null);
  }

  async function saveEmployeeEdit() {
    if (editingEmployeeId == null) return;
    if (!validateEmployee()) return;
    try {
      setEmpSubmitting(true);
      setEmpError(null);
      await updateEmployee(editingEmployeeId, { name, email, department, branch });
      setEditingEmployeeId(null);
      setEmployeeId('');
      setName('');
      setEmail('');
      setDepartment('');
      setBranch('');
      await refreshEmployees();
    } catch (e: any) {
      setEmpError(e.message ?? 'Failed to update employee');
    } finally {
      setEmpSubmitting(false);
    }
  }

  // Asset handlers
  function validateAsset(): boolean {
    if (!assetName || !assetType || !serialNumber || !vendor || !purchaseDate) {
      setAssetError('Name, type, serial number, vendor and purchase date are required.');
      return false;
    }
    setAssetError(null);
    return true;
  }

  async function submitAsset() {
    if (!validateAsset()) return;
    try {
      setAssetSubmitting(true);
      setAssetError(null);
      await createAsset(
        {
          name: assetName,
          type: assetType,
          serialNumber,
          vendor,
          purchaseDate,
          warrantyExpiry: warrantyExpiry || null,
          status: 'Available',
        },
        assetInvoiceFile,
        assetInvoiceNumber || null
      );
      setAssetName('');
      setAssetType('');
      setSerialNumber('');
      setVendor('');
      setPurchaseDate('');
      setWarrantyExpiry('');
      setAssetInvoiceFile(null);
      setAssetInvoiceNumber('');
      setAssetStep('form');
      await refreshAssets();
    } catch (e: any) {
      setAssetError(e.message ?? 'Failed to create asset');
    } finally {
      setAssetSubmitting(false);
    }
  }

  function onAssetPreview(e: FormEvent) {
    e.preventDefault();
    if (validateAsset()) setAssetStep('preview');
  }

  function startEditAsset(asset: Asset) {
    setEditingAssetId(asset.Id);
    setShowAddAssetForm(true);
    setAssetStep('form');
    setAssetName(asset.Name);
    setAssetType(asset.Type);
    setSerialNumber(asset.SerialNumber);
    setVendor(asset.Vendor);
    setPurchaseDate(asset.PurchaseDate);
    setWarrantyExpiry(asset.WarrantyExpiry ?? '');
    setAssetInvoiceFile(null);
    setAssetInvoiceNumber(asset.InvoiceNumber ?? '');
    setRemoveAssetInvoice(false);
    setAssetError(null);
  }

  async function saveAssetEdit() {
    if (editingAssetId == null) return;
    if (!validateAsset()) return;
    try {
      setAssetSubmitting(true);
      setAssetError(null);
      await updateAsset(editingAssetId, {
        name: assetName,
        type: assetType,
        serialNumber,
        vendor,
        purchaseDate,
        warrantyExpiry: warrantyExpiry || null,
        status: assets.find((a) => a.Id === editingAssetId)?.Status ?? 'Available',
      });
      if (assetInvoiceFile) {
        await uploadAssetInvoice(editingAssetId, assetInvoiceFile, assetInvoiceNumber.trim() || null);
      } else if (removeAssetInvoice) {
        await deleteAssetInvoice(editingAssetId);
      }
      setEditingAssetId(null);
      setShowAddAssetForm(false);
      setAssetName('');
      setAssetType('');
      setSerialNumber('');
      setVendor('');
      setPurchaseDate('');
      setWarrantyExpiry('');
      setAssetInvoiceFile(null);
      setAssetInvoiceNumber('');
      setRemoveAssetInvoice(false);
      setAssetStep('form');
      await refreshAssets();
    } catch (e: any) {
      setAssetError(e.message ?? 'Failed to update asset');
    } finally {
      setAssetSubmitting(false);
    }
  }

  async function onAssign(assetId: number) {
    const selected = selectedEmployeeIds[assetId];
    if (!selected) {
      setAssetError('Please select an employee from the dropdown first.');
      return;
    }
    try {
      setAssigningId(assetId);
      setAssetError(null);
      await assignAsset(assetId, Number(selected));
      setSelectedEmployeeIds((prev) => ({ ...prev, [assetId]: '' }));
      await refreshAssets();
    } catch (e: any) {
      setAssetError(e.message ?? 'Failed to assign asset');
    } finally {
      setAssigningId(null);
    }
  }

  async function onAssignSelectedAssets() {
    if (selectedBulkAssetIds.length === 0 || !bulkEmployeeId) {
      setAssetError('Select available assets and an employee before assigning.');
      return;
    }
    try {
      setBulkAssigning(true);
      setAssetError(null);
      await assignAssets(selectedBulkAssetIds, Number(bulkEmployeeId));
      setSelectedBulkAssetIds([]);
      setBulkEmployeeId('');
      await refreshAssets();
    } catch (e: any) {
      setAssetError(e.message ?? 'Failed to assign selected assets');
    } finally {
      setBulkAssigning(false);
    }
  }

  async function onReturn(assetId: number, options?: { confirm?: boolean }) {
    const asset = assets.find((a) => a.Id === assetId);
    const emp = asset?.AssignedToId ? employees.find((e) => e.Id === asset.AssignedToId) : null;
    if (options?.confirm !== false && asset && emp) {
      if (!window.confirm(`Return "${asset.Name}" from ${emp.Name}? The asset will be available for reassignment.`)) return;
    }
    try {
      setReturningId(assetId);
      setAssetError(null);
      await returnAsset(assetId);
      await refreshAssets();
    } catch (e: any) {
      setAssetError(e.message ?? 'Failed to return asset');
    } finally {
      setReturningId(null);
    }
  }



  // Repair handlers
  async function onRepairSubmit(e: FormEvent) {
    e.preventDefault();
    if (!repairAssetId || !issueDescription.trim()) return;
    try {
      setRepairSubmitting(true);
      setRepairError(null);
      await createRepair({
        assetId: Number(repairAssetId),
        issueDescription: issueDescription.trim(),
        repairVendor: repairVendor.trim() || null,
        cost: repairCost !== '' ? Number(repairCost) : null,
      });
      setRepairAssetId('');
      setRepairAssetSearchQuery('');
      setIssueDescription('');
      setRepairVendor('');
      setRepairCost('');
      setShowLogRepairForm(false);
      await refreshRepairs();
      await refreshAssets();
    } catch (e: any) {
      setRepairError(e.message ?? 'Failed to create repair');
    } finally {
      setRepairSubmitting(false);
    }
  }

  async function onCompleteRepair(id: number) {
    try {
      setCompletingId(id);
      setRepairError(null);
      await completeRepair(id);
      await refreshRepairs();
      await refreshAssets();
    } catch (e: any) {
      setRepairError(e.message ?? 'Failed to complete repair');
    } finally {
      setCompletingId(null);
    }
  }

  function onRepairSearch(e: FormEvent) {
    e.preventDefault();
    setRepairSearchApplied(repairSearchQuery.trim());
  }

  const repairSearchLower = repairSearchApplied.toLowerCase();
  const filteredRepairs = repairSearchLower
    ? repairs.filter((r) => {
        const assetName = (r.AssetName ?? '').toLowerCase();
        const assetSerial = (r.AssetSerial ?? '').toLowerCase();
        const issue = (r.IssueDescription ?? '').toLowerCase();
        const vendor = (r.RepairVendor ?? '').toLowerCase();
        const status = (r.Status ?? '').toLowerCase();
        const start = (r.StartDate ?? '').toLowerCase();
        const completed = (r.CompletedDate ?? '').toLowerCase();
        const cost = r.Cost != null ? String(r.Cost) : '';
        return (
          assetName.includes(repairSearchLower) ||
          assetSerial.includes(repairSearchLower) ||
          issue.includes(repairSearchLower) ||
          vendor.includes(repairSearchLower) ||
          status.includes(repairSearchLower) ||
          start.includes(repairSearchLower) ||
          completed.includes(repairSearchLower) ||
          cost.includes(repairSearchLower)
        );
      })
    : repairs;
  const editingAsset = editingAssetId != null ? assets.find((a) => a.Id === editingAssetId) ?? null : null;

  if (authChecking) {
    return (
      <div className="app">
        <div className="login-screen">
          <p>Checking login…</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="app">
        <div className="login-screen">
          <div className="login-card">
            <img src="/CBLlogo.jpg" alt="City Brokerage" className="login-logo" />
            <h1>Assets Management</h1>
            {needSetup === null ? (
              <p style={{ margin: '1rem 0' }}>Loading…</p>
            ) : needSetup ? (
              <>
                <h2>Create admin account</h2>
                <p className="login-hint">No admin exists yet. Create the first account to sign in.</p>
                <form
                  onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const un = (form.querySelector('[name="username"]') as HTMLInputElement)?.value?.trim() ?? '';
                    const pw = (form.querySelector('[name="password"]') as HTMLInputElement)?.value ?? '';
                    if (!un || !pw) {
                      setLoginError('Username and password are required');
                      return;
                    }
                    if (pw.length < 6) {
                      setLoginError('Password must be at least 6 characters');
                      return;
                    }
                    setLoginError(null);
                    setLoginSubmitting(true);
                    try {
                      const { token, user } = await setupFirstAdmin(un, pw);
                      setToken(token);
                      setAuthUser(user);
                    } catch (err: unknown) {
                      setLoginError(err instanceof Error ? err.message : 'Setup failed');
                    } finally {
                      setLoginSubmitting(false);
                    }
                  }}
                >
                  {loginError && <p className="error">{loginError}</p>}
                  <label>
                    Username
                    <input name="username" type="text" autoComplete="username" required disabled={loginSubmitting} />
                  </label>
                  <label>
                    Password (min 6 characters)
                    <input name="password" type="password" autoComplete="new-password" required disabled={loginSubmitting} minLength={6} />
                  </label>
                  <button type="submit" disabled={loginSubmitting}>
                    {loginSubmitting ? 'Creating…' : 'Create admin'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2>Admin login</h2>
                <form
                  onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const un = (form.querySelector('[name="username"]') as HTMLInputElement)?.value?.trim() ?? '';
                    const pw = (form.querySelector('[name="password"]') as HTMLInputElement)?.value ?? '';
                    if (!un || !pw) {
                      setLoginError('Username and password are required');
                      return;
                    }
                    setLoginError(null);
                    setLoginSubmitting(true);
                    try {
                      const { token, user } = await login(un, pw);
                      setToken(token);
                      setAuthUser(user);
                    } catch (err: unknown) {
                      setLoginError(err instanceof Error ? err.message : 'Login failed');
                    } finally {
                      setLoginSubmitting(false);
                    }
                  }}
                >
                  {loginError && <p className="error">{loginError}</p>}
                  <label>
                    Username
                    <input name="username" type="text" autoComplete="username" required disabled={loginSubmitting} />
                  </label>
                  <label>
                    Password
                    <input name="password" type="password" autoComplete="current-password" required disabled={loginSubmitting} />
                  </label>
                  <button type="submit" disabled={loginSubmitting}>
                    {loginSubmitting ? 'Signing in…' : 'Sign in'}
                  </button>
                </form>
              </>
            )}
          </div>
          <footer className="app-footer">
            Developed By CBL Information Technology Department
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <img src="/CBLlogo.jpg" alt="City Brokerage - making sense of your investment" className="header-logo-img" />
          <h1> Assets Management</h1>
        </div>
        <div className="header-right">
          <span className="header-user">Logged in as {authUser.username}</span>
          <button type="button" className="logout-btn" onClick={() => { clearToken(); setAuthUser(null); }}>
            Logout
          </button>
          <nav className="tabs">
            <button
              type="button"
              className={activeTab === 'dashboard' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('dashboard')}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={activeTab === 'employees' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('employees')}
            >
              Employees
            </button>
            <button
              type="button"
              className={activeTab === 'assets' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('assets')}
            >
              Assets
            </button>
            <button
              type="button"
              className={activeTab === 'repairs' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('repairs')}
            >
              Repairs
            </button>
            <button
              type="button"
              className={activeTab === 'licenses' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('licenses')}
            >
              Licenses
            </button>
            <button
              type="button"
              className={activeTab === 'gatepasses' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('gatepasses')}
            >
              Gate pass
            </button>
            <button
              type="button"
              className={activeTab === 'tracking' ? 'tab active' : 'tab'}
              onClick={() => { setActiveTab('tracking'); void refreshTrackingHistory(); }}
            >
              Tracking
            </button>
          </nav>
        </div>
      </header>

      {activeTab === 'dashboard' && (
        <main className="app-main dashboard-main">
          {dashboardLoading ? (
            <p>Loading dashboard…</p>
          ) : dashboardError ? (
            <p className="error">{dashboardError}</p>
          ) : dashboardStats ? (
            <>
              <section className="dashboard-grid">
                <div className={dashShowResults ? 'card card-wide' : 'card'}>
                  <h2>Asset search</h2>
                  <p className="dashboard-search-hint">Search by name, serial number, type, vendor, status, or assigned employee.</p>
                  <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
                    <label>
                      Search
                      <input
                        type="search"
                        value={dashSearchQuery}
                        onChange={(e) => setDashSearchQuery(e.target.value)}
                        placeholder="Name, serial, type, vendor, status…"
                        autoComplete="off"
                      />
                    </label>
                  </div>
                  {dashShowNoResults && (
                    <p className="error">No assets match your search.</p>
                  )}
                  {dashSearchCount > 0 && (
                    <p className="dashboard-result-count">
                      {dashSearchCount} asset{dashSearchCount !== 1 ? 's' : ''} found
                      {dashShowTooMany ? ' (showing first 100)' : ''}.
                    </p>
                  )}
                  {dashShowResults && dashSearchResults.length > 0 && (
                    <div className="dashboard-table-wrap" style={{ marginTop: '0.75rem' }}>
                      <table className="table dashboard-results-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Serial</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Vendor</th>
                            <th>Warranty expiry</th>
                            <th>Assigned to</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashSearchLimited.map((asset) => (
                            <tr
                              key={asset.Id}
                              style={{ cursor: 'pointer' }}
                              onClick={() => { setActiveTab('assets'); setSelectedAssetId(asset.Id); }}
                            >
                              <td>{asset.Name}</td>
                              <td>{asset.SerialNumber}</td>
                              <td>{asset.Type}</td>
                              <td>{asset.Status}</td>
                              <td>{asset.Vendor}</td>
                              <td>{asset.WarrantyExpiry ?? '—'}</td>
                              <td>
                                {asset.AssignedToId
                                  ? (() => {
                                      const emp = employees.find((e) => e.Id === asset.AssignedToId);
                                      return emp ? emp.Name : '—';
                                    })()
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="card">
                  <h2>Assets by status</h2>
                  <div className="card-scroll">
                    <ul className="stat-list">
                      <li>Available: {dashboardStats.assetsByStatus?.Available ?? 0}</li>
                      <li>Assigned: {dashboardStats.assetsByStatus?.Assigned ?? 0}</li>
                      <li>In Repair: {dashboardStats.assetsByStatus?.['In Repair'] ?? 0}</li>
                    </ul>
                  </div>
                </div>
                <div className="card">
                  <h2>Asset warranty expiry</h2>
                  {!dashboardStats.upcomingWarranties?.length ? (
                    <p>No upcoming warranty expirations.</p>
                  ) : (
                    <div className="card-scroll">
                    <ul className="warranty-list">
                      {dashboardStats.upcomingWarranties.map((a) => {
                        const days = getRemainingDays(a.ExpiryDate);
                        const daysText = days !== null
                          ? days < 0
                            ? ` (${Math.abs(days)} days ago)`
                            : days === 0
                              ? ' (today)'
                              : ` (${days} days left)`
                          : '';
                        return (
                          <li key={a.Id}>
                            <strong>{a.Name}</strong> – Serial: <strong>{a.SerialNumber || '—'}</strong> – {a.Vendor} – Expiry: <strong>{a.ExpiryDate}</strong>{daysText}
                          </li>
                        );
                      })}
                    </ul>
                    </div>
                  )}
                </div>
                <div className="card">
                  <h2>License expiry</h2>
                  {licenses.filter((l) => l.ExpiryDate).length === 0 ? (
                    <p>No licenses with expiry dates.</p>
                  ) : (
                    <div className="card-scroll">
                    <ul className="warranty-list">
                      {[...licenses]
                        .filter((l) => l.ExpiryDate)
                        .sort((a, b) => a.ExpiryDate.localeCompare(b.ExpiryDate))
                        .map((lic) => {
                          const days = getRemainingDays(lic.ExpiryDate);
                          const daysText = days !== null
                            ? days < 0
                              ? ` (${Math.abs(days)} days ago)`
                              : days === 0
                                ? ' (today)'
                                : ` (${days} days left)`
                            : '';
                          return (
                            <li key={lic.Id}>
                              <strong>{lic.Name}</strong> – {lic.Vendor} – Expiry: <strong>{lic.ExpiryDate}</strong>{daysText}
                            </li>
                          );
                        })}
                    </ul>
                    </div>
                  )}
                </div>
                {/* Recent repair activity removed from dashboard */}
              </section>
            </>
          ) : null}
        </main>
      )}
      {activeTab === 'employees' && (
        <main className="app-main">
          <section className="card">
            <h2>{editingEmployeeId != null ? 'Edit employee' : 'Add employee'}</h2>
            {editingEmployeeId != null ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveEmployeeEdit();
                }}
                className="form-grid"
              >
                <label>
                  Employee ID (read-only)
                  <input type="number" value={employeeId} readOnly disabled style={{ opacity: 0.8 }} />
                </label>
                <label>
                  Name
                  <input value={name} onChange={(e) => setName(e.target.value)} required />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Department
                  <input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Branch
                  <input
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="e.g. HQ, North, Remote"
                  />
                </label>
                <label>
                  Assign date
                  <input
                    type="text"
                    value={editingEmployeeId != null ? formatDate(employees.find((e) => e.Id === editingEmployeeId)?.AssignedDate) : '—'}
                    readOnly
                    disabled
                    style={{ opacity: 0.9 }}
                  />
                </label>
                <div className="preview-actions">
                  <button type="button" onClick={() => { setEditingEmployeeId(null); setEmpError(null); }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={empSubmitting}>
                    {empSubmitting ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            ) : empStep === 'form' ? (
              <form onSubmit={onEmployeePreview} className="form-grid">
                <label>
                  Employee ID 
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="e.g. 1001"
                    required
                  />
                </label>
                <label>
                  Name
                  <input value={name} onChange={(e) => setName(e.target.value)} required />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Department
                  <input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Branch
                  <input
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="e.g. HQ, North, Remote"
                  />
                </label>
                <button type="submit">Preview</button>
              </form>
            ) : (
              <div className="preview-card">
                <h3>Preview</h3>
                <dl className="preview-dl">
                  <dt>Employee ID</dt><dd>{employeeId}</dd>
                  <dt>Name</dt><dd>{name}</dd>
                  <dt>Email</dt><dd>{email}</dd>
                  <dt>Department</dt><dd>{department}</dd>
                  <dt>Branch</dt><dd>{branch || '—'}</dd>
                </dl>
                <div className="preview-actions">
                  <button type="button" onClick={() => setEmpStep('form')}>Edit</button>
                  <button type="button" onClick={() => submitEmployee()} disabled={empSubmitting}>
                    {empSubmitting ? 'Saving…' : 'Add employee'}
                  </button>
                </div>
              </div>
            )}
          </section>

         <section className="card employee-card">
            <h2>Employees</h2>

            {empLoading ? (
              <p>Loading…</p>
            ) : employees.length === 0 ? (
              <p>No employees yet.</p>
            ) : (
              <>
                <div className="form-grid" style={{ marginBottom: '1rem' }}>
                  <label>
                    Search employees
                    <input
                      type="search"
                      value={employeeSearchQuery}
                      onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                      placeholder="Name, email, department, branch, ID…"
                      autoComplete="off"
                    />
                  </label>
                </div>

                {(() => {
                  const searchLower = employeeSearchQuery.trim().toLowerCase();
                  const filteredEmployees = searchLower
                    ? employees.filter((emp) => {
                        return (
                          String(emp.Id).includes(searchLower) ||
                          (emp.Name ?? '').toLowerCase().includes(searchLower) ||
                          (emp.Email ?? '').toLowerCase().includes(searchLower) ||
                          (emp.Department ?? '').toLowerCase().includes(searchLower) ||
                          (emp.Branch ?? '').toLowerCase().includes(searchLower)
                        );
                      })
                    : employees;

                  return (
                    <>
                      <p style={{ fontSize: '0.9rem', color: '#666', margin: '0 0 0.75rem 0' }}>
                        Showing {filteredEmployees.length} of {employees.length} employees
                      </p>

                      <div className="employee-table-wrap">
                        <table className="table" style={{ width: "100%" }}>
                          <thead
                            style={{
                              position: "sticky",
                              top: 0,
                              background: "#fff",
                              zIndex: 1,
                            }}
                          >
                            <tr>
                              <th>Employee ID</th>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Department</th>
                              <th>Branch</th>
                              <th style={{ whiteSpace: "nowrap" }}>Assign date</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {filteredEmployees.map((emp) => (
                              <tr
                                key={emp.Id}
                                style={{ cursor: "pointer" }}
                                onClick={() => setSelectedEmployeeId(emp.Id)}
                              >
                                <td>{emp.Id}</td>
                                <td>{emp.Name}</td>
                                <td>{emp.Email}</td>
                                <td>{emp.Department}</td>
                                <td>{emp.Branch ?? "—"}</td>
                                <td>{formatDate(emp.AssignedDate)}</td>
                                <td onClick={(e) => e.stopPropagation()}>
                                  <button type="button" onClick={() => startEditEmployee(emp)}>
                                    Edit
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </>
            )}

            {empError && <p className="error">{empError}</p>}
          </section>
          {selectedEmployeeId != null && (() => {
            const emp = employees.find((e) => e.Id === selectedEmployeeId);
            if (!emp) return null;
            const assignedAssets = assets.filter((a) => a.AssignedToId === emp.Id);
            return (
              <div className="modal-overlay" onClick={() => setSelectedEmployeeId(null)}>
                <div className="modal-card employee-modal-card" onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3>Employee details</h3>
                    <button type="button" onClick={() => setSelectedEmployeeId(null)}>
                      Close
                    </button>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      gap: '0.5rem 1.5rem',
                      marginBottom: '1rem',
                    }}
                  >
                    <strong>Employee ID</strong><span>{emp.Id}</span>
                    <strong>Name</strong><span>{emp.Name}</span>
                    <strong>Email</strong><span>{emp.Email}</span>
                    <strong>Department</strong><span>{emp.Department}</span>
                    <strong>Branch</strong><span>{emp.Branch || '—'}</span>
                    <strong>Assign date</strong><span>{formatDate(emp.AssignedDate)}</span>
                  </div>
                  <h4>Assigned assets</h4>
                  {assignedAssets.length === 0 ? (
                    <p style={{ marginTop: '0.5rem' }}>This employee has no assigned assets.</p>
                  ) : (
                    <div className="modal-table-wrap employee-modal-table-wrap" style={{ marginTop: '0.5rem' }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Serial</th>
                            <th>Status</th>
                            <th>Vendor</th>
                            <th style={{ whiteSpace: 'nowrap' }}>Assign date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignedAssets.map((a) => (
                            <tr
                              key={a.Id}
                              style={{ cursor: 'pointer' }}
                              onClick={() => {
                                setSelectedEmployeeId(null);
                                setActiveTab('assets');
                                setSelectedAssetId(a.Id);
                              }}
                            >
                              <td>{a.Name}</td>
                              <td>{a.Type}</td>
                              <td>{a.SerialNumber}</td>
                              <td>{a.Status}</td>
                              <td>{a.Vendor}</td>
                              <td>{formatDate(emp.AssignedDate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </main>
      )}
      {activeTab === 'assets' && (
        <main className="app-main assets-full-page">
          <div className="assets-actions-corner">
            <button
              type="button"
              className={!showAddAssetForm ? 'tab active' : 'tab'}
              onClick={() => setShowAddAssetForm(false)}
              style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #fecaca', cursor: 'pointer', fontWeight: 500, background: !showAddAssetForm ? '#dc2626' : 'transparent', color: !showAddAssetForm ? 'white' : '#6b7280' }}
            >
              View assets
            </button>
            <button
              type="button"
              className={showAddAssetForm ? 'tab active' : 'tab'}
              onClick={() => setShowAddAssetForm(true)}
              style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #fecaca', cursor: 'pointer', fontWeight: 500, background: showAddAssetForm ? '#dc2626' : 'transparent', color: showAddAssetForm ? 'white' : '#6b7280' }}
            >
              Add asset
            </button>
          </div>

          {showAddAssetForm && (
          <section className="card">
            <h2>{editingAssetId != null ? 'Edit asset' : 'Add asset'}</h2>
            {editingAssetId != null ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveAssetEdit();
                }}
                className="form-grid"
              >
                <label>
                  Name
                  <input value={assetName} onChange={(e) => setAssetName(e.target.value)} required />
                </label>
                <label>
                  Type
                  <input
                    value={assetType}
                    onChange={(e) => setAssetType(e.target.value)}
                    placeholder="Enter asset type"
                    required
                  />
                </label>
                <label>
                  Serial number
                  <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} required />
                </label>
                <label>
                  Vendor
                  <input value={vendor} onChange={(e) => setVendor(e.target.value)} required />
                </label>
                <label>
                  Purchase date
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                    required
                  />
                </label>
                <label>
                  Warranty expiry
                  <input
                    type="date"
                    value={warrantyExpiry}
                    onChange={(e) => setWarrantyExpiry(e.target.value)}
                    onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  />
                </label>
                <label>
                  Invoice number
                  <input
                    type="text"
                    value={assetInvoiceNumber}
                    onChange={(e) => setAssetInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-001"
                  />
                </label>
                <div>
                  <strong>Current invoice</strong>
                  <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {editingAsset?.InvoicePath && !removeAssetInvoice ? (
                      <>
                        <a href={getInvoiceUrl(editingAsset.Id)} target="_blank" rel="noopener noreferrer">
                          View current PDF
                        </a>
                        <button
                          type="button"
                          onClick={() => setRemoveAssetInvoice(true)}
                          style={{ marginTop: 0 }}
                        >
                          Remove PDF
                        </button>
                      </>
                    ) : removeAssetInvoice ? (
                      <>
                        <span>Current PDF will be removed when you save.</span>
                        <button
                          type="button"
                          onClick={() => setRemoveAssetInvoice(false)}
                          style={{ marginTop: 0 }}
                        >
                          Undo remove
                        </button>
                      </>
                    ) : (
                      <span>No PDF uploaded.</span>
                    )}
                  </div>
                </div>
                <label>
                  New PDF (optional)
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => setAssetInvoiceFile(e.target.files?.[0] ?? null)}
                  />
                  {assetInvoiceFile && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.9em' }}>
                      {assetInvoiceFile.name}
                    </span>
                  )}
                </label>
                <div className="preview-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAssetId(null);
                      setShowAddAssetForm(false);
                      setAssetError(null);
                      setAssetName('');
                      setAssetType('');
                      setSerialNumber('');
                      setVendor('');
                      setPurchaseDate('');
                      setWarrantyExpiry('');
                      setAssetInvoiceFile(null);
                      setAssetInvoiceNumber('');
                      setRemoveAssetInvoice(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={assetSubmitting}>
                    {assetSubmitting ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            ) : assetStep === 'form' ? (
              <form onSubmit={onAssetPreview} className="form-grid">
                <label>
                  Name
                  <input value={assetName} onChange={(e) => setAssetName(e.target.value)} required />
                </label>
                <label>
                  Type
                  <input
                    value={assetType}
                    onChange={(e) => setAssetType(e.target.value)}
                    placeholder="Enter asset type"
                    required
                  />
                </label>
                <label>
                  Serial number
                  <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} required />
                </label>
                <label>
                  Vendor
                  <input value={vendor} onChange={(e) => setVendor(e.target.value)} required />
                </label>
                <label>
                  Purchase date
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                    required
                  />
                </label>
                <label>
                  Warranty expiry
                  <input
                    type="date"
                    value={warrantyExpiry}
                    onChange={(e) => setWarrantyExpiry(e.target.value)}
                    onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  />
                </label>
                <label>
                  Invoice number (optional)
                  <input
                    type="text"
                    value={assetInvoiceNumber}
                    onChange={(e) => setAssetInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-001"
                  />
                </label>
                <label>
                  Invoice (PDF, optional)
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => setAssetInvoiceFile(e.target.files?.[0] ?? null)}
                  />
                  {assetInvoiceFile && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.9em' }}>
                      {assetInvoiceFile.name}
                    </span>
                  )}
                </label>
                <button type="submit">Preview</button>
              </form>
            ) : (
              <div className="preview-card">
                <h3>Preview</h3>
                <dl className="preview-dl">
                  <dt>Name</dt><dd>{assetName}</dd>
                  <dt>Type</dt><dd>{assetType}</dd>
                  <dt>Serial number</dt><dd>{serialNumber}</dd>
                  <dt>Vendor</dt><dd>{vendor}</dd>
                  <dt>Purchase date</dt><dd>{purchaseDate}</dd>
                  <dt>Warranty expiry</dt><dd>{warrantyExpiry || '—'}</dd>
                  <dt>Invoice number</dt><dd>{assetInvoiceNumber || '—'}</dd>
                  <dt>Invoice PDF</dt><dd>{assetInvoiceFile ? assetInvoiceFile.name : '—'}</dd>
                </dl>
                <div className="preview-actions">
                  <button type="button" onClick={() => setAssetStep('form')}>Edit</button>
                  <button type="button" onClick={() => submitAsset()} disabled={assetSubmitting}>
                    {assetSubmitting ? 'Saving…' : 'Add asset'}
                  </button>
                </div>
              </div>
            )}
          </section>
          )}

          {!showAddAssetForm && (
          <div className="assets-table-wrap">
          <section className="card">
            <h2>Assets</h2>
            {selectedAssetId != null ? (
              (() => {
                const asset = assets.find((a) => a.Id === selectedAssetId);
                if (!asset) return <p>Asset not found.</p>;
                const assignedTo = asset.AssignedToId ? employees.find((e) => e.Id === asset.AssignedToId)?.Name ?? 'Unknown' : '—';
                const assignedEmp = asset.AssignedToId ? employees.find((e) => e.Id === asset.AssignedToId) : null;
                return (
                  <div>
                    <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => setSelectedAssetId(null)}>
                        ← Back to list
                      </button>
                      <button type="button" onClick={() => { startEditAsset(asset); setSelectedAssetId(null); }}>
                        Edit
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1.5rem', maxWidth: '32rem' }}>
                      <strong>Name</strong><span>{asset.Name}</span>
                      <strong>Type</strong><span>{asset.Type}</span>
                      <strong>Serial number</strong><span>{asset.SerialNumber}</span>
                      <strong>Status</strong><span>{asset.Status}</span>
                      <strong>Assigned to</strong><span>{assignedTo}</span>
                      <strong>Branch</strong>
                      <span>{assignedEmp?.Branch ?? '—'}</span>
                      <strong>Vendor</strong><span>{asset.Vendor}</span>
                      <strong>Purchase date</strong><span>{asset.PurchaseDate}</span>
                      <strong>Warranty expiry</strong><span>{asset.WarrantyExpiry ?? '—'}</span>
                      <strong>Invoice number</strong><span>{asset.InvoiceNumber ?? '—'}</span>
                      <strong>Invoice</strong>
                      <span>
                        {asset.InvoicePath ? (
                          <a href={getInvoiceUrl(asset.Id)} target="_blank" rel="noopener noreferrer">
                            View invoice PDF
                          </a>
                        ) : '—'}
                      </span>
                    </div>
                    <div className="asset-assignment-section">
                      <h3>Assignment</h3>
                      {asset.Status === 'Available' && (
                        <div className="assignment-form">
                          <label>
                            Assign to employee
                            <select
                              value={selectedEmployeeIds[asset.Id] ?? ''}
                              onChange={(e) =>
                                setSelectedEmployeeIds((prev) => ({
                                  ...prev,
                                  [asset.Id]: e.target.value ? Number(e.target.value) : '',
                                }))
                              }
                              aria-label="Choose employee to assign"
                            >
                              <option value="">Select employee…</option>
                              {employees.map((emp) => (
                                <option key={emp.Id} value={emp.Id}>
                                  {emp.Name} (ID {emp.Id}) · {emp.Department}{emp.Branch ? ` · ${emp.Branch}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="assignment-actions">
                            <button
                              type="button"
                              onClick={() => onAssign(asset.Id)}
                              disabled={assigningId === asset.Id || !selectedEmployeeIds[asset.Id]}
                            >
                              {assigningId === asset.Id ? 'Assigning…' : 'Assign to employee'}
                            </button>
                          </div>
                          {!selectedEmployeeIds[asset.Id] && (
                            <p className="assignment-hint">Select an employee above, then click Assign.</p>
                          )}
                        </div>
                      )}
                      {asset.Status === 'Assigned' && (
                        <div className="assignment-form">
                          <p className="assignment-current">
                            Currently assigned to{' '}
                            {assignedEmp ? (
                              <><strong>{assignedEmp.Name}</strong>{assignedEmp.Department && ` (${assignedEmp.Department})`}{assignedEmp.Branch && ` · ${assignedEmp.Branch}`}</>
                            ) : (
                              <strong>Unknown (ID {asset.AssignedToId})</strong>
                            )}
                          </p>
                          <div className="assignment-actions">
                            <button
                              type="button"
                              className="return-btn"
                              onClick={() => onReturn(asset.Id)}
                              disabled={returningId === asset.Id}
                            >
                              {returningId === asset.Id ? 'Returning…' : 'Return asset'}
                            </button>
                          </div>
                        </div>
                      )}
                      {asset.Status === 'In Repair' && (
                        <p className="assignment-hint">This asset is in repair. Return it from the repair flow when done, then you can assign it.</p>
                      )}

                    </div>
                  </div>
                );
              })()
            ) : assetLoading ? (
              <p>Loading…</p>
            ) : assets.length === 0 ? (
              <p>No assets yet.</p>
            ) : (
              <>
                <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="search"
                    placeholder="Search by Name, Type, Serial, Status, Assigned to, Vendor…"
                    value={assetSearchQuery}
                    onChange={(e) => setAssetSearchQuery(e.target.value)}
                    style={{ flex: '1', minWidth: '12rem', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #fca5a5', background: '#fff', color: '#1f2937' }}
                  />
                </div>
                <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>{selectedBulkAssetIds.length} available asset{selectedBulkAssetIds.length === 1 ? '' : 's'} selected</span>
                  <select
                    value={bulkEmployeeId}
                    onChange={(e) => setBulkEmployeeId(e.target.value ? Number(e.target.value) : '')}
                    aria-label="Choose employee for selected assets"
                  >
                    <option value="">Assign selected to…</option>
                    {employees.map((emp) => (
                      <option key={emp.Id} value={emp.Id}>{emp.Name} (ID {emp.Id})</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={onAssignSelectedAssets}
                    disabled={bulkAssigning || selectedBulkAssetIds.length === 0 || !bulkEmployeeId}
                  >
                    {bulkAssigning ? 'Assigning…' : 'Assign selected'}
                  </button>
                  {selectedBulkAssetIds.length > 0 && (
                    <button type="button" onClick={() => setSelectedBulkAssetIds([])} disabled={bulkAssigning}>
                      Clear selection
                    </button>
                  )}
                </div>
                {(() => {
                  const q = assetSearchQuery.trim().toLowerCase();
                  const filtered = q
                    ? assets.filter((a) => {
                        const assignedName = a.AssignedToId ? employees.find((e) => e.Id === a.AssignedToId)?.Name ?? '' : '';
                        return (
                          a.Name.toLowerCase().includes(q) ||
                          a.Type.toLowerCase().includes(q) ||
                          a.SerialNumber.toLowerCase().includes(q) ||
                          a.Status.toLowerCase().includes(q) ||
                          assignedName.toLowerCase().includes(q) ||
                          a.Vendor.toLowerCase().includes(q)
                        );
                      })
                    : assets;
                  const sorted = [...filtered].sort((a, b) => {
                    let va: string | number = '';
                    let vb: string | number = '';
                    if (assetSortBy === 'AssignedTo') {
                      va = a.AssignedToId ? employees.find((e) => e.Id === a.AssignedToId)?.Name ?? '' : '';
                      vb = b.AssignedToId ? employees.find((e) => e.Id === b.AssignedToId)?.Name ?? '' : '';
                    } else {
                      va = a[assetSortBy] ?? '';
                      vb = b[assetSortBy] ?? '';
                    }
                    const cmp = String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' });
                    return assetSortDir === 'asc' ? cmp : -cmp;
                  });
                  const displayAssets = sorted;
                  const sortTh = (col: typeof assetSortBy, label: string) => (
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                      onClick={() => {
                        setAssetSortBy(col);
                        setAssetSortDir((d) => (assetSortBy === col ? (d === 'asc' ? 'desc' : 'asc') : 'asc'));
                      }}
                    >
                      {label} {assetSortBy === col ? (assetSortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                  );
                  return (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th aria-label="Select asset" />
                      {sortTh('Name', 'Name')}
                      {sortTh('Type', 'Type')}
                      {sortTh('SerialNumber', 'Serial')}
                      {sortTh('Status', 'Status')}
                      {sortTh('AssignedTo', 'Assigned to')}
                      {sortTh('Vendor', 'Vendor')}
                      <th>Purchase</th>
                      <th>Warranty</th>
                      <th>Invoice</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {displayAssets.length === 0 ? (
                      <tr><td colSpan={11} style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280' }}>No assets match your search.</td></tr>
                    ) : displayAssets.map((asset) => (
                      <tr
                        key={asset.Id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedAssetId(asset.Id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${asset.Name} for assignment`}
                            checked={selectedBulkAssetIds.includes(asset.Id)}
                            disabled={asset.Status !== 'Available' || bulkAssigning}
                            onChange={(e) => setSelectedBulkAssetIds((current) => (
                              e.target.checked
                                ? [...current, asset.Id]
                                : current.filter((id) => id !== asset.Id)
                            ))}
                          />
                        </td>
                        <td>{asset.Name}</td>
                        <td>{asset.Type}</td>
                        <td>{asset.SerialNumber}</td>
                        <td>{asset.Status}</td>
                        <td>
                          {asset.AssignedToId
                            ? (() => {
                                const emp = employees.find((e) => e.Id === asset.AssignedToId);
                                return emp
                                  ? `${emp.Id} - ${emp.Name}`
                                  : 'Unknown';
                              })()
                            : '-'}
                        </td>
                        <td>{asset.Vendor}</td>
                        <td>{asset.PurchaseDate}</td>
                        <td>{asset.WarrantyExpiry ?? '-'}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {asset.InvoicePath ? (
                            <span>
                              <a href={getInvoiceUrl(asset.Id)} target="_blank" rel="noopener noreferrer">
                                {asset.InvoiceNumber || 'View invoice'}
                              </a>
                            </span>
                          ) : (
                            <>
                              <input
                                type="text"
                                value={invoiceNumberByAsset[asset.Id] ?? ''}
                                onChange={(e) =>
                                  setInvoiceNumberByAsset((prev) => ({
                                    ...prev,
                                    [asset.Id]: e.target.value,
                                  }))
                                }
                                placeholder="Invoice #"
                                style={{ width: '6rem', marginRight: '0.25rem' }}
                              />
                              <input
                                type="file"
                                accept=".pdf,application/pdf"
                                id={`invoice-${asset.Id}`}
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) {
                                    setUploadingInvoiceId(asset.Id);
                                    const invNum = invoiceNumberByAsset[asset.Id]?.trim() || null;
                                    uploadAssetInvoice(asset.Id, f, invNum)
                                      .then(async () => {
                                        setInvoiceNumberByAsset((prev) => ({ ...prev, [asset.Id]: '' }));
                                        await refreshAssets();
                                      })
                                      .catch((err) => setAssetError(err.message ?? 'Upload failed'))
                                      .finally(() => {
                                        setUploadingInvoiceId(null);
                                        e.target.value = '';
                                      });
                                  }
                                }}
                              />
                              <button
                                type="button"
                                disabled={uploadingInvoiceId === asset.Id}
                                onClick={() => (document.getElementById(`invoice-${asset.Id}`) as HTMLInputElement | null)?.click()}
                              >
                                {uploadingInvoiceId === asset.Id ? 'Uploading…' : 'Upload PDF'}
                              </button>
                            </>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="actions asset-row-actions">
                            {asset.Status === 'Available' ? (
                              <>
                                <select
                                  value={selectedEmployeeIds[asset.Id] ?? ''}
                                  onChange={(e) => {
                                    setSelectedEmployeeIds((prev) => ({
                                      ...prev,
                                      [asset.Id]: e.target.value ? Number(e.target.value) : '',
                                    }));
                                    setAssetError(null);
                                  }}
                                  title="Select employee to assign this asset"
                                  aria-label="Assign to employee"
                                >
                                  <option value="">Select employee…</option>
                                  {employees.map((emp) => (
                                    <option key={emp.Id} value={emp.Id}>
                                      {emp.Name} (ID {emp.Id}) · {emp.Department}{emp.Branch ? ` · ${emp.Branch}` : ''}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); onAssign(asset.Id); }}
                                  disabled={assigningId === asset.Id || !selectedEmployeeIds[asset.Id]}
                                  title={selectedEmployeeIds[asset.Id] ? 'Assign asset to selected employee' : 'Select an employee first'}
                                >
                                  {assigningId === asset.Id ? 'Assigning…' : 'Assign'}
                                </button>
                              </>
                            ) : asset.Status === 'Assigned' ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onReturn(asset.Id); }}
                                disabled={returningId === asset.Id}
                                title="Return asset so it can be assigned to someone else"
                              >
                                {returningId === asset.Id ? 'Returning…' : 'Return'}
                              </button>
                            ) : null}
                            <button type="button" onClick={(e) => { e.stopPropagation(); startEditAsset(asset); }}>
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
                  );
                })()}
              </>
            )}
            {assetError && <p className="error">{assetError}</p>}
          </section>
          </div>
          )}
        </main>
      )}
      {activeTab === 'repairs' && (
        <main className="app-main repairs-full-page">
          {showLogRepairForm ? (
            <section className="card repairs-form-card">
              <h2>Log repair</h2>
              <form onSubmit={onRepairSubmit} className="form-grid">
                <label>
                  Asset
                  <input
                    type="search"
                    value={repairAssetSearchQuery}
                    onChange={(e) => {
                      setRepairAssetSearchQuery(e.target.value);
                      setRepairAssetId('');
                    }}
                    placeholder="Search by name, serial number, or type"
                    aria-label="Search assets for repair"
                  />
                  <select
                    value={repairAssetId}
                    onChange={(e) => setRepairAssetId(e.target.value ? Number(e.target.value) : '')}
                    required
                  >
                    <option value="">Select asset…</option>
                    {assets
                      .filter((a) => {
                        if (a.Status === 'In Repair') return false;
                        const query = repairAssetSearchQuery.trim().toLowerCase();
                        return !query || [a.Name, a.SerialNumber, a.Type, a.Status]
                          .some((value) => value.toLowerCase().includes(query));
                      })
                      .map((a) => (
                        <option key={a.Id} value={a.Id}>
                          {a.Name} ({a.SerialNumber}) – {a.Status}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Issue description
                  <textarea
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                    rows={3}
                    required
                  />
                </label>
                <label>
                  Repair vendor
                  <input value={repairVendor} onChange={(e) => setRepairVendor(e.target.value)} />
                </label>
                <label>
                  Cost
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={repairCost}
                    onChange={(e) => setRepairCost(e.target.value)}
                  />
                </label>
                <div className="preview-actions">
                  <button type="button" onClick={() => { setShowLogRepairForm(false); setRepairError(null); }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={repairSubmitting}>
                    {repairSubmitting ? 'Saving…' : 'Log repair'}
                  </button>
                </div>
              </form>
              {repairError && <p className="error">{repairError}</p>}
            </section>
          ) : (
            <>
              <div className="repairs-actions-corner">
                <form onSubmit={onRepairSearch} className="repairs-search-form">
                  <input
                    type="search"
                    placeholder="Search by asset, issue, vendor, status, date…"
                    value={repairSearchQuery}
                    onChange={(e) => setRepairSearchQuery(e.target.value)}
                    className="repairs-search-input"
                    aria-label="Search repairs"
                  />
                  <button type="submit">Search</button>
                </form>
                <button type="button" onClick={() => setShowLogRepairForm(true)}>
                  Create log
                </button>
              </div>
              <div className="repairs-table-wrap">
                <section className="card">
                  <h2>Repairs</h2>
                  {repairSearchApplied && (
                    <p className="repairs-search-hint">
                      {filteredRepairs.length === 0
                        ? 'No repairs match your search.'
                        : `${filteredRepairs.length} repair${filteredRepairs.length !== 1 ? 's' : ''} found.`}
                    </p>
                  )}
                  {repairLoading ? (
                    <p>Loading…</p>
                  ) : repairs.length === 0 ? (
                    <p>No repairs yet. Click &quot;Create log&quot; to add one.</p>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Issue</th>
                          <th>Vendor</th>
                          <th>Cost</th>
                          <th>Status</th>
                          <th>Start</th>
                          <th>Completed</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRepairs.map((r) => (
                          <tr key={r.Id}>
                            <td>{r.AssetName ?? r.AssetId} {r.AssetSerial && `(${r.AssetSerial})`}</td>
                            <td>{r.IssueDescription}</td>
                            <td>{r.RepairVendor ?? '-'}</td>
                            <td>{r.Cost != null ? r.Cost : '-'}</td>
                            <td>{r.Status}</td>
                            <td>{r.StartDate}</td>
                            <td>{r.CompletedDate ?? '-'}</td>
                            <td>
                              {r.Status !== 'Completed' && (
                                <button
                                  type="button"
                                  onClick={() => onCompleteRepair(r.Id)}
                                  disabled={completingId === r.Id}
                                >
                                  {completingId === r.Id ? 'Completing…' : 'Complete'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {repairError && <p className="error">{repairError}</p>}
                </section>
              </div>
            </>
          )}
        </main>
      )}
      {activeTab === 'licenses' && (
        <main className="app-main">
          <section className="card">
            <h2>{editingLicenseId != null ? 'Edit license' : 'Add software license'}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!licenseName || !licenseVendor || !licensePurchaseDate || !licenseExpiryDate || !licenseCost) {
                  setLicenseError('All fields are required.');
                  return;
                }
                const costNumber = Number(licenseCost);
                if (Number.isNaN(costNumber)) {
                  setLicenseError('Cost must be a number.');
                  return;
                }
                (async () => {
                  try {
                    setLicenseSubmitting(true);
                    setLicenseError(null);
                    if (editingLicenseId == null) {
                      await createLicense({
                        name: licenseName,
                        vendor: licenseVendor,
                        purchaseDate: licensePurchaseDate,
                        expiryDate: licenseExpiryDate,
                        cost: costNumber,
                      });
                    } else {
                      await updateLicense(editingLicenseId, {
                        name: licenseName,
                        vendor: licenseVendor,
                        purchaseDate: licensePurchaseDate,
                        expiryDate: licenseExpiryDate,
                        cost: costNumber,
                      });
                    }
                    const data = await listLicenses();
                    setLicenses(data);
                    setEditingLicenseId(null);
                    setLicenseName('');
                    setLicenseVendor('');
                    setLicensePurchaseDate('');
                    setLicenseExpiryDate('');
                    setLicenseCost('');
                  } catch (err: any) {
                    setLicenseError(err.message ?? 'Failed to save license');
                  } finally {
                    setLicenseSubmitting(false);
                  }
                })();
              }}
              className="form-grid"
            >
              <label>
                Software / license name
                <input value={licenseName} onChange={(e) => setLicenseName(e.target.value)} required />
              </label>
              <label>
                Vendor
                <input value={licenseVendor} onChange={(e) => setLicenseVendor(e.target.value)} required />
              </label>
              <label>
                Purchase date
                <input
                  type="date"
                  value={licensePurchaseDate}
                  onChange={(e) => setLicensePurchaseDate(e.target.value)}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  required
                />
              </label>
              <label>
                Expiry date
                <input
                  type="date"
                  value={licenseExpiryDate}
                  onChange={(e) => setLicenseExpiryDate(e.target.value)}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  required
                />
              </label>
              <label>
                Cost
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={licenseCost}
                  onChange={(e) => setLicenseCost(e.target.value)}
                  required
                />
              </label>
              <div className="preview-actions">
                {editingLicenseId != null && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingLicenseId(null);
                      setLicenseError(null);
                      setLicenseName('');
                      setLicenseVendor('');
                      setLicensePurchaseDate('');
                      setLicenseExpiryDate('');
                      setLicenseCost('');
                    }}
                  >
                    Cancel
                  </button>
                )}
                <button type="submit" disabled={licenseSubmitting}>
                  {licenseSubmitting ? 'Saving…' : editingLicenseId != null ? 'Save' : 'Add license'}
                </button>
              </div>
            </form>
            {licenseError && <p className="error">{licenseError}</p>}
          </section>

          <section className="card">
            <h2>Software licenses</h2>
            {licenseLoading ? (
              <p>Loading…</p>
            ) : licenses.length === 0 ? (
              <p>No licenses yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Vendor</th>
                    <th>Purchase date</th>
                    <th>Expiry date</th>
                    <th>Cost</th>
                    <th>Added</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {licenses.map((lic) => (
                    <tr key={lic.Id}>
                      <td>{lic.Name}</td>
                      <td>{lic.Vendor}</td>
                      <td>{lic.PurchaseDate}</td>
                      <td>{lic.ExpiryDate}</td>
                      <td>{lic.Cost}</td>
                      <td>{lic.CreatedAt}</td>
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLicenseId(lic.Id);
                              setLicenseName(lic.Name);
                              setLicenseVendor(lic.Vendor);
                              setLicensePurchaseDate(lic.PurchaseDate);
                              setLicenseExpiryDate(lic.ExpiryDate);
                              setLicenseCost(String(lic.Cost));
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={async () => {
                              if (!confirm('Delete this license?')) return;
                              try {
                                setLicenseError(null);
                                await deleteLicense(lic.Id);
                                const data = await listLicenses();
                                setLicenses(data);
                              } catch (err: any) {
                                setLicenseError(err.message ?? 'Failed to delete license');
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </main>
      )}
      {activeTab === 'gatepasses' && (
        <main className="app-main">
          <section className="card">
            <h2>{editingGatePassId != null ? 'Edit gate pass' : 'Gate pass form'}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  !gateReference ||
                  !gatePassNumber ||
                  !gateProductName ||
                  !gateSerialNumber ||
                  !gateReceivedBy ||
                  !gateIssuedBy ||
                  !gateDate
                ) {
                  setGatePassError('Select an asset, then fill reference number, pass number, serial number, received by, issued by and date.');
                  return;
                }
                (async () => {
                  try {
                    setGateSubmitting(true);
                    setGatePassError(null);
                    if (editingGatePassId == null) {
                      await createGatePass({
                        referenceNumber: gateReference,
                        passNumber: gatePassNumber,
                        from: gateFrom,
                        to: gateTo,
                        productName: gateProductName,
                        personName: gatePersonName,
                        serialNumber: gateSerialNumber,
                        notes: gateNotes || null,
                        receivedBy: gateReceivedBy,
                        issuedBy: gateIssuedBy,
                        passDate: gateDate,
                      });
                    } else {
                      await updateGatePass(editingGatePassId, {
                        referenceNumber: gateReference,
                        passNumber: gatePassNumber,
                        from: gateFrom,
                        to: gateTo,
                        productName: gateProductName,
                        personName: gatePersonName,
                        serialNumber: gateSerialNumber,
                        notes: gateNotes || null,
                        receivedBy: gateReceivedBy,
                        issuedBy: gateIssuedBy,
                        passDate: gateDate,
                      });
                    }
                    const data = await listGatePasses();
                    setGatePasses(data);
                    setEditingGatePassId(null);
                    setGateReference('');
                    setGatePassNumber('');
                    setGateFrom('');
                    setGateTo('');
                    setGateProductName('');
                    setGateSelectedAssetId('');
                    setGateAssetSearchQuery('');
                    setGateAssetMode('database');
                    
                    setGatePersonName('');
                    setGateSerialNumber('');
                    setGateNotes('');
                    setGateReceivedBy('');
                    setGateIssuedBy('');
                    setGateDate('');
                  } catch (err: any) {
                    setGatePassError(err.message ?? 'Failed to save gate pass');
                  } finally {
                    setGateSubmitting(false);
                  }
                })();
              }}
              className="form-grid"
            >
              <label>
                Asset source
                <select
                  value={gateAssetMode}
                  onChange={(e) => {
                    const nextMode = e.target.value as 'database' | 'manual';
                    setGateAssetMode(nextMode);
                    if (nextMode === 'manual') {
                      setGateSelectedAssetId('');
                      setGateAssetSearchQuery('');
                    }
                  }}
                >
                  <option value="database">From database</option>
                  <option value="manual">Other asset (not in database)</option>
                </select>
              </label>

              {gateAssetMode === 'database' ? (
                <label>
                  Asset (from database)
                  <input
                    type="search"
                    value={gateAssetSearchQuery}
                    onChange={(e) => setGateAssetSearchQuery(e.target.value)}
                    placeholder="Search asset by name, type, or serial…"
                    autoComplete="off"
                    style={{ marginBottom: '0.5rem' }}
                  />
                  <select
                    value={gateSelectedAssetId}
                    onChange={(e) => {
                      const next = e.target.value ? Number(e.target.value) : '';
                      setGateSelectedAssetId(next);
                      const asset = next ? assets.find((a) => a.Id === next) : null;
                      if (asset) {
                        setGateProductName(asset.Name);
                        setGateSerialNumber(asset.SerialNumber);
                        const details = `${asset.Type}${asset.Vendor ? ` · ${asset.Vendor}` : ''}`;
                        setGateNotes((prev) => (prev?.trim() ? prev : details));
                      }
                    }}
                  >
                    <option value="">Select asset…</option>
                    {assets
                      .filter((a) => {
                        const q = gateAssetSearchQuery.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          (a.Name ?? '').toLowerCase().includes(q) ||
                          (a.Type ?? '').toLowerCase().includes(q) ||
                          (a.SerialNumber ?? '').toLowerCase().includes(q)
                        );
                      })
                      .map((a) => (
                        <option key={a.Id} value={a.Id}>
                          {a.Name} · {a.Type} · {a.SerialNumber}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <label>
                  Asset name
                  <input
                    value={gateProductName}
                    onChange={(e) => setGateProductName(e.target.value)}
                    placeholder="Enter asset name"
                    required
                  />
                </label>
              )}
              <label>
                Referance  (reference number)
                <input
                  value={gateReference}
                  onChange={(e) => setGateReference(e.target.value)}
                  required
                />
              </label>
              <label>
                Pass number
                <input
                  value={gatePassNumber}
                  onChange={(e) => setGatePassNumber(e.target.value)}
                  required
                />
              </label>
              <label>
                From
                <input
                  value={gateFrom}
                  onChange={(e) => setGateFrom(e.target.value)}
                  placeholder="From (person or location)"
                />
              </label>
              <label>
                To
                <input
                  value={gateTo}
                  onChange={(e) => setGateTo(e.target.value)}
                  placeholder="To (person or location)"
                />
              </label>
              <label>
                Serial number
                <input
                  value={gateSerialNumber}
                  onChange={(e) => setGateSerialNumber(e.target.value)}
                  required
                />
              </label>
              <label>
                Notes
                <input
                  value={gateNotes}
                  onChange={(e) => setGateNotes(e.target.value)}
                />
              </label>
              <label>
                Received by
                <input
                  value={gateReceivedBy}
                  onChange={(e) => setGateReceivedBy(e.target.value)}
                  required
                />
              </label>
              <label>
                Issued by
                <input
                  value={gateIssuedBy}
                  onChange={(e) => setGateIssuedBy(e.target.value)}
                  required
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={gateDate}
                  onChange={(e) => setGateDate(e.target.value)}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  required
                />
              </label>
              <div className="preview-actions">
                {editingGatePassId != null && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGatePassId(null);
                      setGatePassError(null);
                      setGateReference('');
                      setGatePassNumber('');
                      setGateFrom('');
                      setGateTo('');
                      setGateProductName('');
                      setGateSelectedAssetId('');
                     
                      setGatePersonName('');
                      setGateSerialNumber('');
                      setGateNotes('');
                      setGateReceivedBy('');
                      setGateIssuedBy('');
                      setGateDate('');
                    }}
                  >
                    Cancel
                  </button>
                )}
                <button type="submit" disabled={gateSubmitting}>
                  {gateSubmitting ? 'Saving…' : editingGatePassId != null ? 'Save' : 'Create gate pass'}
                </button>
              </div>
            </form>
            {gatePassError && <p className="error">{gatePassError}</p>}
          </section>

          <section className="card">
            <h2>Gate passes</h2>
            {gatePassLoading ? (
              <p>Loading…</p>
            ) : gatePasses.length === 0 ? (
              <p>No gate passes yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Reference number</th>
                    <th>Pass number</th>
                    <th>Product</th>
                    <th>Serial</th>
                    <th>Date</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {gatePasses.map((gp) => (
                    <tr key={gp.Id}>
                      <td>{gp.ReferenceNumber}</td>
                      <td>{gp.PassNumber}</td>
                      <td>{gp.ProductName}</td>
                      <td>{gp.SerialNumber}</td>
                      <td>{gp.PassDate}</td>
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGatePassId(gp.Id);
                              setGateReference(gp.ReferenceNumber);
                              setGatePassNumber(gp.PassNumber);
                              setGateFrom(gp.GatePassFrom ?? '');
                              setGateTo(gp.GatePassTo ?? '');
                              setGateProductName(gp.ProductName);
                              setGatePersonName(gp.PersonName);
                              setGateSerialNumber(gp.SerialNumber);
                              setGateNotes(gp.Notes ?? '');
                              setGateReceivedBy(gp.ReceivedBy);
                              setGateIssuedBy(gp.IssuedBy);
                              setGateDate(gp.PassDate);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewGatePassId(gp.Id)}
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => openGatePassPrint(gp)}
                          >
                            View PDF
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={async () => {
                              if (!confirm('Delete this gate pass?')) return;
                              try {
                                setGatePassError(null);
                                await deleteGatePass(gp.Id);
                                const data = await listGatePasses();
                                setGatePasses(data);
                              } catch (err: any) {
                                setGatePassError(err.message ?? 'Failed to delete gate pass');
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {previewGatePassId != null && (() => {
            const gp = gatePasses.find((g) => g.Id === previewGatePassId);
            if (!gp) return null;
            return (
              <div className="modal-overlay" onClick={() => setPreviewGatePassId(null)}>
                <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3>Gate pass preview</h3>
                    <button type="button" onClick={() => setPreviewGatePassId(null)}>
                      Close
                    </button>
                  </div>
                  <dl className="preview-dl">
                    <dt>Reference number</dt><dd>{gp.ReferenceNumber ?? '—'}</dd>
                    <dt>Pass number</dt><dd>{gp.PassNumber ?? '—'}</dd>
                    <dt>From</dt><dd>{gp.GatePassFrom ?? '—'}</dd>
                    <dt>To</dt><dd>{gp.GatePassTo ?? '—'}</dd>
                    <dt>Product name</dt><dd>{gp.ProductName ?? '—'}</dd>
                    <dt>Serial number</dt><dd>{gp.SerialNumber ?? '—'}</dd>
                    <dt>Notes</dt><dd>{gp.Notes ?? '—'}</dd>
                    <dt>Received by</dt><dd>{gp.ReceivedBy ?? '—'}</dd>
                    <dt>Issued by</dt><dd>{gp.IssuedBy ?? '—'}</dd>
                    <dt>Date</dt><dd>{gp.PassDate ?? '—'}</dd>
                  </dl>
                  <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ border: '1px solid #111827', padding: '0.5rem 1rem', minWidth: '180px', minHeight: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', fontSize: '0.85rem' }}>
                      Admin signature
                    </div>
                    <button type="button" onClick={() => openGatePassPrint(gp!)}>
                      View PDF
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </main>
      )}
      {activeTab === 'tracking' && (
        <main className="app-main tracking-full-page">
          <section className="card tracking-history-card">
            <h2>Assignment tracking history</h2>
            {trackingLoading ? (
              <p>Loading tracking history…</p>
            ) : trackingError ? (
              <p className="error">{trackingError}</p>
            ) : trackingHistory.length === 0 ? (
              <p>No assignment history yet.</p>
            ) : (
              <>
                <div className="form-grid" style={{ marginBottom: '1rem' }}>
                  <label>
                    Search
                    <input
                      type="search"
                      value={trackingSearchQuery}
                      onChange={(e) => setTrackingSearchQuery(e.target.value)}
                      placeholder="Employee, asset, serial, department…"
                      autoComplete="off"
                    />
                  </label>
                </div>
                {(() => {
                  const searchLower = trackingSearchQuery.trim().toLowerCase();
                  const filtered = searchLower
                    ? trackingHistory.filter((t) => {
                        return (
                          (t.EmployeeName ?? '').toLowerCase().includes(searchLower) ||
                          (t.AssetName ?? '').toLowerCase().includes(searchLower) ||
                          (t.SerialNumber ?? '').toLowerCase().includes(searchLower) ||
                          (t.Department ?? '').toLowerCase().includes(searchLower) ||
                          (t.AssetType ?? '').toLowerCase().includes(searchLower) ||
                          (t.Branch ?? '').toLowerCase().includes(searchLower)
                        );
                      })
                    : trackingHistory;

                  return (
                    <>
                      <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.75rem' }}>
                        Showing {filtered.length} of {trackingHistory.length} total assignments
                      </p>
                      <div className="tracking-table-wrap" style={{ overflowX: 'auto', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                        <table className="table tracking-table" style={{ fontSize: '0.9rem', width: '100%', borderCollapse: 'collapse' }}>
                          <thead style={{ backgroundColor: '#f9fafb', position: 'sticky', top: 0, zIndex: 10 }}>
                            <tr>
                              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>Employee</th>
                              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>Department</th>
                              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>Asset</th>
                              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>Serial</th>
                              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>Type</th>
                              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>Assigned</th>
                              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>Returned</th>
                              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((track, idx) => (
                              <tr key={track.Id} style={{ borderBottom: idx < filtered.length - 1 ? '1px solid #f0f0f0' : 'none', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                <td style={{ padding: '0.75rem' }}>{track.EmployeeName}</td>
                                <td style={{ padding: '0.75rem' }}>{track.Department}</td>
                                <td style={{ padding: '0.75rem' }}>{track.AssetName}</td>
                                <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#666' }}>{track.SerialNumber}</td>
                                <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>{track.AssetType}</td>
                                <td style={{ padding: '0.75rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{formatDate(track.AssignedDate)}</td>
                                <td style={{ padding: '0.75rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{formatDate(track.ReturnedDate)}</td>
                                <td style={{ padding: '0.75rem' }}>
                                  <span style={{
                                    color: track.Status === 'Active' ? '#10b981' : '#9ca3af',
                                    fontWeight: '600',
                                    padding: '0.25rem 0.75rem',
                                    borderRadius: '4px',
                                    backgroundColor: track.Status === 'Active' ? '#ecfdf5' : '#f3f4f6',
                                    display: 'inline-block',
                                    fontSize: '0.85rem'
                                  }}>
                                    {track.Status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </section>
        </main>
      )}
      {activeTab === 'dashboard' && (
        <footer className="app-footer">
          Developed By CBL Information Technology Department
        </footer>
      )}
    </div>
  );
}

export default App;
