# راه‌اندازیِ Auto-Scaling (POC در سطحِ ملی)

> **وضعیت:** POC (مانیفست + سند) — هیچ کلاستری استقرار نیافته و استقرارِ تولید
> همچنان تک‌باکسِ `DEPLOY.md` است. این سند می‌گوید «برایِ ۱۰ میلیون کاربر، اسکیل
> خودکار دقیقاً چه می‌خواهد» — نه اینکه «الان داریم».
> پیش‌نیازِ مفهومی: `MULTI_INSTANCE_READINESS.md` (گذار به stateless) و قیدِ C1
> در `CANARY_DEPLOYMENT.md` (تک‌نویسنده‌بودنِ استور).

## ۰. پیش‌نیازها و قیدها (خواندنِ اجباری)

| # | پیش‌نیاز | وضعیتِ امروز | چرا لازم است |
|---|---|---|---|
| P1 | استورِ PG (مسیرِ `MIGRATION_SETUP.md`) | اختیاری، نه پیش‌فرض | رپلیکایِ ۲+ رویِ JSON فایلی = نویسندهٔ هم‌زمان = فسادِ داده (C1) |
| P2 | `REDIS_URL` مشترک برایِ همهٔ پادها | fallback حافظه است | کش/‏idempotency/pubsub‏ بدونِ Redis مشترک، بینِ پادها واگرا می‌شود |
| P3 | انتقالِ OTP/ریت‌لیمیت/‏revoked-jti‏ به Redis | رویِ فایل‌اند (`otp.json`، ‏`__auth`‏، ‏`__revoked_jti`‏) | وگرنه رپلیکاها split-brain می‌شوند (طرحش در `MULTI_INSTANCE_READINESS.md` §۲) |
| P4 | اندپوینتِ `/metrics` در اپ + Prometheus + prometheus-adapter | **وجود ندارد** (کدِ آینده) | وگرنه متریکِ سفارشیِ HPA همیشه degraded می‌ماند (§۱-۲) |
| P5 | مانیفست‌هایِ Deployment/StatefulSet/Service | **وجود ندارد** (خارج از این POC) | این POC فقط HPA است؛ HPA بدونِ target مستقر، کاری نمی‌کند |

**قاعدهٔ طلایی:** تا P1+P2+P3 بسته نشوند، `maxReplicas` عملاً ۱ است (تک‌پاد) —
HPA مستقر می‌شود ولی هرگز بالایِ ۱ نمی‌رود. اسکیلِ واقعیِ افقی = بعد از P1 تا P3.

## ۱-۱. انتخابِ پلتفرم

| گزینه | مکانیزم | داوری |
|---|---|---|
| **Kubernetes + HPA (پیشنهاد)** | Horizontal Pod Autoscaler (`autoscaling/v2`) + VPA | انعطافِ متریکِ سفارشی، رفتارِ cooldown قابلِ تنظیم، قابلِ حمل بینِ ابرها؛ هزینهٔ اپراتوریِ کلاستر |
| ECS + Service Auto Scaling | Target Tracking / Step Scaling | مدیریت‌شده‌تر، ولی قفلِ AWS + متریکِ سفارشیِ محدودتر |

پیشنهاد **Kubernetes** است (انعطافِ بیشتر، هم‌راستا با k6 توزیع‌شده و نقشهٔ چندباکسی).
همهٔ مانیفست‌هایِ این POC در `k8s/` با `apiVersion: autoscaling/v2`‌اند.

## ۱-۲. معیارهایِ Scaling (HPA)

| معیار | آستانه | اقدام | وضعیت در POC |
|---|---|---|---|
| CPU | ‏> ۷۰٪‏ (میانگینِ utilization) | افزایشِ پاد | ✅ در `hpa-payesh-api.yaml` |
| Memory | ‏> ۸۰٪‏ (میانگینِ utilization) | افزایشِ پاد | ✅ در `hpa-payesh-api.yaml` |
| Custom: `http_requests_queue_length` | ‏> ۱۰۰۰‏ (میانگینِ هر پاد) | افزایشِ پاد | ⚠️ در مانیفست هست ولی تا P4 بی‌اثر (degraded) |
| Custom: `redis_queue_depth` | ‏> ۵۰۰۰‏ | افزایشِ پاد | 📋 رزرو برایِ آینده — صفِ job در Redis امروز وجود ندارد (کش/idempotency/pubsub صف نیستند)؛ عمداً در مانیفست نیامده تا HPA خطایِ متریکِ ناموجود نگیرد |

