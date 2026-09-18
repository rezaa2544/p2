/**
 * آزمون تولید برنامه اقدام راهبردی مدیر منطقه (generateRegionalActionPlan)
 */

'use strict';

const assert = require('assert');
const { generateRegionalActionPlan } = require('../../../server/analytics/regional-intelligence-network');

function runTest() {
  console.log('▸ تست ۴: تولید برنامه اقدام راهبردی مدیر منطقه (generateRegionalActionPlan)');

  const mockNeeds = [
    {
      category: 'COUNSELING_SUPPORT',
      priority: 'CRITICAL',
      target_schools_count: 2,
      description: 'پرونده‌های مداخله بلاتکلیف در ۲ مدرسه'
    },
    {
      category: 'ATTENDANCE_SUPPORT',
      priority: 'HIGH',
      target_schools_count: 3,
      description: 'غیبت مزمن در ۳ مدرسه'
    },
    {
      category: 'LEARNING_SUPPORT',
      priority: 'HIGH',
      target_schools_count: 2,
      description: 'افت نمرات در ۲ مدرسه'
    }
  ];

  const plan = generateRegionalActionPlan({ resource_needs: mockNeeds });

  assert.ok(Array.isArray(plan));
  assert.strictEqual(plan.length, 3);

  // بررسی رتبه اول با اولویت CRITICAL و مهلت ۴۸ ساعته
  assert.strictEqual(plan[0].priority, 'CRITICAL');
  assert.strictEqual(plan[0].timeframe, '48h');
  assert.ok(plan[0].proposed_action.includes('مشاوره'));

  // بررسی اقدامات با اولویت HIGH و بازه زمانی
  assert.ok(plan.some(p => p.priority === 'HIGH' && (p.timeframe === '72h' || p.timeframe === '7d')));

  console.log('  ✅ تولید برنامه اقدام دقیق، زمان‌بندی صریح و ارتباط علت و معلول');
}

module.exports = { runTest };
if (require.main === module) runTest();
