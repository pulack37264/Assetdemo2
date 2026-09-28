const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '192.168.216.27:3001/api' : '/api');
const AUTH_TOKEN_KEY = 'asset_admin_token';

export function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth-logout'));
  }
}

/** Headers to send with authenticated requests (Authorization Bearer). */
export function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const t = getToken();
  const out: Record<string, string> = { ...extra };
  if (t) out['Authorization'] = `Bearer ${t}`;
  return out;
}

/** Parse response as JSON; on 401 clear token and dispatch auth-logout. */
async function parseJson(res: Response): Promise<{ data: unknown; error: string | null }> {
  if (res.status === 401) {
    clearToken();
  }
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    throw new Error(
      'Server returned HTML instead of JSON. Start the backend: run "npm start" in the server folder, then refresh. API should be at http://localhost:3001'
    );
  }
  try {
    return JSON.parse(text) as { data: unknown; error: string | null };
  } catch {
    throw new Error('Invalid response from server.');
  }
}

export type Employee = {
  Id: number;
  Name: string;
  Email: string;
  Department: string;
  Branch: string;
  CreatedAt: string;
  AssignedDate: string | null;
};

export type Asset = {
  Id: number;
  Name: string;
  Type: string;
  SerialNumber: string;
  Status: string;
  Vendor: string;
  PurchaseDate: string;
  WarrantyExpiry: string | null;
  InvoicePath: string | null;
  InvoiceNumber: string | null;
  InvoiceId: number | null;
  AssignedToId: number | null;
  AddedAt: string | null;
};

export async function listEmployees(): Promise<Employee[]> {
  const res = await fetch(`${API_BASE}/employees`, { headers: getAuthHeaders() });
  const json = await parseJson(res);
  if (json.error) throw new Error(json.error);
  return json.data as Employee[];
}

