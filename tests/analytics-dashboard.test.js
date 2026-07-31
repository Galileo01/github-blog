import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAreaPath,
  createChartModel,
  createChartScale,
  createDonutSlices,
  createLinePath,
} from '../src/pages/admin/analytics/_lib/analytics-dashboard.ts';

test('createChartScale uses a safe integer scale for zero and large values', () => {
  assert.deepEqual(createChartScale([{ pv: 0, uv: 0 }]), {
    max: 4,
    ticks: [4, 3, 2, 1, 0],
  });

  const scale = createChartScale([{ pv: 93, uv: 41 }]);
  assert.equal(scale.max, 100);
  assert.deepEqual(scale.ticks, [100, 75, 50, 25, 0]);
});

test('createChartModel produces responsive coordinates for both series', () => {
  const rows = [
    { day: '2026-07-23', pv: 0, uv: 0 },
    { day: '2026-07-24', pv: 8, uv: 4 },
    { day: '2026-07-25', pv: 8, uv: 8 },
  ];
  const model = createChartModel(rows, 640);

  assert.equal(model.width, 640);
  assert.equal(model.points[0].label, '07-23');
  assert.equal(model.points[0].x, model.padding.left);
  assert.equal(model.points.at(-1).x, model.width - model.padding.right);
  assert.ok(model.points[1].pvY < model.points[1].uvY);
  assert.equal(model.points[2].pvY, model.points[2].uvY);
});

test('chart paths handle empty, single and multiple points', () => {
  assert.equal(createLinePath([], 'pvY'), '');
  assert.equal(createAreaPath([], 'pvY', 100), '');

  const single = [{ x: 20, pvY: 30 }];
  assert.equal(createLinePath(single, 'pvY'), 'M 20 30');
  assert.equal(createAreaPath(single, 'pvY', 100), 'M 20 30 L 20 100 L 20 100 Z');

  const points = [{ x: 20, pvY: 30 }, { x: 60, pvY: 10 }];
  assert.equal(createLinePath(points, 'pvY'), 'M 20 30 L 60 10');
});

test('createDonutSlices uses full totals and groups remaining pages as other', () => {
  const rows = [
    { page: '/a', pv: 30, uv: 3 },
    { page: '/b', pv: 20, uv: 5 },
    { page: '/c', pv: 10, uv: 2 },
  ];

  assert.deepEqual(createDonutSlices(rows, 100, 'pv', 2), [
    { label: '/a', value: 30, percentage: 30 },
    { label: '/b', value: 20, percentage: 20 },
    { label: '其他', value: 50, percentage: 50 },
  ]);
  assert.deepEqual(createDonutSlices(rows, 0, 'uv'), []);
});
