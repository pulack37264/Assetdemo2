/**
 * Quick test that the Employees API works (run with: node test-api.js)
 * Start the server first: npm start
 * If server runs on another port: BASE_URL=http://localhost:3002/api node test-api.js
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001/api';

async function test() {
  const res = await fetch(`${BASE}/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Jane Doe', email: 'jane@company.com', department: 'IT' }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  console.log('POST /employees:', json.data);

  const list = await fetch(`${BASE}/employees`).then((r) => r.json());
  if (list.error) throw new Error(list.error);
  console.log('GET /employees count:', list.data.length);
  console.log('OK');
}

test().catch((e) => {
  console.error(e);
  process.exit(1);
});
