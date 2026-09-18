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

const {
  enforceDisasterRecoveryTenantIsolation,
  buildDisasterRecoveryHealthSnapshot
} = require('../infrastructure/disaster-recovery');

const {
  enforcePilotTenantIsolation,
  buildPilotDeploymentHealthSnapshot
} = require('../deployment/pilot-traffic-management');

const {
  enforceAccessBoundary,
  buildSecurityHealthSnapshot,
  ZERO_TRUST_ERRORS
} = require('../security/zero-trust-runtime');

const {
  enforcePhase4CertificationAccessGuard,
  buildPhase4CertificationSnapshot,
  PHASE4_ERRORS
} = require('../infrastructure/phase4-release-certification');

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

  /**
   * GET /api/v1/system/disaster-recovery-health
   * رصد وضعیت سلامت پشتیبان‌ها، مانور بازیابی، RPO/RTO و دسترسی‌پذیری بالا (P1-SC-04)
   */
  async function disasterRecoveryHealthReport(req, searchParams) {
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
        enforceDisasterRecoveryTenantIsolation(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const snapshot = buildDisasterRecoveryHealthSnapshot({
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
          disaster_recovery_health: snapshot
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforceDisasterRecoveryTenantIsolation(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const snapshot = buildDisasterRecoveryHealthSnapshot({
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
        regional_disaster_recovery_health: {
          region_id: regionId,
          status: snapshot.status,
          disaster_recovery_health: snapshot,
          zero_ranking: true,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true
        }
      }
    };
  }

  /**
   * GET /api/v1/system/pilot-deployment-health
   * رصد وضعیت استقرار پایلوت، تخصیص ترافیک قناری، آمادگی بازگشت و دروازه‌های سلامت (P1-SC-05)
   */
  async function pilotDeploymentHealthReport(req, searchParams) {
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
        enforcePilotTenantIsolation(user, { school_id: schoolId });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', message: err.message }
        };
      }

      const snapshot = buildPilotDeploymentHealthSnapshot({
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
          deployment: snapshot.deployment,
          pilot_stage: snapshot.pilot_stage,
          traffic: {
            allocated: snapshot.traffic.allocated,
            percentage: snapshot.traffic.percentage,
            routing_strategy: snapshot.traffic.routing_strategy
          },
          rollback: {
            available: snapshot.rollback.available,
            strategy: snapshot.rollback.strategy
          },
          human_approval_required: snapshot.human_approval_required,
          pilot_deployment_health: snapshot
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforcePilotTenantIsolation(user, { region_id: regionId });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', message: err.message }
      };
    }

    const snapshot = buildPilotDeploymentHealthSnapshot({
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
        regional_pilot_deployment_health: {
          region_id: regionId,
          deployment: snapshot.deployment,
          pilot_stage: snapshot.pilot_stage,
          traffic: snapshot.traffic,
          rollback: snapshot.rollback,
          pilot_deployment_health: snapshot,
          zero_ranking: true,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true
        }
      }
    };
  }

  /**
   * GET /api/v1/system/security-health
   * رصد وضعیت امنیت Zero Trust و انطباق‌پذیری امنیتی زمان اجرا (P1-SC-06)
   */
  async function securityHealthReport(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است.' }
      };
    }

    const schoolIdParam = searchParams && typeof searchParams.get === 'function'
      ? searchParams.get('school_id')
      : (searchParams ? searchParams.school_id : null);
    const regionIdParam = searchParams && typeof searchParams.get === 'function'
      ? searchParams.get('region_id')
      : (searchParams ? searchParams.region_id : null);

    if (!schoolIdParam && !regionIdParam) {
      return {
        status: 400,
        body: {
          ok: false,
          code: 'bad_request',
          message: 'ارائه حداقل یکی از پارامترهای school_id یا region_id الزامی است.'
        }
      };
    }

    if (schoolIdParam) {
      const schoolId = Number(schoolIdParam);
      try {
        enforceAccessBoundary({
          user,
          targetSchoolId: schoolId,
          requiredRole: ['superadmin', 'manager', 'edu_office']
        });
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', error_code: err.code || ZERO_TRUST_ERRORS.ROLE_ACCESS_DENIED, message: err.message }
        };
      }

      const snapshot = buildSecurityHealthSnapshot({ schoolId, user });

      return {
        status: 200,
        body: {
          ok: true,
          security_status: snapshot.security_status,
          zero_trust: {
            enabled: snapshot.zero_trust.enabled,
            policy_engine: snapshot.zero_trust.policy_engine,
            runtime_protection: snapshot.zero_trust.runtime_protection
          },
          governance: {
            human_decision_sovereignty: snapshot.governance.human_decision_sovereignty,
            zero_ranking_guarantee: snapshot.governance.zero_ranking_guarantee,
            tenant_isolation: snapshot.governance.tenant_isolation
          },
          requires_human_approval: snapshot.requires_human_approval,
          school_id: schoolId,
          security_health: snapshot
        }
      };
    }

    const regionId = Number(regionIdParam);
    try {
      enforceAccessBoundary({
        user,
        requiredRole: ['superadmin', 'edu_office', 'manager']
      });
    } catch (err) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: err.code || ZERO_TRUST_ERRORS.ROLE_ACCESS_DENIED, message: err.message }
      };
    }

    const snapshot = buildSecurityHealthSnapshot({ regionId, user });

    return {
      status: 200,
      body: {
        ok: true,
        security_status: snapshot.security_status,
        zero_trust: {
          enabled: snapshot.zero_trust.enabled,
          policy_engine: snapshot.zero_trust.policy_engine,
          runtime_protection: snapshot.zero_trust.runtime_protection
        },
        governance: {
          human_decision_sovereignty: snapshot.governance.human_decision_sovereignty,
          zero_ranking_guarantee: snapshot.governance.zero_ranking_guarantee,
          tenant_isolation: snapshot.governance.tenant_isolation
        },
        requires_human_approval: snapshot.requires_human_approval,
        region_id: regionId,
        regional_security_health: {
          ...snapshot,
          zero_ranking: true
        }
      }
    };
  }

  /**
   * GET /api/v1/system/phase4-certification
   * GET /api/v1/system/scalability-certification
   * گیت انتشار جامع و صدور گواهی مقیاس‌پذیری و آمادگی تولید فاز ۴ (P1-SC-07)
   */
  async function phase4CertificationReport(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const schoolIdParam = searchParams.get('school_id');
    const regionIdParam = searchParams.get('region_id');

    if (!schoolIdParam && !regionIdParam && user.role !== 'superadmin' && user.role !== 'admin') {
      return {
        status: 400,
        body: { ok: false, code: 'bad_request', message: 'ارائه school_id یا region_id الزامی است' }
      };
    }

    let schoolId = schoolIdParam ? Number(schoolIdParam) : (user.school_id ? Number(user.school_id) : 1);
    let regionId = regionIdParam ? Number(regionIdParam) : (user.region_id ? Number(user.region_id) : 1);

    try {
      enforcePhase4CertificationAccessGuard(user, {
        school_id: schoolIdParam ? Number(schoolIdParam) : null,
        region_id: regionIdParam ? Number(regionIdParam) : null
      });
    } catch (err) {
      return {
        status: 403,
        body: {
          ok: false,
          code: 'forbidden',
          error_code: err.code || PHASE4_ERRORS.ROLE_ACCESS_DENIED,
          message: err.message
        }
      };
    }

    const snapshot = buildPhase4CertificationSnapshot(schoolId, regionId);

    return {
      status: 200,
      body: {
        ok: true,
        phase: 'PHASE_4',
        certification_status: snapshot.official_certificate.status,
        release_ready: snapshot.official_certificate.release_ready,
        readiness_index: snapshot.official_certificate.readiness_index,
        national_go_decision: snapshot.national_go_decision.decision,
        certificate: snapshot.official_certificate,
        layers: snapshot.phase4_layers,
        readiness_gates: snapshot.readiness_gates,
        governance: {
          human_decision_sovereignty: snapshot.human_sovereignty.requires_human_approval,
          zero_ranking_guarantee: snapshot.zero_ranking_guarantee.enforced,
          tenant_isolation: true
        },
        snapshot
      }
    };
  }

  return {
    scalabilityHealthReport,
    eventProcessingHealthReport,
    observabilityHealthReport,
    disasterRecoveryHealthReport,
    pilotDeploymentHealthReport,
    securityHealthReport,
    phase4CertificationReport
  };
}

module.exports = { createSystemRoutes };
