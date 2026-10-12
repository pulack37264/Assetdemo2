import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmployeeDetailsHtml } from './email.js';

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
