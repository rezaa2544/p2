/* ═══════════════════════════════════════════════════════════════════
   server/routes/system.js — Phase 4: Scalability & Infrastructure API
   -------------------------------------------------------------------
   - GET /api/v1/system/scalability-health ?school_id=&region_id=
       وضعیت سلامت زیرساخت مقیاس‌پذیری و آمادگی عملیاتی تولید (P1-SC-01)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const {
  enforceInfrastructureTenantIsolation,
  buildProductionReadinessSnapshot
} = require('../infrastructure/scalability-foundation');

const {
  enforceEventProcessingTenantIsolation,
  buildEventProcessingHealthSnapshot
} = require('../infrastructure/event-processing-layer');

const {
  enforceObservabilityTenantIsolation,
  buildObservabilityHealthSnapshot
} = require('../monitoring/production-observability');

function createSystemRoutes(ctx) {
  const store = ctx.store || {};
  const db = ctx.db;

  /**
   * GET /api/v1/system/scalability-health
   * رصد وضعیت مقیاس‌پذیری و سلامت کش توزیع‌شده (P1-SC-01)
   */
  async function scalabilityHealthReport(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'bad_request', message: 'ارائه school_id یا region_id الزامی است' }
      };
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforceInfrastructureTenantIsolation(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const snapshot = buildProductionReadinessSnapshot({
        schoolId,
        regionId: user.region_id || 1,
        user
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
          scalability_health: snapshot,
          production_readiness: snapshot
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforceInfrastructureTenantIsolation(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const snapshot = buildProductionReadinessSnapshot({
      schoolId: 101,
      regionId,
      user
    });

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        region_id: regionId,
        regional_scalability_health: {
          region_id: regionId,
          production_readiness_status: snapshot.production_readiness_status,
          scalability_health: snapshot,
          zero_ranking: true,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true
        }
      }
    };
  }

  /**
   * GET /api/v1/system/event-processing-health
   * رصد وضعیت صف رویدادها، خط لوله پردازش غیرهمگام و DLQ (P1-SC-02)
   */
  async function eventProcessingHealthReport(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'bad_request', message: 'ارائه school_id یا region_id الزامی است' }
      };
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforceEventProcessingTenantIsolation(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const snapshot = buildEventProcessingHealthSnapshot({
        schoolId,
        regionId: user.region_id || 1,
        user
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
          event_processing_health: snapshot
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforceEventProcessingTenantIsolation(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const snapshot = buildEventProcessingHealthSnapshot({
      schoolId: 101,
      regionId,
      user
    });

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        region_id: regionId,
        regional_event_processing_health: {
          region_id: regionId,
          pipeline_status: snapshot.pipeline_status,
          event_processing_health: snapshot,
          zero_ranking: true,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true
        }
      }
    };
  }

  /**
   * GET /api/v1/system/observability-health
   * رصد بلادرنگ سلامت اپلیکیشن، دیتابیس، ردیس، صف و ظرفیت تولید (P1-SC-03)
   */
  async function observabilityHealthReport(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: { ok: false, code: 'bad_request', message: 'ارائه school_id یا region_id الزامی است' }
      };
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforceObservabilityTenantIsolation(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const snapshot = buildObservabilityHealthSnapshot({
        schoolId,
        regionId: user.region_id || 1,
        user
      });

      return {
        status: 200,
        body: {
          ok: true,
          api_version: '1.0.0',
          school_id: schoolId,
          observability_health: snapshot
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforceObservabilityTenantIsolation(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const snapshot = buildObservabilityHealthSnapshot({
      schoolId: 101,
      regionId,
      user
    });

    return {
      status: 200,
      body: {
        ok: true,
        api_version: '1.0.0',
        region_id: regionId,
        regional_observability_health: {
          region_id: regionId,
          status: snapshot.status,
          observability_health: snapshot,
          zero_ranking: true,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true
        }
      }
    };
  }

  return {
    scalabilityHealthReport,
    eventProcessingHealthReport,
    observabilityHealthReport
  };
}

module.exports = { createSystemRoutes };
