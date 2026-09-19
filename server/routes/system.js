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

const {
  getRegionRegistry,
  getRegionById,
  calculateFederationHealth,
  assertNoZeroRanking,
  FEDERATION_ERRORS
} = require('../infrastructure/phase5-region-federation');

const {
  validateRegionAccess,
  enforceGeographicBoundary
} = require('../infrastructure/geographic-isolation');

const {
  buildResourceGovernanceSnapshot,
  executePilotApprovalAction
} = require('../infrastructure/resource-governance');

const {
  PILOT_SCALING_ERRORS,
  PROVINCIAL_PILOT_STATUS,
  ALLOWED_ROLLOUT_PERCENTAGES,
  getProvincialPilots,
  getProvincialPilotById,
  activateProvincialPilot,
  updateProvincialTrafficRollout,
  getProvincialCapacityOverview
} = require('../infrastructure/provincial-pilot-scaling');

const {
  NATIONAL_CONTROL_ERRORS,
  NATIONAL_REGION_STATE,
  getNationalRegionRegistry,
  getNationalRegionById,
  updateNationalRegionState,
  calculateNationalRegionHealthSummary
} = require('../infrastructure/national-region-control-plane');

const {
  CAPACITY_ENGINE_ERRORS,
  getNationalCapacityModel,
  evaluateCapacityRecommendation,
  applyNationalCapacityAdjustment
} = require('../infrastructure/national-capacity-engine');

const {
  TRAFFIC_FABRIC_ERRORS,
  getNationalTrafficFabricTopology,
  updateNationalTrafficWeight,
  refreshTrafficFromSoT
} = require('../infrastructure/national-traffic-fabric');

const {
  buildNationalOperationsDashboard
} = require('../monitoring/national-observability-plane');

const {
  NATIONAL_SECURITY_ERRORS,
  enforceNationalSecurityBoundary,
  recordNationalAuditTrail
} = require('../security/national-security-governance');

const {
  DATA_SOVEREIGNTY_ERRORS,
  assertDatabaseAsSourceOfTruth,
  verifyDataSovereigntyCompliance
} = require('../infrastructure/data-sovereignty');

const {
  getNationalOperationsCenterSnapshot,
  getNocIncidents,
  transitionNocState,
  recordNocIncident,
  resolveNocIncident,
  NOC_ERRORS
} = require('../operations/national-operations-center');

const {
  evaluateNationalProductionReadiness,
  READINESS_VERDICT,
  READINESS_ERRORS
} = require('../infrastructure/national-production-readiness');

const {
  runNationalLoadSimulation,
  getNationalLoadTestingSuite,
  LOAD_SIMULATION_ERRORS
} = require('../infrastructure/national-load-testing');

const {
  registerChangeRequest,
  approveChangeRequest,
  executeChangeRequest,
  getChangeRequests,
  CHANGE_ERRORS
} = require('../infrastructure/change-management');

const {
  assertNationalCapacityEnforcement,
  checkRegionCapacityHeadroom,
  createCapacityReservation,
  releaseCapacityReservation,
  getCapacityReservations,
  getCapacityReservationById,
  CAPACITY_ENFORCEMENT_ERRORS,
  NATIONAL_LIMITS
} = require('../infrastructure/national-capacity-enforcement');
const { getNationalWriteSmoothingEngine, NATIONAL_WRITE_LIMITS } = require('../infrastructure/national-write-smoothing');

