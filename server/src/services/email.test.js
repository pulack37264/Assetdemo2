import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssetAuditHtml, buildEmployeeDetailsHtml } from './email.js';

test('employee detailsHTML excludes branch and department fields', () => {
  const html = buildEmployeeDetailsHtml({
    Id: 42,
    Name: 'Jane Doe',
    Branch: 'Head Office',
    Department: 'Engineering',
  });

  assert.match(html, /ID/);
  assert.match(html, /42/);
  assert.doesNotMatch(html, /Branch/);
  assert.doesNotMatch(html, /Department/);
});

test('asset audit email includes only the requested asset fields and escapes their values', () => {
  const html = buildAssetAuditHtml([{
    Name: '<Laptop>',
    PurchaseDate: '2024-01-15',
    WarrantyExpiry: '2027-01-15',
    SerialNumber: 'not included',
    Vendor: 'not included',
  }]);

  assert.match(html, /Asset Name/);
  assert.match(html, /Purchase Date/);
  assert.match(html, /Warranty Expiry/);
  assert.match(html, /&lt;Laptop&gt;/);
  assert.doesNotMatch(html, /Serial Number|Vendor|not included/);
});