> چرا متریکِ ناموجود در مانیفست بد است: HPAای که به متریکِ ثبت‌نشده اشاره کند،
> در `kubectl describe hpa` خطایِ `failed to get metric` می‌گیرد و تصمیمِ اسکیلش
> ناقص می‌شود. پس «رزرو» فقط در جدول می‌ماند، نه در YAML.

## ۱-۳. تنظیماتِ HPA

مرجعِ اجرایی: `k8s/hpa-payesh-api.yaml` (این بخش خلاصه است؛ مانیفست مبناست):

- target: ‏`Deployment/payesh-api`‏ (P5)؛ ‏`minReplicas: 3`‏، ‏`maxReplicas: 20`‏.
- متریک‌ها: ‏cpu/70‏، ‏memory/80‏، ‏`http_requests_queue_length`/1000‏ (Pods، ‏AverageValue‏).
- رفتار (cooldown): ‏scaleDown.stabilizationWindowSeconds: 300‏ (۵ دقیقه — تستش در §۱-۵) با
  سقفِ جمع‌شدنِ ۵۰٪ در دقیقه؛ scaleUp فوری (پنجرهٔ ۰) با سقفِ ۱۰۰٪/۴ پاد در دقیقه (هرکدام بیشتر).

دو مانیفستِ stateful (`k8s/hpa-payesh-redis.yaml` و `k8s/hpa-payesh-postgres.yaml`)
عمداً `min=max=1`‌اند: دیتاستور با HPA رپلیکا-اسکیل **نمی‌شود** (تک-primary)؛
اهرمِ واقعی‌شان VPA (§۱-۴) + runbook دستی (sharding/read-replica) است. کامنتِ بالایِ
هر دو فایل همین را می‌گوید تا کسی `maxReplicas` را بالا نبرد.

## ۱-۴. Vertical Pod Autoscaler (VPA) — مخصوصِ statefulها

> ⚠️ **قاعدهٔ عدمِ تداخل:** رویِ یک workload برایِ یک متریک، هم‌زمان HPA و VPA
> نگذارید (هر دو به CPU حریف می‌شوند و نوسان می‌سازند). پس: API ← فقط HPA؛
> postgres/redis ← فقط VPA.

```yaml
# نمونهٔ VPA برایِ postgres (پیشنهاد؛ همراهِ HPA دیپلوی نشود)
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: payesh-postgres-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: StatefulSet
    name: payesh-postgres
  updatePolicy:
    updateMode: "Auto"   # تک‌رپلیکا = evict کوتاه دارد؛ در پنجرهٔ کم‌بار اعمال شود
  resourcePolicy:
    containerPolicies:
      - containerName: postgres
        minAllowed: { cpu: 500m, memory: 1Gi }
        maxAllowed: { cpu: 8, memory: 32Gi }
```

```yaml
# نمونهٔ VPA برایِ redis (همان الگو، سقفِ کوچکتر)
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: payesh-redis-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: StatefulSet
    name: payesh-redis
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
      - containerName: redis
        minAllowed: { cpu: 250m, memory: 512Mi }
        maxAllowed: { cpu: 4, memory: 16Gi }
```

رشدِ افقیِ واقعیِ دیتا (نه پاد): postgres ← read-replica مدیریتی + پولینگِ PgBouncer؛
redis ← Redis Cluster (sharding) — هر دو runbook دستی‌اند، نه HPA.

## ۱-۵. تست‌ها (رویِ کلاستر — با k6 و kubectl)

پیش‌نیازِ اجرا: کلاسترِ staging با P1 تا P5 + ‏`kubectl top`‏ (metrics-server) کارا.
بار با سناریوهایِ موجود تولید می‌شود (`perf:*` در `LOAD_TESTING_PLAN.md` §۱۰).

