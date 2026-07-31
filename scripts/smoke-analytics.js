import assert from 'node:assert/strict';
import process from 'node:process';

const deploymentUrl = process.argv[2] || process.env.DEPLOYMENT_URL;
if (!deploymentUrl) {
  throw new Error('usage: node scripts/smoke-analytics.js <deployment-url>');
}

const baseUrl = deploymentUrl.replace(/\/+$/, '');

async function retry(path, expectedStatus, { attempts = 12, ...init } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { 'User-Agent': 'github-blog-deployment-smoke-test' },
        ...init,
      });
      if (response.status === expectedStatus) return response;
      lastError = new Error(`${path} returned ${response.status}, expected ${expectedStatus}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }

  throw lastError;
}

await retry('/', 200);
await retry('/admin/analytics', 200);

const analytics = await retry('/api/analytics?page=/', 200);
const analyticsBody = await analytics.json();
assert.equal(analyticsBody.page, '/');
assert.equal(Number.isFinite(analyticsBody.pv), true);
assert.equal(Number.isFinite(analyticsBody.uv), true);

await retry('/api/admin/analytics/summary', 401);
await retry('/api/admin/login', 401, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'github-blog-deployment-smoke-test',
  },
  body: JSON.stringify({ password: 'deployment-smoke-test-invalid-password' }),
});

console.log(`Production smoke test passed: ${baseUrl}`);