export async function createEmployee(input: {
  id: number;
  name: string;
  email: string;
  department: string;
  branch?: string;
}): Promise<Employee> {
  const res = await fetch(`${API_BASE}/employees`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to create employee');
  return json.data as Employee;
}

export async function updateEmployee(
  id: number,
  input: { name: string; email: string; department: string; branch?: string }
): Promise<Employee> {
  const res = await fetch(`${API_BASE}/employees/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to update employee');
  return json.data as Employee;
}

export async function deleteEmployee(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/employees/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to delete employee');
}

export async function listAssets(): Promise<Asset[]> {
  const res = await fetch(`${API_BASE}/assets`, { headers: getAuthHeaders() });
  const json = await parseJson(res);
  if (json.error) throw new Error(json.error);
  return json.data as Asset[];
}

export async function createAsset(
  input: {
    name: string;
    type: string;
    serialNumber: string;
    vendor: string;
    purchaseDate: string;
    warrantyExpiry?: string | null;
    status?: string;
  },
  invoiceFile?: File | null,
  invoiceNumber?: string | null
): Promise<Asset> {
  const hasInvoice = !!invoiceFile;
  const res = await fetch(`${API_BASE}/assets`, hasInvoice
    ? (() => {
        const form = new FormData();
        form.append('name', input.name);
        form.append('type', input.type);
        form.append('serialNumber', input.serialNumber);
        form.append('vendor', input.vendor);
        form.append('purchaseDate', input.purchaseDate);
        if (input.warrantyExpiry) form.append('warrantyExpiry', input.warrantyExpiry);
        if (input.status) form.append('status', input.status);
        form.append('invoice', invoiceFile!);
        if (invoiceNumber) form.append('invoiceNumber', invoiceNumber);
        return {
          method: 'POST',
          headers: getAuthHeaders(),
          body: form,
        };
      })()
    : {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(input),
      });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to create asset');
  return json.data as Asset;
}

export async function updateAsset(
  id: number,
  input: {
    name: string;
    type: string;
    serialNumber: string;
    status: string;
    vendor: string;
    purchaseDate: string;
    warrantyExpiry?: string | null;
  }
): Promise<Asset> {
  const res = await fetch(`${API_BASE}/assets/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to update asset');
  return json.data as Asset;
}

export async function deleteAsset(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/assets/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to delete asset');
}

export function getInvoiceUrl(assetId: number): string {
  const t = getToken();
  return t ? `${API_BASE}/assets/${assetId}/invoice?token=${encodeURIComponent(t)}` : `${API_BASE}/assets/${assetId}/invoice`;
}

// --- Auth ---
export type AuthUser = { username: string };

export async function getNeedSetup(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/need-setup`);
  const json = await parseJson(res);
  if (json.error) return true;
  return (json.data as { needSetup: boolean }).needSetup;
}

export async function setupFirstAdmin(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Setup failed');
  return json.data as { token: string; user: AuthUser };
}

export async function login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
  console.log('api path:',API_BASE);
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Login failed');
  return json.data as { token: string; user: AuthUser };
}

export async function getMe(): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/auth/me`, { headers: getAuthHeaders() });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Not authenticated');
  return (json.data as { user: AuthUser }).user;
}

export async function uploadAssetInvoice(
  assetId: number,
  file: File,
  invoiceNumber?: string | null
): Promise<Asset> {
  const form = new FormData();
  form.append('invoice', file);
  if (invoiceNumber) form.append('invoiceNumber', invoiceNumber);
  const res = await fetch(`${API_BASE}/assets/${assetId}/invoice`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: form,
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to upload invoice');
  return json.data as Asset;
}

export async function deleteAssetInvoice(assetId: number): Promise<Asset> {
  const res = await fetch(`${API_BASE}/assets/${assetId}/invoice`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to remove invoice');
  return json.data as Asset;
}

export type Invoice = {
  Id: number;
  AssetId: number;
  InvoiceNumber: string | null;
  OriginalFileName: string;
  StoredPath: string;
  UploadedAt: string;
  LinkedAssetCount?: number;
};

export async function createSharedInvoice(
  assetId: number,
  file: File,
  invoiceNumber?: string | null
): Promise<Invoice> {
  const form = new FormData();
  form.append('assetId', String(assetId));
  form.append('invoice', file);
  if (invoiceNumber) form.append('invoiceNumber', invoiceNumber);

  const res = await fetch(`${API_BASE}/invoices`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: form,
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to create shared invoice');
  return json.data as Invoice;
}

export async function linkInvoiceToAssets(invoiceId: number, assetIds: number[]): Promise<Asset[]> {
  const res = await fetch(`${API_BASE}/assets/invoice-links`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ invoiceId, assetIds }),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to link invoice to assets');
  return json.data as Asset[];
}

export async function assignAsset(assetId: number, employeeId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/assignments`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ assetId, employeeId }),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to assign asset');
}

export async function assignAssets(assetIds: number[], employeeId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/assignments`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ assetIds, employeeId }),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to assign assets');
}

export async function returnAsset(assetId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/assignments/return/${assetId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to return asset');
}

export type TrackingHistory = {
  Id: number;
  EmployeeId: number;
  AssetId: number;
  AssignedDate: string;
  ReturnedDate: string | null;
  Status: string;
  EmployeeName: string;
  Department: string;
  Branch: string;
  AssetName: string;
  SerialNumber: string;
  AssetType: string;
};

export async function getTrackingHistory(): Promise<TrackingHistory[]> {
  const res = await fetch(`${API_BASE}/assignments`, { headers: getAuthHeaders() });
  const json = await parseJson(res);
  if (json.error) throw new Error(json.error);
  return json.data as TrackingHistory[];
}

export type AssignmentHistory = {
  Id: number;
  EmployeeId: number;
  AssetId: number;
  AssignedDate: string;
  ReturnedDate: string | null;
  Status: string;
  EmployeeName: string;
  Email: string;
  Department: string;
  Branch: string;
};

export async function getAssignmentHistory(assetId: number): Promise<AssignmentHistory[]> {
  const res = await fetch(`${API_BASE}/assignments/asset/${assetId}`, { headers: getAuthHeaders() });
  const json = await parseJson(res);
  if (json.error) throw new Error(json.error);
  return json.data as AssignmentHistory[];
}

export type Repair = {
  Id: number;
  AssetId: number;
  IssueDescription: string;
  RepairVendor: string | null;
  Cost: number | null;
  Status: string;
  StartDate: string;
  CompletedDate: string | null;
  AssetName?: string;
  AssetSerial?: string;
};

export async function listRepairs(): Promise<Repair[]> {
  const res = await fetch(`${API_BASE}/repairs`, { headers: getAuthHeaders() });
  const json = await parseJson(res);
  if (json.error) throw new Error(json.error);
  return json.data as Repair[];
}

export async function createRepair(input: {
  assetId: number;
  issueDescription: string;
  repairVendor?: string | null;
  cost?: number | null;
}): Promise<Repair> {
  const res = await fetch(`${API_BASE}/repairs`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to create repair');
  return json.data as Repair;
}

export async function completeRepair(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/repairs/${id}/complete`, {
    method: 'PUT',
    headers: getAuthHeaders(),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to complete repair');
}

export type DashboardStats = {
  totalAssets: number;
  totalEmployees: number;
  activeRepairs: number;
  assetsByStatus: { Available: number; Assigned: number; 'In Repair': number; Retired: number };
  upcomingWarranties: Array<{
    Id: number;
    Name: string;
    Vendor: string;
    ExpiryDate: string;
  }>;
  recentActivity: Array<{
    Id: number;
    AssetId: number;
    IssueDescription: string;
    Status: string;
    StartDate: string;
    AssetName: string;
    AssetSerial: string;
  }>;
  totalAssignments: number;
  activeAssignments: number;
  returnedAssignments: number;
  recentAssignments: Array<{
    Id: number;
    EmployeeId: number;
    AssetId: number;
    AssignedDate: string;
    ReturnedDate: string | null;
    Status: string;
    AssetName: string;
    SerialNumber: string;
    EmployeeName: string;
  }>;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_BASE}/dashboard/stats`, { headers: getAuthHeaders() });
  const json = await parseJson(res);
  if (json.error) throw new Error(json.error);
  return json.data as DashboardStats;
}

// Software licenses
export type License = {
  Id: number;
  Name: string;
  Vendor: string;
  PurchaseDate: string;
  ExpiryDate: string;
  Cost: number;
  CreatedAt: string;
};

export async function listLicenses(): Promise<License[]> {
  const res = await fetch(`${API_BASE}/licenses`, { headers: getAuthHeaders() });
  const json = await parseJson(res);
  if (json.error) throw new Error(json.error);
  return json.data as License[];
}

export async function createLicense(input: {
  name: string;
  vendor: string;
  purchaseDate: string;
  expiryDate: string;
  cost: number;
}): Promise<License> {
  const res = await fetch(`${API_BASE}/licenses`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to create license');
  return json.data as License;
}

export async function updateLicense(
  id: number,
  input: {
    name: string;
    vendor: string;
    purchaseDate: string;
    expiryDate: string;
    cost: number;
  }
): Promise<License> {
  const res = await fetch(`${API_BASE}/licenses/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to update license');
  return json.data as License;
}

export async function deleteLicense(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/licenses/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to delete license');
}

// Gate passes
export type GatePass = {
  Id: number;
  ReferenceNumber: string;
  PassNumber: string;
  GatePassFrom: string;
  GatePassTo: string;
  ProductName: string;
  PersonName: string;
  SerialNumber: string;
  Notes: string | null;
  ReceivedBy: string;
  IssuedBy: string;
  PassDate: string;
  CreatedAt: string;
};

export async function listGatePasses(): Promise<GatePass[]> {
  const res = await fetch(`${API_BASE}/gatepasses`, { headers: getAuthHeaders() });
  const json = await parseJson(res);
  if (json.error) throw new Error(json.error);
  return json.data as GatePass[];
}

export async function createGatePass(input: {
  referenceNumber: string;
  passNumber: string;
  from: string;
  to: string;
  productName: string;
  personName: string;
  serialNumber: string;
  notes?: string | null;
  receivedBy: string;
  issuedBy: string;
  passDate: string;
}): Promise<GatePass> {
  const res = await fetch(`${API_BASE}/gatepasses`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to create gate pass');
  return json.data as GatePass;
}

export async function updateGatePass(
  id: number,
  input: {
    referenceNumber: string;
    passNumber: string;
    from: string;
    to: string;
    productName: string;
    personName: string;
    serialNumber: string;
    notes?: string | null;
    receivedBy: string;
    issuedBy: string;
    passDate: string;
  }
): Promise<GatePass> {
  const res = await fetch(`${API_BASE}/gatepasses/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to update gate pass');
  return json.data as GatePass;
}

export async function deleteGatePass(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/gatepasses/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
  const json = await parseJson(res);
  if (!res.ok || json.error) throw new Error(json.error || 'Failed to delete gate pass');
}