const {
  Phase6CanaryEngine,
  globalCanaryEngine,
  CANARY_STATES,
  CANARY_ERRORS,
  ALLOWED_WEIGHTS
} = require('../infrastructure/phase6-canary-engine');

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

  /**
   * GET /api/v1/system/phase5/regions
   * فهرست کلاسترهای منطقه‌ای و وضعیت سلامت (P2-PL-01)
   */
  async function phase5Regions(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const regionIdParam = searchParams.get('region_id');
    if (regionIdParam) {
      try {
        validateRegionAccess(user, regionIdParam);
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', error_code: err.code || FEDERATION_ERRORS.REGION_ISOLATION_VIOLATION, message: err.message }
        };
      }
      const region = getRegionById(regionIdParam);
      return {
        status: 200,
        body: { ok: true, region, timestamp: new Date().toISOString() }
      };
    }

    if (user.role === 'edu_office') {
      const userReg = user.region_id || user.district_id || 1;
      const filtered = getRegionRegistry().filter(r => r.numeric_id === Number(userReg) || r.region_id === String(userReg));
      return {
        status: 200,
        body: { ok: true, total: filtered.length, regions: filtered, timestamp: new Date().toISOString() }
      };
    }

    const regions = getRegionRegistry();
    return {
      status: 200,
      body: { ok: true, total: regions.length, regions, timestamp: new Date().toISOString() }
    };
  }

  /**
   * GET /api/v1/system/phase5/federation-health
   * رصدپذیری سلامت فدراسیون کلاسترها و تاخیر بین‌منطقه‌ای (P2-PL-01)
   */
  async function phase5FederationHealth(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office', 'manager'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: FEDERATION_ERRORS.REGION_ISOLATION_VIOLATION, message: 'نقش کاربر مجاز نیست' }
      };
    }

    const regionIdParam = searchParams.get('region_id');
    if (regionIdParam) {
      try {
        validateRegionAccess(user, regionIdParam);
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', error_code: err.code || FEDERATION_ERRORS.REGION_ISOLATION_VIOLATION, message: err.message }
        };
      }
    }

    const health = calculateFederationHealth();
    return {
      status: 200,
      body: {
        ok: true,
        phase: 'PHASE_5',
        federation_health: health,
        governance: {
          human_decision_sovereignty: true,
          zero_ranking_guarantee: true,
          geographic_isolation: true
        }
      }
    };
  }

  /**
   * GET /api/v1/system/phase5/resource-governance
   * تابلوی حاکمیت منابع و برنامه‌ریزی ظرفیت استان‌ها و مدارس روستایی/مرزی (P2-PL-01)
   */
  async function phase5ResourceGovernance(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office', 'manager'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: FEDERATION_ERRORS.TENANT_BOUNDARY_BREACH, message: 'دسترسی به حاکمیت منابع مجاز نیست' }
      };
    }

    const regionIdParam = searchParams.get('region_id');
    if (regionIdParam) {
      try {
        validateRegionAccess(user, regionIdParam);
      } catch (err) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', error_code: err.code || FEDERATION_ERRORS.REGION_ISOLATION_VIOLATION, message: err.message }
        };
      }
    }

    const snapshot = buildResourceGovernanceSnapshot();
    return {
      status: 200,
      body: {
        ok: true,
        phase: 'PHASE_5',
        resource_governance: snapshot,
        governance: {
          human_decision_sovereignty: true,
          zero_ranking_guarantee: true
        }
      }
    };
  }

  /**
   * POST /api/v1/system/phase5/pilot-approval
   * گیت تایید رسمی و ثبت مداخله اپراتور انسانی در پایلوت ملی (P2-PL-01)
   */
  async function phase5PilotApproval(req, body) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: FEDERATION_ERRORS.REGION_ISOLATION_VIOLATION, message: 'نقش کاربر مجاز به ثبت تاییدیه پایلوت نیست' }
      };
    }

    try {
      assertNoZeroRanking(body);

      const payload = {
        action_type: body.action_type,
        target_region: body.target_region,
        target_school: body.target_school,
        approved: body.approved === true,
        automated_decision: body.automated_decision === true,
        automated_execution: body.automated_execution === true,
        requires_human_approval: body.requires_human_approval !== false,
        operator: {
          id: user.id,
          role: user.role,
          name: user.name || user.username || 'اپراتور سامانه'
        }
      };

      const receipt = executePilotApprovalAction(payload);
      return {
        status: 200,
        body: {
          ok: true,
          approval_receipt: receipt
        }
      };
    } catch (err) {
      return {
        status: err.code === FEDERATION_ERRORS.ZERO_RANKING_VIOLATION ? 400 : 422,
        body: {
          ok: false,
          code: 'unprocessable_approval',
          error_code: err.code || FEDERATION_ERRORS.HUMAN_APPROVAL_REQUIRED,
          message: err.message
        }
      };
    }
  }

  /**
   * GET /api/v1/system/phase5/provincial-pilots
   * فهرست استان‌های پایلوت و وضعیت فعال‌سازی کلاسترها (P2-PL-02)
   */
  async function phase5ProvincialPilots(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office', 'manager'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: PILOT_SCALING_ERRORS.PILOT_SCOPE_VIOLATION, message: 'نقش کاربر مجاز نیست' }
      };
    }

    const provinceIdParam = searchParams.get('province_id');
    if (provinceIdParam) {
      const prov = getProvincialPilotById(provinceIdParam);
      if (!prov) {
        return {
          status: 404,
          body: { ok: false, code: 'not_found', error_code: PILOT_SCALING_ERRORS.PILOT_SCOPE_VIOLATION, message: `استان "${provinceIdParam}" یافت نشد` }
        };
      }
      if (user.role === 'edu_office' && user.region_id && user.region_id !== prov.region_id) {
        return {
          status: 403,
          body: { ok: false, code: 'forbidden', error_code: PILOT_SCALING_ERRORS.PILOT_SCOPE_VIOLATION, message: 'دسترسی به استان خارج از منطقه اداری مسدود است' }
        };
      }
      return {
        status: 200,
        body: { ok: true, province: prov, timestamp: new Date().toISOString() }
      };
    }

    let regionFilter = searchParams.get('region_id') || undefined;
    if (user.role === 'edu_office' && user.region_id) {
      regionFilter = String(user.region_id);
    }

    const provinces = getProvincialPilots(regionFilter);
    return {
      status: 200,
      body: {
        ok: true,
        total: provinces.length,
        provinces,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * GET /api/v1/system/phase5/provincial-pilots/capacity
   * تابلوی مقیاس‌پذیری ظرفیت و مصرف بار استانی و منطقه‌ای (P2-PL-02)
   */
  async function phase5ProvincialCapacity(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office', 'manager'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: PILOT_SCALING_ERRORS.PILOT_SCOPE_VIOLATION, message: 'نقش کاربر مجاز نیست' }
      };
    }

    let regionFilter = searchParams.get('region_id') || undefined;
    if (user.role === 'edu_office' && user.region_id) {
      regionFilter = String(user.region_id);
    }

    const capacity = getProvincialCapacityOverview(regionFilter);
    return {
      status: 200,
      body: {
        ok: true,
        phase: 'PHASE_5',
        step: 'P2-PL-02',
        capacity,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * POST /api/v1/system/phase5/provincial-pilots/activate
   * فعال‌سازی و آماده‌سازی اولیه کلاستر استانی با تایید انسانی (P2-PL-02)
   */
  async function phase5ProvincialActivate(req, body) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: PILOT_SCALING_ERRORS.PILOT_SCOPE_VIOLATION, message: 'نقش کاربر مجاز به فعال‌سازی پایلوت استانی نیست' }
      };
    }

    try {
      assertNoZeroRanking(body);

      const payload = {
        approved: body.approved === true,
        automated_decision: body.automated_decision === true,
        automated_execution: body.automated_execution === true,
        requires_human_approval: body.requires_human_approval !== false,
        operator: {
          id: user.id,
          role: user.role,
          name: user.name || user.username || 'اپراتور سامانه',
          region_id: user.region_id || null
        }
      };

      const result = activateProvincialPilot(body.province_id, payload);
      return {
        status: 200,
        body: {
          ok: true,
          message: `پایلوت استان "${result.province_name}" با موفقیت آماده‌سازی شد`,
          province: result,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      const isRanking = err.code === PILOT_SCALING_ERRORS.ZERO_RANKING_VIOLATION;
      const isScope = err.code === PILOT_SCALING_ERRORS.PILOT_SCOPE_VIOLATION;
      return {
        status: isRanking ? 400 : (isScope ? 403 : 422),
        body: {
          ok: false,
          code: 'activation_failed',
          error_code: err.code || PILOT_SCALING_ERRORS.ROLLOUT_APPROVAL_REQUIRED,
          message: err.message
        }
      };
    }
  }

  /**
   * POST /api/v1/system/phase5/provincial-pilots/traffic-rollout
   * تنظیم درصد هدایت ترافیک قناری پایلوت استانی با تایید انسانی (P2-PL-02)
   */
  async function phase5ProvincialTrafficRollout(req, body) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: PILOT_SCALING_ERRORS.PILOT_SCOPE_VIOLATION, message: 'نقش کاربر مجاز به تنظیم ترافیک پایلوت نیست' }
      };
    }

    try {
      assertNoZeroRanking(body);

      const payload = {
        approved: body.approved === true,
        automated_decision: body.automated_decision === true,
        automated_execution: body.automated_execution === true,
        requires_human_approval: body.requires_human_approval !== false,
        operator: {
          id: user.id,
          role: user.role,
          name: user.name || user.username || 'اپراتور سامانه',
          region_id: user.region_id || null
        }
      };

      const result = updateProvincialTrafficRollout(body.province_id, body.rollout_pct, payload);
      return {
        status: 200,
        body: {
          ok: true,
          message: `ترافیک پایلوت استان "${result.province_name}" به میزان ${result.traffic_rollout_pct}٪ تنظیم شد`,
          province: result,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      const isRanking = err.code === PILOT_SCALING_ERRORS.ZERO_RANKING_VIOLATION;
      const isScope = err.code === PILOT_SCALING_ERRORS.PILOT_SCOPE_VIOLATION;
      return {
        status: isRanking ? 400 : (isScope ? 403 : 422),
        body: {
          ok: false,
          code: 'rollout_failed',
          error_code: err.code || PILOT_SCALING_ERRORS.ROLLOUT_APPROVAL_REQUIRED,
          message: err.message
        }
      };
    }
  }

  /**
   * GET /api/v1/system/national/regions
   * فهرست و وضعیت کلاسترهای کنترل‌پلین ملی (P2-NI-01)
   */
  async function nationalRegions(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office', 'manager'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: NATIONAL_CONTROL_ERRORS.REGION_ACCESS_DENIED, message: 'نقش کاربر مجاز نیست' }
      };
    }

    const regionIdParam = searchParams.get('region_id');
    if (regionIdParam) {
      const reg = getNationalRegionById(regionIdParam);
      if (!reg) {
        return {
          status: 404,
          body: { ok: false, code: 'not_found', error_code: NATIONAL_CONTROL_ERRORS.REGION_NOT_FOUND, message: `کلاستر "${regionIdParam}" یافت نشد` }
        };
      }
      return {
        status: 200,
        body: { ok: true, region: reg, timestamp: new Date().toISOString() }
      };
    }

    const regions = getNationalRegionRegistry();
    return {
      status: 200,
      body: {
        ok: true,
        total: regions.length,
        regions,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * GET /api/v1/system/national/capacity
   * مدل جامع ظرفیت کل کشور و تخصیص سهمیه‌ها (P2-NI-01)
   */
  async function nationalCapacity(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office', 'manager'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: NATIONAL_CONTROL_ERRORS.REGION_ACCESS_DENIED, message: 'نقش کاربر مجاز نیست' }
      };
    }

    const model = getNationalCapacityModel();
    const activeRes = getCapacityReservations({ status: 'ACTIVE' });

    return {
      status: 200,
      body: {
        ok: true,
        phase: 'PHASE_5',
        step: 'P2-NI-03',
        capacity: model,
        enforcement_limits: { ...NATIONAL_LIMITS },
        active_reservations_count: activeRes.length,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * GET /api/v1/system/national/capacity/reservations
   * فهرست رزروهای سهمیه ظرفیت ملی (P2-NI-03)
   */
  async function nationalCapacityReservations(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office', 'manager'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: 'PHASE5_NATIONAL_REGION_ACCESS_DENIED', message: 'نقش کاربر مجاز نیست' }
      };
    }

    try {
      const filter = searchParams ? Object.fromEntries(searchParams.entries()) : {};
      assertNoZeroRanking(filter);
      const list = getCapacityReservations(filter);

      return {
        status: 200,
        body: {
          ok: true,
          phase: 'PHASE_5',
          step: 'P2-NI-03',
          reservations: list,
          count: list.length,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      const isRanking = err.code === 'ZERO_RANKING_VIOLATION';
      return {
        status: isRanking ? 400 : 500,
        body: { ok: false, code: err.code || 'reservations_fetch_failed', message: err.message }
      };
    }
  }

  /**
   * POST /api/v1/system/national/capacity/reservation
   * ثبت رزرو سهمیه ظرفیت با تایید صریح انسانی (P2-NI-03)
   */
  async function nationalCapacityReserve(req, body) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: 'PHASE5_NATIONAL_REGION_ACCESS_DENIED', message: 'تنها مدیران ارشد مجاز به رزرو سهمیه ظرفیت هستند' }
      };
    }

    try {
      assertNoZeroRanking(body);

      if (body.approved !== true || body.automated_decision === true || body.automated_execution === true) {
        const err = new Error('PHASE5_RESERVATION_APPROVAL_REQUIRED: رزرو ظرفیت مستلزم تایید صریح اپراتور انسانی است');
        err.code = CAPACITY_ENFORCEMENT_ERRORS.RESERVATION_APPROVAL_REQUIRED;
        throw err;
      }

      const reservation = createCapacityReservation(body, {
        approved: true,
        operator_id: String(user.id),
        approval_id: body.approval_id || `appv-res-${Date.now()}`,
        reason: body.reason || 'Capacity reservation registered via API'
      });

      return {
        status: 200,
        body: {
          ok: true,
          message: 'سهمیه ظرفیت با موفقیت رزرو گردید',
          reservation,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      const isRanking = err.code === 'ZERO_RANKING_VIOLATION';
      return {
        status: isRanking ? 400 : 422,
        body: {
          ok: false,
          code: 'reservation_failed',
          error_code: err.code || CAPACITY_ENFORCEMENT_ERRORS.RESERVATION_APPROVAL_REQUIRED,
          message: err.message
        }
      };
    }
  }

  /**
   * GET /api/v1/system/national/health
   * تابلوی جامع رصدپذیری عملیات ملی و انطباق SLO (P2-NI-01)
   */
  async function nationalHealth(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office', 'manager'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: NATIONAL_CONTROL_ERRORS.REGION_ACCESS_DENIED, message: 'نقش کاربر مجاز نیست' }
      };
    }

    let poolTotal = null;
    try {
      if (db && typeof db.poolStats === 'function') {
        const ps = db.poolStats();
        poolTotal = (ps && (ps.primary && ps.primary.total)) || (ps && ps.total) || null;
      }
    } catch (_) {}
    const live = globalCanaryEngine.getAggregatedMetrics();
    const dashboard = buildNationalOperationsDashboard({
      api_latency_p95_ms: live.is_live ? live.latency.p95_ms : undefined,
      api_latency_p99_ms: live.is_live ? live.latency.p99_ms : undefined,
      api_error_rate_pct: live.is_live ? Number((live.error_rate * 100).toFixed(4)) : undefined,
      pool_total: poolTotal,
      samples: live.samples,
      is_live: live.is_live
    });
    return {
      status: 200,
      body: {
        ok: true,
        phase: 'PHASE_5',
        step: 'P2-NI-01',
        dashboard,
        live_samples: live,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * GET /api/v1/system/national/traffic
   * وضعیت فابریک و نقشه توزیع ترافیک سراسری (P2-NI-01)
   */
  async function nationalTraffic(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office', 'manager'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: NATIONAL_CONTROL_ERRORS.REGION_ACCESS_DENIED, message: 'نقش کاربر مجاز نیست' }
      };
    }

    await refreshTrafficFromSoT();
    const traffic = getNationalTrafficFabricTopology();
    return {
      status: 200,
      body: {
        ok: true,
        phase: 'PHASE_5',
        step: 'P2-NI-01',
        traffic,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * GET /api/v1/system/national/operations
   * تابلوی عملیات ملی و رصد بی‌درنگ (P2-NI-02: National Operations Center)
   */
  async function nationalOperations(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office', 'manager'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: 'PHASE5_NATIONAL_REGION_ACCESS_DENIED', message: 'نقش کاربر مجاز نیست' }
      };
    }

    try {
      const options = searchParams ? Object.fromEntries(searchParams.entries()) : {};
      assertNoZeroRanking(options);
      const snapshot = getNationalOperationsCenterSnapshot(options);

      return {
        status: 200,
        body: {
          ok: true,
          phase: 'PHASE_5',
          step: 'P2-NI-02',
          operations: snapshot,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      const isRanking = err.code === 'ZERO_RANKING_VIOLATION';
      return {
        status: isRanking ? 400 : 500,
        body: { ok: false, code: err.code || 'operations_fetch_failed', message: err.message }
      };
    }
  }

  /**
   * GET /api/v1/system/national/readiness
   * موتور ارزیابی آمادگی بهره‌برداری ملی (P2-NI-02: Production Readiness Gate)
   */
  async function nationalReadiness(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office', 'manager'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: 'PHASE5_NATIONAL_REGION_ACCESS_DENIED', message: 'نقش کاربر مجاز نیست' }
      };
    }

    try {
      const options = searchParams ? Object.fromEntries(searchParams.entries()) : {};
      assertNoZeroRanking(options);
      const readiness = evaluateNationalProductionReadiness(options);

      return {
        status: 200,
        body: {
          ok: true,
          phase: 'PHASE_5',
          step: 'P2-NI-02',
          readiness,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      const isRanking = err.code === 'ZERO_RANKING_VIOLATION';
      return {
        status: isRanking ? 400 : 500,
        body: { ok: false, code: err.code || 'readiness_eval_failed', message: err.message }
      };
    }
  }

  /**
   * GET /api/v1/system/national/load-test
   * شبیه‌سازی بار و استرس ملی (P2-NI-02: National Load Simulation)
   */
  async function nationalLoadTest(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office', 'manager'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: 'PHASE5_NATIONAL_REGION_ACCESS_DENIED', message: 'نقش کاربر مجاز نیست' }
      };
    }

    try {
      const options = searchParams ? Object.fromEntries(searchParams.entries()) : {};
      assertNoZeroRanking(options);
      const suite = getNationalLoadTestingSuite(options);

      return {
        status: 200,
        body: {
          ok: true,
          phase: 'PHASE_5',
          step: 'P2-NI-02',
          load_test_suite: suite,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      const isRanking = err.code === 'ZERO_RANKING_VIOLATION';
      return {
        status: isRanking ? 400 : 500,
        body: { ok: false, code: err.code || 'load_test_failed', message: err.message }
      };
    }
  }

  /**
   * GET /api/v1/system/national/incidents
   * فهرست رخدادها و وقایع مرکز عملیات ملی (P2-NI-02: NOC Incidents)
   */
  async function nationalIncidents(req, searchParams) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin', 'edu_office', 'manager'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: 'PHASE5_NATIONAL_REGION_ACCESS_DENIED', message: 'نقش کاربر مجاز نیست' }
      };
    }

    try {
      const filter = searchParams ? Object.fromEntries(searchParams.entries()) : {};
      assertNoZeroRanking(filter);
      const incidents = getNocIncidents(filter);

      return {
        status: 200,
        body: {
          ok: true,
          phase: 'PHASE_5',
          step: 'P2-NI-02',
          incidents,
          count: incidents.length,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      const isRanking = err.code === 'ZERO_RANKING_VIOLATION';
      return {
        status: isRanking ? 400 : 500,
        body: { ok: false, code: err.code || 'incidents_fetch_failed', message: err.message }
      };
    }
  }

  /**
   * POST /api/v1/system/national/change-request
   * دروازه ثبت و اعمال تغییرات زیرساخت ملی با تایید اپراتور انسانی (P2-NI-01 / P2-NI-02)
   */
  async function nationalChangeRequest(req, body) {
    const user = req.user;
    if (!user) {
      return {
        status: 401,
        body: { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' }
      };
    }

    const allowedRoles = ['superadmin', 'admin'];
    if (!allowedRoles.includes(user.role)) {
      return {
        status: 403,
        body: { ok: false, code: 'forbidden', error_code: NATIONAL_CONTROL_ERRORS.REGION_ACCESS_DENIED, message: 'تنها مدیران ارشد مجاز به ثبت درخواست تغییر زیرساخت ملی هستند' }
      };
    }

    try {
      assertNoZeroRanking(body);

      // اعتبارسنجی حاکمیت نظارت انسانی
      if (
        body.approved !== true ||
        body.automated_decision === true ||
        body.automated_execution === true ||
        body.requires_human_approval === false
      ) {
        const err = new Error(
          'PHASE5_NATIONAL_CHANGE_APPROVAL_REQUIRED: کلیه تغییرات زیرساخت ملی مستلزم تایید صریح اپراتور انسانی است'
        );
        err.code = NATIONAL_CONTROL_ERRORS.CHANGE_APPROVAL_REQUIRED;
        throw err;
      }

      const changeType = body.change_type;
      let executionResult = null;

      if (changeType === 'TRAFFIC_WEIGHT') {
        executionResult = await updateNationalTrafficWeight(body.region_id, body.target_weight, {
          approved: true,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true,
          operator: { id: user.id, role: user.role }
        });
      } else if (changeType === 'REGION_STATE') {
        executionResult = updateNationalRegionState(body.region_id, body.target_state, {
          approved: true,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true,
          operator: { id: user.id, role: user.role }
        });
      } else if (changeType === 'CAPACITY_QUOTA') {
        executionResult = applyNationalCapacityAdjustment({
          region_id: body.region_id,
          delta_rps: body.delta_rps,
          approved: true,
          auto_scale: false,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true,
          operator: { id: user.id, role: user.role }
        });
      } else if (changeType === 'NOC_STATE') {
        executionResult = transitionNocState(body.target_state, {
          operator_id: String(user.id),
          approval_id: body.approval_id || `appv-noc-${Date.now()}`,
          timestamp: new Date().toISOString(),
          reason: body.reason || 'NOC state transition via national API',
          approved: true,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true
        });
      } else if (changeType === 'INCIDENT') {
        executionResult = recordNocIncident(body.incident_data || body, {
          operator_id: String(user.id),
          approval_id: body.approval_id || `appv-inc-${Date.now()}`,
          timestamp: new Date().toISOString(),
          reason: body.reason || 'NOC incident recorded via API',
          approved: true,
          automated_decision: false,
          automated_execution: false,
          requires_human_approval: true
        });
      } else {
        executionResult = registerChangeRequest({
          change_id: body.change_id || `cr-${Date.now()}`,
          title: body.title || 'National Infrastructure Change',
          requester: String(user.id),
          target_region: body.region_id || 'all',
          change_type: changeType || 'INFRASTRUCTURE_UPDATE',
          risk_level: body.risk_level || 'MEDIUM',
          rollback_plan: body.rollback_plan || 'Revert to previous git tag / configuration',
          approval: {
            approval_id: body.approval_id || `appv-${Date.now()}`,
            operator: String(user.id),
            timestamp: new Date().toISOString()
          }
        });
      }

      recordNationalAuditTrail('NATIONAL_CHANGE_COMMITTED', user, {
        change_type: changeType,
        region_id: body.region_id
      });

      return {
        status: 200,
        body: {
          ok: true,
          message: 'درخواست تغییر زیرساخت ملی با موفقیت اعمال گردید',
          change_receipt: executionResult,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      const isRanking = err.code === NATIONAL_CONTROL_ERRORS.ZERO_RANKING_VIOLATION || err.code === 'ZERO_RANKING_VIOLATION';
      const isUnavailable = err.status === 503 || err.code === 'OPS_KV_UNAVAILABLE' || err.code === 'OPS_KV_PERSIST_FAILED';
      return {
        status: isRanking ? 400 : (isUnavailable ? 503 : 422),
        body: {
          ok: false,
          code: 'change_request_failed',
          error_code: err.code || NATIONAL_CONTROL_ERRORS.CHANGE_APPROVAL_REQUIRED,
          message: err.message
        }
      };
    }
  }

  /**
   * GET /api/v1/system/national/write-smoothing
   * Phase 5 Step 07 (P2-NI-05): رصد و اعتبارسنجی تلطیف بارهای انفجاری نوشت (Outbox Smoothing)
   */
  async function nationalWriteSmoothing(req, searchParams) {
    const user = await authenticateSysadmin(req);
    if (!user) return { status: 401, body: { ok: false, code: 'UNAUTHORIZED' } };

    const engine = getNationalWriteSmoothingEngine();
    const metrics = engine.getMetrics();
    const burstSim = engine.simulateBurst({
      burst_tps: Number(searchParams.get('burst_tps')) || NATIONAL_WRITE_LIMITS.FINAL_EXAMS_PEAK_TPS,
      duration_seconds: Number(searchParams.get('duration')) || 10,
      entity_name: searchParams.get('entity') || 'final_exams'
    });

    return {
      status: 200,
      body: {
        ok: true,
        smoothing_limits: NATIONAL_WRITE_LIMITS,
        engine_metrics: metrics,
        burst_simulation: burstSim
      }
    };
  }

  /**
   * GET /api/v1/system/phase6/canary/status
   * Phase 6: تابلوی وضعیت زنده فابریک ترافیک قناری، اوزان و شاخص‌های بلادرنگ SLO
   */
  async function phase6CanaryStatus(req, searchParams) {
    const user = req.user;
    if (!user) return { status: 401, body: { ok: false, code: 'unauthorized' } };

    const snapshot = await globalCanaryEngine.getSnapshotFromSoT();
    return {
      status: 200,
      body: {
        ok: true,
        canary_fabric: snapshot,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * POST /api/v1/system/phase6/canary/promote
   * Phase 6: ارتقای وزن ترافیک قناری با اعتبارسنجی حاکمیت و امضای رمزنگاری اپراتور (B3)
   */
  async function phase6CanaryPromote(req, body) {
    const user = req.user;
    if (!user) return { status: 401, body: { ok: false, code: 'unauthorized' } };
    if (user.role !== 'superadmin' && user.role !== 'admin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط اپراتور ارشد مجاز به ارتقای وزن ترافیک است' } };
    }

    if (!body || !body.cluster_id || body.target_weight == null) {
      return { status: 400, body: { ok: false, code: 'bad_request', message: 'cluster_id و target_weight الزامی هستند' } };
    }

    try {
      const governanceContext = {
        action: body.action || 'WEIGHT_UPDATE',
        cluster_id: body.cluster_id,
        target_weight: body.target_weight,
        nonce: body.nonce,
        timestamp: body.timestamp,
        expiry: body.expiry,
        signature: body.signature || (req.headers && req.headers['x-operator-signature']) || null,
        reason: body.reason || 'Phase 6 Production Canary Promotion',
        operator: {
          id: user.id,
          role: user.role,
          name: user.name || user.username || 'اپراتور سامانه'
        }
      };

      const updated = await globalCanaryEngine.setTrafficWeight(body.cluster_id, body.target_weight, governanceContext);
      return {
        status: 200,
        body: {
          ok: true,
          cluster: updated,
          message: `وزن ترافیک کلاستر ${body.cluster_id} با موفقیت به ${body.target_weight}% ارتقا یافت`
        }
      };
    } catch (err) {
      const code = err.code || 'PROMOTION_FAILED';
      const status = (code === 'CANARY_PERSIST_FAILED' || code === 'GOVERNANCE_KEY_UNAVAILABLE' || code === 'GOVERNANCE_LEDGER_UNAVAILABLE')
        ? 503
        : ((code === 'PHASE6_APPROVAL_REQUIRED' || code === 'INVALID_OPERATOR_SIGNATURE' || code === 'REPLAY_ATTACK_DETECTED') ? 403 : 400);
      return {
        status,
        body: { ok: false, code, message: err.message }
      };
    }
  }

  /**
   * POST /api/v1/system/phase6/canary/rollback
   * Phase 6: رول‌بک اضطراری و تخلیه کامل ترافیک قناری به ۰٪ (B4)
   */
  async function phase6CanaryRollback(req, body) {
    const user = req.user;
    if (!user) return { status: 401, body: { ok: false, code: 'unauthorized' } };
    if (user.role !== 'superadmin' && user.role !== 'admin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط اپراتور ارشد مجاز به رول‌بک است' } };
    }

    if (!body || !body.cluster_id) {
      return { status: 400, body: { ok: false, code: 'bad_request', message: 'cluster_id الزامی است' } };
    }

    try {
      await globalCanaryEngine.triggerAutoRollback(body.cluster_id, body.reason || 'Manual Emergency Rollback');
      return {
        status: 200,
        body: {
          ok: true,
          cluster_id: body.cluster_id,
          drained: true,
          target_weight: 0,
          message: `رول‌بک اضطراری انجام شد؛ ترافیک کلاستر ${body.cluster_id} به طور کامل به صفر تخلیه شد (Drained)`
        }
      };
    } catch (err) {
      return {
        status: 500,
        body: { ok: false, code: 'ROLLBACK_FAILED', message: err.message }
      };
    }
  }

  /**
   * POST /api/v1/system/phase6/canary/circuit-breaker
   * Phase 6: مدیریت وضعیت مدارشکن و هدایت دیتاسنتر ثانویه (B5)
   */
  async function phase6CanaryCircuitBreaker(req, body) {
    const user = req.user;
    if (!user) return { status: 401, body: { ok: false, code: 'unauthorized' } };
    if (user.role !== 'superadmin' && user.role !== 'admin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط اپراتور ارشد مجاز به مدیریت مدارشکن است' } };
    }

    if (!body || !body.cluster_id) {
      return { status: 400, body: { ok: false, code: 'bad_request', message: 'cluster_id الزامی است' } };
    }

    try {
      const cluster = await globalCanaryEngine.persistCircuitBreaker(body.cluster_id, {
        circuitBreakerOpen: body.circuit_breaker_open,
        secondaryDc: body.secondary_dc,
        status: body.status
      });
      return {
        status: 200,
        body: {
          ok: true,
          cluster: {
            id: cluster.id,
            circuitBreakerOpen: cluster.circuitBreakerOpen,
            primaryDc: cluster.primaryDc,
            secondaryDc: cluster.secondaryDc,
            status: cluster.status
          }
        }
      };
    } catch (err) {
      const code = err.code || 'CIRCUIT_BREAKER_FAILED';
      const status = (code === 'CANARY_PERSIST_FAILED') ? 503 : (code === 'PHASE6_CLUSTER_NOT_FOUND' ? 404 : 400);
      return { status, body: { ok: false, code, message: err.message } };
    }
  }

  return {
    scalabilityHealthReport,
    eventProcessingHealthReport,
    observabilityHealthReport,
    disasterRecoveryHealthReport,
    pilotDeploymentHealthReport,
    securityHealthReport,
    phase4CertificationReport,
    phase5Regions,
    phase5FederationHealth,
    phase5ResourceGovernance,
    phase5PilotApproval,
    phase5ProvincialPilots,
    phase5ProvincialCapacity,
    phase5ProvincialActivate,
    phase5ProvincialTrafficRollout,
    nationalRegions,
    nationalCapacity,
    nationalCapacityReservations,
    nationalCapacityReserve,
    nationalHealth,
    nationalTraffic,
    nationalOperations,
    nationalReadiness,
    nationalLoadTest,
    nationalIncidents,
    nationalChangeRequest,
    nationalWriteSmoothing,
    phase6CanaryStatus,
    phase6CanaryPromote,
    phase6CanaryRollback,
    phase6CanaryCircuitBreaker
  };
}

module.exports = { createSystemRoutes };