```bash
export HPA=payesh-api-hpa
kubectl apply -f k8s/hpa-payesh-api.yaml
kubectl get hpa $HPA --watch   # ستون‌هایِ TARGETS و REPLICAS را زیر نظر بگیرید
```

**تستِ ۱ — scale-up:** بارِ صعودی تا عبورِ CPU از ۷۰٪ (مثلاً `spike-mehr` یا `perf:full`
با VU بالا). انتظار: رپلیکا ۳ ← بالا، حداکثر ۲۰؛ `kubectl describe hpa` باید رویدادِ
`SuccessfulRescale` با دلیلِ cpu نشان دهد؛ p95 در SLO (§۱-۳ ‏LOAD‏) بماند.

**تستِ ۲ — scale-down:** قطعِ بار. انتظار: رپلیکاها **نه فوری** بلکه پس از **۵ دقیقه**
پایداری (stabilization ۳۰۰) شروع به جمع‌شدن می‌کنند، حداکثر ۵۰٪ در دقیقه، تا کفِ ۳.

**تستِ ۳ — cooldown (تأییدِ صریحِ ۵ دقیقه):** پالسِ بارِ ۶۰ ثانیه‌ای (بالایِ آستانه) بعد قطع.
انتظار: scale-up رخ می‌دهد (پنجرهٔ ۰) ولی تا ۵ دقیقه پس از پایانِ پالس، هیچ scale-downای
رخ نمی‌دهد (`Age` رویدادِ `SuccessfulRescale` بعدی − قبلی ≥ ‏۵m‏). اگر زودتر جمع شد،
`behavior.scaleDown` اشتباه پیکربندی شده.

**معیارِ قبولیِ هر سه:** آستانه‌هایِ §۱-۲ + بدونِ flapping (بیش از ۲ rescale در ۱۰ دقیقه = مردود).

## ۲. فایل‌هایِ POC

| فایل | نقش |
|---|---|
| `k8s/hpa-payesh-api.yaml` | HPA واقعیِ API (۳ متریک + رفتارِ cooldown) |
| `k8s/hpa-payesh-redis.yaml` | HPA قفل‌شدهٔ ۱/۱ + کامنتِ «چرا اسکیل نمی‌شود» |
| `k8s/hpa-payesh-postgres.yaml` | HPA قفل‌شدهٔ ۱/۱ + کامنتِ «چرا اسکیل نمی‌شود» |
| `tests/hpa.js` (+ جهش) | گاردِ ضدِ رانش: آستانه‌ها و قفل‌ها (۶ چک) |

اعتبارسنجیِ محلی (بدونِ کلاستر): پارسِ YAML هر ۳ فایل + `tests/hpa.js` سبز.
`kubectl apply --dry-run=client -f k8s/` رویِ ایستگاهِ دارایِ kubectl قدمِ بعدی است (اینجا اجرا نشد — نبودِ باینری ثبت می‌شود، نه ادعا).

## ۳. چک‌لیستِ استقرارِ HPA (وقتی کلاستر آمد)

- [ ] P1 تا P5 (§۰) بسته شده؛ `maxReplicas` از حالتِ اضطراریِ ۱ خارج شده.
- [ ] metrics-server + (برایِ متریکِ سفارشی) Prometheus و adapter نصب و `kubectl get --raw /apis/custom.metrics.k8s.io` سبز.
- [ ] هرگز VPA رویِ API (قاعدهٔ §۱-۴)؛ هرگز `maxReplicas > 1` رویِ دو HPAیِ stateful (تستِ H5 نگهبان است).
- [ ] هر ۳ تستِ §۱-۵ رویِ staging سبز + لاگِ `describe hpa` بایگانی شده.

## ۴. آنچه این POC ادعا **نمی‌کند**

- کلاستر، Deployment، Service، Ingress، PVC، Secret نداریم و وانمود نمی‌کنیم (P5).
- `/metrics` در اپ نیست (P4) — متریکِ سفارشی تا آن روز degraded است، نه فعال.
- `redis_queue_depth` متریکِ امروز نیست (صفِ job نداریم) — رزروِ جدول است، نه YAML.
- HPA جایِ بکاپ/DR را نمی‌گیرد (`RELIABILITY_DR_PLAN.md` سرِ جایش است).
