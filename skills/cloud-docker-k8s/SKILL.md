---
name: cloud-docker-k8s
description: Deploy applications with cloud platforms and containers — Docker packaging, orchestration, and cost/security-aware deployment.
version: 1.0.0
author: rezaa2544, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [cloud, docker, kubernetes, deployment, education]
    related_skills: [devops-cicd, network-fundamentals, software-security]
---

# خدمات ابری و کانتینرسازی (cloud-docker-k8s)

این مهارت استفاده از پلتفرم‌های ابری و ابزارهای کانتینرسازی برای استقرار و
مدیریت مقیاس‌پذیر برنامه‌ها را پوشش می‌دهد.

## When to Use

- وقتی سیستم نیاز به مقیاس‌پذیری یا دسترسی مداوم دارد (ترافیک بالا،
  در دسترس بودن جهانی).
- بسته‌بندی یک برنامه با وابستگی‌های پیچیده برای اجرای یکدست.
- Don't use for: پروژه‌های کوچک تک‌سرور — هزینه و پیچیدگی ارزشش را ندارد.
- در پروژه پایش فعلاً: استقرار واقعی یک سرور Node.js ساده + PG/Redis است،
  نه Kubernetes. این مهارت برای آینده و درک کلی است.

## Procedure

1. **مفاهیم اصلی cloud را درک کن.** compute (VM، container)، storage
   (object، block)، networking (VPC، load balancer)، IAM.
2. **Dockerfile بنویس.**
   ```dockerfile
   FROM node:22-slim
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --production
   COPY . .
   EXPOSE 3000
   CMD ["node", "server/index.js"]
   ```
   - یک پایه image سبک (`-slim` یا `-alpine`)
   - لایهها را cache-friendly بچین (package.json جدا از source)
   - کاربر غیر-root اجرا کن
   - فقط فایلهای لازم را COPY کن (`.dockerignore`)
3. **کانتینر را اجرا و تست کن.** build → run → بررسی health.
4. **در صورت نیاز orchestration.** Kubernetes فقط زمانی که چند نمونه،
   auto-scaling یا failover واقعی لازم است. برای شروع، docker-compose یا
   حتی یک سرور ساده کافی است.
5. **pipeline استقرار بساز.** CI → build image → push registry → deploy.
6. **manitoring و cost را اضافه کن.** metrics، logs، alerts؛ مصرف منابع
   را زیر نظر بگیر و در صورت نیاز scale کن.
7. **امنیت cloud را رعایت کن.**
   - IAM: حداقل دسترسی
   - اسرار در secret manager، نه در image
   - پورتها فقط روی internal network
   - imageهای اسکن‌شده برای آسیب‌پذیری
8. **در پروژه پایش — زیرساخت موجود:**
   - `infra/postgres/` — PostgreSQL HA با pgbackrest
   - `infra/redis/` — Redis Sentinel
   - `infra/observability/` — OTel + Prometheus + Grafana + Loki
   - `infra/tracing/` — Jaeger
   - `nginx/` — edge configuration
   - `ops/` — operational assets

## Pitfalls

- **فرض اینکه حرکت به cloud خودبه‌خود بهتر است** — گاهی refactor لازم است.
- **شروع با Kubernetes** برای پروژه‌ای که هنوز یک سرور ندارد.
- **image سنگین** — حجم بزرگ، راه‌اندازی کند.
- **اجرا با root** در کانتینر — ریسک امنیتی.
- **اسرار در image** — حتی در لایه‌های میانی قابل استخراج است.
- **فراموش کردن health check** — کانتینر زامبی.
- **عدم مدیریت cost** — منابع بلااستفاده هزینه دارند.

## Verification

- image ساخته و در یک کانتینر اجرا می‌شود.
- endpoint health در کانتینر پاسخ می‌دهد.
- image با کاربر غیر-root اجرا می‌شود.
- اسرار از محیط (env/secret) خوانده می‌شوند، نه از داخل image.
- در صورت شکست کانتینر، یک policy restart یا orchestration آن را پوشش می‌دهد.
